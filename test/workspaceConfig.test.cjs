const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { EngineAPI } = require("../src/engine/index.cjs");
const {
  WorkspaceConfigError,
  normalizeSavedCommandDefinition,
  normalizeSessionDefinition,
  openWorkspace,
  validateWorkspaceFile
} = require("../src/engine/workspaceConfig.cjs");
const { makeFakePtyFactory } = require("./fakePty.cjs");

function makeWorkspace(t, contents = { project: "test", sessions: [] }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-workspace-"));
  const filePath = path.join(directory, "termctl.config.json");
  fs.writeFileSync(filePath, `${JSON.stringify(contents, null, 2)}\n`);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, filePath };
}

test("session definitions validate ids, args, environment, and relative cwd", () => {
  const normalized = normalizeSessionDefinition({
    id: "web.dev",
    name: "Web dev",
    command: "npm run dev",
    cwd: "./web",
    env: { PORT: "3000" }
  }, { baseDir: path.join(os.tmpdir(), "project") });

  assert.equal(normalized.runtime.cwd, path.join(os.tmpdir(), "project", "web"));
  assert.deepEqual(normalized.runtime.env, { PORT: "3000" });
  assert.throws(
    () => normalizeSessionDefinition({ id: "bad id", command: "node" }),
    WorkspaceConfigError
  );
  assert.throws(
    () => normalizeSessionDefinition({ id: "ok", command: "node", env: { PORT: 3000 } }),
    /values must be strings/
  );
  assert.throws(
    () => normalizeSessionDefinition({ id: "ok", command: { executable: "node" } }),
    /command must be a string/
  );
  assert.throws(
    () => normalizeSessionDefinition({ id: "ok", command: "pwsh", powershellCompatibility: "yes" }),
    /must be a boolean/
  );
  assert.throws(
    () => normalizeSessionDefinition({
      id: "pwsh",
      command: "powershell.exe -NoLogo",
      powershellCompatibility: true
    }),
    /args array/
  );
  const compatibility = normalizeSessionDefinition({
    id: "pwsh",
    command: "pwsh.exe",
    powershellCompatibility: true
  });
  assert.equal(compatibility.runtime.powershellCompatibility, true);
  assert.equal(compatibility.persisted.powershellCompatibility, true);
  const manual = normalizeSessionDefinition({ id: "manual", command: "node", autoStart: false });
  assert.equal(manual.runtime.autoStart, false);
  assert.equal(manual.persisted.autoStart, false);
  assert.equal(normalizeSessionDefinition({ id: "automatic", command: "node" }).runtime.autoStart, true);
  assert.throws(
    () => normalizeSessionDefinition({ id: "bad-startup", command: "node", autoStart: "later" }),
    /autoStart must be a boolean/
  );
});

test("saved command definitions are inert by default and validate independently", t => {
  const { filePath } = makeWorkspace(t, {
    sessions: [],
    commands: [
      { id: "tests", name: "Run tests", command: "npm test", cwd: ".", env: { TOKEN: "secret" } },
      { id: "bad id", command: "node" },
      { id: "tests", command: "npm run test:unit" }
    ]
  });
  const normalized = normalizeSavedCommandDefinition({ id: "lint", command: "npm run lint" });

  assert.equal(normalized.runtime.autoStart, false);
  assert.equal(normalized.persisted.autoStart, false);
  assert.deepEqual(openWorkspace(filePath).commandDefinitions().map(command => command.id), [
    "tests", "bad id", "tests"
  ]);

  const report = validateWorkspaceFile(filePath);
  assert.equal(report.commandCount, 3);
  assert.equal(report.validCommandCount, 1);
  assert.equal(report.commandErrors.length, 2);
  assert.match(report.commandErrors[0].error, /session id/);
  assert.match(report.commandErrors[1].error, /already in use/);
});

test("workspace writes are durable and preserve unrelated configuration", t => {
  const { filePath } = makeWorkspace(t, {
    project: { name: "Control Room", accent: "cyan" },
    customSetting: true,
    sessions: [{ id: "a", name: "Alpha", command: "node", cwd: "." }]
  });
  const workspace = openWorkspace(filePath);

  assert.equal(workspace.info().name, "Control Room");
  workspace.rename("a", "Renamed");
  workspace.setAutoStart("a", false);
  workspace.replace("a", { id: "a", name: "Reconfigured", command: "node api.js", cwd: "./api" });
  workspace.upsert({ id: "b", name: "Beta", command: "npm test", cwd: "." });
  workspace.remove("a");

  const saved = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.equal(saved.version, 1);
  assert.equal(saved.customSetting, true);
  assert.equal(saved.project.accent, "cyan");
  assert.deepEqual(saved.sessions.map(session => session.id), ["b"]);
});

