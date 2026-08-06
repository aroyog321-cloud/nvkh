const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const {
  ActivityStore,
  ActivityStoreError,
  activityPathFor
} = require("../src/engine/activityStore.cjs");
const { EngineAPI, ENGINE_CONTRACT_VERSION } = require("../src/engine/index.cjs");
const { makeFakePtyFactory } = require("./fakePty.cjs");

function makeWorkspace(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-activity-"));
  const workspacePath = path.join(directory, "termctl.config.json");
  fs.writeFileSync(workspacePath, JSON.stringify({
    version: 1,
    project: "Activity test",
    sessions: [{ id: "a", name: "API", command: "x", cwd: "." }]
  }));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return workspacePath;
}

test("activity store validates and bounds restored history", t => {
  const workspacePath = makeWorkspace(t);
  const store = new ActivityStore(workspacePath);
  const event = sequence => ({
    contractVersion: ENGINE_CONTRACT_VERSION,
    sequence,
    timestamp: sequence,
    type: "session:status",
    id: "a",
    status: "running"
  });
  store.save({
    contractVersion: ENGINE_CONTRACT_VERSION,
    latestSequence: 4,
    droppedThroughSequence: 0,
    events: [event(1), event(2), event(4)]
  });

  const restored = store.load({ contractVersion: ENGINE_CONTRACT_VERSION, maxEvents: 2 });
  assert.deepEqual(restored.events.map(item => item.sequence), [2, 4]);
  assert.equal(restored.latestSequence, 4);
  assert.equal(restored.droppedThroughSequence, 1);

  const raw = JSON.parse(fs.readFileSync(store.filePath, "utf8"));
  raw.events.push({ ...event(5), type: "session:output" });
  fs.writeFileSync(store.filePath, JSON.stringify(raw));
  assert.throws(
    () => store.load({ contractVersion: ENGINE_CONTRACT_VERSION, maxEvents: 10 }),
    ActivityStoreError
  );
});

test("persistent workspaces restore bounded activity and continue event sequences", t => {
  const workspacePath = makeWorkspace(t);
  const firstFactory = makeFakePtyFactory();
  const first = new EngineAPI({
    ptyFactory: firstFactory,
    activityPersistDelayMs: 0
  });
  first.loadProject(workspacePath);
  firstFactory.last().emitData("Error: API_TOKEN=should-not-be-persisted\n");
  first.acknowledge("a");
  first.rename("a", "Backend");
  const firstLatest = first.getActivity().latestSequence;
  first.dispose();

  const activityPath = activityPathFor(workspacePath);
  const savedText = fs.readFileSync(activityPath, "utf8");
  assert.equal(savedText.includes("API_TOKEN"), false);
  const saved = JSON.parse(savedText);
  assert.ok(saved.events.length > 0);
  assert.equal(saved.events.some(event => event.type === "session:output"), false);
  assert.equal(
    saved.events.some(event => Object.hasOwn(event, "attentionReason")),
    false,
    "output-derived attention reasons must not be written to disk"
  );

  const secondFactory = makeFakePtyFactory();
  const second = new EngineAPI({
    ptyFactory: secondFactory,
    activityPersistDelayMs: 0
  });
  t.after(() => second.dispose());
  second.loadProject(workspacePath);
  const restored = second.getActivity({ afterSequence: 0, limit: 200 });

  assert.ok(restored.events.some(event => event.type === "session:renamed"));
  assert.ok(restored.latestSequence > firstLatest);
  assert.ok(restored.events.at(-1).sequence > firstLatest);
  assert.equal(second.getWorkspace().activityPersistent, true);
});

test("corrupt activity history is isolated and surfaced without blocking sessions", t => {
  const workspacePath = makeWorkspace(t);
  const activityPath = activityPathFor(workspacePath);
  fs.writeFileSync(activityPath, "{broken");
  const factory = makeFakePtyFactory();
  const api = new EngineAPI({ ptyFactory: factory, activityPersistDelayMs: 0 });
  t.after(() => api.dispose());

  assert.doesNotThrow(() => api.loadProject(workspacePath));
  assert.equal(factory.instances.length, 1);
  assert.ok(api.getActivity().events.some(event => event.type === "activity:load-error"));
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(activityPath, "utf8")));
});

test("activity save failures stay ordered, deduplicate, and never break PTY lifecycle", t => {
  const workspacePath = makeWorkspace(t);
  const factory = makeFakePtyFactory();
  let saveAttempts = 0;
  const api = new EngineAPI({
    ptyFactory: factory,
    activityPersistDelayMs: 0,
    openActivityStore: () => ({
      load: () => ({ latestSequence: 0, droppedThroughSequence: 0, events: [] }),
      save: () => {
        saveAttempts++;
        throw new Error("disk full");
      }
    })
  });
  t.after(() => api.dispose());
  const events = [];
  api.subscribe("all", event => events.push(event));

  assert.doesNotThrow(() => api.loadProject(workspacePath));
  assert.equal(factory.instances.length, 1);
  assert.deepEqual(api.rename("a", "Backend"), { ok: true });
  assert.ok(saveAttempts >= 2);
  assert.equal(events.filter(event => event.type === "activity:persist-error").length, 1);
  assert.deepEqual(
    events.map(event => event.sequence),
    events.map((_, index) => index + 1),
    "persistence failures must not overtake the event that triggered them"
  );
});
