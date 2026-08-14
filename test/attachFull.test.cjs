const assert = require("node:assert/strict");
const { PassThrough } = require("node:stream");
const { test } = require("node:test");
const { EngineAPI } = require("../src/engine/index.cjs");
const {
  attachFull,
  createDetachInputHandler,
  CTRL_RIGHT_BRACKET_BYTE,
  WINDOWS_INPUT_MODE_OFF,
  sanitizeHostOutput,
  createHostOutputSanitizer
} = require("../src/tui/attachFull.cjs");
const { makeFakePtyFactory } = require("./fakePty.cjs");

class FakeStdin extends PassThrough {
  constructor() {
    super();
    this.isTTY = true;
    this.isRaw = false;
    this.referenced = true;
  }

  setRawMode(value) {
    this.isRaw = value;
    return this;
  }

  ref() {
    this.referenced = true;
    return this;
  }

  unref() {
    this.referenced = false;
    return this;
  }
}

class FakeStdout extends PassThrough {
  constructor() {
    super();
    this.isTTY = true;
    this.columns = 100;
    this.rows = 30;
  }
}

function tick() {
  return new Promise(resolve => setImmediate(resolve));
}

test("full attach forwards I/O to the same existing PTY and detaches without killing it", async t => {
  const factory = makeFakePtyFactory();
  const api = new EngineAPI({ ptyFactory: factory });
  t.after(() => api.dispose());
  api.loadProject({ sessions: [{ id: "a", name: "shell", command: "x", cwd: "." }] });
  const baselineDataListeners = factory.last()._dataHandlers.length;
  const baselineExitListeners = factory.last()._exitHandlers.length;
  const stdin = new FakeStdin();
  stdin.unref(); // Ink releases stdin while handing off to Full Attach.
  const stdout = new FakeStdout();
  let output = "";
  stdout.on("data", chunk => { output += chunk.toString(); });

  const attached = attachFull(api, "a", { stdin, stdout, redrawSettleMs: 0 });
  await tick();
  assert.equal(stdin.isRaw, true);
  assert.equal(stdin.referenced, true, "Full Attach must reclaim stdin after Ink unrefs it");
  assert.equal(factory.instances.length, 1);

  factory.last().emitData("live output\r\n");
  stdin.write(Buffer.from([0x03]));
  await tick();
  assert.match(output, /live output/);
  assert.equal(Buffer.from(factory.last().written.at(-1))[0], 0x03, "Ctrl+C must reach the PTY");

  stdin.write(Buffer.from([CTRL_RIGHT_BRACKET_BYTE]));
  const result = await attached;
  assert.equal(result.reason, "detached");
  assert.equal(factory.instances.length, 1, "attach must never spawn a duplicate PTY");
  assert.equal(factory.last().killed, false, "detach must preserve the session");
  assert.equal(api.getSnapshot("a").status, "running");
  assert.equal(stdin.isRaw, false);
  assert.equal(stdin.listenerCount("data"), 0);
  assert.equal(factory.last()._dataHandlers.length, baselineDataListeners);
  assert.equal(factory.last()._exitHandlers.length, baselineExitListeners);
});

test("double Esc detaches and a single Esc is eventually forwarded", async () => {
  const forwarded = [];
  let detachCount = 0;
  const handler = createDetachInputHandler({
    forward: data => forwarded.push(Buffer.from(data)),
    detach: () => { detachCount++; },
    escapeWindowMs: 5
  });

  handler.onData(Buffer.from([0x1b]));
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(forwarded.length, 1);
  assert.equal(forwarded[0][0], 0x1b);

  handler.onData(Buffer.from([0x1b]));
  handler.onData(Buffer.from([0x1b]));
  assert.equal(detachCount, 1);
  handler.close();
});

test("session exit leaves full attach and restores input", async t => {
  const factory = makeFakePtyFactory();
  const api = new EngineAPI({ ptyFactory: factory });
  t.after(() => api.dispose());
  api.loadProject({ sessions: [{ id: "a", name: "short", command: "x", cwd: "." }] });
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  stdout.resume();

  const attached = attachFull(api, "a", { stdin, stdout, redrawSettleMs: 0 });
  factory.last().emitExit(0);
  const result = await attached;
  assert.equal(result.reason, "session-exited");
  assert.equal(stdin.isRaw, false);
  assert.equal(stdin.listenerCount("data"), 0);
});

test("full attach rejects a non-running session", async t => {
  const factory = makeFakePtyFactory();
  const api = new EngineAPI({ ptyFactory: factory });
  t.after(() => api.dispose());
  const result = await attachFull(api, "missing", {
    stdin: new FakeStdin(),
    stdout: new FakeStdout(),
    redrawSettleMs: 0
  });
  assert.deepEqual(result, { attached: false, reason: "session is not running" });
  assert.equal(factory.instances.length, 0);
});

test("full attach reports setup errors instead of silently returning to the list", async t => {
  const factory = makeFakePtyFactory();
  const api = new EngineAPI({ ptyFactory: factory });
  t.after(() => api.dispose());
  api.loadProject({ sessions: [{ id: "a", name: "shell", command: "x", cwd: "." }] });
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  stdout.write = () => { throw new TypeError("terminal write failed"); };

  const result = await attachFull(api, "a", { stdin, stdout, redrawSettleMs: 0 });
  assert.equal(result.reason, "attach-error");
  assert.match(result.error, /TypeError: terminal write failed/);
});

