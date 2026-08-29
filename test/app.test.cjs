const assert = require("node:assert/strict");
const { PassThrough } = require("node:stream");
const { test } = require("node:test");
const { EngineAPI } = require("../src/engine/index.cjs");
const { makeFakePtyFactory } = require("./fakePty.cjs");

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(condition, timeoutMs = 3000) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started >= timeoutMs) throw new Error("timed out waiting for test condition");
    await wait(10);
  }
}

async function mountApp(options = {}) {
  const React = (await import("react")).default;
  const { render } = await import("ink");
  const App = (await import("../src/tui/App.js")).default;
  const factory = makeFakePtyFactory(options.factoryOptions);
  const api = new EngineAPI({ ptyFactory: factory });
  api.loadProject({
    sessions: options.sessions || [{ id: "a", name: "shell", command: "x", cwd: "." }],
    commands: options.commands || []
  });

  let listCalls = 0;
  let snapshotCalls = 0;
  const realList = api.list.bind(api);
  const realGetSnapshot = api.getSnapshot.bind(api);
  api.list = () => {
    listCalls++;
    return realList();
  };
  api.getSnapshot = id => {
    snapshotCalls++;
    return realGetSnapshot(id);
  };

  const stdin = new PassThrough();
  stdin.isTTY = true;
  stdin.setRawMode = () => stdin;
  stdin.ref = () => {};
  stdin.unref = () => {};
  const stdout = new PassThrough();
  stdout.isTTY = true;
  stdout.columns = 100;
  stdout.rows = 30;
  let output = "";
  stdout.on("data", chunk => { output += chunk.toString(); });
  const fullAttachIds = [];

  const instance = render(
    React.createElement(App, {
      engineApi: api,
      requestFullAttach: id => fullAttachIds.push(id),
      onQuit: () => {}
    }),
    { stdin, stdout, exitOnCtrlC: false, debug: false }
  );

  await waitFor(() => stdin.listenerCount("readable") > 0);
  await new Promise(resolve => setImmediate(resolve));
  return {
    api,
    factory,
    stdin,
    instance,
    fullAttachIds,
    output: () => output,
    clearOutput: () => { output = ""; },
    counts: () => ({ listCalls, snapshotCalls })
  };
}

test("Escape returns from Tail to the session list, including Windows enhanced input", async t => {
  const mounted = await mountApp();
  t.after(() => {
    mounted.instance.unmount();
    mounted.api.dispose();
  });

  mounted.clearOutput();
  mounted.stdin.write("\r");
  await waitFor(() => mounted.output().includes("Esc snapshot"));
  assert.match(mounted.output(), /Esc snapshot/);

  mounted.clearOutput();
  mounted.stdin.write("\x1b[27;1;27~");
  await waitFor(() => mounted.output().includes("Enter tail"));
  assert.match(mounted.output(), /Enter tail/);
});

test("Tail is read-only, follows real output, and F targets the same session", async t => {
  const mounted = await mountApp();
  t.after(() => {
    mounted.instance.unmount();
    mounted.api.dispose();
  });

  mounted.clearOutput();
  mounted.stdin.write("\r");
  await waitFor(() => mounted.output().includes("Esc snapshot"));
  const writesBefore = mounted.factory.last().written.length;
  mounted.stdin.write("z");
  mounted.factory.last().emitData("real tail line\n");
  await wait(130);

  assert.equal(mounted.factory.last().written.length, writesBefore, "Tail must not forward input");
  assert.equal(mounted.api.getSnapshot("a").lastLine, "real tail line");

  mounted.stdin.write("F");
  await wait(30);
  assert.deepEqual(mounted.fullAttachIds, ["a"]);
});

test("F on an exited session stays in Mission Control and explains why attach is unavailable", async t => {
  const mounted = await mountApp();
  t.after(() => {
    mounted.instance.unmount();
    mounted.api.dispose();
  });

  mounted.factory.last().emitExit(0);
  mounted.clearOutput();
  mounted.stdin.write("F");
  await waitFor(() => mounted.output().includes("Cannot attach: shell is exited"));

  assert.deepEqual(mounted.fullAttachIds, []);
  assert.match(mounted.output(), /Cannot attach: shell is exited/);
});

test("output bursts are coalesced without refreshing the whole session list", async t => {
  const mounted = await mountApp();
  t.after(() => {
    mounted.instance.unmount();
    mounted.api.dispose();
  });
  const before = mounted.counts();

  for (let i = 0; i < 250; i++) mounted.factory.last().emitData(`line ${i}\n`);
  await wait(140);
  const after = mounted.counts();

  assert.ok(after.snapshotCalls - before.snapshotCalls <= 2, "one burst should cause one throttled snapshot refresh");
  assert.equal(after.listCalls - before.listCalls, 0, "output alone must not rebuild the session list");
});

