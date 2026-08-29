const crypto = require("node:crypto");

const AUTOMATION_LIMIT = 24;
const APPROVAL_TTL_MS = 30 * 60 * 1000;
const AUDIT_LIMIT = 200;
const TRIGGERS = new Set(["worker-failed", "worker-needs-you", "worker-exited", "recipe-failed"]);
const ACTIONS = new Set(["start-worker", "restart-worker", "acknowledge-worker", "run-recipe"]);

function text(value, field, limit = 120) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} is required`);
  const normalized = value.trim();
  if (normalized.length > limit) throw new TypeError(`${field} cannot exceed ${limit} characters`);
  return normalized;
}

function normalizeAutomation(value, options = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("automation must be an object");
  const previous = options.previous || null;
  const now = options.now || Date.now();
  const triggerType = text(value.trigger?.type, "trigger type", 40);
  const actionType = text(value.action?.type, "action type", 40);
  if (!TRIGGERS.has(triggerType)) throw new TypeError("automation trigger is not supported");
  if (!ACTIONS.has(actionType)) throw new TypeError("automation action is not supported");
  const triggerTargetId = value.trigger?.targetId ? text(value.trigger.targetId, "trigger target", 64) : null;
  const actionTargetId = text(value.action?.targetId, "action target", 64);
  const cooldownMs = Math.min(24 * 60 * 60 * 1000, Math.max(30_000, Number(value.cooldownMs) || 300_000));
  return {
    id: previous?.id || (value.id ? text(value.id, "automation id", 80) : `automation-${crypto.randomUUID()}`),
    name: text(value.name, "automation name", 80),
    enabled: value.enabled === true,
    trigger: { type: triggerType, targetId: triggerTargetId },
    action: { type: actionType, targetId: actionTargetId },
    cooldownMs,
    approval: "always",
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    lastMatchedAt: previous?.lastMatchedAt || null
  };
}

function eventMatches(automation, type, payload = {}) {
  const target = automation.trigger.targetId;
  if (target && target !== payload.id && target !== payload.sessionId && target !== payload.recipeId) return false;
  if (automation.trigger.type === "worker-failed") {
    return type === "session:spawn-error" || (type === "session:status" && payload.status === "failed") || (type === "session:exit" && Number(payload.exitCode) !== 0);
  }
  if (automation.trigger.type === "worker-needs-you") {
    return type === "session:supervision" && payload.attentionRequired === true;
  }
  if (automation.trigger.type === "worker-exited") return type === "session:exit";
  return automation.trigger.type === "recipe-failed" && type === "recipe:run" && payload.phase === "failed";
}

function expireApprovals(approvals, now = Date.now()) {
  let changed = false;
  const next = approvals.map(item => {
    if (item.state !== "pending" || item.expiresAt > now) return item;
    changed = true;
    return { ...item, state: "expired", resolvedAt: now };
  });
  return { changed, approvals: next };
}

function createApproval(automation, event, now = Date.now()) {
  return {
    id: `automation-approval-${crypto.randomUUID()}`,
    automationId: automation.id,
    automationName: automation.name,
    trigger: { type: automation.trigger.type, sourceType: event.type, targetId: event.id || event.sessionId || event.recipeId || null },
    action: { ...automation.action },
    state: "pending",
    createdAt: now,
    expiresAt: now + APPROVAL_TTL_MS,
    resolvedAt: null
  };
}

function auditRecord(kind, detail = {}, now = Date.now()) {
  return { id: `automation-audit-${crypto.randomUUID()}`, kind, at: now, ...detail };
}

module.exports = {
  ACTIONS,
  APPROVAL_TTL_MS,
  AUDIT_LIMIT,
  AUTOMATION_LIMIT,
  TRIGGERS,
  auditRecord,
  createApproval,
  eventMatches,
  expireApprovals,
  normalizeAutomation
};
