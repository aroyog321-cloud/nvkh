const assert = require("node:assert/strict");
const { test } = require("node:test");

test("Escape detection supports ordinary and Windows enhanced VT input", async () => {
  const { isEscapeInput } = await import("../src/tui/input.js");

  assert.equal(isEscapeInput("", { escape: true }), true);
  assert.equal(isEscapeInput("[27;1;27~", {}), true);
  assert.equal(isEscapeInput("[27;5;27~", {}), true);
  assert.equal(isEscapeInput("[27;1;13~", {}), false);
  assert.equal(isEscapeInput("x", {}), false);
});
