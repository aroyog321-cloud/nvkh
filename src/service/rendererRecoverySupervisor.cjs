class RendererRecoverySupervisor {
  constructor(options = {}) {
    if (!options.recoveryService) {
      throw new TypeError("renderer recovery supervisor requires a recovery service");
    }
    if (typeof options.loadRenderer !== "function") {
      throw new TypeError("renderer recovery supervisor requires a renderer loader");
    }
    this.recoveryService = options.recoveryService;
    this.loadRenderer = options.loadRenderer;
    this.disposeConnection = options.disposeConnection || (() => {});
    this.onPaused = options.onPaused || (() => {});
    this.isBlocked = options.isBlocked || (() => false);
    this.setTimer = options.setTimer || setTimeout;
    this.clearTimer = options.clearTimer || clearTimeout;
    this.recoveryTimer = null;
    this.stableTimer = null;
    this.recoveryScheduled = false;
    this.disposed = false;
  }

  beginLoad() {
    if (this.disposed || this.isBlocked()) return Promise.resolve(false);
    return Promise.resolve()
      .then(() => this.loadRenderer())
      .then(() => true)
      .catch(() => this.recover({ reason: "load-failed", exitCode: null }));
  }

  recover(details = {}) {
    if (this.disposed || this.isBlocked()) return Promise.resolve(false);
    try { this.disposeConnection(); } catch (error) { /* Reload must still be attempted. */ }
    if (this.recoveryScheduled) return Promise.resolve(false);
    this._clearStableTimer();

    const decision = this.recoveryService.rendererFailed({
      reason: details.reason,
      exitCode: details.exitCode
    });
    if (!decision.recover) {
      Promise.resolve().then(() => this.onPaused(decision)).catch(() => {});
      return Promise.resolve(false);
    }

    this.recoveryScheduled = true;
    return new Promise(resolve => {
      this.recoveryTimer = this.setTimer(() => {
        this.recoveryTimer = null;
        this.recoveryScheduled = false;
        if (this.disposed || this.isBlocked()) {
          resolve(false);
          return;
        }
        this.beginLoad().then(resolve, () => resolve(false));
      }, decision.retryDelayMs);
      this.recoveryTimer?.unref?.();
    });
  }

  rendererLoaded() {
    if (this.disposed) return null;
    const status = this.recoveryService.rendererLoaded();
    this._clearStableTimer();
    if (status.phase === "recovered" && Number.isFinite(status.stableMs)) {
      this.stableTimer = this.setTimer(() => {
        this.stableTimer = null;
        if (!this.disposed) this.recoveryService.rendererStable();
      }, status.stableMs);
      this.stableTimer?.unref?.();
    }
    return status;
  }

  manualRetry() {
    if (this.disposed || this.isBlocked()) return Promise.resolve(false);
    this._clearRecoveryTimer();
    this.recoveryService.manualRetry();
    return this.beginLoad();
  }

  dispose() {
    if (this.disposed) return false;
    this.disposed = true;
    this._clearRecoveryTimer();
    this._clearStableTimer();
    return true;
  }

  _clearRecoveryTimer() {
    if (this.recoveryTimer) this.clearTimer(this.recoveryTimer);
    this.recoveryTimer = null;
    this.recoveryScheduled = false;
  }

  _clearStableTimer() {
    if (this.stableTimer) this.clearTimer(this.stableTimer);
    this.stableTimer = null;
  }
}

module.exports = { RendererRecoverySupervisor };