test("partial raw-listener setup failure cleans up and returns an attach error", async t => {
  const factory = makeFakePtyFactory();
  const api = new EngineAPI({ ptyFactory: factory });
  t.after(() => api.dispose());
  api.loadProject({ sessions: [{ id: "a", command: "x", cwd: "." }] });
  let dataCleanupCount = 0;
  api.attachRawStream = () => ({
    resize: () => true,
    replay: () => ({ data: "", complete: true }),
    onData: () => () => { dataCleanupCount++; },
    onExit: () => { throw new Error("exit registration failed"); }
  });

  const result = await attachFull(api, "a", {
    stdin: new FakeStdin(),
    stdout: new FakeStdout(),
    redrawSettleMs: 0
  });
  assert.equal(result.reason, "attach-error");
  assert.match(result.error, /exit registration failed/);
  assert.equal(dataCleanupCount, 1);
});

test("live host write failures detach cleanly instead of escaping the PTY callback", async t => {
  const factory = makeFakePtyFactory();
  const api = new EngineAPI({ ptyFactory: factory });
  t.after(() => api.dispose());
  api.loadProject({ sessions: [{ id: "a", command: "x", cwd: "." }] });
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  const originalWrite = stdout.write.bind(stdout);
  stdout.write = chunk => {
    if (String(chunk).includes("live failure")) throw new Error("host output closed");
    return originalWrite(chunk);
  };

  const attached = attachFull(api, "a", { stdin, stdout, redrawSettleMs: 0 });
  await tick();
  assert.doesNotThrow(() => factory.last().emitData("live failure"));
  const result = await attached;
  assert.equal(result.reason, "attach-error");
  assert.match(result.error, /host output closed/);
  assert.equal(stdin.listenerCount("data"), 0);
});

test("full attach replays raw VT output to preserve the child cursor state", async t => {
  const factory = makeFakePtyFactory();
  const api = new EngineAPI({ ptyFactory: factory });
  t.after(() => api.dispose());
  api.loadProject({ sessions: [{ id: "ps", name: "shell", command: "x", cwd: "." }] });
  const rawPrompt = "\x1b[32mPS C:\\work>\x1b[0m ";
  factory.last().emitData(rawPrompt);

  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  let output = "";
  stdout.on("data", chunk => { output += chunk.toString(); });
  const attached = attachFull(api, "ps", { stdin, stdout, redrawSettleMs: 0 });
  await tick();

  assert.ok(output.includes(rawPrompt), "ANSI cursor and color state must be replayed verbatim");
  stdin.write(Buffer.from([CTRL_RIGHT_BRACKET_BYTE]));
  await attached;
});

test("truncated raw replay falls back to safe snapshot lines", async t => {
  const factory = makeFakePtyFactory();
  const api = new EngineAPI({ ptyFactory: factory });
  t.after(() => api.dispose());
  api.loadProject({ sessions: [{ id: "a", name: "shell", command: "x", cwd: "." }] });
  factory.last().emitData("safe line\n");
  const originalAttach = api.attachRawStream.bind(api);
  api.attachRawStream = id => ({
    ...originalAttach(id),
    replay: () => ({ data: "broken VT tail", byteLength: 14, complete: false })
  });
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  let output = "";
  stdout.on("data", chunk => { output += chunk.toString(); });

  const attached = attachFull(api, "a", { stdin, stdout, redrawSettleMs: 0 });
  await tick();
  assert.match(output, /safe line/);
  assert.doesNotMatch(output, /broken VT tail/);
  stdin.write(Buffer.from([CTRL_RIGHT_BRACKET_BYTE]));
  await attached;
});

test("PowerShell host-input modes are filtered across chunks and disabled before returning", async t => {
  const sanitizeChunk = createHostOutputSanitizer();
  assert.equal(sanitizeChunk("before\x1b[?90"), "before");
  assert.equal(sanitizeChunk("01hmiddle\x1b[?10"), "middle");
  assert.equal(sanitizeChunk("04hafter"), "after");
  assert.equal(sanitizeHostOutput("a\x1b[?9001hb"), "ab");
  const factory = makeFakePtyFactory();
  const api = new EngineAPI({ ptyFactory: factory });
  t.after(() => api.dispose());
  api.loadProject({ sessions: [{ id: "ps", name: "PowerShell", command: "powershell.exe -NoLogo", cwd: "." }] });
  factory.last().emitData("\x1b[?9001hPS C:\\work> ");
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  let output = "";
  stdout.on("data", chunk => { output += chunk.toString(); });

  const attached = attachFull(api, "ps", { stdin, stdout, redrawSettleMs: 0 });
  await tick();
  assert.doesNotMatch(output, /\?9001h/);
  stdin.write(Buffer.from([CTRL_RIGHT_BRACKET_BYTE]));
  await attached;
  assert.ok(output.includes(WINDOWS_INPUT_MODE_OFF), "detach must restore ordinary host input");
});
