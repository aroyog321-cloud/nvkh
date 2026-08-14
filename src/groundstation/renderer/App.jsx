import React from "react";
import TerminalPane from "./TerminalPane.jsx";
import WorkerDialog from "./WorkerDialog.jsx";
import ProjectsView from "./ProjectsView.jsx";
import { missionApi } from "./missionApi.js";
import useMissionState from "./useMissionState.js";
import useTerminalLayout, { TERMINAL_LAYOUTS } from "./useTerminalLayout.js";
import useInterfacePreferences from "./useInterfacePreferences.js";

const NAVIGATION = [
  ["groundstation", "Groundstation", "pulse"],
  ["workspace", "Workspace", "terminal"],
  ["needs", "Needs You", "attention"],
  ["agents", "Agents", "agents"],
  ["history", "History", "history"],
  ["projects", "Projects", "projects"],
  ["settings", "Settings", "settings"]
];

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
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON_PATHS[name]}</svg>;
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
  return String(event?.type || "Workspace event").replaceAll(":", " · ").replaceAll("-", " ");
}

function sessionEvents(session, activity, limit = 6) {
  if (!session) return [];
  return activity.filter(event => event.id === session.id || event.sessionId === session.id || event.name === session.name).slice(-limit).reverse();
}

function healthFor(sessions, workspace) {
  const failed = sessions.filter(item => item.status === "failed").length + (workspace?.loadErrorCount || 0);
  const needs = sessions.filter(item => item.attentionRequired).length;
  if (failed) return { label: "Action recommended", detail: `${failed} failure${failed === 1 ? "" : "s"} detected`, tone: "danger", score: Math.max(18, 72 - failed * 16) };
  if (needs) return { label: "Waiting on you", detail: `${needs} decision${needs === 1 ? "" : "s"} ready`, tone: "warning", score: Math.max(50, 88 - needs * 8) };
  return { label: "Flow is clear", detail: "Everything is moving", tone: "healthy", score: 96 };
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
        {session.attentionRequired && <button className={actioning === "acknowledge" ? "is-running" : ""} disabled={Boolean(actioning)} onClick={event => { event.stopPropagation(); runAction("acknowledge"); }}>Resolve</button>}
        <button className={actioning === "restart" || actioning === "start" ? "is-running" : ""} disabled={Boolean(actioning)} onClick={event => { event.stopPropagation(); runAction(session.isAlive ? "restart" : "start"); }}>{actioning === "restart" ? "Restarting…" : actioning === "start" ? "Starting…" : session.isAlive ? "Restart" : "Start"}</button>
        <button className="focus-action" onClick={event => { event.stopPropagation(); onFocus(); }}>Focus <Icon name="arrow" size={13}/></button>
      </div>
    </article>
  );
}

function OperationsRibbon({ sessions, activity }) {
  const running = sessions.filter(item => item.isAlive).length;
  const failed = sessions.filter(item => item.status === "failed").length;
  const agents = sessions.filter(item => item.id.startsWith("agent-"));
  const docker = sessions.filter(item => /(^|\s)(docker|docker-compose)(\s|$)/i.test(`${item.command || ""} ${(item.args || []).join(" ")}`));
  const latest = activity.at(-1);
  return <section className="operations-ribbon" aria-label="Workspace operations summary">
    <div><span className="operations-ribbon__pulse"><i/></span><span><small>ACTIVE NOW</small><strong>{running} of {sessions.length} workers</strong></span></div>
    <div><small>AI CREW</small><strong>{agents.filter(item => item.isAlive).length} working · {agents.length} assigned</strong></div>
    <div><small>CONTAINERS</small><strong>{docker.filter(item => item.isAlive).length} live · {docker.length} supervised</strong></div>
    <div><small>LAST MOVEMENT</small><strong>{latest ? eventTitle(latest) : "Workspace connected"}</strong></div>
    <div className={failed ? "has-risk" : "is-clear"}><small>RISK</small><strong>{failed ? `${failed} needs review` : "No blockers"}</strong></div>
  </section>;
}

