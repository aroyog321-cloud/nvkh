const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const { EngineHost, defaultShell } = require("../src/service/engineHost.cjs");

function hostFixture(options = {}) {
  const calls = [];
  const leases = [];
  const states = options.states || [{ ok: true }];
  class FakeEngineAPI {
    constructor() {
      this.loaded = null;
      this.disposed = false;
      calls.push(["construct"]);
    }
    loadProject(value) {
      this.loaded = value;
      calls.push(["load", value]);
      if (options.loadError) throw options.loadError;
    }
    getState() { return { contractVersion: 1, sessions: [] }; }
    async stopAll() {
      const result = states.shift() || { ok: true };
      calls.push(["stopAll", result]);
      return result;
    }
    dispose() {
      this.disposed = true;
      calls.push(["dispose"]);
    }
  }
  const host = new EngineHost({
    EngineAPI: FakeEngineAPI,
    existsSync: () => options.exists !== false,
    validateWorkspaceFile: value => calls.push(["validate", value]),
    acquireWorkspaceLease: value => {
      calls.push(["lease", value]);
      const lease = {
        released: false,
        release() {
          if (options.releaseErrors?.length) throw options.releaseErrors.shift();
          this.released = true;
          calls.push(["release"]);
          return true;
        }
      };
      leases.push(lease);
      return lease;
    },
    platform: options.platform || "linux",
    env: { SHELL: "/bin/zsh" }
  });
  return { host, calls, leases };
}

test("engine host validates and leases a workspace before configured sessions load", async () => {
  const { host, calls, leases } = hostFixture();
  const configPath = path.resolve("project.json");

  await host.open({ configPath, configExplicit: true });
  assert.deepEqual(calls.slice(0, 4), [
    ["validate", configPath],
    ["lease", configPath],
    ["construct"],
    ["load", configPath]
  ]);
  assert.equal(host.isOpen, true);

  assert.deepEqual(await host.shutdown(), { ok: true });
  assert.equal(leases[0].released, true);
  assert.deepEqual(calls.slice(-3), [["stopAll", { ok: true }], ["release"], ["dispose"]]);
  assert.equal(host.isOpen, false);
});

test("failed safe shutdown retains engine ownership and the workspace lease", async () => {
  const { host, leases } = hostFixture({
    states: [
      { ok: false, pendingIds: ["server"] },
      { ok: true }
    ]
  });
  await host.open({ configPath: "project.json", configExplicit: true });

  assert.deepEqual(await host.shutdown(), { ok: false, pendingIds: ["server"] });
  assert.equal(host.isOpen, true);
  assert.equal(leases[0].released, false);
  assert.deepEqual(await host.shutdown(), { ok: true });
  assert.equal(leases[0].released, true);
});

test("missing default workspace opens one platform shell without a lease", async () => {
  const { host, calls, leases } = hostFixture({ exists: false, platform: "win32" });
  await host.open({ configPath: "missing.json", cwd: "C:\\work" });

  const loaded = calls.find(call => call[0] === "load")[1];
  assert.equal(loaded.sessions.length, 1);
  assert.equal(loaded.sessions[0].command, "powershell.exe");
  assert.equal(loaded.sessions[0].powershellCompatibility, true);
  assert.equal(leases.length, 0);
  await host.shutdown();
});

test("an explicit missing workspace fails without constructing a PTY lease", async () => {
  const { host, calls, leases } = hostFixture({ exists: false });
  await assert.rejects(
    host.open({ configPath: "missing.json", configExplicit: true }),
    /does not exist/
  );
  assert.equal(leases.length, 0);
  assert.equal(calls.some(call => call[0] === "load"), false);
  assert.equal(host.isOpen, false);
});

test("a failed startup cleanup keeps the lease until shutdown can retry", async () => {
  const { host, leases } = hostFixture({
    loadError: new Error("load exploded"),
    states: [
      { ok: false, pendingIds: ["half-started"] },
      { ok: true }
    ]
  });

  await assert.rejects(
    host.open({ configPath: "project.json", configExplicit: true }),
    /load exploded/
  );
  assert.equal(host.isOpen, true);
  assert.equal(leases[0].released, false);
  assert.deepEqual(await host.shutdown(), { ok: true });
  assert.equal(leases[0].released, true);
});

