import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Command as CmdkCommand } from "cmdk";
import TerminalPane from "./TerminalPane.jsx";
import WorkerDialog from "./WorkerDialog.jsx";
import ProjectsView from "./ProjectsView.jsx";
import { missionApi } from "./missionApi.js";
import useMissionState from "./useMissionState.js";
import useTerminalLayout, { DEFAULT_RATIOS_BY_LAYOUT, TERMINAL_LAYOUTS } from "./useTerminalLayout.js";
import useInterfacePreferences from "./useInterfacePreferences.js";
import AgentWorkspace, { MissionApprovalQueue } from "./AgentWorkspace.jsx";
import WorkspaceRecipes from "./WorkspaceRecipes.jsx";
import RecipesView from "./RecipesView.jsx";
import IntegrationHubView from "./IntegrationsView.jsx";
import MissionGraph from "./MissionGraph.jsx";
import { MissionAISettings } from "./MissionAI.jsx";
import MissionAIScreen from "./MissionAIScreen.jsx";
import { MissionSupervisorApprovalQueue } from "./MissionAI.jsx";
import { McpApprovalQueue, McpGatewaySettings } from "./McpGateway.jsx";
import { AutomationApprovalQueue, AutomationSettings } from "./AutomationWorkflows.jsx";
import { MobileApprovalQueue, MobileCompanionSettings } from "./MobileCompanion.jsx";
import { PluginApprovalQueue, PluginPlatformSettings } from "./PluginPlatform.jsx";
import StatusBar from "./StatusBar.jsx";
import HelpOverlay from "./HelpOverlay.jsx";

function Command({ value: _selectedValue, onValueChange: _onSelectedValueChange, ...props }) {
  return <CmdkCommand {...props}/>;
}
Command.Input = CmdkCommand.Input;
Command.List = CmdkCommand.List;
Command.Empty = CmdkCommand.Empty;
Command.Item = CmdkCommand.Item;

// The operator's home destinations, in scan order: status, work, blockers,
// crew, launch, record, configuration. Recipes earns a slot back because
// launching a saved workspace is a daily verb, not a buried dialog.
//
// Integrations trails the primary seven as a contextual eighth. Every
// connected bridge (Mission AI, VS Code, MCP, Automation, Mobile, Plugins)
// lives there, so it must stay one click away rather than hide inside
// Settings, but it is a place you configure, not a place you operate from.
// AppSidebar renders it below a divider so the seven stay legible as a group.
const NAVIGATION = [
  ["groundstation", "Groundstation", "pulse"],
  ["workspace", "Workspace", "terminal"],
  ["needs", "Needs You", "attention"],
  ["agents", "Agents", "agents"],
  ["recipes", "Recipes", "grid"],
  ["history", "History", "history"],
  ["settings", "Settings", "settings"],
  ["integrations", "Integrations", "expand"]
];
const PRIMARY_NAV_COUNT = 7;

const SECONDARY_DESTINATIONS = [
  ["projects", "Switch project", "projects"]
];
const NAV_SHORTCUTS = { groundstation: "Alt G", workspace: "Alt W", recipes: "Alt R", needs: "Alt N", agents: "Alt A", integrations: "Alt I", history: "Alt H", settings: "Alt S" };
// Palette synonyms live beside the destinations they belong to so moving a
// route between the primary and secondary lists cannot silently drop them.
const NAV_ALIASES = {
  needs: ["attention","approvals","failures"],
  history: ["activity","events","memory","logs"],
  integrations: ["mission ai","mcp","vscode","mobile","plugins","bridges"],
  recipes: ["recipe","daily workspace","startup","launch","stack"],
  projects: ["workspace","switch"]
};
const HISTORY_CURSOR_KEY = "mission-control.history-cursor.v1";
const COMMAND_RECENTS_KEY = "mission-control.command-recents.v1";
const DECISION_STATE_KEY = "mission-control.decision-queue.v1";

const ICON_PATHS = {
  pulse: <><path d="M3 12h4l2.2-6 4.2 12 2.3-6H21"/></>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3M13 15h4"/></>,
  attention: <><path d="M12 3 2.7 19h18.6L12 3Z"/><path d="M12 9v4m0 3h.01"/></>,
  agents: <><path d="M8 9V7a4 4 0 0 1 8 0v2M5 11h14v9H5z"/><path d="M9 15h.01M15 15h.01M9 18h6"/></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
  projects: <><path d="M3 6h7l2 2h9v11H3z"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  expand: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  arrow: <><path d="m9 18 6-6-6-6"/></>,
  command: <><path d="M9 6V5a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v14a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6Z"/></>,
  docker: <><path d="M4 10h16v4a6 6 0 0 1-6 6H9a5 5 0 0 1-5-5z"/><path d="M7 7h3v3H7zm4 0h3v3h-3zm0-4h3v3h-3zm4 4h3v3h-3zM20 11c1-1 2-1 3-1"/></>,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v3m6-3v3M9 20v3m6-3v3M1 9h3m-3 6h3m16-6h3m-3 6h3M10 10h4v4h-4z"/></>,
  play: <><path d="m8 5 11 7-11 7z"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/></>,
  star: <><path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></>,
  stop: <><rect x="6" y="6" width="12" height="12" rx="2"/></>
};

function Icon({ name, size = 18 }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{ICON_PATHS[name]}</svg>;
}

function timeAgo(timestamp) {
  if (!Number.isFinite(timestamp)) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 45) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function runtime(session) {
  if (!session?.startTime || !session?.isAlive) return "Idle";
  const minutes = Math.max(0, Math.floor((Date.now() - session.startTime) / 60000));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function eventTitle(event) {
  if (event?.type === "session:evidence") return `${event.category || "Worker"} evidence recorded`;
  return String(event?.type || "Workspace event").replaceAll(":", " · ").replaceAll("-", " ");
}

function evidenceSummary(event) {
  const evidence = event?.evidence || {};
  if (event?.category === "tests") return `${evidence.passed ?? 0} passed · ${evidence.failed ?? 0} failed${evidence.failedTests?.length ? ` · ${evidence.failedTests.length} named failures` : ""}`;
  if (event?.category === "git") return evidence.branch ? `Branch ${evidence.branch} · ${evidence.changedPaths ?? 0} changed${evidence.commit ? ` · ${evidence.commit.slice(0,7)}` : ""}` : evidence.clean ? "Working tree clean" : `${evidence.changedPaths ?? 0} changed paths`;
  if (event?.category === "build") return `${evidence.status || "Build"}${evidence.phase ? ` · ${evidence.phase}` : ""}${evidence.artifacts?.length ? ` · ${evidence.artifacts.length} artifacts` : ""}`;
  if (event?.category === "service") return `${evidence.origin || (evidence.port ? `Port ${evidence.port}` : "Service")}${evidence.health ? ` · health ${evidence.health}` : ""}`;
  if (event?.category === "database") return `${evidence.connection || "unknown"} connection · migrations ${evidence.migrations || "unknown"}`;
  if (event?.category === "container") return `${evidence.name || "Container"} · ${evidence.state || "unknown"}${Number.isFinite(evidence.cpuPercent) ? ` · ${evidence.cpuPercent}% CPU` : ""}`;
  return "Structured worker evidence recorded";
}

function sessionEvents(session, activity, limit = 6) {
  if (!session) return [];
  return activity.filter(event => event.id === session.id || event.sessionId === session.id || event.name === session.name).slice(-limit).reverse();
}

function healthFor(sessions, workspace) {
  const failed = sessions.filter(item => item.status === "failed").length + (workspace?.loadErrorCount || 0);
  const needs = sessions.filter(item => item.attentionRequired).length;
  if (failed) return { label: "Degraded", detail: `${failed} failure${failed === 1 ? "" : "s"} detected`, tone: "danger" };
  if (needs) return { label: "Waiting on you", detail: `${needs} decision${needs === 1 ? "" : "s"} ready`, tone: "warning" };
  if (!sessions.length) return { label: "Ready", detail: "No workers configured", tone: "neutral" };
  return { label: "Healthy", detail: "No blockers detected", tone: "healthy" };
}

function needsAttention(session) {
  return Boolean(session?.attentionRequired) || session?.status === "failed";
}

function workerKind(session) {
  const source = `${session?.name || ""} ${session?.command || ""} ${(session?.args || []).join(" ")}`.toLowerCase();
  if (session?.id?.startsWith("agent-") || /claude|codex|gemini|opencode/.test(source)) return "AI agent";
  if (/test|vitest|jest|playwright|pytest/.test(source)) return "Test watcher";
  if (/docker|container/.test(source)) return "Container";
  if (/postgres|mysql|mongo|redis|database|\bdb\b/.test(source)) return "Database";
  if (/(?:^|\s)git(?:\s|$)|github|branch|source control/.test(source)) return "Git";
  if (/build|compile|webpack|vite build/.test(source)) return "Build";
  if (/server|serve|dev|api|backend|frontend/.test(source)) return "Service";
  return "Terminal";
}

function workerProfile(session) {
  const kind = workerKind(session);
  const source = `${session?.command || ""} ${(session?.args || []).join(" ")}`;
  const evidence = [...(session?.recentLines || []), session?.lastLine || ""].filter(Boolean).join(" \n");
  const structured = session?.evidence || {};
  const port = structured.service?.port || `${source} ${evidence}`.match(/(?:--port(?:=|\s+)|localhost:|127\.0\.0\.1:)(\d{2,5})/i)?.[1] || null;
  const url = structured.service?.origin || evidence.match(/https?:\/\/[^\s]+/i)?.[0]?.replace(/[),.;]+$/, "") || null;
  const tests = evidence.match(/(?:tests?\s*)?(\d+)\s+(?:passed|passing).*?(?:(\d+)\s+(?:failed|failing))?/i);
  const testPassed = structured.tests?.passed ?? (tests ? Number(tests[1]) : null);
  const testFailed = structured.tests?.failed ?? (tests?.[2] ? Number(tests[2]) : 0);
  const buildTime = Number.isFinite(structured.build?.durationMs) ? `${structured.build.durationMs}ms` : evidence.match(/(?:built|compiled|ready)\s+(?:in\s+)?([\d.]+\s*(?:ms|s|sec|seconds?))/i)?.[1] || null;
  const branch = structured.git?.branch || evidence.match(/(?:on branch|^##)\s+([^\s.]+)/im)?.[1] || source.match(/git\s+(?:checkout|switch)\s+([^\s]+)/i)?.[1] || null;
  const gitChanges = structured.git?.changedPaths ?? evidence.split("\n").filter(line => /^\s*(?:[MADRCU?]{1,2}|modified:|new file:|deleted:)\s+/i.test(line)).length;
  const gitClean = structured.git?.clean === true || /working tree clean|nothing to commit/i.test(evidence);
  const healthy = structured.service?.health === "confirmed" || structured.database?.connection === "confirmed" || structured.container?.healthy === true || /healthy|ready to accept connections|listening on|server running|compiled successfully|build succeeded/i.test(evidence);
  const profiles = {
    "AI agent": { key: "agent", label: "AI AGENT", metric: session?.isAlive ? "Connected" : "Offline", detail: session?.attentionRequired ? "Waiting for your review" : "Supervised local CLI" },
    "Test watcher": { key: "test", label: "TEST FEEDBACK", metric: testPassed !== null ? `${testPassed} passed${testFailed ? ` · ${testFailed} failed` : ""}` : session?.isAlive ? "Watching" : "Not running", detail: session?.attentionRequired ? "Failure evidence available" : structured.tests ? "Engine-owned structured evidence" : tests ? "Parsed from recent terminal output" : "Awaiting a test summary" },
    Container: { key: "container", label: "CONTAINER RUNTIME", metric: structured.container?.state || (healthy ? "healthy" : session?.isAlive ? "engine active" : "stopped"), detail: structured.container?.image ? `${structured.container.image}${Number.isFinite(structured.container.memoryMB) ? ` · ${structured.container.memoryMB} MB` : ""}` : "Awaiting Docker state evidence" },
    Database: { key: "database", label: "DATA SERVICE", metric: structured.database?.connection || (session?.isAlive ? "Process online" : "Disconnected"), detail: structured.database ? `Migrations ${structured.database.migrations || "unknown"}` : "Awaiting connectivity and migration evidence" },
    Git: { key: "git", label: "SOURCE CONTROL", metric: branch || (gitClean ? "Working tree clean" : gitChanges ? `${gitChanges} change${gitChanges === 1 ? "" : "s"}` : session?.isAlive ? "Git session active" : "Ready"), detail: structured.git?.commit ? `${structured.git.commit.slice(0,7)} · ${structured.git.author || "recorded attribution"}` : branch ? `${gitChanges ? `${gitChanges} changed paths · ` : ""}Engine-backed status evidence` : "Run git status to report branch and changes" },
    Build: { key: "build", label: "BUILD PIPELINE", metric: structured.build?.phase || (buildTime ? `Completed in ${buildTime}` : session?.isAlive ? "Building" : session?.status === "failed" ? "Build failed" : "Ready"), detail: structured.build?.artifacts?.length ? `${structured.build.artifacts.length} artifact records` : session?.attentionRequired ? "Review build output" : "Awaiting artifact evidence" },
    Service: { key: "service", label: "APP SERVICE", metric: structured.service?.health === "confirmed" ? "Health confirmed" : structured.service?.health === "failed" ? "Health failed" : url || (port ? `Port ${port}` : session?.isAlive ? "Process online" : "Offline"), detail: structured.service?.checkedAt ? `Checked ${timeAgo(structured.service.checkedAt)} ago` : port || url ? "Endpoint seen; health not yet confirmed" : "Awaiting endpoint and health-check evidence" },
    Terminal: { key: "terminal", label: "SHELL SESSION", metric: session?.isAlive ? "Interactive" : "Idle", detail: "Direct project terminal" }
  };
  return { kind, ...(profiles[kind] || profiles.Terminal), port, url, branch, gitChanges, evidence: Boolean(evidence) };
}

function agentPhase(agent) {
  if (agent.attentionRequired) return "Waiting for you";
  if (agent.status === "failed") return "Failed";
  if (agent.status === "starting") return "Starting";
  if (agent.isAlive) return "Working — progress not reported";
  return "Ready for a mission";
}

function WorkerCard({ session, activity, selected, onSelect, onFocus, onAction }) {
  const summary = sessionSummary(session, activity);
  const [actioning, setActioning] = React.useState("");
  const kind = workerKind(session);
  const state = session.status === "failed" ? "failed" : session.attentionRequired ? "risk" : session.isAlive ? "live" : "idle";
  const stateLabel = state === "risk" ? "Review" : state === "live" ? "Live" : state[0].toUpperCase() + state.slice(1);
  const runAction = async type => {
    if (actioning) return;
    setActioning(type);
    try { await onAction(type, session.id); }
    finally { setActioning(""); }
  };
  return (
    <article className={`worker-card reference-worker-card state-${state} ${selected ? "is-selected" : ""} ${actioning ? "is-actioning" : ""}`} tabIndex="0" onClick={onSelect} onDoubleClick={onFocus} onKeyDown={event => event.key === "Enter" && onFocus()}>
      <div className="reference-worker-card__top"><div><span className="reference-worker-kind"><Icon name={kind === "AI agent" ? "agents" : kind === "Test watcher" ? "attention" : "terminal"} size={12}/>{kind}</span><strong>{session.name}</strong></div><span className={`reference-status-pill ${state}`}><i/>{stateLabel}</span></div>
      <code className="reference-worker-command">{session.command} {(session.args || []).join(" ")}</code>
      <div className={`reference-log-preview ${state}`}><Icon name="arrow" size={10}/><span>{summary}</span></div>
      <div className="reference-worker-foot"><span>{session.isAlive ? runtime(session) : `${timeAgo(session.lastOutputAt)} ago`}</span><span>{session.autoStart ? "Auto restore" : "Manual"}</span></div>
      <div className="worker-card__actions reference-worker-actions">
        {session.attentionRequired && <button className={actioning === "acknowledge" ? "is-running" : ""} disabled={Boolean(actioning)} onClick={event => { event.stopPropagation(); runAction("acknowledge"); }}>Acknowledge</button>}
        <button className={actioning === "restart" || actioning === "start" ? "is-running" : ""} disabled={Boolean(actioning)} onClick={event => { event.stopPropagation(); runAction(session.isAlive ? "restart" : "start"); }}>{actioning === "restart" ? "Restarting…" : actioning === "start" ? "Starting…" : session.isAlive ? "Restart" : "Start"}</button>
        <button className="focus-action" onClick={event => { event.stopPropagation(); onFocus(); }}>Focus <Icon name="arrow" size={13}/></button>
      </div>
    </article>
  );
}

function ProjectPulse({ sessions, workspace, activity, onNavigate, onMissionGraph, onRecipes }) {
  const health = healthFor(sessions, workspace);
  const running = sessions.filter(item => item.isAlive).length;
  const agents = sessions.filter(item => item.id.startsWith("agent-")).length;
  const latest = activity.at(-1);
  return (
    <section className={`reference-pulse pulse-${health.tone}`}>
      <div className="reference-pulse__ring"><svg viewBox="0 0 148 148"><circle className="track" cx="74" cy="74" r="67"/><circle className="sweep" cx="74" cy="74" r="67"/></svg><div><strong>{running}/{sessions.length}</strong><span>WORKERS LIVE</span></div></div>
      <div className="reference-pulse__body"><span className="pulse-kicker"><i/> PROJECT PULSE</span><h2>{health.detail}.</h2><p>{running ? `${running} worker${running === 1 ? " is" : "s are"} running` : "Your workspace is quiet"}{agents ? ` with ${agents} AI engineer${agents === 1 ? "" : "s"} available.` : "."} {latest ? `Latest: ${eventTitle(latest)}, ${timeAgo(latest.timestamp)} ago.` : "The workspace is connected."}</p><div><button className="reference-btn primary" onClick={() => onNavigate(health.tone === "healthy" ? "workspace" : "needs")}>{health.tone === "healthy" ? "Open workspace" : "Review attention"}<Icon name="arrow" size={13}/></button><button className="reference-btn" onClick={onRecipes}><Icon name="play" size={13}/> Daily workspace</button><button className="reference-btn" onClick={onMissionGraph}><Icon name="grid" size={13}/> Mission graph</button></div></div>
    </section>
  );
}

function SupervisionBriefing({ workspace, activity }) {
  const [snapshot, setSnapshot] = React.useState(null);
  const [error, setError] = React.useState("");
  const latestSequence = activity.at(-1)?.sequence || 0;
  React.useEffect(() => {
    let active = true;
    setError("");
    missionApi().request("supervision.get", { afterSequence: 0 }).then(value => { if (active) setSnapshot(value); }).catch(value => { if (active) setError(value.message || String(value)); });
    return () => { active = false; };
  }, [workspace?.path, workspace?.name, latestSequence]);
  if (error) return <section className="supervision-briefing is-error" role="status"><header><span>PROJECT SUPERVISION</span><strong>Evidence briefing unavailable</strong></header><p>{error}</p></section>;
  if (!snapshot) return <section className="supervision-briefing is-loading" aria-busy="true"><header><span>PROJECT SUPERVISION</span><strong>Assembling bounded evidence…</strong></header><i/></section>;
  const sections = [
    ["running", "WHAT IS RUNNING", snapshot.overview?.whatIsRunning],
    ["changed", "WHAT CHANGED", snapshot.overview?.whatChanged],
    ["attention", "WHAT NEEDS YOU", snapshot.overview?.whatNeedsYou]
  ];
  const itemText = (kind, item) => kind === "running" ? `${item.name || item.workerId} · ${item.activity || item.state}` : kind === "changed" ? `${item.actor || "Workspace"} · ${String(item.type || "changed").replaceAll(":", " · ")}` : item.title || item.reason || `${item.workerId || "Workspace"} requires review`;
  return <section className="supervision-briefing" aria-label="Unified project supervision"><header><div><span><i/> EVIDENCE BRIEFING</span><strong>One operational truth for Groundstation, Mission AI and MCP</strong></div><small>FACTS AND INFERENCES SEPARATED · {snapshot.evidenceIndex?.length || 0} EVIDENCE REFERENCES</small></header><div>{sections.map(([kind, label, section]) => <article className={`supervision-column is-${kind}`} key={kind}><span>{label}</span><strong>{section?.summary || "No bounded information is available."}</strong><ul>{(section?.items || []).slice(0,3).map((item, index) => <li key={item.evidenceId || `${kind}-${index}`}><i/><span>{itemText(kind, item)}</span><code>{item.evidenceId || "unreferenced"}</code></li>)}</ul>{!(section?.items || []).length && <p>No evidence item in the current snapshot.</p>}</article>)}</div><footer><span><b>FACT</b> EngineAPI, Project Memory, Recipes and VS Code metadata</span><span><b>INFERENCE</b> {snapshot.inferences?.[0]?.label || "No operational inference"}</span><small>Generated {timeAgo(snapshot.generatedAt)} ago · raw terminal output {snapshot.visibility?.terminalEvidence || "omitted"}</small></footer></section>;
}

function sessionSummary(session, activity) {
  if (!session) return "Select a worker to see its live operational summary.";
  const related = [...activity].reverse().find(event => event.id === session.id || event.sessionId === session.id || event.name === session.name);
  if (session.attentionRequired) return session.attentionReason || "This worker is waiting for your decision.";
  if (session.status === "failed") return `The worker failed${session.exitCode !== undefined ? ` with exit code ${session.exitCode}` : ""}. Open its terminal to inspect the last output.`;
  if (session.isAlive) return related ? `${eventTitle(related)} · the process is running and output is flowing.` : "The process is running normally and Mission Control is supervising it.";
  return `${session.name} is ready. Starting it will run ${session.command} inside its engine-owned PTY.`;
}

function nowSummary(sessions, activity) {
  const lines = [];
  const urgent = sessions.filter(session => session.status === "failed" || session.attentionRequired);
  for (const session of urgent.slice(0, 2)) {
    lines.push({ id: `urgent-${session.id}`, tone: session.status === "failed" ? "danger" : "attention", actor: session.name, text: session.attentionReason || (session.status === "failed" ? "Stopped unexpectedly and needs review." : "Waiting for your input.") });
  }
  const recentOutput = sessions.filter(session => session.isAlive && Number.isFinite(session.lastOutputAt)).sort((a, b) => b.lastOutputAt - a.lastOutputAt);
  for (const session of recentOutput) {
    if (lines.length >= 3 || lines.some(line => line.actor === session.name)) continue;
    const kind = workerKind(session);
    const text = kind === "AI agent" ? `Reported terminal output ${timeAgo(session.lastOutputAt)} ago.` : kind === "Container" ? `Docker worker produced output ${timeAgo(session.lastOutputAt)} ago.` : `Running and produced output ${timeAgo(session.lastOutputAt)} ago.`;
    lines.push({ id: `output-${session.id}`, tone: kind === "AI agent" ? "ai" : "live", actor: session.name, text });
  }
  const latest = activity.at(-1);
  if (lines.length < 3 && latest) lines.push({ id: `event-${latest.sequence}`, tone: "neutral", actor: latest.name || latest.id || latest.sessionId || "Workspace", text: `${eventTitle(latest)} ${timeAgo(latest.timestamp)} ago.` });
  if (!lines.length) lines.push({ id: "quiet", tone: "neutral", actor: "Workspace", text: sessions.some(session => session.isAlive) ? "Workers are running; no recent output or errors were reported." : "All workers are idle. Start a worker when you are ready." });
  return lines.slice(0, 3);
}

function decisionFor(session) {
  if (session.rendererAttention) return {
    kind: "Terminal connection",
    title: session.attentionReason || `${session.name} terminal is unavailable`,
    impact: "The worker may still be running, but its live terminal cannot currently be read or controlled from this pane.",
    recommended: "Open terminal",
    tone: "attention"
  };
  const isAgent = session.id.startsWith("agent-");
  const failed = session.status === "failed";
  return {
    kind: isAgent ? "AI agent" : failed ? "Worker failure" : "Worker attention",
    title: session.attentionReason || (failed ? `${session.name} stopped unexpectedly` : `${session.name} needs review`),
    impact: failed ? "This worker is unavailable until it starts successfully." : isAgent ? "The agent may be blocked until you review its operational history." : "Work may be waiting for operator input.",
    recommended: failed ? "Restart and verify" : isAgent ? "Review agent" : "Inspect evidence",
    tone: failed ? "critical" : "attention"
  };
}

function AttentionShelf({ sessions, onFocus, onAction, onNavigate }) {
  const attention = sessions.filter(needsAttention);
  if (!attention.length) return null;
  return <section className="attention-shelf"><header><div><span className="section-kicker">NEEDS YOU</span><strong>{attention.length} decision{attention.length === 1 ? "" : "s"} waiting</strong></div><button onClick={() => onNavigate("needs")}>View all <Icon name="arrow" size={13}/></button></header><div>{attention.slice(0,2).map(session => { const decision = decisionFor(session); return <article className={`attention-preview is-${decision.tone}`} key={session.id}><span className="attention-preview-dot"/><div><small>{decision.kind} · {session.name}</small><strong>{decision.title}</strong><p>{decision.impact}</p></div><div className="attention-preview-actions"><button onClick={() => onFocus(session.id)}>{decision.recommended}</button>{session.status === "failed" && <button className="primary" onClick={() => onAction("restart", session.id)}>Restart</button>}</div></article>; })}</div>{attention.length > 2 && <footer>+{attention.length - 2} more decisions are grouped in Needs You</footer>}</section>;
}

function GroundstationRecipeLauncher({ sessions, onLaunch, onManage }) {
  const [recipes, setRecipes] = React.useState([]);
  const [error, setError] = React.useState("");
  const refresh = React.useCallback(() => missionApi().request("recipe.list").then(value => { setRecipes(Array.isArray(value) ? value : []); setError(""); }).catch(value => setError(value.message || String(value))), []);
  React.useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    void refresh();
    try { unsubscribe = missionApi().subscribe(notification => { if (active && String(notification?.type || "").startsWith("recipe:")) void refresh(); }); } catch { /* Explicit refresh remains available. */ }
    return () => { active = false; unsubscribe?.(); };
  }, [refresh]);
  const sessionIds = new Set(sessions.map(session => session.id));
  return <section className="groundstation-recipes"><header><div><span className="section-kicker">DAILY WORKSPACES</span><strong>Start a saved working set</strong></div><button onClick={onManage}>{recipes.length ? "Manage recipes" : "Create recipe"}</button></header>{error ? <p role="status">Recipes could not be loaded: {error}</p> : recipes.length ? <div className="recipe-launch-grid">{recipes.slice(0,4).map(recipe => { const active = ["running","paused","cancelling"].includes(recipe.run?.phase); const available = (recipe.workerIds || []).filter(id => sessionIds.has(id)).length; return <article key={recipe.id} className={`recipe-launch-card ${active ? "is-running" : ""} phase-${recipe.run?.phase || "idle"}`} onClick={() => !active && available && onLaunch(recipe, { recover: recipe.run?.phase === "failed" })}><div><h3 className="recipe-launch-card__name">{recipe.name}</h3><small>{available}/{recipe.workerIds?.length || 0} workers available · {(recipe.steps || []).filter(step => !step.dependsOn?.length).length} start first</small></div><div className="recipe-chain">{(recipe.steps || []).slice(0, 3).map((step, idx) => <React.Fragment key={step.workerId}><span className="recipe-chain__node">{sessions.find(s => s.id === step.workerId)?.name || step.workerId}</span>{idx < Math.min((recipe.steps || []).length, 3) - 1 && <Icon name="arrow" className="recipe-chain__arrow" size={10} />}</React.Fragment>)}{(recipe.steps || []).length > 3 && <span className="recipe-chain__node">+{recipe.steps.length - 3}</span>}</div><button className="recipe-launch-btn" disabled={!available || active} onClick={e => { e.stopPropagation(); onLaunch(recipe, { recover: recipe.run?.phase === "failed" }); }}>{active ? recipe.run.phase : recipe.run?.phase === "failed" ? "Recover" : "Launch Recipe"}</button></article>; })}</div> : <div className="groundstation-recipes-empty"><span>Save backend, frontend, tests, Git, or database workers as one reusable launch.</span><button onClick={onManage}>Build your first recipe</button></div>}</section>;
}

