const fs = require("node:fs");
const path = require("node:path");
const { EngineAPI } = require("../engine/index.cjs");
const { validateWorkspaceFile } = require("../engine/workspaceConfig.cjs");
const { acquireWorkspaceLease } = require("../engine/workspaceLease.cjs");

function defaultShell(platform = process.platform, env = process.env) {
  return platform === "win32"
    ? {
        command: "powershell.exe",
        args: ["-NoLogo"],
        powershellCompatibility: true
      }
    : {
        command: env.SHELL || "sh",
        args: [],
        powershellCompatibility: false
      };
}

class EngineHost {
  #EngineAPI;
  #validateWorkspaceFile;
  #acquireWorkspaceLease;
  #existsSync;
  #platform;
  #env;
  #engineOptions;
  #engineApi;
  #workspaceLease;
  #opening;
  #shutdownPromise;

  constructor(options = {}) {
    this.#EngineAPI = options.EngineAPI || EngineAPI;
    this.#validateWorkspaceFile = options.validateWorkspaceFile || validateWorkspaceFile;
    this.#acquireWorkspaceLease = options.acquireWorkspaceLease || acquireWorkspaceLease;
    this.#existsSync = options.existsSync || fs.existsSync;
    this.#platform = options.platform || process.platform;
    this.#env = options.env || process.env;
    this.#engineOptions = options.engineOptions || {};
    this.#engineApi = null;
    this.#workspaceLease = null;
    this.#opening = false;
    this.#shutdownPromise = null;
  }

  get engineApi() {
    return this.#engineApi;
  }

  get isOpen() {
    return Boolean(this.#engineApi);
  }

  async open(options = {}) {
    if (this.#engineApi || this.#opening) {
      throw new Error("a workspace is already open in this engine host");
    }
    if (typeof options.configPath !== "string" || !options.configPath.trim()) {
      throw new Error("configPath is required");
    }

    this.#opening = true;
    const configPath = path.resolve(options.configPath);
    const configExplicit = options.configExplicit === true;
    const cwd = path.resolve(options.cwd || process.cwd());
    let lease = null;
    let engineApi = null;

    try {
      if (this.#existsSync(configPath)) {
        // Invalid roots must fail before the lease or any configured PTY exists.
        this.#validateWorkspaceFile(configPath);
        lease = this.#acquireWorkspaceLease(configPath);
        engineApi = new this.#EngineAPI(this.#engineOptions);
        engineApi.loadProject(configPath);
      } else {
        if (configExplicit) {
          throw new Error(`workspace file does not exist: ${configPath}`);
        }
        engineApi = new this.#EngineAPI(this.#engineOptions);
        const shell = defaultShell(this.#platform, this.#env);
        engineApi.loadProject({
          sessions: [
            {
              id: "shell",
              name: "Shell",
              command: shell.command,
              args: shell.args,
              powershellCompatibility: shell.powershellCompatibility,
              cwd
            }
          ]
        });
      }

      this.#engineApi = engineApi;
      this.#workspaceLease = lease;
      return engineApi.getState();
    } catch (error) {
      if (engineApi) {
        try {
          const stopped = await engineApi.stopAll();
          if (stopped?.ok === false) {
            // A failed cleanup is still an ownership state. Keep both the
            // engine and lease reachable so a later shutdown can retry; never
            // unlock a workspace while one of its configured PTYs may live.
            this.#engineApi = engineApi;
            this.#workspaceLease = lease;
          } else {
            try {
              lease?.release();
              engineApi.dispose();
              lease = null;
            } catch (releaseError) {
              this.#engineApi = engineApi;
              this.#workspaceLease = lease;
            }
          }
        } catch (shutdownError) {
          this.#engineApi = engineApi;
          this.#workspaceLease = lease;
        }
      }
      if (!engineApi && lease) {
        try {
          lease.release();
        } catch (releaseError) {
          // No EngineAPI exists and therefore no PTY can exist. The exclusive
          // lock is conservative metadata that stale-lock recovery can handle.
        }
      }
      throw error;
    } finally {
      this.#opening = false;
    }
  }

  shutdown(timeoutMs) {
    if (this.#shutdownPromise) return this.#shutdownPromise;
    if (!this.#engineApi) return Promise.resolve({ ok: true });

    const engineApi = this.#engineApi;
    const lease = this.#workspaceLease;
    this.#shutdownPromise = (async () => {
      const stopped = await engineApi.stopAll(timeoutMs);
      if (!stopped.ok) {
        this.#shutdownPromise = null;
        return stopped;
      }

      try {
        lease?.release();
      } catch (error) {
        // PTYs are stopped but ownership is still recorded. Keep the host
        // reachable so close can be retried instead of abandoning a lock.
        this.#shutdownPromise = null;
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          pendingIds: []
        };
      }

      engineApi.dispose();
      this.#engineApi = null;
      this.#workspaceLease = null;
      this.#shutdownPromise = null;
      return { ok: true };
    })();
    return this.#shutdownPromise;
  }
}

module.exports = { EngineHost, defaultShell };
