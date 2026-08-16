const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const { test } = require("node:test");

const moduleUrl = pathToFileURL(
  path.resolve(__dirname, "../src/groundstation/renderer/missionApi.js")
).href;
const workerFormUrl = pathToFileURL(
  path.resolve(__dirname, "../src/groundstation/renderer/workerForm.js")
).href;
const terminalLayoutUrl = pathToFileURL(
  path.resolve(__dirname, "../src/groundstation/renderer/useTerminalLayout.js")
).href;

test("Groundstation product experience keeps the intentional navigation and Mission Command", () => {
  const appSource = require("node:fs").readFileSync(
    path.resolve(__dirname, "../src/groundstation/renderer/App.jsx"),
    "utf8"
  );
  const workerDialogSource = require("node:fs").readFileSync(
    path.resolve(__dirname, "../src/groundstation/renderer/WorkerDialog.jsx"),
    "utf8"
  );

  for (const section of ["Groundstation", "Workspace", "Needs You", "History"]) {
    assert.match(appSource, new RegExp(`\\[\\\"[^\\\"]+\\\", \\\"${section}\\\"`));
  }
  for (const destination of ["Manage AI agents", "Switch project", "Open settings"]) {
    assert.match(appSource, new RegExp(`\\[\\\"[^\\\"]+\\\", \\\"${destination}\\\"`));
  }
  for (const removedPrimaryPage of ["Overview", "Terminals", "Activity", "Logs"] ) {
    assert.doesNotMatch(appSource, new RegExp(`\\[\\\"[^\\\"]+\\\", \\\"${removedPrimaryPage}\\\"`));
  }
  assert.match(appSource, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(appSource, /event\.key\.toLowerCase\(\) === "k"/);
  assert.match(appSource, /event\.key\.toLowerCase\(\) === "n"/);
  assert.match(appSource, /Alt G/);
  assert.match(workerDialogSource, /QUICK START/);
  assert.match(workerDialogSource, /Frontend dev/);
  assert.match(workerDialogSource, /Docker stack/);
  assert.match(workerDialogSource, /Git status/);
  assert.match(appSource, /PROJECT PULSE/);
  assert.match(appSource, /AttentionShelf/);
  assert.match(appSource, /decisionFor/);
  assert.match(appSource, /Evidence/);
  assert.match(appSource, /Restart & verify/);
  assert.match(appSource, /LIVE PROJECT SCENE/);
  assert.match(appSource, /YOUR CONTROL DECK/);
  assert.match(appSource, /Terminal wall/);
  assert.match(appSource, /MISSION COMMAND/);
  assert.match(appSource, /WORKER INTELLIGENCE/);
  assert.match(appSource, /SOURCE CONTROL/);
  assert.match(appSource, /working tree clean/);
  assert.match(appSource, /gitChanges/);
  assert.match(appSource, /LIVE AGENTS/);
  assert.match(appSource, /WORKER FOCUS/);
  assert.match(appSource, /QUICK LOOK · HOLD SPACE/);
  assert.match(appSource, /event\.code !== "Space"/);
  assert.match(appSource, /Release Space to close/);
  assert.match(appSource, /TERMINAL WORKSPACE/);
  assert.match(appSource, /CANVAS LAYOUT/);
  assert.match(appSource, /Add terminal worker/);
  assert.match(appSource, /Create worker/);
  assert.match(appSource, /pendingWorkspaceWorker/);
  assert.match(appSource, /added to the terminal workspace/);
  assert.match(appSource, /Start all idle workers/);
  assert.match(appSource, /Stop all running workers/);
  assert.match(appSource, /Stop workspace/);
  assert.match(appSource, /executeBulk/);
  assert.match(appSource, /Selected worker/);
  assert.match(appSource, /Choose existing/);
  assert.match(appSource, /Restarting…/);
  assert.doesNotMatch(appSource, /<select/);
  assert.match(appSource, /What is happening/);
  assert.match(appSource, /function nowSummary/);
  assert.match(appSource, /className="now-summary"/);
  assert.match(appSource, /Terminal history/);
  assert.match(appSource, /Open conversation/);
  assert.match(appSource, /Add agent/);
  assert.match(appSource, /onNavigate\("agents"\)/);
  assert.match(appSource, /ACTIVE CREW/);
  assert.match(appSource, /agent-command-deck/);
  assert.match(appSource, /Risks & attention/);
  assert.match(appSource, /item\.attentionRequired \|\| item\.status === "failed"/);
  assert.match(appSource, /No matching history/);
  assert.match(appSource, /ENGINE EVIDENCE/);
  assert.match(appSource, /RUN CHAPTERS/);
  assert.match(appSource, /Correlation-backed/);
  assert.match(appSource, /Structured evidence is stored without raw terminal output/);
  assert.match(appSource, /Search event, actor, reason/);
  assert.match(appSource, /RECORDED EVIDENCE/);
  assert.match(appSource, /durable timeline of worker changes and verified operational facts/);
  assert.match(appSource, /SINCE YOU LAST CHECKED/);
  assert.match(appSource, /mission-control\.history-cursor\.v1/);
  assert.match(appSource, /Mark reviewed/);
  assert.match(appSource, /Add & start/);
  assert.match(appSource, /request\("agent\.create", \{ adapterId \}\)/);
  assert.match(appSource, /sessionId: createdSessionId, action: \{ type: "start" \}/);
  assert.match(appSource, /progress not reported/);
  assert.doesNotMatch(appSource, /68%|Mark resolved|window\.confirm/);
  assert.match(appSource, /ConfirmationDialog/);
  assert.match(appSource, /ArrowDown/);
  assert.match(appSource, /aria-selected/);
  assert.match(appSource, /fuzzyCommandScore/);
  assert.match(appSource, /mission-control\.command-recents\.v1/);
  assert.match(appSource, /Fuzzy search · Engine-safe actions only/);
  assert.match(appSource, /terminalFontSize=\{preferences\.terminalFontSize\}/);
  assert.match(appSource, /project\.status === "uninitialized"/);
  assert.match(appSource, /project\.initialize/);
  assert.match(appSource, /terminals and agents now use this folder/);
  assert.match(appSource, /Choose a project folder/);
  assert.match(appSource, /Open workspace recipes/);
  assert.match(appSource, /Launching \$\{recipe\.name\}/);
  assert.match(appSource, /terminalLayout\.applyLayout/);

  const recipesSource = require("node:fs").readFileSync(
    path.resolve(__dirname, "../src/groundstation/renderer/WorkspaceRecipes.jsx"),
    "utf8"
  );
  assert.match(recipesSource, /WORKSPACE RECIPES/);
  assert.match(recipesSource, /Worker startup order/);
  assert.match(recipesSource, /Launch recipe/);
  assert.match(recipesSource, /recipe\.save/);
  assert.match(recipesSource, /recipe\.pause/);
  assert.match(recipesSource, /SHARED PROJECT RECIPES/);
  assert.match(recipesSource, /dependency graph/);

  const agentSource = require("node:fs").readFileSync(
    path.resolve(__dirname, "../src/groundstation/renderer/AgentWorkspace.jsx"),
    "utf8"
  );
  assert.match(agentSource, /AI WORKFORCE/);
  assert.match(agentSource, /AGENT DEPLOYMENT/);
  assert.match(agentSource, /Expand your AI crew/);
  assert.match(agentSource, /agent-picker-summary/);
  assert.match(agentSource, /Add another/);
  assert.match(agentSource, /MULTI-AGENT READY/);
  assert.match(agentSource, /SESSION SUMMARY/);
  assert.match(agentSource, /CURRENT MISSION/);
  assert.match(agentSource, /mission\.save/);
  assert.match(agentSource, /MISSION PERMISSIONS/);
  assert.match(agentSource, /PERMISSION PREVIEW/);
  assert.match(agentSource, /MULTI-AGENT RESULTS/);
  assert.match(agentSource, /FILES & DIFF/);
  assert.match(agentSource, /terminal\.open/);
  assert.match(agentSource, /terminal\.write/);
  assert.match(agentSource, /Send an instruction/);
  assert.doesNotMatch(agentSource, /api key|GEMINI_API_KEY/i);

  const styleSource = require("node:fs").readFileSync(
    path.resolve(__dirname, "../src/groundstation/renderer/styles.css"),
    "utf8"
  );
  assert.match(styleSource, /scrollbar-width: thin/);
  assert.match(styleSource, /::-webkit-scrollbar-thumb/);

  const terminalSource = require("node:fs").readFileSync(
    path.resolve(__dirname, "../src/groundstation/renderer/TerminalPane.jsx"),
    "utf8"
  );
  assert.doesNotMatch(terminalSource, /className="terminal-session-select"/);
  assert.match(terminalSource, /className="terminal-session-menu"/);
  assert.match(terminalSource, /terminal-pane__telemetry/);
  assert.match(terminalSource, /session\.cwd \|\| "\."/);
});

test("Groundstation build is isolated from parent PostCSS configurations", async () => {
  const configUrl = pathToFileURL(
    path.resolve(__dirname, "../vite.groundstation.config.mjs")
  ).href;
  const { default: config } = await import(`${configUrl}?postcss=${Date.now()}`);

  assert.deepEqual(config.css?.postcss, { plugins: [] });
  assert.deepEqual(config.build?.rollupOptions?.output?.manualChunks, {
    "vendor-react": ["react", "react-dom"],
    "vendor-terminal": ["@xterm/xterm", "@xterm/addon-fit"]
  });
});

test("renderer bridge unwraps protocol results and preserves structured errors", async t => {
  const originalWindow = global.window;
  t.after(() => { global.window = originalWindow; });
  const subscriptions = [];
  global.window = {
    missionControl: {
      subscribe(callback) {
        subscriptions.push(callback);
        return () => subscriptions.splice(subscriptions.indexOf(callback), 1);
      },
      async request(method) {
        if (method === "state.get") return { version: 1, id: "a", ok: true, result: { sequence: 9 } };
        return {
          version: 1,
          id: "b",
          ok: false,
          error: { code: "ACTION_FAILED", message: "worker refused" }
        };
      }
    }
  };
  const { missionApi } = await import(`${moduleUrl}?bridge=${Date.now()}`);
  const api = missionApi();

  assert.deepEqual(await api.request("state.get"), { sequence: 9 });
  await assert.rejects(
    api.request("action.dispatch"),
    error => error.code === "ACTION_FAILED" && error.message === "worker refused"
  );
  const unsubscribe = api.subscribe(() => {});
  assert.equal(subscriptions.length, 1);
  unsubscribe();
  assert.equal(subscriptions.length, 0);
});

test("renderer notification helpers recognize engine and terminal frames", async () => {
  const {
    engineEventFrom,
    notificationType,
    streamIdentifier
  } = await import(`${moduleUrl}?frames=${Date.now()}`);
  const engineFrame = {
    version: 1,
    type: "engine:event",
    event: { sequence: 3, type: "session:status", id: "api" }
  };

  assert.deepEqual(engineEventFrom(engineFrame), engineFrame.event);
  assert.equal(notificationType({ type: "terminal:data" }), "terminal:data");
  assert.equal(streamIdentifier({ streamId: "stream-1" }), "stream-1");
});

test("worker form builds validated create definitions without weakening engine limits", async () => {
  const { buildWorkerDefinition, initialWorkerDraft } = await import(`${workerFormUrl}?create=${Date.now()}`);
  const defaultDraft = initialWorkerDraft();
  assert.equal(defaultDraft.command, "powershell.exe");
  assert.equal(defaultDraft.autoStart, true);
  assert.equal(defaultDraft.powershellCompatibility, false);
  const definition = buildWorkerDefinition({
    id: "api.dev",
    name: "API dev server",
    command: "npm",
    argsText: '["run", "dev"]',
    cwd: "./api",
    envText: '{"PORT":"3000"}',
    autoStart: false,
    powershellCompatibility: true
  });

  assert.deepEqual(definition, {
    id: "api.dev",
    name: "API dev server",
    command: "npm",
    args: ["run", "dev"],
    cwd: "./api",
    env: { PORT: "3000" },
    autoStart: false,
    powershellCompatibility: true
  });
  assert.throws(
    () => buildWorkerDefinition({ ...definition, argsText: "[]", envText: '{"PORT":3000}' }),
    /Environment values must be strings/
  );
  assert.throws(
    () => buildWorkerDefinition({ ...definition, id: "bad id", argsText: "[]", envText: "{}" }),
    /Worker ID may use only/
  );
});

test("worker edit patches preserve secret environment values unless replacement is explicit", async () => {
  const { buildWorkerPatch, initialWorkerDraft } = await import(`${workerFormUrl}?edit=${Date.now()}`);
  const draft = initialWorkerDraft({
    id: "api",
    name: "API",
    command: "npm run dev",
    args: [],
    cwd: ".",
    envKeys: ["TOKEN", "PORT"],
    autoStart: true,
    powershellCompatibility: false
  });
  const preserved = buildWorkerPatch(draft);
  assert.equal(Object.hasOwn(preserved, "env"), false);
  assert.equal(JSON.stringify(draft).includes("TOKEN"), false);

  const replaced = buildWorkerPatch({
    ...draft,
    replaceEnvironment: true,
    envText: '{"PORT":"4000"}'
  });
  assert.deepEqual(replaced.env, { PORT: "4000" });
});

test("terminal layouts support unique persisted 1, 2, 4, and 6-pane assignments", async () => {
  const {
    TERMINAL_LAYOUTS,
    assignTerminalSlot,
    normalizeTerminalLayout
  } = await import(`${terminalLayoutUrl}?layout=${Date.now()}`);
  const sessions = Array.from({ length: 7 }, (_, index) => ({ id: `worker-${index + 1}` }));
  assert.deepEqual(TERMINAL_LAYOUTS.map(layout => layout.slots), [1, 2, 2, 4, 6]);

  const six = normalizeTerminalLayout({
    layoutId: "grid-3x2",
    sessionIds: ["worker-3", "missing", "worker-3", "worker-1"]
  }, sessions);
  assert.equal(six.sessionIds.length, 6);
  assert.deepEqual(six.sessionIds.slice(0, 4), ["worker-3", null, null, "worker-1"]);
  assert.equal(new Set(six.sessionIds.filter(Boolean)).size, 4);
  assert.equal(
    new Set(normalizeTerminalLayout({ layoutId: "grid-3x2" }, sessions).sessionIds.filter(Boolean)).size,
    6
  );

  const swapped = assignTerminalSlot(six, 0, six.sessionIds[4], sessions);
  assert.equal(swapped.sessionIds[0], six.sessionIds[4]);
  assert.equal(swapped.sessionIds[4], six.sessionIds[0]);
  assert.equal(new Set(swapped.sessionIds.filter(Boolean)).size, 4);
  assert.equal(normalizeTerminalLayout({ layoutId: "horizontal", paneRatio: 68 }, sessions).paneRatio, 68);
  assert.equal(normalizeTerminalLayout({ layoutId: "horizontal", paneRatio: 99 }, sessions).paneRatio, 75);
  const appSource = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/groundstation/renderer/App.jsx"), "utf8");
  assert.match(appSource, /className=\{`pane-resize-handle/);
  assert.match(appSource, /onPointerDown=\{beginPaneResize\}/);
  assert.match(appSource, /onDoubleClick=\{\(\) => terminalLayout\.setPaneRatio\(50\)\}/);
  assert.doesNotMatch(appSource, /aria-label="Resize terminal panes" type="range"/);
  assert.match(appSource, /function WorkerFolders/);
  assert.match(appSource, /AI conversations/);
  assert.match(appSource, /New folder/);
  assert.match(appSource, /mission-control\.worker-folders\.v1/);
});
