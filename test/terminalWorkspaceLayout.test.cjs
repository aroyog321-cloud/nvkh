"use strict";

/* Redesign coverage for the terminal workspace: pane resizing, minimum
   splits, per-axis ratios, layout persistence shape, the exited-worker
   resize guard, and the CSS grid that actually honours the drag ratio. */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");

const rendererRoot = path.resolve(__dirname, "../src/groundstation/renderer");
const layoutUrl = pathToFileURL(path.join(rendererRoot, "useTerminalLayout.js")).href;
const read = file => fs.readFileSync(path.join(rendererRoot, file), "utf8");
const load = () => import(`${layoutUrl}?t=${Date.now()}${Math.random()}`);

const sessions = Array.from({ length: 8 }, (_, index) => ({ id: `w${index + 1}` }));

test("layout model exposes one resize handle per split with a stable axis + ratio", async () => {
  const { layoutHandles } = await load();
  assert.deepEqual(layoutHandles("single"), []);
  assert.deepEqual(layoutHandles("horizontal"), [{ id: "col", axis: "x", ratio: "col" }]);
  assert.deepEqual(layoutHandles("vertical"), [{ id: "row", axis: "y", ratio: "row" }]);
  assert.deepEqual(layoutHandles("grid-2x2").map(h => h.id), ["col", "row"]);
  assert.deepEqual(layoutHandles("grid-3x2").map(h => h.id), ["col", "row"]);
  // 2x2 and 3x2 resize both a column and a row split.
  assert.deepEqual(layoutHandles("grid-2x2").map(h => h.axis), ["x", "y"]);
});

test("split ratios are clamped to a usable band on every axis", async () => {
  const { normalizeTerminalLayout, setLayoutRatio, MIN_SPLIT, MAX_SPLIT } = await load();
  assert.equal(MIN_SPLIT, 25);
  assert.equal(MAX_SPLIT, 75);

  const tiny = setLayoutRatio({ layoutId: "grid-2x2" }, "col", 4, sessions);
  assert.equal(tiny.ratios.col, MIN_SPLIT, "cannot drag a pane below the minimum");
  const huge = setLayoutRatio({ layoutId: "grid-2x2" }, "row", 999, sessions);
  assert.equal(huge.ratios.row, MAX_SPLIT, "cannot drag a pane past the maximum");

  // Legacy single-ratio payloads still resolve.
  assert.equal(normalizeTerminalLayout({ layoutId: "horizontal", paneRatio: 62 }, sessions).paneRatio, 62);
  assert.equal(normalizeTerminalLayout({ layoutId: "horizontal", paneRatio: 3 }, sessions).paneRatio, 25);
});

test("column and row ratios are independent and survive a round-trip", async () => {
  const { setLayoutRatio, normalizeTerminalLayout } = await load();
  let pref = normalizeTerminalLayout({ layoutId: "grid-2x2" }, sessions);
  pref = setLayoutRatio(pref, "col", 40, sessions);
  pref = setLayoutRatio(pref, "row", 65, sessions);
  assert.deepEqual(pref.ratios, { col: 40, row: 65 });

  const persisted = JSON.parse(JSON.stringify(pref));
  const restored = normalizeTerminalLayout(persisted, sessions);
  assert.deepEqual(restored.ratios, { col: 40, row: 65 });
  assert.equal(restored.paneRatio, 40, "paneRatio alias tracks the column split");
});

test("each layout remembers its own ratios and 3x2 starts balanced", async () => {
  const { normalizeTerminalLayout, setLayoutRatio } = await load();
  let pref = normalizeTerminalLayout({ layoutId: "grid-3x2" }, sessions);
  assert.deepEqual(pref.ratios, { col: 34, row: 50 });
  pref = setLayoutRatio(pref, "col", 40, sessions);
  const twoByTwo = normalizeTerminalLayout({ ...pref, layoutId: "grid-2x2" }, sessions);
  assert.deepEqual(twoByTwo.ratios, { col: 50, row: 50 });
  const restored = normalizeTerminalLayout({ ...twoByTwo, layoutId: "grid-3x2" }, sessions);
  assert.equal(restored.ratios.col, 40);
});

test("layoutStyle emits the exact custom properties the grid template consumes", async () => {
  const { layoutStyle, normalizeTerminalLayout } = await load();
  const style = layoutStyle(normalizeTerminalLayout({ layoutId: "grid-2x2", ratios: { col: 44, row: 58 } }, sessions));
  assert.equal(style["--col-ratio"], "44%");
  assert.equal(style["--row-ratio"], "58%");
  assert.equal(style["--pane-primary"], "44%");
});

