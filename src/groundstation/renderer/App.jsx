import React from "react";
import TerminalPane from "./TerminalPane.jsx";
import WorkerDialog from "./WorkerDialog.jsx";
import ProjectsView from "./ProjectsView.jsx";
import { missionApi } from "./missionApi.js";
import useMissionState from "./useMissionState.js";
import useTerminalLayout, { TERMINAL_LAYOUTS } from "./useTerminalLayout.js";
import useInterfacePreferences from "./useInterfacePreferences.js";
import AgentWorkspace from "./AgentWorkspace.jsx";
import WorkspaceRecipes from "./WorkspaceRecipes.jsx";

const NAVIGATION = [
  ["groundstation", "Groundstation", "pulse"],
  ["workspace", "Workspace", "terminal"],
  ["needs", "Needs You", "attention"],
  ["agents", "Agents", "agents"],
  ["history", "History", "history"]
];

const SECONDARY_DESTINATIONS = [
  ["agents", "Manage AI agents", "agents"],
  ["integrations", "Integration Hub", "command"],
  ["projects", "Switch project", "projects"],
  ["settings", "Open settings", "settings"]
];
const NAV_SHORTCUTS = { groundstation: "Alt G", workspace: "Alt W", needs: "Alt N", agents: "Alt A", history: "Alt H" };
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
  play: <><path d="m8 5 11 7-11 7z"/></>
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

function fuzzyCommandScore(item, query, recentIds) {
  const needle = query.trim().toLowerCase();
  const label = item.label.toLowerCase();
  const haystack = `${item.label} ${item.group} ${(item.aliases || []).join(" ")}`.toLowerCase();
  const recentIndex = recentIds.indexOf(item.id);
  const recentBoost = recentIndex < 0 ? 0 : Math.max(1, 18 - recentIndex * 2);
  if (!needle) return recentBoost;
  if (label === needle) return 120 + recentBoost;
  if (label.startsWith(needle)) return 90 + recentBoost;
  if (haystack.includes(needle)) return 65 - haystack.indexOf(needle) / 100 + recentBoost;
  let cursor = 0;
  let gaps = 0;
  for (const character of needle) {
    const found = haystack.indexOf(character, cursor);
    if (found < 0) return -1;
    gaps += found - cursor;
    cursor = found + 1;
  }
  return 35 - gaps / 10 + recentBoost;
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
    "AI agent": { key: "agent", label: "AI CONVERSATION", metric: session?.isAlive ? "Connected" : "Offline", detail: session?.attentionRequired ? "Waiting for your input" : "Supervised local CLI" },
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
  const runAction = async type => {
    if (actioning) return;
    setActioning(type);
    try { await onAction(type, session.id); }
    finally { setActioning(""); }
  };
  return (
    <article className={`worker-card ${selected ? "is-selected" : ""} ${actioning ? "is-actioning" : ""}`} tabIndex="0" onClick={onSelect} onDoubleClick={onFocus} onKeyDown={event => event.key === "Enter" && onFocus()}>
      <div className="worker-card__top">
        <div className="worker-identity"><span className={`status-orbit status-${session.status}`}><i /></span><div><strong>{session.name}</strong><span>{session.command}</span></div></div>
        <span className="worker-runtime">{runtime(session)}</span>
      </div>
      <div className="worker-signal">
        <span className={`signal-line ${session.isAlive ? "is-live" : ""}`} />
        <span>{summary}</span>
      </div>
      <div className="worker-card__meta"><span>PTY</span><span>{session.autoStart ? "Restores automatically" : "Manual start"}</span><span>{timeAgo(session.lastOutputAt)} ago</span></div>
      <div className="worker-card__actions">
        {session.attentionRequired && <button className={actioning === "acknowledge" ? "is-running" : ""} disabled={Boolean(actioning)} onClick={event => { event.stopPropagation(); runAction("acknowledge"); }}>Acknowledge</button>}
        <button className={actioning === "restart" || actioning === "start" ? "is-running" : ""} disabled={Boolean(actioning)} onClick={event => { event.stopPropagation(); runAction(session.isAlive ? "restart" : "start"); }}>{actioning === "restart" ? "Restarting…" : actioning === "start" ? "Starting…" : session.isAlive ? "Restart" : "Start"}</button>
        <button className="focus-action" onClick={event => { event.stopPropagation(); onFocus(); }}>Focus <Icon name="arrow" size={13}/></button>
      </div>
    </article>
  );
}

function ProjectPulse({ sessions, workspace, activity, onNavigate }) {
  const health = healthFor(sessions, workspace);
  const running = sessions.filter(item => item.isAlive).length;
  const agents = sessions.filter(item => item.id.startsWith("agent-")).length;
  const latest = activity.at(-1);
  return (
    <section className={`project-pulse pulse-${health.tone}`}>
      <div className="pulse-core"><div className="pulse-ring"><div className="pulse-state"><i/><small>Project state</small><strong>{health.label}</strong></div></div></div>
      <div className="pulse-story"><span className="section-kicker">PROJECT PULSE</span><h2>{health.label}</h2><p>{health.detail}. {running ? `${running} worker${running === 1 ? " is" : "s are"} running` : "Your workspace is quiet"}{agents ? ` with ${agents} AI engineer${agents === 1 ? "" : "s"} available.` : "."}</p><button className="next-action" onClick={() => onNavigate(health.tone === "healthy" ? "workspace" : "needs")}>{health.tone === "healthy" ? "Enter workspace" : "Review what needs you"}<Icon name="arrow" size={15}/></button></div>
      <div className="pulse-trail"><span>Latest change</span><strong>{latest ? eventTitle(latest) : "Workspace connected"}</strong><small>{latest ? `${timeAgo(latest.timestamp)} ago` : "just now"}</small></div>
    </section>
  );
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
  const isAgent = session.id.startsWith("agent-");
  const failed = session.status === "failed";
  return {
    kind: isAgent ? "AI agent" : failed ? "Worker failure" : "Worker attention",
    title: session.attentionReason || (failed ? `${session.name} stopped unexpectedly` : `${session.name} needs review`),
    impact: failed ? "This worker is unavailable until it starts successfully." : isAgent ? "The agent may be blocked until you review its conversation." : "Work may be waiting for operator input.",
    recommended: failed ? "Restart and verify" : isAgent ? "Open conversation" : "Inspect evidence",
    tone: failed ? "critical" : "attention"
  };
}

function AttentionShelf({ sessions, onFocus, onAction, onNavigate }) {
  const attention = sessions.filter(session => session.attentionRequired);
  if (!attention.length) return null;
  return <section className="attention-shelf"><header><div><span className="section-kicker">NEEDS YOU</span><strong>{attention.length} decision{attention.length === 1 ? "" : "s"} waiting</strong></div><button onClick={() => onNavigate("needs")}>View all <Icon name="arrow" size={13}/></button></header><div>{attention.slice(0,2).map(session => { const decision = decisionFor(session); return <article className={`attention-preview is-${decision.tone}`} key={session.id}><span className="attention-preview-dot"/><div><small>{decision.kind} · {session.name}</small><strong>{decision.title}</strong><p>{decision.impact}</p></div><div className="attention-preview-actions"><button onClick={() => onFocus(session.id)}>{decision.recommended}</button>{session.status === "failed" && <button className="primary" onClick={() => onAction("restart", session.id)}>Restart</button>}</div></article>; })}</div>{attention.length > 2 && <footer>+{attention.length - 2} more decisions are grouped in Needs You</footer>}</section>;
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
  return <div className="palette-backdrop worker-focus-backdrop" onMouseDown={onClose}>
    <section className="worker-focus-dialog" role="dialog" aria-modal="true" aria-label={`${session.name} worker history`} onMouseDown={event => event.stopPropagation()}>
      <header><div><span className="section-kicker">WORKER FOCUS</span><h2>{session.name}</h2><p><code>{session.command}</code> · {runtime(session)} · {session.status}</p></div><button onClick={onClose} aria-label="Close worker focus">×</button></header>
      <div className="worker-focus-summary"><span className={`status-orbit status-${session.status}`}><i/></span><div><strong>What is happening</strong><p>{sessionSummary(session, activity)}</p></div></div>
      <div className="worker-focus-history"><div className="worker-focus-label"><span>Terminal history</span><small>{history.length ? `${history.length} recent events` : "No recent state changes"}</small></div>{history.length ? history.map((event, index) => <article key={event.sequence || `${event.type}-${index}`}><i/><div><strong>{eventTitle(event)}</strong><span>{timeAgo(event.timestamp)} ago{event.reason ? ` · ${event.reason}` : ""}</span></div></article>) : <div className="worker-focus-empty">This terminal is healthy and has no recent lifecycle events to review.</div>}</div>
      <footer><button className="secondary-action" onClick={onClose}>Back to Groundstation</button><button className="primary-button" onClick={() => onOpenTerminal(session.id)}>Open this terminal <Icon name="arrow" size={14}/></button></footer>
    </section>
  </div>;
}

function WorkerQuickLook({ session, activity, onAction, onOpenTerminal }) {
  if (!session) return null;
  const events = sessionEvents(session, activity, 4);
  return <div className="quicklook-backdrop" aria-hidden={!session}><section className="quicklook-panel" role="dialog" aria-label={`${session.name} quick look`}><header><div><span className="section-kicker">QUICK LOOK · HOLD SPACE</span><h2>{session.name}</h2><p>{workerKind(session)} · {session.status} · {runtime(session)}</p></div><span className={`status-orbit status-${session.status}`}><i/></span></header><div className="quicklook-summary"><span>What is happening</span><strong>{sessionSummary(session, activity)}</strong></div><dl><div><dt>Command</dt><dd>{session.command} {(session.args || []).join(" ")}</dd></div><div><dt>Working directory</dt><dd>{session.cwd || "."}</dd></div><div><dt>Restore policy</dt><dd>{session.autoStart ? "Starts with workspace" : "Manual start"}</dd></div><div><dt>Last output</dt><dd>{timeAgo(session.lastOutputAt)} ago</dd></div></dl><div className="quicklook-events"><span className="section-kicker">RECENT EVIDENCE</span>{events.length ? events.map(event => <article key={`${event.sequence}-${event.type}`}><time>{timeAgo(event.timestamp)}</time><span>{eventTitle(event)}</span></article>) : <p>No recent lifecycle evidence for this worker.</p>}</div><footer><span>Release Space to close</span><div><button onClick={() => onAction(session.isAlive ? "restart" : "start", session.id)}>{session.isAlive ? "Restart" : "Start"}</button><button className="primary" onClick={() => onOpenTerminal(session.id)}>Open terminal</button></div></footer></section></div>;
}

