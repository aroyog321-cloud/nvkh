"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { redactText } = require("./contextSanitizer.cjs");
const { normalizeRecipe } = require("../engine/workspaceRecipes.cjs");

const SUPERVISOR_APPROVAL_TTL_MS = 15 * 60 * 1000;
const MAX_SUPERVISOR_ACTIONS = 20;
const MAX_TERMINAL_INPUT_LENGTH = 2048;
const ACTION_TYPES = new Set([
  "create-worker",
  "start",
  "restart",
  "stop",
  "create-profile",
  "run-recipe",
  "terminal-input"
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeText(value, maximum = 500) {
  return redactText(String(value || ""), { maxLength: maximum }).value.trim();
}

function safeId(value, label = "id") {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id)) throw new TypeError(`${label} is invalid`);
  return id;
}

function projectRelativeCwd(workspace, value = ".") {
  const root = workspace?.directory;
  if (!root) throw new Error("Mission Supervisor requires an active project directory");
  const candidate = String(value || ".").trim() || ".";
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new TypeError("worker cwd must remain inside the active project");
  return relative ? relative.split(path.sep).join("/") : ".";
}

function normalizeWorkerDefinition(value, workspace) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("worker definition is required");
  const id = safeId(value.id, "worker id");
  const name = safeText(value.name || id, 80);
  const command = String(value.command || "").trim();
  if (!command || command.length > 1024 || /[\0\r\n;&|`$<>]/.test(command) || /\s/.test(command)) {
    throw new TypeError("worker command must be one executable without shell operators");
  }
  const args = Array.isArray(value.args) ? value.args : [];
  if (args.length > 64 || args.some(arg => typeof arg !== "string" || arg.length > 1024 || arg.includes("\0"))) {
    throw new TypeError("worker args are invalid");
  }
  if (value.env && Object.keys(value.env).length) throw new TypeError("Mission Supervisor plans cannot include environment values");
  return {
    id,
    name,
    command,
    args: [...args],
    cwd: projectRelativeCwd(workspace, value.cwd),
    autoStart: false,
    powershellCompatibility: value.powershellCompatibility === true
  };
}

function normalizeProfile(value, workspace, knownWorkerIds) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("workspace profile is required");
  const id = safeId(value.id, "profile id");
  const name = safeText(value.name || id, 60);
  if (!name) throw new TypeError("profile name is required");
  const workers = (Array.isArray(value.workers) ? value.workers : []).map(worker => normalizeWorkerDefinition(worker, workspace));
  const profileWorkerIds = new Set();
  for (const worker of workers) {
    if (profileWorkerIds.has(worker.id)) throw new TypeError(`profile worker is duplicated: ${worker.id}`);
    if (knownWorkerIds.has(worker.id)) throw new TypeError(`profile worker already exists; reference it in steps instead: ${worker.id}`);
    profileWorkerIds.add(worker.id);
  }
  const availableWorkerIds = new Set([...knownWorkerIds, ...profileWorkerIds]);
  const steps = Array.isArray(value.steps) ? value.steps.map(step => ({
    workerId: safeId(step?.workerId, "profile worker id"),
    dependsOn: Array.isArray(step?.dependsOn) ? [...new Set(step.dependsOn.map(item => safeId(item, "profile dependency")))] : [],
    readiness: String(step?.readiness || "running"),
    timeoutMs: Number.isInteger(step?.timeoutMs) ? step.timeoutMs : undefined
  })) : workers.map(worker => ({ workerId: worker.id, dependsOn: [], readiness: "running" }));
  if (!steps.length || steps.some(step => !availableWorkerIds.has(step.workerId) || step.dependsOn.some(id => !availableWorkerIds.has(id)))) {
    throw new TypeError("profile steps must reference known or profile-defined workers");
  }
  const recipe = normalizeRecipe({
    id,
    name,
    steps,
    layoutId: value.layoutId || "grid-2x2",
    sessionIds: Array.isArray(value.sessionIds) ? value.sessionIds.slice(0, 6) : steps.slice(0, 6).map(step => step.workerId),
    failurePolicy: value.failurePolicy || "stop",
    recoveryPolicy: value.recoveryPolicy || "rollback-started",
    restartPolicy: value.restartPolicy || "reuse-running",
    maxParallel: value.maxParallel,
    retryAttempts: value.retryAttempts,
    retryDelayMs: value.retryDelayMs,
    readinessTimeoutMs: value.readinessTimeoutMs
  }, availableWorkerIds);
  for (const worker of workers) knownWorkerIds.add(worker.id);
  return {
    id,
    name,
    workers,
    recipe
  };
}

function normalizePlan(raw, engineApi) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("Mission Supervisor plan must be an object");
  if (!Array.isArray(raw.actions) || !raw.actions.length || raw.actions.length > MAX_SUPERVISOR_ACTIONS) {
    throw new TypeError(`Mission Supervisor plan must contain 1 to ${MAX_SUPERVISOR_ACTIONS} actions`);
  }
  const workspace = engineApi.getWorkspace();
  if (!workspace?.persistent) throw new Error("Open a persistent project before planning mutations");
  const knownWorkerIds = new Set(engineApi.list().map(worker => worker.id));
  const knownRecipeIds = new Set((engineApi.listRecipes?.() || []).map(recipe => recipe.id));
  const actions = raw.actions.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new TypeError(`action ${index + 1} is invalid`);
    const type = String(candidate.type || "");
    if (!ACTION_TYPES.has(type)) throw new TypeError(`action ${index + 1} type is not allowed`);
    const reason = safeText(candidate.reason || "Requested by Mission Supervisor", 500);
    if (type === "create-worker") {
      const definition = normalizeWorkerDefinition(candidate.definition || candidate, workspace);
      if (knownWorkerIds.has(definition.id)) throw new TypeError(`worker already exists: ${definition.id}`);
      knownWorkerIds.add(definition.id);
      return { type, reason, definition };
    }
    if (type === "create-profile") {
      const profileId = safeId((candidate.profile || candidate).id, "profile id");
      if (knownRecipeIds.has(profileId)) throw new TypeError(`profile already exists: ${profileId}`);
      const profile = normalizeProfile(candidate.profile || candidate, workspace, knownWorkerIds);
      knownRecipeIds.add(profile.id);
      return { type, reason, profile };
    }
    if (type === "run-recipe") {
      const recipeId = safeId(candidate.recipeId, "recipe id");
      if (!knownRecipeIds.has(recipeId)) throw new TypeError(`recipe does not exist: ${recipeId}`);
      return { type, reason, recipeId, recover: candidate.recover === true };
    }
    const workerId = safeId(candidate.workerId, "worker id");
    if (!knownWorkerIds.has(workerId)) throw new TypeError(`worker does not exist: ${workerId}`);
    if (type === "terminal-input") {
      const input = String(candidate.input ?? candidate.data ?? "");
      if (!input || input.length > MAX_TERMINAL_INPUT_LENGTH || input.includes("\0")) throw new TypeError("terminal input is invalid or too large");
      const sensitive = redactText(input, { maxLength: MAX_TERMINAL_INPUT_LENGTH });
      if (sensitive.redactions) throw new TypeError("terminal input appears to contain a secret and cannot enter an AI plan");
      return { type, reason, workerId, input };
    }
    return { type, reason, workerId };
  });
  return {
    summary: safeText(raw.summary || "Mission Supervisor proposed workspace changes", 500),
    assumptions: (Array.isArray(raw.assumptions) ? raw.assumptions : []).slice(0, 10).map(item => safeText(item, 300)).filter(Boolean),
    actions
  };
}

class MissionSupervisorService {
  constructor(options = {}) {
    if (!options.missionAi || typeof options.missionAi.plan !== "function") throw new TypeError("MissionSupervisorService requires Mission AI planning");
    if (typeof options.getEngineApi !== "function") throw new TypeError("MissionSupervisorService requires getEngineApi");
    this.missionAi = options.missionAi;
    this.getEngineApi = options.getEngineApi;
    this.now = options.now || Date.now;
    this.randomUUID = options.randomUUID || crypto.randomUUID;
    this.approvals = new Map();
  }

  #expire() {
    const now = this.now();
    for (const approval of this.approvals.values()) {
      if (approval.state === "pending" && approval.expiresAt <= now) approval.state = "expired";
    }
  }

  status() {
    this.#expire();
    return {
      authority: "local-approval-required",
      pendingApprovalCount: [...this.approvals.values()].filter(item => item.state === "pending").length,
      supportedActions: [...ACTION_TYPES],
      terminalInputPolicy: "exact-input-requires-local-approval"
    };
  }

  listApprovals() {
    this.#expire();
    return [...this.approvals.values()].sort((a, b) => b.createdAt - a.createdAt).map(clone);
  }

  #registerPlan(plan, metadata = {}) {
    const engineApi = this.getEngineApi();
    if (!engineApi) throw new Error("Mission Supervisor engine is unavailable");
    const now = this.now();
    const approval = {
      id: this.randomUUID(),
      state: "pending",
      source: safeText(metadata.source || "mission-ai", 80),
      instruction: safeText(metadata.instruction, 1200),
      plan,
      provider: metadata.provider || null,
      model: metadata.model || null,
      createdAt: now,
      expiresAt: now + SUPERVISOR_APPROVAL_TTL_MS,
      resolvedAt: null,
      completedAt: null,
      results: []
    };
    this.approvals.set(approval.id, approval);
    while (this.approvals.size > 100) this.approvals.delete(this.approvals.keys().next().value);
    engineApi.recordSupervisorEvent?.("plan-requested", { approvalId: approval.id, source: approval.source, actionCount: plan.actions.length, summary: plan.summary });
    return clone(approval);
  }

  async propose(value = {}) {
    const engineApi = this.getEngineApi();
    if (!engineApi) throw new Error("Mission Supervisor engine is unavailable");
    const generated = await this.missionAi.plan(value);
    const plan = normalizePlan(generated.plan, engineApi);
    return this.#registerPlan(plan, { source: "mission-ai", instruction: value.instruction, provider: generated.provider, model: generated.model });
  }

  requestPlan(value = {}, metadata = {}) {
    const engineApi = this.getEngineApi();
    if (!engineApi) throw new Error("Mission Supervisor engine is unavailable");
    const plan = normalizePlan(value, engineApi);
    return this.#registerPlan(plan, metadata);
  }

  async #executeAction(action, engineApi) {
    if (action.type === "create-worker") return engineApi.create(action.definition);
    if (action.type === "start") return engineApi.start(action.workerId);
    if (action.type === "restart") return engineApi.restart(action.workerId);
    if (action.type === "stop") return engineApi.kill(action.workerId);
    if (action.type === "run-recipe") return engineApi.runRecipe(action.recipeId, { recover: action.recover });
    if (action.type === "terminal-input") {
      const data = /[\r\n]$/.test(action.input) ? action.input : `${action.input}\r`;
      return engineApi.write(action.workerId, data, { source: "mission-ai" })
        ? { ok: true, verified: engineApi.getSnapshot(action.workerId)?.lastInputAt !== null }
        : { ok: false, error: "terminal input could not be written" };
    }
    if (action.type === "create-profile") {
      const createdIds = [];
      for (const definition of action.profile.workers) {
        if (engineApi.getSnapshot(definition.id)) continue;
        const created = engineApi.create(definition);
        if (!created?.ok) return { ok: false, error: created?.error || `could not create ${definition.id}`, createdIds };
        createdIds.push(definition.id);
      }
      const saved = engineApi.saveRecipe(action.profile.recipe);
      return saved?.ok ? { ok: true, profileId: action.profile.id, createdIds, recipe: saved.recipe } : { ok: false, error: saved?.error || "profile could not be saved", createdIds };
    }
    return { ok: false, error: "unsupported supervisor action" };
  }

  async resolve(id, decision) {
    this.#expire();
    const approval = this.approvals.get(String(id));
    if (!approval) throw new Error("Mission Supervisor approval was not found");
    if (approval.state !== "pending") throw new Error(`Mission Supervisor approval is already ${approval.state}`);
    if (!['approve', 'deny'].includes(decision)) throw new TypeError("Mission Supervisor decision must be approve or deny");
    const engineApi = this.getEngineApi();
    if (!engineApi) throw new Error("Mission Supervisor engine is unavailable");
    approval.resolvedAt = this.now();
    if (decision === "deny") {
      approval.state = "denied";
      engineApi.recordSupervisorEvent?.("plan-denied", { approvalId: approval.id, source: "operator", actionCount: approval.plan.actions.length });
      return clone(approval);
    }
    approval.state = "executing";
    engineApi.recordSupervisorEvent?.("plan-approved", { approvalId: approval.id, source: "operator", actionCount: approval.plan.actions.length });
    for (let index = 0; index < approval.plan.actions.length; index++) {
      const action = approval.plan.actions[index];
      engineApi.recordSupervisorEvent?.("action-started", { approvalId: approval.id, actionIndex: index, actionType: action.type, target: action.workerId || action.recipeId || action.definition?.id || action.profile?.id || null });
      let result;
      try { result = await this.#executeAction(action, engineApi); }
      catch (error) { result = { ok: false, error: error instanceof Error ? error.message : String(error) }; }
      const record = { index, actionType: action.type, target: action.workerId || action.recipeId || action.definition?.id || action.profile?.id || null, ok: result?.ok === true, error: result?.ok ? null : safeText(result?.error || "action failed", 300), verifiedAt: this.now() };
      approval.results.push(record);
      engineApi.recordSupervisorEvent?.(record.ok ? "action-verified" : "action-failed", { approvalId: approval.id, ...record });
      if (!record.ok) {
        approval.state = "failed";
        approval.completedAt = this.now();
        return clone(approval);
      }
    }
    approval.state = "executed";
    approval.completedAt = this.now();
    return clone(approval);
  }
}

module.exports = {
  ACTION_TYPES,
  MAX_SUPERVISOR_ACTIONS,
  MAX_TERMINAL_INPUT_LENGTH,
  MissionSupervisorService,
  SUPERVISOR_APPROVAL_TTL_MS,
  normalizePlan,
  normalizeWorkerDefinition,
  projectRelativeCwd
};