test("slot assignment still swaps workers and never duplicates a pane", async () => {
  const { normalizeTerminalLayout, assignTerminalSlot } = await load();
  const six = normalizeTerminalLayout({ layoutId: "grid-3x2" }, sessions);
  assert.equal(six.sessionIds.length, 6);
  const swapped = assignTerminalSlot(six, 0, six.sessionIds[3], sessions);
  assert.equal(swapped.sessionIds[0], six.sessionIds[3]);
  assert.equal(swapped.sessionIds[3], six.sessionIds[0]);
  assert.equal(new Set(swapped.sessionIds.filter(Boolean)).size, 6);
});

test("layout persistence is keyed per project path", () => {
  const src = read("useTerminalLayout.js");
  assert.match(src, /mission-control:terminal-layout:v1:/);
  assert.match(src, /workspace\?\.path/);
  assert.match(src, /window\.localStorage\.setItem\(key, JSON\.stringify\(preference\)\)/);
});

test("TerminalPane never resizes an exited PTY but still reflows xterm", () => {
  const src = read("TerminalPane.jsx");
  // Guard flag exists and is cleared the moment the engine reports an exit.
  assert.match(src, /aliveRef = React\.useRef/);
  assert.match(src, /aliveRef\.current = false;\s*\n\s*setConnection\("exited"\)/);
  // The resize IPC is gated on the guard; the local fit() is not.
  assert.match(src, /if \(streamId && aliveRef\.current\) \{[\s\S]*terminal\.resize/);
  assert.match(src, /fit\.fit\(\);/);
  // Still the approved Protocol route, and still debounced by rAF.
  assert.match(src, /missionApi\(\)\.request\("terminal\.resize"/);
  assert.match(src, /requestAnimationFrame\(fitAndResize\)/);
  // Layout changes must not recreate / restart / attach the worker.
  assert.doesNotMatch(src, /terminal\.open[\s\S]{0,40}resize/);
});

test("workspace CSS honours the drag ratio and enforces a minimum pane size", () => {
  const css = read("redesign/workspace.css");
  // The template wants the ratio but clamps to an absolute pixel floor.
  assert.match(css, /--pane-min-w:\s*\d{3}px/);
  assert.match(css, /--pane-min-h:\s*\d{3}px/);
  assert.match(css, /grid-template-columns:\s*\n?\s*minmax\(var\(--pane-min-w\), var\(--col-ratio\)\)/);
  assert.match(css, /minmax\(var\(--pane-min-h\), var\(--row-ratio\)\)/);
  // 3x2 keeps its first column resizable; the other two share the remainder.
  assert.match(css, /layout-grid-3x2[\s\S]*repeat\(2, minmax\(var\(--pane-min-w\), 1fr\)\)/);
  // One deliberate narrow-width fallback, not three competing ones.
  assert.match(css, /@media \(max-width: 1100px\)[\s\S]*grid-auto-rows: minmax\(var\(--pane-min-h\), 1fr\)/);
});

test("main.jsx loads the authoritative redesign layer last", () => {
  const main = read("main.jsx");
  assert.match(main, /import "\.\/premiumDesign\.css";[\s\S]*import "\.\/redesign\/tokens-bridge\.css";[\s\S]*import "\.\/redesign\/base\.css";[\s\S]*import "\.\/redesign\/surfaces\.css";[\s\S]*import "\.\/redesign\/workspace\.css";[\s\S]*import "\.\/redesign\/screens\.css";/);
  assert.doesNotMatch(main, /import "\.\/theme-concept\.css"/);
});

test("terminal headers report role, uptime, ownership and activity from engine facts", () => {
  const src = read("TerminalPane.jsx");
  assert.match(src, /className="terminal-pane__facts"/);
  assert.match(src, /terminal-role-tag role-\$\{profile\.key\}/);
  assert.match(src, /terminal-pane__activity/);

  // Uptime is derived from engine startTime and is absent unless alive.
  assert.match(src, /function uptime\(session\)[\s\S]*if \(!session\?\.isAlive \|\| !Number\.isFinite\(session\?\.startTime\)\) return null/);
  // Ownership names the engine-owned PTY and the real pid, never a guess.
  assert.match(src, /function ownership\(session\)[\s\S]*Engine PTY · pid \$\{session\.pid\}/);
  assert.match(src, /Engine-owned PTY/);
  // Activity uses only reported evidence and falls back to silence.
  assert.match(src, /function activity\(session, connection\)[\s\S]*session\.attentionReason/);
  assert.match(src, /Running · no output reported yet/);
  // No fabricated completion: the pane renders no computed percentage and no
  // width-driven progress bar, only reported text.
  assert.doesNotMatch(src, /style=\{\{\s*width:/);
  assert.doesNotMatch(src, /percentComplete|completionPercent|progressValue/i);
});

test("the uptime clock only runs while the engine reports the worker alive", () => {
  const src = read("TerminalPane.jsx");
  assert.match(src, /if \(!session\?\.isAlive\) return undefined;\s*\n\s*const timer = window\.setInterval/);
  assert.match(src, /return \(\) => window\.clearInterval\(timer\)/);
});

test("terminal overflow menu exposes every required action including reconfigure", () => {
  const src = read("TerminalPane.jsx");
  for (const action of [
    "Focus terminal", "Find in output", "Copy selection", "Clear display",
    "Reconfigure worker", "Stop worker", "Delete terminal"
  ]) assert.ok(src.includes(action), `overflow menu is missing "${action}"`);
  // Destructive entries stay marked and Delete still routes through confirmation.
  assert.match(src, /is-danger" onSelect=\{\(\) => requestAction\("remove"\)\}/);
  assert.match(src, /is-warning" onSelect=\{\(\) => requestAction\("kill"\)\}/);
  assert.doesNotMatch(src, /className="terminal-delete-button"/);
});

test("reconfigure opens the existing worker dialog in edit mode, not a new API", () => {
  const app = read("App.jsx");
  assert.match(app, /onReconfigure=\{session => setWorkerDialog\(\{ mode: "edit", configuration: session \}\)\}/);
  assert.match(app, /onReconfigure=\{onReconfigure\}/);
  const pane = read("TerminalPane.jsx");
  assert.match(pane, /onReconfigure\(session\)/);
});

test("workspace toolbar carries layout, creation, search, focus mode and recipes", () => {
  const app = read("App.jsx");
  assert.match(app, /workspace-toolbar-v2/);
  assert.match(app, /TERMINAL WORKSPACE/);
  assert.match(app, /CANVAS LAYOUT/);
  assert.match(app, /Add terminal worker/);
  assert.match(app, /workspace-worker-search/);
  assert.match(app, /workspace-focus-mode/);
  assert.match(app, /className="workspace-recipes"/);
  // Focus mode is presentation only — it must not dispatch worker actions.
  assert.match(app, /setFocusMode\(value => !value\)/);
  assert.match(app, /\{!focusMode && <WorkerFolders/);
  assert.match(app, /inspectorOpen && !focusMode && <aside/);
});

test("worker search assigns a match into the focused pane without restarting it", () => {
  const app = read("App.jsx");
  assert.match(app, /const focusedSlot = Math\.max\(0, terminalLayout\.sessionIds\.indexOf\(focusedId\)\)/);
  assert.match(app, /const showInPane = id => \{ terminalLayout\.setSlotSession\(focusedSlot, id\); onFocus\(id\); setQuery\(""\); \}/);
  // Showing a worker in a pane must never dispatch start/restart/attach.
  assert.doesNotMatch(app, /showInPane = id => \{[^}]*onAction/);
});

test("workspace keyboard shortcuts move pane focus and cycle layouts", () => {
  const app = read("App.jsx");
  assert.match(app, /ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns/);
  assert.match(app, /const columns = terminalLayout\.layout\.cols \|\| 1/);
  assert.match(app, /event\.key\.toLowerCase\(\) === "l"/);
  // Shortcuts stay inert while a dialog, palette or confirmation owns focus.
  assert.match(app, /if \(view !== "workspace" \|\| paletteOpen \|\| missionAiOpen \|\| missionGraphOpen \|\| confirmation \|\| workerDialog \|\| !event\.altKey\) return/);
});

test("every terminal layout declares the column count the shortcuts rely on", async () => {
  const { TERMINAL_LAYOUTS } = await load();
  for (const layout of TERMINAL_LAYOUTS) {
    assert.equal(Number.isInteger(layout.cols) && layout.cols > 0, true, `${layout.id} has no cols`);
    assert.equal(Number.isInteger(layout.rows) && layout.rows > 0, true, `${layout.id} has no rows`);
    assert.equal(layout.cols * layout.rows, layout.slots, `${layout.id} cols×rows must equal slots`);
  }
});

test("filtered worker groups adapt to their population without changing the selected canvas layout", () => {
  const app = read("App.jsx");
  assert.match(app, /function layoutForCount\(count\)/);
  assert.match(app, /count <= 1 \? "single" : count === 2 \? "horizontal" : count <= 4 \? "grid-2x2" : "grid-3x2"/);
  assert.match(app, /const effectiveLayout = activeFolder \? layoutForCount\(folderSessions\.length\) : terminalLayout\.layout/);
  assert.match(app, /folderWorkers\.length < effectiveLayout\.slots \? \[null\] : \[\]/);
  assert.match(app, /terminal-grid \$\{effectiveLayout\.className\}/);
  assert.match(app, /terminalLayout\.layout\.id === option\.id/,
    "the persisted canvas selection must remain highlighted while a filter is active");
  assert.doesNotMatch(app, /activeFolder[\s\S]{0,220}Array\.from\(\{ length: Math\.max\(0, terminalLayout\.layout\.slots/);
});

test("expanded terminals synchronize peers into mounted minimized strips", () => {
  const app = read("App.jsx");
  const pane = read("TerminalPane.jsx");
  const css = read("redesign/workspace.css");

  assert.match(app, /const visible = filteredSlots/);
  assert.match(app, /minimized=\{Boolean\(expandedId\) && Boolean\(session\) && session\.id !== expandedId\}/);
  assert.match(pane, /minimizedRef = React\.useRef\(Boolean\(minimized\)\)/);
  assert.match(pane, /if \(disposed \|\| !host\.isConnected \|\| minimizedRef\.current\) return/);
  assert.match(pane, /terminal-pane__header--minimized/);
  assert.match(pane, /<div className="terminal-host" ref=\{hostRef\} aria-hidden=\{minimized \|\| undefined\} inert=\{minimized \? "" : undefined\}/,
    "the xterm host must remain mounted when its strip is minimized");
  assert.match(css, /terminal-grid\.has-expanded[\s\S]*terminal-pane\.is-expanded[\s\S]*terminal-pane\.is-minimized/);
  assert.match(css, /terminal-pane\.is-minimized \.terminal-host[\s\S]*width: 1px;[\s\S]*opacity: 0/);
});

test("workspace increment 2 keeps dialog, status and menu polish in the authoritative token layer", () => {
  const base = read("redesign/base.css");
  const surfaces = read("redesign/surfaces.css");
  const workspace = read("redesign/workspace.css");
  const pane = read("TerminalPane.jsx");

  assert.match(workspace, /\.view-workspace \.workspace-intelligence \{ display: none !important; \}/);
  assert.match(workspace, /\.workspace-title \{[\s\S]{0,100}min-width: 200px/);
  assert.match(base, /status-bar-premium__indicator[\s\S]*background: var\(--mc-ok-soft\)/);
  assert.match(base, /status-bar-premium__crumb[\s\S]*border-left: 1px solid var\(--mc-hairline\)/);
  assert.match(surfaces, /worker-template-card code[\s\S]*white-space: nowrap;[\s\S]*text-overflow: ellipsis/);
  assert.match(surfaces, /worker-dialog-guide[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.equal((pane.match(/DropdownMenu\.Separator className="terminal-action-separator"/g) || []).length, 3);
  assert.doesNotMatch(pane, /[⠿↗⊡]|•••/);
  assert.match(pane, /function PaneIcon/);
});

test("folder filters cannot move the workspace chrome with terminal intrinsic height", () => {
  const base = read("redesign/base.css");
  const css = read("redesign/workspace.css");
  assert.match(base, /html body #root \.shell > \.main-area \{[\s\S]*grid-template-rows: 42px minmax\(0, 1fr\) !important;/,
    "the loaded-last shell must match premiumV3 specificity and beat its obsolete bottom-status grid");
  assert.match(base, /html body #root \.shell > \.main-area > \.mission-status-bar \{ grid-row: 1; \}/);
  assert.match(base, /html body #root \.shell > \.main-area > \.experience \{ grid-row: 2; \}/,
    "all screens, including Needs You, must occupy the bounded second shell row");
  assert.match(base, /html body #root \.shell > \.main-area > \.experience\.view-workspace \{[\s\S]*overflow: hidden !important;/);
  assert.match(css, /\.view-workspace \.terminal-grid \{[\s\S]*flex: 1 1 0 !important;/);
  assert.match(css, /\.workspace-experience \{[\s\S]*display: flex !important;[\s\S]*overflow: hidden;/);
  assert.match(css, /\.workspace-stage \{[\s\S]*flex: 1 1 0;[\s\S]*justify-content: flex-start !important;[\s\S]*overflow: hidden;/);
  assert.match(css, /\.workspace-stage > \.workspace-toolbar-v2 \{ order: 1; flex: 0 0 auto; \}/);
  assert.match(css, /\.workspace-stage > \.worker-folders \{ order: 2; flex: 0 0 auto; \}/);
  assert.match(css, /\.workspace-stage > \.terminal-grid \{ order: 3; \}/);
});
