const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const { parseGroundstationArgs } = require("../src/groundstation/main/options.cjs");

test("Groundstation options resolve default and explicit workspace paths", () => {
  const cwd = path.resolve("fixtures", "project");
  assert.deepEqual(parseGroundstationArgs([], { cwd }), {
    configPath: path.join(cwd, "termctl.config.json"),
    configExplicit: false
  });
  assert.deepEqual(parseGroundstationArgs(["--config", "workspace.json"], { cwd }), {
    configPath: path.join(cwd, "workspace.json"),
    configExplicit: true
  });
});

test("Groundstation options reject unknown or missing arguments", () => {
  assert.throws(() => parseGroundstationArgs(["--unknown"]), /unknown Groundstation option/);
  assert.throws(() => parseGroundstationArgs(["--config"]), /requires a file path/);
  assert.throws(() => parseGroundstationArgs(["--config="]), /requires a file path/);
});
