const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_STABLE_MS = 30 * 1000;

class RendererRecoveryController {
  constructor(options = {}) {
    this.now = options.now || Date.now;
    this.maxAttempts = Number.isInteger(options.maxAttempts) && options.maxAttempts > 0
      ? options.maxAttempts
      : DEFAULT_MAX_ATTEMPTS;
    this.windowMs = Number.isFinite(options.windowMs) && options.windowMs > 0
      ? options.windowMs
      : DEFAULT_WINDOW_MS;
    this.stableMs = Number.isFinite(options.stableMs) && options.stableMs >= 0
      ? options.stableMs
      : DEFAULT_STABLE_MS;
    this.failures = [];
    this.phase = "healthy";
  }

  registerFailure() {
    const now = this.now();
    this._prune(now);
    if (this.failures.length >= this.maxAttempts) {
      this.phase = "paused";
      return {
        recover: false,
        phase: this.phase,
        attempt: this.failures.length,
        maxAttempts: this.maxAttempts,
        retryDelayMs: null
      };
    }
    this.failures.push(now);
    this.phase = "recovering";
    const attempt = this.failures.length;
    return {
      recover: true,
      phase: this.phase,
      attempt,
      maxAttempts: this.maxAttempts,
      retryDelayMs: Math.min(2000, 250 * (2 ** (attempt - 1)))
    };
  }

  markLoaded() {
    if (this.phase === "recovering") this.phase = "recovered";
    return this.status();
  }

  markStable() {
    this.failures = [];
    this.phase = "healthy";
    return this.status();
  }

  resetForManualRetry() {
    this.failures = [];
    this.phase = "recovering";
    return this.status();
  }

  status() {
    this._prune(this.now());
    return {
      phase: this.phase,
      attempts: this.failures.length,
      maxAttempts: this.maxAttempts,
      windowMs: this.windowMs,
      stableMs: this.stableMs
    };
  }

  _prune(now) {
    this.failures = this.failures.filter(timestamp => now - timestamp < this.windowMs);
    if (!this.failures.length && this.phase === "paused") this.phase = "healthy";
  }
}

class GroundstationRecoveryService {
  constructor(options = {}) {
    if (!options.store) throw new TypeError("Groundstation recovery requires a diagnostic store");
    this.store = options.store;
    this.controller = options.controller || new RendererRecoveryController(options);
    this.diagnosticsAvailable = !this.store.loadError;
  }

  rendererFailed(details = {}) {
    const decision = this.controller.registerFailure();
    this._record({
      kind: decision.recover ? "renderer-failure" : "renderer-crash-loop",
      reason: details.reason,
      exitCode: details.exitCode,
      action: decision.recover ? "automatic-reload" : "manual-recovery-required",
      attempt: decision.attempt
    });
    return decision;
  }

  rendererLoaded() {
    const before = this.controller.status();
    const status = this.controller.markLoaded();
    if (before.phase === "recovering") {
      this._record({
        kind: "renderer-recovered",
        reason: "unknown",
        action: "renderer-restored",
        attempt: Math.max(1, status.attempts)
      });
    }
    return status;
  }

  rendererStable() {
    return this.controller.markStable();
  }

  manualRetry() {
    const status = this.controller.resetForManualRetry();
    this._record({
      kind: "renderer-failure",
      reason: "unknown",
      action: "manual-reload",
      attempt: 1
    });
    return status;
  }

  mainFailed(reason = "uncaught-exception") {
    this._record({
      kind: "main-failure",
      reason,
      action: reason === "startup-failure" ? "safe-shutdown" : "default-termination"
    });
  }

  shutdownFailed() {
    this._record({
      kind: "shutdown-failure",
      reason: "unknown",
      action: "none"
    });
  }

  getStatus() {
    const incidents = this.store.list(10);
    return {
      ...this.controller.status(),
      diagnosticsAvailable: this.diagnosticsAvailable,
      diagnosticLoadError: this.store.loadError || null,
      incidents
    };
  }

  _record(value) {
    try {
      this.store.record(value);
      this.diagnosticsAvailable = true;
    } catch (error) {
      this.diagnosticsAvailable = false;
    }
  }
}

module.exports = {
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_STABLE_MS,
  DEFAULT_WINDOW_MS,
  GroundstationRecoveryService,
  RendererRecoveryController
};