function SinceLastCheck({ events, onReview, onDismiss }) {
  if (!events.length) return null;
  const risks = events.filter(event => /failed|error|attention/i.test(String(event.type))).length;
  const actors = [...new Set(events.map(event => event.name || event.id || event.sessionId).filter(Boolean))].slice(0,3);
  const latest = events.at(-1);
  return <section className={`since-briefing ${risks ? "has-risk" : ""}`}><div className="since-mark"><Icon name="history" size={17}/></div><div><span className="section-kicker">SINCE YOU LAST CHECKED</span><strong>{events.length} meaningful event{events.length === 1 ? "" : "s"}{risks ? ` · ${risks} need review` : " · no recorded risks"}</strong><p>{actors.length ? `Activity involved ${actors.join(", ")}. ` : ""}Latest: {eventTitle(latest)}.</p></div><div className="since-actions"><button onClick={onDismiss}>Mark reviewed</button><button className="primary" onClick={onReview}>Review memory <Icon name="arrow" size={12}/></button></div></section>;
}

function WorkerFocusDialog({ session, activity, onClose, onOpenTerminal }) {
  const history = sessionEvents(session, activity);
  if (!session) return null;
  return <Dialog.Root open onOpenChange={value => !value && onClose()}><Dialog.Portal><Dialog.Overlay className="palette-backdrop worker-focus-backdrop"/><Dialog.Content className="worker-focus-dialog" aria-describedby={undefined}>
      <header><div><span className="section-kicker">WORKER FOCUS</span><h2>{session.name}</h2><p><code>{session.command}</code> · {runtime(session)} · {session.status}</p></div><button onClick={onClose} aria-label="Close worker focus">×</button></header>
      <div className="worker-focus-summary"><span className={`status-orbit status-${session.status}`}><i/></span><div><strong>What is happening</strong><p>{sessionSummary(session, activity)}</p></div></div>
      <div className="worker-focus-history"><div className="worker-focus-label"><span>Terminal history</span><small>{history.length ? `${history.length} recent events` : "No recent state changes"}</small></div>{history.length ? history.map((event, index) => <article key={event.sequence || `${event.type}-${index}`}><i/><div><strong>{eventTitle(event)}</strong><span>{timeAgo(event.timestamp)} ago{event.reason ? ` · ${event.reason}` : ""}</span></div></article>) : <div className="worker-focus-empty">This terminal is healthy and has no recent lifecycle events to review.</div>}</div>
      <footer><button className="secondary-action" onClick={onClose}>Back to Groundstation</button><button className="primary-button" onClick={() => onOpenTerminal(session.id)}>Open this terminal <Icon name="arrow" size={14}/></button></footer>
    </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

function WorkerQuickLook({ session, activity, onAction, onOpenTerminal }) {
  const panelRef = React.useRef(null);
  React.useEffect(() => {
    if (!session) return undefined;
    const previous = document.activeElement;
    panelRef.current?.focus({ preventScroll: true });
    return () => previous?.focus?.({ preventScroll: true });
  }, [session?.id]);
  if (!session) return null;
  const events = sessionEvents(session, activity, 4);
  return <div className="quicklook-backdrop"><section ref={panelRef} tabIndex="-1" className="quicklook-panel" role="dialog" aria-modal="true" aria-label={`${session.name} quick look`}><header><div><span className="section-kicker">QUICK LOOK · HOLD SPACE</span><h2>{session.name}</h2><p>{workerKind(session)} · {session.status} · {runtime(session)}</p></div><span className={`status-orbit status-${session.status}`}><i/></span></header><div className="quicklook-summary"><span>What is happening</span><strong>{sessionSummary(session, activity)}</strong></div><dl><div><dt>Command</dt><dd>{session.command} {(session.args || []).join(" ")}</dd></div><div><dt>Working directory</dt><dd>{session.cwd || "."}</dd></div><div><dt>Restore policy</dt><dd>{session.autoStart ? "Starts with workspace" : "Manual start"}</dd></div><div><dt>Last output</dt><dd>{timeAgo(session.lastOutputAt)} ago</dd></div></dl><div className="quicklook-events"><span className="section-kicker">RECENT EVIDENCE</span>{events.length ? events.map(event => <article key={`${event.sequence}-${event.type}`}><time>{timeAgo(event.timestamp)}</time><span>{eventTitle(event)}</span></article>) : <p>No recent lifecycle evidence for this worker.</p>}</div><footer><span>Release Space to close</span><div><button onClick={() => onAction(session.isAlive ? "restart" : "start", session.id)}>{session.isAlive ? "Restart" : "Start"}</button><button className="primary" onClick={() => onOpenTerminal(session.id)}>Open terminal</button></div></footer></section></div>;
}

function AgentRail({ sessions, activity, selectedId, onSelect, onNavigate }) {
  const agents = sessions.filter(item => item.id.startsWith("agent-"));
  const recent = [...activity].reverse().slice(0, 6);
  return <aside className="reference-side-col">
    <section className="reference-side-panel"><header><div><span>LIVE AGENTS · AI WORKFORCE</span><strong>{agents.filter(item => item.isAlive).length} active · {agents.length} total</strong></div><button onClick={() => onNavigate("agents")}><Icon name="plus" size={12}/> Add</button></header><div className="reference-agent-list">{agents.length ? agents.map(agent => <button key={agent.id} className={selectedId === agent.id ? "is-selected" : ""} onClick={() => onSelect(agent.id)}><span className="reference-agent-avatar">{agent.name.slice(0,2).toUpperCase()}<i className={agent.attentionRequired ? "risk" : agent.isAlive ? "live" : ""}/></span><span><strong>{agent.name}</strong><small>{agent.attentionRequired ? "Needs you" : agent.isAlive ? "Working now" : "Standing by"}</small></span></button>) : <p className="reference-side-empty">No agents assigned to this project.</p>}</div></section>
    <section className="reference-side-panel"><header><div><span>RECENT ACTIVITY</span><strong>Latest engine events</strong></div></header><div className="reference-activity-feed">{recent.length ? recent.map((event, index) => <article key={`${event.sequence || index}-${event.type}`}><span className={/failed|error/i.test(String(event.type)) ? "danger" : /attention/i.test(String(event.type)) ? "warning" : "success"}><i/>{index < recent.length - 1 && <b/>}</span><div><p><strong>{event.name || event.id || event.sessionId || "Mission Control"}</strong> {eventTitle(event)}</p><small>{timeAgo(event.timestamp)} ago</small></div></article>) : <p className="reference-side-empty">Activity will appear as workers change state.</p>}</div></section>
    <section className="reference-side-panel"><header><div><span>MISSION COMMAND</span><strong>Keyboard-first</strong></div></header><div className="reference-tip"><Icon name="command" size={14}/><span><kbd>Ctrl K</kbd> opens Mission Command from anywhere.</span></div><div className="reference-tip"><Icon name="attention" size={14}/><span>Hold <kbd>Space</kbd> on a worker for Quick Look.</span></div></section>
  </aside>;
}

function LegacyGroundstationView({ sessions, workspace, activity, unseenActivity, selectedId, onSelect, onFocus, onAction, onNavigate, onDismissActivity, onRecipes, onLaunchRecipe, onAddWorker, onAskAI }) {
  const [activityOpen, setActivityOpen] = React.useState(false);
  const health = healthFor(sessions, workspace);
  const selected = sessions.find(session => session.id === selectedId) || sessions[0] || null;
  const agents = sessions.filter(session => session.id.startsWith("agent-"));
  const running = sessions.filter(session => session.isAlive).length;
  const failed = sessions.filter(session => session.status === "failed").length;
  const attentionCount = sessions.filter(session => session.attentionRequired).length;
  const latest = activity.at(-1);
  const summaryLines = nowSummary(sessions, activity);
  return <div className="groundstation-view groundstation-reimagined pm-view">
    <header className={`groundstation-hero pm-page-hero tone-${health.tone}`}>
      <div className="groundstation-hero__copy"><span className="stage-eyebrow"><i/> LIVE PROJECT ENVIRONMENT</span><h1>{workspace?.name || "Your development workspace"}</h1><p>{health.detail}. Mission Control is supervising {sessions.length} worker{sessions.length === 1 ? "" : "s"} and surfaces only changes that need judgment.</p></div>
      <div className="groundstation-hero__metrics" aria-label="Project status summary"><article><span>ACTIVE WORKERS</span><strong>{running}<small>/{sessions.length}</small></strong><p>{agents.filter(agent => agent.isAlive).length} AI agents working</p></article><article className={attentionCount ? "has-attention" : ""}><span>ATTENTION ITEMS</span><strong>{attentionCount}</strong><p>{failed ? `${failed} failed workers` : "No failures reported"}</p></article><article><span>LAST EVENT</span><strong>{latest ? timeAgo(latest.timestamp) : "Now"}</strong><p>{latest ? eventTitle(latest) : "Workspace connected"}</p></article></div>
    </header>
    <nav className="groundstation-quick-actions" aria-label="Groundstation quick actions"><button className="btn-primary" disabled={!sessions.some(item => !item.isAlive)} onClick={() => sessions.filter(item => !item.isAlive).forEach(item => onAction("start", item.id))}><Icon name="play" size={13}/> Start all idle</button><button className="btn-secondary btn-run-recipe" onClick={onRecipes}><Icon name="grid" size={13}/> Run Recipe</button><button className="btn-secondary" onClick={() => onNavigate("workspace")}><Icon name="terminal" size={13}/> Open Workspace</button><button className="btn-secondary" onClick={onAddWorker}><Icon name="plus" size={13}/> Add Worker</button><button className="btn-ai" onClick={onAskAI}><span>AI</span> Ask Mission AI</button><button className={`btn-ghost ${activityOpen ? "is-current" : ""}`} aria-pressed={activityOpen} onClick={() => setActivityOpen(value => !value)}><Icon name="history" size={13}/> Activity</button><button className={`btn-ghost ${attentionCount ? "has-attention" : ""}`} onClick={() => onNavigate("needs")}><Icon name="attention" size={13}/> Needs You <b>{attentionCount}</b></button></nav>
    <AttentionShelf sessions={sessions} onFocus={onFocus} onAction={onAction} onNavigate={onNavigate}/>
    {!sessions.length ? <section className="groundstation-onboarding pm-card"><div className="empty-orbit">MC</div><span className="section-kicker">FIRST WORKSPACE</span><h2>Build your supervised project</h2><p>Add the commands you already use. Mission Control will own their PTYs, track evidence, and surface decisions.</p><ol><li><b>1</b><span><strong>Add a worker</strong><small>Frontend, backend, tests, shell, database, or agent.</small></span></li><li><b>2</b><span><strong>Arrange the workspace</strong><small>Choose a terminal layout or save a Recipe.</small></span></li><li><b>3</b><span><strong>Supervise by exception</strong><small>Needs You interrupts only when judgment is required.</small></span></li></ol><button className="btn-primary" onClick={onAddWorker}>Add your first worker</button></section> : <div className={`groundstation-command-grid ${activityOpen ? "has-activity" : ""}`}>
      <main className="groundstation-workers"><header className="section-command-heading"><div><span className="section-kicker">SUPERVISED WORKERS</span><h2>Project operations</h2></div><span>{running} live · {sessions.length - running} idle</span></header><div className="groundstation-worker-grid pm-stagger">{sessions.map((session, index) => <article key={session.id} className={`pm-card pm-card--interactive groundstation-worker-card role-${workerProfile(session).key} state-${session.status} ${selected?.id === session.id ? "pm-card--selected is-selected" : ""}`} style={{ "--worker-index": index }} onClick={() => onSelect(session.id)} onDoubleClick={() => onFocus(session.id)}><header><span className="worker-role-pill">{workerKind(session)}</span><span className={`status-dot status-${session.attentionRequired ? "attention" : session.status}`}><i/></span></header><h3>{session.name}</h3><code>{session.command} {(session.args || []).join(" ")}</code><p>{session.isAlive ? session.lastLine || "Running; waiting for output" : session.attentionReason || "Ready to start"}</p><footer><span>{runtime(session)} · output {timeAgo(session.lastOutputAt)}</span><button className={session.status === "failed" ? "btn-danger" : "btn-secondary"} onClick={event => { event.stopPropagation(); onAction(session.isAlive ? "restart" : "start", session.id); }}>{session.isAlive ? "Restart" : "Start"}</button></footer></article>)}</div>{agents.length > 0 && <><header className="section-command-heading gs-agent-heading"><div><span className="section-kicker">AI CREW</span><h2>Assigned engineers</h2></div><span>{agents.filter(agent => agent.isAlive).length} active · {agents.length} total</span></header><div className="groundstation-worker-grid groundstation-agent-grid pm-stagger">{agents.map((session, index) => <article key={session.id} className={`pm-card pm-card--interactive groundstation-worker-card role-agent state-${session.status} ${selected?.id === session.id ? "pm-card--selected is-selected" : ""}`} style={{ "--worker-index": index }} onClick={() => onSelect(session.id)} onDoubleClick={() => onFocus(session.id)}><header><span className="worker-role-pill">AI agent</span><span className={`status-dot status-${session.attentionRequired ? "attention" : session.status}`}><i/></span></header><h3>{session.name}</h3><code>{session.command} {(session.args || []).join(" ")}</code><p>{session.isAlive ? session.lastLine || "Working; no summary reported" : session.attentionReason || "Standing by for a mission"}</p><footer><span>{runtime(session)} · output {timeAgo(session.lastOutputAt)}</span><button className={session.status === "failed" ? "btn-danger" : "btn-secondary"} onClick={event => { event.stopPropagation(); onAction(session.isAlive ? "restart" : "start", session.id); }}>{session.isAlive ? "Open" : "Start"}</button></footer></article>)}</div></>}<div className="gs-operations-strip"><section className="now-summary pm-card"><header><span>NOW</span><strong>What is happening</strong></header><div>{summaryLines.map(line => <article className={`tone-${line.tone}`} key={line.id}><i/><strong>{line.actor}</strong><span>{line.text}</span></article>)}</div><button className="btn-ghost" onClick={() => onNavigate(attentionCount ? "needs" : "history")}>{attentionCount ? "Review" : "History"} <Icon name="arrow" size={11}/></button></section><GroundstationRecipeLauncher sessions={sessions} onLaunch={onLaunchRecipe} onManage={onRecipes}/></div></main>
      <aside className="groundstation-side-panel"><section className="scene-inspector pm-card">{selected ? <><header><span className="section-kicker">SELECTED WORKER</span><span className={`status-orbit status-${selected.status}`}><i/></span></header><div className="scene-inspector__identity"><small>{workerKind(selected)}</small><h2>{selected.name}</h2><code>{selected.command} {(selected.args || []).join(" ")}</code></div><div className="scene-inspector__signal"><span>CURRENTLY</span><p>{sessionSummary(selected, activity)}</p></div><div className="scene-inspector__facts"><span><small>STATE</small><strong>{selected.status}</strong></span><span><small>RUNTIME</small><strong>{runtime(selected)}</strong></span><span><small>LAST OUTPUT</small><strong>{timeAgo(selected.lastOutputAt)}</strong></span><span><small>RESTORE</small><strong>{selected.autoStart ? "Auto" : "Manual"}</strong></span></div><footer><button className="btn-secondary" onClick={() => onAction(selected.isAlive ? "restart" : "start", selected.id)}>{selected.isAlive ? "Restart" : "Start"}</button><button className="btn-primary" onClick={() => onFocus(selected.id)}>{selected.id.startsWith("agent-") ? "Open agent" : "Open terminal"}</button></footer></> : null}</section>{activityOpen && <section className="groundstation-activity pm-card"><header><div><span className="section-kicker">ACTIVITY</span><h2>Latest engine events</h2></div><button className="btn-ghost" aria-label="Close activity panel" onClick={() => setActivityOpen(false)}>×</button></header><div>{[...activity].reverse().slice(0,10).map((event, index) => <button key={`${event.sequence || index}-${event.type}`} className={`timeline-event ${/failed|error/i.test(String(event.type)) ? "is-risk" : /evidence/i.test(String(event.type)) ? "is-evidence" : /session/i.test(String(event.type)) ? "is-worker" : "is-system"}`} onClick={() => event.sessionId && onSelect(event.sessionId)}><i/><span><strong>{eventTitle(event)}</strong><small>{event.name || event.sessionId || "Mission Control"} · {timeAgo(event.timestamp)} ago</small></span></button>)}</div><button className="btn-ghost" onClick={() => onNavigate("history")}>Open complete History</button></section>}</aside>
    </div>}
    <div className="groundstation-followup"><SinceLastCheck events={unseenActivity} onReview={() => onNavigate("history")} onDismiss={onDismissActivity}/></div>
  </div>;
}

/* A saved working set reports the run state the engine actually owns —
   running, paused, cancelling, cancelled, failed, completed — instead of
   inferring it from whether its workers happen to be alive. A recipe whose
   workers were deleted says so rather than failing at launch. */
function recipeStatus(recipe, knownIds) {
  const run = recipe.run || null;
  const phase = run?.phase || "idle";
  const workerIds = recipe.workerIds || [];
  const total = workerIds.length;
  const missing = workerIds.filter(id => !knownIds.has(id));
  if (missing.length) return {
    tone: "crit",
    label: `${missing.length} of ${total} worker${total === 1 ? "" : "s"} missing`,
    action: "Launch",
    canRun: false,
    reason: `This recipe references ${missing.length} worker${missing.length === 1 ? "" : "s"} that no longer exist in this project. Open Manage to repair it.`
  };
  if (phase === "running") return {
    tone: "ok",
    label: `Running · ${run.completed?.length || 0}/${total} started`,
    action: "Running",
    canRun: false,
    reason: "This run is already in progress."
  };
  if (phase === "paused") return { tone: "warn", label: "Paused", action: "Paused", canRun: false, reason: "Resume this run from Manage." };
  if (phase === "cancelling") return { tone: "warn", label: "Stopping…", action: "Stopping", canRun: false, reason: "Mission Control is stopping this run." };
  if (phase === "failed") {
    const failures = run.failures || [];
    return {
      tone: "crit",
      label: `Failed · ${failures.length} step${failures.length === 1 ? "" : "s"}`,
      action: "Recover",
      canRun: true,
      recover: true,
      reason: failures[0]?.reason ? `First failure: ${failures[0].reason}` : "Re-runs the steps that did not complete."
    };
  }
  if (phase === "cancelled") return { tone: "idle", label: "Cancelled", action: "Launch", canRun: true };
  if (phase === "completed") return {
    tone: "idle",
    label: Number.isFinite(run.finishedAt) ? `Ran ${timeAgo(run.finishedAt)} ago` : "Ready",
    action: "Launch",
    canRun: true
  };
  return {
    tone: "idle",
    label: total ? `${total} worker${total === 1 ? "" : "s"}` : "No workers",
    action: "Launch",
    canRun: total > 0
  };
}

function ReferenceRecipePanel({ sessions, onLaunch, onManage }) {
  // `null` is "not loaded yet" — distinct from an empty list, so a failed
  // load can never be reported to the operator as "you have no recipes".
  const [recipes, setRecipes] = React.useState(null);
  const [error, setError] = React.useState("");
  const [reloadToken, setReloadToken] = React.useState(0);
  React.useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    const refresh = () => missionApi().request("recipe.list")
      .then(value => { if (active) { setRecipes(Array.isArray(value) ? value : []); setError(""); } })
      .catch(value => { if (active) setError(value?.message || String(value)); });
    void refresh();
    try {
      unsubscribe = missionApi().subscribe(notification => {
        if (String(notification?.type || "").startsWith("recipe:")) void refresh();
      });
    } catch { /* Manage stays reachable; the panel just will not live-update. */ }
    return () => { active = false; unsubscribe?.(); };
  }, [reloadToken]);

  const knownIds = new Set(sessions.map(session => session.id));
  const stepName = workerId => sessions.find(session => session.id === workerId)?.name || workerId;
  return <section className="mc-ref-panel mc-ref-recipes">
    <header><h3>Daily workspaces</h3><button onClick={onManage}>Manage</button></header>
    {error ? <div className="mc-gs-recipe-note is-error" role="status">
      <strong>Recipes could not be loaded</strong>
      <span>{error}</span>
      <button onClick={() => setReloadToken(value => value + 1)}>Try again</button>
    </div> : recipes === null ? <p className="mc-gs-recipe-note" aria-busy="true">Loading saved working sets…</p>
      : recipes.length === 0 ? <div className="mc-gs-recipe-note">
        <strong>No saved working sets</strong>
        <span>Save the terminals you open together so one launch starts them in dependency order.</span>
        <button onClick={onManage}>Create a recipe</button>
      </div> : <div className="mc-ref-recipe-list">
        {recipes.slice(0, 3).map(recipe => {
          const status = recipeStatus(recipe, knownIds);
          const steps = recipe.steps || [];
          const chain = steps.slice(0, 3).map(step => stepName(step.workerId)).join(" → ");
          return <article key={recipe.id} className={`mc-gs-recipe tone-${status.tone}`}>
            <div className="mc-gs-recipe-head">
              <strong title={recipe.name}>{recipe.name}</strong>
              <span className={`mc-gs-recipe-state tone-${status.tone}`}>{status.label}</span>
            </div>
            <span className="mc-gs-recipe-chain" title={steps.map(step => stepName(step.workerId)).join(" → ")}>
              {chain}{steps.length > 3 ? ` +${steps.length - 3}` : ""}
            </span>
            <button
              className="mc-gs-recipe-run"
              disabled={!status.canRun}
              title={status.reason || `Launch ${recipe.name}`}
              onClick={() => onLaunch(recipe, { recover: status.recover === true })}
            >{status.action}</button>
          </article>;
        })}
      </div>}
    {recipes && recipes.length > 3 && <footer className="mc-gs-recipe-more">
      <button onClick={onManage}>+{recipes.length - 3} more saved</button>
    </footer>}
  </section>;
}

