"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  redactText,
  sanitizeContextValue,
  sensitiveKey
} = require("../src/service/contextSanitizer.cjs");

test("context sanitizer redacts structured credentials and common inline secrets", () => {
  const raw = {
    apiKey: "plain-secret",
    nested: {
      password: "hunter2",
      output: "Authorization: Bearer abcdefghijklmnop database_url=postgres://dev:pass@localhost/app"
    },
    envKeys: ["API_KEY", "PORT"]
  };
  const sanitized = sanitizeContextValue(raw);
  const encoded = JSON.stringify(sanitized.value);

  assert.equal(sanitized.value.apiKey, "[REDACTED]");
  assert.equal(sanitized.value.nested.password, "[REDACTED]");
  assert.match(sanitized.value.nested.output, /Bearer \[REDACTED\]/);
  assert.match(sanitized.value.nested.output, /database_url=\[REDACTED\]/);
  assert.equal(encoded.includes("plain-secret"), false);
  assert.equal(encoded.includes("hunter2"), false);
  assert.deepEqual(sanitized.value.envKeys, ["API_KEY", "PORT"]);
  assert.ok(sanitized.redactions >= 4);
});

test("context sanitizer redacts private keys, provider tokens, JWTs, and URL credentials", () => {
  const input = [
    "-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY-----",
    "github_pat_abcdefghijklmnopqrstuvwxyz123456",
    "eyJabcdefghijk.abcdefghijklmnop.abcdefghijklmnop",
    "https://alice:password@example.test/path"
  ].join("\n");
  const result = redactText(input);

  assert.equal(result.value.includes("private-material"), false);
  assert.equal(result.value.includes("github_pat_"), false);
  assert.equal(result.value.includes("alice:password"), false);
  assert.ok(result.redactions >= 4);
});

test("context sanitizer bounds strings, arrays, depth, and circular input", () => {
  const circular = { list: ["a", "b", "c"], text: "x".repeat(100), child: {} };
  circular.child.parent = circular;
  const result = sanitizeContextValue(circular, {
    maxArrayItems: 2,
    maxDepth: 4,
    maxStringLength: 32
  });

  assert.equal(result.value.list.length, 2);
  assert.match(result.value.text, /\[truncated\]$/);
  assert.equal(result.value.child.parent, "[circular]");
  assert.ok(result.truncations >= 3);
  assert.equal(sensitiveKey("clientSecret"), true);
  assert.equal(sensitiveKey("envKeys"), false);
});