test("a lease release failure keeps the stopped host available for retry", async () => {
  const { host, leases, calls } = hostFixture({
    releaseErrors: [new Error("lock file is busy")],
    states: [{ ok: true }]
  });
  await host.open({ configPath: "project.json", configExplicit: true });

  assert.deepEqual(await host.shutdown(), {
    ok: false,
    error: "lock file is busy",
    pendingIds: []
  });
  assert.equal(host.isOpen, true);
  assert.equal(calls.some(call => call[0] === "dispose"), false);

  assert.deepEqual(await host.shutdown(), { ok: true });
  assert.equal(host.isOpen, false);
  assert.equal(leases[0].released, true);
});

test("startup cleanup also retains a lease whose release must be retried", async () => {
  const { host, leases } = hostFixture({
    loadError: new Error("load exploded"),
    states: [{ ok: true }],
    releaseErrors: [new Error("lock file is busy")]
  });

  await assert.rejects(
    host.open({ configPath: "project.json", configExplicit: true }),
    /load exploded/
  );
  assert.equal(host.isOpen, true);
  assert.equal(leases[0].released, false);
  assert.deepEqual(await host.shutdown(), { ok: true });
  assert.equal(leases[0].released, true);
});

test("default shell preserves Windows and POSIX onboarding behavior", () => {
  assert.deepEqual(defaultShell("win32", {}), {
    command: "powershell.exe",
    args: ["-NoLogo"],
    powershellCompatibility: true
  });
  assert.deepEqual(defaultShell("linux", { SHELL: "/bin/fish" }), {
    command: "/bin/fish",
    args: [],
    powershellCompatibility: false
  });
});

test("project switching stops the previous engine before replacing its lease and API", async () => {
  const calls = [];
  const engines = [];
  class SwitchingEngine {
    constructor() {
      this.id = engines.length + 1;
      this.path = null;
      this.running = this.id === 1;
      engines.push(this);
      calls.push(["construct", this.id]);
    }
    loadProject(value) { this.path = value; calls.push(["load", this.id, value]); }
    getState() { return { contractVersion: 1, sessions: [], workspace: this.getWorkspace() }; }
    getWorkspace() {
      return { persistent: true, path: this.path, directory: path.dirname(this.path), name: `Project ${this.id}` };
    }
    list() { return this.running ? [{ id: "api", isAlive: true }] : []; }
    async stopAll() { this.running = false; calls.push(["stopAll", this.id]); return { ok: true }; }
    async start(id) { this.running = true; calls.push(["start", this.id, id]); return { ok: true }; }
    dispose() { calls.push(["dispose", this.id]); }
  }
  const leases = [];
  const host = new EngineHost({
    EngineAPI: SwitchingEngine,
    existsSync: () => true,
    validateWorkspaceFile: value => calls.push(["validate", value]),
    acquireWorkspaceLease: value => {
      const lease = {
        path: value,
        release() { calls.push(["release", value]); return true; }
      };
      leases.push(lease);
      calls.push(["lease", value]);
      return lease;
    }
  });
  const first = path.resolve("first.json");
  const second = path.resolve("second.json");
  await host.open({ configPath: first, configExplicit: true });

  const switched = await host.switchTo({ configPath: second, cwd: path.dirname(second) });
  assert.equal(switched.ok, true);
  assert.equal(switched.changed, true);
  assert.equal(host.engineApi, engines[1]);
  assert.equal(host.currentOptions.configPath, second);
  assert.ok(calls.findIndex(call => call[0] === "stopAll" && call[1] === 1) < calls.findIndex(call => call[0] === "lease" && call[1] === second));
  assert.ok(calls.findIndex(call => call[0] === "load" && call[1] === 2) < calls.findIndex(call => call[0] === "release" && call[1] === first));
  assert.ok(calls.findIndex(call => call[0] === "release" && call[1] === first) < calls.findIndex(call => call[0] === "dispose" && call[1] === 1));
  assert.equal(leases.length, 2);
  await host.shutdown();
});

test("a stuck current worker blocks project switching before the target lease is acquired", async () => {
  const calls = [];
  class StuckEngine {
    loadProject(value) { this.path = value; }
    getState() { return { contractVersion: 1, sessions: [] }; }
    getWorkspace() { return { persistent: true, path: this.path }; }
    list() { return [{ id: "api", isAlive: true }]; }
    async stopAll() { return { ok: false, pendingIds: ["api"] }; }
    dispose() {}
  }
  const host = new EngineHost({
    EngineAPI: StuckEngine,
    existsSync: () => true,
    validateWorkspaceFile() {},
    acquireWorkspaceLease(value) {
      calls.push(value);
      return { release() { return true; } };
    }
  });
  const first = path.resolve("first.json");
  const second = path.resolve("second.json");
  await host.open({ configPath: first, configExplicit: true });

  const result = await host.switchTo({ configPath: second });
  assert.equal(result.ok, false);
  assert.deepEqual(result.pendingIds, ["api"]);
  assert.deepEqual(calls, [first]);
  assert.equal(host.currentOptions.configPath, first);
});

