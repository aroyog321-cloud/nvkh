"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  MissionSupervisorService,
  normalizePlan
} = require("../src/service/missionSupervisor.cjs");

function engineStub() {
  const workers = new Map([["existing", { id: "existing", isAlive: true }]]);
  const calls = [];
  const events = [];
  return {
    calls,
    events,
    workers,
    getWorkspace: () => ({ persistent: true, directory: "/project", name: "Project" }),
    list: () => [...workers.values()],
    listRecipes: () => [{ id: "daily" }],
    getSnapshot: id => workers.get(id) || null,
    create(definition) { calls.push(["create", definition]); workers.set(definition.id, { ...definition, isAlive: false }); return { ok: true, session: workers.get(definition.id) }; },
    start(id) { calls.push(["start", id]); workers.get(id).isAlive = true; return { ok: true }; },
    restart(id) { calls.push(["restart", id]); return { ok: true }; },
    kill(id) { calls.push(["kill", id]); workers.get(id).isAlive = false; return { ok: true }; },
    write(id, data, options) { calls.push(["write", id, data, options]); return true; },
    runRecipe(id, options) { calls.push(["runRecipe", id, options]); return { ok: true }; },
    saveRecipe(recipe) { calls.push(["saveRecipe", recipe]); return { ok: true, recipe }; },
    recordSupervisorEvent(kind, payload) { events.push([kind, payload]); return { ok: true }; }
  };
}

test("Mission Supervisor validates project boundaries and executable-only worker plans", () => {
  const engine = engineStub();
  assert.throws(() => normalizePlan({ summary: "bad", actions: [{ type: "create-worker", id: "bad", command: "npm && erase", cwd: "." }] }, engine), /one executable/);
  assert.throws(() => normalizePlan({ summary: "bad", actions: [{ type: "create-worker", id: "bad", command: "npm", cwd: "../outside" }] }, engine), /inside the active project/);
  assert.throws(() => normalizePlan({ summary: "bad", actions: [{ type: "terminal-input", workerId: "existing", input: "token=super-secret" }] }, engine), /contain a secret/);
  assert.throws(() => normalizePlan({ summary: "cycle", actions: [{ type: "create-profile", id: "web-stack", workers: [{ id: "api", command: "npm", args: ["run", "api"] }, { id: "web", command: "npm", args: ["run", "web"] }], steps: [{ workerId: "api", dependsOn: ["web"] }, { workerId: "web", dependsOn: ["api"] }] }] }, engine), /dependency cycle/);
  assert.throws(() => normalizePlan({ summary: "duplicate", actions: [{ type: "create-profile", id: "web-stack", workers: [{ id: "api", command: "npm" }, { id: "api", command: "node" }] }] }, engine), /duplicated/);
});

test("Mission Supervisor validates dependency-aware profiles before approval", () => {
  const engine = engineStub();
  const plan = normalizePlan({ summary: "Daily web stack", actions: [
    { type: "create-profile", id: "web-stack", name: "Web stack", workers: [
      { id: "api", name: "API", command: "npm", args: ["run", "api"], cwd: "." },
      { id: "web", name: "Web", command: "npm", args: ["run", "web"], cwd: "." }
    ], steps: [
      { workerId: "existing", dependsOn: [], readiness: "running" },
      { workerId: "api", dependsOn: ["existing"], readiness: "service" },
      { workerId: "web", dependsOn: ["api"], readiness: "running" }
    ], maxParallel: 2, reason: "Create dependency graph" },
    { type: "run-recipe", recipeId: "web-stack", reason: "Run only after approval" }
  ] }, engine);
  assert.equal(plan.actions[0].profile.recipe.recipeVersion, 2);
  assert.deepEqual(plan.actions[0].profile.recipe.steps.map(step => [step.workerId, step.dependsOn]), [["existing", []], ["api", ["existing"]], ["web", ["api"]]]);
  assert.equal(plan.actions[1].recipeId, "web-stack");
  assert.deepEqual(engine.calls, []);
});

test("Mission Supervisor creates a pending exact-action approval before any mutation", async () => {
  const engine = engineStub();
  const service = new MissionSupervisorService({
    getEngineApi: () => engine,
    randomUUID: () => "approval-1",
    now: () => 100,
    missionAi: { plan: async () => ({ provider: "gemini", model: "gemini-2.5-flash", plan: {
      summary: "Create and start backend",
      assumptions: ["npm run dev exists"],
      actions: [
        { type: "create-worker", id: "backend", name: "Backend", command: "npm", args: ["run", "dev"], cwd: ".", reason: "Backend role" },
        { type: "start", workerId: "backend", reason: "Start after creation" },
        { type: "terminal-input", workerId: "backend", input: "npm test", reason: "Run tests" }
      ]
    } }) }
  });

  const approval = await service.propose({ instruction: "Create backend and run tests" });
  assert.equal(approval.state, "pending");
  assert.equal(engine.calls.length, 0, "planning must not mutate the engine");
  assert.equal(service.status().pendingApprovalCount, 1);
  assert.deepEqual(engine.events.map(event => event[0]), ["plan-requested"]);

  const executed = await service.resolve("approval-1", "approve");
  assert.equal(executed.state, "executed");
  assert.deepEqual(engine.calls.map(call => call[0]), ["create", "start", "write"]);
  assert.deepEqual(engine.calls[2].slice(1), ["backend", "npm test\r", { source: "mission-ai" }]);
  assert.equal(executed.results.every(result => result.ok), true);
  assert.deepEqual(engine.events.map(event => event[0]), [
    "plan-requested", "plan-approved",
    "action-started", "action-verified",
    "action-started", "action-verified",
    "action-started", "action-verified"
  ]);
});

test("Mission Supervisor denial and expiry never execute actions", async () => {
  const engine = engineStub();
  let now = 10;
  let id = 0;
  const service = new MissionSupervisorService({
    getEngineApi: () => engine,
    randomUUID: () => `approval-${++id}`,
    now: () => now,
    missionAi: { plan: async () => ({ provider: "gemini", model: "test", plan: { summary: "Stop", actions: [{ type: "stop", workerId: "existing", reason: "Requested" }] } }) }
  });
  await service.propose({ instruction: "Stop it" });
  assert.equal((await service.resolve("approval-1", "deny")).state, "denied");
  assert.equal(engine.calls.length, 0);
  await service.propose({ instruction: "Stop later" });
  now += 16 * 60 * 1000;
  assert.equal(service.listApprovals().find(item => item.id === "approval-2").state, "expired");
  await assert.rejects(() => service.resolve("approval-2", "approve"), /already expired/);
  assert.equal(engine.calls.length, 0);
});
