const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { PluginPlatformStore, normalizeManifest } = require("../src/service/pluginPlatformStore.cjs");

const manifest = {
  manifestVersion: 1,
  id: "dev.mission-control.tests",
  name: "Test Intelligence",
  version: "1.0.0",
  publisher: "Tests",
  description: "Bounded test health",
  permissions: ["health.read", "worker.lifecycle.request"],
  surfaces: ["settings.summary", "needs.request"],
  actions: [{ id: "restart-tests", label: "Restart tests", type: "worker", operations: ["restart"] }]
};

test("plugin manifests install disabled with zero grants and remain bounded", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-plugin-store-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "plugins.json");
  const store = new PluginPlatformStore(filePath, { now: () => 100 });
  const installed = store.install(manifest, "tests.plugin.json");
  assert.equal(installed.enabled, false);
  assert.deepEqual(installed.grantedPermissions, []);
  assert.equal(store.status().pluginCount, 1);
  const configured = store.configure(manifest.id, { enabled: true, grantedPermissions: ["health.read"] });
  assert.equal(configured.enabled, true);
  assert.deepEqual(configured.grantedPermissions, ["health.read"]);
  assert.throws(() => store.configure(manifest.id, { grantedPermissions: ["context.read"] }), /did not declare/);
  assert.equal(fs.readFileSync(filePath).length < 512 * 1024, true);
});

test("plugin manifests reject executable and undeclared privileged authority", () => {
  assert.throws(() => normalizeManifest({ ...manifest, main: "index.cjs" }), /not allowed: main/);
  assert.throws(() => normalizeManifest({ ...manifest, permissions: ["filesystem.read"] }), /Unsupported plugin permission/);
  assert.throws(() => normalizeManifest({ ...manifest, actions: [{ id: "shell", label: "Shell", type: "worker", operations: ["execute"] }] }), /Unsupported plugin action operation/);
});
