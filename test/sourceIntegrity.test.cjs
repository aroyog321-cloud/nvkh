const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(?:cjs|js)$/.test(entry.name) ? [absolute] : [];
  });
}

const runtimeFiles = [path.join(root, "bin", "termctl.js"), ...sourceFiles(path.join(root, "src"))];
const electronContextFiles = new Set([
  path.join(root, "src", "groundstation", "main", "index.cjs"),
  path.join(root, "src", "groundstation", "preload", "index.cjs")
]);

test("every runtime JavaScript file passes Node syntax checking", () => {
  for (const file of runtimeFiles) {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    assert.equal(result.status, 0, `${path.relative(root, file)}\n${result.stderr}`);
  }
});

test("every import-safe runtime module loads with its declared module system", async () => {
  for (const file of runtimeFiles) {
    if (file.endsWith(path.join("bin", "termctl.js"))) continue;
    // These modules intentionally require Electron globals that do not exist
    // in a plain Node process. They are still covered by syntax checks and
    // their transport/lifecycle collaborators are imported and tested below.
    if (electronContextFiles.has(file)) continue;
    if (file.endsWith(".cjs")) require(file);
    else await import(pathToFileURL(file).href);
  }
});

test("runtime clients stay behind the public EngineAPI boundary", () => {
  const engineApiSource = fs.readFileSync(path.join(root, "src", "engine", "index.cjs"), "utf8");
  const routerSource = fs.readFileSync(path.join(root, "src", "engine", "commandRouter.cjs"), "utf8");
  const tuiSource = sourceFiles(path.join(root, "src", "tui"))
    .map(file => fs.readFileSync(file, "utf8"))
    .join("\n");
  const groundstationSource = sourceFiles(path.join(root, "src", "groundstation"))
    .map(file => fs.readFileSync(file, "utf8"))
    .join("\n");
  const protocolSource = sourceFiles(path.join(root, "src", "protocol"))
    .map(file => fs.readFileSync(file, "utf8"))
    .join("\n");

  assert.doesNotMatch(engineApiSource, /this\.sessionEngine/);
  assert.doesNotMatch(routerSource, /this\.engine\.get\(/);
  assert.match(routerSource, /this\.engine\.getSnapshot\(/);
  assert.doesNotMatch(tuiSource, /SessionEngine|\.sessionEngine/);
  assert.doesNotMatch(groundstationSource, /SessionEngine|\.sessionEngine/);
  assert.doesNotMatch(protocolSource, /SessionEngine|\.sessionEngine/);
});
