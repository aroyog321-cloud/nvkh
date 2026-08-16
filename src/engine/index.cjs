const EventEmitter = require("node:events");
const { SessionEngine } = require("./sessionEngine.cjs");
const {
  normalizeSavedCommandDefinition,
  normalizeSessionDefinition,
  openWorkspace
} = require("./workspaceConfig.cjs");
const { openActivityStore } = require("./activityStore.cjs");

const ENGINE_CONTRACT_VERSION = 1;
const MAX_ACTIVITY_EVENTS = 200;
const ACTIVITY_PERSIST_DELAY_MS = 50;
const RECIPE_LIMIT = 20;

function normalizeRecipe(value, sessionIds) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("recipe must be an object");
  const id = String(value.id || "").trim();
  const name = String(value.name || "").trim();
  if (!id || !/^[A-Za-z0-9._-]{1,80}$/.test(id)) throw new TypeError("recipe id is invalid");
  if (!name || name.length > 60) throw new TypeError("recipe name is invalid");
  const suppliedSteps = Array.isArray(value.steps) ? value.steps : (value.workerIds || []).map((workerId, index, list) => ({ workerId, dependsOn: index ? [list[index - 1]] : [] }));
  if (!suppliedSteps.length || suppliedSteps.length > 50) throw new TypeError("recipe must contain 1 to 50 steps");
  const steps = suppliedSteps.map(step => {
    const workerId = String(step?.workerId || "");
    if (!sessionIds.has(workerId)) throw new TypeError(`recipe worker is missing: ${workerId}`);
    const dependsOn = Array.isArray(step.dependsOn) ? [...new Set(step.dependsOn.map(String))] : [];
    if (dependsOn.includes(workerId) || dependsOn.some(id => !sessionIds.has(id))) throw new TypeError(`recipe dependencies are invalid for: ${workerId}`);
    return { workerId, dependsOn, readiness: ["running", "service", "tests", "healthy"].includes(step.readiness) ? step.readiness : "running" };
  });
  const workerIds = steps.map(step => step.workerId);
  if (new Set(workerIds).size !== workerIds.length) throw new TypeError("recipe workers must be unique");
  for (const step of steps) if (step.dependsOn.some(id => !workerIds.includes(id))) throw new TypeError(`dependency is not part of recipe: ${step.workerId}`);
  return { id, name, steps, workerIds, layoutId: String(value.layoutId || "grid-2x2"), sessionIds: Array.isArray(value.sessionIds) ? value.sessionIds.slice(0, 6) : [], failurePolicy: value.failurePolicy === "continue" ? "continue" : "stop", readinessTimeoutMs: Number.isInteger(value.readinessTimeoutMs) ? Math.min(60000, Math.max(1000, value.readinessTimeoutMs)) : 10000, updatedAt: Date.now() };
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const ENGINE_EVENTS = Object.freeze([
  "session:created",
  "session:output",
  "session:status",
  "session:exit",
  "session:spawn-error",
  "session:supervision",
  "session:evidence",
  "session:renamed",
  "session:autostart",
  "session:reconfigured",
  "session:removed"
]);

class EngineAPI extends EventEmitter {
  #sessionEngine;
  #workspaceStore;
  #activityStore;
  #openWorkspace;
  #openActivityStore;
  #sessionOperations;
  #stopping;
  #stopPromise;
  #projectLoaded;
  #loadErrors;
  #savedCommands;
  #savedCommandErrors;
  #engineBindings;
  #eventSequence;
  #activityEvents;
  #activityLimit;
  #activityDroppedThrough;
  #publicationQueue;
  #publishing;
  #onSubscriberError;
  #activityPersistTimer;
  #activityPersistDelayMs;
  #activityDirty;
  #reportingActivityPersistError;
  #lastActivityPersistError;
  #recipes;
  #recipeRuns;
  #missions;
  #attentionRecords;
  #attentionPreferences;

  constructor(options = {}) {
    super();
    this.#sessionEngine = new SessionEngine(options);
    this.#workspaceStore = null;
    this.#activityStore = null;
    this.#openWorkspace = options.openWorkspace || openWorkspace;
    this.#openActivityStore = options.openActivityStore || openActivityStore;
    this.#sessionOperations = new Map();
    this.#stopping = false;
    this.#stopPromise = null;
    this.#projectLoaded = false;
    this.#loadErrors = [];
    this.#savedCommands = new Map();
    this.#savedCommandErrors = [];
    this.#engineBindings = [];
    this.#eventSequence = 0;
    this.#activityEvents = [];
    this.#activityLimit = Number.isInteger(options.maxActivityEvents) && options.maxActivityEvents > 0
      ? options.maxActivityEvents
      : MAX_ACTIVITY_EVENTS;
    this.#activityDroppedThrough = 0;
    this.#publicationQueue = [];
    this.#publishing = false;
    this.#onSubscriberError = typeof options.onSubscriberError === "function"
      ? options.onSubscriberError
      : () => {};
    this.#activityPersistTimer = null;
    this.#activityPersistDelayMs = Number.isInteger(options.activityPersistDelayMs) && options.activityPersistDelayMs >= 0
      ? options.activityPersistDelayMs
      : ACTIVITY_PERSIST_DELAY_MS;
    this.#activityDirty = false;
    this.#reportingActivityPersistError = false;
    this.#lastActivityPersistError = null;
    this.#recipes = new Map();
    this.#recipeRuns = new Map();
    this.#missions = new Map();
    this.#attentionRecords = new Map();
    this.#attentionPreferences = { minimumSeverity: "info", desktopNotifications: true, quietHours: { enabled: false, start: "22:00", end: "07:00" } };

    for (const type of ENGINE_EVENTS) {
      const listener = payload => {
        this.#publish(type, payload);
        if (type === "session:evidence") this.#captureMissionEvidence(payload);
      };
      this.#sessionEngine.on(type, listener);
      this.#engineBindings.push([type, listener]);
    }
  }

