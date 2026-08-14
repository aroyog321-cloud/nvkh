const crypto = require("node:crypto");

const AGENT_ADAPTERS = Object.freeze([
  Object.freeze({ id: "claude", name: "Claude Code", command: "claude", description: "Anthropic's local coding agent CLI" }),
  Object.freeze({ id: "codex", name: "Codex", command: "codex", description: "OpenAI's local coding agent CLI" }),
  Object.freeze({ id: "gemini", name: "Gemini CLI", command: "gemini", description: "Google's local coding agent CLI" }),
  Object.freeze({ id: "opencode", name: "OpenCode", command: "opencode", description: "Provider-neutral local coding agent CLI" })
]);

function listAgentAdapters() {
  return AGENT_ADAPTERS.map(({ id, name, command, description }) => ({ id, name, command, description }));
}

function createAgentDefinition(adapterId) {
  const adapter = AGENT_ADAPTERS.find(candidate => candidate.id === adapterId);
  if (!adapter) throw new Error(`unsupported agent adapter: ${adapterId}`);
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  return {
    id: `agent-${adapter.id}-${suffix}`,
    name: `${adapter.name} agent`,
    command: adapter.command,
    args: [],
    cwd: ".",
    autoStart: false
  };
}

module.exports = { AGENT_ADAPTERS, createAgentDefinition, listAgentAdapters };