test("recent activity shows real engine lifecycle changes", async t => {
  const mounted = await mountApp();
  t.after(() => {
    mounted.instance.unmount();
    mounted.api.dispose();
  });

  assert.match(mounted.output(), /RECENT ACTIVITY/);
  mounted.clearOutput();
  mounted.factory.last().emitExit(0);
  await waitFor(() => mounted.output().includes("shell exited (0)"));
  assert.match(mounted.output(), /shell exited \(0\)/);
});

test("attention output is surfaced and can be acknowledged from the snapshot", async t => {
  const mounted = await mountApp();
  t.after(() => {
    mounted.instance.unmount();
    mounted.api.dispose();
  });

  mounted.factory.last().emitData("Error: build failed\n");
  await waitFor(() => mounted.output().includes("NEEDS ATTENTION"));
  assert.equal(mounted.api.getSnapshot("a").attentionRequired, true);
  assert.match(mounted.output(), /NEEDS ATTENTION/);

  mounted.stdin.write("a");
  await waitFor(() => mounted.output().includes("Attention acknowledged"));
  assert.equal(mounted.api.getSnapshot("a").attentionRequired, false);
  assert.match(mounted.output(), /Attention acknowledged/);
});

test("attention navigation cycles through every session that needs action", async t => {
  const mounted = await mountApp({ sessions: [
    { id: "a", name: "API", command: "x", cwd: "." },
    { id: "b", name: "Build", command: "x", cwd: "." },
    { id: "c", name: "Checks", command: "x", cwd: "." }
  ] });
  t.after(() => {
    mounted.instance.unmount();
    mounted.api.dispose();
  });

  mounted.factory.instances[0].emitData("Error: API failed\n");
  mounted.factory.instances[2].emitData("FAILED checks\n");
  await waitFor(() => mounted.output().includes("2 attention"));

  mounted.clearOutput();
  mounted.stdin.write("g");
  await waitFor(() => mounted.output().includes("Attention 2 of 2"));
  assert.match(mounted.output(), /Attention 2 of 2/);

  mounted.clearOutput();
  mounted.stdin.write("g");
  await waitFor(() => mounted.output().includes("Attention 1 of 2"));
  assert.match(mounted.output(), /Attention 1 of 2/);
});

test("keyboard guide opens and closes with Windows enhanced Escape", async t => {
  const mounted = await mountApp();
  t.after(() => {
    mounted.instance.unmount();
    mounted.api.dispose();
  });

  mounted.clearOutput();
  mounted.stdin.write("?");
  await waitFor(() => mounted.output().includes("KEYBOARD GUIDE"));
  assert.match(mounted.output(), /One PTY per session/);

  mounted.clearOutput();
  mounted.stdin.write("\x1b[27;1;27~");
  await waitFor(() => mounted.output().includes("Enter tail"));
  assert.match(mounted.output(), /next attention/);
});

test("unmount removes EngineAPI subscription and cancels pending output timer", async () => {
  const mounted = await mountApp();
  assert.equal(mounted.api.listenerCount("engine:event"), 1);

  mounted.factory.last().emitData("pending\n");
  mounted.instance.unmount();
  await wait(130);

  assert.equal(mounted.api.listenerCount("engine:event"), 0);
  mounted.api.dispose();
});

test("guided create flow adds exactly one engine-owned PTY", async t => {
  const mounted = await mountApp();
  t.after(() => {
    mounted.instance.unmount();
    mounted.api.dispose();
  });

  mounted.stdin.write("c");
  await wait(20);
  mounted.stdin.write("web");
  await wait(10);
  mounted.stdin.write("\r");
  await wait(20);
  mounted.stdin.write("Web server");
  await wait(10);
  mounted.stdin.write("\r");
  await wait(20);
  mounted.stdin.write("npm run dev");
  await wait(10);
  mounted.stdin.write("\r");
  await wait(20);
  mounted.stdin.write(".");
  await wait(10);
  mounted.stdin.write("\r");
  await wait(20);
  mounted.clearOutput();
  mounted.stdin.write("\r");
  await waitFor(() => mounted.api.list().some(session => session.id === "web"));
  await waitFor(() => mounted.output().includes("Session created"));
  await waitFor(() => mounted.output().includes("Web server"));

  assert.deepEqual(mounted.api.list().map(session => session.id), ["a", "web"]);
  assert.equal(mounted.factory.instances.length, 2);
  assert.match(mounted.output(), /Web server/, "the created session must appear in the visible list");
});

test("guided create can register a manual session without spawning it", async t => {
  const mounted = await mountApp();
  t.after(() => {
    mounted.instance.unmount();
    mounted.api.dispose();
  });

  mounted.stdin.write("c");
  await wait(20);
  mounted.stdin.write("db");
  await wait(10);
  mounted.stdin.write("\r");
  await wait(20);
  mounted.stdin.write("Database");
  await wait(10);
  mounted.stdin.write("\r");
  await wait(20);
  mounted.stdin.write("docker compose up db");
  await wait(10);
  mounted.stdin.write("\r");
  await wait(20);
  mounted.stdin.write(".");
  await wait(10);
  mounted.stdin.write("\r");
  await wait(20);
  mounted.stdin.write("no");
  await wait(10);
  mounted.clearOutput();
  mounted.stdin.write("\r");

  await waitFor(() => mounted.api.list().some(session => session.id === "db"));
  await waitFor(() => mounted.output().includes("Session created"));
  assert.equal(mounted.factory.instances.length, 1);
  assert.equal(mounted.api.getSnapshot("db").status, "idle");
  assert.equal(mounted.api.getSnapshot("db").autoStart, false);
});