  loadProject(configOrPath) {
    if (this.#stopping) throw new Error("the engine is stopping");
    if (this.#projectLoaded || this.#sessionEngine.list().length > 0) {
      throw new Error("a workspace is already loaded; create a new EngineAPI to load another workspace");
    }
    let config = configOrPath;
    let baseDir = process.cwd();
    if (typeof configOrPath === "string") {
      this.#workspaceStore = this.#openWorkspace(configOrPath);
      this.#activityStore = this.#openActivityStore(this.#workspaceStore.filePath);
      try {
        const restored = this.#activityStore.load({
          contractVersion: ENGINE_CONTRACT_VERSION,
          maxEvents: this.#activityLimit
        });
        this.#eventSequence = restored.latestSequence;
        this.#activityEvents = restored.events;
        this.#activityDroppedThrough = restored.droppedThroughSequence;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        this.#publish("activity:load-error", { error });
      }
      config = {
        sessions: this.#workspaceStore.definitions(),
        commands: this.#workspaceStore.commandDefinitions()
      };
      baseDir = this.#workspaceStore.directory;
    }
    const sessionDefinitions = config?.sessions === undefined ? [] : config.sessions;
    const commandDefinitions = config?.commands === undefined ? [] : config.commands;
    if (!Array.isArray(sessionDefinitions)) throw new Error("workspace sessions must be an array");
    if (!Array.isArray(commandDefinitions)) throw new Error("workspace commands must be an array");
    this.#projectLoaded = true;

    for (const mission of this.#workspaceStore?.missionDefinitions?.() || []) {
      if (mission?.id && mission?.agentId && mission?.title) this.#missions.set(mission.id, mission);
    }
    for (const record of this.#workspaceStore?.attentionDefinitions?.() || []) {
      if (record?.id && record?.sessionId) this.#attentionRecords.set(record.id, record);
    }
    this.#attentionPreferences = { ...this.#attentionPreferences, ...(this.#workspaceStore?.attentionPreferences?.() || {}) };

    const recipeIds = new Set();
    for (const recipe of this.#workspaceStore?.recipeDefinitions?.() || []) {
      try {
        const normalized = normalizeRecipe(recipe, new Set(sessionDefinitions.map(item => item?.id).filter(Boolean)));
        if (recipeIds.has(normalized.id)) throw new Error(`recipe id already in use: ${normalized.id}`);
        recipeIds.add(normalized.id);
        this.#recipes.set(normalized.id, normalized);
      } catch (error) {
        this.#publish("project:recipe-error", { id: recipe?.id || null, error: error.message });
      }
    }