function AgentRail({ sessions, activity, selectedId, onSelect, onNavigate }) {
  const agents = sessions.filter(item => item.id.startsWith("agent-"));
  const selected = agents.find(item => item.id === selectedId) || agents[0];
  const latest = sessionEvents(selected, activity, 1)[0];
  return <aside className="agent-rail"><header><div><span className="section-kicker">LIVE AGENTS</span><strong>{agents.filter(item => item.isAlive).length} running</strong></div><button className="agent-rail__add" onClick={() => onNavigate("agents")}><Icon name="plus" size={13}/> Add agent</button></header><div className="agent-rail__list">{agents.length ? agents.map(agent => <button key={agent.id} className={selected?.id === agent.id ? "is-open" : ""} onClick={() => onSelect(agent.id)}><span className={`agent-mini-avatar status-${agent.status}`}>{agent.name.slice(0,1)}</span><span><strong>{agent.name.replace(" agent", "")}</strong><small>{agent.isAlive ? "Working now" : agent.status}</small></span><i/></button>) : <div className="agent-rail__empty"><Icon name="agents"/><strong>No agents assigned</strong><span>Bring a local AI engineer into this workspace.</span><button onClick={() => onNavigate("agents")}><Icon name="plus" size={13}/> Add your first agent</button></div>}</div>{selected && <div className="agent-rail__summary" key={selected.id}><span className="section-kicker">AGENT SUMMARY</span><h4>{selected.isAlive ? "In progress" : "Standing by"}</h4><p>{sessionSummary(selected, activity)}</p><dl><div><dt>Agent</dt><dd>{selected.name.replace(" agent", "")}</dd></div><div><dt>Command</dt><dd><code>{selected.command}</code></dd></div><div><dt>Runtime</dt><dd>{runtime(selected)}</dd></div><div><dt>Recent activity</dt><dd>{latest ? eventTitle(latest) : "No recent event"}</dd></div><div><dt>Last output</dt><dd>{timeAgo(selected.lastOutputAt)} ago</dd></div></dl><button onClick={() => onNavigate("agents")}>Open conversation <Icon name="arrow" size={13}/></button></div>}</aside>;
}

function LiveGroundstationView({ sessions, workspace, activity, unseenActivity, selectedId, onSelect, onFocus, onAction, onNavigate, onDismissActivity }) {
  const health = healthFor(sessions, workspace);
  const selected = sessions.find(session => session.id === selectedId) || sessions[0] || null;
  const agents = sessions.filter(session => session.id.startsWith("agent-"));
  const running = sessions.filter(session => session.isAlive).length;
  const failed = sessions.filter(session => session.status === "failed").length;
  const attentionCount = sessions.filter(session => session.attentionRequired).length;
  const latest = activity.at(-1);
  const summaryLines = nowSummary(sessions, activity);
  return <div className="groundstation-view groundstation-reimagined">
    <section className={`live-project-stage tone-${health.tone}`}>
      <header className="stage-briefing"><div className="stage-copy"><span className="stage-eyebrow"><i/> LIVE PROJECT ENVIRONMENT</span><h1>{workspace?.name || "Your development workspace"}</h1><p>{health.detail}. Mission Control is supervising {sessions.length} worker{sessions.length === 1 ? "" : "s"} and will surface only changes that need judgment.</p></div><div className="stage-actions"><button onClick={() => onNavigate("workspace")}>Enter workstation <Icon name="arrow" size={14}/></button><button className={`stage-command stage-needs ${attentionCount ? "has-attention" : ""}`} onClick={() => onNavigate("needs")}><Icon name="attention" size={13}/><span>Needs You</span><b>{attentionCount}</b>{failed > 0 && <em>{failed} failed</em>}</button></div></header>
      <div className="stage-vitals" aria-label="Project status summary"><div className="stage-health"><span className="stage-health-mark"><i/></span><span><small>SYSTEM STATE</small><strong>{health.label}</strong></span></div><div><small>RUNNING</small><strong>{running}<em> / {sessions.length}</em></strong></div><div><small>AI CREW</small><strong>{agents.filter(agent => agent.isAlive).length}<em> active</em></strong></div><div><small>NEEDS YOU</small><strong>{sessions.filter(session => session.attentionRequired).length}<em> decisions</em></strong></div><div className="stage-latest"><small>LATEST SIGNAL</small><strong>{latest ? eventTitle(latest) : "Workspace connected"}</strong><em>{latest ? `${timeAgo(latest.timestamp)} ago` : "now"}</em></div></div>
      <section className="now-summary"><header><span>NOW</span><strong>What is happening</strong></header><div>{summaryLines.map(line => <article className={`tone-${line.tone}`} key={line.id}><i/><strong>{line.actor}</strong><span>{line.text}</span></article>)}</div><button onClick={() => onNavigate(attentionCount ? "needs" : "history")}>{attentionCount ? "Review" : "History"} <Icon name="arrow" size={11}/></button></section>
      <nav className="daily-runway" aria-label="Daily development workflows"><header><span>YOUR CONTROL DECK</span><strong>Move directly into the work</strong></header><button onClick={() => onNavigate("workspace")}><span className="runway-icon"><Icon name="terminal" size={16}/></span><span><strong>Terminal wall</strong><small>Drag, focus and inspect workers</small></span><b>Open <Icon name="arrow" size={11}/></b></button><button onClick={() => onNavigate("agents")}><span className="runway-icon is-agent"><Icon name="agents" size={16}/></span><span><strong>AI command</strong><small>Mission chat and live evidence</small></span><b>{agents.length ? `${agents.length} agents` : "Add agent"}</b></button><button onClick={() => onNavigate("history")}><span className="runway-icon is-memory"><Icon name="history" size={16}/></span><span><strong>Project Memory</strong><small>Search and investigate events</small></span><b>{activity.length} events</b></button></nav>
      <div className="project-scene"><div className="scene-workers"><div className="scene-label"><span>LIVE PROJECT SCENE</span><small>Select · Space quick look · Double-click focus</small></div><div className="worker-lanes">{sessions.length ? sessions.map((session, index) => <button key={session.id} className={`worker-node status-${session.status} ${selected?.id === session.id ? "is-selected" : ""}`} style={{ "--worker-index": index }} onClick={() => onSelect(session.id)} onDoubleClick={() => onFocus(session.id)}><span className="worker-node__rail"><i/></span><span className="worker-node__identity"><small>{workerKind(session)}</small><strong>{session.name}</strong><code>{session.command}</code></span><span className="worker-node__state"><b>{session.isAlive ? "LIVE" : session.status.toUpperCase()}</b><small>{runtime(session)}</small></span></button>) : <EmptyState title="A quiet workspace" detail="Add your first worker and Mission Control will begin supervising it."/>}</div></div>
        <aside className="scene-inspector">{selected ? <><header><span className="section-kicker">SELECTED WORKER</span><span className={`status-orbit status-${selected.status}`}><i/></span></header><div className="scene-inspector__identity"><small>{workerKind(selected)}</small><h2>{selected.name}</h2><code>{selected.command} {(selected.args || []).join(" ")}</code></div><div className="scene-inspector__signal"><span>WHAT IS HAPPENING</span><p>{sessionSummary(selected, activity)}</p></div><dl><div><dt>State</dt><dd>{selected.status}</dd></div><div><dt>Runtime</dt><dd>{runtime(selected)}</dd></div><div><dt>Last output</dt><dd>{timeAgo(selected.lastOutputAt)} ago</dd></div><div><dt>Recovery</dt><dd>{selected.autoStart ? "Automatic" : "Manual"}</dd></div></dl><footer><button onClick={() => onAction(selected.isAlive ? "restart" : "start", selected.id)}>{selected.isAlive ? "Restart worker" : "Start worker"}</button><button className="primary" onClick={() => onFocus(selected.id)}>Focus terminal <Icon name="arrow" size={13}/></button></footer></> : <EmptyState title="No worker selected" detail="Select a worker from the project scene."/>}</aside>
      </div>
      <footer className="crew-dock"><div><span className="section-kicker">AI CREW</span><strong>{agents.length ? `${agents.length} agent${agents.length === 1 ? "" : "s"} assigned` : "No agents assigned"}</strong></div><div className="crew-members">{agents.slice(0,4).map(agent => <button key={agent.id} onClick={() => { onSelect(agent.id); onNavigate("agents"); }}><span className={`agent-mini-avatar status-${agent.status}`}>{agent.name.slice(0,1)}</span><span><strong>{agent.name.replace(" agent", "")}</strong><small>{agent.isAlive ? "Working now" : "Standing by"}</small></span></button>)}<button className="crew-add" onClick={() => onNavigate("agents")}><Icon name="plus" size={13}/> Add AI agent</button></div></footer>
    </section>
    <div className="groundstation-followup">
      <SinceLastCheck events={unseenActivity} onReview={() => onNavigate("history")} onDismiss={onDismissActivity}/>
      <AttentionShelf sessions={sessions} onFocus={onFocus} onAction={onAction} onNavigate={onNavigate}/>
    </div>
  </div>;
}

