#!/usr/bin/env node

import fs from "node:fs";
import React from "react";
import { render } from "ink";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json");
const { parseCliArgs, usage } = require("../src/cli/options.cjs");
const { EngineAPI } = require("../src/engine/index.cjs");
const { validateWorkspaceFile } = require("../src/engine/workspaceConfig.cjs");
const { acquireWorkspaceLease } = require("../src/engine/workspaceLease.cjs");
const { attachFull } = require("../src/tui/attachFull.cjs");
const { unmountInk } = require("../src/tui/unmountInk.cjs");
const App = (await import("../src/tui/App.js")).default;

function writeError(message) {
  process.stderr.write(`[termctl] ${message}\n`);
}

let cli;
try {
  cli = parseCliArgs(process.argv.slice(2));
} catch (err) {
  writeError(err.message);
  process.stderr.write(usage(packageJson.version));
  process.exitCode = 2;
}

if (cli?.help) {
  process.stdout.write(usage(packageJson.version));
} else if (cli?.version) {
  process.stdout.write(`${packageJson.version}\n`);
} else if (cli?.check) {
  try {
    const report = validateWorkspaceFile(cli.configPath);
    if (report.errors.length || report.commandErrors.length) {
      if (report.errors.length) writeError(`${report.errors.length} invalid session definition${report.errors.length === 1 ? "" : "s"}:`);
      for (const error of report.errors) {
        writeError(`  ${error.id || "<unknown>"}: ${error.error}`);
      }
      if (report.commandErrors.length) writeError(`${report.commandErrors.length} invalid saved command definition${report.commandErrors.length === 1 ? "" : "s"}:`);
      for (const error of report.commandErrors) {
        writeError(`  ${error.id || "<unknown>"}: ${error.error}`);
      }
      process.exitCode = 1;
    } else {
      process.stdout.write(
        `Workspace OK: ${report.workspace.name} (${report.validSessionCount} session${report.validSessionCount === 1 ? "" : "s"}) · ${report.validCommandCount} saved command${report.validCommandCount === 1 ? "" : "s"}\n`
      );
    }
  } catch (err) {
    writeError(err.message);
    process.exitCode = 1;
  }
} else if (cli) {
  await runMissionControl(cli);
}

async function runMissionControl(options) {
  const engineApi = new EngineAPI();
  // Ink and node-pty can both temporarily release their referenced handles
  // while Full Attach swaps terminal ownership. Keep the CLI alive for its
  // explicit lifecycle instead of relying on those implementation details.
  const lifecycleHold = setInterval(() => {}, 0x7fffffff);
  const fallbackShell = process.platform === "win32"
    ? { command: "powershell.exe", args: ["-NoLogo"], powershellCompatibility: true }
    : { command: process.env.SHELL || "sh", args: [] };

  let app = null;
  let attaching = false;
  let shuttingDown = false;
  let attachAbortController = null;
  let workspaceLease = null;

  function loadInitialProject() {
    if (fs.existsSync(options.configPath)) {
      // Parse the root before acquiring the lease so malformed files never
      // leave lock artifacts or silently launch a fallback process.
      validateWorkspaceFile(options.configPath);
      workspaceLease = acquireWorkspaceLease(options.configPath);
      engineApi.loadProject(options.configPath);
      return;
    }

    if (options.configExplicit) {
      throw new Error(`workspace file does not exist: ${options.configPath}`);
    }

    engineApi.loadProject({
      sessions: [
        {
          id: "shell",
          name: "Shell",
          command: fallbackShell.command,
          args: fallbackShell.args,
          powershellCompatibility: fallbackShell.powershellCompatibility,
          cwd: process.cwd()
        }
      ]
    });
  }

  function mount() {
    if (shuttingDown) return;
    // A child ConPTY must not leave Windows Terminal's Win32-input mode active
    // when control returns to Ink.
    process.stdout.write("\x1b[?9001l\x1b[?1004l");
    app = render(
      React.createElement(App, {
        engineApi,
        requestFullAttach,
        onQuit: () => { void shutdown(0); }
      }),
      { exitOnCtrlC: false }
    );
  }

  async function requestFullAttach(sessionId) {
    if (attaching || shuttingDown) return;
    attaching = true;
    attachAbortController = new AbortController();

    const mountedApp = app;
    app = null;

    try {
      // Keep unmount and attach in the same turn. Ink unrefs stdin while
      // unmounting, and yielding here can let Node exit before attachFull()
      // has a chance to reclaim terminal input on Windows.
      unmountInk(mountedApp);
      const result = await attachFull(engineApi, sessionId, { signal: attachAbortController.signal });
      if (!result.attached) {
        writeError(`full attach rejected: ${result.reason}`);
      } else if (result.reason === "attach-error") {
        writeError(`full attach setup failed: ${result.error || "unknown error"}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      writeError(`full attach failed: ${message}`);
    } finally {
      attachAbortController = null;
      attaching = false;
      mount();
    }
  }

  async function shutdown(exitCode) {
    if (shuttingDown) return;
    shuttingDown = true;
    attachAbortController?.abort();
    const mountedApp = app;
    app = null;
    unmountInk(mountedApp);

    const stopped = await engineApi.stopAll();
    if (!stopped.ok) {
      writeError(
        `shutdown paused because ${stopped.pendingIds.length} PTY${stopped.pendingIds.length === 1 ? "" : "s"} did not exit: ${stopped.pendingIds.join(", ")}`
      );
      shuttingDown = false;
      mount();
      return;
    }

    engineApi.dispose();
    try {
      workspaceLease?.release();
    } catch (err) {
      writeError(err.message);
      exitCode = exitCode || 1;
    }
    workspaceLease = null;
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
    clearInterval(lifecycleHold);
    process.exitCode = exitCode;
  }

  function onSigint() {
    void shutdown(130);
  }

  function onSigterm() {
    void shutdown(143);
  }

  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  try {
    loadInitialProject();
    mount();
  } catch (err) {
    writeError(err.message);
    await shutdown(1);
  }
}
