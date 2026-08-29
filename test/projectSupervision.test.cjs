"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  MAX_SUPERVISION_BYTES,
  ProjectSupervisionService,
  serializedBytes
} = require("../src/service/projectSupervision.cjs");

function context(overrides = {}) {
  return {
    contextVersion: 1,
    generatedAt: 90,
    project: { name: "Project", persistent: true, workerCount: 2, loadErrorCount: 0 },
    overall: { status: "needs-attention", statement: "One worker requires attention.", counts: { total: 2, running: 1, failed: 1 } },
    workers: [
      { id: "api", name: "API", role: "backend", ownership: "MISSION_CONTROL_OWNED", source: "EngineAPI", state: "running", lifecycle: "running", currentActivity: "Running; recent terminal activity", lastOutputAt: 80, evidence: { service: { port: 3000 } }, attention: { required: false } },
      { id: "tests", name: "Tests", role: "tests", ownership: "MISSION_CONTROL_OWNED", source: "EngineAPI", state: "failed", lifecycle: "failed", currentActivity: "Failed; awaiting operator review", exitCode: 1, attention: { required: true, reason: "Tests failed", since: 70 }, evidence: { tests: { passed: 8, failed: 1 } } }
    ],
    attention: [],
    missions: [],
    projectMemory: { chapters: [{ id: "run-1", status: "failed" }] },
    recipes: [{ id: "daily", name: "Daily stack", steps: [{ workerId: "api", dependsOn: [] }] }],
    activity: [{ sequence: 12, type: "session:failed", id: "tests", timestamp: 75, reason: "exit-code" }],
    integrations: { vscode: { connected: true, lastSyncAt: 85, diagnostics: { errors: 1, warnings: 2 }, git: { branch: "main", changedPaths: 3 }, terminals: [{ id: "terminal-1", name: "Shell", ownership: "vscode-owned", commandState: "running" }] } },
    visibility: { terminalOutput: "omitted", terminalInput: "omitted" },
    privacy: { policy: "structured-bounded-redacted", redactionCount: 0 },
    ...overrides
  };
}

test("Project Supervision separates facts and inferences behind stable evidence IDs", () => {
  const calls = [];
  const service = new ProjectSupervisionService({ missionContext: { snapshot: options => { calls.push(options); return context(); } }, now: () => 100 });
  const snapshot = service.snapshot({ afterSequence: 10, includeOutput: false });

  assert.equal(snapshot.supervisionVersion, 1);
  assert.equal(snapshot.overview.whatIsRunning.items[0].workerId, "api");
  assert.equal(snapshot.overview.whatNeedsYou.items[0].workerId, "tests");
  assert.equal(snapshot.facts.workers[1].evidenceId, "worker:tests");
  assert.equal(snapshot.inferences[0].kind, "inference");
  assert.deepEqual(snapshot.inferences[0].basedOn, ["worker:tests"]);
  assert.ok(snapshot.evidenceIndex.some(item => item.id === "activity:12"));
  assert.ok(snapshot.evidenceIndex.some(item => item.id === "vscode:diagnostics"));
  assert.ok(snapshot.evidenceIndex.some(item => item.id === "supervision:overview"));
  assert.equal(snapshot.visibility.factsAndInferencesSeparated, true);
  assert.deepEqual(calls, [{ afterSequence: 10, includeOutput: false }]);
  assert.ok(serializedBytes(snapshot) <= MAX_SUPERVISION_BYTES);
  assert.equal(JSON.stringify(snapshot).includes("raw output"), false);
});

test("Project Supervision remains bounded for noisy workspaces", () => {
  const noisy = context({
    workers: Array.from({ length: 80 }, (_, index) => ({ id: `worker-${index}`, name: `Worker ${index}`, role: "terminal", ownership: "MISSION_CONTROL_OWNED", source: "EngineAPI", state: "running", lifecycle: "running", currentActivity: "Running", evidence: { build: { artifacts: Array.from({ length: 200 }, () => "x".repeat(500)) } }, attention: { required: false } })),
    activity: Array.from({ length: 200 }, (_, index) => ({ sequence: index + 1, type: "session:progress", id: `worker-${index % 50}`, timestamp: index + 1 }))
  });
  const snapshot = new ProjectSupervisionService({ missionContext: { snapshot: () => noisy } }).snapshot();
  assert.ok(snapshot.facts.workers.length <= 50);
  assert.ok(snapshot.facts.history.length <= 20);
  assert.ok(serializedBytes(snapshot) <= MAX_SUPERVISION_BYTES);
});
