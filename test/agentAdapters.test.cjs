const test = require("node:test");
const assert = require("node:assert/strict");
const { createAgentDefinition, listAgentAdapters } = require("../src/service/agentAdapters.cjs");

test("agent adapters are fixed and create inert worker definitions", () => {
  assert.deepEqual(listAgentAdapters().map(({ id, command }) => ({ id, command })), [
    { id: "claude", command: "claude" },
    { id: "codex", command: "codex" },
    { id: "gemini", command: "gemini" },
    { id: "opencode", command: "opencode" }
  ]);
  const worker = createAgentDefinition("codex");
  assert.match(worker.id, /^agent-codex-[a-f0-9]{8}$/);
  assert.deepEqual(worker, {
    id: worker.id,
    name: "Codex agent",
    command: "codex",
    args: [],
    cwd: ".",
    autoStart: false
  });
  assert.throws(() => createAgentDefinition("custom-shell"), /unsupported agent adapter/);
});