function GroundstationView({ sessions, workspace, activity, unseenActivity, selectedId, onSelect, onFocus, onAction, onNavigate, onDismissActivity }) {
  const visible = sessions.slice(0, 6);
  return <div className="groundstation-layout"><div className="groundstation-view">
    <ProjectPulse sessions={sessions} workspace={workspace} activity={activity} onNavigate={onNavigate}/>
    <SinceLastCheck events={unseenActivity} onReview={() => onNavigate("history")} onDismiss={onDismissActivity}/>
    <AttentionShelf sessions={sessions} onFocus={onFocus} onAction={onAction} onNavigate={onNavigate}/>
    <div className="canvas-heading"><div><span className="section-kicker">LIVE PROJECT SCENE</span><h3>Workers by operational role</h3><small>Select a worker · Hold Space for Quick Look · Double-click to focus</small></div><button className="text-action" onClick={() => onNavigate("workspace")}>Open workstation <Icon name="arrow" size={14}/></button></div>
    <div className="worker-canvas">{visible.length ? visible.map(session => <div className={`worker-scene-item kind-${workerKind(session).toLowerCase().replaceAll(" ", "-")}`} key={session.id}><span className="worker-kind">{workerKind(session)}</span><WorkerCard session={session} activity={activity} selected={session.id === selectedId} onSelect={() => onSelect(session.id)} onFocus={() => onFocus(session.id)} onAction={onAction}/></div>) : <EmptyState title="A quiet workspace" detail="Add your first worker and Mission Control will begin supervising it."/>}</div>
  </div><AgentRail sessions={sessions} activity={activity} selectedId={selectedId} onSelect={onSelect} onNavigate={onNavigate}/>
  </div>;
}

function EmptyState({ title, detail, action }) {
  return <div className="empty-state"><span className="empty-orbit"><i/></span><strong>{title}</strong><p>{detail}</p>{action}</div>;
}

function EmptyTerminalSlot({ sessions, onSelect, onAddWorker, onDropSession }) {
  const [open, setOpen] = React.useState(false);
  return <article className="terminal-pane terminal-pane-empty" onDragOver={event => { if (event.dataTransfer.types.includes("application/x-mission-worker")) event.preventDefault(); }} onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData("application/x-mission-worker"); if (id) onDropSession(id); }}><span>＋</span><strong>Open a terminal worker</strong><p>Show an existing PTY here, drag a worker into this pane, or create a project command.</p><div className="empty-pane-actions"><button className="empty-pane-trigger" onClick={() => setOpen(value => !value)}>Choose existing <span>⌄</span></button><button className="empty-pane-create" onClick={onAddWorker}>+ Create worker</button></div>{open && <div className="empty-pane-menu">{sessions.map(item => <button key={item.id} onClick={() => onSelect(item.id)}><i className={`status-${item.status}`}/><span><strong>{item.name}</strong><small>{item.command}</small></span></button>)}</div>}</article>;
}

function TerminalSlot({ session, sessions, active, expanded, terminalFontSize, onFocus, onExpand, onAction, onSelect, onAddWorker }) {
  if (!session) return <EmptyTerminalSlot sessions={sessions} onSelect={onSelect} onDropSession={onSelect} onAddWorker={onAddWorker}/>;
  return <TerminalPane session={session} sessions={sessions} profile={workerProfile(session)} active={active} expanded={expanded} terminalFontSize={terminalFontSize} onFocus={onFocus} onToggleExpanded={onExpand} onAction={onAction} onSelectSession={onSelect} onDropSession={onSelect}/>;
}

function WorkerFolders({ workspaceKey, sessions, activeId, onSelect }) {
  const storageKey = `mission-control.worker-folders.v1:${workspaceKey || "default"}`;
  const [custom, setCustom] = React.useState([]);
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const [members, setMembers] = React.useState([]);
  React.useEffect(() => { try { const value = JSON.parse(localStorage.getItem(storageKey) || "[]"); setCustom(Array.isArray(value) ? value.filter(group => group?.id && group?.name && Array.isArray(group.workerIds)).slice(0, 12) : []); } catch { setCustom([]); } }, [storageKey]);
  const persist = next => { setCustom(next); try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Folder organization remains available for this session. */ } };
  const automatic = Object.entries(sessions.reduce((groups, session) => { const role = workerProfile(session).key; (groups[role] ||= []).push(session.id); return groups; }, {})).map(([role, workerIds]) => ({ id: `auto:${role}`, name: role === "agent" ? "AI conversations" : `${role[0].toUpperCase()}${role.slice(1)} terminals`, workerIds, automatic: true }));
  const save = event => { event.preventDefault(); const label = name.trim(); if (!label || !members.length) return; const group = { id: globalThis.crypto?.randomUUID?.() || `folder-${Date.now()}`, name: label.slice(0, 40), workerIds: members }; persist([...custom, group].slice(0, 12)); setName(""); setMembers([]); setAdding(false); onSelect(group); };
  return <div className="worker-folders"><div className="worker-folder-list"><button className={!activeId ? "is-current" : ""} onClick={() => onSelect(null)}><Icon name="grid" size={12}/><span>All terminals</span><b>{sessions.length}</b></button>{[...automatic, ...custom].map(group => <button className={activeId === group.id ? "is-current" : ""} key={group.id} onClick={() => onSelect(group)} title={group.workerIds.map(id => sessions.find(session => session.id === id)?.name).filter(Boolean).join(", ")}><Icon name={group.automatic ? (group.id === "auto:agent" ? "agents" : "terminal") : "projects"} size={12}/><span>{group.name}</span><b>{group.workerIds.filter(id => sessions.some(session => session.id === id)).length}</b>{!group.automatic && <i onClick={event => { event.stopPropagation(); persist(custom.filter(item => item.id !== group.id)); if (activeId === group.id) onSelect(null); }} aria-label={`Delete ${group.name}`}>×</i>}</button>)}<button className="worker-folder-add" onClick={() => { setAdding(value => !value); setMembers([]); }}><Icon name="plus" size={12}/><span>New folder</span></button></div>{adding && <form className="worker-folder-builder" onSubmit={save}><header><div><span className="section-kicker">CUSTOM TERMINAL FOLDER</span><strong>Group the terminals you use together</strong></div><button type="button" aria-label="Close folder builder" onClick={() => setAdding(false)}>×</button></header><input autoFocus maxLength="40" value={name} onChange={event => setName(event.target.value)} placeholder="Frontend stack"/><div>{sessions.map(session => <label key={session.id}><input type="checkbox" checked={members.includes(session.id)} onChange={() => setMembers(current => current.includes(session.id) ? current.filter(id => id !== session.id) : [...current, session.id])}/><span><strong>{session.name}</strong><small>{workerKind(session)}</small></span></label>)}</div><footer><span>{members.length} selected</span><button disabled={!name.trim() || !members.length}>Create folder</button></footer></form>}</div>;
}

