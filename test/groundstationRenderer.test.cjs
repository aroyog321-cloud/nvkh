const assert = require("node:assert/strict");
const fs = require("node:fs");
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

  for (const section of ["Groundstation", "Workspace", "Needs You", "Agents", "Recipes", "History", "Settings"]) {
    assert.match(appSource, new RegExp(`\\[\\\"[^\\\"]+\\\", \\\"${section}\\\"`));
  }
  for (const destination of ["Switch project"]) {
    assert.match(appSource, new RegExp(`\\[\\\"[^\\\"]+\\\", \\\"${destination}\\\"`));
  }
  for (const removedPrimaryPage of ["Overview", "Terminals", "Activity", "Logs"] ) {
    assert.doesNotMatch(appSource, new RegExp(`\\[\\\"[^\\\"]+\\\", \\\"${removedPrimaryPage}\\\"`));
  }
  for (const contextualOnlyPage of ["Tasks", "Git", "Tests", "Builds", "Docker", "Database", "Workers"]) {
    assert.doesNotMatch(appSource, new RegExp(`\\[\\s*\\\"[^\\\"]+\\\",\\s*\\\"${contextualOnlyPage}\\\"`));
  }
  assert.match(appSource, /Notification policy is managed in Settings/);
  assert.match(appSource, /function NotificationSettings/);
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
  assert.match(appSource, /LIVE PROJECT ENVIRONMENT/);
  assert.match(appSource, /GroundstationRecipeLauncher/);
  assert.match(appSource, /Start a saved working set/);
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
  assert.match(appSource, /className="now-summary pm-card"/);
  assert.match(appSource, /Terminal history/);
  assert.match(appSource, /Review agent/);
  assert.match(appSource, /Add Worker/);
  assert.match(appSource, /onNavigate\("agents"\)/);
  assert.match(appSource, /ACTIVE CREW/);
  assert.match(appSource, /agent-command-deck/);
  assert.match(appSource, /Risks & attention/);
  assert.match(appSource, /function needsAttention\(session\)/);
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
  assert.match(appSource, /from "cmdk"/);
  assert.match(appSource, /<Command\.Item/);
  assert.doesNotMatch(appSource, /fuzzyCommandScore/);
  assert.match(appSource, /mission-control\.command-recents\.v1/);
  assert.match(appSource, /Fuzzy search · Engine-safe actions only/);
  assert.match(appSource, /@radix-ui\/react-alert-dialog/);
  assert.match(appSource, /@radix-ui\/react-dropdown-menu/);
  assert.match(appSource, /function ResourceLinks/);
  assert.match(appSource, /terminalPreferences=\{preferences\}/);
  assert.match(appSource, /terminalFontSize=\{terminalPreferences\.terminalFontSize\}/);
  assert.match(appSource, /terminalTheme=\{terminalPreferences\.terminalTheme\}/);
  assert.match(appSource, /terminalCursor=\{terminalPreferences\.terminalCursor\}/);
  assert.match(appSource, /terminalScrollback=\{terminalPreferences\.terminalScrollback\}/);
  assert.match(appSource, /project\.status === "uninitialized"/);
  assert.match(appSource, /project\.initialize/);
  assert.match(appSource, /terminals and agents now use this folder/);
  assert.match(appSource, /Choose a project folder/);
  assert.match(appSource, /Open workspace recipes/);
  assert.match(appSource, /Launching \$\{recipe\.name\}/);
  assert.match(appSource, /terminalLayout\.applyLayout/);
  assert.match(appSource, /VS Code-owned terminals are observe-only/);
  assert.match(appSource, /Approve & create/);
  assert.match(appSource, /Approve & send/);
  assert.match(appSource, /vscode\.terminal\.write/);
  assert.match(appSource, /confirm:vscode\.terminal\.write:/);
  assert.match(appSource, /raw output never crosses the bridge/);
  assert.match(appSource, /function SupervisionBriefing/);
  assert.match(appSource, /request\("supervision\.get"/);
  assert.match(appSource, /WHAT IS RUNNING/);
  assert.match(appSource, /WHAT CHANGED/);
  assert.match(appSource, /WHAT NEEDS YOU/);
  assert.match(appSource, /FACTS AND INFERENCES SEPARATED/);

  const recipesSource = require("node:fs").readFileSync(
    path.resolve(__dirname, "../src/groundstation/renderer/WorkspaceRecipes.jsx"),
    "utf8"
  );
  const recipeBuilderSource = require("node:fs").readFileSync(
    path.resolve(__dirname, "../src/groundstation/renderer/recipeBuilderModel.js"),
    "utf8"
  );
  assert.match(recipesSource, /DAILY WORKSPACES/);
  assert.match(recipesSource, /Select terminals and arrange the launch order/);
  assert.match(recipesSource, /Launch recipe/);
  assert.match(recipesSource, /recipe\.save/);
  assert.match(recipesSource, /recipe\.pause/);
  assert.match(recipesSource, /SAVED DAILY WORKSPACES/);
  assert.match(recipesSource, /dependency graph/);
  assert.match(recipesSource, /Advanced startup controls/);
  assert.match(recipesSource, /Explain recipes/);
  assert.match(recipeBuilderSource, /Parallel services/);
  assert.match(recipesSource, /parallel dependency graph editor/i);
  assert.match(recipesSource, /recipe\.cancel/);
  assert.match(recipesSource, /Recover failed run/);
  assert.match(recipesSource, /rollback-started/);
  assert.match(recipesSource, /git-clean/);

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
  assert.match(agentSource, /AGENT OPERATIONS/);
  assert.match(agentSource, /WHAT THEY ARE DOING/);
  assert.match(agentSource, /Add more agents/);
  assert.match(agentSource, /CURRENT STATE/);
  assert.match(agentSource, /MISSION LIFECYCLE/);
  assert.match(agentSource, /DURABLE EVIDENCE/);
  assert.match(agentSource, /ASSIGNED MISSION/);
  assert.match(agentSource, /Official command/);
  assert.match(agentSource, /Open terminal/);
  assert.match(agentSource, /mission\.list/);
  assert.doesNotMatch(agentSource, /terminal\.open/);
  assert.doesNotMatch(agentSource, /terminal\.write/);
  assert.doesNotMatch(agentSource, /agent-chat|agent-composer|agent-message/);
  assert.doesNotMatch(agentSource, /<textarea|Send an instruction|PERMISSION PREVIEW/);
  assert.doesNotMatch(agentSource, /api key|GEMINI_API_KEY/i);

  const styleSource = require("node:fs").readFileSync(
    path.resolve(__dirname, "../src/groundstation/renderer/styles.css"),
    "utf8"
  );
  assert.match(styleSource, /scrollbar-width: thin/);
  assert.match(styleSource, /::-webkit-scrollbar-thumb/);
  assert.match(styleSource, /@container groundstation/);
  const foundationSource = require("node:fs").readFileSync(
    path.resolve(__dirname, "../src/groundstation/renderer/uiFoundation.css"),
    "utf8"
  );
  assert.match(foundationSource, /--ui-body: 14px/);
  assert.match(foundationSource, /\.agent-operations/);
  assert.match(foundationSource, /\.reference-pulse__ring \.sweep/);
  assert.match(foundationSource, /animation: none !important/);
  assert.match(appSource, /worker-folder-delete/);
  assert.doesNotMatch(appSource, /<i\s+onClick=/);

  const terminalSource = require("node:fs").readFileSync(
    path.resolve(__dirname, "../src/groundstation/renderer/TerminalPane.jsx"),
    "utf8"
  );
  assert.doesNotMatch(terminalSource, /className="terminal-session-select"/);
  assert.match(terminalSource, /className="terminal-session-menu"/);
  assert.match(terminalSource, /terminal-pane__telemetry/);
  assert.match(terminalSource, /session\.cwd \|\| "\."/);
  assert.match(terminalSource, /terminal-action-menu/);
  assert.match(terminalSource, /@radix-ui\/react-dropdown-menu/);
  assert.match(terminalSource, /<DropdownMenu\.Portal>/);
  assert.doesNotMatch(terminalSource, /className="terminal-delete-button"/);
  assert.match(terminalSource, /requestAction\("remove"\)/);
});

