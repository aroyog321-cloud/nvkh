const assert = require("node:assert/strict");
const { test } = require("node:test");
const { classifyEvidence, mergeEvidence } = require("../src/engine/evidenceClassifier.cjs");

test("structured evidence extracts safe operational facts without retaining raw output", () => {
  const at = 1234;
  const evidence = classifyEvidence([
    "Tests 24 passed 2 failed",
    "## feature/evidence...origin/feature/evidence",
    " M src/app.js",
    "?? test/new.test.js",
    "ready in 1.5s at https://localhost:5173/private?token=secret"
  ].join("\n"), at);

  assert.equal(evidence.tests.passed, 24);
  assert.equal(evidence.tests.failed, 2);
  assert.equal(evidence.tests.status, "failed");
  assert.equal(evidence.git.branch, "feature/evidence");
  assert.deepEqual(evidence.git.changedFiles, ["src/app.js", "test/new.test.js"]);
  assert.equal(evidence.build.durationMs, 1500);
  assert.equal(evidence.service.origin, "https://localhost:5173");
  assert.equal(evidence.service.health, "unconfirmed");
  assert.equal(JSON.stringify(evidence).includes("secret"), false);
  assert.equal(JSON.stringify(evidence).includes("private?token"), false);
});

test("evidence merging updates only reported categories and rejects unsafe branch text", () => {
  const first = mergeEvidence({}, "On branch main\nnothing to commit, working tree clean", 10);
  const second = mergeEvidence(first, "database ready to accept connections", 20);
  const unsafe = classifyEvidence("On branch token=$(secret)", 30);

  assert.equal(second.git.branch, "main");
  assert.equal(second.git.clean, true);
  assert.equal(second.database.connected, true);
  assert.equal(second.database.connection, "confirmed");
  assert.equal(unsafe.git, undefined);
});

test("structured integrations retain bounded operational records", () => {
  const evidence = classifyEvidence([
    "FAIL auth rejects expired session",
    "Test Suites: 4 passed, 1 failed",
    "healthcheck: passed HTTP/1.1 200",
    "database connected; 3 migrations applied",
    "container api image example/api:2 running",
    "CPU usage: 12.5% MEMORY usage: 1.5 GiB",
    "Build phase: bundling",
    "artifact: dist/app.exe",
    "commit a1b2c3d4",
    "Author: Dev Example <dev@example.test>",
    "2 files changed, 5 insertions(+), 1 deletion(-)"
  ].join("\n"), 50);
  assert.equal(evidence.tests.suitesFailed, 1);
  assert.deepEqual(evidence.tests.failedTests, ["auth rejects expired session"]);
  assert.equal(evidence.service.health, "confirmed");
  assert.equal(evidence.service.statusCode, 200);
  assert.equal(evidence.database.migrations, "applied");
  assert.equal(evidence.container.image, "example/api:2");
  assert.equal(evidence.container.memoryMB, 1536);
  assert.deepEqual(evidence.build.artifacts, ["dist/app.exe"]);
  assert.equal(evidence.git.commit, "a1b2c3d4");
  assert.equal(evidence.git.insertions, 5);
});