test("shared recipes persist and engine runs dependency steps with pause policies", async t => {
  const { filePath } = makeWorkspace(t, {
    project: "recipe project",
    sessions: [
      { id: "api", command: "x", cwd: ".", autoStart: false },
      { id: "web", command: "x", cwd: ".", autoStart: false }
    ]
  });
  const factory = makeFakePtyFactory();
  const api = new EngineAPI({ ptyFactory: factory, activityPersistDelayMs: 0 });
  t.after(() => api.dispose());
  api.loadProject(filePath);
  const saved = api.saveRecipe({
    id: "daily",
    name: "Daily stack",
    steps: [
      { workerId: "api", dependsOn: [], readiness: "running" },
      { workerId: "web", dependsOn: ["api"], readiness: "running" }
    ],
    layoutId: "horizontal",
    sessionIds: ["api", "web"],
    failurePolicy: "stop"
  });
  assert.equal(saved.ok, true);
  assert.equal(openWorkspace(filePath).recipeDefinitions()[0].id, "daily");
  assert.equal(api.runRecipe("daily").ok, true);

  const deadline = Date.now() + 1000;
  while (api.listRecipes()[0].run?.phase === "running" && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  const recipe = api.listRecipes()[0];
  assert.equal(recipe.run.phase, "completed");
  assert.deepEqual(recipe.run.completed, ["api", "web"]);
  assert.equal(factory.instances.length, 2);
  assert.equal(api.getActivity().events.some(event => event.type === "recipe:step" && event.phase === "ready"), true);
});

test("durable agent missions supervise evidence checkpoints and one-time approvals", t => {
  const { filePath } = makeWorkspace(t, { project: "missions", sessions: [{ id: "agent-codex-demo", name: "Codex agent", command: "x", cwd: "." }, { id: "tests", name: "Tests", command: "x", cwd: ".", autoStart: false }] });
  const factory = makeFakePtyFactory();
  const api = new EngineAPI({ ptyFactory: factory, activityPersistDelayMs: 0 });
  t.after(() => api.dispose());
  api.loadProject(filePath);
  const saved = api.saveMission({ agentId: "agent-codex-demo", title: "Verify the release", scopes: ["read", "execute"], relatedWorkerIds: ["tests"], checkpoints: [{ id: "tests-pass", title: "Tests pass", verification: "tests" }, { id: "changes", title: "Changes recorded", verification: "changes" }] });
  assert.equal(saved.ok, true);
  assert.equal(saved.mission.progress.statement.includes("percentage"), false);
  assert.equal(api.recordMissionInstruction("agent-codex-demo", { instructionLength: 18, requestedScopes: ["execute"] }).ok, true);
  assert.match(api.recordMissionInstruction("agent-codex-demo", { instructionLength: 8, requestedScopes: ["write"] }).error, /does not allow/);
  const requested = api.requestMissionApproval("agent-codex-demo", { scopes: ["write"], reason: "Update the release manifest", impact: "One bounded write instruction" });
  assert.equal(requested.approval.state, "pending");
  assert.match(api.requestMissionApproval("agent-codex-demo", { scopes: ["read"] }).error, /already granted/);
  assert.match(api.requestMissionApproval("agent-codex-demo", { scopes: ["write"] }).error, /already pending/);
  assert.equal(api.listMissionApprovals().filter(item => item.state === "pending").length, 1);
  const approved = api.resolveMissionApproval(saved.mission.id, requested.approval.id, "approve");
  assert.equal(approved.approval.state, "approved");
  assert.equal(api.recordMissionInstruction("agent-codex-demo", { instructionLength: 8, requestedScopes: ["write"], approvalId: requested.approval.id }).ok, true);
  assert.match(api.recordMissionInstruction("agent-codex-demo", { instructionLength: 8, requestedScopes: ["write"], approvalId: requested.approval.id }).error, /one-time approval/);
  factory.last().emitData("24 passed, 0 failed\n## main\n M src/app.js\n");
  const mission = api.listMissions()[0];
  assert.equal(mission.evidence.some(item => item.type === "command"), true);
  assert.equal(mission.evidence.some(item => item.type === "test"), true);
  assert.equal(mission.evidence.some(item => item.type === "diff" && item.file.changedPaths === 1), true);
  assert.equal(mission.progress.verified, 2);
  assert.equal(mission.progress.total, 2);
  assert.equal(mission.currentAction.source, "engine-evidence");
  assert.deepEqual(mission.relatedWorkerIds, ["tests"]);
  assert.equal(mission.approvals[0].state, "consumed");
  assert.equal(mission.lifecycle.some(item => item.phase === "waiting"), true);
  assert.equal(openWorkspace(filePath).missionDefinitions()[0].title, "Verify the release");
  assert.equal(JSON.stringify(mission).includes("src/app.js"), false);
});

test("startup policy is persisted as an opt-out and restores without spawning", async t => {
  const { filePath } = makeWorkspace(t, {
    sessions: [{ id: "a", name: "Alpha", command: "node", cwd: ".", autoStart: false }]
  });
  const factory = makeFakePtyFactory();
  const api = new EngineAPI({ ptyFactory: factory });
  t.after(() => api.dispose());

  api.loadProject(filePath);
  assert.equal(api.getSnapshot("a").status, "idle");
  assert.equal(factory.instances.length, 0);

  assert.deepEqual(await api.setAutoStart("a", true), { ok: true });
  let saved = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.equal("autoStart" in saved.sessions[0], false);
  assert.equal(factory.instances.length, 0, "changing restore policy must not launch a PTY");

  assert.deepEqual(await api.setAutoStart("a", false), { ok: true });
  saved = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.equal(saved.sessions[0].autoStart, false);
});

test("failed workspace writes do not mutate the in-memory configuration", t => {
  const { filePath } = makeWorkspace(t, {
    sessions: [{ id: "a", name: "Alpha", command: "node", cwd: "." }]
  });
  const workspace = openWorkspace(filePath);
  workspace._writeRaw = () => {
    throw new WorkspaceConfigError("unable to save workspace: disk full");
  };

  assert.throws(() => workspace.rename("a", "Changed"), /disk full/);
  assert.throws(() => workspace.setAutoStart("a", false), /disk full/);
  assert.throws(
    () => workspace.replace("a", { id: "a", name: "Changed", command: "new", cwd: "." }),
    /disk full/
  );
  assert.throws(
    () => workspace.upsert({ id: "b", name: "Beta", command: "node", cwd: "." }),
    /disk full/
  );
  assert.throws(() => workspace.remove("a"), /disk full/);
  assert.deepEqual(workspace.definitions(), [
    { id: "a", name: "Alpha", command: "node", cwd: "." }
  ]);
});

test("invalid workspace roots and versions fail with actionable errors", t => {
  const invalidJson = makeWorkspace(t);
  fs.writeFileSync(invalidJson.filePath, "{broken");
  assert.throws(() => openWorkspace(invalidJson.filePath), /invalid JSON/);

  const future = makeWorkspace(t, { version: 99, sessions: [] });
  assert.throws(() => openWorkspace(future.filePath), /unsupported workspace version/);
});

test("EngineAPI persists create, rename, and safe remove without duplicate PTYs", async t => {
  const { filePath } = makeWorkspace(t, {
    project: "Persistent project",
    sessions: [{ id: "a", name: "Alpha", command: "node", cwd: "." }]
  });
  const factory = makeFakePtyFactory({ autoExitOnKill: true });
  const api = new EngineAPI({ ptyFactory: factory });
  t.after(() => api.dispose());

  assert.deepEqual(api.loadProject(filePath), []);
  assert.equal(api.getWorkspace().name, "Persistent project");
  const created = api.create({ id: "b", name: "Beta", command: "npm test", cwd: "." });
  assert.equal(created.ok, true);
  assert.equal(factory.instances.length, 2);
  assert.deepEqual(api.rename("b", "Tests"), { ok: true });
  assert.deepEqual(await api.remove("a"), { ok: true });

  const saved = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.deepEqual(saved.sessions.map(session => session.id), ["b"]);
  assert.equal(saved.sessions[0].name, "Tests");
  assert.equal(factory.instances.length, 2, "workspace actions must not spawn duplicate PTYs");
});

test("saved commands instantiate transactionally without exposing environment values", t => {
  const { filePath } = makeWorkspace(t, {
    sessions: [],
    commands: [{
      id: "tests",
      name: "Run tests",
      command: "npm",
      args: ["test"],
      cwd: ".",
      env: { TEST_TOKEN: "do-not-expose" }
    }]
  });
  const factory = makeFakePtyFactory();
  const api = new EngineAPI({ ptyFactory: factory, activityPersistDelayMs: 0 });
  t.after(() => api.dispose());
  api.loadProject(filePath);

  const publicCommands = api.listSavedCommands();
  assert.deepEqual(publicCommands.map(command => ({
    id: command.id,
    autoStart: command.autoStart,
    available: command.available,
    envKeys: command.envKeys
  })), [{ id: "tests", autoStart: false, available: true, envKeys: ["TEST_TOKEN"] }]);
  assert.equal(JSON.stringify(api.getState()).includes("do-not-expose"), false);

  const result = api.createFromSavedCommand("tests");
  assert.equal(result.ok, true);
  assert.equal(result.commandId, "tests");
  assert.equal(result.session.status, "idle");
  assert.equal(factory.instances.length, 0, "manual presets must not spawn during instantiation");
  assert.equal(api.listSavedCommands()[0].available, false);
  assert.match(api.createFromSavedCommand("tests").error, /already in use/);

  const saved = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.deepEqual(saved.commands[0].env, { TEST_TOKEN: "do-not-expose" });
  assert.equal(saved.sessions[0].autoStart, false);
  assert.deepEqual(saved.sessions[0].env, { TEST_TOKEN: "do-not-expose" });
  assert.equal(JSON.stringify(api.getActivity()).includes("do-not-expose"), false);
});

test("saved command persistence failure creates no worker or PTY", t => {
  const { filePath } = makeWorkspace(t, {
    sessions: [],
    commands: [{ id: "build", command: "npm run build", autoStart: true }]
  });
  const workspace = openWorkspace(filePath);
  const factory = makeFakePtyFactory();
  const api = new EngineAPI({ ptyFactory: factory, openWorkspace: () => workspace });
  t.after(() => api.dispose());
  api.loadProject(filePath);
  workspace._writeRaw = () => {
    throw new WorkspaceConfigError("unable to save workspace: disk full");
  };

  const result = api.createFromSavedCommand("build");
  assert.equal(result.ok, false);
  assert.match(result.error, /disk full/);
  assert.equal(api.getSnapshot("build"), null);
  assert.equal(factory.instances.length, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, "utf8")).sessions, []);
});

