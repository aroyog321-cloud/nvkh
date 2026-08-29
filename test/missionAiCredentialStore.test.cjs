"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const {
  DEFAULT_GEMINI_MODEL,
  MissionAiCredentialStore
} = require("../src/service/missionAiCredentialStore.cjs");

function fakeSafeStorage(options = {}) {
  return {
    isEncryptionAvailable: () => options.available !== false,
    getSelectedStorageBackend: () => options.backend || "kwallet6",
    encryptString: value => Buffer.from(`encrypted:${value}`, "utf8"),
    decryptString: value => value.toString("utf8").replace(/^encrypted:/, "")
  };
}

function makeStore(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mission-ai-credentials-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "credentials.json");
  return { filePath, store: new MissionAiCredentialStore(filePath, { safeStorage: fakeSafeStorage(options) }) };
}

test("Mission AI credentials are OS-encrypted and never persisted as plaintext", t => {
  const { filePath, store } = makeStore(t);
  const apiKey = "AIzaSyExampleMissionControlKey123456789";
  const configured = store.configure({ apiKey, includeTerminalEvidence: true });

  assert.equal(configured.configured, true);
  assert.equal(configured.model, DEFAULT_GEMINI_MODEL);
  assert.equal(configured.includeTerminalEvidence, true);
  assert.equal(configured.protection, "os-encrypted");
  assert.equal(store.apiKey(), apiKey);
  assert.equal(fs.readFileSync(filePath, "utf8").includes(apiKey), false);
  assert.equal(fs.statSync(filePath).mode & 0o077, 0);
});

test("Mission AI preferences update without requiring or exposing the existing key", t => {
  const { filePath, store } = makeStore(t);
  const apiKey = "AIzaSyExampleMissionControlKey123456789";
  store.configure({ apiKey });
  const updated = store.configure({ model: "gemini-2.5-flash-lite", includeTerminalEvidence: true });

  assert.equal(updated.model, "gemini-2.5-flash-lite");
  assert.equal(updated.includeTerminalEvidence, true);
  assert.equal(store.apiKey(), apiKey);
  assert.equal(JSON.stringify(updated).includes(apiKey), false);
  assert.equal(store.clear(), true);
  assert.equal(store.status().configured, false);
  assert.equal(fs.existsSync(filePath), false);
});

test("Mission AI credential storage fails closed without secure OS encryption", t => {
  const unavailable = makeStore(t, { available: false }).store;
  assert.equal(unavailable.status().available, false);
  assert.throws(
    () => unavailable.configure({ apiKey: "AIzaSyExampleMissionControlKey123456789" }),
    /will not store a plaintext API key/
  );

  const basicText = makeStore(t, { backend: "basic_text" }).store;
  assert.equal(basicText.status().available, false);
  assert.throws(
    () => basicText.configure({ apiKey: "AIzaSyExampleMissionControlKey123456789" }),
    /will not store a plaintext API key/
  );
});

test("Mission AI credential validation rejects short keys, unsupported models, and corrupt files", t => {
  const { filePath, store } = makeStore(t);
  assert.throws(() => store.configure({ apiKey: "short" }), /20 to 512/);
  assert.throws(
    () => store.configure({ apiKey: "AIzaSyExampleMissionControlKey123456789", model: "unknown-model" }),
    /Unsupported Gemini model/
  );
  store.configure({ apiKey: "AIzaSyExampleMissionControlKey123456789" });
  fs.writeFileSync(filePath, "not-json", "utf8");
  assert.match(store.status().error, /invalid/);
  assert.throws(() => store.apiKey(), /invalid/);
});
