const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const {
  DiagnosticStore,
  DiagnosticStoreError
} = require("../src/service/diagnosticStore.cjs");
const {
  GroundstationRecoveryService,
  RendererRecoveryController
} = require("../src/service/recoveryController.cjs");
const { RendererRecoverySupervisor } = require("../src/service/rendererRecoverySupervisor.cjs");

function makeStore(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-recovery-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return new DiagnosticStore(path.join(directory, "diagnostics.json"), options);
}

test("renderer recovery is bounded, delayed, and reset only after stability", () => {
  let now = 1000;
  const recovery = new RendererRecoveryController({
    now: () => now,
    maxAttempts: 3,
    windowMs: 1000,
    stableMs: 250
  });

  assert.deepEqual(
    [recovery.registerFailure(), recovery.registerFailure(), recovery.registerFailure()]
      .map(result => [result.recover, result.attempt, result.retryDelayMs]),
    [[true, 1, 250], [true, 2, 500], [true, 3, 1000]]
  );
  assert.deepEqual(recovery.registerFailure(), {
    recover: false,
    phase: "paused",
    attempt: 3,
    maxAttempts: 3,
    retryDelayMs: null
  });

  recovery.markLoaded();
  assert.equal(recovery.status().phase, "paused", "loading cannot silently clear a crash loop");
  recovery.resetForManualRetry();
  assert.equal(recovery.status().phase, "recovering");
  recovery.markStable();
  assert.deepEqual(recovery.status(), {
    phase: "healthy",
    attempts: 0,
    maxAttempts: 3,
    windowMs: 1000,
    stableMs: 250
  });

  recovery.registerFailure();
  now += 1001;
  assert.equal(recovery.registerFailure().attempt, 1, "expired failures do not poison future recovery");
});

test("durable recovery diagnostics are bounded and cannot persist sensitive input", t => {
  let now = 10;
  let id = 0;
  const store = makeStore(t, {
    maxIncidents: 2,
    now: () => ++now,
    createId: () => `a0000000-${++id}`
  });
  const secret = "SUPER_SECRET_TOKEN=do-not-save";

  store.record({
    kind: "renderer-failure",
    reason: "crashed",
    action: "automatic-reload",
    exitCode: 9,
    attempt: 1,
    message: secret,
    path: `C:\\private\\${secret}`,
    env: { TOKEN: secret },
    command: `agent --token ${secret}`,
    terminalOutput: secret
  });
  store.record({ kind: "renderer-recovered", reason: "not-allow-listed", action: "renderer-restored" });
  store.record({ kind: "main-failure", reason: "uncaught-exception", action: "safe-shutdown" });

  assert.equal(store.list().length, 2);
  assert.equal(store.list()[0].reason, "unknown");
  const contents = fs.readFileSync(store.filePath, "utf8");
  assert.equal(contents.includes(secret), false);
  assert.equal(contents.includes("private"), false);
  assert.equal(contents.includes("terminalOutput"), false);
  assert.deepEqual(Object.keys(store.list()[0]).sort(), [
    "action", "attempt", "exitCode", "id", "kind", "reason", "timestamp"
  ]);

  const restored = new DiagnosticStore(store.filePath, { maxIncidents: 2 });
  assert.deepEqual(restored.list(), store.list());
});

test("failed diagnostic commits preserve the last durable and in-memory snapshot", t => {
  const store = makeStore(t, { createId: () => "a0000000" });
  store.record({ kind: "renderer-failure", reason: "crashed", action: "automatic-reload" });
  const before = fs.readFileSync(store.filePath, "utf8");
  const realRenameSync = fs.renameSync;
  fs.renameSync = () => {
    const error = new Error("disk unavailable");
    error.code = "EIO";
    throw error;
  };
  t.after(() => { fs.renameSync = realRenameSync; });

  assert.throws(
    () => store.record({ kind: "renderer-recovered", action: "renderer-restored" }),
    error => error instanceof DiagnosticStoreError && !error.message.includes("disk unavailable")
  );
  assert.equal(store.list().length, 1);
  assert.equal(fs.readFileSync(store.filePath, "utf8"), before);
});

test("recovery service exposes only sanitized incidents and tolerates diagnostic failures", t => {
  const store = makeStore(t, { createId: () => "a0000000" });
  const controller = new RendererRecoveryController({ maxAttempts: 1 });
  const service = new GroundstationRecoveryService({ store, controller });

  assert.equal(service.rendererFailed({ reason: "crashed", exitCode: 7, error: "secret" }).recover, true);
  assert.equal(service.rendererLoaded().phase, "recovered");
  let status = service.getStatus();
  assert.equal(status.incidents.length, 2);
  assert.equal(JSON.stringify(status).includes("secret"), false);

  store.record = () => { throw new Error("disk failed with secret data"); };
  service.mainFailed("uncaught-exception");
  status = service.getStatus();
  assert.equal(status.diagnosticsAvailable, false);
  assert.equal(JSON.stringify(status).includes("disk failed"), false);
});

