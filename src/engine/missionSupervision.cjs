"use strict";

const { redactText } = require("../service/contextSanitizer.cjs");

const MAX_MISSION_CHECKPOINTS = 12;
const MAX_MISSION_RELATED_WORKERS = 12;
const MAX_MISSION_LIFECYCLE = 100;
const MAX_MISSION_APPROVALS = 50;
const MISSION_APPROVAL_TTL_MS = 30 * 60 * 1000;
const MISSION_PHASES = Object.freeze(["planned", "starting", "executing", "waiting", "verifying", "review", "completed", "failed", "cancelled"]);
const CHECKPOINT_KINDS = Object.freeze(["changes", "tests", "build", "service", "result", "manual"]);
const MISSION_SCOPES = Object.freeze(["read", "write", "execute", "network"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function text(value, maximum, fallback = "") {
  const sanitized = redactText(String(value || ""), { maxLength: maximum });
  return (sanitized.value || fallback).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function identifier(value, fallback, maximum = 100) {
  const normalized = String(value || "").trim().replace(/[^a-zA-Z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "");
  return (normalized || fallback).slice(0, maximum);
}

function checkpointKind(value) {
  return CHECKPOINT_KINDS.includes(value) ? value : "manual";
}

function normalizeCheckpoints(value, previous = [], now = Date.now()) {
  if (!Array.isArray(value)) return clone(previous).slice(0, MAX_MISSION_CHECKPOINTS);
  const prior = new Map(previous.map(item => [item.id, item]));
  const used = new Set();
  const checkpoints = [];
  for (let index = 0; index < value.length && checkpoints.length < MAX_MISSION_CHECKPOINTS; index++) {
    const input = value[index];
    if (!input || typeof input !== "object") continue;
    const title = text(input.title, 160);
    if (!title) continue;
    const id = identifier(input.id, `checkpoint-${index + 1}`, 80);
    if (used.has(id)) continue;
    used.add(id);
    const old = prior.get(id);
    const state = ["pending", "active", "verified", "blocked"].includes(old?.state) ? old.state : "pending";
    checkpoints.push({
      id,
      title,
      verification: checkpointKind(input.verification),
      state,
      evidenceId: old?.evidenceId || null,
      updatedAt: Number.isInteger(old?.updatedAt) ? old.updatedAt : now
    });
  }
  return checkpoints;
}

function progressFor(checkpoints) {
  const verified = checkpoints.filter(item => item.state === "verified").length;
  const blocked = checkpoints.filter(item => item.state === "blocked").length;
  const active = checkpoints.find(item => item.state === "active") || checkpoints.find(item => item.state === "pending") || null;
  return {
    basis: "observable-checkpoints",
    verified,
    total: checkpoints.length,
    blocked,
    activeCheckpointId: active?.id || null,
    statement: checkpoints.length
      ? `${verified} of ${checkpoints.length} evidence checkpoints verified${blocked ? `; ${blocked} blocked` : ""}.`
      : "No evidence checkpoints configured; percentage progress is not inferred."
  };
}

function lifecycleEntry(phase, reason, source, now) {
  return {
    id: `lifecycle-${now}-${phase}`,
    phase,
    at: now,
    reason: text(reason, 300, "Mission state updated."),
    source: ["operator", "engine-lifecycle", "engine-evidence", "agent-request"].includes(source) ? source : "engine-lifecycle"
  };
}

function normalizeMission(value, options = {}) {
  const now = Number.isInteger(options.now) ? options.now : Date.now();
  const previous = options.previous && typeof options.previous === "object" ? options.previous : {};
  const knownWorkers = options.knownWorkers instanceof Set ? options.knownWorkers : new Set();
  const agentId = identifier(value?.agentId || previous.agentId, "", 80);
  const title = text(value?.title || previous.title, 240);
  const scopes = MISSION_SCOPES.filter(scope => (Array.isArray(value?.scopes) ? value.scopes : previous.scopes || ["read"]).includes(scope));
  const relatedWorkerIds = [...new Set((Array.isArray(value?.relatedWorkerIds) ? value.relatedWorkerIds : previous.relatedWorkerIds || [])
    .map(item => identifier(item, "", 80))
    .filter(item => item && item !== agentId && (!knownWorkers.size || knownWorkers.has(item))))].slice(0, MAX_MISSION_RELATED_WORKERS);
  const status = value?.status === "completed" ? "completed" : value?.status === "cancelled" ? "cancelled" : previous.status === "completed" || previous.status === "cancelled" ? previous.status : "active";
  const phase = status === "completed" ? "completed" : status === "cancelled" ? "cancelled" : MISSION_PHASES.includes(previous.phase) ? previous.phase : "planned";
  const checkpoints = normalizeCheckpoints(value?.checkpoints, previous.checkpoints, now);
  const lifecycle = Array.isArray(previous.lifecycle) ? previous.lifecycle.slice(-MAX_MISSION_LIFECYCLE).map(clone) : [];
  if (!lifecycle.length) lifecycle.push(lifecycleEntry(phase, "Mission assigned to the supervised agent.", "operator", previous.createdAt || now));
  return {
    id: identifier(previous.id || value?.id, `mission-${now}-${agentId.slice(-8)}`, 140),
    agentId,
    title,
    scopes: scopes.length ? scopes : ["read"],
    relatedWorkerIds,
    status,
    phase,
    currentAction: previous.currentAction ? clone(previous.currentAction) : { kind: "planned", summary: "Mission assigned; no agent action has been observed yet.", source: "operator", observedAt: now, evidenceId: null },
    progress: progressFor(checkpoints),
    checkpoints,
    approvals: Array.isArray(previous.approvals) ? previous.approvals.slice(-MAX_MISSION_APPROVALS).map(clone) : [],
    lifecycle,
    createdAt: Number.isInteger(previous.createdAt) ? previous.createdAt : now,
    updatedAt: now,
    evidence: Array.isArray(previous.evidence) ? previous.evidence.slice(-100).map(clone) : []
  };
}

function actionForEvidence(category, evidence) {
  if (category === "tests") {
    const passed = Number(evidence?.passed) || 0;
    const failed = Number(evidence?.failed) || Number(evidence?.suitesFailed) || 0;
    return { kind: "tests", summary: failed ? `Test evidence reports ${failed} failed and ${passed} passed.` : passed ? `Test evidence reports ${passed} passed.` : "Test evidence was recorded." };
  }
  if (category === "build") return { kind: "build", summary: evidence?.status === "completed" ? "Build completion evidence was recorded." : `Build evidence reports ${text(evidence?.status, 80, "an update")}.` };
  if (category === "git") return { kind: "changes", summary: `${Number(evidence?.changedPaths) || 0} changed path${Number(evidence?.changedPaths) === 1 ? " was" : "s were"} recorded.` };
  if (category === "service") return { kind: "service", summary: evidence?.ready ? "Service readiness evidence was recorded." : "Service health evidence was updated." };
  return { kind: "result", summary: `${text(category, 80, "Operational")} evidence was recorded.` };
}

function verificationKind(category) {
  if (category === "git") return "changes";
  if (["tests", "build", "service"].includes(category)) return category;
  return "result";
}

function evidenceVerifies(category, evidence) {
  if (category === "git") return Number(evidence?.changedPaths) > 0;
  if (category === "tests") return (Number(evidence?.passed) > 0 || evidence?.status === "passed") && Number(evidence?.failed || evidence?.suitesFailed || 0) === 0;
  if (category === "build") return evidence?.status === "completed";
  if (category === "service") return evidence?.ready === true || evidence?.health === "confirmed";
  return category === "result" && evidence?.status === "completed";
}

function setPhase(mission, phase, reason, source, now) {
  if (!MISSION_PHASES.includes(phase)) return false;
  const changed = mission.phase !== phase;
  mission.phase = phase;
  if (phase === "completed") mission.status = "completed";
  if (phase === "cancelled") mission.status = "cancelled";
  if (changed) mission.lifecycle = [...mission.lifecycle, lifecycleEntry(phase, reason, source, now)].slice(-MAX_MISSION_LIFECYCLE);
  return changed;
}

function applyMissionEvent(missionValue, type, payload = {}, snapshot = {}, now = Date.now()) {
  const mission = clone(missionValue);
  if (mission.status !== "active") return { changed: false, mission };
  let summary = null;
  let kind = null;
  let source = "engine-lifecycle";
  let phase = mission.phase;
  if (type === "session:status") {
    if (payload.status === "starting") { phase = "starting"; kind = "starting"; summary = "The agent terminal is starting under EngineAPI ownership."; }
    else if (payload.status === "running") { phase = "executing"; kind = "execution"; summary = "The agent terminal is running; no finer action has been proven yet."; }
    else if (payload.status === "failed") { phase = "failed"; kind = "failure"; summary = "The engine reported that the agent process failed."; }
  } else if (type === "session:supervision") {
    if (payload.attentionRequired) { phase = "waiting"; kind = "approval"; summary = text(payload.attentionReason, 240, "The agent is waiting for operator review."); }
    else if (mission.currentAction?.source === "engine-evidence" && now - Number(mission.currentAction.observedAt || 0) < 2_000) return { changed: false, mission };
    else if (payload.activity === "progress") { phase = "executing"; kind = "progress"; summary = "The agent CLI emitted an observable progress signal."; }
    else if (payload.activity === "nominal") { phase = "executing"; kind = "execution"; summary = "The agent CLI emitted a nominal operational signal."; }
  } else if (type === "session:evidence") {
    source = "engine-evidence";
    const action = actionForEvidence(payload.category, payload.evidence);
    kind = action.kind;
    summary = action.summary;
    phase = ["tests", "build"].includes(payload.category) ? "verifying" : "executing";
    if (evidenceVerifies(payload.category, payload.evidence)) {
      const expected = verificationKind(payload.category);
      const checkpoint = mission.checkpoints.find(item => item.verification === expected && item.state !== "verified");
      if (checkpoint) {
        checkpoint.state = "verified";
        checkpoint.evidenceId = payload.recordId || null;
        checkpoint.updatedAt = now;
      }
    }
  } else if (type === "session:exit") {
    if (payload.exitCode === 0) { phase = "review"; kind = "review"; summary = "The agent process exited successfully; mission completion still requires evidence or operator review."; }
    else { phase = "failed"; kind = "failure"; summary = `The agent process exited with code ${Number.isInteger(payload.exitCode) ? payload.exitCode : "unknown"}.`; }
  } else if (type === "session:spawn-error") {
    phase = "failed"; kind = "failure"; summary = "The agent process could not be started.";
  }
  if (!summary) return { changed: false, mission };
  const previousAction = JSON.stringify(mission.currentAction || null);
  mission.currentAction = { kind, summary, source, observedAt: now, evidenceId: payload.recordId || null };
  const phaseChanged = setPhase(mission, phase, summary, source, now);
  mission.progress = progressFor(mission.checkpoints);
  mission.updatedAt = now;
  return { changed: phaseChanged || previousAction !== JSON.stringify(mission.currentAction), mission };
}

function requestMissionApproval(missionValue, value = {}, now = Date.now(), id = `approval-${now}`) {
  const mission = clone(missionValue);
  const requestedScopes = MISSION_SCOPES.filter(scope => Array.isArray(value.scopes) && value.scopes.includes(scope));
  if (!requestedScopes.length) throw new TypeError("mission approval requires at least one valid scope");
  const approval = {
    id: identifier(id, `approval-${now}`, 160),
    missionId: mission.id,
    agentId: mission.agentId,
    state: "pending",
    requestedScopes,
    reason: text(value.reason, 500, "The agent requested additional authority."),
    impact: text(value.impact, 500, "Allows one recorded instruction to use the requested scopes."),
    createdAt: now,
    expiresAt: now + MISSION_APPROVAL_TTL_MS,
    resolvedAt: null,
    consumedAt: null
  };
  mission.approvals = [...mission.approvals, approval].slice(-MAX_MISSION_APPROVALS);
  setPhase(mission, "waiting", "A mission permission request is waiting in Needs You.", "agent-request", now);
  mission.currentAction = { kind: "approval", summary: "Waiting for a one-time permission decision in Needs You.", source: "agent-request", observedAt: now, evidenceId: null };
  mission.updatedAt = now;
  return { mission, approval: clone(approval) };
}

function expireMissionApprovals(missionValue, now = Date.now()) {
  const mission = clone(missionValue);
  let changed = false;
  for (const approval of mission.approvals) {
    if (approval.state === "pending" && approval.expiresAt <= now) {
      approval.state = "expired";
      approval.resolvedAt = now;
      changed = true;
    }
  }
  if (changed) mission.updatedAt = now;
  return { mission, changed };
}

module.exports = {
  CHECKPOINT_KINDS,
  MAX_MISSION_APPROVALS,
  MAX_MISSION_CHECKPOINTS,
  MAX_MISSION_LIFECYCLE,
  MAX_MISSION_RELATED_WORKERS,
  MISSION_APPROVAL_TTL_MS,
  MISSION_PHASES,
  MISSION_SCOPES,
  applyMissionEvent,
  expireMissionApprovals,
  lifecycleEntry,
  normalizeMission,
  progressFor,
  requestMissionApproval,
  setPhase,
  text
};
