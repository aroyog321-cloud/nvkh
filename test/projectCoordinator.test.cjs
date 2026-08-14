const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const {
  ProjectCoordinator,
  ProjectCoordinatorError
} = require("../src/service/projectCoordinator.cjs");
const { ProjectRegistry } = require("../src/service/projectRegistry.cjs");

function makeDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-projects-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function writeWorkspace(directory, name = path.basename(directory), extra = {}) {
  const configPath = path.join(directory, "termctl.config.json");
  fs.writeFileSync(configPath, `${JSON.stringify({
    version: 1,
    project: { name },
    sessions: [],
    ...extra
  }, null, 2)}\n`);
  return configPath;
}

function fakeHost(initialWorkspace = null, switchResult = null) {
  const calls = [];
  let workspace = initialWorkspace || {
    name: "Unsaved workspace",
    path: null,
    directory: process.cwd(),
    persistent: false
  };
  const engineApi = { getWorkspace: () => ({ ...workspace }) };
  return {
    calls,
    get engineApi() { return engineApi; },
    async switchTo(options) {
      calls.push(options);
      if (switchResult) return switchResult;
      const raw = JSON.parse(fs.readFileSync(options.configPath, "utf8"));
      workspace = {
        name: raw.project?.name || path.basename(path.dirname(options.configPath)),
        path: options.configPath,
        directory: path.dirname(options.configPath),
        persistent: true
      };
      return { ok: true, changed: true };
    }
  };
}

test("last healthy project restores only when no explicit or local workspace wins", t => {
  const storage = makeDirectory(t);
  const project = makeDirectory(t);
  const configPath = writeWorkspace(project, "Restored project");
  const registry = new ProjectRegistry(path.join(storage, "projects.json"));
  registry.remember({ name: "Restored project", rootPath: project, configPath }, 10);
  const coordinator = new ProjectCoordinator({ engineHost: fakeHost(), registry });

  const fallback = path.join(storage, "termctl.config.json");
  assert.deepEqual(coordinator.resolveStartupOptions({
    configPath: fallback,
    configExplicit: false
  }), {
    configPath,
    configExplicit: true,
    cwd: project,
    restoredProject: true
  });
  assert.equal(coordinator.resolveStartupOptions({
    configPath: fallback,
    configExplicit: true
  }).configPath, fallback);
});

test("native selections use opaque tokens and initialize a portable workspace without overwrite", async t => {
  const storage = makeDirectory(t);
  const project = makeDirectory(t);
  const host = fakeHost();
  const registry = new ProjectRegistry(path.join(storage, "projects.json"));
  const coordinator = new ProjectCoordinator({
    engineHost: host,
    registry,
    chooseDirectory: async () => project,
    platform: "win32",
    env: {}
  });

  const chosen = await coordinator.choose();
  assert.equal(chosen.cancelled, false);
  assert.equal(chosen.project.status, "uninitialized");
  assert.equal(typeof chosen.selectionToken, "string");
  await assert.rejects(
    coordinator.open({ configPath: path.join(project, "termctl.config.json") }),
    error => error instanceof ProjectCoordinatorError && error.code === "INVALID_PROJECT"
  );

  const opened = await coordinator.initialize({
    selectionToken: chosen.selectionToken,
    name: "Windows project"
  });
  assert.equal(opened.workspace.name, "Windows project");
  assert.equal(host.calls.length, 1);
  const raw = JSON.parse(fs.readFileSync(path.join(project, "termctl.config.json"), "utf8"));
  assert.equal(raw.sessions[0].command, "powershell.exe");
  assert.deepEqual(raw.sessions[0].args, ["-NoLogo"]);
  assert.equal(raw.sessions[0].powershellCompatibility, true);
  assert.equal(coordinator.list().projects[0].current, true);

  await assert.rejects(
    coordinator.initialize({ selectionToken: chosen.selectionToken, name: "Overwrite" }),
    /selection expired/
  );
});

test("recent projects surface missing, invalid, and warning states without opening them", t => {
  const storage = makeDirectory(t);
  const ready = makeDirectory(t);
  const invalid = makeDirectory(t);
  const warning = makeDirectory(t);
  const missing = path.join(storage, "moved-away");
  const readyConfig = writeWorkspace(ready, "Ready");
  const invalidConfig = path.join(invalid, "termctl.config.json");
  fs.writeFileSync(invalidConfig, "{broken");
  const warningConfig = writeWorkspace(warning, "Warnings", {
    sessions: [{ id: "bad id", command: "node" }]
  });
  const registry = new ProjectRegistry(path.join(storage, "projects.json"));
  registry.remember({ name: "Ready", rootPath: ready, configPath: readyConfig }, 1);
  registry.remember({ name: "Invalid", rootPath: invalid, configPath: invalidConfig }, 2);
  registry.remember({ name: "Warnings", rootPath: warning, configPath: warningConfig }, 3);
  registry.remember({
    name: "Missing",
    rootPath: missing,
    configPath: path.join(missing, "termctl.config.json")
  }, 4);
  const coordinator = new ProjectCoordinator({ engineHost: fakeHost(), registry });

  const statuses = Object.fromEntries(coordinator.list().projects.map(project => [project.name, project.status]));
  assert.deepEqual(statuses, {
    Missing: "missing",
    Warnings: "warning",
    Invalid: "invalid",
    Ready: "ready"
  });
});

test("a rejected engine switch does not change or remember the selected project", async t => {
  const storage = makeDirectory(t);
  const project = makeDirectory(t);
  const configPath = writeWorkspace(project, "Blocked");
  const registry = new ProjectRegistry(path.join(storage, "projects.json"));
  const host = fakeHost(null, { ok: false, error: "worker would not stop", pendingIds: ["api"] });
  const coordinator = new ProjectCoordinator({
    engineHost: host,
    registry,
    chooseDirectory: async () => project
  });
  const chosen = await coordinator.choose();

  await assert.rejects(
    coordinator.open({ selectionToken: chosen.selectionToken }),
    error => error instanceof ProjectCoordinatorError &&
      error.code === "PROJECT_SWITCH_FAILED" &&
      /worker would not stop/.test(error.message)
  );
  assert.deepEqual(registry.list(), []);
  assert.equal(fs.existsSync(configPath), true);
});
