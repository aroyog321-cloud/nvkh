"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { EngineAPI } = require("../src/engine/index.cjs");
const { makeFakePtyFactory } = require("./fakePty.cjs");
const {
  MAX_CONTEXT_BYTES,
  MAX_CONTEXT_OUTPUT_LINES,
  MissionContextService,
  serializedBytes
} = require("../src/service/missionContext.cjs");

function engineStub() {
  const sessions = [{
    id: "backend",
    name: "Backend",
    command: "npm run dev --token=inline-secret",
    cwd: "/project/apps/backend",
    envKeys: ["API_KEY"],
    status: "failed",
    isAlive: false,
    activity: "claim",
    runtimeMs: 1200,
    startTime: 10,
    lastOutputAt: 20,
    exitCode: 1,
    attentionRequired: true,
    attentionReason: "password=hunter2 connection refused",
    attentionSince: 20,
    health: { tone: "critical", label: "Failed", summary: "token=super-secret" },
    resources: null,
    dependencyImpact: { downstreamCount: 2, downstreamIds: ["frontend", "tests"] },
    evidence: { service: { ready: false, health: "failed" } }
    ,inputEvidence: [{ sequence: 1, at: 19, source: "mission-ai", kind: "command", preview: "npm test", redacted: false, byteLength: 8 }]
  }];
  return {
    getWorkspace: () => ({ name: "Project", directory: "/project", persistent: true, loadErrorCount: 0 }),
    list: () => sessions,
    getSnapshot: id => ({ ...sessions.find(session => session.id === id), recentLines: [
      ...Array.from({ length: 20 }, (_, index) => `line ${index}`),
      "Authorization: Bearer abcdefghijklmnop"
    ] }),
    listAttention: () => ({ records: [{ id: "attention-1", sessionId: "backend", reason: "api_key=do-not-share" }] }),
    listMissions: () => [{ id: "mission-1", agentId: "agent-codex", title: "Repair backend", evidence: [] }],
    listRecipes: () => [{ id: "daily", name: "Daily", steps: [{ workerId: "backend", dependsOn: [] }] }],
    getProjectMemory: () => ({ generatedAt: 100, latestSequence: 9, since: { summary: "1 unresolved run" }, chapters: [], causalLinks: [], resumePoints: [], current: [] }),
    getActivity: () => ({ events: [{ sequence: 9, type: "session:exit", reason: "secret=activity-secret" }] })
  };
}

test("Mission Context produces bounded grounded state and omits terminal output by default", () => {
  const context = new MissionContextService({
    getEngineApi: engineStub,
    getVSCodeStatus: () => ({
      connected: true,
      service: "listening",
      connection: { extensionVersion: "0.1.0", connectedAt: 50, capabilities: ["terminals.identity.read"] },
      editor: { relativePath: "src/app.js", line: 2 },
      diagnostics: { errors: 1, warnings: 0, items: [] },
      terminals: [{ name: "npm dev", state: "open" }],
      tasks: [],
      lastSyncAt: 90
    }),
    now: () => 100
  }).snapshot();

  assert.equal(context.contextVersion, 1);
  assert.equal(context.generatedAt, 100);
  assert.equal(context.overall.status, "needs-attention");
  assert.equal(context.workers[0].ownership, "MISSION_CONTROL_OWNED");
  assert.equal(context.workers[0].role, "backend");
  assert.match(context.workers[0].currentActivity, /Failed/);
  assert.equal(context.workers[0].cwd, "apps/backend");
  assert.equal("recentOutput" in context.workers[0], false);
  assert.equal(context.visibility.terminalOutput, "omitted");
  assert.equal(context.visibility.sensitiveData, "redacted");
  assert.equal(context.integrations.vscode.terminals[0].ownership, "vscode-owned");
  assert.equal(context.integrations.vscode.terminals[0].observability, "identity-only");
  assert.equal(JSON.stringify(context).includes("inline-secret"), false);
  assert.equal(JSON.stringify(context).includes("hunter2"), false);
  assert.equal(JSON.stringify(context).includes("activity-secret"), false);
  assert.ok(context.privacy.redactionCount >= 4);
  assert.equal(context.budget.bytes, serializedBytes(context));
  assert.ok(serializedBytes(context) <= MAX_CONTEXT_BYTES);
});

test("Mission Context includes only requested bounded sanitized terminal evidence", () => {
  const context = new MissionContextService({ getEngineApi: engineStub }).snapshot({
    includeOutput: true,
    workerIds: ["backend", "missing"]
  });

  assert.equal(context.visibility.terminalOutput, "sanitized-bounded");
  assert.equal(context.workers[0].recentOutput.length, MAX_CONTEXT_OUTPUT_LINES);
  assert.equal(context.workers[0].terminalEvidence.input[0].source, "mission-ai");
  assert.equal(context.workers[0].terminalEvidence.output.at(-1).source, "pty");
  assert.match(context.workers[0].recentOutput.at(-1), /Bearer \[REDACTED\]/);
  assert.equal(JSON.stringify(context).includes("abcdefghijklmnop"), false);
});

test("Mission Context rejects unsupported or unbounded caller options", () => {
  const service = new MissionContextService({ getEngineApi: engineStub });
  assert.throws(() => service.snapshot({ includeOutput: "yes" }), /includeOutput/);
  assert.throws(() => service.snapshot({ workerIds: [null] }), /workerIds/);
  assert.throws(() => service.snapshot({ arbitrary: true }), /unsupported/);
});

test("Mission Context composes the real public EngineAPI without reading engine internals", t => {
  const factory = makeFakePtyFactory();
  const api = new EngineAPI({ ptyFactory: factory, resourceSampleIntervalMs: 0 });
  t.after(() => api.dispose());
  api.loadProject({ sessions: [{ id: "api", name: "API", command: "node server.js", cwd: "." }] });
  factory.last().emitData("Error: database connection refused token=do-not-export\r\n");

  const context = new MissionContextService({ getEngineApi: () => api }).snapshot({ includeOutput: true });
  assert.equal(context.workers.length, 1);
  assert.equal(context.workers[0].id, "api");
  assert.equal(context.workers[0].state, "needs-you");
  assert.equal(context.attention.length, 1);
  assert.equal(context.projectMemory.chapters.length, 1);
  assert.equal(JSON.stringify(context).includes("do-not-export"), false);
});
