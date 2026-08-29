"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");

const UPDATE_MANIFEST_VERSION = 1;
const MAX_UPDATE_BYTES = 2 * 1024 * 1024 * 1024;

function canonicalUpdate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Update manifest must be an object");
  if (value.manifestVersion !== UPDATE_MANIFEST_VERSION) throw new TypeError("Update manifest version is unsupported");
  const version = String(value.version || "");
  const fileName = String(value.fileName || "");
  const sha256 = String(value.sha256 || "").toLowerCase();
  const size = Number(value.size);
  const publishedAt = String(value.publishedAt || "");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new TypeError("Update version is invalid");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(fileName) || fileName.includes("..")) throw new TypeError("Update filename is invalid");
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new TypeError("Update SHA-256 is invalid");
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_UPDATE_BYTES) throw new TypeError("Update size is invalid");
  if (!Number.isFinite(Date.parse(publishedAt))) throw new TypeError("Update publication time is invalid");
  return JSON.stringify({ manifestVersion: UPDATE_MANIFEST_VERSION, version, fileName, sha256, size, publishedAt });
}

function verifyUpdateManifest(manifest, publicKey) {
  const signature = Buffer.from(String(manifest?.signature || ""), "base64url");
  if (signature.length !== 64) throw new TypeError("Update signature is invalid");
  let key;
  try { key = publicKey?.type === "public" ? publicKey : crypto.createPublicKey(publicKey); } catch { throw new TypeError("Update public key is invalid"); }
  if (key.asymmetricKeyType !== "ed25519") throw new TypeError("Update public key must use Ed25519");
  const canonical = canonicalUpdate(manifest);
  if (!crypto.verify(null, Buffer.from(canonical), key, signature)) throw new Error("Update manifest signature verification failed");
  return JSON.parse(canonical);
}

async function verifyUpdateArtifact(filePath, verifiedManifest) {
  const stats = await fs.promises.stat(filePath);
  if (!stats.isFile() || stats.size !== verifiedManifest.size) throw new Error("Update artifact size does not match the signed manifest");
  const digest = await new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject); stream.on("data", chunk => hash.update(chunk)); stream.on("end", () => resolve(hash.digest("hex")));
  });
  if (!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(verifiedManifest.sha256))) throw new Error("Update artifact checksum does not match the signed manifest");
  return { verified: true, version: verifiedManifest.version, fileName: verifiedManifest.fileName, size: verifiedManifest.size, sha256: digest };
}

module.exports = { MAX_UPDATE_BYTES, UPDATE_MANIFEST_VERSION, canonicalUpdate, verifyUpdateArtifact, verifyUpdateManifest };
