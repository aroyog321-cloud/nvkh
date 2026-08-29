const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");

const modelUrl = pathToFileURL(
  path.resolve(__dirname, "../src/groundstation/renderer/missionGraphModel.js")
).href;

test("Mission Graph stages configured recipe dependencies without inferring relationships", async () => {
  const { buildMissionGraph } = await import(`${modelUrl}?branch=${Date.now()}`);
  const recipe = {
    steps: [
      { workerId: "db", dependsOn: [], readiness: "service" },
      { workerId: "api", dependsOn: ["db"], readiness: "healthy" },
      { workerId: "web", dependsOn: ["api"], readiness: "running" },
      { workerId: "tests", dependsOn: ["api"], readiness: "tests" }
    ]
  };
  const sessions = [
    { id: "db", name: "Database", isAlive: true, status: "running" },
    { id: "api", name: "API", isAlive: true, status: "running" },
    { id: "web", name: "Web", isAlive: false, status: "idle" },
    { id: "tests", name: "Tests", isAlive: false, status: "failed" },
    { id: "agent", name: "Agent", isAlive: true, status: "running" }
  ];

  const graph = buildMissionGraph(recipe, sessions);
  assert.deepEqual(graph.columns.map(column => column.map(node => node.workerId)), [
    ["db"],
    ["api"],
    ["web", "tests"]
  ]);
  assert.equal(graph.workerCount, 4);
  assert.equal(graph.edgeCount, 3);
  assert.equal(graph.blockedCount, 1);
  assert.deepEqual(graph.unlinked.map(session => session.id), ["agent"]);
  assert.deepEqual(graph.columns[1][0].downstream, ["web", "tests"]);
});

test("Mission Graph reports cyclic recipes and remains bounded", async () => {
  const { buildMissionGraph } = await import(`${modelUrl}?cycle=${Date.now()}`);
  const graph = buildMissionGraph({
    steps: [
      { workerId: "a", dependsOn: ["b"] },
      { workerId: "b", dependsOn: ["a"] }
    ]
  }, [
    { id: "a", status: "idle" },
    { id: "b", status: "idle" }
  ]);

  assert.equal(graph.workerCount, 2);
  assert.deepEqual(new Set(graph.cyclicIds), new Set(["a", "b"]));
  assert.deepEqual(graph.columns.flat().map(node => node.workerId), ["a", "b"]);
  assert.equal(graph.edgeCount, 2);
});

test("Mission Graph readiness and worker tones use authoritative engine state", async () => {
  const { readinessLabel, workerTone } = await import(`${modelUrl}?state=${Date.now()}`);
  assert.equal(readinessLabel("service"), "Service ready");
  assert.equal(readinessLabel("unknown"), "Process running");
  assert.equal(workerTone(null), "missing");
  assert.equal(workerTone({ status: "failed", attentionRequired: true }), "failed");
  assert.equal(workerTone({ status: "idle", attentionRequired: true }), "attention");
  assert.equal(workerTone({ status: "running", isAlive: true }), "running");
  assert.equal(workerTone({ status: "idle", isAlive: false }), "idle");
});