function WorkspaceView({ sessions, workspaceKey, terminalLayout, focusedId, expandedId, inspectorOpen, terminalFontSize, onInspector, onFocus, onExpand, onAction, onStartWorkspace, onStopWorkspace, onRecipes, onAddWorker }) {
  const gridRef = React.useRef(null);
  const [resizing, setResizing] = React.useState(false);
  const [activeFolder, setActiveFolder] = React.useState(null);
  const slots = terminalLayout.sessionIds.map(id => sessions.find(session => session.id === id) || null);
  const folderSessions = activeFolder ? activeFolder.workerIds.map(id => sessions.find(session => session.id === id)).filter(Boolean) : slots;
  const filteredSlots = activeFolder ? [...folderSessions.slice(0, terminalLayout.layout.slots), ...Array(Math.max(0, terminalLayout.layout.slots - folderSessions.length)).fill(null)] : slots;
  const visible = expandedId ? filteredSlots.filter(item => item?.id === expandedId) : filteredSlots;
  const focused = sessions.find(item => item.id === focusedId);
  const profile = focused ? workerProfile(focused) : null;
  const roleCounts = sessions.reduce((counts, session) => {
    const role = workerProfile(session).key;
    counts[role] = (counts[role] || 0) + 1;
    return counts;
  }, {});
  const beginPaneResize = React.useCallback(event => {
    if (!gridRef.current || expandedId) return;
    event.preventDefault();
    const vertical = terminalLayout.layout.id === "vertical";
    const move = pointerEvent => {
      const rect = gridRef.current?.getBoundingClientRect();
      if (!rect) return;
      const raw = vertical ? (pointerEvent.clientY - rect.top) / rect.height : (pointerEvent.clientX - rect.left) / rect.width;
      terminalLayout.setPaneRatio(Math.round(Math.min(.75, Math.max(.25, raw)) * 100));
    };
    const stop = () => { setResizing(false); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); };
    setResizing(true);
    move(event);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
  }, [expandedId, terminalLayout]);
  return <div className={`workspace-experience ${inspectorOpen ? "has-inspector" : ""}`}>
    <div className="workspace-stage">
      <div className="workspace-command-deck"><div className="workspace-title"><span className="section-kicker">TERMINAL WORKSPACE</span><div><span className={`workspace-focus-state status-${focused?.status || "idle"}`}><i/></span><strong>{focused?.name || "Multi-terminal canvas"}</strong><small>{focused ? `${focused.command} · ${runtime(focused)}` : `${sessions.length} supervised workers`}</small></div></div><div className="workspace-actions"><span>{sessions.filter(item => item.isAlive).length} live · {sessions.filter(item => !item.isAlive).length} idle</span><button className="workspace-add-worker" onClick={onAddWorker}><Icon name="plus" size={12}/> Add terminal worker</button><button className="workspace-recipes" onClick={onRecipes}><Icon name="grid" size={12}/> Recipes</button>{sessions.some(item => !item.isAlive) && <button className="workspace-launch" onClick={onStartWorkspace}><Icon name="play" size={12}/> Start idle</button>}{sessions.some(item => item.isAlive) && <button className="workspace-pause" onClick={onStopWorkspace}>Stop all</button>}<button className={`workspace-inspector ${inspectorOpen ? "is-current" : ""}`} onClick={onInspector}>Inspector</button></div><div className="workspace-layout-bar"><span>CANVAS LAYOUT</span><div className="layout-switcher">{TERMINAL_LAYOUTS.map(option => <button key={option.id} className={terminalLayout.layout.id === option.id ? "is-current" : ""} onClick={() => terminalLayout.setLayoutId(option.id)} title={`${option.label} layout`}><b>{option.glyph}</b><small>{option.label}</small></button>)}</div><span className="workspace-layout-hint">Double-click a pane to focus · layout saves automatically</span></div></div>
      <section className={`workspace-intelligence ${profile ? `role-${profile.key}` : "is-empty"}`} aria-label="Workspace operational context">
        <div className="workspace-intelligence__focus"><span>{profile?.label || "WORKSPACE MAP"}</span><strong>{profile?.metric || "Choose a terminal pane"}</strong><small>{profile?.detail || "Select a worker to see role-specific context."}</small></div>
        <div className="workspace-role-map" aria-label="Worker groups by operational role">{Object.entries(roleCounts).map(([role, count]) => <span className={`role-${role}`} key={role} title={sessions.filter(session => workerProfile(session).key === role).map(session => session.name).join(", ")}><i/>{role}<b>{count}</b></span>)}</div>
        <div className="workspace-intelligence__state"><small>ENGINE TRUTH</small><strong>{focused ? `${focused.status} · ${runtime(focused)}` : `${sessions.filter(item => item.isAlive).length}/${sessions.length} live`}</strong></div>
      </section>
      <WorkerFolders workspaceKey={workspaceKey} sessions={sessions} activeId={activeFolder?.id || null} onSelect={group => { setActiveFolder(group); onExpand(null); if (group?.workerIds?.length) onFocus(group.workerIds[0]); }}/>
      <div ref={gridRef} className={`terminal-grid ${terminalLayout.layout.className} ${expandedId ? "has-expanded" : ""} ${resizing ? "is-resizing" : ""}`} style={{ "--pane-primary": `${terminalLayout.paneRatio}%` }}>{terminalLayout.layout.slots > 1 && !expandedId && <button type="button" className={`pane-resize-handle ${terminalLayout.layout.id === "vertical" ? "is-horizontal" : "is-vertical"}`} aria-label={`Resize terminal panes. Current split ${terminalLayout.paneRatio} percent.`} title="Drag to resize · Double-click to equalize" onPointerDown={beginPaneResize} onDoubleClick={() => terminalLayout.setPaneRatio(50)}><span/><b>{terminalLayout.paneRatio}%</b></button>}{visible.map((session, index) => { const slotIndex = expandedId ? slots.findIndex(item => item?.id === expandedId) : index; return <TerminalSlot key={expandedId || `slot-${slotIndex}`} session={session} sessions={sessions} active={Boolean(session && focusedId === session.id)} expanded={Boolean(session && expandedId === session.id)} terminalFontSize={terminalFontSize} onFocus={() => session && onFocus(session.id)} onExpand={() => session && onExpand(expandedId === session.id ? null : session.id)} onAction={onAction} onSelect={id => terminalLayout.setSlotSession(slotIndex, id)} onAddWorker={onAddWorker}/>; })}</div>
    </div>
    {inspectorOpen && <aside className={`context-inspector ${profile ? `role-${profile.key}` : ""}`}>
      <div className="inspector-head"><div><span className="section-kicker">WORKER INTELLIGENCE</span><strong>{focused?.name || "No worker selected"}</strong></div><button onClick={onInspector} aria-label="Close inspector">×</button></div>
      {focused ? <>
        <div className="inspector-role"><small>{profile.label}</small><strong>{profile.metric}</strong><span>{profile.detail}</span></div>
        <div className="inspector-status"><span className={`status-orbit status-${focused.status}`}><i/></span><div><strong>{focused.status}</strong><small>{runtime(focused)} runtime · engine reported</small></div></div>
        <div className="inspector-evidence"><span>RECENT TERMINAL EVIDENCE</span>{(focused.recentLines || []).slice(-4).reverse().map((line, index) => <code key={`${line}-${index}`}>{line}</code>)}{!focused.recentLines?.length && <p>No bounded output evidence has been recorded yet.</p>}</div>
        <div className="inspector-structured"><span>ENGINE-OWNED FACTS</span>{Object.entries(focused.evidence || {}).length ? Object.entries(focused.evidence).map(([category, evidence]) => <article key={category}><b>{category}</b><strong>{evidenceSummary({ category, evidence })}</strong><small>{timeAgo(evidence.at)} ago · bounded record</small></article>) : <p>No structured integration record yet.</p>}</div>
        <dl><div><dt>Worker type</dt><dd>{profile.kind}</dd></div><div><dt>Command</dt><dd>{focused.command} {(focused.args || []).join(" ")}</dd></div><div><dt>Working directory</dt><dd>{focused.cwd || "."}</dd></div><div><dt>Restore</dt><dd>{focused.autoStart ? "Automatic" : "Manual"}</dd></div><div><dt>Last output</dt><dd>{timeAgo(focused.lastOutputAt)} ago</dd></div></dl>
        <p className="inspector-truth-note">Role telemetry is parsed from bounded terminal evidence. Lifecycle status remains engine-owned.</p>
        <div className="inspector-actions">{focused.attentionRequired && <button onClick={() => onAction("acknowledge", focused.id)}>Acknowledge alert</button>}<button onClick={() => onAction(focused.isAlive ? "restart" : "start", focused.id)}>{focused.isAlive ? "Restart worker" : "Start worker"}</button>{focused.isAlive && <button className="danger" onClick={() => onAction("kill", focused.id)}>Stop worker</button>}</div>
      </> : <EmptyState title="Select a worker" detail="Its live context, evidence and controls will appear here."/>}
    </aside>}
  </div>;
}

