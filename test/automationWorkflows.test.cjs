const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { EngineAPI } = require("../src/engine/index.cjs");
const { makeFakePtyFactory } = require("./fakePty.cjs");
const {
  APPROVAL_TTL_MS,
  createApproval,
  eventMatches,
  expireApprovals,
  normalizeAutomation
} = require("../src/engine/automationWorkflows.cjs");

test("automation workflows normalize bounded approval-gated actions", () => {
  const workflow = normalizeAutomation({
    name: "Recover API",
    enabled: true,
    trigger: { type: "worker-failed", targetId: "api" },
    action: { type: "restart-worker", targetId: "api" },
    cooldownMs: 1
  }, { now: 100 });
  assert.equal(workflow.approval, "always");
  assert.equal(workflow.cooldownMs, 30_000);
  assert.equal(eventMatches(workflow, "session:status", { id: "api", status: "failed" }), true);
  assert.equal(eventMatches(workflow, "session:status", { id: "web", status: "failed" }), false);
  assert.throws(() => normalizeAutomation({ name: "unsafe", trigger: { type: "timer" }, action: { type: "shell", targetId: "api" } }), /not supported/);
});

test("automation approvals expire without executing their action", () => {
  const workflow = normalizeAutomation({ name: "Recover API", trigger: { type: "worker-failed" }, action: { type: "restart-worker", targetId: "api" } }, { now: 100 });
  const approval = createApproval(workflow, { type: "session:status", id: "api" }, 200);
  assert.equal(approval.expiresAt, 200 + APPROVAL_TTL_MS);
  assert.equal(approval.state, "pending");
  assert.equal(Object.hasOwn(approval, "executedAt"), false);
  const expired = expireApprovals([approval], approval.expiresAt);
  assert.equal(expired.changed, true);
  assert.equal(expired.approvals[0].state, "expired");
});

test("recipe failure triggers remain explicit and target-scoped", () => {
  const workflow = normalizeAutomation({ name: "Recover stack", trigger: { type: "recipe-failed", targetId: "dev-stack" }, action: { type: "run-recipe", targetId: "dev-stack" } });
  assert.equal(eventMatches(workflow, "recipe:run", { recipeId: "dev-stack", phase: "failed" }), true);
  assert.equal(eventMatches(workflow, "recipe:run", { recipeId: "dev-stack", phase: "completed" }), false);
});

test("EngineAPI queues one local approval before an automation action executes", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-automation-"));
  const filePath = path.join(directory, "termctl.config.json");
  fs.writeFileSync(filePath, `${JSON.stringify({ version: 1, project: "Automation", sessions: [{ id: "api", name: "API", command: "node", autoStart: false }] }, null, 2)}\n`);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const factory = makeFakePtyFactory({ autoExitOnKill: true });
  const engine = new EngineAPI({ ptyFactory: factory, resourceSampleIntervalMs: 0 });
  t.after(() => engine.dispose());
  engine.loadProject(filePath);
  const saved = engine.saveAutomation({ name: "Recover API", enabled: true, trigger: { type: "worker-failed", targetId: "api" }, action: { type: "restart-worker", targetId: "api" }, cooldownMs: 30_000 });
  assert.equal(saved.ok, true);
  await engine.start("api");
  factory.last().emitExit(1);
  const state = engine.listAutomations();
  const pending = state.approvals.filter(item => item.state === "pending");
  assert.equal(pending.length, 1);
  assert.equal(factory.instances.length, 1, "matching a trigger must not execute the restart");
  const resolved = await engine.resolveAutomationApproval(pending[0].id, "approve");
  assert.equal(resolved.ok, true);
  assert.equal(factory.instances.length, 2, "only approved EngineAPI execution may restart the worker");
  assert.equal(engine.listAutomations().approvals[0].state, "executed");
});
