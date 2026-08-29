const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { MobileCompanionStore, normalizePort, normalizeScopes } = require("../src/service/mobileCompanionStore.cjs");

function safeStorage(available = true, backend = "dpapi") {
  return { isEncryptionAvailable: () => available, getSelectedStorageBackend: () => backend, encryptString: value => Buffer.from(`protected:${value}`), decryptString: value => value.toString().replace(/^protected:/, "") };
}

test("Mobile Companion stores device credentials only behind OS encryption", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-mobile-store-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "mobile.json");
  const store = new MobileCompanionStore(filePath, { safeStorage: safeStorage(), now: () => 100 });
  store.configure({ scopes: ["summary.read", "actions.request"] });
  const device = store.addDevice({ id: "phone-1", name: "Nove phone", publicKey: "public", scopes: ["summary.read", "actions.request"] }, "A".repeat(43));
  assert.equal(device.state, "paired");
  assert.equal(store.deviceCredential("phone-1").secret, "A".repeat(43));
  const raw = fs.readFileSync(filePath, "utf8");
  assert.equal(raw.includes("A".repeat(43)), false);
  assert.equal(raw.includes("protected:"), false);
  assert.equal(Object.hasOwn(store.devices()[0], "credential"), false);
  assert.equal(store.revokeDevice("phone-1"), true);
  assert.throws(() => store.deviceCredential("phone-1"), /unknown or revoked/);
});

test("Mobile Companion fails closed without OS protection and validates scopes", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-mobile-store-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new MobileCompanionStore(path.join(directory, "mobile.json"), { safeStorage: safeStorage(false) });
  assert.throws(() => store.configure({ enabled: true }), /remains disabled/);
  assert.throws(() => store.addDevice({ id: "phone", scopes: [] }, "A".repeat(43)), /unavailable/);
  assert.throws(() => normalizePort(80), /1024 to 65535/);
  assert.throws(() => normalizeScopes(["shell.execute"]), /Unsupported mobile scope/);
});