test("Groundstation 2.19 uses the live supervision composition and consolidated UX layer", () => {
  const rendererRoot = path.join(__dirname, "..", "src", "groundstation", "renderer");
  const app = fs.readFileSync(path.join(rendererRoot, "App.jsx"), "utf8");
  const main = fs.readFileSync(path.join(rendererRoot, "main.jsx"), "utf8");
  const tokens = fs.readFileSync(path.join(rendererRoot, "tokens.css"), "utf8");
  const premium = fs.readFileSync(path.join(rendererRoot, "premiumDesign.css"), "utf8");
  const bridge = fs.readFileSync(path.join(rendererRoot, "redesign", "tokens-bridge.css"), "utf8");
  const base = fs.readFileSync(path.join(rendererRoot, "redesign", "base.css"), "utf8");
  const workspace = fs.readFileSync(path.join(rendererRoot, "redesign", "workspace.css"), "utf8");
  const screens = fs.readFileSync(path.join(rendererRoot, "redesign", "screens.css"), "utf8");

  assert.match(app, /view === "groundstation"\) return <LiveGroundstationView/);
  assert.match(app, /<StatusBar/);
  assert.match(app, /<HelpOverlay/);
  assert.match(main, /import "\.\/tokens\.css";[\s\S]*import "\.\/styles\.css";[\s\S]*import "\.\/redesign\/tokens-bridge\.css";[\s\S]*import "\.\/redesign\/base\.css";[\s\S]*import "\.\/redesign\/workspace\.css";[\s\S]*import "\.\/redesign\/screens\.css";/);
  assert.doesNotMatch(main, /import "\.\/(?:experience2[7-9]|experience30|redesign-v4|reference-v5|reference-final|prototype2026|theme-concept)\.css"/);
  assert.match(tokens, /--orbital-canvas/);
  assert.match(tokens, /--green-100/);
  assert.match(tokens, /\.theme-solar/);
  assert.match(premium, /--surface-canvas:\s*var\(--theme-canvas\)/);
  assert.match(premium, /--status-needs-you:\s*var\(--accent-attention\)/);
  assert.match(bridge, /--font-family-ui/);
  assert.match(bridge, /--mc-text-dim:\s*#747b88/);
  assert.match(base, /2\.19 shell contract/);
  assert.match(base, /grid-template-columns: 212px minmax\(0, 1fr\)/);
  assert.match(base, /\.mission-status-bar/);
  assert.match(base, /prefers-reduced-motion: reduce/);
  assert.match(workspace, /container: workspace-stage \/ inline-size/);
  assert.match(workspace, /@container workspace-stage/);
  assert.match(screens, /2\.19 Groundstation contract/);
  assert.match(screens, /position: fixed;[\s\S]*width: min\(360px/);
});

test("Groundstation premium shell uses one responsive sidebar with intentional primary tabs", () => {
  const rendererRoot = path.join(__dirname, "..", "src", "groundstation", "renderer");
  const app = fs.readFileSync(path.join(rendererRoot, "App.jsx"), "utf8");
  const main = fs.readFileSync(path.join(rendererRoot, "main.jsx"), "utf8");
  const base = fs.readFileSync(path.join(rendererRoot, "redesign", "base.css"), "utf8");
  const workspaceCss = fs.readFileSync(path.join(rendererRoot, "redesign", "workspace.css"), "utf8");
  const recipes = fs.readFileSync(path.join(rendererRoot, "RecipesView.jsx"), "utf8");
  const integrations = fs.readFileSync(path.join(rendererRoot, "IntegrationsView.jsx"), "utf8");

  assert.match(app, /function AppSidebar/);
  assert.match(app, /<aside className="app-sidebar"/);
  assert.doesNotMatch(app, /<aside className="power-rail"/);
  assert.doesNotMatch(app, /<aside className="rail"/);
  assert.match(app, /\["recipes", "Recipes", "grid"\]/);
  assert.match(app, /\["settings", "Settings", "settings"\]/);
  const primaryNavigation = app.slice(app.indexOf("const NAVIGATION"), app.indexOf("const SECONDARY_DESTINATIONS"));
  // Integrations is a primary destination as of the Settings/Integrations
  // split: Settings keeps only application preferences, and every connected
  // bridge (Mission AI, VS Code, MCP, Automation, Mobile, Plugins) lives in
  // the Integrations hub, which needs a reachable sidebar entry of its own.
  assert.match(primaryNavigation, /\["integrations", "Integrations", "expand"\]/);
  // The sidebar still has to stay a short, intentional list rather than a
  // dumping ground for every surface.
  assert.ok(
    primaryNavigation.match(/\["[a-z-]+", "/g).length <= 8,
    "primary sidebar navigation must stay a short, intentional list"
  );
  assert.match(app, /<RecipesView/);
  assert.match(app, /<IntegrationHubView/);
  assert.match(app, /top-navigation/);
  assert.match(app, /const totalWaiting = available\.length/);
  assert.match(main, /import "\.\/premiumDesign\.css";[\s\S]*import "\.\/redesign\/base\.css";/);
  assert.match(base, /grid-template-columns: 212px minmax\(0, 1fr\)/);
  assert.match(base, /\.app-sidebar[\s\S]*overflow: hidden auto/);
  assert.match(base, /\.top-navigation button > span[\s\S]*display: block !important/);
  assert.match(app, /> Run recipe<\/button>/);
  assert.match(workspaceCss, /\.terminal-grid\.layout-grid-3x2/);
  assert.match(recipes, /request\("recipe\.list"\)/);
  assert.match(recipes, /Launch workspace/);
  assert.match(integrations, /request\(integration\.request\)/);
  for (const label of ["Mission AI", "VS Code Bridge", "Secure MCP", "Mobile Companion", "Plugins"]) assert.match(integrations, new RegExp(label));
});

test("Mission Graph stays contextual and renders only configured recipe relationships", () => {
  const rendererRoot = path.join(__dirname, "..", "src", "groundstation", "renderer");
  const app = fs.readFileSync(path.join(rendererRoot, "App.jsx"), "utf8");
  const main = fs.readFileSync(path.join(rendererRoot, "main.jsx"), "utf8");
  const graph = fs.readFileSync(path.join(rendererRoot, "MissionGraph.jsx"), "utf8");
  const graphStyle = fs.readFileSync(path.join(rendererRoot, "missionGraph.css"), "utf8");

  assert.match(app, /import MissionGraph from "\.\/MissionGraph\.jsx"/);
  assert.match(app, /missionGraphOpen/);
  assert.match(app, /onMissionGraph/);
  assert.match(app, /Open Mission Graph/);
  assert.doesNotMatch(app, /\["mission-graph",\s*"Mission Graph"/);
  assert.match(main, /import "\.\/styles\.css";[\s\S]*import "\.\/uiFoundation\.css";[\s\S]*import "\.\/groundstation21\.css";[\s\S]*import "\.\/missionGraph\.css";/);
  assert.match(graph, /request\("recipe\.list"\)/);
  assert.match(graph, /buildMissionGraph/);
  assert.match(graph, /Configured relationships only/);
  assert.match(graph, /engineEventFrom/);
  assert.match(graph, /startsWith\("recipe:"\)/);
  assert.doesNotMatch(graph, /setInterval|setTimeout/);
  assert.match(graphStyle, /\.mission-graph-dialog/);
  assert.match(graphStyle, /@media \(max-width: 980px\)/);
  assert.match(graphStyle, /prefers-reduced-motion: reduce/);
});

test("Worker Intelligence renders engine-owned resources, health, and configured dependency impact", () => {
  const rendererRoot = path.join(__dirname, "..", "src", "groundstation", "renderer");
  const app = fs.readFileSync(path.join(rendererRoot, "App.jsx"), "utf8");
  const graph = fs.readFileSync(path.join(rendererRoot, "MissionGraph.jsx"), "utf8");
  const main = fs.readFileSync(path.join(rendererRoot, "main.jsx"), "utf8");
  const intelligenceStyle = fs.readFileSync(path.join(rendererRoot, "workerIntelligence.css"), "utf8");

  assert.match(app, /function WorkerResourceIntelligence/);
  assert.match(app, /ENGINE HEALTH ANALYSIS/);
  assert.match(app, /DEPENDENCY IMPACT/);
  assert.match(app, /session\.resources/);
  assert.match(app, /session\.health/);
  assert.match(app, /session\.dependencyImpact/);
  assert.match(app, /high usage is observation, not a fabricated failure/);
  assert.match(graph, /dependencyImpact/);
  assert.match(graph, /CPU \/ memory/);
  assert.match(main, /import "\.\/missionGraph\.css";[\s\S]*import "\.\/workerIntelligence\.css";/);
  assert.match(intelligenceStyle, /\.worker-resource-intelligence/);
  assert.match(intelligenceStyle, /\.worker-health\.tone-pressure/);
  assert.match(intelligenceStyle, /@media \(max-width: 760px\)/);
  assert.match(intelligenceStyle, /prefers-reduced-motion: reduce/);
});

test("Project Memory 2 renders resumable engine chapters without inventing causality", () => {
  const root = path.join(__dirname, "..");
  const rendererRoot = path.join(root, "src", "groundstation", "renderer");
  const app = fs.readFileSync(path.join(rendererRoot, "App.jsx"), "utf8");
  const main = fs.readFileSync(path.join(rendererRoot, "main.jsx"), "utf8");
  const memoryStyle = fs.readFileSync(path.join(rendererRoot, "projectMemory.css"), "utf8");
  const engine = fs.readFileSync(path.join(root, "src", "engine", "index.cjs"), "utf8");
  const model = fs.readFileSync(path.join(root, "src", "engine", "projectMemory.cjs"), "utf8");

  assert.match(engine, /buildProjectMemory\(this\.#activityEvents, this\.list\(\)/);
  assert.match(model, /same worker plus later verified evidence/);
  assert.match(model, /MAX_MEMORY_CHAPTERS/);
  assert.match(model, /MAX_CHAPTER_EVENTS/);
  assert.match(app, /RESUME WORK/);
  assert.match(app, /memory\.resumePoints/);
  assert.match(app, /memory\?\.causalLinks/);
  assert.match(app, /RUN CHAPTERS · RESUMABLE MEMORY/);
  assert.match(app, /success requires verification/);
  assert.match(app, /<HistoryView events=\{activity\} onFocus=\{inspectWorker\}/);
  assert.doesNotMatch(app, /const chapters = \[\.\.\.ordered\.reduce/);
  assert.match(main, /import "\.\/workerIntelligence\.css";[\s\S]*import "\.\/projectMemory\.css";/);
  assert.match(memoryStyle, /\.memory-resume/);
  assert.match(memoryStyle, /@media \(max-width: 760px\)/);
  assert.match(memoryStyle, /prefers-reduced-motion: reduce/);
});

test("VS Code Bridge stays contextual in Settings and uses Protocol-owned synchronization", () => {
  const root = path.join(__dirname, "..");
  const rendererRoot = path.join(root, "src", "groundstation", "renderer");
  const app = fs.readFileSync(path.join(rendererRoot, "App.jsx"), "utf8");
  const main = fs.readFileSync(path.join(rendererRoot, "main.jsx"), "utf8");
  const style = fs.readFileSync(path.join(rendererRoot, "vscodeBridge.css"), "utf8");
  const protocol = fs.readFileSync(path.join(root, "src", "protocol", "index.cjs"), "utf8");
  const electronMain = fs.readFileSync(path.join(root, "src", "groundstation", "main", "index.cjs"), "utf8");

  assert.match(app, /function VSCodeBridgeSettings/);
  assert.match(app, /<VSCodeBridgeSettings workspace=\{workspace\}/);
  assert.match(app, /request\("vscode\.status"\)/);
  assert.match(app, /"vscode\.launch"/);
  assert.match(app, /"vscode\.openFile"/);
  assert.match(app, /notification\?\.type === "integration:event"/);
  assert.match(app, /VS Code-owned terminals are observe-only/);
  assert.match(app, /raw output never crosses the bridge/);
  assert.match(app, /"vscode\.terminal\.create"/);
  assert.match(app, /"vscode\.terminal\.write"/);
  const primaryNavigation = app.slice(app.indexOf("const NAVIGATION"), app.indexOf("const ICON_PATHS"));
  assert.doesNotMatch(primaryNavigation, /\["vscode",\s*"VS Code"/);
  assert.match(protocol, /"vscode\.launch"/);
  assert.match(protocol, /"vscode\.terminal\.close"/);
  assert.match(protocol, /integration:event/);
  assert.match(electronMain, /new VSCodeBridge/);
  assert.match(main, /import "\.\/projectMemory\.css";[\s\S]*import "\.\/vscodeBridge\.css";/);
  assert.match(style, /\.vscode-bridge-settings/);
  assert.doesNotMatch(style, /backdrop-filter/);
  assert.match(style, /@media \(max-width: 620px\)/);
  assert.match(style, /prefers-reduced-motion: reduce/);
});

test("Secure MCP stays contextual in Settings and routes mutation requests through Needs You", () => {
  const app = fs.readFileSync(path.resolve(__dirname, "../src/groundstation/renderer/App.jsx"), "utf8");
  const component = fs.readFileSync(path.resolve(__dirname, "../src/groundstation/renderer/McpGateway.jsx"), "utf8");
  const css = fs.readFileSync(path.resolve(__dirname, "../src/groundstation/renderer/mcpGateway.css"), "utf8");
  assert.match(app, /<McpGatewaySettings workspace=\{workspace\}/);
  assert.match(app, /<McpApprovalQueue visible=/);
  assert.match(component, /mcp\.configure/);
  assert.match(component, /mcp\.rotateToken/);
  assert.match(component, /mcp\.approval\.resolve/);
  assert.match(component, /confirm:mcp\.approval:/);
  assert.match(component, /No action has executed/);
  assert.match(component, /Terminal evidence/);
  assert.match(component, /Off by default/i);
  assert.match(css, /\.mcp-gateway-settings/);
  assert.match(css, /\.mcp-approval-queue/);
  const primaryNavigation = app.slice(app.indexOf("const NAVIGATION"), app.indexOf("const ICON_PATHS"));
  assert.doesNotMatch(primaryNavigation, /\["mcp",\s*"MCP"/i, "MCP must not become primary navigation");
});

test("deeper AI supervision remains contextual, evidence-backed, and chat-free", () => {
  const app = fs.readFileSync(path.resolve(__dirname, "../src/groundstation/renderer/App.jsx"), "utf8");
  const component = fs.readFileSync(path.resolve(__dirname, "../src/groundstation/renderer/AgentWorkspace.jsx"), "utf8");
  const css = fs.readFileSync(path.resolve(__dirname, "../src/groundstation/renderer/agentSupervision.css"), "utf8");
  const engine = fs.readFileSync(path.resolve(__dirname, "../src/engine/missionSupervision.cjs"), "utf8");
  assert.match(component, /MISSION CONTRACT/);
  assert.match(component, /EVIDENCE-BACKED PROGRESS/);
  assert.match(component, /CURRENT ACTION/);
  assert.match(component, /CURRENT FILES/);
  assert.match(component, /MISSION AUTHORITY/);
  assert.match(component, /MissionApprovalQueue/);
  assert.match(component, /mission\.checkpoint\.verify/);
  assert.match(component, /mission\.approval\.resolve/);
  assert.match(app, /<MissionApprovalQueue visible=/);
  assert.match(engine, /observable-checkpoints/);
  assert.doesNotMatch(component, /<textarea|agent-chat|Send an instruction/);
  assert.doesNotMatch(app, /\["supervision",\s*"Supervision"/i, "AI supervision must not become primary navigation");
  assert.doesNotMatch(css, /backdrop-filter/);
});

test("Mobile Companion stays contextual, encrypted, revocable, and approval-gated", () => {
  const rendererRoot = path.join(__dirname, "..", "src", "groundstation", "renderer");
  const app = fs.readFileSync(path.join(rendererRoot, "App.jsx"), "utf8");
  const mobile = fs.readFileSync(path.join(rendererRoot, "MobileCompanion.jsx"), "utf8");
  assert.match(app, /<MobileCompanionSettings workspace=\{workspace\}/);
  assert.match(app, /<MobileApprovalQueue/);
  assert.doesNotMatch(app, /\["mobile",\s*"Mobile/);
  assert.match(mobile, /not a remote shell or mobile IDE/i);
  assert.match(mobile, /mobile\.invite/);
  assert.match(mobile, /mobile\.device\.revoke/);
  assert.match(mobile, /mobile\.approval\.resolve/);
  assert.match(mobile, /No action has executed/);
  assert.doesNotMatch(mobile, /terminal\.write|terminal\.open|action\.dispatch/);
});

test("Plugin Platform stays contextual, declarative, permissioned, and approval-gated", () => {
  const rendererRoot = path.join(__dirname, "..", "src", "groundstation", "renderer");
  const app = fs.readFileSync(path.join(rendererRoot, "App.jsx"), "utf8");
  const plugins = fs.readFileSync(path.join(rendererRoot, "PluginPlatform.jsx"), "utf8");
  assert.match(app, /<PluginPlatformSettings/);
  assert.match(app, /<PluginApprovalQueue/);
  assert.doesNotMatch(app, /\["plugins",\s*"Plugins/);
  assert.match(plugins, /No code execution/);
  assert.match(plugins, /Files · process · network · secrets/);
  assert.match(plugins, /plugin\.approval\.resolve/);
  assert.doesNotMatch(plugins, /terminal\.write|action\.dispatch/);
});

test("Groundstation build is isolated from parent PostCSS configurations", async () => {
  const configUrl = pathToFileURL(
    path.resolve(__dirname, "../vite.groundstation.config.mjs")
  ).href;
  const { default: config } = await import(`${configUrl}?postcss=${Date.now()}`);

  assert.deepEqual(config.css?.postcss, { plugins: [] });
  const forwarded = [];
  config.build.rollupOptions.onwarn({ code: "MODULE_LEVEL_DIRECTIVE", id: "D:/repo/node_modules/radix/index.mjs", message: '"use client" was ignored' }, warning => forwarded.push(warning));
  config.build.rollupOptions.onwarn({ code: "OTHER_WARNING", id: "renderer.jsx", message: "important" }, warning => forwarded.push(warning));
  assert.deepEqual(forwarded.map(warning => warning.code), ["OTHER_WARNING"]);
  const chunks = config.build?.rollupOptions?.output?.manualChunks;
  assert.equal(typeof chunks, "function");
  assert.equal(chunks("D:/repo/node_modules/react/index.js"), "vendor-react");
  assert.equal(chunks("D:/repo/src/groundstation/renderer/TerminalPane.jsx"), "workspace-terminal");
  assert.equal(chunks("D:/repo/src/groundstation/renderer/PluginPlatform.jsx"), "feature-integrations");
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
  // The handle is pointer-driven and now carries a handle descriptor so a
  // layout can expose more than one split (column + row).
  assert.match(appSource, /onPointerDown=\{event => beginPaneResize\(event, handle\)\}/);
  assert.match(appSource, /terminalLayout\.handles\.map\(handle =>/);
  assert.match(appSource, /onDoubleClick=\{\(\) => terminalLayout\.setRatio\(handle\.ratio, defaultRatio\)\}/);
  assert.doesNotMatch(appSource, /aria-label="Resize terminal panes" type="range"/);
  assert.match(appSource, /function WorkerFolders/);
  assert.match(appSource, /AI agents/);
  assert.match(appSource, /New folder/);
  assert.match(appSource, /mission-control\.worker-folders\.v1/);
});
