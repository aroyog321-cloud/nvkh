const assert = require("node:assert/strict");
const { test } = require("node:test");
const { EngineAPI } = require("../src/engine/index.cjs");
const { makeFakePtyFactory } = require("./fakePty.cjs");
const {
  MAX_CAUSAL_LINKS,
  MAX_CHAPTER_EVENTS,
  MAX_MEMORY_CHAPTERS,
  MAX_RESUME_POINTS,
  buildProjectMemory
} = require("../src/engine/projectMemory.cjs");

function event(sequence, correlationId, type, extra = {}) {
  return {
    sequence,
    timestamp: 1_700_000_000_000 + sequence,
    correlationId,
    id: extra.id || "api",
    name: extra.name || "API",
    type,
    ...extra
  };
}

test("Project Memory links a failed run to a later verified recovery for the same worker", () => {
  const events = [
    event(1, "api:run:1", "session:status", { status: "running" }),
    event(2, "api:run:1", "session:evidence", { category: "tests", evidence: { status: "failed", passed: 7, failed: 2 } }),
    event(3, "api:run:1", "session:status", { status: "failed" }),
    event(4, "api:run:1", "session:exit", { exitCode: 2 }),
    event(5, "api:run:2", "session:status", { status: "running" }),
    event(6, "api:run:2", "session:evidence", { category: "tests", evidence: { status: "passed", passed: 9, failed: 0 } })
  ];
  const sessions = [{ id: "api", name: "API", correlationId: "api:run:2", isAlive: true, status: "running", lastOutputAt: 1_700_000_000_006 }];

  const memory = buildProjectMemory(events, sessions, { afterSequence: 1, latestSequence: 6 });
  const failedRun = memory.chapters.find(chapter => chapter.correlationId === "api:run:1");
  const recovery = memory.causalLinks.find(link => link.type === "recovery");

  assert.equal(failedRun.state, "recovered");
  assert.match(failedRun.summary, /recovered in a later run/);
  assert.deepEqual(recovery, {
    type: "recovery",
    fromChapterId: "api:run:1",
    toChapterId: "api:run:2",
    sessionId: "api",
    basis: "same worker plus later verified evidence",
    verifiedBySequence: 6
  });
  assert.equal(memory.resumePoints[0].workerId, "api");
  assert.equal(memory.resumePoints[0].chapterId, "api:run:2");
  assert.equal(memory.since.recoveredCount, 1);
  assert.equal(memory.latestSequence, 6);
});

test("Project Memory reports retrying until a later run records success evidence", () => {
  const memory = buildProjectMemory([
    event(1, "api:run:1", "session:evidence", { category: "build", evidence: { status: "failed" } }),
    event(2, "api:run:1", "session:exit", { exitCode: 1 }),
    event(3, "api:run:2", "session:status", { status: "running" })
  ], [{ id: "api", name: "API", correlationId: "api:run:2", isAlive: true, status: "running" }]);

  const failedRun = memory.chapters.find(chapter => chapter.correlationId === "api:run:1");
  assert.equal(failedRun.state, "retrying");
  assert.match(failedRun.summary, /verification has not been recorded/);
  assert.equal(memory.causalLinks[0].type, "retry");
  assert.equal(memory.causalLinks[0].verifiedBySequence, null);
});

test("Project Memory can verify recovery inside one correlated run", () => {
  const memory = buildProjectMemory([
    event(1, "web:run:1", "session:evidence", { id: "web", name: "Web", category: "service", evidence: { health: "failed" } }),
    event(2, "web:run:1", "session:evidence", { id: "web", name: "Web", category: "service", evidence: { ready: true } })
  ]);

  assert.equal(memory.chapters[0].state, "recovered");
  assert.equal(memory.chapters[0].verification, "the service reported ready");
  assert.equal(memory.causalLinks.length, 0);
});

test("Project Memory never fabricates causality between different workers", () => {
  const memory = buildProjectMemory([
    event(1, "api:run:1", "session:evidence", { category: "tests", evidence: { status: "failed", failed: 1 } }),
    event(2, "web:run:1", "session:evidence", { id: "web", name: "Web", category: "tests", evidence: { status: "passed", passed: 1, failed: 0 } })
  ]);

  assert.equal(memory.causalLinks.length, 0);
  assert.equal(memory.chapters.find(chapter => chapter.sessionId === "api").state, "unresolved");
});

test("Project Memory bounds chapters, chapter evidence, relationships, and resume points", () => {
  const events = [];
  for (let run = 1; run <= 28; run++) {
    for (let index = 1; index <= 34; index++) {
      const sequence = (run - 1) * 34 + index;
      events.push(event(sequence, `api:run:${run}`, "session:status", { status: index === 34 ? "running" : "starting" }));
    }
  }
  const sessions = Array.from({ length: 8 }, (_, index) => ({ id: `worker-${index}`, name: `Worker ${index}`, isAlive: index < 6, status: index === 0 ? "failed" : "running" }));
  const memory = buildProjectMemory(events, sessions);

  assert.equal(memory.chapters.length, MAX_MEMORY_CHAPTERS);
  assert.ok(memory.chapters.every(chapter => chapter.events.length <= MAX_CHAPTER_EVENTS));
  assert.ok(memory.causalLinks.length <= MAX_CAUSAL_LINKS);
  assert.equal(memory.resumePoints.length, MAX_RESUME_POINTS);
});

test("EngineAPI owns the Project Memory snapshot and current resume targets", t => {
  const factory = makeFakePtyFactory();
  const api = new EngineAPI({ ptyFactory: factory });
  t.after(() => api.dispose());
  api.loadProject({ sessions: [{ id: "api", name: "API", command: "node server.js", cwd: "." }] });

  const memory = api.getProjectMemory({ afterSequence: 0 });

  assert.equal(memory.current[0].id, "api");
  assert.equal(memory.resumePoints[0].workerId, "api");
  assert.equal(memory.resumePoints[0].state, "running");
  assert.equal(memory.chapters[0].sessionId, "api");
  assert.equal(memory.latestSequence, api.getActivity().latestSequence);
});
