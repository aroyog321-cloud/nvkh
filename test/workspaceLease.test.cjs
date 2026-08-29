const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const {
  WorkspaceLeaseError,
  acquireWorkspaceLease,
  leasePathFor,
  readOwner
} = require("../src/engine/workspaceLease.cjs");

function makeConfig(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-lease-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const configPath = path.join(directory, "termctl.config.json");
  fs.writeFileSync(configPath, "{\"sessions\":[]}\n");
  return configPath;
}

test("workspace lease prevents a second live owner and releases idempotently", t => {
  const configPath = makeConfig(t);
  const lease = acquireWorkspaceLease(configPath);
  const owner = readOwner(lease.path);

  assert.equal(owner.pid, process.pid);
  assert.equal(owner.configPath, configPath);
  assert.throws(
    () => acquireWorkspaceLease(configPath),
    error => error instanceof WorkspaceLeaseError && /duplicate sessions/.test(error.message)
  );
  assert.equal(lease.release(), true);
  assert.equal(lease.release(), false);
  assert.equal(fs.existsSync(lease.path), false);
});

test("stale or malformed leases are replaced safely", t => {
  const configPath = makeConfig(t);
  const lockPath = leasePathFor(configPath);
  fs.writeFileSync(lockPath, "not-json\n");
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(lockPath, old, old);

  const lease = acquireWorkspaceLease(configPath);
  assert.equal(readOwner(lockPath).pid, process.pid);
  lease.release();
});

test("fresh unreadable and foreign-host leases are never stolen", t => {
  const configPath = makeConfig(t);
  const lockPath = leasePathFor(configPath);
  fs.writeFileSync(lockPath, "partial");
  assert.throws(() => acquireWorkspaceLease(configPath), /already open/);

  fs.writeFileSync(lockPath, JSON.stringify({ pid: 2147483647, hostname: `${os.hostname()}-remote` }));
  assert.throws(() => acquireWorkspaceLease(configPath), /already open/);
});

test("release never deletes a lock whose ownership token changed", t => {
  const configPath = makeConfig(t);
  const lease = acquireWorkspaceLease(configPath);
  fs.writeFileSync(lease.path, JSON.stringify({ ...lease.owner, token: "different-owner" }));

  assert.equal(lease.release(), false);
  assert.equal(fs.existsSync(lease.path), true);
});