test("EngineAPI reconfigures a stopped worker transactionally and redacts environment values", async t => {
  const { filePath } = makeWorkspace(t, {
    sessions: [{
      id: "a",
      name: "API",
      command: "old",
      cwd: "./old",
      env: { OLD_TOKEN: "old-secret" },
      autoStart: false,
      customSetting: "preserved"
    }]
  });
  const factory = makeFakePtyFactory();
  const api = new EngineAPI({ ptyFactory: factory, activityPersistDelayMs: 0 });
  t.after(() => api.dispose());
  api.loadProject(filePath);

  const visible = api.getSessionConfiguration("a");
  assert.equal(visible.cwd, "./old");
  assert.deepEqual(visible.envKeys, ["OLD_TOKEN"]);
  assert.equal(JSON.stringify(visible).includes("old-secret"), false);

  const events = [];
  api.subscribe("all", event => events.push(event));
  const result = await api.reconfigure("a", {
    command: "node",
    args: ["server.js"],
    cwd: "./api",
    env: { API_TOKEN: "new-secret" }
  });

  assert.equal(result.ok, true);
  assert.equal(factory.instances.length, 0);
  assert.equal(api.getSnapshot("a").status, "idle");
  assert.equal(api.getSnapshot("a").cwd, path.join(path.dirname(filePath), "api"));
  assert.equal(JSON.stringify(result).includes("new-secret"), false);
  assert.equal(JSON.stringify(events).includes("new-secret"), false);
  assert.ok(events.some(event => event.type === "session:reconfigured"));

  const saved = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.equal(saved.sessions[0].customSetting, "preserved");
  assert.equal(saved.sessions[0].command, "node");
  assert.deepEqual(saved.sessions[0].args, ["server.js"]);
  assert.deepEqual(saved.sessions[0].env, { API_TOKEN: "new-secret" });

  assert.deepEqual(await api.start("a"), { ok: true });
  assert.equal(factory.last()._spawnArgs.shell, "node");
  assert.deepEqual(factory.last()._spawnArgs.args, ["server.js"]);
  assert.equal(factory.last()._spawnArgs.opts.env.API_TOKEN, "new-secret");
});

