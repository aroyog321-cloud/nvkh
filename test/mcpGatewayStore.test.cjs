const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const {
  DEFAULT_MCP_PORT,
  DEFAULT_MCP_SCOPES,
  MCP_SCOPES,
  McpGatewayStore,
  normalizePort,
  normalizeScopes
} = require("../src/service/mcpGatewayStore.cjs");

function safeStorage(available = true, backend = "dpapi") {
  return {
    isEncryptionAvailable: () => available,
    getSelectedStorageBackend: () => backend,
    encryptString: value => Buffer.from(`protected:${value}`, "utf8"),
    decryptString: value => value.toString("utf8").replace(/^protected:/, "")
  };
}

test("MCP gateway store encrypts tokens and exposes only bounded public status", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-mcp-store-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "gateway.json");
  const store = new McpGatewayStore(filePath, { safeStorage: safeStorage(), randomBytes: () => Buffer.alloc(32, 7), now: () => 100 });

  const firstToken = store.rotateToken();
  assert.equal(firstToken.length, 43);
  const status = store.configure({ enabled: true, port: 48000, scopes: ["context.read", "worker.lifecycle.request"] });
  assert.equal(status.enabled, true);
  assert.equal(status.configured, true);
  assert.deepEqual(status.scopes, ["context.read", "worker.lifecycle.request"]);
  assert.equal(Object.hasOwn(status, "token"), false);
  const raw = fs.readFileSync(filePath, "utf8");
  assert.equal(raw.includes(store.token()), false);
  assert.equal(store.token(), Buffer.alloc(32, 7).toString("base64url"));

  const rotated = store.rotateToken();
  assert.equal(rotated.length >= 40, true);
  store.appendAudit({ kind: "tool", outcome: "completed", client: "Claude", capability: "context.read", target: "mission_control_context", secret: "must-not-persist" });
  assert.equal(store.listAudit()[0].client, "Claude");
  assert.equal(Object.hasOwn(store.listAudit()[0], "secret"), false);
});

test("MCP gateway cannot enable before its one-time token is created", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-mcp-store-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new McpGatewayStore(path.join(directory, "gateway.json"), { safeStorage: safeStorage() });
  assert.throws(
    () => store.configure({ enabled: true }),
    /Create and copy an MCP access token/
  );
  assert.equal(store.status().configured, false);
  assert.equal(store.status().enabled, false);
});

test("MCP gateway store fails closed without OS protection and validates scopes", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-mcp-store-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new McpGatewayStore(path.join(directory, "gateway.json"), { safeStorage: safeStorage(false) });
  assert.throws(() => store.configure({ enabled: true }), /will not store a plaintext MCP access token/);
  assert.equal(store.status().available, false);
  assert.throws(() => normalizePort(80), /1024 to 65535/);
  assert.equal(normalizePort(undefined), DEFAULT_MCP_PORT);
  assert.deepEqual(normalizeScopes(undefined), [...DEFAULT_MCP_SCOPES]);
  assert.throws(() => normalizeScopes(["context.read", "shell.execute"]), /Unsupported MCP gateway scope/);
  assert.equal(MCP_SCOPES.includes("terminal.read"), true);
  assert.equal(MCP_SCOPES.includes("supervisor.plan.request"), true);
  assert.equal(MCP_SCOPES.includes("worker.create.request"), true);
  assert.equal(MCP_SCOPES.includes("terminal.input.request"), true);
});