function ProjectPulse({ sessions, workspace, activity, onNavigate }) {
  const health = healthFor(sessions, workspace);
  const running = sessions.filter(item => item.isAlive).length;
  const agents = sessions.filter(item => item.id.startsWith("agent-")).length;
  const latest = activity.at(-1);
  return (
    <section className={`project-pulse pulse-${health.tone}`}>
      <div className="pulse-core"><div className="pulse-ring"><div className="pulse-score">{health.score}<small>pulse</small></div></div></div>
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

function AgentRail({ sessions, activity, selectedId, onSelect, onFocus, onNavigate }) {
  const agents = sessions.filter(item => item.id.startsWith("agent-"));
  const selected = agents.find(item => item.id === selectedId) || agents[0];
  const latest = sessionEvents(selected, activity, 1)[0];
  return <aside className="agent-rail"><header><div><span className="section-kicker">LIVE AGENTS</span><strong>{agents.filter(item => item.isAlive).length} running</strong></div><button className="agent-rail__add" onClick={() => onNavigate("agents")}><Icon name="plus" size={13}/> Add agent</button></header><div className="agent-rail__list">{agents.length ? agents.map(agent => <button key={agent.id} className={selected?.id === agent.id ? "is-open" : ""} onClick={() => onSelect(agent.id)}><span className={`agent-mini-avatar status-${agent.status}`}>{agent.name.slice(0,1)}</span><span><strong>{agent.name.replace(" agent", "")}</strong><small>{agent.isAlive ? "Working now" : agent.status}</small></span><i/></button>) : <div className="agent-rail__empty"><Icon name="agents"/><strong>No agents assigned</strong><span>Bring a local AI engineer into this workspace.</span><button onClick={() => onNavigate("agents")}><Icon name="plus" size={13}/> Add your first agent</button></div>}</div>{selected && <div className="agent-rail__summary" key={selected.id}><span className="section-kicker">AGENT SUMMARY</span><h4>{selected.isAlive ? "In progress" : "Standing by"}</h4><p>{sessionSummary(selected, activity)}</p><dl><div><dt>Agent</dt><dd>{selected.name.replace(" agent", "")}</dd></div><div><dt>Command</dt><dd><code>{selected.command}</code></dd></div><div><dt>Runtime</dt><dd>{runtime(selected)}</dd></div><div><dt>Recent activity</dt><dd>{latest ? eventTitle(latest) : "No recent event"}</dd></div><div><dt>Last output</dt><dd>{timeAgo(selected.lastOutputAt)} ago</dd></div></dl><button onClick={() => onFocus(selected.id)}>View agent history <Icon name="arrow" size={13}/></button></div>}</aside>;
}

function DockerSurface({ sessions, activity }) {
  const dockerWorkers = sessions.filter(item => /(^|\s)(docker|docker-compose)(\s|$)/i.test(`${item.command || ""} ${(item.args || []).join(" ")}`));
  const running = dockerWorkers.filter(item => item.isAlive).length;
  const latest = [...activity].reverse().find(event => /docker|container/i.test(`${event.type || ""} ${event.name || ""}`));
  return <section className="docker-surface"><div className="docker-mark"><Icon name="docker" size={21}/></div><div><span className="section-kicker">DOCKER OPERATIONS</span><strong>{dockerWorkers.length ? `${running}/${dockerWorkers.length} container workers live` : "Ready for container workloads"}</strong><p>{latest ? eventTitle(latest) : "Docker commands added as workers appear here automatically."}</p></div><div className="docker-vitals"><span><i className={running ? "is-live" : ""}/>{running ? "Engine activity" : "No Docker worker"}</span><small>Local · engine supervised</small></div></section>;
}

function GroundstationView({ sessions, workspace, activity, selectedId, onSelect, onFocus, onAction, onNavigate }) {
  const visible = sessions.slice(0, 6);
  const selected = sessions.find(item => item.id === selectedId);
  return <div className="groundstation-layout"><div className="groundstation-view">
    <ProjectPulse sessions={sessions} workspace={workspace} activity={activity} onNavigate={onNavigate}/>
    <OperationsRibbon sessions={sessions} activity={activity}/>
    <div className="canvas-heading"><div><span className="section-kicker">WORKER CANVAS</span><h3>Everything in motion</h3></div><button className="text-action" onClick={() => onNavigate("workspace")}>Open workstation <Icon name="arrow" size={14}/></button></div>
    <DockerSurface sessions={sessions} activity={activity}/>
    <div className="worker-canvas">{visible.length ? visible.map(session => <WorkerCard key={session.id} session={session} activity={activity} selected={session.id === selectedId} onSelect={() => onSelect(session.id)} onFocus={() => onFocus(session.id)} onAction={onAction}/>) : <EmptyState title="A quiet workspace" detail="Add your first worker and Mission Control will begin supervising it."/>}</div>{selected && <section className="worker-quicklook"><div><span className="section-kicker">WORKER QUICK LOOK</span><h3>{selected.name}</h3><p>{sessionSummary(selected, activity)}</p></div><div className="quicklook-facts"><span><small>Command</small><code>{selected.command}</code></span><span><small>Status</small><strong>{selected.status}</strong></span><span><small>Runtime</small><strong>{runtime(selected)}</strong></span></div><button onClick={() => onFocus(selected.id)}>View history & summary <Icon name="arrow" size={14}/></button></section>}
  </div><AgentRail sessions={sessions} activity={activity} selectedId={selectedId} onSelect={onSelect} onFocus={onFocus} onNavigate={onNavigate}/>
  </div>;
}

function EmptyState({ title, detail, action }) {
  return <div className="empty-state"><span className="empty-orbit"><i/></span><strong>{title}</strong><p>{detail}</p>{action}</div>;
}

function EmptyTerminalSlot({ sessions, onSelect }) {
  const [open, setOpen] = React.useState(false);
  return <article className="terminal-pane terminal-pane-empty"><span>＋</span><strong>Open a worker here</strong><p>Attach an engine-owned PTY to this pane.</p><button className="empty-pane-trigger" onClick={() => setOpen(value => !value)}>Choose a worker <span>⌄</span></button>{open && <div className="empty-pane-menu">{sessions.map(item => <button key={item.id} onClick={() => onSelect(item.id)}><i className={`status-${item.status}`}/><span><strong>{item.name}</strong><small>{item.command}</small></span></button>)}</div>}</article>;
}

function TerminalSlot({ session, sessions, active, expanded, terminalFontSize, onFocus, onExpand, onAction, onSelect }) {
  if (!session) return <EmptyTerminalSlot sessions={sessions} onSelect={onSelect}/>;
  return <TerminalPane session={session} sessions={sessions} active={active} expanded={expanded} terminalFontSize={terminalFontSize} onFocus={onFocus} onToggleExpanded={onExpand} onAction={onAction} onSelectSession={onSelect}/>;
}

function WorkspaceView({ sessions, terminalLayout, focusedId, expandedId, inspectorOpen, terminalFontSize, onInspector, onFocus, onExpand, onAction }) {
  const slots = terminalLayout.sessionIds.map(id => sessions.find(session => session.id === id) || null);
  const visible = expandedId ? slots.filter(item => item?.id === expandedId) : slots;
  const focused = sessions.find(item => item.id === focusedId);
  return <div className={`workspace-experience ${inspectorOpen ? "has-inspector" : ""}`}>
    <div className="workspace-stage">
      <div className="workspace-toolbar"><div className="workspace-title"><span className="section-kicker">WORKER WORKSTATION</span><strong>{focused?.name || "Multi-terminal canvas"}</strong></div><div className="layout-switcher"><Icon name="grid" size={15}/>{TERMINAL_LAYOUTS.map(option => <button key={option.id} className={terminalLayout.layout.id === option.id ? "is-current" : ""} onClick={() => terminalLayout.setLayoutId(option.id)} title={`${option.label} layout`}>{option.label}</button>)}</div><div className="workspace-actions"><span>{sessions.filter(item => item.isAlive).length} live</span><button className={inspectorOpen ? "is-current" : ""} onClick={onInspector}>Inspector</button></div></div>
      <div className={`terminal-grid ${terminalLayout.layout.className} ${expandedId ? "has-expanded" : ""}`}>{visible.map((session, index) => { const slotIndex = expandedId ? slots.findIndex(item => item?.id === expandedId) : index; return <TerminalSlot key={expandedId || `slot-${slotIndex}`} session={session} sessions={sessions} active={Boolean(session && focusedId === session.id)} expanded={Boolean(session && expandedId === session.id)} terminalFontSize={terminalFontSize} onFocus={() => session && onFocus(session.id)} onExpand={() => session && onExpand(expandedId === session.id ? null : session.id)} onAction={onAction} onSelect={id => terminalLayout.setSlotSession(slotIndex, id)}/>; })}</div>
    </div>
    {inspectorOpen && <aside className="context-inspector"><div className="inspector-head"><div><span className="section-kicker">CONTEXT INSPECTOR</span><strong>{focused?.name || "No worker selected"}</strong></div><button onClick={onInspector}>×</button></div>{focused ? <><div className="inspector-status"><span className={`status-orbit status-${focused.status}`}><i/></span><div><strong>{focused.status}</strong><small>{runtime(focused)} runtime</small></div></div><dl><div><dt>Command</dt><dd>{focused.command}</dd></div><div><dt>Restore</dt><dd>{focused.autoStart ? "Automatic" : "Manual"}</dd></div><div><dt>Last output</dt><dd>{timeAgo(focused.lastOutputAt)} ago</dd></div></dl><div className="inspector-actions"><button onClick={() => onAction(focused.isAlive ? "restart" : "start", focused.id)}>{focused.isAlive ? "Restart worker" : "Start worker"}</button>{focused.isAlive && <button className="danger" onClick={() => onAction("kill", focused.id)}>Stop worker</button>}</div></> : <EmptyState title="Select a worker" detail="Its live context and controls will appear here."/>}</aside>}
  </div>;
}

function NeedsView({ attention, onAction, onFocus }) {
  return <div className="needs-view"><header className="needs-hero"><span className="section-kicker">OPERATOR QUEUE</span><h2>{attention.length ? `${attention.length} thing${attention.length === 1 ? "" : "s"} need your judgment` : "Nothing needs you"}</h2><p>{attention.length ? "Mission Control has filtered the noise. These are the decisions that can unblock your project." : "The system is supervising your workspace. Keep building—we’ll bring you back when a decision matters."}</p></header><div className="needs-list">{attention.length ? attention.map((session, index) => <article className="need-item" key={session.id}><div className="need-index">{String(index + 1).padStart(2, "0")}</div><div className="need-copy"><span>{session.name} · {timeAgo(session.attentionSince)} ago</span><strong>{session.attentionReason || "Worker requested your attention"}</strong><p>Review the terminal context, then acknowledge when the worker can continue.</p></div><div className="need-actions"><button onClick={() => onFocus(session.id)}>Inspect worker</button><button className="primary" onClick={() => onAction("acknowledge", session.id)}>Mark resolved</button></div></article>) : <EmptyState title="You’re in the clear" detail="No failures, prompts, or approvals are waiting."/>}</div></div>;
}

function AgentsView({ sessions, adapters, loading, onCreate, onFocus, onAction }) {
  const agents = sessions.filter(item => item.id.startsWith("agent-"));
  const [selectedId, setSelectedId] = React.useState(null);
  const selected = agents.find(item => item.id === selectedId) || agents[0];
  const active = agents.filter(item => item.isAlive).length;
  const failed = agents.filter(item => item.status === "failed").length;
  return <div className="agents-view"><header className="agents-hero"><div><span className="section-kicker">AGENT OPERATIONS</span><h2>Your AI engineering crew</h2><p>See who is working, what each CLI is doing, and where your judgment is required.</p></div><div className="agent-overview"><span><small>WORKING</small><strong>{active}</strong></span><span><small>STANDING BY</small><strong>{agents.length - active}</strong></span><span className={failed ? "has-risk" : ""}><small>RISK</small><strong>{failed}</strong></span></div></header><div className="agent-command-deck"><section><div className="agent-section-heading"><div><span className="section-kicker">ACTIVE CREW</span><h3>Engineers in this workspace</h3></div><small>Click to inspect · Double-click for history</small></div>{agents.length ? <div className="agent-operations">{agents.map(agent => <article className={`agent-operation ${selected?.id === agent.id ? "is-selected" : ""}`} key={agent.id} onClick={() => setSelectedId(agent.id)} onDoubleClick={() => onFocus(agent.id)}><div className="agent-avatar">{agent.name.slice(0,1)}</div><div className="agent-mission"><span>CURRENT MISSION</span><strong>{agent.isAlive ? "Working in the project" : "Ready for a mission"}</strong><p>{agent.name} · <code>{agent.command}</code></p></div><div className="agent-progress"><span><i style={{width: agent.isAlive ? "68%" : "0%"}}/></span><small>{agent.isAlive ? "Terminal active · output monitored" : `Start runs ${agent.command}`}</small></div><div className={`risk-chip ${agent.status === "failed" ? "is-risk" : ""}`}>{agent.status === "failed" ? "Review risk" : "Low risk"}</div><button className="agent-start-action" onClick={event => { event.stopPropagation(); agent.isAlive ? onFocus(agent.id) : onAction("start", agent.id); }}>{agent.isAlive ? "Open summary" : <><Icon name="play" size={12}/> Start</>}</button></article>)}</div> : <EmptyState title="Your crew is ready to assemble" detail="Add a local agent below. Mission Control will supervise it as an engine-owned worker."/>}</section>{selected && <aside className="agent-brief"><div className="agent-brief__status"><span className={`status-orbit status-${selected.status}`}><i/></span><span>{selected.isAlive ? "LIVE MISSION" : "AVAILABLE"}</span></div><h3>{selected.name.replace(" agent", "")}</h3><p>{selected.isAlive ? "Terminal output is flowing and Mission Control is watching for failures or approval requests." : `Ready to launch ${selected.command} in a protected PTY.`}</p><dl><div><dt>Command</dt><dd><code>{selected.command}</code></dd></div><div><dt>Status</dt><dd>{selected.status}</dd></div><div><dt>Runtime</dt><dd>{runtime(selected)}</dd></div><div><dt>Risk</dt><dd>{selected.status === "failed" ? "Needs review" : "Low"}</dd></div></dl><button className="primary-button" onClick={() => selected.isAlive ? onFocus(selected.id) : onAction("start", selected.id)}>{selected.isAlive ? "Open mission history" : `Start ${selected.command}`}</button></aside>}</div><div className="adapter-heading"><div><span className="section-kicker">ADD AN ENGINEER</span><h3>Local agent adapters</h3></div><span>Official command · Starts immediately · Authentication stays in the CLI</span></div><div className="adapter-grid">{adapters.map(adapter => <button className="adapter-card" key={adapter.id} disabled={loading} onClick={() => onCreate(adapter.id)}><span className="adapter-mark">{adapter.name.slice(0,1)}</span><span><strong>{adapter.name}</strong><code>$ {adapter.command || adapter.id}</code><small>{adapter.description}</small></span><span className="adapter-add"><Icon name="play" size={15}/> Add & start</span></button>)}</div></div>;
}

function HistoryView({ events }) {
  const [filter, setFilter] = React.useState("all");
  const ordered = [...events].reverse();
  const failures = ordered.filter(event => /failed|error|attention/i.test(String(event.type)));
  const visible = filter === "risk" ? failures : filter === "workers" ? ordered.filter(event => String(event.type).includes("session")) : ordered;
  return <div className="history-view"><header className="history-hero history-hero-redesigned"><div><span className="section-kicker">PROJECT MEMORY</span><h2>Understand how the work unfolded</h2><p>A causal record of worker changes, decisions, failures, and recovery—not another activity feed.</p></div><div className="history-snapshot"><span><small>RECORDED</small><strong>{ordered.length}</strong></span><span><small>RISKS</small><strong>{failures.length}</strong></span><span><small>LATEST</small><strong>{ordered[0] ? timeAgo(ordered[0].timestamp) : "—"}</strong></span></div></header><div className="history-controls"><div><button className={filter === "all" ? "is-current" : ""} onClick={() => setFilter("all")}>All changes</button><button className={filter === "workers" ? "is-current" : ""} onClick={() => setFilter("workers")}>Workers</button><button className={filter === "risk" ? "is-current" : ""} onClick={() => setFilter("risk")}>Risks & attention</button></div><span>{visible.length} moments · newest first</span></div><div className="timeline">{visible.length ? visible.map(event => { const dangerous = /failed|error|attention/i.test(String(event.type)); return <article className={`timeline-event ${dangerous ? "is-danger" : ""}`} key={`${event.sequence}-${event.type}`}><div className="timeline-time"><strong>{timeAgo(event.timestamp)}</strong><span>#{event.sequence}</span></div><div className={`timeline-node ${dangerous ? "is-danger" : ""}`}><i/></div><div className="timeline-copy"><span>{event.name || event.id || event.operation || "Workspace"}</span><strong>{eventTitle(event)}</strong><p>{dangerous ? "This moment may explain a blocker or require review." : String(event.type).includes("session") ? "A supervised worker changed state through the engine contract." : "Mission Control recorded a meaningful workspace transition."}</p></div><span className="timeline-kind">{dangerous ? "Review" : String(event.type).includes("session") ? "Worker" : "System"}</span></article>; }) : <EmptyState title="No matching history" detail="Try another filter or keep working to create new project memory."/>}</div></div>;
}

function SettingChoice({ label, detail, value, options, onChange }) {
  return <div className="setting-control"><div><strong>{label}</strong><p>{detail}</p></div><div className="segmented-control">{options.map(option => <button key={option.value} className={value === option.value ? "is-selected" : ""} onClick={() => onChange(option.value)}>{option.label}</button>)}</div></div>;
}

function SettingsView({ state, workspace, recovery, preferences, onPreference, onReset }) {
  return <div className="settings-view"><header className="settings-hero"><span className="section-kicker">MISSION CONTROL SETTINGS</span><h2>Make the workstation yours</h2><p>Interface preferences are stored locally. Engine configuration, credentials, and PTY ownership remain untouched.</p></header><div className="settings-grid"><section className="settings-panel"><div className="settings-panel__head"><Icon name="pulse"/><div><h3>Operational HUD</h3><p>Live facts from the protected engine boundary.</p></div></div><div className="settings-rows"><div><span>Engine contract</span><strong>Protocol v{state?.contractVersion || "—"}</strong></div><div><span>Workspace mode</span><strong>{workspace?.persistent ? "Persistent" : "In memory"}</strong></div><div><span>Recovery controller</span><strong>{recovery?.phase || "Ready"}</strong></div><div><span>Keyboard navigation</span><strong>Ctrl K · Escape</strong></div></div></section><section className="settings-panel"><div className="settings-panel__head"><Icon name="settings"/><div><h3>Appearance</h3><p>Professional density for long development sessions.</p></div></div><div className="appearance-card"><div className="theme-preview"><span/><span/><span/></div><div><strong>Orbital dark</strong><p>Warm graphite, restrained sage, high contrast.</p></div><span className="selected-chip">Active</span></div><SettingChoice label="Text size" detail="Scale interface typography without changing terminal output." value={preferences.typeScale} options={[{value:"compact",label:"Compact"},{value:"comfortable",label:"Default"},{value:"large",label:"Large"}]} onChange={value => onPreference("typeScale", value)}/><SettingChoice label="Interface density" detail="Choose how much breathing room controls and cards use." value={preferences.density} options={[{value:"compact",label:"Compact"},{value:"comfortable",label:"Comfortable"}]} onChange={value => onPreference("density", value)}/><SettingChoice label="Motion" detail="Reduce transitions while keeping state changes clear." value={preferences.motion} options={[{value:"full",label:"Full"},{value:"reduced",label:"Reduced"}]} onChange={value => onPreference("motion", value)}/></section><section className="settings-panel settings-panel-wide"><div className="settings-panel__head"><Icon name="terminal"/><div><h3>Terminal experience</h3><p>Readable monospace tuned independently from the application UI.</p></div></div><div className="terminal-size-control"><div><strong>Terminal font size</strong><p>Applied to every newly mounted terminal pane.</p></div><input type="range" min="11" max="18" step="1" value={preferences.terminalFontSize} onChange={event => onPreference("terminalFontSize", Number(event.target.value))}/><output>{preferences.terminalFontSize}px</output></div><label className="toggle-setting"><span><strong>Show command hints</strong><small>Display the exact CLI and worker commands in operational surfaces.</small></span><input type="checkbox" checked={preferences.showCommandHints} onChange={event => onPreference("showCommandHints", event.target.checked)}/><i/></label></section></div><footer className="settings-footer"><span>Preferences are local to this device.</span><button onClick={onReset}>Restore defaults</button></footer></div>;
}

function CommandPalette({ open, query, onQuery, items, onChoose, onClose }) {
  const filtered = items.filter(item => `${item.label} ${item.group}`.toLowerCase().includes(query.toLowerCase())).slice(0, 12);
  if (!open) return null;
  return <div className="palette-backdrop" onMouseDown={onClose}><div className="command-palette" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Mission Command"><div className="palette-search"><Icon name="search" size={19}/><input autoFocus value={query} onChange={event => onQuery(event.target.value)} placeholder="Search commands, workers, history, projects…"/><kbd>esc</kbd></div><div className="palette-label">MISSION COMMAND</div><div className="palette-results">{filtered.map((item,index) => <button key={item.id} className={index === 0 ? "is-active" : ""} onClick={() => onChoose(item)}><span className="palette-icon"><Icon name={item.icon || "command"} size={16}/></span><span><strong>{item.label}</strong><small>{item.group}</small></span>{item.shortcut && <kbd>{item.shortcut}</kbd>}</button>)}</div><footer><span><b>↑↓</b> navigate</span><span><b>↵</b> open</span><span>Engine-safe actions only</span></footer></div></div>;
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
  const [agentAdapters, setAgentAdapters] = React.useState([]);
  const [agentsLoading, setAgentsLoading] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [paletteQuery, setPaletteQuery] = React.useState("");
  const [projects, setProjects] = React.useState(null);
  const [projectsLoading, setProjectsLoading] = React.useState(false);
  const sessions = state?.sessions || [];
  const workspace = state?.workspace || null;
  const activity = state?.activity?.events || [];
  const savedCommands = state?.savedCommands || [];
  const attention = sessions.filter(item => item.attentionRequired);
  const health = healthFor(sessions, workspace);
  const terminalLayout = useTerminalLayout(workspace, sessions);
  const { preferences, update: updatePreference, reset: resetPreferences } = useInterfacePreferences();

  React.useEffect(() => { if (!selectedWorker && sessions[0]) setSelectedWorker(sessions[0].id); }, [selectedWorker, sessions]);
  React.useEffect(() => { const onKey = event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPaletteOpen(value => !value); } else if (event.key === "Escape") { if (paletteOpen) setPaletteOpen(false); else if (workerFocusId) setWorkerFocusId(null); else if (expandedTerminal) setExpandedTerminal(null); else if (inspectorOpen) setInspectorOpen(false); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [expandedTerminal, inspectorOpen, paletteOpen, workerFocusId]);
  React.useEffect(() => { if ((view === "agents" || paletteOpen) && !agentAdapters.length) { setAgentsLoading(true); missionApi().request("agents.list").then(value => setAgentAdapters(Array.isArray(value) ? value : [])).catch(value => setNotice(value.message || String(value))).finally(() => setAgentsLoading(false)); } }, [agentAdapters.length, paletteOpen, view]);
  React.useEffect(() => { if (view !== "projects") return; setProjectsLoading(true); missionApi().request("projects.list").then(setProjects).catch(value => setNotice(value.message || String(value))).finally(() => setProjectsLoading(false)); }, [view]);

  const dispatch = React.useCallback(async (type, id, fields = {}) => { const target = sessions.find(item => item.id === id); let confirmation; if (["kill", "remove"].includes(type)) { if (!window.confirm(type === "kill" ? `Stop ${target?.name || id}?` : `Remove ${target?.name || id}?`)) return; confirmation = `confirm:${type}:${id}`; } setNotice(`${type === "acknowledge" ? "Resolving" : "Working"}…`); try { const result = await missionApi().request("action.dispatch", { sessionId: id, action: { type, ...fields }, ...(confirmation ? { confirmation } : {}) }); if (result?.ok === false) throw new Error(result.error || "Action failed"); setNotice(type === "acknowledge" ? "Resolved" : "Done"); await refresh(); } catch (value) { setNotice(value.message || String(value)); } }, [refresh, sessions]);
  const focusWorker = React.useCallback(id => { setFocusedTerminal(id); setSelectedWorker(id); if (!terminalLayout.sessionIds.includes(id)) terminalLayout.setSlotSession(0, id); setView("workspace"); }, [terminalLayout]);
  const inspectWorker = React.useCallback(id => { setSelectedWorker(id); setWorkerFocusId(id); }, []);
  const saveWorker = React.useCallback(async value => { const editing = workerDialog?.mode === "edit"; const result = await missionApi().request("action.dispatch", { sessionId: editing ? workerDialog.configuration.id : null, action: editing ? { type: "reconfigure", patch: value } : { type: "create", definition: value } }); if (result?.ok === false) throw new Error(result.error || "Worker save failed"); await refresh(); setNotice(editing ? "Worker updated" : "Worker added"); }, [refresh, workerDialog]);
  const instantiateSavedCommand = React.useCallback(async commandId => { await missionApi().request("action.dispatch", { sessionId: null, action: { type: "instantiateSavedCommand", commandId } }); await refresh(); }, [refresh]);
  const createAgent = React.useCallback(async adapterId => { setAgentsLoading(true); try { const result = await missionApi().request("agent.create", { adapterId }); if (!result?.sessionId) throw new Error("Agent worker was created without a session ID"); const started = await missionApi().request("action.dispatch", { sessionId: result.sessionId, action: { type: "start" } }); if (started?.ok === false) throw new Error(started.error || "Agent CLI could not be started"); await refresh(); setSelectedWorker(result.sessionId); setNotice(`${adapterId} started in its terminal`); } catch (value) { await refresh(); setNotice(value.message || String(value)); } finally { setAgentsLoading(false); } }, [refresh]);
  const openProject = React.useCallback(async project => { if (!window.confirm(`Switch to ${project.name}? Running workers will stop safely first.`)) return; setProjectsLoading(true); try { await missionApi().request("project.open", { projectId: project.id, confirmation: `confirm:project.open:${project.id}` }); await refresh(); setView("groundstation"); } catch (value) { setNotice(value.message || String(value)); } finally { setProjectsLoading(false); } }, [refresh]);
  const chooseProject = React.useCallback(async () => { setProjectsLoading(true); try { const selection = await missionApi().request("project.choose"); if (!selection?.cancelled) setNotice("Project selected. Initialize it from its workspace configuration."); } catch (value) { setNotice(value.message || String(value)); } finally { setProjectsLoading(false); } }, []);

  const paletteItems = React.useMemo(() => [
    ...NAVIGATION.map(([id,label,icon]) => ({ id: `nav-${id}`, label, group: "Navigate", icon, run: () => setView(id) })),
    { id: "new-worker", label: "Add a new worker", group: "Action", icon: "plus", shortcut: "N", run: () => setWorkerDialog({ mode: "create" }) },
    ...sessions.map(item => ({ id: `worker-${item.id}`, label: item.name, group: `${item.status} worker`, icon: "terminal", run: () => focusWorker(item.id) })),
    ...activity.slice(-5).reverse().map(item => ({ id: `event-${item.sequence}`, label: eventTitle(item), group: "Recent history", icon: "history", run: () => setView("history") }))
  ], [activity, focusWorker, sessions]);

  if (loading && !state) return <div className="boot-screen"><div className="boot-orbit"><span>MC</span></div><p>Bringing your workspace online</p></div>;
  if (error && !state) return <div className="boot-screen boot-error"><div className="boot-orbit"><span>!</span></div><h1>Groundstation unavailable</h1><p>{error}</p><button className="primary-button" onClick={refresh}>Reconnect</button></div>;

  const renderView = () => {
    if (view === "groundstation") return <GroundstationView sessions={sessions} workspace={workspace} activity={activity} selectedId={selectedWorker} onSelect={setSelectedWorker} onFocus={inspectWorker} onAction={dispatch} onNavigate={setView}/>;
    if (view === "workspace") return <WorkspaceView sessions={sessions} terminalLayout={terminalLayout} focusedId={focusedTerminal} expandedId={expandedTerminal} inspectorOpen={inspectorOpen} terminalFontSize={preferences.terminalFontSize} onInspector={() => setInspectorOpen(value => !value)} onFocus={setFocusedTerminal} onExpand={setExpandedTerminal} onAction={dispatch}/>;
    if (view === "needs") return <NeedsView attention={attention} onAction={dispatch} onFocus={focusWorker}/>;
    if (view === "agents") return <AgentsView sessions={sessions} adapters={agentAdapters} loading={agentsLoading} onCreate={createAgent} onFocus={inspectWorker} onAction={dispatch}/>;
    if (view === "history") return <HistoryView events={activity}/>;
    if (view === "projects") return <ProjectsView data={projects} loading={projectsLoading} onChoose={chooseProject} onOpen={openProject} onRemove={async project => { await missionApi().request("project.removeRecent", { projectId: project.id }); setProjects(await missionApi().request("projects.list")); }}/>;
    return <SettingsView state={state} workspace={workspace} recovery={recovery} preferences={preferences} onPreference={updatePreference} onReset={resetPreferences}/>;
  };

  return <div className={`shell type-${preferences.typeScale} density-${preferences.density} motion-${preferences.motion} ${preferences.showCommandHints ? "show-command-hints" : "hide-command-hints"}`}>
    <aside className="rail"><div className="brand-mark"><span/><b>MC</b></div><nav aria-label="Mission Control navigation">{NAVIGATION.map(([id,label,icon]) => <button key={id} className={view === id ? "is-current" : ""} onClick={() => setView(id)} title={label}><Icon name={icon}/><span>{label}</span>{id === "needs" && attention.length > 0 && <b>{attention.length}</b>}</button>)}</nav><button className="rail-palette" onClick={() => setPaletteOpen(true)} title="Mission Command"><Icon name="command"/><span>Mission Command</span><kbd>⌃K</kbd></button><div className={`rail-health health-${health.tone}`}><i/><span>{health.label}</span></div></aside>
    <main className="main-area"><header className="mission-bar"><div className="project-identity"><button className="project-switcher" onClick={() => setView("projects")}><span>{(workspace?.name || "MC").slice(0,2).toUpperCase()}</span><div><strong>{workspace?.name || "Mission Control"}</strong><small>{workspace?.persistent ? "Persistent workspace" : "Local workspace"}</small></div><i>⌄</i></button></div><button className="mission-search" onClick={() => setPaletteOpen(true)}><Icon name="search" size={15}/><span>Search or run a command</span><kbd>Ctrl K</kbd></button><div className="mission-actions"><span className={`live-status health-${health.tone}`}><i/>{sessions.filter(item => item.isAlive).length} live</span>{savedCommands.length > 0 && <button onClick={() => setWorkerDialog({ mode: "presets" })}>Presets</button>}<button className="create-worker" onClick={() => setWorkerDialog({ mode: "create" })}><Icon name="plus" size={16}/> Worker</button></div></header>
      {notice && <div className="toast" role="status"><i/>{notice}<button onClick={() => setNotice("")}>×</button></div>}{error && <div className="toast toast-error">{error}</div>}
      <div className={`experience view-${view}`}>{renderView()}</div>
    </main>
    <CommandPalette open={paletteOpen} query={paletteQuery} onQuery={setPaletteQuery} items={paletteItems} onChoose={item => { item.run(); setPaletteOpen(false); setPaletteQuery(""); }} onClose={() => setPaletteOpen(false)}/>
    <WorkerFocusDialog session={sessions.find(item => item.id === workerFocusId)} activity={activity} onClose={() => setWorkerFocusId(null)} onOpenTerminal={id => { setWorkerFocusId(null); focusWorker(id); }}/>
    {workerDialog && <WorkerDialog initialMode={workerDialog.mode} configuration={workerDialog.configuration || null} savedCommands={savedCommands} onClose={() => setWorkerDialog(null)} onSave={saveWorker} onInstantiate={instantiateSavedCommand}/>}
  </div>;
}