test("failed reconfiguration saves leave runtime and workspace definitions unchanged", async t => {
  const { filePath } = makeWorkspace(t, {
    sessions: [{ id: "a", name: "API", command: "old", cwd: ".", autoStart: false }]
  });
  const workspace = openWorkspace(filePath);
  const factory = makeFakePtyFactory();
  const api = new EngineAPI({ ptyFactory: factory, openWorkspace: () => workspace });
  t.after(() => api.dispose());
  api.loadProject(filePath);
  workspace._writeRaw = () => {
    throw new WorkspaceConfigError("unable to save workspace: disk full");
  };

  const result = await api.reconfigure("a", { command: "new" });
  assert.equal(result.ok, false);
  assert.match(result.error, /disk full/);
  assert.equal(api.getSnapshot("a").command, "old");
  assert.equal(factory.instances.length, 0);
  assert.equal(JSON.parse(fs.readFileSync(filePath, "utf8")).sessions[0].command, "old");
});

test("EngineAPI fails workspace mutations without splitting persisted and runtime state", async t => {
  const { filePath } = makeWorkspace(t, {
    sessions: [{ id: "a", name: "Alpha", command: "node", cwd: "." }]
  });
  const workspace = openWorkspace(filePath);
  const factory = makeFakePtyFactory({ autoExitOnKill: true });
  const api = new EngineAPI({ ptyFactory: factory, openWorkspace: () => workspace });
  t.after(() => api.dispose());
  api.loadProject(filePath);

  workspace._writeRaw = () => {
    throw new WorkspaceConfigError("unable to save workspace: disk full");
  };

  const created = api.create({ id: "b", name: "Beta", command: "node", cwd: "." });
  assert.equal(created.ok, false);
  assert.match(created.error, /disk full/);
  assert.equal(api.getSnapshot("b"), null);
  assert.equal(factory.instances.length, 1, "a failed save must happen before PTY creation");

  const renamed = api.rename("a", "Changed");
  assert.equal(renamed.ok, false);
  assert.equal(api.getSnapshot("a").name, "Alpha");

  const startup = await api.setAutoStart("a", false);
  assert.equal(startup.ok, false);
  assert.match(startup.error, /disk full/);
  assert.equal(api.getSnapshot("a").autoStart, true);

  const removed = await api.remove("a");
  assert.deepEqual(removed, {
    ok: false,
    error: "unable to save workspace: disk full",
    sessionStopped: true
  });
  assert.equal(api.getSnapshot("a").status, "exited");
  assert.equal(factory.instances.length, 1);

  const saved = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.deepEqual(saved.sessions, [{ id: "a", name: "Alpha", command: "node", cwd: "." }]);
  assert.deepEqual(workspace.definitions(), saved.sessions);
});

