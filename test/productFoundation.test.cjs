const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { performance } = require("node:perf_hooks");
const { EngineAPI } = require("../src/engine/index.cjs");
const { makeFakePtyFactory } = require("./fakePty.cjs");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("Groundstation exposes baseline screen-reader and keyboard navigation semantics", () => {
  const app = read("src/groundstation/renderer/App.jsx");
  const html = read("src/groundstation/renderer/index.html");
  const css = read("src/groundstation/renderer/styles.css");

  assert.match(html, /<html lang="en">/);
  assert.match(app, /className="skip-link" href="#main-content"/);
  assert.match(app, /id="main-content" tabIndex="-1"/);
  assert.match(app, /aria-current=\{view === id \? "page"/);
  assert.match(app, /aria-label="Application sidebar"/);
  assert.match(app, /role="alert" aria-live="assertive"/);
  assert.match(app, /role="status" aria-live="polite"/);
  assert.match(app, /aria-hidden="true" focusable="false"/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(forced-colors: active\)/);
});

test("Groundstation CSS preserves long translated text and narrow layouts", () => {
  const css = read("src/groundstation/renderer/styles.css");
  const main = read("src/groundstation/renderer/main.jsx");

  assert.match(main, /document\.documentElement\.lang = navigator\.language/);
  assert.match(css, /Long-text and localization resilience/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /word-break: break-word/);
  assert.match(css, /html:lang\(de\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
});

test("large-workspace renderer protections remain enabled", () => {
  const css = read("src/groundstation/renderer/styles.css");
  const state = read("src/groundstation/renderer/useMissionState.js");
  const terminal = read("src/groundstation/renderer/TerminalPane.jsx");

  assert.match(css, /content-visibility: auto/);
  assert.match(css, /contain: layout paint/);
  assert.match(state, /if \(refreshTimer\.current\) return/);
  assert.match(terminal, /cursorBlink: active/);
  assert.match(terminal, /requestAnimationFrame\(fitAndResize\)/);
});

test("100-worker engine snapshot and structured evidence remain bounded", t => {
  const factory = makeFakePtyFactory();
  const api = new EngineAPI({ ptyFactory: factory, maxActivityEvents: 200 });
  t.after(() => api.dispose());
  const sessions = Array.from({ length: 100 }, (_, index) => ({ id: `profile-${index}`, name: `Profile worker ${index}`, command: "x", cwd: "." }));
  const started = performance.now();
  api.loadProject({ sessions });
  for (const pty of factory.instances) pty.emitData("24 passed, 0 failed\n");
  const state = api.getState();
  const durationMs = performance.now() - started;

  assert.equal(state.sessions.length, 100);
  assert.equal(state.sessions.every(session => session.evidence.tests.passed === 24), true);
  assert.equal(state.activity.events.length <= 50, true);
  assert.equal(durationMs < 5000, true, `100-worker profile took ${durationMs.toFixed(2)}ms`);
});