/* Manifest state is derived once so the row, the inspector, the filter chips
   and the mission graph all classify a worker exactly the same way. */
function manifestState(session) {
  if (session?.status === "failed") return "crit";
  if (session?.attentionRequired) return "warn";
  if (session?.isAlive) return "ok";
  return "idle";
}

/* Only structured engine evidence becomes a badge. Nothing here is parsed
   from raw terminal text and nothing is invented when evidence is absent. */
function evidenceBadges(session) {
  const structured = session?.evidence || {};
  const badges = [];
  if (structured.tests) {
    const failed = Number(structured.tests.failed) || 0;
    badges.push({ key: "tests", label: `${structured.tests.passed ?? 0}p${failed ? ` ${failed}f` : ""}`, tone: failed ? "warn" : "ok", title: `Tests: ${structured.tests.passed ?? 0} passed, ${failed} failed` });
  }
  if (structured.git) {
    const changed = Number(structured.git.changedPaths) || 0;
    badges.push({ key: "git", label: structured.git.clean ? "clean" : `${changed}Δ`, tone: "idle", title: `Git: ${structured.git.branch || "branch not reported"}${changed ? ` · ${changed} changed paths` : " · working tree clean"}` });
  }
  if (structured.service) {
    badges.push({ key: "service", label: structured.service.port ? `:${structured.service.port}` : structured.service.health || "service", tone: structured.service.health === "failed" ? "crit" : structured.service.health === "confirmed" ? "ok" : "idle", title: `Service: ${structured.service.origin || (structured.service.port ? `port ${structured.service.port}` : "endpoint not reported")}${structured.service.health ? ` · health ${structured.service.health}` : ""}` });
  }
  if (structured.build) {
    badges.push({ key: "build", label: structured.build.status || structured.build.phase || "build", tone: /fail/i.test(String(structured.build.status)) ? "crit" : "idle", title: `Build: ${structured.build.status || structured.build.phase || "phase not reported"}${structured.build.artifacts?.length ? ` · ${structured.build.artifacts.length} artifacts` : ""}` });
  }
  if (structured.database) {
    badges.push({ key: "database", label: structured.database.connection || "db", tone: structured.database.connection === "confirmed" ? "ok" : "idle", title: `Database: ${structured.database.connection || "connection not reported"} · migrations ${structured.database.migrations || "unknown"}` });
  }
  if (structured.container) {
    badges.push({ key: "container", label: structured.container.state || "container", tone: structured.container.healthy === false ? "crit" : "idle", title: `Container: ${structured.container.name || "unnamed"} · ${structured.container.state || "state not reported"}` });
  }
  return badges.slice(0, 3);
}

/* One activity sentence per worker, sourced only from reported facts. When
   the engine has reported nothing we say so instead of implying progress. */
function workerActivity(session) {
  if (session?.attentionRequired) return session.attentionReason || "Waiting for your decision";
  if (session?.status === "failed") return Number.isFinite(session.exitCode) ? `Exited with code ${session.exitCode}` : "Stopped unexpectedly";
  if (session?.isAlive) return Number.isFinite(session.lastOutputAt) ? `Output ${timeAgo(session.lastOutputAt)} ago` : "Running · no output reported yet";
  return session?.autoStart ? "Starts with the workspace" : "Start when ready";
}

function ReferenceManifestRow({ session, selected, favorite, onSelect, onFocus, onAction, onFavorite }) {
  const state = manifestState(session);
  const resources = session.resources || {};
  const resourceText = session.isAlive
    ? `${Number.isFinite(resources.cpuPercent) ? `${resources.cpuPercent.toFixed(1)}%` : "—"} · ${Number.isFinite(resources.memoryMB) ? `${Math.round(resources.memoryMB)} MB` : runtime(session)}`
    : session.status === "failed" ? "Exited" : "—";
  const statusText = session.status === "failed" ? "Needs you" : session.attentionRequired ? "Review" : session.isAlive ? (session.id.startsWith("agent-") ? "Working" : "Running") : "Idle";
  const commandText = `${session.command || ""} ${(session.args || []).join(" ")}`.trim() || "Ready to configure";
  const action = session.status === "failed" || session.attentionRequired ? "focus" : session.isAlive ? "restart" : "start";
  const badges = evidenceBadges(session);
  return <article
    className={`mc-ref-manifest-row state-${state} ${selected ? "is-selected" : ""}`}
    role="row"
    tabIndex={selected ? 0 : -1}
    aria-selected={selected}
    data-worker-id={session.id}
    onClick={() => onSelect(session.id)}
    onDoubleClick={() => onFocus(session.id)}
  >
    <i className="mc-ref-state-bar"/>
    <button
      type="button"
      className={`mc-gs-star ${favorite ? "is-on" : ""}`}
      aria-pressed={favorite}
      aria-label={favorite ? `Unpin ${session.name}` : `Pin ${session.name} to the top`}
      onClick={event => { event.stopPropagation(); onFavorite(session.id); }}
    ><Icon name="star" size={13}/></button>
    <div className="mc-ref-worker-name" role="cell">
      <span className="mc-gs-name-line"><strong>{session.name}</strong>{badges.map(badge => <b key={badge.key} className={`mc-gs-evidence tone-${badge.tone}`} title={badge.title}>{badge.label}</b>)}</span>
      <code>{commandText}</code>
    </div>
    <span className="mc-ref-role" role="cell">{workerKind(session)}</span>
    <span className={`mc-ref-status ${state}`} role="cell">{statusText}</span>
    <span className="mc-gs-activity" role="cell">{workerActivity(session)}</span>
    <span className="mc-ref-resource" role="cell">{resourceText}</span>
    <button className="mc-gs-row-action" onClick={event => {
      event.stopPropagation();
      if (action === "focus") onFocus(session.id);
      else onAction(action, session.id);
    }}>{action === "focus" ? "Review" : action === "restart" ? "Restart" : "Start"}</button>
  </article>;
}

/* Pinned workers are a per-project view preference, never engine state. */
const GS_FAVORITES_KEY = "mission-control.groundstation-favorites.v1";

function useFavoriteWorkers(projectPath) {
  const key = `${GS_FAVORITES_KEY}:${projectPath || "default"}`;
  const [favorites, setFavorites] = React.useState(() => new Set());
  React.useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(key) || "[]");
      setFavorites(new Set(Array.isArray(stored) ? stored : []));
    } catch { setFavorites(new Set()); }
  }, [key]);
  const toggle = React.useCallback(id => {
    setFavorites(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { window.localStorage.setItem(key, JSON.stringify([...next])); } catch { /* View preference only. */ }
      return next;
    });
  }, [key]);
  return [favorites, toggle];
}

function GroundstationStatusBar({ workspace, sessions, agents, health, attentionCount, filter, onFilter, onNavigate, onRecipes, onAskAI }) {
  const running = sessions.filter(session => session.isAlive).length;
  const activeAgents = agents.filter(agent => agent.isAlive).length;
  return <header className={`mc-gs-statusbar tone-${health.tone}`} role="region" aria-label="Project status">
    <div className="mc-gs-identity">
      <span className="mc-gs-health" aria-hidden="true"><i/></span>
      <div>
        <strong title={workspace?.path || workspace?.name || ""}>{workspace?.name || "Workspace"}</strong>
        <span>{health.label} · {health.detail}</span>
      </div>
    </div>
    <div className="mc-gs-counts" role="group" aria-label="Workspace counts">
      <button type="button" className={filter === "live" ? "is-active" : ""} aria-pressed={filter === "live"} onClick={() => onFilter(filter === "live" ? "all" : "live")}>
        <b>{running}<small>/{sessions.length}</small></b><span>Running</span>
      </button>
      <button type="button" className={filter === "idle" ? "is-active" : ""} aria-pressed={filter === "idle"} onClick={() => onFilter(filter === "idle" ? "all" : "idle")}>
        <b>{sessions.length - running}</b><span>Idle</span>
      </button>
      <button type="button" onClick={() => onNavigate("agents")}>
        <b>{activeAgents}<small>/{agents.length}</small></b><span>AI crew</span>
      </button>
      <button type="button" className={`mc-gs-needs ${attentionCount ? "has-attention" : ""}`} onClick={() => onNavigate("needs")}>
        <b>{attentionCount}</b><span>Needs you</span>
      </button>
    </div>
    <div className="mc-gs-statusbar-actions">
      <button type="button" className="primary" onClick={onRecipes}><Icon name="play" size={13}/> Run recipe</button>
      <button type="button" onClick={() => onNavigate("workspace")}><Icon name="terminal" size={13}/> Workspace</button>
      <button type="button" className="ai" onClick={onAskAI}><span>AI</span> Ask Mission AI</button>
    </div>
  </header>;
}

function AttentionInbox({ attention, onFocus, onAction, onNavigate }) {
  const [expanded, setExpanded] = React.useState(false);
  if (!attention.length) return null;
  /* Failures first, then oldest evidence first: the operator sees the most
     consequential decision without re-sorting the list themselves. */
  const ordered = [...attention].sort((a, b) => {
    const severity = (a.status === "failed" ? 0 : 1) - (b.status === "failed" ? 0 : 1);
    if (severity) return severity;
    return (a.lastOutputAt || a.startTime || 0) - (b.lastOutputAt || b.startTime || 0);
  });
  const shown = expanded ? ordered : ordered.slice(0, 3);
  return <section className="mc-gs-attention" role="region" aria-label={`Attention queue; ${attention.length} decisions waiting`}>
    <header>
      <div><span className="mc-gs-kicker">NEEDS YOU</span><strong>{attention.length} decision{attention.length === 1 ? "" : "s"} waiting</strong></div>
      <button type="button" onClick={() => onNavigate("needs")}>View all <Icon name="arrow" size={12}/></button>
    </header>
    <div>{shown.map(session => {
      const decision = decisionFor(session);
      return <article key={`inbox-${session.id}`} className={`mc-gs-decision is-${decision.tone}`}>
        <i aria-hidden="true"/>
        <div className="mc-gs-decision-body">
          <small>{decision.kind} · {session.name} · {Number.isFinite(session.lastOutputAt) ? `${timeAgo(session.lastOutputAt)} ago` : "age not reported"}</small>
          <strong>{decision.title}</strong>
          <p>{decision.impact}</p>
        </div>
        <div className="mc-gs-decision-actions">
          <button type="button" onClick={() => onFocus(session.id)}>{decision.recommended}</button>
          {session.status === "failed"
            ? <button type="button" className="primary" onClick={() => onAction("restart", session.id)}>Restart</button>
            : <button type="button" className="primary" onClick={() => onAction("acknowledge", session.id)}>Acknowledge</button>}
        </div>
      </article>;
    })}</div>
    {ordered.length > 3 && <footer><button type="button" onClick={() => setExpanded(value => !value)}>{expanded ? "Show fewer" : `+${ordered.length - 3} more decision${ordered.length - 3 === 1 ? "" : "s"}`}</button></footer>}
  </section>;
}

function ManifestToolbar({ filter, counts, query, onFilter, onQuery, searchRef }) {
  return <div className="mc-gs-toolbar" role="group" aria-label="Filter and search workers">
    <div className="mc-gs-chips">
      {[["all", "All"], ["live", "Live"], ["idle", "Idle"], ["review", "Review"], ["failed", "Failed"]].map(([value, label]) =>
        <button key={value} type="button" className={`chip-${value} ${filter === value ? "is-active" : ""}`} aria-pressed={filter === value} onClick={() => onFilter(value)}>
          {label} <b>{counts[value]}</b>
        </button>)}
    </div>
    <label className="mc-gs-search">
      <Icon name="search" size={13}/>
      <input ref={searchRef} type="search" value={query} placeholder="Search name or command…" aria-label="Search workers by name or command" onChange={event => onQuery(event.target.value)}/>
      {query && <button type="button" aria-label="Clear search" onClick={() => onQuery("")}>×</button>}
    </label>
  </div>;
}

function WorkerInspector({ session, activity, favorite, onClose, onFocus, onAction, onFavorite }) {
  if (!session) return null;
  const events = sessionEvents(session, activity, 6);
  const profile = workerProfile(session);
  const badges = evidenceBadges(session);
  const state = manifestState(session);
  return <aside className={`mc-gs-inspector state-${state}`} role="complementary" aria-label="Selected worker details">
    <header>
      <div>
        <span className="mc-gs-kicker">{workerKind(session)}</span>
        <h2>{session.name}</h2>
        <code>{session.command} {(session.args || []).join(" ")}</code>
      </div>
      <button type="button" className="mc-gs-inspector-close" aria-label="Close worker details" onClick={onClose}>×</button>
    </header>
    <div className="mc-gs-inspector-now"><span>Currently</span><p>{sessionSummary(session, activity)}</p></div>
    {badges.length > 0 && <div className="mc-gs-inspector-evidence">{badges.map(badge => <b key={badge.key} className={`mc-gs-evidence tone-${badge.tone}`} title={badge.title}>{badge.label}</b>)}<small>{profile.label}</small></div>}
    <dl className="mc-gs-inspector-facts">
      <div><dt>State</dt><dd>{session.status}</dd></div>
      <div><dt>Runtime</dt><dd>{runtime(session)}</dd></div>
      <div><dt>Last output</dt><dd>{Number.isFinite(session.lastOutputAt) ? `${timeAgo(session.lastOutputAt)} ago` : "Not reported"}</dd></div>
      <div><dt>Ownership</dt><dd>{session.isAlive && session.pid ? `Engine PTY · pid ${session.pid}` : "No engine PTY"}</dd></div>
      <div><dt>Directory</dt><dd title={session.cwd || "."}>{session.cwd || "."}</dd></div>
      <div><dt>Restore</dt><dd>{session.autoStart ? "Starts with workspace" : "Manual start"}</dd></div>
    </dl>
    <div className="mc-gs-inspector-events">
      <span className="mc-gs-kicker">RECENT EVIDENCE</span>
      {events.length ? events.map((event, index) => <article key={`${event.sequence || index}-${event.type}`}><time>{timeAgo(event.timestamp)}</time><span>{eventTitle(event)}</span></article>) : <p>No recent lifecycle evidence for this worker.</p>}
    </div>
    <footer>
      <button type="button" className={`mc-gs-star ${favorite ? "is-on" : ""}`} aria-pressed={favorite} aria-label={favorite ? "Unpin worker" : "Pin worker"} onClick={() => onFavorite(session.id)}><Icon name="star" size={13}/></button>
      <button type="button" onClick={() => onAction(session.isAlive ? "restart" : "start", session.id)}>{session.isAlive ? "Restart" : "Start"}</button>
      <button type="button" className="primary" onClick={() => onFocus(session.id)}>{session.id.startsWith("agent-") ? "Open agent" : "Open terminal"}</button>
    </footer>
  </aside>;
}

function ActivityWaterline({ activity, attentionCount, onNavigate, onSelect }) {
  const recent = [...activity].reverse().slice(0, 6);
  return <section className="mc-ref-panel mc-ref-now">
    <header><h3>NOW — what&apos;s happening</h3><button onClick={() => onNavigate(attentionCount ? "needs" : "history")}>{attentionCount ? "Review" : "History"}</button></header>
    <div className="mc-gs-feed" aria-live="polite">{recent.length ? recent.map((event, index) => {
      const tone = /failed|error/i.test(String(event.type)) ? "crit" : /attention/i.test(String(event.type)) ? "warn" : /evidence/i.test(String(event.type)) ? "ok" : "idle";
      return <button key={`${event.sequence || index}-${event.type}`} type="button" className={`tone-${tone}`} onClick={() => event.sessionId && onSelect(event.sessionId)}>
        <time>{timeAgo(event.timestamp)}</time>
        <strong>{event.name || event.sessionId || "Workspace"}</strong>
        <span>{eventTitle(event)}</span>
      </button>;
    }) : <p>Activity will appear here as workers change state.</p>}</div>
  </section>;
}

function ManifestList({ workers, favorites, selectedId, keyPrefix = "", onSelect, onFocus, onAction, onFavorite }) {
  return <div className="mc-ref-manifest" role="rowgroup">
    <div className="mc-ref-manifest-header" role="row" aria-hidden="true">
      <span/><span/><span>Worker</span><span>Role</span><span>State</span><span>Current activity</span><span>Resources</span><span>Action</span>
    </div>
    {workers.map(session => <ReferenceManifestRow
      key={`${keyPrefix}${session.id}`}
      session={session}
      selected={session.id === selectedId}
      favorite={favorites.has(session.id)}
      onSelect={onSelect}
      onFocus={onFocus}
      onAction={onAction}
      onFavorite={onFavorite}
    />)}
  </div>;
}

/* Pinned first, then the order an operator actually triages in: failures,
   decisions, running work, idle. Sorting is presentation only. */