test("fatal diagnostics never claim an in-process recovery that cannot occur", t => {
  let id = 0;
  const store = makeStore(t, { createId: () => `a0000000-${++id}` });
  const service = new GroundstationRecoveryService({ store });

  service.mainFailed("uncaught-exception");
  service.mainFailed("startup-failure");
  assert.equal(store.list()[0].action, "default-termination");
  assert.equal(store.list()[1].action, "safe-shutdown");
});

test("renderer recovery supervisor reloads with backoff and resets only after a stable load", async () => {
  const timers = [];
  const setTimer = (callback, delay) => {
    const handle = { callback, delay, cleared: false, unref() {} };
    timers.push(handle);
    return handle;
  };
  const clearTimer = handle => { handle.cleared = true; };
  const calls = [];
  const recoveryService = {
    rendererFailed(details) {
      calls.push(["failed", details]);
      return { recover: true, attempt: 1, retryDelayMs: 250 };
    },
    rendererLoaded() {
      calls.push(["loaded"]);
      return { phase: "recovered", stableMs: 30 };
    },
    rendererStable() { calls.push(["stable"]); },
    manualRetry() { calls.push(["manual"]); }
  };
  const supervisor = new RendererRecoverySupervisor({
    recoveryService,
    loadRenderer: async () => { calls.push(["load"]); },
    disposeConnection: () => calls.push(["dispose-connection"]),
    setTimer,
    clearTimer
  });

  const recovery = supervisor.recover({ reason: "crashed", exitCode: 9 });
  assert.equal(timers[0].delay, 250);
  assert.equal(await supervisor.recover({ reason: "crashed" }), false, "duplicate crash signals share one reload window");
  timers[0].callback();
  assert.equal(await recovery, true);
  assert.deepEqual(calls.slice(0, 4), [
    ["dispose-connection"],
    ["failed", { reason: "crashed", exitCode: 9 }],
    ["dispose-connection"],
    ["load"]
  ]);

  supervisor.rendererLoaded();
  assert.equal(timers[1].delay, 30);
  timers[1].callback();
  assert.equal(calls.at(-1)[0], "stable");
  assert.equal(supervisor.dispose(), true);
  assert.equal(supervisor.dispose(), false);
});

test("renderer load failures enter the same bounded recovery path", async () => {
  const timers = [];
  let loadCalls = 0;
  let failure = null;
  const supervisor = new RendererRecoverySupervisor({
    recoveryService: {
      rendererFailed(details) {
        failure = details;
        return { recover: true, attempt: 1, retryDelayMs: 500 };
      },
      rendererLoaded() { return { stableMs: 30 }; },
      rendererStable() {},
      manualRetry() {}
    },
    loadRenderer: async () => {
      loadCalls++;
      if (loadCalls === 1) throw new Error("private load path must not escape");
    },
    setTimer(callback, delay) {
      const handle = { callback, delay, unref() {} };
      timers.push(handle);
      return handle;
    },
    clearTimer() {}
  });

  const loading = supervisor.beginLoad();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(failure, { reason: "load-failed", exitCode: null });
  assert.equal(timers[0].delay, 500);
  timers[0].callback();
  assert.equal(await loading, true);
  assert.equal(loadCalls, 2);
  supervisor.dispose();
});

test("a paused crash loop cannot reset itself through an unexpected load event", async () => {
  const timers = [];
  let stableCalls = 0;
  let pausedCalls = 0;
  const supervisor = new RendererRecoverySupervisor({
    recoveryService: {
      rendererFailed() {
        return { recover: false, attempt: 3, retryDelayMs: null };
      },
      rendererLoaded() { return { phase: "paused", stableMs: 1 }; },
      rendererStable() { stableCalls++; },
      manualRetry() {}
    },
    loadRenderer: async () => {},
    onPaused() {
      pausedCalls++;
      throw new Error("native dialog unavailable");
    },
    setTimer(callback, delay) {
      const handle = { callback, delay, unref() {} };
      timers.push(handle);
      return handle;
    }
  });

  assert.equal(await supervisor.recover({ reason: "crashed" }), false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pausedCalls, 1);
  supervisor.rendererLoaded();
  assert.equal(timers.length, 0);
  assert.equal(stableCalls, 0);
  supervisor.dispose();
});
