const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const {
  ProjectRegistry,
  ProjectRegistryError,
  projectIdFor
} = require("../src/service/projectRegistry.cjs");

function makeRegistry(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-project-registry-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "projects.json");
  return { directory, filePath, registry: new ProjectRegistry(filePath, options) };
}

test("recent-project registry is durable, deduplicated, and bounded", t => {
  const { filePath, registry } = makeRegistry(t, { maxProjects: 2, platform: "win32" });
  const first = registry.remember({
    name: "First",
    rootPath: "C:\\Work\\First",
    configPath: "C:\\Work\\First\\termctl.config.json"
  }, 100);
  registry.remember({
    name: "First renamed",
    rootPath: "c:\\work\\first",
    configPath: "c:\\work\\first\\termctl.config.json"
  }, 200);
  registry.remember({
    name: "Second",
    rootPath: "C:\\Work\\Second",
    configPath: "C:\\Work\\Second\\termctl.config.json"
  }, 300);
  registry.remember({
    name: "Third",
    rootPath: "C:\\Work\\Third",
    configPath: "C:\\Work\\Third\\termctl.config.json"
  }, 400);

  assert.equal(first.id, projectIdFor(first.configPath, "win32"));
  assert.deepEqual(registry.list().map(project => project.name), ["Third", "Second"]);
  const restored = new ProjectRegistry(filePath, { maxProjects: 2, platform: "win32" });
  assert.deepEqual(restored.list(), registry.list());
  assert.equal(JSON.parse(fs.readFileSync(filePath, "utf8")).projects.length, 2);
});

test("corrupt recent-project data is isolated instead of blocking Groundstation", t => {
  const { filePath } = makeRegistry(t);
  fs.writeFileSync(filePath, "{broken", "utf8");
  const registry = new ProjectRegistry(filePath);

  assert.deepEqual(registry.list(), []);
  assert.match(registry.loadError, /invalid JSON/);
  registry.remember({
    name: "Recovered",
    rootPath: path.dirname(filePath),
    configPath: path.join(path.dirname(filePath), "termctl.config.json")
  });
  assert.equal(registry.loadError, null);
  assert.equal(registry.list()[0].name, "Recovered");
});

test("failed registry writes preserve the previous durable and in-memory list", t => {
  const { filePath, registry } = makeRegistry(t);
  registry.remember({
    name: "Stable",
    rootPath: path.dirname(filePath),
    configPath: path.join(path.dirname(filePath), "stable.json")
  }, 1);
  const before = fs.readFileSync(filePath, "utf8");
  const realRenameSync = fs.renameSync;
  fs.renameSync = () => { throw new Error("disk is busy"); };
  t.after(() => { fs.renameSync = realRenameSync; });

  assert.throws(
    () => registry.remember({
      name: "Rejected",
      rootPath: path.dirname(filePath),
      configPath: path.join(path.dirname(filePath), "rejected.json")
    }, 2),
    error => error instanceof ProjectRegistryError && /disk is busy/.test(error.message)
  );
  assert.deepEqual(registry.list().map(project => project.name), ["Stable"]);
  assert.equal(fs.readFileSync(filePath, "utf8"), before);
});
