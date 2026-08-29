const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("the consolidated full-app concept is mapped onto the live renderer", () => {
  const app = read("src/groundstation/renderer/App.jsx");
  const main = read("src/groundstation/renderer/main.jsx");
  const bridge = read("src/groundstation/renderer/redesign/tokens-bridge.css");
  const base = read("src/groundstation/renderer/redesign/base.css");
  const workspace = read("src/groundstation/renderer/redesign/workspace.css");
  const screens = read("src/groundstation/renderer/redesign/screens.css");
  const status = read("src/groundstation/renderer/StatusBar.jsx");
  const missionAi = read("src/groundstation/renderer/MissionAIScreen.jsx");

  assert.match(main, /import "\.\/premiumV3\.css";[\s\S]*import "\.\/redesign\/tokens-bridge\.css";[\s\S]*import "\.\/redesign\/base\.css";[\s\S]*import "\.\/redesign\/workspace\.css";[\s\S]*import "\.\/redesign\/screens\.css";/);
  assert.doesNotMatch(main, /import "\.\/(?:reference-final|prototype2026|theme-concept)\.css"/);
  for (const token of ["--mc-void", "--mc-accent", "--mc-ok", "--mc-warning", "--mc-danger", "--mc-ai"]) {
    assert.match(bridge, new RegExp(token));
  }
  assert.match(base, /2\.19 shell contract/);
  assert.match(base, /grid-template-columns: 212px minmax\(0, 1fr\)/);
  assert.match(workspace, /container: workspace-stage \/ inline-size/);
  assert.match(screens, /2\.19 Groundstation contract/);
  assert.match(base, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(app, /const workers = sessions\.filter\(session => !session\.id\.startsWith\("agent-"\)\)/);
  assert.match(app, /workers\.map\(session => <ReferenceManifestRow/);
  assert.match(app, /data-tooltip=\{`Switch project/);
  assert.match(app, /className="app-sidebar__rail-label"/);
  assert.match(app, /pendingCount=\{pendingCount\}/);
  assert.match(status, /status-bar-premium__crumb"><b>\{VIEW_LABELS\[view\]/);
  assert.match(missionAi, /mode === "ask" \? "Read-only answers" : "Proposal only"/);
});

test("overview failures open evidence before lifecycle mutation", () => {
  const app = read("src/groundstation/renderer/App.jsx");
  assert.match(app, /session\.status === "failed" \|\| session\.attentionRequired \? "focus"/);
  assert.doesNotMatch(app, /session\.status === "failed" \? "restart" : session\.attentionRequired/);
});