test("saved preset picker adds a manual worker without spawning it", async t => {
  const mounted = await mountApp({ commands: [
    { id: "checks", name: "Run checks", command: "npm test", cwd: "." }
  ] });
  t.after(() => {
    mounted.instance.unmount();
    mounted.api.dispose();
  });

  mounted.clearOutput();
  mounted.stdin.write("p");
  await waitFor(() => mounted.output().includes("SAVED WORKER PRESETS"));
  assert.match(mounted.output(), /Run checks · manual start/);

  mounted.clearOutput();
  mounted.stdin.write("\r");
  await waitFor(() => mounted.output().includes("Added saved preset: Run checks"));
  await waitFor(() => mounted.output().includes("Run checks"));
  assert.equal(mounted.api.getSnapshot("checks").status, "idle");
  assert.equal(mounted.factory.instances.length, 1, "only the original shell PTY should exist");
});

test("idle sessions start explicitly and startup policy toggles independently", async t => {
  const mounted = await mountApp({ sessions: [
    { id: "manual", name: "Database", command: "x", cwd: ".", autoStart: false }
  ] });
  t.after(() => {
    mounted.instance.unmount();
    mounted.api.dispose();
  });

  assert.equal(mounted.factory.instances.length, 0);
  assert.equal(mounted.api.getSnapshot("manual").status, "idle");
  assert.match(mounted.output(), /startup  manual/);

  mounted.clearOutput();
  mounted.stdin.write("s");
  await waitFor(() => mounted.output().includes("Started"));
  assert.equal(mounted.factory.instances.length, 1);
  assert.equal(mounted.api.getSnapshot("manual").status, "running");
  assert.equal(mounted.api.getSnapshot("manual").autoStart, false);

  mounted.clearOutput();
  mounted.stdin.write("u");
  await waitFor(() => mounted.output().includes("Startup set to automatic"));
  assert.equal(mounted.api.getSnapshot("manual").autoStart, true);
  assert.equal(mounted.factory.instances.length, 1);
});

test("stopped workers can be edited without launching until explicitly started", async t => {
  const mounted = await mountApp({ sessions: [
    { id: "manual", name: "API", command: "old", cwd: ".", autoStart: false }
  ] });
  t.after(() => {
    mounted.instance.unmount();
    mounted.api.dispose();
  });

  mounted.stdin.write("e");
  await waitFor(() => mounted.output().includes("EDIT WORKER"));
  mounted.clearOutput();
  mounted.stdin.write("node");
  await wait(10);
  mounted.stdin.write("\r");
  await waitFor(() => mounted.output().includes("Arguments"));
  mounted.clearOutput();
  mounted.stdin.write("[\"server.js\"]");
  await wait(10);
  mounted.stdin.write("\r");
  await waitFor(() => mounted.output().includes("Working directory"));
  mounted.clearOutput();
  mounted.stdin.write("\r");
  await waitFor(() => mounted.output().includes("PowerShell compatibility"));
  mounted.clearOutput();
  mounted.stdin.write("\r");
  await waitFor(() => mounted.output().includes("Environment overrides"));
  mounted.clearOutput();
  mounted.stdin.write("{\"API_TOKEN\":\"secret\"}");
  await wait(10);
  mounted.stdin.write("\r");

  await waitFor(() => mounted.output().includes("Worker configuration updated"));
  assert.equal(mounted.factory.instances.length, 0);
  assert.equal(mounted.api.getSnapshot("manual").command, "node");
  assert.deepEqual(mounted.api.getSnapshot("manual").args, ["server.js"]);
  assert.deepEqual(mounted.api.getSnapshot("manual").envKeys, ["API_TOKEN"]);

  mounted.stdin.write("s");
  await waitFor(() => mounted.output().includes("Started"));
  assert.equal(mounted.factory.instances.length, 1);
  assert.equal(mounted.factory.last()._spawnArgs.opts.env.API_TOKEN, "secret");
});

test("running workers refuse edit mode without stopping their PTY", async t => {
  const mounted = await mountApp();
  t.after(() => {
    mounted.instance.unmount();
    mounted.api.dispose();
  });

  mounted.clearOutput();
  mounted.stdin.write("e");
  await waitFor(() => mounted.output().includes("Stop the worker before editing"));
  assert.equal(mounted.output().includes("EDIT WORKER"), false);
  assert.equal(mounted.factory.instances.length, 1);
  assert.equal(mounted.factory.last().killed, false);
});
