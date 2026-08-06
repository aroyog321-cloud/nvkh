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
