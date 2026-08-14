const assert = require("node:assert/strict");
const { test } = require("node:test");
const { CommandRouter } = require("../src/engine/commandRouter.cjs");

function fakeEngine() {
  const calls = [];
  return {
    calls,
    restartCalled: null,
    getSnapshot: id => (id === "exists" ? { id, status: "running" } : null),
    restart(id) { this.restartCalled = id; return { ok: true }; },
    start(id) { calls.push(["start", id]); return { ok: true }; },
    create(definition) { calls.push(["create", definition]); return { ok: true }; },
    createFromSavedCommand(commandId) { calls.push(["instantiateSavedCommand", commandId]); return { ok: true }; },
    remove(id) { calls.push(["remove", id]); return { ok: true }; },
    acknowledge(id) { calls.push(["acknowledge", id]); return { ok: true }; },
    setAutoStart(id, enabled) { calls.push(["setAutoStart", id, enabled]); return { ok: true }; },
    reconfigure(id, patch) { calls.push(["reconfigure", id, patch]); return { ok: true }; },
    kill(id) { calls.push(["kill", id]); return { ok: true }; },
    write(id, data) { calls.push(["write", id, data]); return true; },
    resize(id, cols, rows) { calls.push(["resize", id, cols, rows]); return true; },
    rename(id, name) {
      calls.push(["rename", id, name]);
      return name.trim() ? { ok: true } : { ok: false, error: "name cannot be empty" };
    }
  };
}

test("risk tiers keep kill destructive and unknown actions cautious", () => {
  const router = new CommandRouter(fakeEngine());
  assert.equal(router.riskTier("kill"), "destructive");
  assert.equal(router.riskTier("restart"), "reversible");
  assert.equal(router.riskTier("start"), "reversible");
  assert.equal(router.riskTier("write"), "safe");
  assert.equal(router.riskTier("rename"), "safe");
  assert.equal(router.riskTier("something-new"), "reversible");
  assert.equal(router.riskTier("remove"), "destructive");
  assert.equal(router.riskTier("acknowledge"), "safe");
  assert.equal(router.riskTier("setAutoStart"), "safe");
  assert.equal(router.riskTier("reconfigure"), "safe");
  assert.equal(router.riskTier("instantiateSavedCommand"), "reversible");
});

test("dispatch to a missing session returns an error", async () => {
  const router = new CommandRouter(fakeEngine());
  const result = await router.dispatch("missing", { type: "kill" });
  assert.equal(result.ok, false);
  assert.match(result.error, /no such session/);
});

test("lifecycle actions stay behind the engine boundary", async () => {
  const engine = fakeEngine();
  const router = new CommandRouter(engine);

  assert.deepEqual(await router.dispatch("exists", { type: "kill" }), { ok: true });
  assert.deepEqual(await router.dispatch("exists", { type: "restart" }), { ok: true });
  assert.deepEqual(await router.dispatch("exists", { type: "start" }), { ok: true });
  assert.deepEqual(await router.dispatch("exists", { type: "rename", name: "new" }), { ok: true });
  assert.deepEqual(await router.dispatch("exists", { type: "acknowledge" }), { ok: true });
  assert.deepEqual(await router.dispatch("exists", { type: "setAutoStart", enabled: false }), { ok: true });
  assert.deepEqual(await router.dispatch("exists", { type: "reconfigure", patch: { command: "node" } }), { ok: true });
  assert.equal(engine.restartCalled, "exists");
  assert.deepEqual(engine.calls, [
    ["kill", "exists"],
    ["start", "exists"],
    ["rename", "exists", "new"],
    ["acknowledge", "exists"],
    ["setAutoStart", "exists", false],
    ["reconfigure", "exists", { command: "node" }]
  ]);
});

test("rename rejects blank names and unknown actions fail cleanly", async () => {
  const router = new CommandRouter(fakeEngine());
  assert.equal((await router.dispatch("exists", { type: "rename", name: "  " })).ok, false);
  assert.equal((await router.dispatch("exists", { type: "self-destruct" })).ok, false);
});

test("write and resize forward to the existing session", async () => {
  const engine = fakeEngine();
  const router = new CommandRouter(engine);
  assert.deepEqual(await router.dispatch("exists", { type: "write", data: "hello" }), { ok: true });
  assert.deepEqual(await router.dispatch("exists", { type: "resize", cols: 90, rows: 30 }), { ok: true });
  assert.deepEqual(engine.calls, [["write", "exists", "hello"], ["resize", "exists", 90, 30]]);
});

test("create, saved commands, and remove remain routed through the engine", async () => {
  const engine = fakeEngine();
  const router = new CommandRouter(engine);
  const definition = { id: "new", command: "node" };

  assert.deepEqual(await router.dispatch(null, { type: "create", definition }), { ok: true });
  assert.deepEqual(
    await router.dispatch(null, { type: "instantiateSavedCommand", commandId: "tests" }),
    { ok: true }
  );
  assert.deepEqual(await router.dispatch("exists", { type: "remove" }), { ok: true });
  assert.deepEqual(engine.calls, [
    ["create", definition],
    ["instantiateSavedCommand", "tests"],
    ["remove", "exists"]
  ]);
});
