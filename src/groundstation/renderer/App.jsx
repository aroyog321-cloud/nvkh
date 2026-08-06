import React from "react";
import TerminalPane from "./TerminalPane.jsx";
import WorkerDialog from "./WorkerDialog.jsx";
import { missionApi } from "./missionApi.js";
import useMissionState from "./useMissionState.js";
import useTerminalLayout, { TERMINAL_LAYOUTS } from "./useTerminalLayout.js";

const NAVIGATION = [
  ["overview", "Overview", "⌁"],
  ["terminals", "Terminals", "▣"],
  ["attention", "Attention", "◇"],
  ["agents", "Agents", "◈"],
  ["activity", "Activity", "≋"],
  ["logs", "Logs", "⌗"],
  ["projects", "Projects", "⊞"],
  ["settings", "Settings", "⚙"]
];

const FUTURE_VIEWS = {
  agents: ["Agents", "Agent adapters and task supervision are not yet available."],
  logs: ["Logs", "Cross-worker log search is not yet available."],
  projects: ["Projects", "Multi-project orchestration is not yet available."],
  settings: ["Settings", "Groundstation settings are not yet available."]
};

function timeAgo(timestamp) {
  if (!Number.isFinite(timestamp)) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function eventTitle(event) {
  return String(event?.type || "engine:event")
    .replaceAll(":", " · ")
    .replaceAll("-", " ");
}

function stateHealth(sessions, workspace) {
  const attention = sessions.filter(session => session.attentionRequired).length;
  const failed = sessions.filter(session => session.status === "failed").length;
  const loadErrors = workspace?.loadErrorCount || 0;
  if (failed || loadErrors) return { label: "Degraded", tone: "danger" };
  if (attention) return { label: "Needs attention", tone: "warning" };
  return { label: "Healthy", tone: "healthy" };
}

function Metric({ label, value, detail, tone = "neutral" }) {
  return (
    <div className={`metric metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function SessionRows({ sessions, onAction, onEdit, onRename }) {
  if (!sessions.length) return <EmptyState title="No workers" detail="This workspace has no registered sessions." />;
  return (
    <div className="session-table">
      {sessions.map(session => (
        <div className="session-row" key={session.id}>
          <span className={`status-dot status-${session.status}`} />
          <div className="session-row__name">
            <strong>{session.name}</strong>
            <span>{session.command}</span>
          </div>
          <span className="session-row__status">{session.status}</span>
          <span className="session-row__time">{timeAgo(session.lastOutputAt)}</span>
          <div className="session-row__actions">
            {session.attentionRequired && (
              <button type="button" className="quiet-button" onClick={() => onAction("acknowledge", session.id)}>
                Acknowledge
              </button>
            )}
            <button
              type="button"
              className="quiet-button"
              onClick={() => onAction(session.isAlive ? "restart" : "start", session.id)}
            >
              {session.isAlive ? "Restart" : "Start"}
            </button>
            {session.isAlive && (
              <button type="button" className="quiet-button danger-button" onClick={() => onAction("kill", session.id)}>
                Stop
              </button>
            )}
            <button
              type="button"
              className={`quiet-button ${session.autoStart ? "policy-auto" : ""}`}
              title={session.autoStart ? "Restore policy: automatic" : "Restore policy: manual"}
              onClick={() => onAction("setAutoStart", session.id, { enabled: !session.autoStart })}
            >
              {session.autoStart ? "Auto" : "Manual"}
            </button>
            {!session.isAlive && (
              <button type="button" className="quiet-button" onClick={() => onEdit(session)}>Edit</button>
            )}
            <button type="button" className="quiet-button" onClick={() => onRename(session)}>Rename</button>
            <button type="button" className="quiet-button danger-button" onClick={() => onAction("remove", session.id)}>
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityList({ events, limit }) {
  const shown = limit ? events.slice(-limit).reverse() : [...events].reverse();
  if (!shown.length) return <EmptyState title="No activity yet" detail="Operational events will appear here as workers change." />;
  return (
    <div className="activity-list">
      {shown.map(event => (
        <div className="activity-item" key={`${event.sequence}-${event.type}`}>
          <span className={`activity-marker ${String(event.type).includes("error") || String(event.type).includes("failed") ? "is-danger" : ""}`} />
          <div>
            <strong>{eventTitle(event)}</strong>
            <span>{event.name || event.id || event.operation || "Workspace"}</span>
          </div>
          <time>{timeAgo(event.timestamp)}</time>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title, detail }) {
  return (
    <div className="empty-state">
      <span>⌁</span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

function TerminalSlot({ session, sessions, active, expanded, onFocus, onExpand, onAction, onSelect }) {
  if (!session) {
    return (
      <article className="terminal-pane terminal-pane-empty">
        <span>＋</span>
        <strong>Empty terminal slot</strong>
        <p>Choose a workspace worker for this pane.</p>
        <select value="" onChange={event => onSelect(event.target.value)} aria-label="Choose worker for empty terminal pane">
          <option value="">Choose worker…</option>
          {sessions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      </article>
    );
  }
  return (
    <TerminalPane
      session={session}
      sessions={sessions}
      active={active}
      expanded={expanded}
      onFocus={onFocus}
      onToggleExpanded={onExpand}
      onAction={onAction}
      onSelectSession={onSelect}
    />
  );
}

function TerminalsView({ sessions, layout, sessionIds, focusedId, expandedId, onFocus, onExpand, onAction, onLayout, onSelectSlot }) {
  const slots = sessionIds.map(id => sessions.find(session => session.id === id) || null);
  const visible = expandedId ? slots.filter(session => session?.id === expandedId) : slots;
  return (
    <div className="terminals-workspace">
      <div className="terminal-toolbar" aria-label="Terminal layout">
        <span>Layout</span>
        {TERMINAL_LAYOUTS.map(option => (
          <button
            key={option.id}
            type="button"
            className={layout.id === option.id ? "is-current" : ""}
            aria-pressed={layout.id === option.id}
            onClick={() => onLayout(option.id)}
          >
            {option.label}
          </button>
        ))}
        <small>{sessions.length} workspace worker{sessions.length === 1 ? "" : "s"}</small>
      </div>
      <div className={`terminal-grid ${layout.className} ${expandedId ? "has-expanded" : ""}`}>
        {visible.map((session, visibleIndex) => {
          const slotIndex = expandedId ? slots.findIndex(item => item?.id === expandedId) : visibleIndex;
          const slotKey = expandedId || `slot-${slotIndex}`;
          return (
            <TerminalSlot
              key={slotKey}
              session={session}
              sessions={sessions}
              active={Boolean(session && focusedId === session.id)}
              expanded={Boolean(session && expandedId === session.id)}
              onFocus={() => session && onFocus(session.id)}
              onExpand={() => session && onExpand(expandedId === session.id ? null : session.id)}
              onAction={onAction}
              onSelect={id => onSelectSlot(slotIndex, id)}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  const { state, loading, error, refresh } = useMissionState();
  const [view, setView] = React.useState("overview");
  const [focusedTerminal, setFocusedTerminal] = React.useState(null);
  const [expandedTerminal, setExpandedTerminal] = React.useState(null);
  const [notice, setNotice] = React.useState("");
  const [workerDialog, setWorkerDialog] = React.useState(null);

  const sessions = state?.sessions || [];
  const workspace = state?.workspace || null;
  const activity = state?.activity?.events || [];
  const savedCommands = state?.savedCommands || [];
  const running = sessions.filter(session => session.isAlive).length;
  const attention = sessions.filter(session => session.attentionRequired);
  const failed = sessions.filter(session => session.status === "failed").length;
  const health = stateHealth(sessions, workspace);
  const terminalLayout = useTerminalLayout(workspace, sessions);

  React.useEffect(() => {
    if (!focusedTerminal && sessions.length) setFocusedTerminal(sessions[0].id);
    if (focusedTerminal && !sessions.some(session => session.id === focusedTerminal)) {
      setFocusedTerminal(sessions[0]?.id || null);
    }
    if (expandedTerminal && !sessions.some(session => session.id === expandedTerminal)) {
      setExpandedTerminal(null);
    }
    if (expandedTerminal && !terminalLayout.sessionIds.includes(expandedTerminal)) {
      setExpandedTerminal(null);
    }
    if (focusedTerminal && !terminalLayout.sessionIds.includes(focusedTerminal)) {
      setFocusedTerminal(terminalLayout.sessionIds.find(Boolean) || null);
    }
  }, [expandedTerminal, focusedTerminal, sessions, terminalLayout.sessionIds]);

  const dispatch = React.useCallback(async (type, id, actionFields = {}) => {
    const target = sessions.find(session => session.id === id);
    let confirmation;
    if (type === "kill" || type === "remove") {
      const accepted = window.confirm(type === "kill"
        ? `Stop ${target?.name || id}? The current PTY process will be terminated.`
        : `Remove ${target?.name || id} from this workspace? A running PTY will be stopped first.`);
      if (!accepted) return;
      confirmation = `confirm:${type}:${id}`;
    }
    const progressLabels = {
      acknowledge: "Acknowledging…",
      setAutoStart: "Saving restore policy…",
      remove: "Removing worker…"
    };
    setNotice(progressLabels[type] || `${type[0].toUpperCase()}${type.slice(1)}ing…`);
    try {
      const result = await missionApi().request("action.dispatch", {
        sessionId: id,
        action: { type, ...actionFields },
        ...(confirmation ? { confirmation } : {})
      });
      if (result?.ok === false) throw new Error(result.error || `${type} failed`);
      const successLabels = {
        acknowledge: "Attention acknowledged",
        setAutoStart: `Restore policy changed to ${actionFields.enabled ? "automatic" : "manual"}`,
        remove: "Worker removed"
      };
      setNotice(successLabels[type] || `${type[0].toUpperCase()}${type.slice(1)} requested`);
      await refresh();
    } catch (actionError) {
      setNotice(actionError instanceof Error ? actionError.message : String(actionError));
    }
  }, [refresh, sessions]);

  const renameWorker = React.useCallback(async session => {
    const name = window.prompt("Worker name", session.name);
    if (name === null || name.trim() === session.name) return;
    if (!name.trim()) {
      setNotice("Worker name cannot be empty");
      return;
    }
    await dispatch("rename", session.id, { name: name.trim() });
  }, [dispatch]);

  const editWorker = React.useCallback(async session => {
    if (session.isAlive) {
      setNotice("Stop the worker before editing its launch configuration");
      return;
    }
    setNotice("Loading worker configuration…");
    try {
      const configuration = await missionApi().request("session.configuration.get", { sessionId: session.id });
      setWorkerDialog({ mode: "edit", configuration });
      setNotice("");
    } catch (configurationError) {
      setNotice(configurationError instanceof Error ? configurationError.message : String(configurationError));
    }
  }, []);

  const saveWorker = React.useCallback(async value => {
    const editing = workerDialog?.mode === "edit";
    const sessionId = editing ? workerDialog.configuration.id : null;
    const action = editing
      ? { type: "reconfigure", patch: value }
      : { type: "create", definition: value };
    const result = await missionApi().request("action.dispatch", { sessionId, action });
    if (result?.ok === false) throw new Error(result.error || "Worker save failed");
    setNotice(editing ? "Worker configuration saved" : value.autoStart ? "Worker added and started" : "Manual worker added");
    await refresh();
  }, [refresh, workerDialog]);

  const instantiateSavedCommand = React.useCallback(async commandId => {
    const result = await missionApi().request("action.dispatch", {
      sessionId: null,
      action: { type: "instantiateSavedCommand", commandId }
    });
    if (result?.ok === false) throw new Error(result.error || "Saved preset could not be added");
    setNotice("Saved preset added to workspace");
    await refresh();
  }, [refresh]);

  if (loading && !state) {
    return <div className="boot-screen"><span className="boot-mark">MC</span><p>Connecting to Groundstation…</p></div>;
  }

  if (error && !state) {
    return (
      <div className="boot-screen boot-error">
        <span className="boot-mark">!</span>
        <h1>Groundstation unavailable</h1>
        <p>{error}</p>
        <button type="button" className="primary-button" onClick={() => void refresh()}>Retry connection</button>
      </div>
    );
  }

  const renderView = () => {
    if (view === "overview") {
      return (
        <div className="view-stack">
          <div className="metrics-grid">
            <Metric label="Workspace health" value={health.label} detail={workspace?.persistent ? "Persistent workspace" : "In-memory workspace"} tone={health.tone} />
            <Metric label="Workers online" value={`${running} / ${sessions.length}`} detail={`${sessions.length - running} stopped or idle`} />
            <Metric label="Attention queue" value={attention.length} detail={attention.length ? "Operator review required" : "No blocked workers"} tone={attention.length ? "warning" : "healthy"} />
            <Metric label="Failures" value={failed + (workspace?.loadErrorCount || 0)} detail="Runtime and load errors" tone={failed || workspace?.loadErrorCount ? "danger" : "neutral"} />
          </div>
          <div className="overview-columns">
            <section className="panel overview-workers">
              <PanelHeading
                title="Workers"
                detail="Live workspace processes"
                action={<div className="heading-actions"><button type="button" className="text-button" onClick={() => setWorkerDialog({ mode: "create" })}>Add worker</button><button type="button" className="text-button" onClick={() => setView("terminals")}>Open terminals</button></div>}
              />
              <SessionRows sessions={sessions} onAction={dispatch} onEdit={editWorker} onRename={renameWorker} />
            </section>
            <section className="panel overview-activity">
              <PanelHeading title="Recent activity" detail={`Sequence ${state?.sequence || 0}`} action={<button type="button" className="text-button" onClick={() => setView("activity")}>View all</button>} />
              <ActivityList events={activity} limit={7} />
            </section>
          </div>
        </div>
      );
    }
    if (view === "terminals") {
      return (
        <TerminalsView
          sessions={sessions}
          layout={terminalLayout.layout}
          sessionIds={terminalLayout.sessionIds}
          focusedId={focusedTerminal}
          expandedId={expandedTerminal}
          onFocus={setFocusedTerminal}
          onExpand={setExpandedTerminal}
          onAction={dispatch}
          onLayout={terminalLayout.setLayoutId}
          onSelectSlot={terminalLayout.setSlotSession}
        />
      );
    }
    if (view === "attention") {
      return (
        <section className="panel full-panel">
          <PanelHeading title="Attention queue" detail="Sticky supervision signals that require an operator decision" />
          {attention.length ? <SessionRows sessions={attention} onAction={dispatch} onEdit={editWorker} onRename={renameWorker} /> : <EmptyState title="Queue clear" detail="No worker currently requires attention." />}
        </section>
      );
    }
    if (view === "activity") {
      return (
        <section className="panel full-panel">
          <PanelHeading title="Activity" detail="Ordered, durable engine events" />
          <ActivityList events={activity} />
        </section>
      );
    }
    const future = FUTURE_VIEWS[view];
    return <EmptyState title={future[0]} detail={future[1]} />;
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span>MC</span><div><strong>Mission Control</strong><small>Groundstation</small></div></div>
        <nav aria-label="Groundstation navigation">
          {NAVIGATION.map(([id, label, icon]) => (
            <button key={id} type="button" className={view === id ? "is-current" : ""} onClick={() => setView(id)}>
              <span>{icon}</span>{label}
              {id === "attention" && attention.length > 0 && <b>{attention.length}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-status">
          <span className={`health-light health-${health.tone}`} />
          <div><strong>{health.label}</strong><small>Engine contract v{state?.contractVersion || "—"}</small></div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div>
            <span className="eyebrow">WORKSPACE</span>
            <h1>{workspace?.name || "Mission Control"}</h1>
          </div>
          <div className="topbar-facts">
            <span><i className="health-light health-healthy" /> Engine online</span>
            <span>{running} running</span>
            <span>{attention.length} attention</span>
          </div>
        </header>
        {notice && <div className="notice" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss notification">×</button></div>}
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <div className={`content view-${view}`}>
          <div className="page-heading">
            <div><span className="eyebrow">GROUNDSTATION</span><h2>{NAVIGATION.find(item => item[0] === view)?.[1]}</h2></div>
            <div className="page-heading__actions">
              {(view === "overview" || view === "terminals") && (
                <>
                  {savedCommands.length > 0 && <button type="button" className="quiet-button" onClick={() => setWorkerDialog({ mode: "presets" })}>Saved presets <b>{savedCommands.filter(command => command.available).length}</b></button>}
                  <button type="button" className="primary-button" onClick={() => setWorkerDialog({ mode: "create" })}>＋ Add worker</button>
                </>
              )}
              <span className="workspace-path" title={workspace?.path || ""}>{workspace?.path || "Unsaved workspace"}</span>
            </div>
          </div>
          {renderView()}
        </div>
      </main>
      {workerDialog && (
        <WorkerDialog
          initialMode={workerDialog.mode}
          configuration={workerDialog.configuration || null}
          savedCommands={savedCommands}
          onClose={() => setWorkerDialog(null)}
          onSave={saveWorker}
          onInstantiate={instantiateSavedCommand}
        />
      )}
    </div>
  );
}

function PanelHeading({ title, detail, action }) {
  return (
    <header className="panel-heading">
      <div><h3>{title}</h3><p>{detail}</p></div>
      {action}
    </header>
  );
}
