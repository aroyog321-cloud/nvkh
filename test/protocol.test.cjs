const assert = require("node:assert/strict");
const { test } = require("node:test");
const { EngineAPI } = require("../src/engine/index.cjs");
const {
  PROTOCOL_VERSION,
  MAX_REQUEST_BYTES,
  MAX_TERMINAL_BATCH_BYTES,
  MAX_TERMINAL_INPUT_BYTES,
  MAX_TERMINAL_QUEUE_BYTES,
  createProtocolConnection
} = require("../src/protocol/connection.cjs");
const { makeFakePtyFactory } = require("./fakePty.cjs");

function request(id, method, params = {}) {
  return { version: PROTOCOL_VERSION, id, method, params };
}

function makeEngineStub(overrides = {}) {
  let subscriber = null;
  let sequence = 0;
  return {
    subscribe(scope, callback) {
      assert.equal(scope, "all");
      subscriber = callback;
      return () => { subscriber = null; };
    },
    emit(event) {
      sequence = Math.max(sequence, event.sequence || 0);
      subscriber?.(event);
    },
    setSequence(value) { sequence = value; },
    getState() {
      return { contractVersion: 1, sequence, generatedAt: Date.now(), sessions: [] };
    },
    getActivity() { return { contractVersion: 1, events: [] }; },
    getWorkspace() { return { version: 1, name: "Test" }; },
    getSnapshot(id) { return id === "worker" ? { id, status: "running", lines: [] } : null; },
    getSessionConfiguration(id) { return id === "worker" ? { id, envKeys: [] } : null; },
    listSavedCommands() { return []; },
    ...overrides
  };
}

test("protocol validates versions, fixed request shape, malformed JSON, and byte limits", async () => {
  const sent = [];
  const connection = createProtocolConnection(makeEngineStub(), { send: message => sent.push(message) });

  const version = await connection.handle({ version: 2, id: "version", method: "state.get", params: {} });
  assert.deepEqual(version.error, {
    code: "VERSION_MISMATCH",
    message: "unsupported protocol version: 2"
  });
  assert.equal(version.id, "version");

  const malformed = await connection.handle("{not-json");
  assert.equal(malformed.ok, false);
  assert.equal(malformed.error.code, "INVALID_REQUEST");

  const extra = await connection.handle({
    ...request("extra", "state.get"),
    unexpected: true
  });
  assert.equal(extra.error.code, "INVALID_REQUEST");

  const oversized = await connection.handle(request("large", "state.get", {
    value: "x".repeat(MAX_REQUEST_BYTES)
  }));
  assert.equal(oversized.error.code, "REQUEST_TOO_LARGE");
  assert.equal(sent.length, 4);
  connection.dispose();
});

test("action dispatch calls the public action exactly once and gates destructive actions", async () => {
  let restarts = 0;
  let kills = 0;
  const engine = makeEngineStub({
    restart(id) {
      assert.equal(id, "worker");
      restarts++;
      return { ok: true };
    },
    kill(id) {
      assert.equal(id, "worker");
      kills++;
      return { ok: true };
    }
  });
  const connection = createProtocolConnection(engine, { send: () => {} });

  const restarted = await connection.handle(request("restart", "action.dispatch", {
    sessionId: "worker",
    action: { type: "restart" }
  }));
  assert.equal(restarted.ok, true);
  assert.equal(restarts, 1);

  const rejected = await connection.handle(request("kill-no", "action.dispatch", {
    sessionId: "worker",
    action: { type: "kill" }
  }));
  assert.equal(rejected.error.code, "CONFIRMATION_REQUIRED");
  assert.equal(kills, 0);

  const killed = await connection.handle(request("kill-yes", "action.dispatch", {
    sessionId: "worker",
    action: { type: "kill" },
    confirmation: "confirm:kill:worker"
  }));
  assert.equal(killed.ok, true);
  assert.equal(kills, 1);
  connection.dispose();
});

test("Groundstation worker management stays routed through public protocol actions", async () => {
  const calls = [];
  const engine = makeEngineStub({
    create(definition) {
      calls.push(["create", definition]);
      return { ok: true, session: { id: definition.id } };
    },
    createFromSavedCommand(commandId) {
      calls.push(["preset", commandId]);
      return { ok: true, session: { id: commandId } };
    },
    reconfigure(id, patch) {
      calls.push(["reconfigure", id, patch]);
      return { ok: true };
    },
    remove(id) {
      calls.push(["remove", id]);
      return { ok: true };
    }
  });
  const connection = createProtocolConnection(engine, { send: () => {} });

  assert.equal((await connection.handle(request("create", "action.dispatch", {
    sessionId: null,
    action: { type: "create", definition: { id: "new", command: "npm test" } }
  }))).ok, true);
  assert.equal((await connection.handle(request("preset", "action.dispatch", {
    sessionId: null,
    action: { type: "instantiateSavedCommand", commandId: "checks" }
  }))).ok, true);
  assert.equal((await connection.handle(request("edit", "action.dispatch", {
    sessionId: "worker",
    action: { type: "reconfigure", patch: { command: "npm run dev" } }
  }))).ok, true);

  const unconfirmed = await connection.handle(request("remove-no", "action.dispatch", {
    sessionId: "worker",
    action: { type: "remove" }
  }));
  assert.equal(unconfirmed.error.code, "CONFIRMATION_REQUIRED");
  assert.equal((await connection.handle(request("remove-yes", "action.dispatch", {
    sessionId: "worker",
    action: { type: "remove" },
    confirmation: "confirm:remove:worker"
  }))).ok, true);

  assert.deepEqual(calls.map(call => call[0]), ["create", "preset", "reconfigure", "remove"]);
  connection.dispose();
});