function NeedsView({ attention, onAction, onFocus }) {
  const [filter, setFilter] = React.useState("all");
  const [showSnoozed, setShowSnoozed] = React.useState(false);
  const [engineQueue, setEngineQueue] = React.useState({ records: [], preferences: { minimumSeverity: "info", desktopNotifications: true, quietHours: { enabled: false, start: "22:00", end: "07:00" } } });
  const [policyOpen, setPolicyOpen] = React.useState(false);
  const refreshEngineQueue = React.useCallback(async () => { try { setEngineQueue(await missionApi().request("attention.list")); } catch { /* Retain the live-session fallback. */ } }, []);
  React.useEffect(() => { void refreshEngineQueue(); }, [attention.map(item => `${item.id}:${item.status}:${item.attentionRequired}`).join("|"), refreshEngineQueue]);
  const lifecycleFor = session => engineQueue.records.find(record => record.sessionId === session.id && record.state !== "recovered");
  const moveLifecycle = async (session, state, options = {}) => { const record = lifecycleFor(session); if (!record) return; await missionApi().request("attention.transition", { attentionId: record.id, state, ...options }); await refreshEngineQueue(); };
  const saveAttentionPolicy = async preferences => { setEngineQueue(current => ({ ...current, preferences })); await missionApi().request("attention.preferences.save", { preferences }); await refreshEngineQueue(); };
  const [queueState, setQueueState] = React.useState(() => { try { const value = JSON.parse(localStorage.getItem(DECISION_STATE_KEY) || "{}"); return value && typeof value === "object" ? value : {}; } catch { return {}; } });
  const persistQueue = update => setQueueState(current => { const next = typeof update === "function" ? update(current) : update; try { localStorage.setItem(DECISION_STATE_KEY, JSON.stringify(next)); } catch { /* Queue presentation state is local best effort. */ } return next; });
  const markSeen = id => { persistQueue(current => ({ ...current, [id]: { ...current[id], seen: true } })); const session = attention.find(item => item.id === id); if (session) void moveLifecycle(session, "seen"); };
  const snooze = id => { const snoozedUntil = Date.now() + 15 * 60 * 1000; persistQueue(current => ({ ...current, [id]: { ...current[id], seen: true, snoozedUntil } })); const session = attention.find(item => item.id === id); if (session) void moveLifecycle(session, "seen", { snoozedUntil }); };
  const snoozed = attention.filter(session => Number(queueState[session.id]?.snoozedUntil) > Date.now());
  const available = attention.filter(session => showSnoozed || Number(queueState[session.id]?.snoozedUntil) <= Date.now());
  const visible = available.filter(session => filter === "critical" ? session.status === "failed" : filter === "agents" ? session.id.startsWith("agent-") : true);
  const critical = attention.filter(session => session.status === "failed").length;
  const agents = attention.filter(session => session.id.startsWith("agent-")).length;
  const recovered = engineQueue.records.filter(record => record.state === "recovered");
  const groupCounts = engineQueue.records.reduce((counts, record) => ({ ...counts, [record.groupKey]: (counts[record.groupKey] || 0) + 1 }), {});
  return <div className="needs-view needs-decision-room">
    <header className="needs-hero"><div><span className="section-kicker">HUMAN DECISION ROOM</span><h2>{attention.length ? `${attention.length} decision${attention.length === 1 ? "" : "s"} waiting for you` : "Your workspace is clear"}</h2><p>{attention.length ? "A calm, prioritized queue of moments where automation needs human judgment. Evidence and consequence come before every action." : "Mission Control is supervising the workspace. You can keep building until a decision genuinely needs you."}</p></div><div className="needs-overview"><div className={critical ? "has-critical" : ""}><small>CRITICAL</small><strong>{critical}</strong><span>failed workers</span></div><div><small>AGENT INPUT</small><strong>{agents}</strong><span>AI decisions</span></div><div><small>TOTAL QUEUE</small><strong>{attention.length}</strong><span>awaiting review</span></div></div></header>
    <div className="decision-room-heading"><div><span className="section-kicker">PRIORITIZED QUEUE</span><strong>{attention.length ? "Review impact before acting" : "Nothing requires intervention"}</strong></div><span>Evidence → action → engine verification</span></div>
    {attention.length > 0 && <div className="decision-queue-controls"><div><button className={filter === "all" ? "is-current" : ""} onClick={() => setFilter("all")}>All <b>{available.length}</b></button><button className={filter === "critical" ? "is-current" : ""} onClick={() => setFilter("critical")}>Critical <b>{critical}</b></button><button className={filter === "agents" ? "is-current" : ""} onClick={() => setFilter("agents")}>Agents <b>{agents}</b></button></div><div>{snoozed.length > 0 && <button className={showSnoozed ? "is-current" : ""} onClick={() => setShowSnoozed(value => !value)}>{showSnoozed ? "Hide snoozed" : `Snoozed ${snoozed.length}`}</button>}<button onClick={() => persistQueue(current => Object.fromEntries(Object.entries(current).map(([id, value]) => [id, { ...value, seen: true }])))}>Mark all seen</button></div></div>}
    <section className="attention-lifecycle-bar"><div><span className="section-kicker">ENGINE LIFECYCLE</span><strong>New → Seen → Acting → Verifying → Recovered</strong></div><div><span>{recovered.length} recovered</span><button className={policyOpen ? "is-current" : ""} onClick={() => setPolicyOpen(value => !value)}>Severity & quiet hours</button></div></section>
    {policyOpen && <section className="attention-policy"><div className="severity-choice"><span>Notify from</span><div>{[["info","All"],["warning","Warning"],["critical","Critical"]].map(([value,label]) => <button key={value} className={engineQueue.preferences.minimumSeverity === value ? "is-current" : ""} onClick={() => void saveAttentionPolicy({ ...engineQueue.preferences, minimumSeverity: value })}>{label}</button>)}</div></div><label><input type="checkbox" checked={engineQueue.preferences.desktopNotifications} onChange={event => void saveAttentionPolicy({ ...engineQueue.preferences, desktopNotifications: event.target.checked })}/><span>Desktop notifications</span></label><label><input type="checkbox" checked={engineQueue.preferences.quietHours.enabled} onChange={event => void saveAttentionPolicy({ ...engineQueue.preferences, quietHours: { ...engineQueue.preferences.quietHours, enabled: event.target.checked } })}/><span>Quiet hours</span></label><label className="quiet-hours"><input type="time" value={engineQueue.preferences.quietHours.start} onChange={event => setEngineQueue(current => ({ ...current, preferences: { ...current.preferences, quietHours: { ...current.preferences.quietHours, start: event.target.value } } }))}/><span>to</span><input type="time" value={engineQueue.preferences.quietHours.end} onChange={event => void saveAttentionPolicy({ ...engineQueue.preferences, quietHours: { ...engineQueue.preferences.quietHours, end: event.target.value } })}/></label></section>}
    <div className="needs-list">{visible.length ? visible.map((session, index) => {
      const decision = decisionFor(session);
      const isNew = !queueState[session.id]?.seen;
      const isSnoozed = Number(queueState[session.id]?.snoozedUntil) > Date.now();
      const lifecycle = lifecycleFor(session);
      const related = lifecycle ? groupCounts[lifecycle.groupKey] || 1 : 1;
      return <article className={`need-item decision-${decision.tone} lifecycle-${lifecycle?.state || "new"} ${isSnoozed ? "is-snoozed" : ""}`} key={session.id}><div className="need-index"><span>{String(index + 1).padStart(2, "0")}</span><i/></div><div className="need-copy"><div className="need-meta"><span>{decision.kind}</span><em>{(lifecycle?.state || (isNew ? "new" : "seen")).toUpperCase()}</em>{related > 1 && <em>RELATED {related}</em>}{isSnoozed && <em>SNOOZED</em>}<time>{timeAgo(session.attentionSince)} ago</time><b>{lifecycle?.severity || session.status}</b></div><strong>{decision.title}</strong><div className="decision-evidence"><span><b>Evidence</b>{session.spawnError || session.attentionReason || `Engine reports ${session.status}`}</span><span><b>Impact</b>{decision.impact}</span><span><b>Recommended</b>{decision.recommended}</span></div><p>Engine lifecycle: {lifecycle?.state || "new"}. Recovery appears only after the engine verifies the alert cleared.</p></div><div className="need-actions"><button onClick={() => { markSeen(session.id); onFocus(session.id); }}>{session.id.startsWith("agent-") ? "Open conversation" : "Inspect evidence"}</button>{session.status === "failed" && <button className="recommended" onClick={async () => { await moveLifecycle(session, "acting"); await onAction("restart", session.id); await moveLifecycle(session, "verifying"); }}>Restart & verify</button>}<button onClick={() => snooze(session.id)}>Snooze 15m</button><button className="primary" onClick={async () => { await moveLifecycle(session, "acting"); await onAction("acknowledge", session.id); await refreshEngineQueue(); }}>Acknowledge</button></div></article>;
    }) : attention.length ? <EmptyState title="No decisions in this view" detail={snoozed.length && !showSnoozed ? "Snoozed decisions remain engine-active and can be revealed above." : "Try another queue filter."}/> : <div className="needs-clear-state"><span className="needs-clear-mark">✓</span><span className="section-kicker">ALL CLEAR</span><h3>No failures, prompts, or approvals</h3><p>The queue will update automatically when a worker or agent needs your judgment.</p></div>}</div>
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

function HistoryView({ events }) {
  const [filter, setFilter] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [actorFilter, setActorFilter] = React.useState("all");
  const [selectedSequence, setSelectedSequence] = React.useState(null);
  const [memory, setMemory] = React.useState(null);
  React.useEffect(() => { let active = true; let afterSequence = 0; try { afterSequence = Number(localStorage.getItem(HISTORY_CURSOR_KEY)) || 0; } catch { /* Cursor is optional. */ } missionApi().request("memory.summary", { afterSequence }).then(result => { if (active) setMemory(result); }).catch(() => {}); return () => { active = false; }; }, [events.length]);
  const ordered = [...events].reverse();
  const failures = ordered.filter(event => /failed|error|attention/i.test(String(event.type)));
  const evidenceEvents = ordered.filter(event => event.type === "session:evidence");
  const chapters = [...ordered.reduce((groups, event) => {
    if (!event.correlationId) return groups;
    const chapter = groups.get(event.correlationId) || { id: event.correlationId, actor: event.name || event.id, events: [], latest: event.timestamp };
    chapter.events.push(event);
    chapter.latest = Math.max(chapter.latest, event.timestamp);
    groups.set(event.correlationId, chapter);
    return groups;
  }, new Map()).values()].sort((left, right) => right.latest - left.latest);
  const actorFor = event => event.name || event.id || event.sessionId || event.operation || "Workspace";
  const actors = [...new Set(ordered.map(actorFor))].slice(0, 8);
  const scoped = filter === "risk" ? failures : filter === "workers" ? ordered.filter(event => String(event.type).includes("session")) : filter === "evidence" ? evidenceEvents : ordered;
  const visible = scoped.filter(event => (actorFilter === "all" || actorFor(event) === actorFilter) && `${event.type || ""} ${event.name || ""} ${event.id || ""} ${event.sessionId || ""} ${event.operation || ""} ${event.reason || ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = ordered.find(event => event.sequence === selectedSequence) || visible[0] || null;
  return <div className="history-view">
    <header className="history-hero history-hero-redesigned"><div><span className="section-kicker">PROJECT MEMORY</span><h2>Investigate how the work unfolded</h2><p>A durable timeline of worker changes and verified operational facts. Structured evidence is stored without raw terminal output.</p></div><div className="history-snapshot"><span><small>RECORDED</small><strong>{ordered.length}</strong></span><span className="is-evidence"><small>EVIDENCE</small><strong>{evidenceEvents.length}</strong></span><span><small>RISKS</small><strong>{failures.length}</strong></span><span><small>ACTORS</small><strong>{actors.length}</strong></span></div></header>
    {memory && <section className="memory-briefing"><div className="memory-since"><span className="section-kicker">SINCE YOU LEFT · ENGINE SUMMARY</span><strong>{memory.since.summary}</strong><div><span>{memory.since.eventCount} changes</span><span>{memory.since.riskCount} risks</span><span>{memory.since.evidenceCount} evidence records</span></div></div><div className="memory-why"><span className="section-kicker">WHY IT NEEDS REVIEW</span>{memory.why.length ? memory.why.slice(0,2).map(item => <button key={item.sequence} onClick={() => setSelectedSequence(item.sequence)}><strong>{item.actor}</strong><span>{item.statement}</span><small>{item.correlationId ? "Engine-correlated" : "Recorded fact"}</small></button>) : <p>No recorded failure reason in this review window.</p>}</div></section>}
    {memory?.chapters?.length > 0 && <section className="recovery-chains"><header><div><span className="section-kicker">FAILURE → RECOVERY CHAINS</span><strong>Engine-built run chapters</strong></div><small>Correlation IDs only · no guessed causality</small></header><div>{memory.chapters.slice(0,4).map(chapter => <button key={chapter.correlationId} className={`is-${chapter.state}`} onClick={() => setSelectedSequence(chapter.events.at(-1)?.sequence)}><i/><span><strong>{chapter.actor}</strong><small>{chapter.eventCount} correlated events · failed {timeAgo(chapter.failedAt)} ago</small></span><b>{chapter.state === "recovered" ? "Recovered" : "Unresolved"}</b></button>)}</div></section>}
    {memory && <section className="memory-state-split"><header><span className="section-kicker">CURRENT ENGINE STATE</span><strong>Now, separate from the historical record below</strong></header><div>{memory.current.map(worker => <article key={worker.id}><i className={`status-${worker.status}`}/><span><strong>{worker.name}</strong><small>{worker.attentionRequired ? "Needs attention now" : worker.isAlive ? "Running now" : "Not running now"}</small></span><b>{worker.status}</b></article>)}</div></section>}
    <section className="history-evidence-strip"><header><div><span className="section-kicker">ENGINE EVIDENCE</span><strong>Verified facts from your workers</strong></div><button className={filter === "evidence" ? "is-current" : ""} onClick={() => setFilter(filter === "evidence" ? "all" : "evidence")}>{filter === "evidence" ? "Show all events" : `View all ${evidenceEvents.length}`}</button></header><div>{evidenceEvents.slice(0, 4).map(event => <button key={event.sequence} onClick={() => { setFilter("evidence"); setSelectedSequence(event.sequence); }}><span>{event.category}</span><strong>{evidenceSummary(event)}</strong><small>{event.name || event.id} · {timeAgo(event.timestamp)} ago</small></button>)}{!evidenceEvents.length && <p>Run tests, a build, Git status, or a service to create durable structured evidence.</p>}</div></section>
    {chapters.length > 0 && <section className="history-chapters"><header><div><span className="section-kicker">RUN CHAPTERS</span><strong>Events connected by the engine</strong></div><small>Correlation-backed · no inferred causality</small></header><div>{chapters.slice(0, 5).map(chapter => { const failed = chapter.events.some(event => /failed|error|attention/i.test(String(event.type)) || event.evidence?.status === "failed" || event.evidence?.failed > 0); const latest = chapter.events[0]; return <button key={chapter.id} className={failed ? "has-risk" : ""} onClick={() => setSelectedSequence(latest.sequence)}><i/><span><strong>{chapter.actor || "Worker run"}</strong><small>{chapter.events.length} connected event{chapter.events.length === 1 ? "" : "s"} · {timeAgo(chapter.latest)} ago</small></span><b>{failed ? "Review" : "Run"}</b></button>; })}</div></section>}
    <div className="history-controls"><div><button className={filter === "all" ? "is-current" : ""} onClick={() => setFilter("all")}>All changes</button><button className={filter === "workers" ? "is-current" : ""} onClick={() => setFilter("workers")}>Workers</button><button className={filter === "risk" ? "is-current" : ""} onClick={() => setFilter("risk")}>Risks & attention</button></div><label className="history-search"><Icon name="search" size={13}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search event, actor, reason…"/><kbd>{visible.length}</kbd></label></div>
    {actors.length > 1 && <div className="history-actors"><span>ACTOR</span><button className={actorFilter === "all" ? "is-current" : ""} onClick={() => setActorFilter("all")}>Everyone</button>{actors.map(actor => <button className={actorFilter === actor ? "is-current" : ""} key={actor} onClick={() => setActorFilter(actor)}>{actor}</button>)}</div>}
    <div className={`history-investigation ${selected ? "has-selection" : ""}`}><div className="timeline">{visible.length ? visible.map(event => { const dangerous = /failed|error|attention/i.test(String(event.type)); const actor = actorFor(event); return <article tabIndex="0" onClick={() => setSelectedSequence(event.sequence)} onKeyDown={keyEvent => keyEvent.key === "Enter" && setSelectedSequence(event.sequence)} className={`timeline-event ${dangerous ? "is-danger" : ""} ${selected?.sequence === event.sequence ? "is-selected" : ""}`} key={`${event.sequence}-${event.type}`}><div className="timeline-time"><strong>{timeAgo(event.timestamp)}</strong><span>#{event.sequence}</span></div><div className={`timeline-node ${dangerous ? "is-danger" : ""}`}><i/></div><div className="timeline-copy"><span>{actor}</span><strong>{eventTitle(event)}</strong><p>{event.reason || (dangerous ? "Engine evidence marks this moment for review." : String(event.type).includes("session") ? `${actor} changed state through the supervised engine contract.` : "Mission Control recorded this workspace transition.")}</p>{event.operation && <code>operation · {event.operation}</code>}</div><span className="timeline-kind">{dangerous ? "Review" : String(event.type).includes("session") ? "Worker" : "System"}</span></article>; }) : <EmptyState title="No matching history" detail={query || actorFilter !== "all" ? "Try a broader search or another filter." : "Keep working to create new project memory."}/>}</div>
      {selected && <aside className="history-evidence"><header><span className="section-kicker">RECORDED EVIDENCE</span><strong>Event #{selected.sequence}</strong><small>{new Date(selected.timestamp).toLocaleString()}</small></header><div className={`history-evidence__status ${/failed|error|attention/i.test(String(selected.type)) ? "is-risk" : ""}`}><i/><span><small>EVENT TYPE</small><strong>{eventTitle(selected)}</strong></span></div><dl><div><dt>Actor</dt><dd>{actorFor(selected)}</dd></div>{selected.operation && <div><dt>Operation</dt><dd>{selected.operation}</dd></div>}{selected.reason && <div><dt>Recorded reason</dt><dd>{selected.reason}</dd></div>}{selected.status && <div><dt>State</dt><dd>{selected.status}</dd></div>}{Number.isInteger(selected.exitCode) && <div><dt>Exit code</dt><dd>{selected.exitCode}</dd></div>}<div><dt>Correlation</dt><dd>{selected.correlationId || "Not provided by engine"}</dd></div></dl><p>This panel displays recorded event fields. It does not infer that adjacent events caused one another.</p></aside>}
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

function SettingsView({ state, workspace, recovery, preferences, onPreference, onReset }) {
  return <div className="settings-view"><header className="settings-hero"><span className="section-kicker">MISSION CONTROL SETTINGS</span><h2>Make the workstation yours</h2><p>Interface preferences are stored locally. Engine configuration, credentials, and PTY ownership remain untouched.</p></header><div className="settings-grid"><section className="settings-panel"><div className="settings-panel__head"><Icon name="pulse"/><div><h3>Operational HUD</h3><p>Live facts from the protected engine boundary.</p></div></div><div className="settings-rows"><div><span>Engine contract</span><strong>Protocol v{state?.contractVersion || "—"}</strong></div><div><span>Workspace mode</span><strong>{workspace?.persistent ? "Persistent" : "In memory"}</strong></div><div><span>Recovery controller</span><strong>{recovery?.phase || "Ready"}</strong></div><div><span>Keyboard navigation</span><strong>Ctrl K · Escape</strong></div></div></section><section className="settings-panel"><div className="settings-panel__head"><Icon name="settings"/><div><h3>Appearance</h3><p>Professional density for long development sessions.</p></div></div><div className="appearance-card"><div className="theme-preview"><span/><span/><span/></div><div><strong>Orbital dark</strong><p>Warm graphite, restrained sage, high contrast.</p></div><span className="selected-chip">Active</span></div><SettingChoice label="Text size" detail="Scale interface typography without changing terminal output." value={preferences.typeScale} options={[{value:"compact",label:"Compact"},{value:"comfortable",label:"Default"},{value:"large",label:"Large"}]} onChange={value => onPreference("typeScale", value)}/><SettingChoice label="Interface density" detail="Choose how much breathing room controls and cards use." value={preferences.density} options={[{value:"compact",label:"Compact"},{value:"comfortable",label:"Comfortable"}]} onChange={value => onPreference("density", value)}/><SettingChoice label="Motion" detail="Reduce transitions while keeping state changes clear." value={preferences.motion} options={[{value:"full",label:"Full"},{value:"reduced",label:"Reduced"}]} onChange={value => onPreference("motion", value)}/></section><section className="settings-panel settings-panel-wide"><div className="settings-panel__head"><Icon name="terminal"/><div><h3>Terminal experience</h3><p>Readable monospace tuned independently from the application UI.</p></div></div><div className="terminal-size-control"><div><strong>Terminal font size</strong><p>Applied to every newly mounted terminal pane.</p></div><input type="range" min="11" max="18" step="1" value={preferences.terminalFontSize} onChange={event => onPreference("terminalFontSize", Number(event.target.value))}/><output>{preferences.terminalFontSize}px</output></div><label className="toggle-setting"><span><strong>Show command hints</strong><small>Display the exact CLI and worker commands in operational surfaces.</small></span><input type="checkbox" checked={preferences.showCommandHints} onChange={event => onPreference("showCommandHints", event.target.checked)}/><i/></label></section></div><footer className="settings-footer"><span>Preferences are local to this device.</span><button onClick={onReset}>Restore defaults</button></footer></div>;
}

function CommandPalette({ open, query, onQuery, items, onChoose, onClose }) {
  const [recentIds, setRecentIds] = React.useState(() => { try { const value = JSON.parse(localStorage.getItem(COMMAND_RECENTS_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } });
  const filtered = items.map(item => ({ item, score: fuzzyCommandScore(item, query, recentIds) })).filter(result => result.score >= 0).sort((left, right) => right.score - left.score || left.item.label.localeCompare(right.item.label)).slice(0, 12).map(result => result.item);
  const [activeIndex, setActiveIndex] = React.useState(0);
  React.useEffect(() => { setActiveIndex(0); }, [query, open]);
  if (!open) return null;
  const choose = item => { const next = [item.id, ...recentIds.filter(id => id !== item.id)].slice(0,8); setRecentIds(next); try { localStorage.setItem(COMMAND_RECENTS_KEY, JSON.stringify(next)); } catch { /* Command recents are local best effort. */ } onChoose(item); };
  const onKeyDown = event => {
    if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex(index => Math.min(filtered.length - 1, index + 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex(index => Math.max(0, index - 1)); }
    if (event.key === "Enter" && filtered[activeIndex]) { event.preventDefault(); choose(filtered[activeIndex]); }
    if (event.key === "Escape") { event.preventDefault(); onClose(); }
  };
  return <div className="palette-backdrop" onMouseDown={onClose}><div className="command-palette" onMouseDown={event => event.stopPropagation()} onKeyDown={onKeyDown} role="dialog" aria-modal="true" aria-label="Mission Command"><div className="palette-search"><Icon name="search" size={19}/><input autoFocus value={query} onChange={event => onQuery(event.target.value)} placeholder="Search commands, workers, history, projects…" aria-activedescendant={filtered[activeIndex] ? `command-${filtered[activeIndex].id}` : undefined}/><kbd>esc</kbd></div><div className="palette-label">{query ? "BEST MATCHES" : recentIds.length ? "RECENT & AVAILABLE" : "MISSION COMMAND"}</div><div className="palette-results" role="listbox">{filtered.map((item,index) => <button id={`command-${item.id}`} role="option" aria-selected={index === activeIndex} key={item.id} className={index === activeIndex ? "is-active" : ""} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(item)}><span className="palette-icon"><Icon name={item.icon || "command"} size={16}/></span><span><strong>{item.label}</strong><small>{item.group}{recentIds.includes(item.id) ? " · Recent" : ""}</small></span>{item.shortcut && <kbd>{item.shortcut}</kbd>}</button>)}{!filtered.length && <div className="palette-empty"><strong>No matching command</strong><span>Try a worker name, action, project, or history term.</span></div>}</div><footer><span><b>↑↓</b> navigate</span><span><b>↵</b> open</span><span>Fuzzy search · Engine-safe actions only</span></footer></div></div>;
}

function ConfirmationDialog({ request, onCancel, onConfirm }) {
  if (!request) return null;
  return <div className="palette-backdrop confirmation-backdrop" onMouseDown={onCancel}><section className="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-detail" onMouseDown={event => event.stopPropagation()}><span className="confirmation-mark">!</span><div><span className="section-kicker">CONFIRM OPERATION</span><h2 id="confirmation-title">{request.title}</h2><p id="confirmation-detail">{request.detail}</p><small>{request.recovery}</small></div><footer><button onClick={onCancel}>Cancel</button><button className="danger-confirm" autoFocus onClick={onConfirm}>{request.confirmLabel}</button></footer></section></div>;
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
  const initialProjectPrompted = React.useRef(false);
  const [historyCursors, setHistoryCursors] = React.useState(() => { try { const value = JSON.parse(localStorage.getItem(HISTORY_CURSOR_KEY) || "{}"); return value && typeof value === "object" ? value : {}; } catch { return {}; } });
  const sessions = state?.sessions || [];
  const workspace = state?.workspace || null;
  const activity = state?.activity?.events || [];
  const savedCommands = state?.savedCommands || [];
  const attention = sessions.filter(item => item.attentionRequired || item.status === "failed");
  const selectedSession = sessions.find(item => item.id === selectedWorker) || null;
  const health = healthFor(sessions, workspace);
  const historyProjectKey = workspace?.root || workspace?.name || "default";
  const recipeProjectKey = workspace?.path || workspace?.root || workspace?.name || "default";
  const latestActivitySequence = activity.at(-1)?.sequence || 0;
  const historyCursor = historyCursors[historyProjectKey];
  const unseenActivity = historyCursor === undefined ? [] : activity.filter(event => event.sequence > historyCursor);
  const terminalLayout = useTerminalLayout(workspace, sessions);
  const { preferences, update: updatePreference, reset: resetPreferences } = useInterfacePreferences();

  React.useEffect(() => { if (!selectedWorker && sessions[0]) setSelectedWorker(sessions[0].id); }, [selectedWorker, sessions]);
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
  React.useEffect(() => { const onKey = event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPaletteOpen(value => !value); } else if (event.key === "Escape") { if (paletteOpen) setPaletteOpen(false); else if (workerFocusId) setWorkerFocusId(null); else if (expandedTerminal) setExpandedTerminal(null); else if (inspectorOpen) setInspectorOpen(false); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [expandedTerminal, inspectorOpen, paletteOpen, workerFocusId]);
  React.useEffect(() => { const onKey = event => { if (paletteOpen || confirmation || workerDialog) return; if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") { event.preventDefault(); setWorkerDialog({ mode: "create" }); return; } if (!event.altKey) return; const destination = { g: "groundstation", w: "workspace", n: "needs", a: "agents", h: "history" }[event.key.toLowerCase()]; if (destination) { event.preventDefault(); setView(destination); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [confirmation, paletteOpen, workerDialog]);
  React.useEffect(() => { const onKey = event => { if (view !== "workspace" || paletteOpen || !event.altKey || !/^[1-6]$/.test(event.key)) return; const id = terminalLayout.sessionIds[Number(event.key) - 1]; if (!id || !sessions.some(session => session.id === id)) return; event.preventDefault(); setFocusedTerminal(id); setSelectedWorker(id); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [paletteOpen, sessions, terminalLayout.sessionIds, view]);
  React.useEffect(() => { const editable = target => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable; const onDown = event => { if (event.code !== "Space" || event.repeat || editable(event.target) || view !== "groundstation" || paletteOpen || confirmation || workerFocusId || !selectedWorker) return; event.preventDefault(); setQuickLookId(selectedWorker); }; const onUp = event => { if (event.code === "Space") setQuickLookId(null); }; window.addEventListener("keydown", onDown); window.addEventListener("keyup", onUp); return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); }; }, [confirmation, paletteOpen, selectedWorker, view, workerFocusId]);
  React.useEffect(() => { if ((view === "agents" || paletteOpen) && !agentAdapters.length) { setAgentsLoading(true); missionApi().request("agents.list").then(value => setAgentAdapters(Array.isArray(value) ? value : [])).catch(value => setNotice(value.message || String(value))).finally(() => setAgentsLoading(false)); } }, [agentAdapters.length, paletteOpen, view]);
  React.useEffect(() => { if (view !== "projects") return; setProjectsLoading(true); missionApi().request("projects.list").then(setProjects).catch(value => setNotice(value.message || String(value))).finally(() => setProjectsLoading(false)); }, [view]);

  const executeAction = React.useCallback(async (type, id, fields = {}) => { setNotice(type === "acknowledge" ? "Acknowledging…" : "Working…"); try { const result = await missionApi().request("action.dispatch", { sessionId: id, action: { type, ...fields }, ...(["kill", "remove"].includes(type) ? { confirmation: `confirm:${type}:${id}` } : {}) }); if (result?.ok === false) throw new Error(result.error || "Action failed"); setNotice(type === "acknowledge" ? "Alert acknowledged; worker health is unchanged" : "Done"); await refresh(); } catch (value) { setNotice(value.message || String(value)); } }, [refresh]);
  const dispatch = React.useCallback(async (type, id, fields = {}) => { const target = sessions.find(item => item.id === id); if (["kill", "remove"].includes(type)) { setConfirmation({ title: type === "kill" ? `Stop ${target?.name || id}?` : `Remove ${target?.name || id}?`, detail: type === "kill" ? "The engine will stop this worker and its active PTY." : "The worker definition will be removed from this workspace.", recovery: type === "kill" ? "You can start this worker again later." : "Removal may require recreating the worker configuration.", confirmLabel: type === "kill" ? "Stop worker" : "Remove worker", run: () => executeAction(type, id, fields) }); return; } await executeAction(type, id, fields); }, [executeAction, sessions]);
  const executeBulk = React.useCallback(async (type, targets) => { if (!targets.length) return; setNotice(`${type === "start" ? "Starting" : "Stopping"} ${targets.length} workers…`); const results = await Promise.all(targets.map(async session => { try { await missionApi().request("action.dispatch", { sessionId: session.id, action: { type }, ...(type === "kill" ? { confirmation: `confirm:kill:${session.id}` } : {}) }); return null; } catch (error) { return `${session.name}: ${error.message || String(error)}`; } })); await refresh(); const failures = results.filter(Boolean); setNotice(failures.length ? `${targets.length - failures.length}/${targets.length} workers updated · ${failures[0]}` : `${targets.length} workers ${type === "start" ? "started" : "stopped"}`); }, [refresh]);
  const startWorkspace = React.useCallback(() => executeBulk("start", sessions.filter(session => !session.isAlive)), [executeBulk, sessions]);
  const stopWorkspace = React.useCallback(() => { const running = sessions.filter(session => session.isAlive); if (!running.length) return; setConfirmation({ title: `Stop ${running.length} running workers?`, detail: "Mission Control will request a clean stop for every active engine-owned PTY in this workspace.", recovery: "Workers remain configured and can be started together again.", confirmLabel: "Stop workspace", run: () => executeBulk("kill", running) }); }, [executeBulk, sessions]);
  const launchRecipe = React.useCallback(async recipe => {
    terminalLayout.applyLayout({ layoutId: recipe.layoutId, sessionIds: recipe.sessionIds });
    setRecipesOpen(false);
    setView("workspace");
    setNotice(`Launching ${recipe.name} through the engine…`);
    try { await missionApi().request("recipe.run", { recipeId: recipe.id }); await refresh(); setNotice(`${recipe.name} is running with readiness gates`); }
    catch (error) { setNotice(error.message || String(error)); }
  }, [refresh, terminalLayout]);
  const focusWorker = React.useCallback(id => { setFocusedTerminal(id); setSelectedWorker(id); if (!terminalLayout.sessionIds.includes(id)) terminalLayout.setSlotSession(0, id); setView("workspace"); }, [terminalLayout]);
  const inspectWorker = React.useCallback(id => { setSelectedWorker(id); if (id.startsWith("agent-")) { setView("agents"); return; } setWorkerFocusId(id); }, []);
  const saveWorker = React.useCallback(async value => { const editing = workerDialog?.mode === "edit"; const result = await missionApi().request("action.dispatch", { sessionId: editing ? workerDialog.configuration.id : null, action: editing ? { type: "reconfigure", patch: value } : { type: "create", definition: value } }); if (result?.ok === false) throw new Error(result.error || "Worker save failed"); if (!editing) setPendingWorkspaceWorker(value.id); await refresh(); setNotice(editing ? "Worker updated" : `${value.name} added to the terminal workspace`); }, [refresh, workerDialog]);
  const instantiateSavedCommand = React.useCallback(async commandId => { await missionApi().request("action.dispatch", { sessionId: null, action: { type: "instantiateSavedCommand", commandId } }); await refresh(); }, [refresh]);
  const createAgent = React.useCallback(async adapterId => { let createdSessionId = null; setAgentsLoading(true); setNotice(`Checking ${adapterId} CLI…`); try { const result = await missionApi().request("agent.create", { adapterId }); if (!result?.sessionId) throw new Error("Agent worker was created without a session ID"); createdSessionId = result.sessionId; setSelectedWorker(createdSessionId); setNotice(`Starting ${adapterId}…`); const started = await missionApi().request("action.dispatch", { sessionId: createdSessionId, action: { type: "start" } }); if (started?.ok === false) throw new Error(started.error || "Agent CLI could not be started"); await refresh(); setNotice(`${adapterId} is running and ready for instructions`); } catch (value) { await refresh(); if (createdSessionId) setSelectedWorker(createdSessionId); setNotice(createdSessionId ? `${adapterId} was added but could not start: ${value.message || String(value)}` : value.message || String(value)); } finally { setAgentsLoading(false); } }, [refresh]);
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
    ...NAVIGATION.map(([id,label,icon]) => ({ id: `nav-${id}`, label, group: "Navigate", icon, aliases: id === "needs" ? ["attention","approvals","failures"] : id === "history" ? ["activity","events","memory","logs"] : [], run: () => setView(id) })),
    ...SECONDARY_DESTINATIONS.map(([id,label,icon]) => ({ id: `nav-${id}`, label, group: "Application", icon, aliases: id === "agents" ? ["ai","claude","codex","gemini"] : id === "projects" ? ["workspace","switch"] : ["preferences","appearance"], run: () => setView(id) })),
    ...(selectedSession ? [{ id: "context-open", label: selectedSession.id.startsWith("agent-") ? `Open ${selectedSession.name} conversation` : `Inspect ${selectedSession.name}`, group: "Selected worker", icon: selectedSession.id.startsWith("agent-") ? "agents" : "terminal", aliases: ["focus","quick look","details"], run: () => inspectWorker(selectedSession.id) }] : []),
    ...(selectedSession?.attentionRequired ? [{ id: "context-acknowledge", label: `Acknowledge ${selectedSession.name} alert`, group: "Selected worker", icon: "attention", run: () => dispatch("acknowledge", selectedSession.id) }] : []),
    { id: "new-worker", label: "Add a new worker", group: "Action", icon: "plus", shortcut: "N", run: () => setWorkerDialog({ mode: "create" }) },
    { id: "workspace-recipes", label: "Open workspace recipes", group: "Workspace action", icon: "grid", aliases: ["saved layout","startup set","launch stack"], run: () => setRecipesOpen(true) },
    ...(sessions.some(item => !item.isAlive) ? [{ id: "start-workspace", label: "Start all idle workers", group: "Workspace action", icon: "play", aliases: ["launch","boot","daily workspace"], run: startWorkspace }] : []),
    ...(sessions.some(item => item.isAlive) ? [{ id: "stop-workspace", label: "Stop all running workers", group: "Workspace action", icon: "attention", aliases: ["pause","shutdown","stop workspace"], run: stopWorkspace }] : []),
    ...sessions.filter(item => item.isAlive).map(item => ({ id: `restart-${item.id}`, label: `Restart ${item.name}`, group: "Worker action", icon: "pulse", run: () => dispatch("restart", item.id) })),
    ...sessions.map(item => ({ id: `worker-${item.id}`, label: item.name, group: `${item.status} worker`, icon: "terminal", run: () => focusWorker(item.id) })),
    ...activity.slice(-5).reverse().map(item => ({ id: `event-${item.sequence}`, label: eventTitle(item), group: "Recent history", icon: "history", run: () => setView("history") }))
  ], [activity, dispatch, focusWorker, inspectWorker, selectedSession, sessions, startWorkspace, stopWorkspace]);

  if (loading && !state) return <div className="boot-screen"><div className="boot-orbit"><span>MC</span></div><p>Bringing your workspace online</p></div>;
  if (error && !state) return <div className="boot-screen boot-error"><div className="boot-orbit"><span>!</span></div><h1>Groundstation unavailable</h1><p>{error}</p><button className="primary-button" onClick={refresh}>Reconnect</button></div>;

  const renderView = () => {
    if (view === "groundstation") return <LiveGroundstationView sessions={sessions} workspace={workspace} activity={activity} unseenActivity={unseenActivity} selectedId={selectedWorker} onSelect={setSelectedWorker} onFocus={inspectWorker} onAction={dispatch} onNavigate={setView} onDismissActivity={markHistoryReviewed}/>;
    if (view === "workspace") return <WorkspaceView sessions={sessions} workspaceKey={recipeProjectKey} terminalLayout={terminalLayout} focusedId={focusedTerminal} expandedId={expandedTerminal} inspectorOpen={inspectorOpen} terminalFontSize={preferences.terminalFontSize} onInspector={() => setInspectorOpen(value => !value)} onFocus={setFocusedTerminal} onExpand={setExpandedTerminal} onAction={dispatch} onStartWorkspace={startWorkspace} onStopWorkspace={stopWorkspace} onRecipes={() => setRecipesOpen(true)} onAddWorker={() => setWorkerDialog({ mode: "create" })}/>;
    if (view === "needs") return <NeedsView attention={attention} onAction={dispatch} onFocus={inspectWorker}/>;
    if (view === "agents") return <AgentWorkspace sessions={sessions} activity={activity} adapters={agentAdapters} loading={agentsLoading} selectedId={selectedWorker} onSelect={setSelectedWorker} onCreate={createAgent} onAction={dispatch} onOpenTerminal={focusWorker}/>;
    if (view === "history") return <HistoryView events={activity}/>;
        if (view === "projects") return <ProjectsView data={projects} loading={projectsLoading} onChoose={chooseProject} onOpen={openProject} onRemove={async project => { await missionApi().request("project.removeRecent", { projectId: project.id }); setProjects(await missionApi().request("projects.list")); }}/>;
        if (view === "integrations") return <IntegrationsView/>;
    return <SettingsView state={state} workspace={workspace} recovery={recovery} preferences={preferences} onPreference={updatePreference} onReset={resetPreferences}/>;
  };

  return <div className={`shell type-${preferences.typeScale} density-${preferences.density} motion-${preferences.motion} ${preferences.showCommandHints ? "show-command-hints" : "hide-command-hints"}`}>
      <a className="skip-link" href="#main-content">Skip to workspace content</a>
      <aside className="rail" aria-label="Application sidebar">
      <div className="brand-mark"><span/><div><b>MISSION CONTROL</b><small>Developer OS</small></div></div>
      <div className="rail-section-label">ACTIVE PROJECT</div>
        <nav aria-label="Mission Control navigation">{NAVIGATION.map(([id,label,icon]) => <button key={id} aria-current={view === id ? "page" : undefined} className={view === id ? "is-current" : ""} onClick={() => setView(id)} title={`${label} · ${NAV_SHORTCUTS[id]}`}><Icon name={icon}/><span>{label}</span><kbd aria-hidden="true">{NAV_SHORTCUTS[id]}</kbd>{id === "needs" && attention.length > 0 && <b aria-label={`${attention.length} items need attention`}>{attention.length}</b>}</button>)}</nav>
          <div className="rail-utilities"><span className="rail-section-label">WORKSPACE</span><button className={view === "projects" ? "is-current" : ""} onClick={() => setView("projects")}><Icon name="projects"/><span>Projects</span></button><button className={view === "integrations" ? "is-current" : ""} onClick={() => setView("integrations")}><Icon name="command"/><span>Integrations</span></button><button className={view === "settings" ? "is-current" : ""} onClick={() => setView("settings")}><Icon name="settings"/><span>Settings</span></button></div>
      <button className="rail-palette" onClick={() => setPaletteOpen(true)} title="Mission Command"><span className="rail-command-mark"><Icon name="command"/></span><span><strong>Mission Command</strong><small>Search and operate</small></span><kbd>⌃K</kbd></button>
      <div className={`rail-health health-${health.tone}`} role="status" aria-live="polite"><i/><span><strong>{health.label}</strong><small>{sessions.filter(item => item.isAlive).length} workers live</small></span></div>
    </aside>
    <main className="main-area" id="main-content" tabIndex="-1"><header className="mission-bar"><div className="project-identity"><button className="project-switcher" onClick={() => setView("projects")}><span>{(workspace?.name || "MC").slice(0,2).toUpperCase()}</span><div><strong>{workspace?.name || "Mission Control"}</strong><small title={workspace?.directory || ""}>{workspace?.persistent ? workspace.directory : "Choose a project folder"}</small></div><i aria-hidden="true">⌄</i></button></div><button className="mission-search" onClick={() => setPaletteOpen(true)}><Icon name="search" size={15}/><span>Search or run a command</span><kbd aria-hidden="true">Ctrl K</kbd></button><div className="mission-actions"><span className={`live-status health-${health.tone}`} aria-label={`${sessions.filter(item => item.isAlive).length} workers live`}><i/>{sessions.filter(item => item.isAlive).length} live</span><button onClick={() => setRecipesOpen(true)}>Recipes</button>{savedCommands.length > 0 && <button onClick={() => setWorkerDialog({ mode: "presets" })}>Presets</button>}<button className="create-worker" onClick={() => setWorkerDialog({ mode: "create" })}><Icon name="plus" size={16}/> Add terminal worker</button></div></header>
      {notice && <div className="toast" role="status" aria-live="polite"><i/>{notice}<button aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div>}{error && <div className="toast toast-error" role="alert" aria-live="assertive">{error}</div>}
      <div className={`experience view-${view}`} aria-live="off">{renderView()}</div>
    </main>
    <CommandPalette open={paletteOpen} query={paletteQuery} onQuery={setPaletteQuery} items={paletteItems} onChoose={item => { item.run(); setPaletteOpen(false); setPaletteQuery(""); }} onClose={() => setPaletteOpen(false)}/>
    <ConfirmationDialog request={confirmation} onCancel={() => setConfirmation(null)} onConfirm={async () => { const request = confirmation; setConfirmation(null); await request?.run(); }}/>
    <WorkerQuickLook session={sessions.find(item => item.id === quickLookId)} activity={activity} onAction={dispatch} onOpenTerminal={id => { setQuickLookId(null); focusWorker(id); }}/>
    <WorkerFocusDialog session={sessions.find(item => item.id === workerFocusId)} activity={activity} onClose={() => setWorkerFocusId(null)} onOpenTerminal={id => { setWorkerFocusId(null); focusWorker(id); }}/>
    <WorkspaceRecipes open={recipesOpen} projectKey={recipeProjectKey} sessions={sessions} layoutId={terminalLayout.layout.id} sessionIds={terminalLayout.sessionIds} onClose={() => setRecipesOpen(false)} onLaunch={launchRecipe}/>
    {workerDialog && <WorkerDialog initialMode={workerDialog.mode} configuration={workerDialog.configuration || null} savedCommands={savedCommands} onClose={() => setWorkerDialog(null)} onSave={saveWorker} onInstantiate={instantiateSavedCommand}/>}
  </div>;
}
