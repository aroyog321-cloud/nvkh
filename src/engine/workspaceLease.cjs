const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MALFORMED_LOCK_STALE_MS = 30_000;

class WorkspaceLeaseError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "WorkspaceLeaseError";
    this.owner = options.owner || null;
  }
}

function leasePathFor(configPath) {
  const absolute = path.resolve(configPath);
  return path.join(path.dirname(absolute), `.${path.basename(absolute)}.lock`);
}

function readOwnerResult(lockPath) {
  try {
    const value = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    return value && typeof value === "object"
      ? { status: "ok", owner: value }
      : { status: "invalid", owner: null };
  } catch (err) {
    return err?.code === "ENOENT"
      ? { status: "missing", owner: null }
      : { status: "unreadable", owner: null };
  }
}

function readOwner(lockPath) {
  return readOwnerResult(lockPath).owner;
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}

function ownerDescription(owner) {
  if (!owner) return "another process";
  const parts = [];
  if (Number.isInteger(owner.pid)) parts.push(`PID ${owner.pid}`);
  if (typeof owner.hostname === "string" && owner.hostname) parts.push(`on ${owner.hostname}`);
  return parts.length ? parts.join(" ") : "another process";
}

function isStaleLease(lockPath, owner, now = Date.now()) {
  if (owner) {
    // A workspace may live on a shared/UNC path. A foreign host's PID cannot
    // be tested locally, so assume that lease is live rather than stealing it.
    if (owner.hostname && owner.hostname !== os.hostname()) return false;
    return !isProcessAlive(owner.pid);
  }

  // Another process can observe the exclusive file between open() and the
  // metadata write. Only recover unreadable locks after a conservative age.
  try {
    return now - fs.statSync(lockPath).mtimeMs >= MALFORMED_LOCK_STALE_MS;
  } catch (err) {
    return err?.code === "ENOENT";
  }
}

function acquireWorkspaceLease(configPath, options = {}) {
  const absoluteConfigPath = path.resolve(configPath);
  const lockPath = options.lockPath || leasePathFor(absoluteConfigPath);
  const token = crypto.randomUUID();
  const owner = {
    version: 1,
    token,
    pid: process.pid,
    hostname: os.hostname(),
    startedAt: new Date().toISOString(),
    configPath: absoluteConfigPath
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    let descriptor;
    let created = false;
    try {
      descriptor = fs.openSync(lockPath, "wx", 0o600);
      created = true;
      fs.writeFileSync(descriptor, `${JSON.stringify(owner, null, 2)}\n`, "utf8");
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
    } catch (err) {
      if (descriptor !== undefined) {
        try { fs.closeSync(descriptor); } catch (closeError) { /* best effort */ }
      }
      if (created) {
        try { fs.unlinkSync(lockPath); } catch (unlinkError) { /* best effort */ }
      }
      if (err?.code !== "EEXIST") {
        throw new WorkspaceLeaseError(`unable to lock workspace: ${err.message}`, { cause: err });
      }

      const existing = readOwner(lockPath);
      if (attempt === 0 && isStaleLease(lockPath, existing)) {
        try {
          fs.unlinkSync(lockPath);
          continue;
        } catch (unlinkError) {
          throw new WorkspaceLeaseError(
            `unable to remove a stale workspace lock: ${unlinkError.message}`,
            { cause: unlinkError, owner: existing }
          );
        }
      }

      throw new WorkspaceLeaseError(
        `workspace is already open by ${ownerDescription(existing)}; refusing to start duplicate sessions`,
        { cause: err, owner: existing }
      );
    }

    let released = false;
    return {
      path: lockPath,
      owner: { ...owner },
      release() {
        if (released) return false;
        const ownerResult = readOwnerResult(lockPath);
        if (ownerResult.status === "missing") {
          released = true;
          return false;
        }
        if (ownerResult.status !== "ok") {
          // A transient read failure or partial metadata read cannot prove
          // that the lock disappeared or changed owners. Keep release
          // retryable rather than silently abandoning ownership.
          throw new WorkspaceLeaseError(
            "unable to verify workspace lock ownership before release"
          );
        }
        const current = ownerResult.owner;
        // A replaced lock is already outside this lease's ownership. Mark it
        // final so later calls remain idempotent without deleting a new owner.
        if (current.token !== token) {
          released = true;
          return false;
        }
        try {
          fs.unlinkSync(lockPath);
          released = true;
          return true;
        } catch (err) {
          if (err?.code === "ENOENT") {
            released = true;
            return false;
          }
          // Keep the lease retryable. EngineHost deliberately retains the
          // stopped engine when release throws so a later shutdown can retry
          // deleting a temporarily busy lock file.
          throw new WorkspaceLeaseError(`unable to release workspace lock: ${err.message}`, { cause: err });
        }
      }
    };
  }

  throw new WorkspaceLeaseError("unable to acquire workspace lock");
}

module.exports = {
  WorkspaceLeaseError,
  MALFORMED_LOCK_STALE_MS,
  acquireWorkspaceLease,
  isProcessAlive,
  isStaleLease,
  leasePathFor,
  readOwner,
  readOwnerResult
};