test("agent adapters create only allow-listed manual workers", async () => {
  const definitions = [];
  const engine = makeEngineStub({
    create(definition) {
      definitions.push(definition);
      return { ok: true, session: { id: definition.id } };
    }
  });
  const connection = createProtocolConnection(engine, {
    send: () => {},
    agentAdapterOptions: { platform: "linux", resolveCommand: command => command }
  });
  const listed = await connection.handle(request("agents", "agents.list"));
  assert.deepEqual(listed.result.map(adapter => adapter.id), ["claude", "codex", "gemini", "opencode"]);
  assert.deepEqual(listed.result.map(adapter => adapter.command), ["claude", "codex", "gemini", "opencode"]);

  const created = await connection.handle(request("create-agent", "agent.create", { adapterId: "claude" }));
  assert.equal(created.ok, true);
  assert.equal(definitions.length, 1);
  assert.equal(definitions[0].command, "claude");
  assert.equal(definitions[0].autoStart, false);
  assert.deepEqual(definitions[0].args, []);

  const rejected = await connection.handle(request("reject-agent", "agent.create", { adapterId: "powershell" }));
  assert.equal(rejected.error.code, "INVALID_PARAMS");
  assert.equal(definitions.length, 1);
  connection.dispose();
});

test("state snapshot activation drops earlier events, excludes output, and preserves later order", async () => {
  const sent = [];
  const engine = makeEngineStub();
  const connection = createProtocolConnection(engine, { send: message => sent.push(message) });

  engine.emit({ contractVersion: 1, sequence: 1, timestamp: 1, type: "session:created", id: "worker" });
  const snapshot = await connection.handle(request("state", "state.get"));
  assert.equal(snapshot.result.sequence, 1);
  engine.emit({ contractVersion: 1, sequence: 2, timestamp: 2, type: "session:output", id: "worker", data: "secret" });
  engine.emit({ contractVersion: 1, sequence: 3, timestamp: 3, type: "session:renamed", id: "worker", name: "API" });

  const startIndex = sent.length;
  const activated = await connection.handle(request("events", "events.activate", { afterSequence: 1 }));
  assert.equal(activated.ok, true);
  assert.deepEqual(sent.slice(startIndex).map(message => message.type || "response"), [
    "response",
    "engine:event"
  ]);
  assert.equal(sent.at(-1).event.sequence, 3);

  engine.emit({ contractVersion: 1, sequence: 4, timestamp: 4, type: "session:status", id: "worker", status: "running" });
  const events = sent.filter(message => message.type === "engine:event");
  assert.deepEqual(events.map(message => message.event.sequence), [3, 4]);
  assert.equal(JSON.stringify(events).includes("secret"), false);
  connection.dispose();
});

test("terminal protocol replays then streams without duplication and routes to the same PTY", async t => {
  const factory = makeFakePtyFactory();
  const api = new EngineAPI({ ptyFactory: factory });
  t.after(() => api.dispose());
  api.loadProject({ sessions: [{ id: "worker", command: "x", cwd: "." }] });
  const pty = factory.last();
  pty.emitData("before open\r\n");

  const sent = [];
  const connection = createProtocolConnection(api, { send: message => sent.push(message) });
  t.after(() => connection.dispose());
  const opened = await connection.handle(request("open", "terminal.open", { sessionId: "worker" }));
  assert.equal(opened.ok, true);
  assert.match(opened.result.replay.data, /before open/);
  assert.equal(opened.result.replay.complete, true);

  pty.emitData("after open\r\n");
  const activated = await connection.handle(request("activate", "terminal.activate", {
    streamId: opened.result.streamId,
    terminalEpoch: opened.result.terminalEpoch
  }));
  assert.equal(activated.ok, true);
  const live = sent.filter(message => message.type === "terminal:data").map(message => message.data).join("");
  assert.equal(live, "after open\r\n");
  assert.equal(live.includes("before open"), false);

  assert.equal((await connection.handle(request("write", "terminal.write", {
    streamId: opened.result.streamId,
    terminalEpoch: opened.result.terminalEpoch,
    data: "npm test\r"
  }))).ok, true);
  assert.equal((await connection.handle(request("resize", "terminal.resize", {
    streamId: opened.result.streamId,
    terminalEpoch: opened.result.terminalEpoch,
    cols: 100,
    rows: 32
  }))).ok, true);
  assert.deepEqual(pty.written, ["npm test\r"]);
  assert.deepEqual(pty.resized, [[100, 32]]);
  assert.equal(factory.instances.length, 1);

  assert.equal((await connection.handle(request("close", "terminal.close", {
    streamId: opened.result.streamId
  }))).ok, true);
  const stale = await connection.handle(request("stale", "terminal.write", {
    streamId: opened.result.streamId,
    data: "ignored"
  }));
  assert.equal(stale.error.code, "TERMINAL_STALE");
});