test("restart and persistent removal serialize without orphaning a replacement PTY", async t => {
  const { filePath } = makeWorkspace(t, {
    sessions: [{ id: "a", name: "Alpha", command: "node", cwd: "." }]
  });
  const factory = makeFakePtyFactory({ autoExitOnKill: true });
  const api = new EngineAPI({ ptyFactory: factory });
  t.after(() => api.dispose());
  api.loadProject(filePath);

  const restarting = api.restart("a");
  const removing = api.remove("a");
  assert.deepEqual(await restarting, { ok: true });
  assert.deepEqual(await removing, { ok: true });

  assert.equal(api.getSnapshot("a"), null);
  assert.equal(factory.instances.length, 2);
  assert.equal(factory.instances.every(instance => instance.killed), true);
  const saved = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.deepEqual(saved.sessions, []);
});

test("an invalid session does not block valid workspace sessions", t => {
  const { filePath } = makeWorkspace(t, {
    sessions: [
      { id: "bad id", command: "node" },
      { id: "valid", name: "Valid", command: "node", cwd: "." }
    ]
  });
  const factory = makeFakePtyFactory();
  const api = new EngineAPI({ ptyFactory: factory });
  t.after(() => api.dispose());

  const errors = api.loadProject(filePath);
  assert.equal(errors.length, 1);
  assert.deepEqual(api.list().map(session => session.id), ["valid"]);
  assert.equal(factory.instances.length, 1);
});
