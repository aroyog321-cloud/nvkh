const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  MISSION_APPROVAL_TTL_MS,
  applyMissionEvent,
  expireMissionApprovals,
  normalizeMission,
  requestMissionApproval
} = require("../src/engine/missionSupervision.cjs");

test("mission supervision derives only observable progress and never a percentage", () => {
  const mission = normalizeMission({
    agentId: "agent-codex-demo",
    title: "Verify release",
    scopes: ["read"],
    checkpoints: [
      { id: "tests", title: "Tests pass", verification: "tests" },
      { id: "review", title: "Operator review", verification: "manual" }
    ]
  }, { knownWorkers: new Set(["agent-codex-demo"]), now: 100 });
  const updated = applyMissionEvent(mission, "session:evidence", {
    id: "agent-codex-demo",
    category: "tests",
    evidence: { passed: 24, failed: 0 },
    recordId: "evidence-1"
  }, {}, 200).mission;

  assert.equal(updated.phase, "verifying");
  assert.equal(updated.progress.verified, 1);
  assert.equal(updated.progress.total, 2);
  assert.equal(updated.progress.basis, "observable-checkpoints");
  assert.equal(Object.hasOwn(updated.progress, "percentage"), false);
  assert.match(updated.currentAction.summary, /24 passed/);
  assert.equal(JSON.stringify(updated).includes("chain-of-thought"), false);
});

test("mission permission requests expire without granting authority", () => {
  const mission = normalizeMission({ agentId: "agent-codex-demo", title: "Ship", scopes: ["read"] }, { now: 100 });
  const requested = requestMissionApproval(mission, { scopes: ["write"], reason: "Change manifest", impact: "One write" }, 200, "approval-1");
  assert.equal(requested.approval.expiresAt, 200 + MISSION_APPROVAL_TTL_MS);
  const expired = expireMissionApprovals(requested.mission, requested.approval.expiresAt);
  assert.equal(expired.changed, true);
  assert.equal(expired.mission.approvals[0].state, "expired");
  assert.equal(expired.mission.scopes.includes("write"), false);
});