test("terminal input and dimensions are bounded", async () => {
  const sent = [];
  const dataListeners = new Set();
  const exitListeners = new Set();
  const rawStream = {
    replay: () => ({ data: "", complete: true }),
    onData(callback) { dataListeners.add(callback); return () => dataListeners.delete(callback); },
    onExit(callback) { exitListeners.add(callback); return () => exitListeners.delete(callback); },
    write: () => true,
    resize: () => true
  };
  const engine = makeEngineStub({ attachRawStream: () => rawStream });
  const connection = createProtocolConnection(engine, { send: message => sent.push(message) });
  const opened = await connection.handle(request("open", "terminal.open", { sessionId: "worker" }));
  const competing = await connection.handle(request("open-again", "terminal.open", { sessionId: "worker" }));
  assert.equal(competing.error.code, "TERMINAL_ALREADY_OPEN");

  const input = await connection.handle(request("input", "terminal.write", {
    streamId: opened.result.streamId,
    data: "x".repeat(MAX_TERMINAL_INPUT_BYTES + 1)
  }));
  assert.equal(input.error.code, "TERMINAL_INPUT_TOO_LARGE");
  const dimensions = await connection.handle(request("dimensions", "terminal.resize", {
    streamId: opened.result.streamId,
    cols: 0,
    rows: 24
  }));
  assert.equal(dimensions.error.code, "INVALID_PARAMS");

  const unicodeOutput = "😀".repeat(Math.floor(MAX_TERMINAL_BATCH_BYTES / 4) + 3);
  for (const callback of [...dataListeners]) callback(unicodeOutput);
  await connection.handle(request("activate", "terminal.activate", {
    streamId: opened.result.streamId
  }));
  assert.equal(
    sent.filter(message => message.type === "terminal:data").map(message => message.data).join(""),
    unicodeOutput
  );
  for (const callback of [...exitListeners]) callback({ exitCode: 0, intentional: false });
  assert.equal(dataListeners.size, 0);
  assert.equal(exitListeners.size, 0);
  assert.equal(sent.some(message => message.type === "terminal:exit"), true);
  const exitedWrite = await connection.handle(request("exited-write", "terminal.write", {
    streamId: opened.result.streamId,
    data: "ignored"
  }));
  assert.equal(exitedWrite.error.code, "TERMINAL_NOT_RUNNING");
  connection.dispose();
  assert.equal(dataListeners.size, 0);
  assert.equal(exitListeners.size, 0);
});

test("terminal output overflow is explicit, bounded, and subscriptions clean up", async () => {
  const sent = [];
  const dataListeners = new Set();
  const exitListeners = new Set();
  const rawStream = {
    replay: () => ({ data: "", complete: true }),
    onData(callback) { dataListeners.add(callback); return () => dataListeners.delete(callback); },
    onExit(callback) { exitListeners.add(callback); return () => exitListeners.delete(callback); },
    write: () => true,
    resize: () => true
  };
  const engine = makeEngineStub({ attachRawStream: () => rawStream });
  const connection = createProtocolConnection(engine, { send: message => sent.push(message) });
  const opened = await connection.handle(request("open", "terminal.open", { sessionId: "worker" }));
  const output = "x".repeat(MAX_TERMINAL_QUEUE_BYTES + 128 * 1024);
  for (const callback of [...dataListeners]) callback(output);

  await connection.handle(request("activate", "terminal.activate", {
    streamId: opened.result.streamId
  }));
  const overflow = sent.find(message => message.type === "terminal:overflow");
  assert.ok(overflow.droppedBytes > 0);
  const retainedBytes = sent
    .filter(message => message.type === "terminal:data")
    .reduce((total, message) => total + Buffer.byteLength(message.data), 0);
  assert.ok(retainedBytes <= MAX_TERMINAL_QUEUE_BYTES);

  connection.dispose();
  assert.equal(dataListeners.size, 0);
  assert.equal(exitListeners.size, 0);
});
