const assert = require("assert");
const { classify } = require("../src/engine/classifier.cjs");

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
  }
}

console.log("classifier.js");

test("detects a claim-tier error", () => {
  assert.strictEqual(classify("Cannot connect to the Docker daemon"), "claim");
});

test("detects nominal completion", () => {
  assert.strictEqual(classify("Ready in 812ms"), "nominal");
});

test("detects progress", () => {
  assert.strictEqual(classify("Compiling home.dart"), "progress");
});

test("returns null for unmatched output — no status flap on ordinary lines", () => {
  assert.strictEqual(classify("just some regular log output"), null);
});

test("does not flag zero-failure test summaries", () => {
  assert.strictEqual(classify("tests 54 · passed 54 · failed 0"), "nominal");
  assert.strictEqual(classify("54 passed, 0 failed"), "nominal");
});

test("claim takes priority over progress in the same chunk", () => {
  assert.strictEqual(classify("Compiling home.dart\nError: type mismatch"), "claim");
});

test("is case-insensitive", () => {
  assert.strictEqual(classify("ERROR: something broke"), "claim");
});

test("ANSI color codes around a keyword don't break detection", () => {
  assert.strictEqual(classify("\x1b[31mError:\x1b[0m build failed"), "claim");
});

test("ANSI inside a keyword (split between letters) still detects it", () => {
  // Real-world example: many CLIs color just one letter ("\x1b[31mError\x1b[0m:"),
  // or insert a SGR between letters of a word. The classifier must
  // recognize the keyword regardless of internal escapes.
  assert.strictEqual(classify("Erro\x1b[31mr: build failed"), "claim");
  assert.strictEqual(classify("Compil\x1b[33ming home.dart"), "progress");
});

process.exitCode = failures > 0 ? 1 : 0;
if (failures > 0) console.log(`\n${failures} failure(s) in classifier.js`);
