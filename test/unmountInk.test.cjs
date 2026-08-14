const assert = require("node:assert/strict");
const { test } = require("node:test");
const { unmountInk } = require("../src/tui/unmountInk.cjs");

test("programmatic unmount is synchronous and does not depend on Ink's exit promise", async () => {
  const calls = [];
  const instance = {
    waitUntilExit() {
      calls.push("wait");
      return new Promise(() => {});
    },
    unmount() {
      calls.push("unmount");
    }
  };

  const result = unmountInk(instance);

  assert.deepEqual(calls, ["unmount"]);
  assert.equal(result, undefined, "the Full Attach handoff must not yield an event-loop turn");
});

test("missing Ink instance is a no-op", async () => {
  await unmountInk(null);
});