test("target lease failure restores workers that were running before the switch", async () => {
  const calls = [];
  class RestorableEngine {
    constructor() { this.running = true; }
    loadProject(value) { this.path = value; }
    getState() { return { contractVersion: 1, sessions: [] }; }
    getWorkspace() { return { persistent: true, path: this.path }; }
    list() { return this.running ? [{ id: "api", isAlive: true }] : []; }
    async stopAll() { this.running = false; calls.push("stop"); return { ok: true }; }
    async start(id) { this.running = true; calls.push(`start:${id}`); return { ok: true }; }
    dispose() {}
  }
  let leases = 0;
  const host = new EngineHost({
    EngineAPI: RestorableEngine,
    existsSync: () => true,
    validateWorkspaceFile() {},
    acquireWorkspaceLease() {
      leases++;
      if (leases === 2) throw new Error("target workspace is already open");
      return { release() { return true; } };
    }
  });
  await host.open({ configPath: "first.json", configExplicit: true });

  const result = await host.switchTo({ configPath: "second.json" });
  assert.equal(result.ok, false);
  assert.equal(result.currentPreserved, true);
  assert.match(result.error, /already open/);
  assert.deepEqual(calls, ["stop", "start:api"]);
  assert.equal(host.engineApi.list()[0].isAlive, true);
  await host.shutdown();
});

test("previous lock release failure tears down the candidate and restores the old workers", async () => {
  const engines = [];
  const calls = [];
  class RollbackEngine {
    constructor() { this.id = engines.length + 1; this.running = true; engines.push(this); }
    loadProject(value) { this.path = value; }
    getState() { return { contractVersion: 1, sessions: [] }; }
    getWorkspace() { return { persistent: true, path: this.path }; }
    list() { return this.running ? [{ id: "api", isAlive: true }] : []; }
    async stopAll() { this.running = false; calls.push(`stop:${this.id}`); return { ok: true }; }
    async start(id) { this.running = true; calls.push(`start:${this.id}:${id}`); return { ok: true }; }
    dispose() { calls.push(`dispose:${this.id}`); }
  }
  let leaseNumber = 0;
  let oldReleaseAttempts = 0;
  const host = new EngineHost({
    EngineAPI: RollbackEngine,
    existsSync: () => true,
    validateWorkspaceFile() {},
    acquireWorkspaceLease() {
      const number = ++leaseNumber;
      return {
        release() {
          calls.push(`release:${number}`);
          if (number === 1 && oldReleaseAttempts++ === 0) throw new Error("old lock is busy");
          return true;
        }
      };
    }
  });
  await host.open({ configPath: "first.json", configExplicit: true });

  const result = await host.switchTo({ configPath: "second.json" });
  assert.equal(result.ok, false);
  assert.equal(result.currentPreserved, true);
  assert.match(result.error, /old lock is busy/);
  assert.deepEqual(calls, [
    "stop:1",
    "release:1",
    "stop:2",
    "release:2",
    "dispose:2",
    "start:1:api"
  ]);
  assert.equal(host.engineApi, engines[0]);
  assert.equal(host.engineApi.list()[0].isAlive, true);
  await host.shutdown();
});

test("concurrent project switches are rejected instead of sharing the wrong target result", async () => {
  let releaseStop;
  let stopCalls = 0;
  class SerializedEngine {
    loadProject(value) { this.path = value; }
    getState() { return { contractVersion: 1, sessions: [] }; }
    getWorkspace() { return { persistent: true, path: this.path }; }
    list() { return []; }
    async stopAll() {
      stopCalls++;
      if (stopCalls === 1) await new Promise(resolve => { releaseStop = resolve; });
      return { ok: true };
    }
    dispose() {}
  }
  const host = new EngineHost({
    EngineAPI: SerializedEngine,
    existsSync: () => true,
    validateWorkspaceFile() {},
    acquireWorkspaceLease() { return { release() { return true; } }; }
  });
  await host.open({ configPath: "first.json", configExplicit: true });

  const firstSwitch = host.switchTo({ configPath: "second.json" });
  await Promise.resolve();
  const competing = await host.switchTo({ configPath: "third.json" });
  assert.deepEqual(competing, { ok: false, error: "a project switch is already in progress" });
  releaseStop();
  assert.equal((await firstSwitch).ok, true);
  assert.equal(host.currentOptions.configPath, path.resolve("second.json"));
  await host.shutdown();
});