    const commandErrors = [];
    for (const def of commandDefinitions) {
      try {
        const normalized = normalizeSavedCommandDefinition(def, { baseDir });
        if (this.#savedCommands.has(normalized.runtime.id)) {
          throw new Error(`saved command id already in use: ${normalized.runtime.id}`);
        }
        this.#savedCommands.set(normalized.runtime.id, normalized);
      } catch (err) {
        commandErrors.push({
          id: def?.id || null,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    this.#savedCommandErrors = commandErrors.map(error => ({ ...error }));
    if (commandErrors.length) {
      this.#publish(
        "project:command-errors",
        { errors: commandErrors.map(error => ({ ...error })) },
        commandErrors.map(error => ({ ...error }))
      );
    }

    const errors = [];
    for (const def of sessionDefinitions) {
      try {
        const { runtime } = normalizeSessionDefinition(def, { baseDir });
        this.#sessionEngine.create(runtime);
      } catch (err) {
        errors.push({
          id: def?.id || null,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    this.#loadErrors = errors;
    if (errors.length) {
      this.#publish(
        "project:load-errors",
        { errors: errors.map(error => ({ ...error })) },
        errors
      );
    }
    return errors;
  }

  getWorkspace() {
    if (this.#workspaceStore) {
      return {
        ...this.#workspaceStore.info(),
        loadErrorCount: this.#loadErrors.length + this.#savedCommandErrors.length,
        sessionLoadErrorCount: this.#loadErrors.length,
        savedCommandCount: this.#savedCommands.size,
        savedCommandErrorCount: this.#savedCommandErrors.length,
        activityPersistent: Boolean(this.#activityStore)
      };
    }
    return {
      version: 1,
      name: "Unsaved workspace",
      path: null,
      directory: process.cwd(),
      persistent: false,
      activityPersistent: false,
      loadErrorCount: this.#loadErrors.length + this.#savedCommandErrors.length,
      sessionLoadErrorCount: this.#loadErrors.length,
      savedCommandCount: this.#savedCommands.size,
      savedCommandErrorCount: this.#savedCommandErrors.length
    };
  }

  listIntegrations() {
    const workspace = this.getWorkspace();
    return [
      { id: "vscode", name: "VS Code Bridge", status: "available", capability: "Open the active project and focus worker-owned files", permission: "Local editor launch", projectRequired: true, enabled: false },
      { id: "assistant", name: "Assistant Gateway", status: "foundation", capability: "Expose bounded project context through an MCP-style contract", permission: "Read-only by default; every mutation requires approval", projectRequired: true, enabled: false },
      { id: "plugins", name: "Plugin Runtime", status: "planned", capability: "Install signed, permission-scoped worker integrations", permission: "Manifest allow-list and isolated process", projectRequired: false, enabled: false },
      { id: "mobile", name: "Mobile Companion", status: "planned", capability: "Review alerts and approve bounded actions away from the workstation", permission: "Pairing code and revocable device trust", projectRequired: true, enabled: false }
    ].map(item => ({ ...item, blockedReason: item.projectRequired && !workspace.persistent ? "Open a project folder first" : null }));
  }

  listRecipes() {
    return [...this.#recipes.values()].map(recipe => ({ ...recipe, steps: recipe.steps.map(step => ({ ...step, dependsOn: [...step.dependsOn] })), run: this.#recipeRuns.has(recipe.id) ? { ...this.#recipeRuns.get(recipe.id), completed: [...this.#recipeRuns.get(recipe.id).completed] } : null }));
  }

  listMissions() {
    return [...this.#missions.values()].map(mission => JSON.parse(JSON.stringify(mission)));
  }

  listAttention() {
    const now = Date.now();
    const activeSessionIds = new Set();
    for (const session of this.#sessionEngine.list()) {
      const snapshot = this.getSnapshot(session.id);
      if (!snapshot || (!snapshot.attentionRequired && snapshot.status !== "failed")) continue;
      activeSessionIds.add(snapshot.id);
      let record = [...this.#attentionRecords.values()].find(item => item.sessionId === snapshot.id && item.state !== "recovered");
      if (!record) {
        const reason = snapshot.attentionReason || (snapshot.status === "failed" ? "Worker failed" : "Operator decision required");
        const groupKey = `${snapshot.status === "failed" ? "failure" : snapshot.id.startsWith("agent-") ? "agent" : "attention"}:${String(reason).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").slice(0, 4).join("-")}`;
        record = { id: `attention-${snapshot.id}-${now}`, sessionId: snapshot.id, sessionName: snapshot.name, state: "new", severity: snapshot.status === "failed" ? "critical" : snapshot.id.startsWith("agent-") ? "warning" : "info", groupKey, reason, createdAt: snapshot.attentionSince || now, updatedAt: now, snoozedUntil: null, history: [{ state: "new", at: now }] };
        this.#attentionRecords.set(record.id, record);
        try { this.#workspaceStore?.upsertAttention(record); } catch { /* Live attention remains available if persistence fails. */ }
      }
    }
    for (const record of this.#attentionRecords.values()) {
      if (record.state !== "recovered" && !activeSessionIds.has(record.sessionId)) {
        record.state = "recovered"; record.updatedAt = now; record.recoveredAt = now;
        record.history = [...(record.history || []), { state: "recovered", at: now }].slice(-20);
        try { this.#workspaceStore?.upsertAttention(record); } catch { /* Best effort persistence. */ }
      }
    }
    return { records: [...this.#attentionRecords.values()].sort((a, b) => b.updatedAt - a.updatedAt).map(item => JSON.parse(JSON.stringify(item))), preferences: JSON.parse(JSON.stringify(this.#attentionPreferences)) };
  }

  transitionAttention(id, state, options = {}) {
    if (!this.#workspaceStore) return { ok: false, error: "attention lifecycle requires a persistent project workspace" };
    const record = this.#attentionRecords.get(String(id));
    if (!record) return { ok: false, error: "attention record not found" };
    if (!["new", "seen", "acting", "verifying", "recovered"].includes(state)) return { ok: false, error: "attention state is invalid" };
    const snapshot = this.getSnapshot(record.sessionId);
    if (state === "recovered" && (snapshot?.attentionRequired || snapshot?.status === "failed")) return { ok: false, error: "engine has not verified recovery" };
    record.state = state; record.updatedAt = Date.now();
    record.snoozedUntil = Number(options.snoozedUntil) > Date.now() ? Number(options.snoozedUntil) : null;
    record.history = [...(record.history || []), { state, at: record.updatedAt }].slice(-20);
    try { this.#workspaceStore.upsertAttention(record); } catch (error) { return { ok: false, error: error.message }; }
    this.#publish("attention:lifecycle", { attentionId: record.id, sessionId: record.sessionId, state });
    return { ok: true, record: JSON.parse(JSON.stringify(record)) };
  }

  saveAttentionPreferences(value) {
    if (!this.#workspaceStore) return { ok: false, error: "attention preferences require a persistent project workspace" };
    const minimumSeverity = ["info", "warning", "critical"].includes(value?.minimumSeverity) ? value.minimumSeverity : "info";
    const time = input => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(input || "")) ? String(input) : null;
    const quietHours = { enabled: value?.quietHours?.enabled === true, start: time(value?.quietHours?.start) || "22:00", end: time(value?.quietHours?.end) || "07:00" };
    this.#attentionPreferences = { minimumSeverity, desktopNotifications: value?.desktopNotifications !== false, quietHours };
    try { this.#workspaceStore.setAttentionPreferences(this.#attentionPreferences); } catch (error) { return { ok: false, error: error.message }; }
    this.#publish("attention:preferences", this.#attentionPreferences);
    return { ok: true, preferences: JSON.parse(JSON.stringify(this.#attentionPreferences)) };
  }

  saveMission(value) {
    if (!this.#workspaceStore) return { ok: false, error: "durable missions require a persistent project workspace" };
    const agentId = String(value?.agentId || "");
    const title = String(value?.title || "").trim();
    if (!agentId.startsWith("agent-") || !this.getSnapshot(agentId)) return { ok: false, error: "mission agent is invalid" };
    if (!title || title.length > 240) return { ok: false, error: "mission title is invalid" };
    const scopes = [...new Set((Array.isArray(value.scopes) ? value.scopes : ["read"]).filter(scope => ["read", "write", "execute", "network"].includes(scope)))];
    const existing = [...this.#missions.values()].find(mission => mission.agentId === agentId && mission.status === "active");
    const mission = { id: existing?.id || `mission-${Date.now()}-${agentId.slice(-8)}`, agentId, title, scopes: scopes.length ? scopes : ["read"], status: value.status === "completed" ? "completed" : "active", createdAt: existing?.createdAt || Date.now(), updatedAt: Date.now(), evidence: existing?.evidence || [] };
    try { this.#workspaceStore.upsertMission(mission); } catch (error) { return { ok: false, error: error.message }; }
    this.#missions.set(mission.id, mission);
    this.#publish("mission:saved", { missionId: mission.id, agentId, status: mission.status, scopes: mission.scopes });
    return { ok: true, mission: JSON.parse(JSON.stringify(mission)) };
  }

  #captureMissionEvidence(payload) {
    const mission = [...this.#missions.values()].find(item => item.agentId === payload.id && item.status === "active");
    if (!mission || !payload.evidence) return;
    const category = payload.category;
    const type = category === "git" ? "diff" : category === "tests" ? "test" : category === "build" ? "result" : category;
    const record = { id: `${mission.id}:${Date.now()}:${category}`, type, category, at: Date.now(), facts: JSON.parse(JSON.stringify(payload.evidence)) };
    if (category === "git") record.file = { changedPaths: payload.evidence.changedPaths || 0, branch: payload.evidence.branch || null };
    mission.evidence = [...mission.evidence.slice(-99), record];
    mission.updatedAt = Date.now();
    try { this.#workspaceStore?.upsertMission(mission); } catch { return; }
    this.#publish("mission:evidence", { missionId: mission.id, agentId: mission.agentId, evidenceType: type, category });
  }

  recordMissionInstruction(agentId, metadata = {}) {
    const mission = [...this.#missions.values()].find(item => item.agentId === agentId && item.status === "active");
    if (!mission) return { ok: false, error: "agent has no active mission" };
    const requestedScopes = [...new Set((metadata.requestedScopes || []).filter(scope => ["read", "write", "execute", "network"].includes(scope)))];
    const denied = requestedScopes.filter(scope => !mission.scopes.includes(scope));
    if (denied.length) return { ok: false, error: `mission does not allow: ${denied.join(", ")}` };
    const record = { id: `${mission.id}:${Date.now()}:command`, type: "command", at: Date.now(), facts: { instructionLength: Math.min(100000, Number(metadata.instructionLength) || 0), requestedScopes } };
    mission.evidence = [...mission.evidence.slice(-99), record]; mission.updatedAt = Date.now();
    try { this.#workspaceStore?.upsertMission(mission); } catch (error) { return { ok: false, error: error.message }; }
    this.#publish("mission:evidence", { missionId: mission.id, agentId, evidenceType: "command" });
    return { ok: true };
  }

  saveRecipe(value) {
    if (!this.#workspaceStore) return { ok: false, error: "shared recipes require a persistent project workspace" };
    let recipe;
    try { recipe = normalizeRecipe(value, new Set(this.#sessionEngine.list().map(session => session.id))); }
    catch (error) { return { ok: false, error: error.message }; }
    if (!this.#recipes.has(recipe.id) && this.#recipes.size >= RECIPE_LIMIT) return { ok: false, error: `workspace recipe limit is ${RECIPE_LIMIT}` };
    try { this.#workspaceStore.upsertRecipe(recipe); }
    catch (error) { return { ok: false, error: error.message }; }
    this.#recipes.set(recipe.id, recipe);
    this.#publish("recipe:saved", { recipeId: recipe.id, name: recipe.name });
    return { ok: true, recipe };
  }

  deleteRecipe(id) {
    if (!this.#workspaceStore) return { ok: false, error: "shared recipes require a persistent project workspace" };
    try {
      if (!this.#workspaceStore.removeRecipe(id)) return { ok: false, error: `no such recipe: ${id}` };
    } catch (error) { return { ok: false, error: error.message }; }
    this.#recipes.delete(id);
    this.#recipeRuns.delete(id);
    this.#publish("recipe:deleted", { recipeId: id });
    return { ok: true };
  }

  #recipeReady(session, mode) {
    if (!session) return false;
    if (mode === "running") return session.status === "running";
    if (mode === "service") return session.evidence?.service?.ready === true;
    if (mode === "tests") return Number.isInteger(session.evidence?.tests?.passed) && session.evidence.tests.failed === 0;
    return session.evidence?.container?.healthy === true || session.evidence?.database?.ready === true || session.evidence?.service?.ready === true;
  }

  async #executeRecipe(recipe, run) {
    for (const step of recipe.steps) {
      while (run.phase === "paused") await wait(50);
      if (run.phase === "cancelled") return;
      if (!step.dependsOn.every(id => run.completed.includes(id))) {
        run.failures.push({ workerId: step.workerId, reason: "dependency did not become ready" });
        if (recipe.failurePolicy === "stop") break;
        continue;
      }
      run.currentWorkerId = step.workerId;
      this.#publish("recipe:step", { recipeId: recipe.id, runId: run.runId, workerId: step.workerId, phase: "starting" });
      const snapshot = this.getSnapshot(step.workerId);
      if (!snapshot?.isAlive) {
        const started = this.start(step.workerId);
        const result = started && typeof started.then === "function" ? await started : started;
        if (!result?.ok) {
          run.failures.push({ workerId: step.workerId, reason: result?.error || "worker failed to start" });
          if (recipe.failurePolicy === "stop") break;
          continue;
        }
      }
      const deadline = Date.now() + recipe.readinessTimeoutMs;
      while (!this.#recipeReady(this.getSnapshot(step.workerId), step.readiness) && Date.now() < deadline) {
        while (run.phase === "paused") await wait(50);
        await wait(50);
      }
      if (!this.#recipeReady(this.getSnapshot(step.workerId), step.readiness)) {
        run.failures.push({ workerId: step.workerId, reason: `${step.readiness} readiness timed out` });
        if (recipe.failurePolicy === "stop") break;
      } else {
        run.completed.push(step.workerId);
        this.#publish("recipe:step", { recipeId: recipe.id, runId: run.runId, workerId: step.workerId, phase: "ready", readiness: step.readiness });
      }
    }
    run.phase = run.failures.length ? "failed" : "completed";
    run.currentWorkerId = null;
    run.finishedAt = Date.now();
    this.#publish("recipe:run", { recipeId: recipe.id, runId: run.runId, phase: run.phase, completedCount: run.completed.length, failureCount: run.failures.length });
  }

  runRecipe(id) {
    const recipe = this.#recipes.get(id);
    if (!recipe) return { ok: false, error: `no such recipe: ${id}` };
    const active = this.#recipeRuns.get(id);
    if (active && ["running", "paused"].includes(active.phase)) return { ok: false, error: "recipe is already active" };
    const run = { runId: `${id}:${Date.now()}`, recipeId: id, phase: "running", completed: [], failures: [], currentWorkerId: null, startedAt: Date.now(), finishedAt: null };
    this.#recipeRuns.set(id, run);
    this.#publish("recipe:run", { recipeId: id, runId: run.runId, phase: "running", completedCount: 0, failureCount: 0 });
    void this.#executeRecipe(recipe, run);
    return { ok: true, run: { ...run, completed: [] } };
  }

  pauseRecipe(id) {
    const run = this.#recipeRuns.get(id);
    if (!run || run.phase !== "running") return { ok: false, error: "recipe is not running" };
    run.phase = "paused";
    this.#publish("recipe:run", { recipeId: id, runId: run.runId, phase: "paused", completedCount: run.completed.length, failureCount: run.failures.length });
    return { ok: true };
  }

  resumeRecipe(id) {
    const run = this.#recipeRuns.get(id);
    if (!run || run.phase !== "paused") return { ok: false, error: "recipe is not paused" };
    run.phase = "running";
    this.#publish("recipe:run", { recipeId: id, runId: run.runId, phase: "running", completedCount: run.completed.length, failureCount: run.failures.length });
    return { ok: true };
  }

  create(definition) {
    if (this.#stopping) return { ok: false, error: "the engine is stopping" };
    const baseDir = this.#workspaceStore?.directory || process.cwd();
    let normalized;
    try {
      normalized = normalizeSessionDefinition(definition, { baseDir });
      if (this.#sessionEngine.get(normalized.runtime.id)) {
        return { ok: false, error: `session id already in use: ${normalized.runtime.id}` };
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    const previousDefinition = this.#workspaceStore?.getDefinition(normalized.persisted.id) || null;
    if (this.#workspaceStore) {
      try {
        this.#workspaceStore.upsert(normalized.persisted);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        this.#publish("workspace:persist-error", { operation: "create", id: normalized.runtime.id, error });
        return { ok: false, error };
      }
    }

    let session;
    try {
      session = this.#sessionEngine.create(normalized.runtime);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      if (this.#workspaceStore) {
        try {
          if (previousDefinition) this.#workspaceStore.upsert(previousDefinition);
          else this.#workspaceStore.remove(normalized.runtime.id);
        } catch (rollbackError) {
          const rollback = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
          this.#publish("workspace:persist-error", {
            operation: "create-rollback",
            id: normalized.runtime.id,
            error: rollback
          });
          return { ok: false, error: `${error}; workspace rollback failed: ${rollback}` };
        }
      }
      return { ok: false, error };
    }

    return { ok: true, session: session.summary() };
  }

  list() {
    return this.#sessionEngine.list();
  }

  getSnapshot(id) {
    return this.#sessionEngine.getSnapshot(id);
  }

  getSessionConfiguration(id) {
    const definition = this.#workspaceStore?.getDefinition(id) || this.#sessionEngine.getDefinition(id);
    if (!definition) return null;
    const env = definition.env && typeof definition.env === "object" ? definition.env : {};
    return {
      id: definition.id,
      name: definition.name || definition.id,
      command: definition.command,
      args: Array.isArray(definition.args) ? [...definition.args] : [],
      cwd: definition.cwd === undefined ? "." : definition.cwd,
      envKeys: Object.keys(env),
      powershellCompatibility: definition.powershellCompatibility === true,
      autoStart: definition.autoStart !== false
    };
  }

  listSavedCommands() {
    return [...this.#savedCommands.values()].map(command => {
      const definition = command.persisted;
      const env = definition.env && typeof definition.env === "object" ? definition.env : {};
      return {
        id: definition.id,
        name: definition.name || definition.id,
        command: definition.command,
        args: Array.isArray(definition.args) ? [...definition.args] : [],
        cwd: definition.cwd === undefined ? "." : definition.cwd,
        envKeys: Object.keys(env),
        powershellCompatibility: command.runtime.powershellCompatibility,
        autoStart: command.runtime.autoStart,
        available: !this.#sessionEngine.get(definition.id)
      };
    });
  }

  createFromSavedCommand(commandId) {
    if (this.#stopping) return { ok: false, error: "the engine is stopping" };
    const savedCommand = this.#savedCommands.get(commandId);
    if (!savedCommand) return { ok: false, error: `no such saved command: ${commandId}` };
    if (this.#sessionEngine.get(savedCommand.runtime.id)) {
      return { ok: false, error: `session id already in use: ${savedCommand.runtime.id}` };
    }

    const result = this.create({ ...savedCommand.persisted });
    if (!result.ok) return result;
    this.#publish("saved-command:instantiated", {
      id: result.session.id,
      commandId,
      session: {
        id: result.session.id,
        name: result.session.name,
        status: result.session.status,
        autoStart: result.session.autoStart
      }
    });
    return { ...result, commandId };
  }

  getState() {
    return {
      contractVersion: ENGINE_CONTRACT_VERSION,
      sequence: this.#eventSequence,
      generatedAt: Date.now(),
      workspace: this.getWorkspace(),
      loadErrors: this.#loadErrors.map(error => ({ ...error })),
      savedCommandErrors: this.#savedCommandErrors.map(error => ({ ...error })),
      savedCommands: this.listSavedCommands(),
      sessions: this.list(),
      activity: this.getActivity()
    };
  }

  getActivity(options = {}) {
    if (options === null || typeof options !== "object" || Array.isArray(options)) {
      throw new TypeError("getActivity options must be an object");
    }
    const afterSequence = Number.isInteger(options.afterSequence) && options.afterSequence >= 0
      ? options.afterSequence
      : null;
    const limit = Number.isInteger(options.limit) && options.limit > 0
      ? Math.min(options.limit, this.#activityLimit)
      : Math.min(50, this.#activityLimit);
    const available = afterSequence === null
      ? this.#activityEvents
      : this.#activityEvents.filter(event => event.sequence > afterSequence);
    const selected = afterSequence === null
      ? available.slice(-limit)
      : available.slice(0, limit);
    const gap = afterSequence !== null && afterSequence < this.#activityDroppedThrough;
    const firstSelectedSequence = selected[0]?.sequence ?? null;

    return {
      contractVersion: ENGINE_CONTRACT_VERSION,
      latestSequence: this.#eventSequence,
      latestActivitySequence: this.#activityEvents.at(-1)?.sequence ?? null,
      oldestActivitySequence: this.#activityEvents[0]?.sequence ?? null,
      droppedThroughSequence: this.#activityDroppedThrough,
      gap,
      hasEarlier: this.#activityDroppedThrough > 0 || (
        firstSelectedSequence === null
          ? this.#activityEvents.length > 0
          : this.#activityEvents[0]?.sequence < firstSelectedSequence
      ),
      hasMore: afterSequence !== null && available.length > selected.length,
      events: selected.map(event => this.#cloneContractValue(event))
    };
  }

  getProjectMemory(options = {}) {
    const afterSequence = Number.isInteger(options.afterSequence) && options.afterSequence >= 0 ? options.afterSequence : 0;
    const events = this.#activityEvents;
    const since = events.filter(event => event.sequence > afterSequence);
    const isFailure = event => /failed|error|spawn-error/i.test(String(event.type)) || event.status === "failed" || event.evidence?.status === "failed" || Number(event.evidence?.failed) > 0;
    const isRecovery = event => /started|created|evidence|status|supervision/i.test(String(event.type)) && !isFailure(event) && (event.status === "running" || event.attentionRequired === false || event.evidence?.ready === true || event.evidence?.healthy === true || event.evidence?.failed === 0);
    const groups = new Map();
    for (const event of events) {
      if (!event.correlationId) continue;
      const group = groups.get(event.correlationId) || { correlationId: event.correlationId, sessionId: event.id || event.sessionId || null, actor: event.name || event.id || event.sessionId || "Worker", events: [], failedAt: null, recoveredAt: null };
      group.events.push({ sequence: event.sequence, type: event.type, timestamp: event.timestamp, reason: event.reason || null });
      if (isFailure(event) && !group.failedAt) group.failedAt = event.timestamp;
      if (group.failedAt && isRecovery(event) && event.timestamp >= group.failedAt) group.recoveredAt = event.timestamp;
      groups.set(event.correlationId, group);
    }
    const chapters = [...groups.values()].filter(group => group.failedAt).map(group => ({ ...group, state: group.recoveredAt ? "recovered" : "unresolved", eventCount: group.events.length })).sort((a, b) => b.failedAt - a.failedAt).slice(0, 20);
    const risks = since.filter(isFailure);
    const evidence = since.filter(event => event.type === "session:evidence");
    const actors = new Set(since.map(event => event.name || event.id || event.sessionId).filter(Boolean));
    const why = risks.slice(-5).reverse().map(event => ({ sequence: event.sequence, actor: event.name || event.id || event.sessionId || "Workspace", statement: event.reason || `${String(event.type).replaceAll(":", " ")} was recorded by the engine`, correlationId: event.correlationId || null }));
    return {
      generatedAt: Date.now(),
      afterSequence,
      latestSequence: this.#eventSequence,
      since: { eventCount: since.length, riskCount: risks.length, evidenceCount: evidence.length, actorCount: actors.size, summary: since.length ? `${since.length} recorded changes across ${actors.size || 1} actor${actors.size === 1 ? "" : "s"}; ${risks.length} require review and ${evidence.length} contain structured evidence.` : "No engine-recorded changes since your last review." },
      why,
      chapters,
      current: this.list().map(session => ({ id: session.id, name: session.name, status: session.status, isAlive: session.isAlive, attentionRequired: session.attentionRequired, lastOutputAt: session.lastOutputAt }))
    };
  }

  subscribe(scope, callback) {
    if (typeof scope === "function") {
      callback = scope;
      scope = "all";
    }
    if (typeof callback !== "function") {
      throw new TypeError("subscribe requires a callback");
    }

    const listener = event => {
      if (scope === "all" || scope === event.id || scope === `session:${event.id}`) {
        try {
          callback(event);
        } catch (error) {
          this.#reportSubscriberError(error, { scope, event });
        }
      }
    };

    this.on("engine:event", listener);
    return () => this.off("engine:event", listener);
  }

  write(id, data) {
    return this.#sessionEngine.write(id, data);
  }

  resize(id, cols, rows) {
    return this.#sessionEngine.resize(id, cols, rows);
  }

  attachRawStream(id) {
    const stream = this.#sessionEngine.attachRawStream(id);
    if (!stream) {
      const snapshot = this.getSnapshot(id);
      this.#publish("attach:rejected", {
        id,
        reason: snapshot ? snapshot.status : "missing"
      });
    }
    return stream;
  }

  start(id) {
    return this.#runSessionOperation(id, () => this.#sessionEngine.start(id));
  }

  restart(id) {
    return this.#runSessionOperation(id, () => this.#sessionEngine.restart(id));
  }

  kill(id) {
    if (this.#sessionOperations.has(id)) {
      return { ok: false, error: "a lifecycle operation is already in progress for this session" };
    }
    return this.#sessionEngine.kill(id);
  }

  rename(id, name) {
    const snapshot = this.getSnapshot(id);
    if (!snapshot) return { ok: false, error: `no such session: ${id}` };
    const nextName = String(name || "").trim();
    if (!nextName) return { ok: false, error: "name cannot be empty" };
    if (nextName.length > 80) return { ok: false, error: "name cannot exceed 80 characters" };

    if (this.#workspaceStore) {
      try {
        if (!this.#workspaceStore.rename(id, nextName)) {
          return { ok: false, error: `session is missing from workspace configuration: ${id}` };
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        this.#publish("workspace:persist-error", { operation: "rename", id, error });
        return { ok: false, error };
      }
    }

    const result = this.#sessionEngine.rename(id, nextName);
    if (result.ok || !this.#workspaceStore) return result;

    try {
      this.#workspaceStore.rename(id, snapshot.name);
    } catch (rollbackError) {
      const rollback = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
      this.#publish("workspace:persist-error", { operation: "rename-rollback", id, error: rollback });
      return { ok: false, error: `${result.error}; workspace rollback failed: ${rollback}` };
    }
    return result;
  }

  setAutoStart(id, enabled) {
    return this.#runSessionOperation(id, () => {
      if (typeof enabled !== "boolean") {
        return { ok: false, error: "autoStart must be a boolean" };
      }
      const snapshot = this.getSnapshot(id);
      if (!snapshot) return { ok: false, error: `no such session: ${id}` };
      if (snapshot.autoStart === enabled) return { ok: true };

      if (this.#workspaceStore) {
        try {
          if (!this.#workspaceStore.setAutoStart(id, enabled)) {
            return { ok: false, error: `session is missing from workspace configuration: ${id}` };
          }
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          this.#publish("workspace:persist-error", { operation: "autostart", id, error });
          return { ok: false, error };
        }
      }

      const result = this.#sessionEngine.setAutoStart(id, enabled);
      if (result.ok || !this.#workspaceStore) return result;

      try {
        this.#workspaceStore.setAutoStart(id, snapshot.autoStart);
      } catch (rollbackError) {
        const rollback = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        this.#publish("workspace:persist-error", {
          operation: "autostart-rollback",
          id,
          error: rollback
        });
        return { ok: false, error: `${result.error}; workspace rollback failed: ${rollback}` };
      }
      return result;
    });
  }

  reconfigure(id, patch) {
    return this.#runSessionOperation(id, () => {
      const snapshot = this.getSnapshot(id);
      if (!snapshot) return { ok: false, error: `no such session: ${id}` };
      if (snapshot.isAlive) {
        return { ok: false, error: "stop the session before changing its configuration" };
      }
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        return { ok: false, error: "configuration patch must be an object" };
      }
      if (Object.hasOwn(patch, "id") && patch.id !== id) {
        return { ok: false, error: "session id cannot be changed" };
      }

      const allowedFields = new Set([
        "id", "name", "command", "args", "cwd", "env", "powershellCompatibility", "autoStart"
      ]);
      const unsupported = Object.keys(patch).filter(field => !allowedFields.has(field));
      if (unsupported.length) {
        return { ok: false, error: `unsupported configuration field: ${unsupported[0]}` };
      }

      const previousDefinition = this.#workspaceStore?.getDefinition(id) || this.#sessionEngine.getDefinition(id);
      if (!previousDefinition) return { ok: false, error: `no such session: ${id}` };
      const merged = { ...previousDefinition };
      for (const field of allowedFields) {
        if (field !== "id" && Object.hasOwn(patch, field)) merged[field] = patch[field];
      }
      merged.id = id;

      let normalized;
      try {
        normalized = normalizeSessionDefinition(merged, {
          baseDir: this.#workspaceStore?.directory || process.cwd()
        });
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }

      if (this.#workspaceStore) {
        try {
          if (!this.#workspaceStore.replace(id, normalized.persisted)) {
            return { ok: false, error: `session is missing from workspace configuration: ${id}` };
          }
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          this.#publish("workspace:persist-error", { operation: "reconfigure", id, error });
          return { ok: false, error };
        }
      }

      const result = this.#sessionEngine.reconfigure(id, normalized.runtime);
      if (result.ok || !this.#workspaceStore) return result;

      try {
        this.#workspaceStore.replace(id, previousDefinition);
      } catch (rollbackError) {
        const rollback = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        this.#publish("workspace:persist-error", {
          operation: "reconfigure-rollback",
          id,
          error: rollback
        });
        return { ok: false, error: `${result.error}; workspace rollback failed: ${rollback}` };
      }
      return result;
    });
  }

  acknowledge(id) {
    return this.#sessionEngine.acknowledge(id);
  }

  async remove(id) {
    return this.#runSessionOperation(id, async () => {
      if (!this.#workspaceStore) return this.#sessionEngine.remove(id);

      const wasAlive = this.getSnapshot(id)?.isAlive || false;
      const stopped = await this.#sessionEngine.stopForRemoval(id);
      if (!stopped.ok) return stopped;

      try {
        if (!this.#workspaceStore.remove(id)) {
          return { ok: false, error: `session is missing from workspace configuration: ${id}` };
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        this.#publish("workspace:persist-error", { operation: "remove", id, error });
        return { ok: false, error, sessionStopped: wasAlive };
      }

      return this.#sessionEngine.finalizeRemove(id);
    });
  }

  #runSessionOperation(id, operation) {
    if (this.#stopping) return Promise.resolve({ ok: false, error: "the engine is stopping" });

    const previous = this.#sessionOperations.get(id) || Promise.resolve();
    const current = previous
      .catch(() => {})
      .then(operation);
    this.#sessionOperations.set(id, current);
    current.then(
      () => {
        if (this.#sessionOperations.get(id) === current) this.#sessionOperations.delete(id);
      },
      () => {
        if (this.#sessionOperations.get(id) === current) this.#sessionOperations.delete(id);
      }
    );
    return current;
  }

  #cloneContractValue(value) {
    return JSON.parse(JSON.stringify(value));
  }

  #deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    for (const nested of Object.values(value)) this.#deepFreeze(nested);
    return Object.freeze(value);
  }

  #activityRecord(envelope) {
    const record = this.#cloneContractValue(envelope);
    if (record.type === "project:load-errors") {
      record.errorCount = Array.isArray(record.errors) ? record.errors.length : 0;
      delete record.errors;
    }
    if (record.type === "project:command-errors") {
      record.errorCount = Array.isArray(record.errors) ? record.errors.length : 0;
      delete record.errors;
    }
    if (["session:created", "session:reconfigured"].includes(record.type) && record.session) {
      record.session = {
        id: record.session.id,
        name: record.session.name,
        status: record.session.status,
        autoStart: record.session.autoStart
      };
    }
    return record;
  }

  #persistableActivityRecord(event) {
    const record = this.#cloneContractValue(event);
    if (record.type === "session:supervision") {
      delete record.attentionReason;
    }
    return record;
  }

  #activityPersistenceState() {
    return {
      contractVersion: ENGINE_CONTRACT_VERSION,
      latestSequence: this.#eventSequence,
      droppedThroughSequence: this.#activityDroppedThrough,
      events: this.#activityEvents.map(event => this.#persistableActivityRecord(event))
    };
  }

  #scheduleActivityPersist() {
    if (!this.#activityStore) return;
    this.#activityDirty = true;
    if (this.#activityPersistDelayMs === 0) {
      this.#persistActivityNow();
      return;
    }
    if (this.#activityPersistTimer) return;
    this.#activityPersistTimer = setTimeout(() => {
      this.#activityPersistTimer = null;
      this.#persistActivityNow();
    }, this.#activityPersistDelayMs);
    this.#activityPersistTimer.unref?.();
  }

  #persistActivityNow(reportError = true) {
    if (this.#activityPersistTimer) {
      clearTimeout(this.#activityPersistTimer);
      this.#activityPersistTimer = null;
    }
    if (!this.#activityStore || !this.#activityDirty) return { ok: true };

    try {
      this.#activityStore.save(this.#activityPersistenceState());
      this.#activityDirty = false;
      this.#lastActivityPersistError = null;
      return { ok: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      if (
        reportError &&
        error !== this.#lastActivityPersistError &&
        !this.#reportingActivityPersistError
      ) {
        this.#lastActivityPersistError = error;
        this.#reportingActivityPersistError = true;
        try {
          this.#publish("activity:persist-error", { error }, { error }, { persist: false });
        } finally {
          this.#reportingActivityPersistError = false;
        }
      }
      return { ok: false, error };
    }
  }

  #publish(type, payload = {}, observedPayload = payload, options = {}) {
    const envelopeValue = {
      ...payload,
      contractVersion: ENGINE_CONTRACT_VERSION,
      sequence: ++this.#eventSequence,
      timestamp: Date.now(),
      type
    };
    const envelope = type === "session:output"
      ? Object.freeze(envelopeValue)
      : this.#deepFreeze(this.#cloneContractValue(envelopeValue));

    const shouldPersist = type !== "session:output" && options.persist !== false;
    if (type !== "session:output") {
      this.#activityEvents.push(this.#activityRecord(envelope));
      if (this.#activityEvents.length > this.#activityLimit) {
        const removed = this.#activityEvents.splice(0, this.#activityEvents.length - this.#activityLimit);
        this.#activityDroppedThrough = removed.at(-1)?.sequence ?? this.#activityDroppedThrough;
      }
    }

    this.#publicationQueue.push({ type, payload: observedPayload, envelope });
    if (this.#publishing) {
      if (shouldPersist) this.#scheduleActivityPersist();
      return envelope;
    }

    this.#publishing = true;
    try {
      while (this.#publicationQueue.length) {
        const next = this.#publicationQueue.shift();
        this.#emitObserved("engine:event", next.envelope);
        this.#emitObserved(next.type, next.payload);
      }
    } finally {
      this.#publishing = false;
    }
    if (shouldPersist) this.#scheduleActivityPersist();
    return envelope;
  }

  #emitObserved(type, payload) {
    for (const listener of this.rawListeners(type)) {
      try {
        listener.call(this, payload);
      } catch (error) {
        this.#reportSubscriberError(error, { type, payload });
      }
    }
  }

  #reportSubscriberError(error, context) {
    try {
      this.#onSubscriberError(error, context);
    } catch (reportingError) {
      // Observers must never be able to break PTY ownership or lifecycle work.
    }
  }

  stopAll(timeoutMs) {
    if (this.#stopPromise) return this.#stopPromise;
    this.#stopping = true;
    this.#stopPromise = (async () => {
      await Promise.allSettled([...this.#sessionOperations.values()]);
      const result = await this.#sessionEngine.stopAll(timeoutMs);
      this.#persistActivityNow();
      if (!result.ok) {
        this.#stopping = false;
        this.#stopPromise = null;
      }
      return result;
    })();
    return this.#stopPromise;
  }

  dispose() {
    for (const [type, listener] of this.#engineBindings) {
      this.#sessionEngine.off(type, listener);
    }
    this.#engineBindings = [];
    this.#persistActivityNow(false);
    this.#stopping = true;
    this.#sessionOperations.clear();
    this.#savedCommands.clear();
    this.#savedCommandErrors = [];
    for (const run of this.#recipeRuns.values()) run.phase = "cancelled";
    this.#recipeRuns.clear();
    this.#recipes.clear();
    this.#missions.clear();
    this.#activityEvents = [];
    if (this.#activityPersistTimer) clearTimeout(this.#activityPersistTimer);
    this.#activityPersistTimer = null;
    this.#publicationQueue = [];
    this.#sessionEngine.dispose();
    this.removeAllListeners();
  }
}

module.exports = { EngineAPI, ENGINE_EVENTS, ENGINE_CONTRACT_VERSION, MAX_ACTIVITY_EVENTS };
