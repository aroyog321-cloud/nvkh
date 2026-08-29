const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DIAGNOSTIC_STORE_VERSION = 1;
const DEFAULT_MAX_INCIDENTS = 50;

const KINDS = new Set([
  "renderer-failure",
  "renderer-recovered",
  "renderer-crash-loop",
  "main-failure",
  "shutdown-failure"
]);
const REASONS = new Set([
  "abnormal-exit",
  "clean-exit",
  "crashed",
  "integrity-failure",
  "killed",
  "launch-failed",
  "load-failed",
  "oom",
  "startup-failure",
  "uncaught-exception",
  "unknown"
]);
const ACTIONS = new Set([
  "automatic-reload",
  "default-termination",
  "manual-reload",
  "manual-recovery-required",
  "none",
  "renderer-restored",
  "safe-shutdown"
]);

class DiagnosticStoreError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "DiagnosticStoreError";
  }
}

function integerOrNull(value) {
  return Number.isInteger(value) && Number.isSafeInteger(value) ? value : null;
}

function normalizeIncident(value, options = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const kind = KINDS.has(value.kind) ? value.kind : null;
  if (!kind) return null;
  const timestamp = Number.isFinite(value.timestamp) && value.timestamp >= 0
    ? value.timestamp
    : options.now?.();
  if (!Number.isFinite(timestamp)) return null;
  const id = typeof value.id === "string" && /^[a-f0-9-]{8,64}$/i.test(value.id)
    ? value.id
    : options.createId?.();
  if (!id) return null;

  return {
    id,
    timestamp,
    kind,
    reason: REASONS.has(value.reason) ? value.reason : "unknown",
    action: ACTIONS.has(value.action) ? value.action : "none",
    exitCode: integerOrNull(value.exitCode),
    attempt: Number.isInteger(value.attempt) && value.attempt > 0 && value.attempt <= 100
      ? value.attempt
      : null
  };
}

function cloneIncident(incident) {
  return { ...incident };
}

class DiagnosticStore {
  constructor(filePath, options = {}) {
    if (typeof filePath !== "string" || !filePath.trim()) {
      throw new TypeError("diagnostic store file path is required");
    }
    this.filePath = path.resolve(filePath);
    this.maxIncidents = Number.isInteger(options.maxIncidents) && options.maxIncidents > 0
      ? options.maxIncidents
      : DEFAULT_MAX_INCIDENTS;
    this.now = options.now || Date.now;
    this.createId = options.createId || (() => crypto.randomUUID());
    this.incidents = [];
    this.loadError = null;
    this._load();
  }

  _load() {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return;
      this.loadError = error instanceof SyntaxError
        ? "recovery diagnostics contain invalid JSON"
        : "recovery diagnostics could not be read";
      return;
    }
    if (
      !raw || typeof raw !== "object" || Array.isArray(raw) ||
      raw.version !== DIAGNOSTIC_STORE_VERSION || !Array.isArray(raw.incidents)
    ) {
      this.loadError = "recovery diagnostics have an unsupported format";
      return;
    }
    this.incidents = raw.incidents
      .map(value => normalizeIncident(value))
      .filter(Boolean)
      .slice(-this.maxIncidents);
  }

  list(limit = this.maxIncidents) {
    const bounded = Number.isInteger(limit) && limit > 0
      ? Math.min(limit, this.maxIncidents)
      : this.maxIncidents;
    return this.incidents.slice(-bounded).map(cloneIncident);
  }

  record(value = {}) {
    // Deliberately copy only this closed set of scalar fields. Exception text,
    // paths, workspace definitions, commands, terminal output, and environment
    // values can never enter the durable diagnostics file through this API.
    const incident = normalizeIncident({
      kind: value.kind,
      reason: value.reason,
      action: value.action,
      exitCode: value.exitCode,
      attempt: value.attempt,
      timestamp: this.now(),
      id: this.createId()
    });
    if (!incident) throw new DiagnosticStoreError("invalid recovery diagnostic");
    const next = [...this.incidents, incident].slice(-this.maxIncidents);
    this._commit(next);
    return cloneIncident(incident);
  }

  _commit(incidents) {
    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true });
    const temporaryPath = path.join(
      directory,
      `.${path.basename(this.filePath)}.${process.pid}.${Date.now()}.tmp`
    );
    const contents = `${JSON.stringify({
      version: DIAGNOSTIC_STORE_VERSION,
      incidents: incidents.map(cloneIncident)
    }, null, 2)}\n`;
    let descriptor;
    try {
      descriptor = fs.openSync(temporaryPath, "wx", 0o600);
      fs.writeFileSync(descriptor, contents, "utf8");
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.renameSync(temporaryPath, this.filePath);
    } catch (error) {
      if (descriptor !== undefined) {
        try { fs.closeSync(descriptor); } catch (closeError) { /* Preserve the write error. */ }
      }
      try { fs.unlinkSync(temporaryPath); } catch (cleanupError) { /* It may not exist. */ }
      throw new DiagnosticStoreError("unable to save recovery diagnostics", { cause: error });
    }
    this.incidents = incidents.map(cloneIncident);
    this.loadError = null;
  }
}

module.exports = {
  DEFAULT_MAX_INCIDENTS,
  DIAGNOSTIC_STORE_VERSION,
  DiagnosticStore,
  DiagnosticStoreError
};
