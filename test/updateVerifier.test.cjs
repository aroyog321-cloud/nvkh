const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { canonicalUpdate, verifyUpdateArtifact, verifyUpdateManifest } = require("../src/service/updateVerifier.cjs");

test("update manifests and artifacts require Ed25519 signature, size, and SHA-256", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-update-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const artifact = path.join(directory, "Mission-Control.zip");
  fs.writeFileSync(artifact, "verified release bytes");
  const bytes = fs.readFileSync(artifact);
  const manifest = { manifestVersion: 1, version: "2.13.0", fileName: "Mission-Control.zip", size: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), publishedAt: "2026-08-23T00:00:00.000Z" };
  const keys = crypto.generateKeyPairSync("ed25519");
  manifest.signature = crypto.sign(null, Buffer.from(canonicalUpdate(manifest)), keys.privateKey).toString("base64url");
  const verified = verifyUpdateManifest(manifest, keys.publicKey);
  assert.equal((await verifyUpdateArtifact(artifact, verified)).verified, true);
  assert.throws(() => verifyUpdateManifest({ ...manifest, version: "2.13.1" }, keys.publicKey), /verification failed/);
  fs.appendFileSync(artifact, "tampered");
  await assert.rejects(() => verifyUpdateArtifact(artifact, verified), /size/);
});
