"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "../src/groundstation/renderer/recipeBuilderModel.js")).href;
const steps = ["db", "api", "web", "tests"].map(workerId => ({ workerId, dependsOn: [], readiness: "running", timeoutMs: 10000 }));

test("Recipes 2 builder templates create sequential, parallel, and verification DAGs", async () => {
  const { applyRecipeTemplate, dependencyCycle } = await import(`${moduleUrl}?templates=${Date.now()}`);
  const sequential = applyRecipeTemplate("sequential", steps);
  assert.deepEqual(sequential.map(step => step.dependsOn), [[], ["db"], ["api"], ["web"]]);
  const parallel = applyRecipeTemplate("parallel", steps);
  assert.deepEqual(parallel.map(step => step.dependsOn), [[], [], [], []]);
  const verify = applyRecipeTemplate("verify", steps);
  assert.deepEqual(verify[3].dependsOn, ["db", "api", "web"]);
  assert.deepEqual(dependencyCycle(verify), []);
});

test("Recipes 2 builder detects a dependency cycle before save", async () => {
  const { dependencyCycle, toggleStepDependency } = await import(`${moduleUrl}?cycle=${Date.now()}`);
  let next = toggleStepDependency(steps, "api", "db");
  next = toggleStepDependency(next, "db", "api");
  assert.deepEqual(new Set(dependencyCycle(next)), new Set(["db", "api"]));
});
