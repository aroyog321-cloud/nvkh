const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { EngineAPI } = require("../src/engine/index.cjs");
const {
  MAX_RESOURCE_WORKERS,
  ResourceSampler,
  normalizeResourceSampleInterval,
  workerHealth
} = require("../src/engine/resourceSampler.cjs");
const { makeFakePtyFactory } = require("./fakePty.cjs");

test("ResourceSampler records bounded root-process CPU and memory without exposing command output", async () => {
  const sampler = new ResourceSampler({
    totalMemoryBytes: 8 * 1024 * 1024 * 1024,
    probe: async pids => new Map(pids.map(pid => [pid, {
      cpuPercent: 34.56,
      memoryBytes: 256.25 * 1024 * 1024,
      source: "test-process"
    }]))
  });
  const sessions = Array.from({ length: MAX_RESOURCE_WORKERS + 10 }, (_, index) => ({
    id: `worker-${index}`,
    pid: 1000 + index,
    isAlive: true
  }));

  const result = await sampler.sample(sessions);
  assert.equal(result.workerCount, MAX_RESOURCE_WORKERS);
  assert.equal(result.availableCount, MAX_RESOURCE_WORKERS);
  assert.deepEqual(sampler.get("worker-0"), {
    available: true,
    scope: "root-process",
    source: "test-process",
    pid: 1000,
    cpuPercent: 34.6,
    memoryBytes: 268697600,
    memoryMB: 256.3,
    sampledAt: result.sampledAt
  });
  assert.equal(sampler.get(`worker-${MAX_RESOURCE_WORKERS}`), null);
  assert.equal(JSON.stringify(sampler.get("worker-0")).includes("command"), false);
});

test("ResourceSampler derives interval CPU from cumulative Windows-style samples", async () => {
  let now = 1000;
  let cpuSeconds = 10;
  const sampler = new ResourceSampler({
    now: () => now,
    probe: async pids => new Map([[pids[0], { cpuSeconds, memoryBytes: 64 * 1024 * 1024 }]])
  });
  const session = { id: "api", pid: 42, isAlive: true };

  await sampler.sample([session]);
  assert.equal(sampler.get("api").cpuPercent, null);
  now = 2000;
  cpuSeconds = 10.5;
  await sampler.sample([session]);
  assert.equal(sampler.get("api").cpuPercent, 50);
});

test("ResourceSampler preserves bounded process-tree ownership metrics", async () => {
  const sampler = new ResourceSampler({
    probe: async pids => new Map([[pids[0], { cpuPercent: 75, memoryBytes: 512 * 1024 * 1024, processCount: 7, scope: "process-tree", source: "windows-process-tree" }]])
  });
  await sampler.sample([{ id: "stack", pid: 77, isAlive: true }]);
  const sample = sampler.get("stack");
  assert.equal(sample.scope, "process-tree");
  assert.equal(sample.processCount, 7);
  assert.equal(sample.memoryMB, 512);
  assert.equal(Object.hasOwn(sample, "command"), false);
});

test("workerHealth prioritizes lifecycle truth and reports resource pressure without fabricating failure", () => {
  const running = { status: "running", isAlive: true, attentionRequired: false };
  assert.equal(workerHealth({ ...running, status: "failed" }, null).tone, "critical");
  assert.equal(workerHealth({ ...running, attentionRequired: true }, null).tone, "attention");
  assert.equal(workerHealth({ status: "idle", isAlive: false }, null).tone, "idle");
  assert.equal(workerHealth(running, null).tone, "observing");
  const pressure = workerHealth(running, {
    available: true,
    cpuPercent: 95,
    memoryBytes: 128 * 1024 * 1024,
    sampledAt: 5000
  }, { now: 5000, totalMemoryBytes: 8 * 1024 * 1024 * 1024 });
  assert.equal(pressure.tone, "pressure");
  assert.deepEqual(pressure.signals, ["high-cpu"]);
  assert.doesNotMatch(pressure.summary, /failed/i);
  assert.equal(normalizeResourceSampleInterval(1), 2000);
  assert.equal(normalizeResourceSampleInterval(60000), 30000);
  assert.equal(normalizeResourceSampleInterval(0), 0);
});

test("EngineAPI owns worker metrics, health, and configured dependency impact", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-intelligence-"));
  const filePath = path.join(directory, "termctl.config.json");
  fs.writeFileSync(filePath, `${JSON.stringify({
    project: "Worker Intelligence",
    sessions: [
      { id: "db", name: "Database", command: "x", cwd: "." },
      { id: "api", name: "API", command: "x", cwd: "." },
      { id: "web", name: "Web", command: "x", cwd: "." }
    ]
  }, null, 2)}\n`);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const factory = makeFakePtyFactory();
  const api = new EngineAPI({
    ptyFactory: factory,
    resourceSampleIntervalMs: 0,
    totalMemoryBytes: 8 * 1024 * 1024 * 1024,
    resourceProbe: async pids => new Map(pids.map(pid => [pid, {
      cpuPercent: 22,
      memoryBytes: 192 * 1024 * 1024,
      source: "test-engine"
    }]))
  });
  t.after(() => api.dispose());
  const events = [];
  api.subscribe("all", event => events.push(event));
  api.loadProject(filePath);
  assert.equal(api.saveRecipe({
    id: "daily",
    name: "Daily stack",
    steps: [
      { workerId: "db", dependsOn: [] },
      { workerId: "api", dependsOn: ["db"] },
      { workerId: "web", dependsOn: ["api"] }
    ]
  }).ok, true);

  const sample = await api.sampleWorkerResources();
  assert.equal(sample.availableCount, 3);
  const state = api.getState();
  const db = state.sessions.find(session => session.id === "db");
  const apiWorker = state.sessions.find(session => session.id === "api");
  const web = state.sessions.find(session => session.id === "web");
  assert.equal(db.resources.memoryMB, 192);
  assert.equal(db.resources.scope, "root-process");
  assert.equal(db.health.tone, "healthy");
  assert.deepEqual(db.dependencyImpact.directDependentIds, ["api"]);
  assert.deepEqual(db.dependencyImpact.downstreamIds, ["api", "web"]);
  assert.equal(db.dependencyImpact.level, "connected");
  assert.deepEqual(apiWorker.dependencyImpact.upstreamIds, ["db"]);
  assert.deepEqual(web.dependencyImpact.upstreamIds, ["api"]);
  assert.equal(events.at(-1).type, "worker:metrics");
  assert.equal(api.getActivity({ limit: 200 }).events.some(event => event.type === "worker:metrics"), false);
  assert.equal(api.getSnapshot("db").resources.source, "test-engine");
});