function orderManifest(list, favorites) {
  const rank = session => (favorites.has(session.id) ? 0 : 1) * 10 + (session.status === "failed" ? 0 : session.attentionRequired ? 1 : session.isAlive ? 2 : 3);
  return [...list].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

function matchesFilter(session, filter) {
  if (filter === "all") return true;
  if (filter === "live") return session.isAlive;
  if (filter === "review") return session.attentionRequired && session.status !== "failed";
  if (filter === "failed") return session.status === "failed";
  return !session.isAlive && session.status !== "failed";
}

function LiveGroundstationView({ sessions, workspace, activity, unseenActivity, selectedId, onSelect, onFocus, onAction, onNavigate, onDismissActivity, onRecipes, onLaunchRecipe, onAddWorker, onAskAI, onMissionGraph }) {
  const health = healthFor(sessions, workspace);
  const agents = sessions.filter(session => session.id.startsWith("agent-"));
  const workers = sessions.filter(session => !session.id.startsWith("agent-"));
  const attention = sessions.filter(needsAttention);
  const [filter, setFilter] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [favorites, toggleFavorite] = useFavoriteWorkers(workspace?.path);
  const searchRef = React.useRef(null);
  const selected = sessions.find(session => session.id === selectedId) || null;
  const term = query.trim().toLowerCase();
  const matches = session => matchesFilter(session, filter)
    && `${session.name} ${session.command || ""} ${(session.args || []).join(" ")}`.toLowerCase().includes(term);
  const visibleWorkers = orderManifest(workers.filter(matches), favorites);
  const visibleAgents = orderManifest(agents.filter(matches), favorites);
  const counts = {
    all: sessions.length,
    live: sessions.filter(session => session.isAlive).length,
    idle: sessions.filter(session => !session.isAlive && session.status !== "failed").length,
    review: sessions.filter(session => session.attentionRequired && session.status !== "failed").length,
    failed: sessions.filter(session => session.status === "failed").length
  };
  const navigable = [...visibleWorkers, ...visibleAgents].map(session => session.id);

  /* Keyboard model for the manifest. Everything here is selection, filtering
     or an action the operator could already reach with the mouse; nothing new
     is dispatched to the engine and destructive stops still route through the
     shared confirmation dialog. */
  React.useEffect(() => {
    const editable = target => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
    const onKey = event => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (event.key === "Escape" && editable(event.target) && event.target === searchRef.current) {
        setQuery("");
        searchRef.current?.blur();
        return;
      }
      if (editable(event.target) || event.altKey) return;
      if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
        const key = event.key.toLowerCase();
        if (!selected || !["r", "s", "f"].includes(key)) return;
        event.preventDefault();
        if (key === "f") toggleFavorite(selected.id);
        else if (key === "r") onAction(selected.isAlive ? "restart" : "start", selected.id);
        else if (selected.isAlive) onAction("kill", selected.id);
        return;
      }
      if (event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (!navigable.length) return;
        event.preventDefault();
        const current = navigable.indexOf(selectedId);
        const step = event.key === "ArrowDown" ? 1 : -1;
        const next = current < 0 ? (step > 0 ? 0 : navigable.length - 1) : Math.min(navigable.length - 1, Math.max(0, current + step));
        onSelect(navigable[next]);
        return;
      }
      if (event.key === "Enter" && selectedId && navigable.includes(selectedId)) {
        event.preventDefault();
        onFocus(selectedId);
        return;
      }
      // Escape belongs to the topmost layer first: only clear the manifest
      // selection when no dialog, palette or quick look is open above it.
      if (event.key === "Escape" && selectedId && !document.querySelector("[role='dialog'],[role='alertdialog']")) onSelect(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigable.join("|"), onAction, onFocus, onSelect, selected, selectedId, toggleFavorite]);

  /* Keep the selected row scrolled into view when the keyboard drives it. */
  React.useEffect(() => {
    if (!selectedId) return;
    document.querySelector(`.mc-ref-manifest-row[data-worker-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const manifestProps = { favorites, selectedId, onSelect, onFocus, onAction, onFavorite: toggleFavorite };

  return <div className={`mc-ref-groundstation ${selected ? "has-inspector" : ""}`}>
    <GroundstationStatusBar workspace={workspace} sessions={sessions} agents={agents} health={health} attentionCount={attention.length} filter={filter} onFilter={setFilter} onNavigate={onNavigate} onRecipes={onRecipes} onAskAI={onAskAI}/>

    <div className="mc-gs-body">
      <div className="mc-gs-main">
        <AttentionInbox attention={attention} onFocus={onFocus} onAction={onAction} onNavigate={onNavigate}/>

        <section className="mc-ref-section mc-gs-register mc-gs-register--operations" role="table" aria-label="Supervised workers">
          <header className="mc-ref-section-head">
            <h2>Project operations</h2>
            <span>{visibleWorkers.length} of {workers.length} shown · {workers.filter(session => session.isAlive).length} live</span>
          </header>
          <ManifestToolbar filter={filter} counts={counts} query={query} onFilter={setFilter} onQuery={setQuery} searchRef={searchRef}/>
          {workers.length === 0
            ? <div className="mc-ref-empty"><strong>No operational workers configured</strong><span>Add backend, frontend, tests, Git, containers, or a database.</span><button onClick={onAddWorker}>Add a worker</button></div>
            : visibleWorkers.length === 0
              ? <div className="mc-ref-empty"><strong>No workers match this view</strong><span>Clear the search or choose a different status filter.</span><button onClick={() => { setFilter("all"); setQuery(""); }}>Show all workers</button></div>
              : <ManifestList workers={visibleWorkers} {...manifestProps}/>}
        </section>

        {agents.length > 0 && <section className="mc-ref-section mc-gs-register mc-gs-register--crew" role="table" aria-label="Assigned AI agents">
          <header className="mc-ref-section-head">
            <h2>AI crew</h2>
            <span>{agents.filter(agent => agent.isAlive).length} active · {agents.length} configured</span>
          </header>
          {visibleAgents.length
            ? <ManifestList workers={visibleAgents} keyPrefix="crew-" {...manifestProps}/>
            : <p className="mc-gs-muted">No agents match this view.</p>}
        </section>}

        <section className="mc-ref-lower-grid">
          <ActivityWaterline activity={activity} attentionCount={attention.length} onNavigate={onNavigate} onSelect={onSelect}/>
          <ReferenceRecipePanel sessions={sessions} onLaunch={onLaunchRecipe} onManage={onRecipes}/>
          <section className="mc-ref-panel mc-ref-graph">
            <header><h3>Mission dependencies</h3><button onClick={onMissionGraph}>Open</button></header>
            <div>{sessions.slice(0, 6).map(session => <button key={`graph-${session.id}`} onClick={() => onSelect(session.id)}><i className={manifestState(session)}/><code>{session.name}</code></button>)}{!sessions.length && <span>No configured workers</span>}</div>
          </section>
        </section>

        <SinceLastCheck events={unseenActivity} onReview={() => onNavigate("history")} onDismiss={onDismissActivity}/>
      </div>

      <WorkerInspector session={selected} activity={activity} favorite={favorites.has(selected?.id)} onClose={() => onSelect(null)} onFocus={onFocus} onAction={onAction} onFavorite={toggleFavorite}/>
    </div>
  </div>;
}

function GroundstationView({ sessions, workspace, activity, unseenActivity, selectedId, onSelect, onFocus, onAction, onNavigate, onMissionGraph, onRecipes, onDismissActivity }) {
  const [filter, setFilter] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const counts = { all: sessions.length, live: sessions.filter(item => item.isAlive).length, review: sessions.filter(item => item.attentionRequired && item.status !== "failed").length, failed: sessions.filter(item => item.status === "failed").length, idle: sessions.filter(item => !item.isAlive && item.status !== "failed").length };
  const visible = sessions.filter(item => (filter === "all" || (filter === "live" && item.isAlive) || (filter === "review" && item.attentionRequired && item.status !== "failed") || (filter === "failed" && item.status === "failed") || (filter === "idle" && !item.isAlive && item.status !== "failed")) && `${item.name} ${item.command}`.toLowerCase().includes(query.trim().toLowerCase()));
  const uptimeMinutes = sessions.filter(item => item.startTime && item.isAlive).reduce((sum, item) => sum + Math.max(0, Date.now() - Number(item.startTime)), 0) / 60000;
  const completed = activity.filter(item => /exit|completed|stopped/i.test(String(item.type))).length;
  const failures = activity.filter(item => /failed|error/i.test(String(item.type))).length;
  const successRate = completed ? Math.max(0, Math.round(((completed - failures) / completed) * 100)) : 100;
  return <div className="groundstation-layout reference-groundstation"><div className="groundstation-view">
    <header className="reference-page-head"><h1>Groundstation</h1><p>What&apos;s happening, and what needs you next.</p></header>
    <SupervisionBriefing workspace={workspace} activity={activity}/>
    <section className="reference-stats" aria-label="Workspace statistics"><article><span>UPTIME TODAY</span><strong>{Math.floor(uptimeMinutes / 60)}<small>h</small> {Math.round(uptimeMinutes % 60)}<small>m</small></strong><p>Across {sessions.length} workers</p></article><article><span>COMPLETED TODAY</span><strong>{completed}</strong><p>{activity.length} recorded events</p></article><article className={failures ? "has-warning" : ""}><span>SUCCESS RATE</span><strong>{successRate}<small>%</small></strong><p>{failures ? `${failures} failure${failures === 1 ? "" : "s"} recorded` : "No failures recorded"}</p></article><article><span>CONNECTIONS</span><strong>{counts.live}<small>/{sessions.length}</small></strong><p>{counts.live === sessions.length ? "All workers reachable" : `${sessions.length - counts.live} workers offline`}</p></article></section>
    <ProjectPulse sessions={sessions} workspace={workspace} activity={activity} onNavigate={onNavigate} onMissionGraph={onMissionGraph} onRecipes={onRecipes}/>
    <SinceLastCheck events={unseenActivity} onReview={() => onNavigate("history")} onDismiss={onDismissActivity}/>
    <AttentionShelf sessions={sessions} onFocus={onFocus} onAction={onAction} onNavigate={onNavigate}/>
    <div className="canvas-heading"><div><span className="section-kicker">LIVE PROJECT SCENE</span><h3>Workers by operational role</h3><small>Select a worker · Hold Space for Quick Look · Double-click to focus</small></div><button className="text-action" onClick={() => onNavigate("workspace")}>Open workstation <Icon name="arrow" size={14}/></button></div>
    <div className="reference-worker-toolbar">{[["all","All"],["live","Live"],["review","Review"],["failed","Failed"],["idle","Idle"]].map(([value,label]) => <button key={value} className={`${filter === value ? "is-active" : ""} filter-${value}`} onClick={() => setFilter(value)}>{label} <span>{counts[value]}</span></button>)}<label><Icon name="search" size={12}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Filter workers…"/></label></div>
    <div className="worker-canvas">{visible.length ? visible.map(session => <div className={`worker-scene-item kind-${workerKind(session).toLowerCase().replaceAll(" ", "-")}`} key={session.id}><span className="worker-kind">{workerKind(session)}</span><WorkerCard session={session} activity={activity} selected={session.id === selectedId} onSelect={() => onSelect(session.id)} onFocus={() => onFocus(session.id)} onAction={onAction}/></div>) : <EmptyState title="No matching workers" detail="Try another status filter or search term."/>}</div>
  </div><AgentRail sessions={sessions} activity={activity} selectedId={selectedId} onSelect={onSelect} onNavigate={onNavigate}/>
  </div>;
}

function EmptyState({ title, detail, action }) {
  return <div className="empty-state"><span className="empty-orbit"><i/></span><strong>{title}</strong><p>{detail}</p>{action}</div>;
}

function EmptyTerminalSlot({ sessions, onSelect, onAddWorker, onDropSession }) {
  return <article className="terminal-pane terminal-pane-empty" onDragOver={event => { if (event.dataTransfer.types.includes("application/x-mission-worker")) event.preventDefault(); }} onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData("application/x-mission-worker"); if (id) onDropSession(id); }}><span>＋</span><strong>Open a terminal worker</strong><p>Show an existing PTY here, drag a worker into this pane, or create a project command.</p><div className="empty-pane-actions"><DropdownMenu.Root><DropdownMenu.Trigger asChild><button className="empty-pane-trigger">Choose existing <span>⌄</span></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="empty-pane-menu radix-menu" sideOffset={8}>{sessions.map(item => <DropdownMenu.Item asChild key={item.id}><button onClick={() => onSelect(item.id)}><i className={`status-${item.status}`}/><span><strong>{item.name}</strong><small>{item.command}</small></span></button></DropdownMenu.Item>)}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root><button className="empty-pane-create" onClick={onAddWorker}>+ Create worker</button></div></article>;
}

function TerminalSlot({ session, sessions, active, expanded, minimized, shortcut, terminalPreferences, onFocus, onExpand, onAction, onSelect, onAddWorker, onReconfigure, onTerminalError, onTerminalRecovered }) {
  if (!session) return <EmptyTerminalSlot sessions={sessions} onSelect={onSelect} onDropSession={onSelect} onAddWorker={onAddWorker}/>;
  return <TerminalPane session={session} sessions={sessions} profile={workerProfile(session)} active={active} expanded={expanded} minimized={minimized} shortcut={shortcut} terminalFontSize={terminalPreferences.terminalFontSize} terminalTheme={terminalPreferences.terminalTheme} terminalCursor={terminalPreferences.terminalCursor} terminalScrollback={terminalPreferences.terminalScrollback} onFocus={onFocus} onToggleExpanded={onExpand} onAction={onAction} onSelectSession={onSelect} onDropSession={onSelect} onReconfigure={onReconfigure} onTerminalError={onTerminalError} onTerminalRecovered={onTerminalRecovered}/>;
}

function layoutForCount(count) {
  const id = count <= 1 ? "single" : count === 2 ? "horizontal" : count <= 4 ? "grid-2x2" : "grid-3x2";
  return TERMINAL_LAYOUTS.find(layout => layout.id === id) || TERMINAL_LAYOUTS[0];
}

function WorkerFolders({ workspaceKey, sessions, activeId, onSelect }) {
  const storageKey = `mission-control.worker-folders.v1:${workspaceKey || "default"}`;
  const [custom, setCustom] = React.useState([]);
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const [members, setMembers] = React.useState([]);
  React.useEffect(() => { try { const value = JSON.parse(localStorage.getItem(storageKey) || "[]"); setCustom(Array.isArray(value) ? value.filter(group => group?.id && group?.name && Array.isArray(group.workerIds)).slice(0, 12) : []); } catch { setCustom([]); } }, [storageKey]);
  const persist = next => { setCustom(next); try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Folder organization remains available for this session. */ } };
  const automatic = Object.entries(sessions.reduce((groups, session) => { const role = workerProfile(session).key; (groups[role] ||= []).push(session.id); return groups; }, {})).map(([role, workerIds]) => ({ id: `auto:${role}`, name: role === "agent" ? "AI agents" : `${role[0].toUpperCase()}${role.slice(1)} terminals`, workerIds, automatic: true }));
  const save = event => { event.preventDefault(); const label = name.trim(); if (!label || !members.length) return; const group = { id: globalThis.crypto?.randomUUID?.() || `folder-${Date.now()}`, name: label.slice(0, 40), workerIds: members }; persist([...custom, group].slice(0, 12)); setName(""); setMembers([]); setAdding(false); onSelect(group); };
  const removeGroup = group => { persist(custom.filter(item => item.id !== group.id)); if (activeId === group.id) onSelect(null); };
  return <div className="worker-folders">
    <div className="worker-folder-list">
      <button className={!activeId ? "is-current" : ""} onClick={() => onSelect(null)}><Icon name="grid" size={12}/><span>All terminals</span><b>{sessions.length}</b></button>
      {[...automatic, ...custom].map(group => <div className={`worker-folder-item ${activeId === group.id ? "is-current" : ""}`} key={group.id}>
        <button className="worker-folder-select" onClick={() => onSelect(group)} title={group.workerIds.map(id => sessions.find(session => session.id === id)?.name).filter(Boolean).join(", ")}><Icon name={group.automatic ? (group.id === "auto:agent" ? "agents" : "terminal") : "projects"} size={12}/><span>{group.name}</span><b>{group.workerIds.filter(id => sessions.some(session => session.id === id)).length}</b></button>
        {!group.automatic && <button type="button" className="worker-folder-delete" onClick={() => removeGroup(group)} aria-label={`Delete ${group.name}`}>×</button>}
      </div>)}
      <button className="worker-folder-add" onClick={() => { setAdding(value => !value); setMembers([]); }}><Icon name="plus" size={12}/><span>New folder</span></button>
    </div>
    {adding && <form className="worker-folder-builder" onSubmit={save}><header><div><span className="section-kicker">CUSTOM TERMINAL FOLDER</span><strong>Group the terminals you use together</strong></div><button type="button" aria-label="Close folder builder" onClick={() => setAdding(false)}>×</button></header><input autoFocus maxLength="40" value={name} onChange={event => setName(event.target.value)} placeholder="Frontend stack"/><div>{sessions.map(session => <label key={session.id}><input type="checkbox" checked={members.includes(session.id)} onChange={() => setMembers(current => current.includes(session.id) ? current.filter(id => id !== session.id) : [...current, session.id])}/><span><strong>{session.name}</strong><small>{workerKind(session)}</small></span></label>)}</div><footer><span>{members.length} selected</span><button disabled={!name.trim() || !members.length}>Create folder</button></footer></form>}
  </div>;
}

function resourceValue(value, suffix = "") {
  return Number.isFinite(value) ? `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}` : "—";
}

function WorkerResourceIntelligence({ session, sessions }) {
  const resources = session.resources;
  const health = session.health || { tone: session.status === "failed" ? "critical" : session.attentionRequired ? "attention" : session.isAlive ? "observing" : "idle", label: session.status, summary: "Waiting for engine analysis." };
  const impact = session.dependencyImpact || { recipeCount: 0, directDependentIds: [], downstreamCount: 0, level: "independent" };
  const names = impact.directDependentIds.map(id => sessions.find(item => item.id === id)?.name || id);
  const cpu = Number(resources?.cpuPercent);
  const cpuWidth = Number.isFinite(cpu) ? Math.min(100, Math.max(0, cpu)) : 0;
  const memory = Number(resources?.memoryMB);
  const memoryWidth = Number.isFinite(memory) ? Math.min(100, Math.max(2, memory / 20)) : 0;
  return <section className="worker-resource-intelligence" aria-label="Engine-owned Worker Intelligence">
    <header className={`worker-health tone-${health.tone}`}><span><i/></span><div><small>ENGINE HEALTH ANALYSIS</small><strong>{health.label}</strong><p>{health.summary}</p></div></header>
    <div className="worker-resource-readings">
      <div><span><small>CPU</small><strong>{resourceValue(resources?.cpuPercent, "%")}</strong></span><i><b style={{ width: `${cpuWidth}%` }}/></i></div>
      <div><span><small>MEMORY</small><strong>{resourceValue(resources?.memoryMB, " MB")}</strong></span><i><b style={{ width: `${memoryWidth}%` }}/></i></div>
    </div>
    <div className="worker-impact"><span><small>DEPENDENCY IMPACT</small><strong>{impact.level === "independent" ? "Independent worker" : `${impact.downstreamCount} downstream worker${impact.downstreamCount === 1 ? "" : "s"}`}</strong></span><p>{names.length ? `Directly unlocks ${names.join(", ")}.` : impact.recipeCount ? "No configured worker waits directly on this worker." : "Not linked to a Workspace Recipe."}</p></div>
    <footer><span>{resources?.available ? `Root process · PID ${resources.pid}` : session.isAlive ? "Process sample pending" : "No active process"}</span><span>{resources?.sampledAt ? `${timeAgo(resources.sampledAt)} ago` : "Engine lifecycle only"}</span></footer>
  </section>;
}

function WorkspaceView({ sessions, workspaceKey, terminalLayout, focusedId, expandedId, inspectorOpen, terminalPreferences, onInspector, onFocus, onExpand, onAction, onStartWorkspace, onStopWorkspace, onRecipes, onMissionGraph, onAddWorker, onReconfigure, onTerminalError, onTerminalRecovered }) {
  const gridRef = React.useRef(null);
  const [resizing, setResizing] = React.useState(false);
  const [activeFolder, setActiveFolder] = React.useState(null);
  // Focus mode collapses everything except the terminal canvas. It is pure
  // presentation: no worker lifecycle or engine state changes with it.
  const [focusMode, setFocusMode] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const slots = terminalLayout.sessionIds.map(id => sessions.find(session => session.id === id) || null);
  const folderSessions = activeFolder ? activeFolder.workerIds.map(id => sessions.find(session => session.id === id)).filter(Boolean) : slots;
  const effectiveLayout = activeFolder ? layoutForCount(folderSessions.length) : terminalLayout.layout;
  const folderWorkers = folderSessions.slice(0, effectiveLayout.slots);
  const filteredSlots = activeFolder ? [...folderWorkers, ...(folderWorkers.length < effectiveLayout.slots ? [null] : [])] : slots;
  const visible = filteredSlots;
  const focused = sessions.find(item => item.id === focusedId);
  const profile = focused ? workerProfile(focused) : null;
  const roleCounts = sessions.reduce((counts, session) => {
    const role = workerProfile(session).key;
    counts[role] = (counts[role] || 0) + 1;
    return counts;
  }, {});
  // One pointer-driven resize routine for every handle a layout exposes. The
  // handle descriptor names the axis to track and the persisted ratio it
  // drives, so column and row splits share the exact same code path.
  const beginPaneResize = React.useCallback((event, handle) => {
    if (!gridRef.current || expandedId || !handle) return;
    event.preventDefault();
    const node = event.currentTarget;
    node?.setPointerCapture?.(event.pointerId);
    const move = pointerEvent => {
      const rect = gridRef.current?.getBoundingClientRect();
      if (!rect) return;
      const raw = handle.axis === "y"
        ? (pointerEvent.clientY - rect.top) / rect.height
        : (pointerEvent.clientX - rect.left) / rect.width;
      terminalLayout.setRatio(handle.ratio, Math.round(Math.min(.75, Math.max(.25, raw)) * 100));
    };
    const stop = () => { setResizing(false); node?.releasePointerCapture?.(event.pointerId); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); };
    setResizing(true);
    move(event);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
  }, [expandedId, terminalLayout]);
  const liveCount = sessions.filter(item => item.isAlive).length;
  const attentionCount = sessions.filter(item => item.attentionRequired || item.status === "failed").length;
  const focusedSlot = Math.max(0, terminalLayout.sessionIds.indexOf(focusedId));
  const trimmedQuery = query.trim().toLowerCase();
  const matches = trimmedQuery
    ? sessions.filter(item => `${item.name} ${item.command} ${(item.args || []).join(" ")}`.toLowerCase().includes(trimmedQuery)).slice(0, 8)
    : [];
  const showInPane = id => { terminalLayout.setSlotSession(focusedSlot, id); onFocus(id); setQuery(""); };

  return <div className={`workspace-experience ${inspectorOpen && !focusMode ? "has-inspector" : ""} ${focusMode ? "is-focus-mode" : ""}`}>
    <div className="workspace-stage">
      {/* One compact operational toolbar. Layout, creation, search, focus mode
          and recipes sit together so the canvas keeps the rest of the window. */}
      <div className="workspace-command-deck workspace-toolbar-v2">
        <div className="workspace-title">
          <span className="section-kicker">TERMINAL WORKSPACE</span>
          <div>
            <span className={`workspace-focus-state status-${focused?.status || "idle"}`}><i/></span>
            <strong>{focused?.name || "Multi-terminal canvas"}</strong>
            <small>{focused ? `${focused.command} · ${runtime(focused)}` : `${sessions.length} supervised workers`}</small>
          </div>
        </div>

        <div className="workspace-toolbar-group workspace-toolbar-layout" role="group" aria-label="Canvas layout">
          <span className="workspace-toolbar-label">CANVAS LAYOUT</span>
          <div className="layout-switcher">{TERMINAL_LAYOUTS.map(option => <button key={option.id} className={terminalLayout.layout.id === option.id ? "is-current" : ""} aria-pressed={terminalLayout.layout.id === option.id} onClick={() => terminalLayout.setLayoutId(option.id)} title={`${option.label} layout · ${option.slots} pane${option.slots === 1 ? "" : "s"}`}><b>{option.glyph}</b><small>{option.label}</small></button>)}</div>
        </div>

        <div className="workspace-toolbar-group workspace-toolbar-find">
          <label className="workspace-worker-search">
            <Icon name="search" size={13}/>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a worker…" aria-label="Search workers to show in the focused pane"/>
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear worker search">×</button>}
          </label>
          {trimmedQuery && <div className="workspace-search-results" role="listbox" aria-label="Matching workers">
            {matches.length ? matches.map(item => <button key={item.id} type="button" role="option" aria-selected={item.id === focusedId} onClick={() => showInPane(item.id)}>
              <i className={`status-dot status-${item.status}`}/>
              <span><strong>{item.name}</strong><small>{item.command}</small></span>
              <b>{item.isAlive ? "live" : item.status}</b>
            </button>) : <p>No worker matches “{query.trim()}”.</p>}
          </div>}
        </div>

        <div className="workspace-actions">
          <span className="workspace-status-readout" title="Engine-reported worker states">
            <b>{liveCount}</b> live · <b>{sessions.length - liveCount}</b> idle{attentionCount ? <> · <b className="is-attention">{attentionCount}</b> need you</> : null}
          </span>
          <button className="workspace-add-worker" onClick={onAddWorker} title="Add a terminal worker · Ctrl N"><Icon name="plus" size={12}/> Add terminal worker</button>
          <button className="workspace-recipes" onClick={onRecipes} title="Workspace recipes"><Icon name="grid" size={12}/> Recipes</button>
          {sessions.some(item => !item.isAlive) && <button className="workspace-launch" onClick={onStartWorkspace}><Icon name="play" size={12}/> Start idle</button>}
          {sessions.some(item => item.isAlive) && <button className="workspace-pause" onClick={onStopWorkspace}>Stop all</button>}
          <button className={`workspace-focus-mode ${focusMode ? "is-current" : ""}`} aria-pressed={focusMode} onClick={() => setFocusMode(value => !value)} title="Focus mode · hide everything except the terminals"><Icon name="expand" size={12}/> Focus</button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild><button className="workspace-more" aria-label="More workspace tools"><Icon name="command" size={12}/> More</button></DropdownMenu.Trigger>
            <DropdownMenu.Portal><DropdownMenu.Content className="terminal-action-menu workspace-more-menu" align="end" sideOffset={7} collisionPadding={12}>
              <DropdownMenu.Item className="terminal-action-item" onSelect={onMissionGraph}><span>Mission Graph</span><small>Inspect worker dependencies and startup order</small></DropdownMenu.Item>
              <DropdownMenu.Item className="terminal-action-item" onSelect={onInspector}><span>{inspectorOpen ? "Close inspector" : "Open inspector"}</span><small>Show focused-worker evidence and controls</small></DropdownMenu.Item>
            </DropdownMenu.Content></DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      {!focusMode && <section className={`workspace-intelligence ${profile ? `role-${profile.key}` : "is-empty"}`} aria-label="Workspace operational context">
        <div className="workspace-intelligence__focus"><span>{profile?.label || "WORKSPACE MAP"}</span><strong>{profile?.metric || "Choose a terminal pane"}</strong><small>{profile?.detail || "Select a worker to see role-specific context."}</small></div>
        <div className="workspace-role-map" aria-label="Worker groups by operational role">{Object.entries(roleCounts).map(([role, count]) => <span className={`role-${role}`} key={role} title={sessions.filter(session => workerProfile(session).key === role).map(session => session.name).join(", ")}><i/>{role}<b>{count}</b></span>)}</div>
        <div className="workspace-intelligence__state"><small>ENGINE TRUTH</small><strong>{focused ? `${focused.status} · ${runtime(focused)}` : `${liveCount}/${sessions.length} live`}</strong></div>
      </section>}
      {!focusMode && <WorkerFolders workspaceKey={workspaceKey} sessions={sessions} activeId={activeFolder?.id || null} onSelect={group => { setActiveFolder(group); onExpand(null); if (group?.workerIds?.length) onFocus(group.workerIds[0]); }}/>}
      <div ref={gridRef} className={`terminal-grid ${effectiveLayout.className} ${activeFolder ? "has-adaptive-layout" : ""} ${expandedId ? "has-expanded" : ""} ${resizing ? "is-resizing" : ""}`} style={activeFolder ? undefined : terminalLayout.style}>{!expandedId && !activeFolder && terminalLayout.handles.map(handle => { const percent = terminalLayout.ratios[handle.ratio]; const defaultRatio = DEFAULT_RATIOS_BY_LAYOUT[terminalLayout.layout.id]?.[handle.ratio] ?? 50; return <button key={handle.id} type="button" data-handle={handle.id} className={`pane-resize-handle ${handle.axis === "y" ? "is-horizontal" : "is-vertical"}`} style={handle.axis === "y" ? { top: "var(--row-ratio)" } : { left: "var(--col-ratio)" }} aria-label={`Resize terminal panes ${handle.axis === "y" ? "vertically" : "horizontally"}. Current split ${percent} percent.`} aria-orientation={handle.axis === "y" ? "horizontal" : "vertical"} role="separator" title="Drag to resize · Double-click to reset" onPointerDown={event => beginPaneResize(event, handle)} onDoubleClick={() => terminalLayout.setRatio(handle.ratio, defaultRatio)} onKeyDown={event => { const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -2 : event.key === "ArrowRight" || event.key === "ArrowDown" ? 2 : 0; if (step) { event.preventDefault(); terminalLayout.setRatio(handle.ratio, percent + step); } }}><span/><b>{percent}%</b></button>; })}{visible.map((session, index) => { const slotIndex = index; return <TerminalSlot key={`slot-${slotIndex}-${session?.id || "empty"}`} session={session} sessions={sessions} active={Boolean(session && focusedId === session.id)} expanded={Boolean(session && expandedId === session.id)} minimized={Boolean(expandedId) && Boolean(session) && session.id !== expandedId} shortcut={slotIndex + 1} terminalPreferences={terminalPreferences} onFocus={() => session && onFocus(session.id)} onExpand={() => session && onExpand(expandedId === session.id ? null : session.id)} onAction={onAction} onSelect={id => terminalLayout.setSlotSession(slotIndex, id)} onAddWorker={onAddWorker} onReconfigure={onReconfigure} onTerminalError={onTerminalError} onTerminalRecovered={onTerminalRecovered}/>; })}</div>
    </div>
    {inspectorOpen && !focusMode && <aside className={`context-inspector ${profile ? `role-${profile.key}` : ""}`}>
      <div className="inspector-head"><div><span className="section-kicker">WORKER INTELLIGENCE</span><strong>{focused?.name || "No worker selected"}</strong></div><button onClick={onInspector} aria-label="Close inspector">×</button></div>
      {focused ? <>
        <div className="inspector-role"><small>{profile.label}</small><strong>{profile.metric}</strong><span>{profile.detail}</span></div>
        <div className="inspector-status"><span className={`status-orbit status-${focused.status}`}><i/></span><div><strong>{focused.status}</strong><small>{runtime(focused)} runtime · engine reported</small></div></div>
        <div className="inspector-structured"><span>ENGINE-OWNED FACTS</span>{Object.entries(focused.evidence || {}).length ? Object.entries(focused.evidence).map(([category, evidence]) => <article key={category}><b>{category}</b><strong>{evidenceSummary({ category, evidence })}</strong><small>{timeAgo(evidence.at)} ago · bounded record</small></article>) : <p>No structured integration record yet.</p>}</div>
        <WorkerResourceIntelligence session={focused} sessions={sessions}/>
        <details className="inspector-evidence"><summary>Recent bounded terminal evidence</summary>{(focused.recentLines || []).slice(-4).reverse().map((line, index) => <code key={`${line}-${index}`}>{line}</code>)}{!focused.recentLines?.length && <p>No bounded output evidence has been recorded yet.</p>}</details>
        <details className="inspector-definition"><summary>Worker definition and restore policy</summary><dl><div><dt>Worker type</dt><dd>{profile.kind}</dd></div><div><dt>Command</dt><dd>{focused.command} {(focused.args || []).join(" ")}</dd></div><div><dt>Working directory</dt><dd>{focused.cwd || "."}</dd></div><div><dt>Restore</dt><dd>{focused.autoStart ? "Automatic" : "Manual"}</dd></div><div><dt>Last output</dt><dd>{timeAgo(focused.lastOutputAt)} ago</dd></div></dl></details>
        <p className="inspector-truth-note">Lifecycle and root-process resources are engine-owned. Role facts come from bounded terminal evidence; high usage is observation, not a fabricated failure.</p>
        <div className="inspector-actions">{focused.attentionRequired && <button onClick={() => onAction("acknowledge", focused.id)}>Acknowledge alert</button>}<button onClick={() => onAction(focused.isAlive ? "restart" : "start", focused.id)}>{focused.isAlive ? "Restart worker" : "Start worker"}</button>{focused.isAlive && <button className="danger" onClick={() => onAction("kill", focused.id)}>Stop worker</button>}</div>
      </> : <EmptyState title="Select a worker" detail="Its live context, evidence and controls will appear here."/>}
    </aside>}
  </div>;
}

function NeedsView({ attention, supervisorPendingCount, mcpPendingCount, missionPendingCount, automationPendingCount, mobilePendingCount, pluginPendingCount, onSupervisorPendingChange, onMcpPendingChange, onMissionPendingChange, onAutomationPendingChange, onMobilePendingChange, onPluginPendingChange, onAction, onFocus, onDismissTerminalAlert }) {
  const [filter, setFilter] = React.useState("all");
  const [showSnoozed, setShowSnoozed] = React.useState(false);
  const [engineQueue, setEngineQueue] = React.useState({ records: [], preferences: { minimumSeverity: "info", desktopNotifications: true, quietHours: { enabled: false, start: "22:00", end: "07:00" } } });
  const refreshEngineQueue = React.useCallback(async () => { try { setEngineQueue(await missionApi().request("attention.list")); } catch { /* Retain the live-session fallback. */ } }, []);
  React.useEffect(() => { void refreshEngineQueue(); }, [attention.map(item => `${item.id}:${item.status}:${item.attentionRequired}`).join("|"), refreshEngineQueue]);
  const lifecycleFor = session => engineQueue.records.find(record => record.sessionId === session.id && record.state !== "recovered");
  const moveLifecycle = async (session, state, options = {}) => { const record = lifecycleFor(session); if (!record) return; await missionApi().request("attention.transition", { attentionId: record.id, state, ...options }); await refreshEngineQueue(); };
  const [queueState, setQueueState] = React.useState(() => { try { const value = JSON.parse(localStorage.getItem(DECISION_STATE_KEY) || "{}"); return value && typeof value === "object" ? value : {}; } catch { return {}; } });
  const persistQueue = update => setQueueState(current => { const next = typeof update === "function" ? update(current) : update; try { localStorage.setItem(DECISION_STATE_KEY, JSON.stringify(next)); } catch { /* Queue presentation state is local best effort. */ } return next; });
  const markSeen = id => { persistQueue(current => ({ ...current, [id]: { ...current[id], seen: true } })); const session = attention.find(item => item.id === id); if (session) void moveLifecycle(session, "seen"); };
  const snooze = id => { const snoozedUntil = Date.now() + 15 * 60 * 1000; persistQueue(current => ({ ...current, [id]: { ...current[id], seen: true, snoozedUntil } })); const session = attention.find(item => item.id === id); if (session) void moveLifecycle(session, "seen", { snoozedUntil }); };
  const snoozed = attention.filter(session => Number(queueState[session.id]?.snoozedUntil) > Date.now());
  const available = attention.filter(session => showSnoozed || Number(queueState[session.id]?.snoozedUntil) <= Date.now());
  const visible = available.filter(session => filter === "critical" ? session.status === "failed" : filter === "agents" ? session.id.startsWith("agent-") : true);
  const critical = available.filter(session => session.status === "failed").length;
  const agents = available.filter(session => session.id.startsWith("agent-")).length;
  const recovered = engineQueue.records.filter(record => record.state === "recovered");
  const groupCounts = engineQueue.records.reduce((counts, record) => ({ ...counts, [record.groupKey]: (counts[record.groupKey] || 0) + 1 }), {});
  const totalWaiting = available.length + supervisorPendingCount + mcpPendingCount + missionPendingCount + automationPendingCount + mobilePendingCount + pluginPendingCount;
  const agentWaiting = agents + supervisorPendingCount + mcpPendingCount + missionPendingCount;
  const visibleExternalCount = filter === "all" ? supervisorPendingCount + mcpPendingCount + missionPendingCount + automationPendingCount + mobilePendingCount + pluginPendingCount : filter === "agents" ? supervisorPendingCount + mcpPendingCount + missionPendingCount : 0;
  const filterWaiting = visible.length + visibleExternalCount;
  return <div className="needs-view needs-decision-room">
    <header className="needs-hero"><div><span className="section-kicker">NEEDS YOU</span><h2>{totalWaiting ? `${totalWaiting} decision${totalWaiting === 1 ? "" : "s"} waiting` : "Your workspace is clear"}</h2><p>{totalWaiting ? "Evidence and consequence come before every action." : "Mission Control will interrupt only when your judgment is required."}</p></div></header>
    <div className="decision-room-heading"><div><span className="section-kicker">PRIORITIZED QUEUE</span><strong>{totalWaiting ? "Review impact before acting" : "Nothing requires intervention"}</strong></div><span>Evidence → action → engine verification</span></div>
    <div className="decision-queue-controls"><div><button className={`${filter === "all" ? "is-current" : ""} ${totalWaiting === 0 ? "is-zero" : ""}`.trim()} onClick={() => setFilter("all")}>All <b>{totalWaiting}</b></button><button className={`${filter === "critical" ? "is-current" : ""} ${critical === 0 ? "is-zero" : ""}`.trim()} onClick={() => setFilter("critical")}>Critical <b>{critical}</b></button><button className={`${filter === "agents" ? "is-current" : ""} ${agentWaiting === 0 ? "is-zero" : ""}`.trim()} onClick={() => setFilter("agents")}>Agents <b>{agentWaiting}</b></button></div><div>{snoozed.length > 0 && <button className={showSnoozed ? "is-current" : ""} onClick={() => setShowSnoozed(value => !value)}>{showSnoozed ? "Hide snoozed" : `Snoozed ${snoozed.length}`}</button>}<button disabled={!attention.length} onClick={() => persistQueue(current => Object.fromEntries(Object.entries(current).map(([id, value]) => [id, { ...value, seen: true }])))}>Mark all seen</button></div></div>
    <details className="attention-lifecycle-bar"><summary title="How attention moves through the engine"><Icon name="info" size={13}/><span>Queue lifecycle</span><b>{recovered.length} recovered</b></summary><div><strong>New → Seen → Acting → Verifying → Recovered</strong><small>Notification policy is managed in Settings</small></div></details>
    <MissionSupervisorApprovalQueue visible={filter === "all" || filter === "agents"} onPendingChange={onSupervisorPendingChange}/>
    <MissionApprovalQueue visible={filter === "all" || filter === "agents"} onPendingChange={onMissionPendingChange}/>
    <McpApprovalQueue visible={filter === "all" || filter === "agents"} onPendingChange={onMcpPendingChange}/>
    <AutomationApprovalQueue visible={filter === "all"} onPendingChange={onAutomationPendingChange}/>
    <MobileApprovalQueue visible={filter === "all"} onPendingChange={onMobilePendingChange}/>
    <PluginApprovalQueue visible={filter === "all"} onPendingChange={onPluginPendingChange}/>
    <div className="needs-list">{visible.length ? visible.map((session, index) => {
      const decision = decisionFor(session);
      const isNew = !queueState[session.id]?.seen;
      const isSnoozed = Number(queueState[session.id]?.snoozedUntil) > Date.now();
      const lifecycle = lifecycleFor(session);
      const related = lifecycle ? groupCounts[lifecycle.groupKey] || 1 : 1;
      return <article className={`need-item decision-${decision.tone} lifecycle-${lifecycle?.state || "new"} ${session.rendererAttention ? "is-terminal-alert" : ""} ${isSnoozed ? "is-snoozed" : ""}`} key={session.id}><div className="need-index"><span>{String(index + 1).padStart(2, "0")}</span><i/></div><div className="need-copy"><div className="need-meta"><span>{decision.kind}</span><em>{(lifecycle?.state || (isNew ? "new" : "seen")).toUpperCase()}</em>{related > 1 && <em>RELATED {related}</em>}{isSnoozed && <em>SNOOZED</em>}<time>{timeAgo(session.attentionSince)} ago</time><b>{lifecycle?.severity || (session.rendererAttention ? "terminal" : session.status)}</b></div><strong>{decision.title}</strong><div className="decision-evidence"><span><b>Evidence</b>{session.spawnError || session.attentionReason || `Engine reports ${session.status}`}</span><span><b>Impact</b>{decision.impact}</span><span><b>Recommended</b>{decision.recommended}</span></div><p>{session.rendererAttention ? "Renderer alert: the engine-owned worker state is unchanged." : `Engine lifecycle: ${lifecycle?.state || "new"}. Recovery appears only after the engine verifies the alert cleared.`}</p></div><div className="need-actions"><button onClick={() => { markSeen(session.id); onFocus(session.id); }}>{session.rendererAttention ? "Open terminal" : session.id.startsWith("agent-") ? "Review agent" : "Inspect evidence"}</button>{session.status === "failed" && <button className="recommended" onClick={async () => { await moveLifecycle(session, "acting"); await onAction("restart", session.id); await moveLifecycle(session, "verifying"); }}>Restart & verify</button>}<button onClick={() => snooze(session.id)}>Snooze 15m</button>{session.rendererAttention ? <button className="primary" onClick={() => onDismissTerminalAlert(session.id)}>Dismiss</button> : <button className="primary" onClick={async () => { await moveLifecycle(session, "acting"); await onAction("acknowledge", session.id); await refreshEngineQueue(); }}>Acknowledge</button>}</div></article>;
    }) : filterWaiting ? null : filter !== "all" ? <EmptyState title={filter === "critical" ? "No critical decisions" : "No agent decisions"} detail={filter === "critical" ? "Failed workers requiring intervention will appear here." : "Agent, Gemini, Mission and MCP approvals will appear here when they need you."}/> : snoozed.length && !showSnoozed ? <EmptyState title={`${snoozed.length} decision${snoozed.length === 1 ? " is" : "s are"} snoozed`} detail="Nothing else is waiting in the active queue. Reveal snoozed decisions above to review them before the timer expires."/> : <div className="needs-clear-state"><span className="needs-clear-mark">✓</span><span className="section-kicker">ALL CLEAR</span><h3>No failures, prompts, or approvals</h3><p>The queue will update automatically when a worker or agent needs your judgment.</p></div>}</div>
  </div>;
}

function AgentsView({ sessions, adapters, loading, onCreate, onFocus, onAction }) {
  const agents = sessions.filter(item => item.id.startsWith("agent-"));
  const [selectedId, setSelectedId] = React.useState(null);
  const selected = agents.find(item => item.id === selectedId) || agents[0];
  const active = agents.filter(item => item.isAlive).length;
  const failed = agents.filter(item => item.status === "failed").length;
  return <div className="agents-view">
    <header className="agents-hero"><div><span className="section-kicker">AGENT OPERATIONS</span><h2>Your AI engineering crew</h2><p>See reported activity and evidence without invented completion estimates.</p></div><div className="agent-overview"><span><small>WORKING</small><strong>{active}</strong></span><span><small>STANDING BY</small><strong>{agents.length - active}</strong></span><span className={failed ? "has-risk" : ""}><small>NEEDS REVIEW</small><strong>{failed}</strong></span></div></header>
    <div className="agent-command-deck"><section><div className="agent-section-heading"><div><span className="section-kicker">ACTIVE CREW</span><h3>Engineers in this workspace</h3></div><small>Select to inspect · Double-click for evidence</small></div>{agents.length ? <div className="agent-operations">{agents.map(agent => <article className={`agent-operation ${selected?.id === agent.id ? "is-selected" : ""}`} key={agent.id} onClick={() => setSelectedId(agent.id)} onDoubleClick={() => onFocus(agent.id)}><div className="agent-avatar">{agent.name.slice(0,1)}</div><div className="agent-mission"><span>REPORTED PHASE</span><strong>{agentPhase(agent)}</strong><p>{agent.name} · <code>{agent.command}</code></p></div><div className={`agent-phase ${agent.isAlive ? "is-active" : ""}`}><i/><small>{agent.isAlive ? `Output last seen ${timeAgo(agent.lastOutputAt)} ago` : "No active terminal process"}</small></div><div className={`risk-chip ${agent.status === "failed" || agent.attentionRequired ? "is-risk" : ""}`}>{agent.status === "failed" ? "Failed" : agent.attentionRequired ? "Needs approval" : "No risk reported"}</div><button className="agent-start-action" onClick={event => { event.stopPropagation(); agent.isAlive ? onFocus(agent.id) : onAction("start", agent.id); }}>{agent.isAlive ? "Inspect evidence" : <><Icon name="play" size={12}/> Start</>}</button></article>)}</div> : <EmptyState title="Your crew is ready to assemble" detail="Add a local agent below. Mission Control will supervise it as an engine-owned worker."/>}</section>{selected && <aside className="agent-brief"><div className="agent-brief__status"><span className={`status-orbit status-${selected.status}`}><i/></span><span>{agentPhase(selected)}</span></div><h3>{selected.name.replace(" agent", "")}</h3><p>{sessionSummary(selected, [])}</p><dl><div><dt>Command</dt><dd><code>{selected.command}</code></dd></div><div><dt>Engine state</dt><dd>{selected.status}</dd></div><div><dt>Runtime</dt><dd>{runtime(selected)}</dd></div><div><dt>Evidence</dt><dd>{selected.lastOutputAt ? `Output ${timeAgo(selected.lastOutputAt)} ago` : "No output reported"}</dd></div></dl><button className="primary-button" onClick={() => selected.isAlive ? onFocus(selected.id) : onAction("start", selected.id)}>{selected.isAlive ? "Inspect mission evidence" : `Start ${selected.command}`}</button></aside>}</div>
    <div className="adapter-heading"><div><span className="section-kicker">ADD AN ENGINEER</span><h3>Local agent adapters</h3></div><span>Official command · Starts immediately · Authentication stays in the CLI</span></div><div className="adapter-grid">{adapters.map(adapter => <button className="adapter-card" key={adapter.id} disabled={loading} onClick={() => onCreate(adapter.id)}><span className="adapter-mark">{adapter.name.slice(0,1)}</span><span><strong>{adapter.name}</strong><code>$ {adapter.command || adapter.id}</code><small>{adapter.description}</small></span><span className="adapter-add"><Icon name="play" size={15}/> Add & start</span></button>)}</div>
  </div>;
}

function HistoryView({ events, onFocus, projectKey = "default" }) {
  const [filter, setFilter] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [actorFilter, setActorFilter] = React.useState("all");
  const [selectedSequence, setSelectedSequence] = React.useState(null);
  const [memory, setMemory] = React.useState(null);
  React.useEffect(() => { let active = true; let afterSequence = 0; try { const cursors = JSON.parse(localStorage.getItem(HISTORY_CURSOR_KEY) || "{}"); afterSequence = Number(cursors?.[projectKey]) || 0; } catch { /* Cursor is optional. */ } missionApi().request("memory.summary", { afterSequence }).then(result => { if (active) setMemory(result); }).catch(() => {}); return () => { active = false; }; }, [events.length, projectKey]);
  const ordered = [...events].reverse();
  const failures = ordered.filter(event => /failed|error|attention/i.test(String(event.type)));
  const evidenceEvents = ordered.filter(event => event.type === "session:evidence");
  const chapters = memory?.chapters || [];
  const relationshipFor = chapter => memory?.causalLinks?.find(link => link.fromChapterId === chapter.correlationId || link.toChapterId === chapter.correlationId);
  const actorFor = event => event.name || event.id || event.sessionId || event.operation || "Workspace";
  const actors = [...new Set(ordered.map(actorFor))].slice(0, 8);
  const scoped = filter === "risk" ? failures : filter === "workers" ? ordered.filter(event => String(event.type).includes("session")) : filter === "evidence" ? evidenceEvents : ordered;
  const visible = scoped.filter(event => (actorFilter === "all" || actorFor(event) === actorFilter) && `${event.type || ""} ${event.name || ""} ${event.id || ""} ${event.sessionId || ""} ${event.operation || ""} ${event.reason || ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = ordered.find(event => event.sequence === selectedSequence) || visible[0] || null;
  const selectedChapter = selected?.correlationId ? chapters.find(chapter => chapter.correlationId === selected.correlationId) : null;
  const recoveryChapters = chapters.filter(chapter => ["unresolved", "retrying", "recovered"].includes(chapter.state));
  return <div className="history-view">
    <header className="history-hero history-hero-redesigned"><div><span className="section-kicker">PROJECT MEMORY</span><h2>Investigate how the work unfolded</h2><p>A durable timeline of worker changes and verified operational facts. Structured evidence is stored without raw terminal output.</p></div><div className="history-snapshot"><span><small>RECORDED</small><strong>{ordered.length}</strong></span><span className="is-evidence"><small>EVIDENCE</small><strong>{evidenceEvents.length}</strong></span><span><small>RISKS</small><strong>{failures.length}</strong></span><span><small>ACTORS</small><strong>{actors.length}</strong></span></div></header>
    {memory && <section className="memory-briefing"><div className="memory-since"><span className="section-kicker">SINCE YOU LEFT · ENGINE SUMMARY</span><strong>{memory.since.summary}</strong><div><span>{memory.since.eventCount} changes</span><span>{memory.since.riskCount} risks</span><span>{memory.since.evidenceCount} evidence records</span></div></div><div className="memory-why"><span className="section-kicker">WHY IT NEEDS REVIEW</span>{memory.why.length ? memory.why.slice(0,2).map(item => <button key={item.sequence} onClick={() => setSelectedSequence(item.sequence)}><strong>{item.actor}</strong><span>{item.statement}</span><small>{item.correlationId ? "Engine-correlated" : "Recorded fact"}</small></button>) : <p>No recorded failure reason in this review window.</p>}</div></section>}
    {memory?.resumePoints?.length > 0 && <section className="memory-resume"><header><div><span className="section-kicker">RESUME WORK</span><strong>Return with the engine’s last known context</strong></div><small>Worker state and run evidence · no generated progress</small></header><div>{memory.resumePoints.slice(0,4).map(point => <button key={point.workerId} className={`is-${point.state}`} onClick={() => { if (point.sequence) setSelectedSequence(point.sequence); onFocus?.(point.workerId); }}><span><i/></span><span><strong>{point.title}</strong><small>{point.detail}</small></span><b>Open worker</b></button>)}</div></section>}
    {recoveryChapters.length > 0 && <section className="recovery-chains"><header><div><span className="section-kicker">FAILURE → RECOVERY RELATIONSHIPS</span><strong>Evidence-backed run continuity</strong></div><small>Same-worker chronology · success requires verification</small></header><div>{recoveryChapters.slice(0,4).map(chapter => { const relationship = relationshipFor(chapter); return <button key={chapter.correlationId} className={`is-${chapter.state}`} onClick={() => setSelectedSequence(chapter.resumePoint?.sequence || chapter.latestSequence)}><i/><span><strong>{chapter.actor}</strong><small>{relationship?.basis || chapter.failure || chapter.summary}</small></span><b>{chapter.state}</b></button>; })}</div></section>}
    {memory && <section className="memory-state-split"><header><span className="section-kicker">CURRENT ENGINE STATE</span><strong>Now, separate from the historical record below</strong></header><div>{memory.current.map(worker => <article key={worker.id}><i className={`status-${worker.status}`}/><span><strong>{worker.name}</strong><small>{worker.attentionRequired ? "Needs attention now" : worker.isAlive ? "Running now" : "Not running now"}</small></span><b>{worker.status}</b></article>)}</div></section>}
    <section className="history-evidence-strip"><header><div><span className="section-kicker">ENGINE EVIDENCE</span><strong>Verified facts from your workers</strong></div><button className={filter === "evidence" ? "is-current" : ""} onClick={() => setFilter(filter === "evidence" ? "all" : "evidence")}>{filter === "evidence" ? "Show all events" : `View all ${evidenceEvents.length}`}</button></header><div>{evidenceEvents.slice(0, 4).map(event => <button key={event.sequence} onClick={() => { setFilter("evidence"); setSelectedSequence(event.sequence); }}><span>{event.category}</span><strong>{evidenceSummary(event)}</strong><small>{event.name || event.id} · {timeAgo(event.timestamp)} ago</small></button>)}{!evidenceEvents.length && <p>Run tests, a build, Git status, or a service to create durable structured evidence.</p>}</div></section>
    {chapters.length > 0 && <section className="history-chapters"><header><div><span className="section-kicker">RUN CHAPTERS · RESUMABLE MEMORY</span><strong>Compact context for every recorded run</strong></div><small>Correlation-backed · bounded evidence · explicit relationships</small></header><div>{chapters.slice(0, 5).map(chapter => <button key={chapter.correlationId} className={`is-${chapter.state} ${!["active", "completed", "ended"].includes(chapter.state) ? "has-risk" : ""}`} onClick={() => setSelectedSequence(chapter.resumePoint?.sequence || chapter.latestSequence)}><i/><span><strong>{chapter.actor || "Worker run"}</strong><small>{chapter.summary}</small></span><b>{chapter.state}</b></button>)}</div></section>}
    <div className="history-controls"><div><button className={filter === "all" ? "is-current" : ""} onClick={() => setFilter("all")}>All changes</button><button className={filter === "workers" ? "is-current" : ""} onClick={() => setFilter("workers")}>Workers</button><button className={filter === "risk" ? "is-current" : ""} onClick={() => setFilter("risk")}>Risks & attention</button></div><label className="history-search"><Icon name="search" size={13}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search event, actor, reason…"/><kbd>{visible.length}</kbd></label></div>
    {actors.length > 1 && <div className="history-actors"><span>ACTOR</span><button className={actorFilter === "all" ? "is-current" : ""} onClick={() => setActorFilter("all")}>Everyone</button>{actors.map(actor => <button className={actorFilter === actor ? "is-current" : ""} key={actor} onClick={() => setActorFilter(actor)}>{actor}</button>)}</div>}
    <div className={`history-investigation ${selected ? "has-selection" : ""}`}><div className="timeline">{visible.length ? visible.map(event => { const dangerous = /failed|error|attention/i.test(String(event.type)); const actor = actorFor(event); const eventKind = dangerous ? "risk" : /evidence/i.test(String(event.type)) ? "evidence" : /session|worker/i.test(String(event.type)) ? "worker" : "system"; return <article tabIndex="0" onClick={() => setSelectedSequence(event.sequence)} onKeyDown={keyEvent => keyEvent.key === "Enter" && setSelectedSequence(event.sequence)} className={`timeline-event event-${eventKind} ${dangerous ? "is-danger" : ""} ${selected?.sequence === event.sequence ? "is-selected" : ""}`} key={`${event.sequence}-${event.type}`}><div className="timeline-time"><strong>{timeAgo(event.timestamp)}</strong><span>#{event.sequence}</span></div><div className={`timeline-node event-${eventKind} ${dangerous ? "is-danger" : ""}`}><i/></div><div className="timeline-copy"><span>{actor}</span><strong>{eventTitle(event)}</strong><p>{event.reason || (dangerous ? "Engine evidence marks this moment for review." : String(event.type).includes("session") ? `${actor} changed state through the supervised engine contract.` : "Mission Control recorded this workspace transition.")}</p>{event.operation && <code>operation · {event.operation}</code>}</div><span className="timeline-kind">{eventKind === "risk" ? "Risk" : eventKind === "evidence" ? "Evidence" : eventKind === "worker" ? "Worker" : "System"}</span></article>; }) : <EmptyState title="No matching history" detail={query || actorFilter !== "all" ? "Try a broader search or another filter." : "Keep working to create new project memory."}/>}</div>
      {selected && <aside className="history-evidence"><header><span className="section-kicker">RECORDED EVIDENCE</span><strong>Event #{selected.sequence}</strong><small>{new Date(selected.timestamp).toLocaleString()}</small></header><div className={`history-evidence__status ${/failed|error|attention/i.test(String(selected.type)) ? "is-risk" : ""}`}><i/><span><small>EVENT TYPE</small><strong>{eventTitle(selected)}</strong></span></div>{selectedChapter && <section className={`history-chapter-context is-${selectedChapter.state}`}><span>RUN CHAPTER · {selectedChapter.state}</span><strong>{selectedChapter.summary}</strong><small>{selectedChapter.relationships?.[0]?.basis || "Events share an engine-issued run correlation."}</small></section>}<dl><div><dt>Actor</dt><dd>{actorFor(selected)}</dd></div>{selected.operation && <div><dt>Operation</dt><dd>{selected.operation}</dd></div>}{selected.reason && <div><dt>Recorded reason</dt><dd>{selected.reason}</dd></div>}{selected.status && <div><dt>State</dt><dd>{selected.status}</dd></div>}{Number.isInteger(selected.exitCode) && <div><dt>Exit code</dt><dd>{selected.exitCode}</dd></div>}<div><dt>Correlation</dt><dd>{selected.correlationId || "Not provided by engine"}</dd></div></dl><p>This panel displays recorded event fields. Cross-run relationships require the same worker and later recorded evidence.</p></aside>}
    </div>
  </div>;
}

function SettingChoice({ label, detail, value, options, onChange }) {
  return <div className="setting-control"><div><strong>{label}</strong><p>{detail}</p></div><div className="segmented-control">{options.map(option => <button key={option.value} className={value === option.value ? "is-selected" : ""} onClick={() => onChange(option.value)}>{option.label}</button>)}</div></div>;
}

function IntegrationsView() {
  const [integrations, setIntegrations] = React.useState([]);
  const [selectedId, setSelectedId] = React.useState(null);
  React.useEffect(() => { missionApi().request("integration.list").then(setIntegrations).catch(() => setIntegrations([])); }, []);
  const selected = integrations.find(item => item.id === selectedId) || integrations[0];
  return <div className="integrations-view"><header className="integrations-hero"><div><span className="section-kicker">INTEGRATION HUB</span><h2>Connect tools without surrendering control</h2><p>Every bridge declares its capability, permission boundary, and readiness before it can touch the active project.</p></div><div className="integration-score"><span><strong>{integrations.filter(item => item.status === "available").length}</strong><small>AVAILABLE</small></span><span><strong>{integrations.filter(item => item.status === "foundation").length}</strong><small>FOUNDATION</small></span><span><strong>{integrations.filter(item => item.status === "planned").length}</strong><small>PLANNED</small></span></div></header><div className="integration-layout"><section><div className="integration-section-head"><div><span className="section-kicker">CAPABILITY REGISTRY</span><strong>Engine-reported integrations</strong></div><small>No credentials are stored in the renderer</small></div><div className="integration-grid">{integrations.map(item => <button key={item.id} className={`${selected?.id === item.id ? "is-selected" : ""} status-${item.status}`} onClick={() => setSelectedId(item.id)}><span className="integration-mark">{item.name.slice(0,2).toUpperCase()}</span><span><small>{item.status}</small><strong>{item.name}</strong><p>{item.capability}</p></span><b>{item.blockedReason ? "Blocked" : item.enabled ? "Connected" : "Inspect"}</b></button>)}</div></section>{selected && <aside className="integration-inspector"><span className={`integration-state status-${selected.status}`}>{selected.status}</span><h3>{selected.name}</h3><p>{selected.capability}</p><dl><div><dt>Permission boundary</dt><dd>{selected.permission}</dd></div><div><dt>Project scope</dt><dd>{selected.projectRequired ? "Active project only" : "Application level"}</dd></div><div><dt>Connection</dt><dd>{selected.enabled ? "Connected" : "Not connected"}</dd></div></dl>{selected.blockedReason ? <div className="integration-blocked">{selected.blockedReason}</div> : <button disabled={selected.status !== "available"}>{selected.status === "available" ? "Configure bridge" : "Not yet connectable"}</button>}<small>Secrets must enter through the main-process credential boundary, never UI source or project history.</small></aside>}</div></div>;
}

function NotificationSettings() {
  const defaults = { minimumSeverity: "info", desktopNotifications: true, quietHours: { enabled: false, start: "22:00", end: "07:00" } };
  const [policy, setPolicy] = React.useState(defaults);
  React.useEffect(() => { missionApi().request("attention.list").then(value => setPolicy(value?.preferences || defaults)).catch(() => {}); }, []);
  const save = async next => { setPolicy(next); await missionApi().request("attention.preferences.save", { preferences: next }); };
  return <section className="settings-panel settings-panel-wide notification-settings pm-card"><div className="settings-panel__head"><Icon name="attention"/><div><h3>Attention & notifications</h3><p>Control when Mission Control interrupts you. Needs You remains focused only on decisions.</p></div></div><div className="attention-policy"><div className="severity-choice"><span>Notify from</span><div>{[["info","All"],["warning","Warning"],["critical","Critical"]].map(([value,label]) => <button key={value} className={policy.minimumSeverity === value ? "is-current" : ""} onClick={() => void save({ ...policy, minimumSeverity: value })}>{label}</button>)}</div></div><label className="terminal-toggle-card"><span><strong>Desktop notifications</strong><small>Show a native notification when policy allows interruption.</small></span><span className="pm-toggle"><input type="checkbox" checked={policy.desktopNotifications} onChange={event => void save({ ...policy, desktopNotifications: event.target.checked })}/><i className="pm-toggle-track"><b className="pm-toggle-thumb"/></i></span></label><label className="terminal-toggle-card"><span><strong>Quiet hours</strong><small>Keep native notifications silent during the configured window.</small></span><span className="pm-toggle"><input type="checkbox" checked={policy.quietHours.enabled} onChange={event => void save({ ...policy, quietHours: { ...policy.quietHours, enabled: event.target.checked } })}/><i className="pm-toggle-track"><b className="pm-toggle-thumb"/></i></span></label><label className="quiet-hours"><input type="time" value={policy.quietHours.start} onChange={event => setPolicy(current => ({ ...current, quietHours: { ...current.quietHours, start: event.target.value } }))} onBlur={() => void save(policy)}/><span>to</span><input type="time" value={policy.quietHours.end} onChange={event => setPolicy(current => ({ ...current, quietHours: { ...current.quietHours, end: event.target.value } }))} onBlur={() => void save(policy)}/></label></div></section>;
}

function VSCodeBridgeSettings({ workspace }) {
  const [status, setStatus] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [terminalName, setTerminalName] = React.useState("Mission Control");
  const [terminalCwd, setTerminalCwd] = React.useState(".");
  const [terminalInputs, setTerminalInputs] = React.useState({});
  const refresh = React.useCallback(() => missionApi().request("vscode.status").then(setStatus).catch(error => setMessage(error.message || String(error))), []);
  React.useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    missionApi().request("vscode.status").then(value => { if (active) setStatus(value); }).catch(error => { if (active) setMessage(error.message || String(error)); });
    try {
      unsubscribe = missionApi().subscribe(notification => {
        if (notification?.type === "integration:event" && notification.integration === "vscode" && active) setStatus(notification.status);
      });
    } catch { /* The request above remains the authoritative fallback. */ }
    return () => { active = false; unsubscribe?.(); };
  }, [workspace?.path]);
  const run = async (operation, method, params = {}, successMessage = "Command confirmed by VS Code.") => {
    setBusy(operation);
    setMessage("");
    try {
      const result = await missionApi().request(method, params);
      if (result?.status) setStatus(result.status);
      else await refresh();
      setMessage(operation === "launch" ? "Secure invitation sent to VS Code. Waiting for the extension handshake." : operation === "disconnect" ? "VS Code Bridge disconnected." : successMessage);
      return true;
    } catch (error) { setMessage(error.message || String(error)); }
    finally { setBusy(""); }
    return false;
  };
  const editor = status?.editor;
  const diagnostics = status?.diagnostics || {};
  const git = status?.git;
  const terminals = status?.terminals || [];
  const managedTerminals = terminals.filter(terminal => terminal.ownership === "mission-control-managed");
  const observedTerminals = terminals.filter(terminal => terminal.ownership !== "mission-control-managed");
  const connected = status?.connected === true;
  const stateLabel = connected ? "Connected" : status?.awaitingHandshake ? "Waiting for VS Code" : status?.lastError ? "Needs review" : "Ready to connect";
  return <section className={`settings-panel settings-panel-wide vscode-bridge-settings pm-card pm-card--feat-vscode ${connected ? "is-connected" : ""}`}>
    <header><div className="settings-panel__head"><span className="vscode-mark">⌁</span><div><h3>VS Code Bridge</h3><p>Observe VS Code-owned terminals and explicitly control only Mission Control-managed terminals.</p></div></div><div className={`vscode-connection ${connected ? "is-live" : status?.awaitingHandshake ? "is-waiting" : ""}`}><i/><span><small>EDITOR CONNECTION</small><strong>{stateLabel}</strong></span></div></header>
    {!connected && <ol className="vscode-setup-steps" aria-label="VS Code Bridge setup"><li className="is-ready"><b>1</b><span><strong>Open a persistent project</strong><small>{workspace?.persistent ? "Ready" : "Choose a project folder first"}</small></span></li><li><b>2</b><span><strong>Install the included extension</strong><small>Use integrations/vscode from this release</small></span></li><li className={status?.awaitingHandshake ? "is-active" : ""}><b>3</b><span><strong>Send a one-time invitation</strong><small>VS Code verifies the same project before connecting</small></span></li></ol>}
    <div className="vscode-bridge-body"><div className="vscode-sync-summary"><div><span>ACTIVE FILE</span><strong title={editor?.relativePath || ""}>{editor?.relativePath || "No editor context yet"}</strong><small>{editor ? `Line ${editor.line}:${editor.column}${editor.dirty ? " · unsaved" : " · saved"}` : "Project-relative paths only"}</small></div><div className={diagnostics.errors ? "has-risk" : ""}><span>PROBLEMS</span><strong>{diagnostics.errors || 0} errors · {diagnostics.warnings || 0} warnings</strong><small>{diagnostics.items?.length || 0} bounded records synchronized</small></div><div><span>SOURCE CONTROL</span><strong>{git?.branch || "Waiting for Git state"}</strong><small>{git ? `${git.changedPaths} changed · ${git.ahead} ahead · ${git.behind} behind` : "Aggregate state only"}</small></div><div><span>EDITOR TERMINALS</span><strong>{managedTerminals.length} managed · {observedTerminals.length} observed</strong><small>Activity metadata only · raw output never crosses the bridge</small></div></div><aside><span>OWNERSHIP BOUNDARY</span><ul><li>VS Code-owned terminals are observe-only</li><li>Managed terminals are created explicitly below</li><li>Every input and close operation requires approval</li><li>Secrets and multi-line input are blocked</li></ul><small>One-time invitation · same-project handshake · no arbitrary paths</small></aside></div>
    {connected && <div className="vscode-terminal-control"><div className="vscode-terminal-create"><div><span>NEW MANAGED TERMINAL</span><small>Created inside this project and labeled as Mission Control-managed.</small></div><input aria-label="Managed terminal name" value={terminalName} maxLength={80} onChange={event => setTerminalName(event.target.value)} placeholder="Terminal name"/><input aria-label="Managed terminal working directory" value={terminalCwd} maxLength={240} onChange={event => setTerminalCwd(event.target.value)} placeholder="Project-relative cwd"/><button className="vscode-connect" disabled={Boolean(busy) || !terminalName.trim()} onClick={() => run("create-terminal", "vscode.terminal.create", { name: terminalName, cwd: terminalCwd, confirmation: "confirm:vscode.terminal.create" }, "Managed terminal created in VS Code.")}>{busy === "create-terminal" ? "Creating…" : "Approve & create"}</button></div>
      <div className="vscode-terminal-list">{terminals.length === 0 ? <div className="vscode-terminal-empty"><strong>No editor terminals reported</strong><small>Open one in VS Code or create a managed terminal above.</small></div> : terminals.map(terminal => <article key={terminal.id} className={terminal.controllable ? "is-managed" : "is-observed"}><div className="vscode-terminal-main"><span className="vscode-terminal-owner">{terminal.controllable ? "MANAGED" : "VS CODE-OWNED"}</span><strong>{terminal.name}</strong><small>{terminal.currentCommand || (terminal.shellIntegration ? "Shell ready; no active command" : "Shell activity unavailable")}{terminal.cwd ? ` · ${terminal.cwd}` : ""}</small></div><span className={`vscode-terminal-state is-${terminal.commandState || "idle"}`}>{terminal.active ? "ACTIVE · " : ""}{terminal.commandState || "idle"}</span>{terminal.controllable && <div className="vscode-terminal-actions"><button disabled={Boolean(busy)} onClick={() => run(`focus:${terminal.id}`, "vscode.terminal.focus", { terminalId: terminal.id }, "Managed terminal focused in VS Code.")}>Focus</button><input aria-label={`Command for ${terminal.name}`} value={terminalInputs[terminal.id] || ""} maxLength={4096} onChange={event => setTerminalInputs(current => ({ ...current, [terminal.id]: event.target.value }))} placeholder="One command; secrets blocked"/><button disabled={Boolean(busy) || !(terminalInputs[terminal.id] || "").trim()} onClick={async () => { const sent = await run(`write:${terminal.id}`, "vscode.terminal.write", { terminalId: terminal.id, input: terminalInputs[terminal.id], confirmation: `confirm:vscode.terminal.write:${terminal.id}` }, "Approved command sent to the managed terminal."); if (sent) setTerminalInputs(current => ({ ...current, [terminal.id]: "" })); }}>Approve & send</button><button className="vscode-disconnect" disabled={Boolean(busy)} onClick={() => run(`close:${terminal.id}`, "vscode.terminal.close", { terminalId: terminal.id, confirmation: `confirm:vscode.terminal.close:${terminal.id}` }, "Managed terminal closed.")}>Approve & close</button></div>}</article>)}</div>
    </div>}
    {message && <p className={status?.lastError ? "is-error" : ""} role="status">{message}</p>}
    <footer><span>{status?.lastSyncAt ? `Last synchronized ${timeAgo(status.lastSyncAt)} ago` : workspace?.persistent ? "Install the included extension, then connect this project." : "Open a persistent project to enable the bridge."}</span><div>{connected && editor && <button disabled={Boolean(busy)} onClick={() => run("file", "vscode.openFile", { relativePath: editor.relativePath, line: editor.line, column: editor.column })}>Open active file</button>}{connected && <button disabled={Boolean(busy)} onClick={() => run("problems", "vscode.openProblems")}>Open Problems</button>}{connected ? <button className="vscode-disconnect" disabled={Boolean(busy)} onClick={() => run("disconnect", "vscode.disconnect")}>{busy === "disconnect" ? "Disconnecting…" : "Disconnect"}</button> : <button className="vscode-connect" disabled={!workspace?.persistent || Boolean(busy)} onClick={() => run("launch", "vscode.launch")}>{busy === "launch" ? "Opening VS Code…" : status?.awaitingHandshake ? "Send new invitation" : "Connect VS Code"}</button>}</div></footer>
  </section>;
}

function ResourceLinks() {
  const open = url => window.missionControl?.openExternal?.(url);
  return <section className="settings-panel settings-resources"><div className="settings-panel__head"><Icon name="command"/><div><h3>Resources</h3><p>Accessible primitives used by this renderer.</p></div></div><Popover.Root><Tooltip.Provider delayDuration={350}><Tooltip.Root><Tooltip.Trigger asChild><Popover.Trigger asChild><button className="resources-trigger">Component resources <span>↗</span></button></Popover.Trigger></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="radix-tooltip" sideOffset={7}>Open implementation references</Tooltip.Content></Tooltip.Portal></Tooltip.Root></Tooltip.Provider><Popover.Portal><Popover.Content className="resources-popover" side="top" align="start" sideOffset={8}><strong>Renderer primitives</strong><button onClick={() => void open("https://github.com/radix-ui/primitives")}>Radix UI Primitives <span>↗</span></button><button onClick={() => void open("https://github.com/pacocoursey/cmdk")}>cmdk <span>↗</span></button><Popover.Arrow className="resources-arrow"/></Popover.Content></Popover.Portal></Popover.Root></section>;
}

function SettingsView({ state, workspace, recovery, preferences, onPreference, onReset }) {
  return <div className="settings-view"><header className="settings-hero pm-page-hero"><span className="section-kicker">GENERAL</span><h2>Interface and terminal</h2><p>Preferences stay on this device. Engine configuration, credentials, and PTY ownership remain untouched.</p></header><div className="settings-grid"><section className="settings-panel pm-card"><div className="settings-panel__head"><Icon name="pulse"/><div><h3>Operational facts</h3><p>Current state from the protected engine boundary.</p></div></div><div className="settings-rows"><div><span>Engine contract</span><strong>Protocol v{state?.contractVersion || "—"}</strong></div><div><span>Workspace mode</span><strong>{workspace?.persistent ? "Persistent" : "In memory"}</strong></div><div><span>Recovery controller</span><strong>{recovery?.phase || "Ready"}</strong></div><div><span>Keyboard navigation</span><strong>Ctrl K · F1 · Escape</strong></div></div></section><section className="settings-panel pm-card"><div className="settings-panel__head"><Icon name="settings"/><div><h3>Appearance and accessibility</h3><p>Choose a calm visual system for long development sessions.</p></div></div><SettingChoice label="Theme" detail="Orbital Dark, a daylight surface, or maximum contrast." value={preferences.theme} options={[{value:"orbital",label:"Orbital Dark"},{value:"solar",label:"Solar Light"},{value:"contrast",label:"High contrast"}]} onChange={value => onPreference("theme", value)}/><SettingChoice label="Text size" detail="Scale interface typography without changing terminal output." value={preferences.typeScale} options={[{value:"compact",label:"Compact"},{value:"comfortable",label:"Default"},{value:"large",label:"Large"}]} onChange={value => onPreference("typeScale", value)}/><SettingChoice label="Interface density" detail="Choose how much breathing room controls and rows use." value={preferences.density} options={[{value:"compact",label:"Compact"},{value:"comfortable",label:"Comfortable"},{value:"spacious",label:"Spacious"}]} onChange={value => onPreference("density", value)}/><SettingChoice label="Motion" detail="Reduce transitions while keeping state changes clear." value={preferences.motion} options={[{value:"full",label:"Full"},{value:"reduced",label:"Reduced"}]} onChange={value => onPreference("motion", value)}/></section><section className="settings-panel settings-panel-wide pm-card"><div className="settings-panel__head"><Icon name="terminal"/><div><h3>Terminal experience</h3><p>Readable monospace tuned independently from the application UI.</p></div></div><div className="terminal-size-control"><div><strong>Terminal font size</strong><p>Applied to every mounted terminal pane.</p></div><input type="range" min="11" max="18" step="1" value={preferences.terminalFontSize} onChange={event => onPreference("terminalFontSize", Number(event.target.value))}/><output>{preferences.terminalFontSize}px</output></div><SettingChoice label="Terminal theme" detail="Independent from the surrounding application theme." value={preferences.terminalTheme} options={[{value:"orbital",label:"Orbital"},{value:"solar",label:"Solar"},{value:"contrast",label:"Contrast"}]} onChange={value => onPreference("terminalTheme", value)}/><SettingChoice label="Cursor" detail="Choose a visible cursor shape for interactive shells." value={preferences.terminalCursor} options={[{value:"bar",label:"Bar"},{value:"block",label:"Block"},{value:"underline",label:"Underline"}]} onChange={value => onPreference("terminalCursor", value)}/><SettingChoice label="Scrollback" detail="Bounded terminal history retained by each mounted pane." value={preferences.terminalScrollback} options={[{value:1000,label:"1,000"},{value:5000,label:"5,000"},{value:20000,label:"20,000"}]} onChange={value => onPreference("terminalScrollback", value)}/><label className="terminal-toggle-card"><span><strong>Show command hints</strong><small>Display exact CLI and worker commands in operational surfaces.</small></span><span className="pm-toggle"><input type="checkbox" checked={preferences.showCommandHints} onChange={event => onPreference("showCommandHints", event.target.checked)}/><i className="pm-toggle-track"><b className="pm-toggle-thumb"/></i></span></label></section></div><footer className="settings-footer"><span>Preferences are local to this device.</span><button className="btn-ghost" onClick={onReset}>Restore defaults</button></footer></div>;
}

// Settings now holds only application preferences. Every connected-capability
// panel (Mission AI, VS Code, MCP, Automation, Mobile, Plugins) lives in the
// Integrations tab instead — see IntegrationHubView in IntegrationsView.jsx.
function SettingsHub({ state, workspace, recovery, preferences, onPreference, onReset, onOpenIntegrations }) {
  return <div className="settings-hub feat-general application-settings-view">
    <header className="settings-hub__header pm-page-hero feat-general"><div><span className="section-kicker">MISSION CONTROL SETTINGS</span><h1>Settings</h1><p>Application preferences for this device. Connected tools and bridges live in Integrations.</p></div></header>
    <div className="settings-hub__layout settings-hub__layout-single">
      <SettingsView state={state} workspace={workspace} recovery={recovery} preferences={preferences} onPreference={onPreference} onReset={onReset}/>
      <NotificationSettings/>
      <ResourceLinks/>
      <button type="button" className="settings-integrations-link" onClick={onOpenIntegrations}><span><strong>Integrations</strong><small>Mission AI, VS Code, MCP Gateway, Automation, Mobile Companion and Plugins</small></span><b aria-hidden="true">→</b></button>
    </div>
  </div>;
}

function AppSidebar({ view, workspace, pendingCount, onNavigate, onProject, onPalette, onMissionAI }) {
  const projectMark = String(workspace?.name || "P").trim().slice(0, 2).toUpperCase();
  const renderNavButton = ([id, label, icon]) => <button key={id} data-tooltip={`${label} · ${NAV_SHORTCUTS[id] || "Open"}`} aria-label={label} aria-current={view === id ? "page" : undefined} className={view === id ? "is-current" : ""} onClick={() => onNavigate(id)} title={`${label} · ${NAV_SHORTCUTS[id]}`}><Icon name={icon} size={17}/><span>{label}</span>{id === "needs" && pendingCount > 0 && <b aria-label={`${pendingCount} items need attention`}>{pendingCount}</b>}</button>;
  return <aside className="app-sidebar" aria-label="Application sidebar">
    <div className="app-sidebar__brand"><button className="top-brand" onClick={() => onNavigate("groundstation")} aria-label="Open Groundstation"><span>MC</span></button><div><strong>Mission Control</strong><small>Developer cockpit</small></div></div>
    <button className="top-project" data-tooltip={`Switch project · ${workspace?.name || "none"}`} onClick={onProject} aria-label={`Switch project. Current project: ${workspace?.name || "none"}`}><span className="top-project__mark" aria-hidden="true">{projectMark}</span><div><small>Project:</small><strong>{workspace?.name || "Choose project"}</strong></div><i aria-hidden="true">⌄</i></button>
    <nav className="top-navigation" aria-label="Mission Control navigation">
      {NAVIGATION.slice(0, PRIMARY_NAV_COUNT).map(destination => renderNavButton(destination))}
      <div className="top-navigation__contextual" role="group" aria-label="Configuration">
        {NAVIGATION.slice(PRIMARY_NAV_COUNT).map(destination => renderNavButton(destination))}
      </div>
    </nav>
    <div className="app-sidebar__footer"><button className="top-search" data-tooltip="Mission Command · Ctrl K" onClick={onPalette} aria-label="Search or run a command"><Icon name="search" size={16}/><span>Search commands</span><kbd>Ctrl+K</kbd></button><button className={`top-ai ${view === "mission-ai" ? "is-current" : ""}`} data-tooltip="Mission AI" onClick={onMissionAI} aria-label="Open Mission AI"><span>AI</span><strong>Mission AI</strong></button><span className="app-sidebar__rail-label" aria-hidden="true">MISSION CONTROL</span></div>
  </aside>;
}

function CommandPalette({ open, query, onQuery, items, onChoose, onClose }) {
  const [recentIds, setRecentIds] = React.useState(() => { try { const value = JSON.parse(localStorage.getItem(COMMAND_RECENTS_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } });
  const ordered = [...items].sort((left, right) => recentIds.indexOf(left.id) - recentIds.indexOf(right.id));
  const choose = item => { const next = [item.id, ...recentIds.filter(id => id !== item.id)].slice(0,8); setRecentIds(next); try { localStorage.setItem(COMMAND_RECENTS_KEY, JSON.stringify(next)); } catch { /* Command recents are local best effort. */ } onChoose(item); };
  return <Dialog.Root open={open} onOpenChange={value => !value && onClose()}><Dialog.Portal><Dialog.Overlay className="palette-backdrop"/><Dialog.Content className="command-palette" aria-label="Mission Command" aria-describedby={undefined}><Command value={query} onValueChange={onQuery} loop><div className="palette-search"><Icon name="search" size={19}/><Command.Input autoFocus value={query} onValueChange={onQuery} placeholder="Search commands, workers, history, projects…"/><kbd>esc</kbd></div><div className="palette-label">{query ? "BEST MATCHES" : recentIds.length ? "RECENT & AVAILABLE" : "MISSION COMMAND"}</div><Command.List className="palette-results"><Command.Empty className="palette-empty"><strong>No matching command</strong><span>Try a worker name, action, project, or history term.</span></Command.Empty>{ordered.map(item => <Command.Item key={item.id} value={`${item.label} ${(item.aliases || []).join(" ")} ${item.group}`} onSelect={() => choose(item)}><span className="palette-icon"><Icon name={item.icon || "command"} size={16}/></span><span><strong>{item.label}</strong><small>{item.group}{recentIds.includes(item.id) ? " · Recent" : ""}</small></span>{item.shortcut && <kbd>{item.shortcut}</kbd>}</Command.Item>)}</Command.List><footer><span><b>↑↓</b> navigate</span><span><b>↵</b> open</span><span>Fuzzy search · Engine-safe actions only</span></footer></Command></Dialog.Content></Dialog.Portal></Dialog.Root>;
}

function ConfirmationDialog({ request, onCancel, onConfirm }) {
  if (!request) return null;
  return <AlertDialog.Root open onOpenChange={value => !value && onCancel()}><AlertDialog.Portal><AlertDialog.Overlay className="palette-backdrop confirmation-backdrop"/><AlertDialog.Content className="confirmation-dialog"><span className="confirmation-mark">!</span><div><span className="section-kicker">CONFIRM OPERATION</span><AlertDialog.Title id="confirmation-title">{request.title}</AlertDialog.Title><AlertDialog.Description id="confirmation-detail">{request.detail}</AlertDialog.Description><small>{request.recovery}</small></div><footer><AlertDialog.Cancel asChild><button>Cancel</button></AlertDialog.Cancel><AlertDialog.Action asChild><button className="danger-confirm" onClick={onConfirm}>{request.confirmLabel}</button></AlertDialog.Action></footer></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>;
}

export default function App() {
  const { state, loading, error, recovery, refresh } = useMissionState();
  const [view, setView] = React.useState("groundstation");
  const [focusedTerminal, setFocusedTerminal] = React.useState(null);
  const [expandedTerminal, setExpandedTerminal] = React.useState(null);
  const [selectedWorker, setSelectedWorker] = React.useState(null);
  const [workerFocusId, setWorkerFocusId] = React.useState(null);
  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [workerDialog, setWorkerDialog] = React.useState(null);
  const [pendingWorkspaceWorker, setPendingWorkspaceWorker] = React.useState(null);
  const [agentAdapters, setAgentAdapters] = React.useState([]);
  const [agentsLoading, setAgentsLoading] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [paletteQuery, setPaletteQuery] = React.useState("");
  const [projects, setProjects] = React.useState(null);
  const [projectsLoading, setProjectsLoading] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState(null);
  const [quickLookId, setQuickLookId] = React.useState(null);
  const [recipesOpen, setRecipesOpen] = React.useState(false);
  const [missionGraphOpen, setMissionGraphOpen] = React.useState(false);
  const [missionAiPrompt, setMissionAiPrompt] = React.useState("");
  const missionAiReturnView = React.useRef("groundstation");
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [integrationSection, setIntegrationSection] = React.useState("overview");
  const [supervisorPendingCount, setSupervisorPendingCount] = React.useState(0);
  const [mcpPendingCount, setMcpPendingCount] = React.useState(0);
  const [missionPendingCount, setMissionPendingCount] = React.useState(0);
  const [automationPendingCount, setAutomationPendingCount] = React.useState(0);
  const [mobilePendingCount, setMobilePendingCount] = React.useState(0);
  const [pluginPendingCount, setPluginPendingCount] = React.useState(0);
  const [terminalAlerts, setTerminalAlerts] = React.useState({});
  const initialProjectPrompted = React.useRef(false);
  const mainContentRef = React.useRef(null);
  const previousViewRef = React.useRef(view);
  const [historyCursors, setHistoryCursors] = React.useState(() => { try { const value = JSON.parse(localStorage.getItem(HISTORY_CURSOR_KEY) || "{}"); return value && typeof value === "object" ? value : {}; } catch { return {}; } });
  const sessions = state?.sessions || [];
  const workspace = state?.workspace || null;
  const activity = state?.activity?.events || [];
  const savedCommands = state?.savedCommands || [];
  const reportTerminalAlert = React.useCallback((sessionId, reason) => {
    const id = String(sessionId || "");
    const message = String(reason || "Terminal connection failed").trim().slice(0, 240);
    if (!id || !message) return;
    setTerminalAlerts(current => current[id]?.reason === message ? current : { ...current, [id]: { reason: message, at: Date.now() } });
  }, []);
  const dismissTerminalAlert = React.useCallback(sessionId => {
    setTerminalAlerts(current => {
      if (!current[sessionId]) return current;
      const next = { ...current };
      delete next[sessionId];
      return next;
    });
  }, []);
  const supervisedSessions = React.useMemo(() => sessions.map(session => {
    const alert = terminalAlerts[session.id];
    if (!alert || needsAttention(session)) return session;
    return { ...session, attentionRequired: true, attentionReason: alert.reason, attentionSince: alert.at, rendererAttention: true };
  }), [sessions, terminalAlerts]);
  const attention = supervisedSessions.filter(needsAttention);
  const selectedSession = supervisedSessions.find(item => item.id === selectedWorker) || null;
  const health = healthFor(supervisedSessions, workspace);
  const historyProjectKey = workspace?.root || workspace?.name || "default";
  const recipeProjectKey = workspace?.path || workspace?.root || workspace?.name || "default";
  const latestActivitySequence = activity.at(-1)?.sequence || 0;
  const historyCursor = historyCursors[historyProjectKey];
  const unseenActivity = historyCursor === undefined ? [] : activity.filter(event => event.sequence > historyCursor);
  const terminalLayout = useTerminalLayout(workspace, sessions);
  const { preferences, update: updatePreference, reset: resetPreferences } = useInterfacePreferences();
  const missionAiOpen = view === "mission-ai";
  const openMissionAI = React.useCallback((prompt = "") => {
    if (view !== "mission-ai") missionAiReturnView.current = view;
    setMissionAiPrompt(prompt);
    setView("mission-ai");
  }, [view]);
  const closeMissionAI = React.useCallback(() => {
    setMissionAiPrompt("");
    setView(missionAiReturnView.current === "mission-ai" ? "groundstation" : missionAiReturnView.current);
  }, []);

  React.useEffect(() => { if (!selectedWorker && sessions[0]) setSelectedWorker(sessions[0].id); }, [selectedWorker, sessions]);
  React.useEffect(() => {
    if (previousViewRef.current === view) return undefined;
    previousViewRef.current = view;
    const frame = window.requestAnimationFrame(() => mainContentRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [view]);
  React.useEffect(() => {
    let active = true;
    missionApi().request("missionSupervisor.status").then(status => {
      if (active) setSupervisorPendingCount(Number(status?.pendingApprovalCount) || 0);
    }).catch(() => { if (active) setSupervisorPendingCount(0); });
    return () => { active = false; };
  }, [workspace?.path, latestActivitySequence, missionAiOpen]);
  React.useEffect(() => {
    if (!pendingWorkspaceWorker || !sessions.some(session => session.id === pendingWorkspaceWorker)) return;
    const emptySlot = terminalLayout.sessionIds.findIndex(id => !id);
    terminalLayout.setSlotSession(emptySlot >= 0 ? emptySlot : 0, pendingWorkspaceWorker);
    setFocusedTerminal(pendingWorkspaceWorker);
    setSelectedWorker(pendingWorkspaceWorker);
    setView("workspace");
    setPendingWorkspaceWorker(null);
  }, [pendingWorkspaceWorker, sessions, terminalLayout]);
  React.useEffect(() => {
    if (!state || initialProjectPrompted.current) return;
    initialProjectPrompted.current = true;
    if (!workspace?.persistent) setView("projects");
  }, [state, workspace?.persistent]);
  const markHistoryReviewed = React.useCallback(() => { setHistoryCursors(current => { const next = { ...current, [historyProjectKey]: latestActivitySequence }; try { localStorage.setItem(HISTORY_CURSOR_KEY, JSON.stringify(next)); } catch { /* Review cursors are local best effort. */ } return next; }); }, [historyProjectKey, latestActivitySequence]);
  React.useEffect(() => { if (historyCursor === undefined && state) markHistoryReviewed(); }, [historyCursor, markHistoryReviewed, state]);
  React.useEffect(() => { if (view === "history" && historyCursor !== undefined && latestActivitySequence > historyCursor) markHistoryReviewed(); }, [historyCursor, latestActivitySequence, markHistoryReviewed, view]);
  React.useEffect(() => { const onKey = event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); if (!missionAiOpen) setPaletteOpen(value => !value); } else if (event.key === "Escape") { if (helpOpen) setHelpOpen(false); else if (paletteOpen) setPaletteOpen(false); else if (missionAiOpen) closeMissionAI(); else if (missionGraphOpen) setMissionGraphOpen(false); else if (workerFocusId) setWorkerFocusId(null); else if (expandedTerminal) setExpandedTerminal(null); else if (inspectorOpen) setInspectorOpen(false); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [closeMissionAI, expandedTerminal, helpOpen, inspectorOpen, missionAiOpen, missionGraphOpen, paletteOpen, workerFocusId]);
  React.useEffect(() => { const editable = target => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable; const onKey = event => { if (editable(event.target) || paletteOpen || missionAiOpen || missionGraphOpen) return; if (event.key === "F1" || (event.key === "?" && !event.ctrlKey && !event.metaKey && !event.altKey)) { event.preventDefault(); setHelpOpen(true); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [missionAiOpen, missionGraphOpen, paletteOpen]);
  React.useEffect(() => { const onKey = event => { if (paletteOpen || missionAiOpen || missionGraphOpen || confirmation || workerDialog) return; if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") { event.preventDefault(); setWorkerDialog({ mode: "create" }); return; } if (!event.altKey) return; const destination = { g: "groundstation", w: "workspace", r: "recipes", n: "needs", a: "agents", h: "history", i: "integrations" }[event.key.toLowerCase()]; if (destination) { event.preventDefault(); if (destination === "integrations") setIntegrationSection("overview"); setView(destination); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [confirmation, missionAiOpen, missionGraphOpen, paletteOpen, workerDialog]);
  React.useEffect(() => { const onKey = event => { if (view !== "workspace" || paletteOpen || missionAiOpen || missionGraphOpen || !event.altKey || !/^[1-6]$/.test(event.key)) return; const id = terminalLayout.sessionIds[Number(event.key) - 1]; if (!id || !sessions.some(session => session.id === id)) return; event.preventDefault(); setFocusedTerminal(id); setSelectedWorker(id); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [missionAiOpen, missionGraphOpen, paletteOpen, sessions, terminalLayout.sessionIds, view]);
  // Directional pane movement and layout cycling. Alt is used throughout the
  // app for navigation, so these compose with the existing Alt 1–6 shortcuts
  // and never collide with terminal input (xterm sees no Alt+Arrow here).
  React.useEffect(() => {
    const onKey = event => {
      if (view !== "workspace" || paletteOpen || missionAiOpen || missionGraphOpen || confirmation || workerDialog || !event.altKey) return;
      const slots = terminalLayout.sessionIds;
      const columns = terminalLayout.layout.cols || 1;
      const current = slots.indexOf(focusedTerminal);
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key];
      if (step !== undefined) {
        const next = (current < 0 ? 0 : current) + step;
        const id = next >= 0 && next < slots.length ? slots[next] : null;
        if (!id || !sessions.some(session => session.id === id)) return;
        event.preventDefault();
        setFocusedTerminal(id);
        setSelectedWorker(id);
        return;
      }
      if (event.key.toLowerCase() === "l") {
        event.preventDefault();
        const order = TERMINAL_LAYOUTS.map(option => option.id);
        const index = order.indexOf(terminalLayout.layout.id);
        terminalLayout.setLayoutId(order[(index + (event.shiftKey ? order.length - 1 : 1)) % order.length]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmation, focusedTerminal, missionAiOpen, missionGraphOpen, paletteOpen, sessions, terminalLayout, view, workerDialog]);
  React.useEffect(() => { const editable = target => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable; const onDown = event => { if (event.code !== "Space" || event.repeat || editable(event.target) || view !== "groundstation" || paletteOpen || missionAiOpen || missionGraphOpen || confirmation || workerFocusId || !selectedWorker) return; event.preventDefault(); setQuickLookId(selectedWorker); }; const onUp = event => { if (event.code === "Space") setQuickLookId(null); }; window.addEventListener("keydown", onDown); window.addEventListener("keyup", onUp); return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); }; }, [confirmation, missionAiOpen, missionGraphOpen, paletteOpen, selectedWorker, view, workerFocusId]);
  React.useEffect(() => { if ((view === "agents" || paletteOpen) && !agentAdapters.length) { setAgentsLoading(true); missionApi().request("agents.list").then(value => setAgentAdapters(Array.isArray(value) ? value : [])).catch(value => setNotice(value.message || String(value))).finally(() => setAgentsLoading(false)); } }, [agentAdapters.length, paletteOpen, view]);
  React.useEffect(() => { if (view !== "projects") return; setProjectsLoading(true); missionApi().request("projects.list").then(setProjects).catch(value => setNotice(value.message || String(value))).finally(() => setProjectsLoading(false)); }, [view]);
  React.useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    const update = status => { if (active) setMcpPendingCount(Number(status?.pendingApprovalCount) || 0); };
    missionApi().request("mcp.status").then(update).catch(() => update(null));
    try { unsubscribe = missionApi().subscribe(notification => { if (notification?.type === "integration:event" && notification.integration === "mcp") update(notification.status); }); }
    catch { /* The explicit status request remains authoritative. */ }
    return () => { active = false; unsubscribe?.(); };
  }, [workspace?.path]);
  React.useEffect(() => {
    let active = true;
    missionApi().request("mission.approval.list").then(records => {
      if (active) setMissionPendingCount((records || []).filter(item => item.state === "pending").length);
    }).catch(() => { if (active) setMissionPendingCount(0); });
    return () => { active = false; };
  }, [workspace?.path, latestActivitySequence]);
  React.useEffect(() => {
    let active = true;
    missionApi().request("mobile.approval.list").then(records => {
      if (active) setMobilePendingCount((records || []).filter(item => item.state === "pending").length);
    }).catch(() => { if (active) setMobilePendingCount(0); });
    return () => { active = false; };
  }, [workspace?.path, latestActivitySequence]);
  React.useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    const update = status => { if (active) setPluginPendingCount(Number(status?.pendingApprovalCount) || 0); };
    missionApi().request("plugin.status").then(update).catch(() => update(null));
    try { unsubscribe = missionApi().subscribe(notification => { if (notification?.type === "integration:event" && notification.integration === "plugins") update(notification.status); }); } catch {}
    return () => { active = false; unsubscribe?.(); };
  }, [workspace?.path]);
  React.useEffect(() => {
    let active = true;
    missionApi().request("automation.list").then(result => {
      if (active) setAutomationPendingCount((result?.approvals || []).filter(item => item.state === "pending").length);
    }).catch(() => { if (active) setAutomationPendingCount(0); });
    return () => { active = false; };
  }, [workspace?.path, latestActivitySequence]);

  const executeAction = React.useCallback(async (type, id, fields = {}) => { setNotice(type === "acknowledge" ? "Acknowledging…" : "Working…"); try { const result = await missionApi().request("action.dispatch", { sessionId: id, action: { type, ...fields }, ...(["kill", "remove"].includes(type) ? { confirmation: `confirm:${type}:${id}` } : {}) }); if (result?.ok === false) throw new Error(result.error || "Action failed"); setNotice(type === "acknowledge" ? "Alert acknowledged; worker health is unchanged" : "Done"); await refresh(); } catch (value) { setNotice(value.message || String(value)); } }, [refresh]);
  const dispatch = React.useCallback(async (type, id, fields = {}) => { const target = sessions.find(item => item.id === id); if (["kill", "remove"].includes(type)) { setConfirmation({ title: type === "kill" ? `Stop ${target?.name || id}?` : `Remove ${target?.name || id}?`, detail: type === "kill" ? "The engine will stop this worker and its active PTY." : "The worker definition will be removed from this workspace.", recovery: type === "kill" ? "You can start this worker again later." : "Removal may require recreating the worker configuration.", confirmLabel: type === "kill" ? "Stop worker" : "Remove worker", run: () => executeAction(type, id, fields) }); return; } await executeAction(type, id, fields); }, [executeAction, sessions]);
  const executeBulk = React.useCallback(async (type, targets) => { if (!targets.length) return; setNotice(`${type === "start" ? "Starting" : "Stopping"} ${targets.length} workers…`); const results = await Promise.all(targets.map(async session => { try { await missionApi().request("action.dispatch", { sessionId: session.id, action: { type }, ...(type === "kill" ? { confirmation: `confirm:kill:${session.id}` } : {}) }); return null; } catch (error) { return `${session.name}: ${error.message || String(error)}`; } })); await refresh(); const failures = results.filter(Boolean); setNotice(failures.length ? `${targets.length - failures.length}/${targets.length} workers updated · ${failures[0]}` : `${targets.length} workers ${type === "start" ? "started" : "stopped"}`); }, [refresh]);
  const startWorkspace = React.useCallback(() => executeBulk("start", sessions.filter(session => !session.isAlive)), [executeBulk, sessions]);
  const stopWorkspace = React.useCallback(() => { const running = sessions.filter(session => session.isAlive); if (!running.length) return; setConfirmation({ title: `Stop ${running.length} running workers?`, detail: "Mission Control will request a clean stop for every active engine-owned PTY in this workspace.", recovery: "Workers remain configured and can be started together again.", confirmLabel: "Stop workspace", run: () => executeBulk("kill", running) }); }, [executeBulk, sessions]);
  const launchRecipe = React.useCallback(async (recipe, options = {}) => {
    terminalLayout.applyLayout({ layoutId: recipe.layoutId, sessionIds: recipe.sessionIds });
    setRecipesOpen(false);
    setView("workspace");
    setNotice(`Launching ${recipe.name} through the engine…`);
    try { await missionApi().request("recipe.run", { recipeId: recipe.id, recover: options.recover === true }); await refresh(); setNotice(options.recover ? `${recipe.name} recovery run started` : `${recipe.name} is running with parallel readiness gates`); }
    catch (error) { setNotice(error.message || String(error)); }
  }, [refresh, terminalLayout]);
  const focusWorker = React.useCallback(id => { setFocusedTerminal(id); setSelectedWorker(id); if (!terminalLayout.sessionIds.includes(id)) terminalLayout.setSlotSession(0, id); setView("workspace"); }, [terminalLayout]);
  const inspectWorker = React.useCallback(id => { setSelectedWorker(id); if (id.startsWith("agent-")) { setView("agents"); return; } setWorkerFocusId(id); }, []);
  const saveWorker = React.useCallback(async value => { const editing = workerDialog?.mode === "edit"; const result = await missionApi().request("action.dispatch", { sessionId: editing ? workerDialog.configuration.id : null, action: editing ? { type: "reconfigure", patch: value } : { type: "create", definition: value } }); if (result?.ok === false) throw new Error(result.error || "Worker save failed"); if (!editing) setPendingWorkspaceWorker(value.id); await refresh(); setNotice(editing ? "Worker updated" : `${value.name} added to the terminal workspace`); }, [refresh, workerDialog]);
  const instantiateSavedCommand = React.useCallback(async commandId => { await missionApi().request("action.dispatch", { sessionId: null, action: { type: "instantiateSavedCommand", commandId } }); await refresh(); }, [refresh]);
  const createAgent = React.useCallback(async adapterId => { let createdSessionId = null; setAgentsLoading(true); setNotice(`Checking ${adapterId} CLI…`); try { const result = await missionApi().request("agent.create", { adapterId }); if (!result?.sessionId) throw new Error("Agent worker was created without a session ID"); createdSessionId = result.sessionId; setSelectedWorker(createdSessionId); setNotice(`Starting ${adapterId}…`); const started = await missionApi().request("action.dispatch", { sessionId: createdSessionId, action: { type: "start" } }); if (started?.ok === false) throw new Error(started.error || "Agent CLI could not be started"); await refresh(); setNotice(`${adapterId} is running under Mission Control supervision`); } catch (value) { await refresh(); if (createdSessionId) setSelectedWorker(createdSessionId); setNotice(createdSessionId ? `${adapterId} was added but could not start: ${value.message || String(value)}` : value.message || String(value)); } finally { setAgentsLoading(false); } }, [refresh]);
  const executeProjectOpen = React.useCallback(async project => { setProjectsLoading(true); try { await missionApi().request("project.open", { projectId: project.id, confirmation: `confirm:project.open:${project.id}` }); await refresh(); setView("groundstation"); } catch (value) { setNotice(value.message || String(value)); } finally { setProjectsLoading(false); } }, [refresh]);
  const openProject = React.useCallback(async project => { setConfirmation({ title: `Switch to ${project.name}?`, detail: "Mission Control will safely stop running workers before changing projects.", recovery: "If the new project cannot open, the project coordinator will attempt recovery.", confirmLabel: "Switch project", run: () => executeProjectOpen(project) }); }, [executeProjectOpen]);
  const chooseProject = React.useCallback(async () => {
    setProjectsLoading(true);
    try {
      const selection = await missionApi().request("project.choose");
      if (selection?.cancelled) return;
      const token = selection.selectionToken;
      const project = selection.project;
      setNotice(`Opening ${project.name}…`);
      if (project.status === "uninitialized") {
        await missionApi().request("project.initialize", { selectionToken: token, name: project.name, confirmation: `confirm:project.initialize:${token}` });
      } else if (["ready", "warning"].includes(project.status)) {
        await missionApi().request("project.open", { selectionToken: token, confirmation: `confirm:project.open:${token}` });
      } else {
        throw new Error(project.error || "The selected folder cannot be opened as a project");
      }
      await refresh();
      setSelectedWorker(null);
      setFocusedTerminal(null);
      setView("groundstation");
      setNotice(`${project.name} is active · terminals and agents now use this folder`);
    } catch (value) { setNotice(value.message || String(value)); }
    finally { setProjectsLoading(false); }
  }, [refresh]);

  const paletteItems = React.useMemo(() => [
    ...NAVIGATION.map(([id,label,icon]) => ({ id: `nav-${id}`, label, group: "Navigate", icon, aliases: NAV_ALIASES[id] || [], run: () => { if (id === "integrations") setIntegrationSection("overview"); setView(id); } })),
    ...SECONDARY_DESTINATIONS.map(([id,label,icon]) => ({ id: `nav-${id}`, label, group: "Application", icon, aliases: NAV_ALIASES[id] || [], run: () => setView(id) })),
    ...(selectedSession ? [{ id: "context-open", label: selectedSession.id.startsWith("agent-") ? `Review ${selectedSession.name}` : `Inspect ${selectedSession.name}`, group: "Selected worker", icon: selectedSession.id.startsWith("agent-") ? "agents" : "terminal", aliases: ["focus","quick look","details","history","summary"], run: () => inspectWorker(selectedSession.id) }] : []),
    ...(selectedSession?.attentionRequired ? [{ id: "context-acknowledge", label: `Acknowledge ${selectedSession.name} alert`, group: "Selected worker", icon: "attention", run: () => dispatch("acknowledge", selectedSession.id) }] : []),
    { id: "new-worker", label: "Add a new worker", group: "Action", icon: "plus", shortcut: "N", run: () => setWorkerDialog({ mode: "create" }) },
    { id: "mission-ai", label: "Open Mission AI", group: "Project intelligence", icon: "agents", aliases: ["gemini","what is happening","what is broken","what needs me","summary"], run: () => openMissionAI() },
    { id: "settings-mcp", label: "Open Secure MCP Gateway", group: "Integrations", icon: "command", aliases: ["claude","chatgpt","external ai","token","gateway"], run: () => { setIntegrationSection("mcp"); setView("integrations"); } },
    { id: "settings-mobile", label: "Open Mobile Companion", group: "Integrations", icon: "attention", aliases: ["android","phone","pairing","lan"], run: () => { setIntegrationSection("companion"); setView("integrations"); } },
    { id: "mission-graph", label: "Open Mission Graph", group: "Workspace action", icon: "grid", aliases: ["dependencies","startup graph","relationships","impact"], run: () => setMissionGraphOpen(true) },
    { id: "workspace-recipes", label: "Open workspace recipes", group: "Workspace action", icon: "grid", aliases: ["saved layout","startup set","launch stack"], run: () => setView("recipes") },
    ...(sessions.some(item => !item.isAlive) ? [{ id: "start-workspace", label: "Start all idle workers", group: "Workspace action", icon: "play", aliases: ["launch","boot","daily workspace"], run: startWorkspace }] : []),
    ...(sessions.some(item => item.isAlive) ? [{ id: "stop-workspace", label: "Stop all running workers", group: "Workspace action", icon: "attention", aliases: ["pause","shutdown","stop workspace"], run: stopWorkspace }] : []),
    ...sessions.filter(item => item.isAlive).map(item => ({ id: `restart-${item.id}`, label: `Restart ${item.name}`, group: "Worker action", icon: "pulse", run: () => dispatch("restart", item.id) })),
    ...sessions.map(item => ({ id: `worker-${item.id}`, label: item.name, group: `${item.status} worker`, icon: "terminal", run: () => focusWorker(item.id) })),
    ...activity.slice(-5).reverse().map(item => ({ id: `event-${item.sequence}`, label: eventTitle(item), group: "Recent history", icon: "history", run: () => setView("history") }))
  ], [activity, dispatch, focusWorker, inspectWorker, openMissionAI, selectedSession, sessions, startWorkspace, stopWorkspace]);

  if (loading && !state) return <div className="boot-screen"><div className="boot-orbit"><span>MC</span></div><p>Bringing your workspace online</p></div>;
  if (error && !state) return <div className="boot-screen boot-error"><div className="boot-orbit"><span>!</span></div><h1>Groundstation unavailable</h1><p>{error}</p><button className="primary-button" onClick={refresh}>Reconnect</button></div>;

  const renderView = () => {
    if (view === "groundstation") return <LiveGroundstationView sessions={supervisedSessions} workspace={workspace} activity={activity} unseenActivity={unseenActivity} selectedId={selectedWorker} onSelect={setSelectedWorker} onFocus={inspectWorker} onAction={dispatch} onNavigate={setView} onDismissActivity={markHistoryReviewed} onRecipes={() => setRecipesOpen(true)} onLaunchRecipe={launchRecipe} onAddWorker={() => setWorkerDialog({ mode: "create" })} onAskAI={() => openMissionAI()} onMissionGraph={() => setMissionGraphOpen(true)}/>;
    if (view === "mission-ai") return <MissionAIScreen initialPrompt={missionAiPrompt} onConfigure={() => { setIntegrationSection("intelligence"); setView("integrations"); }} onNeedsYou={() => setView("needs")} onEvidence={() => setView("history")}/>;
    if (view === "workspace") return <WorkspaceView sessions={sessions} workspaceKey={recipeProjectKey} terminalLayout={terminalLayout} focusedId={focusedTerminal} expandedId={expandedTerminal} inspectorOpen={inspectorOpen} terminalPreferences={preferences} onInspector={() => setInspectorOpen(value => !value)} onFocus={setFocusedTerminal} onExpand={setExpandedTerminal} onAction={dispatch} onStartWorkspace={startWorkspace} onStopWorkspace={stopWorkspace} onRecipes={() => setRecipesOpen(true)} onMissionGraph={() => setMissionGraphOpen(true)} onAddWorker={() => setWorkerDialog({ mode: "create" })} onReconfigure={session => setWorkerDialog({ mode: "edit", configuration: session })} onTerminalError={reportTerminalAlert} onTerminalRecovered={dismissTerminalAlert}/>;
    if (view === "recipes") return <RecipesView sessions={sessions} onManage={() => setRecipesOpen(true)} onLaunch={launchRecipe} onAskAI={() => openMissionAI("Create a practical Daily Workspace for this project. Propose the backend, frontend, tests, Git, database, container, and agent terminals that are useful; define safe startup dependencies and readiness checks; explain the plan before requesting any action.")}/>;
    if (view === "needs") return <NeedsView attention={attention} supervisorPendingCount={supervisorPendingCount} mcpPendingCount={mcpPendingCount} missionPendingCount={missionPendingCount} automationPendingCount={automationPendingCount} mobilePendingCount={mobilePendingCount} pluginPendingCount={pluginPendingCount} onSupervisorPendingChange={setSupervisorPendingCount} onMcpPendingChange={setMcpPendingCount} onMissionPendingChange={setMissionPendingCount} onAutomationPendingChange={setAutomationPendingCount} onMobilePendingChange={setMobilePendingCount} onPluginPendingChange={setPluginPendingCount} onAction={dispatch} onFocus={inspectWorker} onDismissTerminalAlert={dismissTerminalAlert}/>;
    if (view === "agents") return <AgentWorkspace sessions={sessions} activity={activity} adapters={agentAdapters} loading={agentsLoading} selectedId={selectedWorker} onSelect={setSelectedWorker} onCreate={createAgent} onAction={dispatch} onOpenTerminal={focusWorker}/>;
    if (view === "history") return <HistoryView events={activity} onFocus={inspectWorker} projectKey={historyProjectKey}/>;
    if (view === "integrations") return <IntegrationHubView workspace={workspace} section={integrationSection} onSection={setIntegrationSection} onAskAI={() => openMissionAI()}>
      {integrationSection === "intelligence" && <MissionAISettings onOpen={() => openMissionAI()}/>}
      {integrationSection === "vscode" && <VSCodeBridgeSettings workspace={workspace}/>}
      {integrationSection === "mcp" && <McpGatewaySettings workspace={workspace}/>}
      {integrationSection === "automation" && <AutomationSettings workspace={workspace} sessions={sessions}/>}
      {integrationSection === "companion" && <MobileCompanionSettings workspace={workspace}/>}
      {integrationSection === "extensions" && <PluginPlatformSettings/>}
    </IntegrationHubView>;
    if (view === "projects") return <ProjectsView data={projects} loading={projectsLoading} onChoose={chooseProject} onOpen={openProject} onRemove={async project => { await missionApi().request("project.removeRecent", { projectId: project.id }); setProjects(await missionApi().request("projects.list")); }}/>;
    return <SettingsHub state={state} workspace={workspace} recovery={recovery} preferences={preferences} onPreference={updatePreference} onReset={resetPreferences} onOpenIntegrations={() => { setIntegrationSection("overview"); setView("integrations"); }}/>;
  };

  const pendingCount = attention.length + supervisorPendingCount + mcpPendingCount + missionPendingCount + automationPendingCount + mobilePendingCount + pluginPendingCount;

  return <div className={`shell theme-${preferences.theme} type-${preferences.typeScale} density-${preferences.density} motion-${preferences.motion} ${preferences.showCommandHints ? "show-command-hints" : "hide-command-hints"}`}>
    <a className="skip-link" href="#main-content">Skip to workspace content</a>
    <AppSidebar view={view} workspace={workspace} pendingCount={pendingCount} onNavigate={destination => { if (destination === "integrations") setIntegrationSection("overview"); setView(destination); }} onProject={() => setView("projects")} onPalette={() => setPaletteOpen(true)} onMissionAI={() => openMissionAI()}/>
    <main ref={mainContentRef} className="main-area" id="main-content" tabIndex="-1">
      <StatusBar state={state} workspace={workspace} sessions={supervisedSessions} activity={activity} health={health} view={view} pendingCount={pendingCount} onHelp={() => setHelpOpen(true)}/>
      {notice && <div className="toast" role="status" aria-live="polite"><i/>{notice}<button aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div>}{error && <div className="toast toast-error" role="alert" aria-live="assertive">{error}</div>}
      <div className={`experience view-${view}`} aria-live="off">{renderView()}</div>
    </main>
    <CommandPalette open={paletteOpen} query={paletteQuery} onQuery={setPaletteQuery} items={paletteItems} onChoose={item => { item.run(); setPaletteOpen(false); setPaletteQuery(""); }} onClose={() => setPaletteOpen(false)}/>
    <HelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)}/>
    <ConfirmationDialog request={confirmation} onCancel={() => setConfirmation(null)} onConfirm={async () => { const request = confirmation; setConfirmation(null); await request?.run(); }}/>
    <WorkerQuickLook session={sessions.find(item => item.id === quickLookId)} activity={activity} onAction={dispatch} onOpenTerminal={id => { setQuickLookId(null); focusWorker(id); }}/>
    <WorkerFocusDialog session={sessions.find(item => item.id === workerFocusId)} activity={activity} onClose={() => setWorkerFocusId(null)} onOpenTerminal={id => { setWorkerFocusId(null); focusWorker(id); }}/>
    <MissionGraph open={missionGraphOpen} sessions={sessions} onClose={() => setMissionGraphOpen(false)} onOpenTerminal={id => { setMissionGraphOpen(false); focusWorker(id); }} onOpenRecipes={() => { setMissionGraphOpen(false); setRecipesOpen(true); }}/>
    <WorkspaceRecipes open={recipesOpen} projectKey={recipeProjectKey} sessions={sessions} layoutId={terminalLayout.layout.id} sessionIds={terminalLayout.sessionIds} onClose={() => setRecipesOpen(false)} onLaunch={launchRecipe} onAskAI={prompt => { setRecipesOpen(false); openMissionAI(prompt); }}/>
    {workerDialog && <WorkerDialog initialMode={workerDialog.mode} configuration={workerDialog.configuration || null} savedCommands={savedCommands} onClose={() => setWorkerDialog(null)} onSave={saveWorker} onInstantiate={instantiateSavedCommand} onAskAI={prompt => { setWorkerDialog(null); openMissionAI(prompt); }}/>} 
  </div>;
}
