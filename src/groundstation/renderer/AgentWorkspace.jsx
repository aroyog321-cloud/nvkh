import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { missionApi } from "./missionApi.js";

function agentName(agent) {
  return String(agent?.name || "AI agent").replace(/\s+agent$/i, "");
}

function phaseLabel(value) {
  return ({ planned: "Planned", starting: "Starting", executing: "Executing", waiting: "Needs your review", verifying: "Verifying evidence", review: "Ready for review", completed: "Completed", failed: "Failed", cancelled: "Cancelled" })[value] || "Standing by";
}

function phaseFor(agent, mission) {
  if (mission?.phase) return phaseLabel(mission.phase);
  if (agent?.attentionRequired) return "Needs your review";
  if (agent?.status === "failed") return "Failed";
  if (agent?.status === "starting") return "Starting";
  if (agent?.isAlive) return "Working";
  return "Standing by";
}

function approvalTime(value) {
  const minutes = Math.max(0, Math.ceil((Number(value) - Date.now()) / 60000));
  return `${minutes}m`;
}

function stateTone(agent) {
  if (agent?.status === "failed") return "failed";
  if (agent?.attentionRequired) return "attention";
  if (agent?.isAlive) return "running";
  return "idle";
}

function timeAgo(timestamp) {
  if (!Number.isFinite(timestamp)) return "No output yet";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 45) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function runtime(agent) {
  const startedAt = Number(agent?.startTime || agent?.startedAt);
  if (!agent?.isAlive || !Number.isFinite(startedAt)) return "Idle";
  const minutes = Math.max(0, Math.floor((Date.now() - startedAt) / 60000));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function eventLabel(event) {
  return String(event?.type || "Workspace event").replaceAll(":", " · ").replaceAll("-", " ");
}

function eventActor(event) {
  return event?.name || event?.id || event?.sessionId || "Mission Control";
}

function displayCommand(agent) {
  const args = Array.isArray(agent?.args) ? agent.args : [];
  const commandIndex = args.findIndex(arg => String(arg).toLowerCase() === "/c");
  return commandIndex >= 0 && args[commandIndex + 1]
    ? args.slice(commandIndex + 1).join(" ")
    : [agent?.command, ...args].filter(Boolean).join(" ");
}

function summaryFor(agent, recentActivity, mission) {
  if (agent?.status === "failed") {
    return agent.spawnError || `${agentName(agent)} stopped unexpectedly. Review its history or open the terminal for the exact CLI failure.`;
  }
  if (agent?.attentionRequired) {
    return agent.attentionReason || `${agentName(agent)} is waiting for a decision before it can continue.`;
  }
  if (agent?.status === "starting") return `${agentName(agent)} is starting its local CLI inside an engine-owned terminal.`;
  if (agent?.isAlive) {
    const latest = recentActivity[0];
    return latest
      ? `${agentName(agent)} is running. The latest recorded event was ${eventLabel(latest).toLowerCase()} ${timeAgo(latest.timestamp).toLowerCase()}.`
      : `${agentName(agent)} is running under Mission Control supervision. No recent lifecycle event requires attention.`;
  }
  if (mission?.title) return `${agentName(agent)} is standing by with the mission “${mission.title}”. Start it when you want work to continue.`;
  return `${agentName(agent)} is configured and ready. Starting it launches ${displayCommand(agent)} in its existing engine-owned terminal.`;
}

function evidenceSummary(item) {
  if (item?.summary) return item.summary;
  if (item?.message) return item.message;
  if (item?.type === "diff") return "Source changes recorded";
  if (item?.type === "test") return "Test result recorded";
  if (item?.type === "command") return "Command execution recorded";
  if (item?.type === "result") return "Agent result recorded";
  return "Structured mission evidence";
}

function evidenceDetail(item) {
  if (item?.type === "diff") {
    const paths = Number(item?.file?.changedPaths || item?.facts?.changedPaths || 0);
    const branch = item?.file?.branch || item?.facts?.branch;
    return [paths ? `${paths} changed path${paths === 1 ? "" : "s"}` : null, branch ? `branch ${branch}` : null].filter(Boolean).join(" · ") || "Change summary retained";
  }
  if (item?.type === "test") {
    const passed = Number(item?.facts?.passed || 0);
    const failed = Number(item?.facts?.failed || 0);
    return failed ? `${failed} failed · ${passed} passed` : passed ? `${passed} passed` : "Test outcome retained";
  }
  if (item?.type === "command") {
    const scopes = Array.isArray(item?.facts?.requestedScopes) ? item.facts.requestedScopes : [];
    return scopes.length ? `Scopes: ${scopes.join(" · ")}` : "Execution metadata retained";
  }
  return String(item?.category || "Operational record").replaceAll("-", " ");
}

function AgentPicker({ open, adapters, agents, loading, onClose, onAdd }) {
  const availableCount = adapters.filter(adapter => adapter.available !== false).length;
  return <Dialog.Root open={open} onOpenChange={value => !value && onClose()}>
    <Dialog.Portal>
      <Dialog.Overlay className="agent-picker-backdrop"/>
      <Dialog.Content className="agent-picker" aria-describedby="agent-picker-description">
        <header><div><span className="section-kicker">AGENT DEPLOYMENT</span><Dialog.Title>Expand your AI crew</Dialog.Title><Dialog.Description id="agent-picker-description">Choose an installed local agent. Mission Control creates a supervised worker and starts its official CLI.</Dialog.Description></div><Dialog.Close asChild><button aria-label="Close add agent dialog">×</button></Dialog.Close></header>
        <div className="agent-picker-summary"><div><span className="agent-picker-summary__mark">AI</span><span><strong>{availableCount} agents ready</strong><small>{adapters.length - availableCount} unavailable on this machine</small></span></div><div><span>ENGINE OWNED</span><span>LOCAL AUTH</span><span>MULTI-AGENT READY</span></div></div>
        <div className="agent-picker-label"><span>AVAILABLE AGENTS</span><small>Select one to add and start</small></div>
        <div className="agent-picker-grid">{adapters.map(adapter => {
          const count = agents.filter(agent => agent.id.startsWith(`agent-${adapter.id}-`)).length;
          const unavailable = adapter.available === false;
          return <button key={adapter.id} className={unavailable ? "is-unavailable" : ""} disabled={loading || unavailable} onClick={() => void onAdd(adapter.id)}>
            <span className="agent-picker-mark">{adapter.name.slice(0, 1)}</span>
            <span className="agent-picker-copy"><span><strong>{adapter.name}</strong><i>{unavailable ? "Not installed" : "Ready"}</i></span><small>{unavailable ? `${adapter.command} was not found on PATH` : adapter.description}</small><em>{count ? `${count} already supervised in this workspace` : `Runs ${adapter.command}`}</em></span>
            <span className="agent-picker-action">{unavailable ? "Unavailable" : loading ? "Starting…" : <>Add agent <b>→</b></>}</span>
          </button>;
        })}</div>
        <footer><span><b>Private by default.</b> Uses engine-owned terminals and each CLI’s existing authentication.</span><Dialog.Close asChild><button>Cancel</button></Dialog.Close></footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

const MISSION_SCOPE_CHOICES = [
  ["read", "Read project context"],
  ["write", "Change project files"],
  ["execute", "Run approved commands"],
  ["network", "Use network access"]
];

const CHECKPOINT_CHOICES = [
  ["changes", "Changes recorded"],
  ["tests", "Tests pass"],
  ["build", "Build completes"],
  ["service", "Service becomes ready"],
  ["manual", "Operator review"]
];

function MissionEditor({ open, agent, sessions, mission, onClose, onSaved }) {
  const [title, setTitle] = React.useState("");
  const [scopes, setScopes] = React.useState(["read"]);
  const [checkpoints, setCheckpoints] = React.useState([]);
  const [relatedWorkerIds, setRelatedWorkerIds] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    if (!open) return;
    setTitle(mission?.title || "");
    setScopes(mission?.scopes?.length ? mission.scopes : ["read"]);
    setCheckpoints((mission?.checkpoints || []).map(item => ({ id: item.id, title: item.title, verification: item.verification })));
    setRelatedWorkerIds(mission?.relatedWorkerIds || []);
    setError("");
  }, [open, mission?.id]);
  const toggleCheckpoint = ([verification, label]) => setCheckpoints(current => current.some(item => item.verification === verification)
    ? current.filter(item => item.verification !== verification)
    : [...current, { id: `checkpoint-${verification}`, title: label, verification }]);
  const save = async () => {
    setBusy(true); setError("");
    try {
      await missionApi().request("mission.save", { mission: { agentId: agent.id, title, scopes, checkpoints, relatedWorkerIds } });
      await onSaved(); onClose();
    } catch (value) { setError(value.message || String(value)); }
    finally { setBusy(false); }
  };
  return <Dialog.Root open={open} onOpenChange={value => !value && onClose()}><Dialog.Portal><Dialog.Overlay className="agent-picker-backdrop"/><Dialog.Content className="mission-editor" aria-describedby="mission-editor-description"><header><div><span className="section-kicker">MISSION CONTRACT</span><Dialog.Title>{mission ? "Refine supervised mission" : "Assign supervised mission"}</Dialog.Title><Dialog.Description id="mission-editor-description">Define observable checkpoints and bounded authority. Mission Control never invents percentage progress or agent reasoning.</Dialog.Description></div><Dialog.Close asChild><button aria-label="Close mission editor">×</button></Dialog.Close></header><div className="mission-editor-body"><label className="mission-title-field"><span>MISSION</span><input value={title} maxLength={240} autoFocus placeholder="Example: Verify the Windows release candidate" onChange={event => setTitle(event.target.value)}/><small>{title.length}/240 · a durable objective, not a chat prompt</small></label><section><header><div><span>AUTHORITY</span><strong>Explicit mission scopes</strong></div><small>Additional authority requires a one-time Needs You approval.</small></header><div className="mission-choice-grid">{MISSION_SCOPE_CHOICES.map(([id,label]) => <label key={id}><input type="checkbox" checked={scopes.includes(id)} onChange={() => setScopes(current => current.includes(id) ? current.filter(scope => scope !== id) : [...current,id])}/><i/><span><strong>{id}</strong><small>{label}</small></span></label>)}</div></section><section><header><div><span>EVIDENCE PLAN</span><strong>Observable checkpoints</strong></div><small>Only matching engine evidence verifies a checkpoint.</small></header><div className="mission-choice-grid">{CHECKPOINT_CHOICES.map(choice => <label key={choice[0]}><input type="checkbox" checked={checkpoints.some(item => item.verification === choice[0])} onChange={() => toggleCheckpoint(choice)}/><i/><span><strong>{choice[1]}</strong><small>{choice[0] === "manual" ? "Requires explicit operator verification" : `Verified from ${choice[0]} evidence`}</small></span></label>)}</div></section><section><header><div><span>RELATED WORKERS</span><strong>Mission dependencies</strong></div><small>Relationships are explicit; none are inferred.</small></header><div className="mission-worker-picks">{sessions.filter(item => item.id !== agent.id).map(worker => <label key={worker.id}><input type="checkbox" checked={relatedWorkerIds.includes(worker.id)} onChange={() => setRelatedWorkerIds(current => current.includes(worker.id) ? current.filter(id => id !== worker.id) : [...current,worker.id])}/><span><i className={`status-${worker.status}`}/><strong>{worker.name}</strong><small>{worker.status}</small></span></label>)}</div></section>{error && <p role="alert">{error}</p>}</div><footer><span>Engine-owned lifecycle · bounded evidence · no chain-of-thought</span><div><Dialog.Close asChild><button>Cancel</button></Dialog.Close><button className="primary" disabled={busy || !title.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save mission"}</button></div></footer></Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function MissionApprovalQueue({ visible = true, onPendingChange }) {
  const [approvals, setApprovals] = React.useState([]);
  const [busy, setBusy] = React.useState("");
  const [message, setMessage] = React.useState("");
  const refresh = React.useCallback(async () => {
    try {
      const records = await missionApi().request("mission.approval.list");
      setApprovals(Array.isArray(records) ? records : []);
      onPendingChange?.((records || []).filter(item => item.state === "pending").length);
    } catch { setApprovals([]); onPendingChange?.(0); }
  }, [onPendingChange]);
  React.useEffect(() => { void refresh(); }, [refresh]);
  const pending = approvals.filter(item => item.state === "pending");
  const resolve = async (approval, decision) => {
    setBusy(approval.id); setMessage("");
    try {
      await missionApi().request("mission.approval.resolve", { missionId: approval.missionId, approvalId: approval.id, decision, confirmation: `confirm:mission.approval:${approval.missionId}:${approval.id}:${decision}` });
      setMessage(decision === "approve" ? "One-time authority approved. No command has executed yet." : "Permission denied. No command executed.");
      await refresh();
    } catch (value) { setMessage(value.message || String(value)); }
    finally { setBusy(""); }
  };
  if (!visible || !pending.length) return null;
  return <section className="mission-approval-queue"><header><div><span className="section-kicker">AGENT MISSION APPROVALS</span><strong>{pending.length} permission request{pending.length === 1 ? "" : "s"} waiting</strong></div><small>One-time authority · no automatic execution</small></header>{message && <p role="status">{message}</p>}<div>{pending.map((approval,index) => <article key={approval.id}><span className="mission-approval-index">A{String(index + 1).padStart(2,"0")}</span><div><div><em>PERMISSION REQUEST</em><time>expires in {approvalTime(approval.expiresAt)}</time></div><strong>{approval.missionTitle}</strong><dl><div><dt>Scopes</dt><dd>{approval.requestedScopes.join(" · ")}</dd></div><div><dt>Reason</dt><dd>{approval.reason}</dd></div><div><dt>Impact</dt><dd>{approval.impact}</dd></div></dl><small>Approval can authorize one recorded instruction. It does not write terminal input or own a process.</small></div><footer><button disabled={Boolean(busy)} onClick={() => void resolve(approval,"deny")}>Deny</button><button className="approve" disabled={Boolean(busy)} onClick={() => void resolve(approval,"approve")}>{busy === approval.id ? "Resolving…" : "Approve once"}</button></footer></article>)}</div></section>;
}

export default function AgentWorkspace({ sessions, activity, adapters, loading, selectedId, onSelect, onCreate, onAction, onOpenTerminal }) {
  const agents = sessions.filter(item => item.id.startsWith("agent-"));
  const selected = agents.find(item => item.id === selectedId) || agents[0] || null;
  const [addOpen, setAddOpen] = React.useState(false);
  const [missionOpen, setMissionOpen] = React.useState(false);
  const [missions, setMissions] = React.useState([]);
  const [panel, setPanel] = React.useState("summary");
  const missionActivitySequence = [...activity].reverse().find(event => String(event.type || "").startsWith("mission:"))?.sequence || 0;

  const refreshMissions = React.useCallback(async () => {
    try { const value = await missionApi().request("mission.list"); setMissions(Array.isArray(value) ? value : []); }
    catch { setMissions([]); }
  }, []);
  React.useEffect(() => { void refreshMissions(); }, [selected?.id, missionActivitySequence, refreshMissions]);

  React.useEffect(() => { setPanel("summary"); }, [selected?.id]);

  const relatedActivity = React.useMemo(() => {
    if (!selected) return [];
    return activity.filter(event => event.id === selected.id || event.sessionId === selected.id || event.name === selected.name).slice(-12).reverse();
  }, [activity, selected]);

  const mission = selected
    ? missions.find(item => item.agentId === selected.id && item.status === "active") || [...missions].reverse().find(item => item.agentId === selected.id) || null
    : null;
  const evidence = Array.isArray(mission?.evidence) ? [...mission.evidence].reverse() : [];
  const checkpoints = Array.isArray(mission?.checkpoints) ? mission.checkpoints : [];
  const approvals = Array.isArray(mission?.approvals) ? [...mission.approvals].reverse() : [];
  const lifecycle = Array.isArray(mission?.lifecycle) ? [...mission.lifecycle].reverse() : [];
  const liveFiles = Array.isArray(selected?.evidence?.git?.changedFiles) ? selected.evidence.git.changedFiles.slice(0, 24) : [];
  const changedFiles = evidence.reduce((total, item) => total + (item.type === "diff" ? Number(item?.file?.changedPaths || item?.facts?.changedPaths || 0) : 0), 0);
  const checks = evidence.filter(item => ["test", "command"].includes(item.type)).length;
  const risks = relatedActivity.filter(item => /failed|error|attention/i.test(String(item.type))).length + (selected?.attentionRequired ? 1 : 0);
  const activeAgents = agents.filter(agent => agent.isAlive).length;
  const attentionAgents = agents.filter(agent => agent.attentionRequired || agent.status === "failed").length;
  // One brief per agent, keyed by id. The roster row is now the only place
  // that reports what each agent is doing, so every agent needs a brief — not
  // just the handful the removed duplicate summary grid had room to show.
  const agentBriefs = new Map(agents.map(agent => {
    const agentMission = missions.find(item => item.agentId === agent.id && item.status === "active") || [...missions].reverse().find(item => item.agentId === agent.id) || null;
    const recent = activity.filter(event => event.id === agent.id || event.sessionId === agent.id || event.name === agent.name).slice(-6).reverse();
    return [agent.id, { mission: agentMission, summary: agentMission?.currentAction?.summary || summaryFor(agent, recent, agentMission) }];
  }));

  const addAgent = async adapterId => {
    setAddOpen(false);
    await onCreate(adapterId);
  };

  const verifyCheckpoint = async checkpoint => {
    await missionApi().request("mission.checkpoint.verify", { missionId: mission.id, checkpointId: checkpoint.id, confirmation: `confirm:mission.checkpoint:${mission.id}:${checkpoint.id}` });
    await refreshMissions();
  };

  const transitionMission = async state => {
    await missionApi().request("mission.transition", { missionId: mission.id, state, confirmation: `confirm:mission.transition:${mission.id}:${state}` });
    await refreshMissions();
  };

  if (!agents.length) return <div className="agent-operations agent-operations-empty">
    <section><span className="agent-empty-mark">AI</span><span className="section-kicker">AI WORKFORCE</span><h2>Add your first supervised agent</h2><p>Mission Control launches an installed, allow-listed local CLI and gives you one focused place to review its state, history and durable evidence.</p><button className="agent-primary-action" onClick={() => setAddOpen(true)} disabled={loading || !adapters.length}>+ Add agent</button></section>
    <AgentPicker open={addOpen} adapters={adapters} agents={agents} loading={loading} onClose={() => setAddOpen(false)} onAdd={addAgent}/>
  </div>;

  return <div className="agent-operations agent-operations-v2">
    <header className="agent-workforce-overview"><div><span className="section-kicker">AI WORKFORCE</span><h1>Supervised agents</h1><p>One truthful summary of how many agents exist and what each has reported doing.</p></div><div className="agent-workforce-counts"><span><small>TOTAL</small><strong>{agents.length}</strong></span><span><small>ACTIVE</small><strong>{activeAgents}</strong></span><span className={attentionAgents ? "has-risk" : ""}><small>NEEDS YOU</small><strong>{attentionAgents}</strong></span><span><small>STANDING BY</small><strong>{agents.length - activeAgents}</strong></span></div><button className="agent-add-more" onClick={() => setAddOpen(true)} disabled={loading || !adapters.length}>+ Add more agents</button></header>
    {/* One roster, not two. Identity, reported phase and the observable
        one-line activity live in the same row, so WHAT THEY ARE DOING is
        answered in the list the operator is already scanning. */}
    <section className="agent-roster-strip"><header><div><span className="section-kicker">WHAT THEY ARE DOING</span><strong>All agents</strong></div><small>Observable state only · no private reasoning</small></header><div className="agent-roster-list" aria-label="Supervised agents">{agents.map(agent => { const brief = agentBriefs.get(agent.id); return <button key={agent.id} aria-current={selected?.id === agent.id ? "true" : undefined} className={selected?.id === agent.id ? "is-selected" : ""} onClick={() => onSelect(agent.id)}><span className={`agent-roster-avatar tone-${stateTone(agent)}`}>{agentName(agent).slice(0, 2).toUpperCase()}<i/></span><span className="agent-roster-copy"><strong>{agentName(agent)}</strong><small>{phaseFor(agent, brief?.mission)}</small><span className="agent-roster-summary">{brief?.summary}</span></span><b>{runtime(agent)}</b></button>; })}<button className="agent-roster-add" onClick={() => setAddOpen(true)} disabled={loading || !adapters.length}><span>+</span><span><strong>Add another</strong><small>Claude, Codex, Gemini or OpenCode</small></span></button></div></section>

    {selected && <main className="agent-operations__detail">
      <header className="agent-detail-header"><div className={`agent-detail-avatar tone-${stateTone(selected)}`}>{agentName(selected).slice(0, 2).toUpperCase()}<i/></div><div className="agent-detail-title"><span className="section-kicker">AGENT OPERATIONS</span><h1>{agentName(selected)}</h1><span className={`agent-state state-${selected.status}`}>{phaseFor(selected, mission)}</span></div><div className="agent-detail-actions"><button onClick={() => setMissionOpen(true)}>{mission ? "Edit mission" : "Assign mission"}</button>{selected.attentionRequired && <button className="attention" onClick={() => onAction("acknowledge", selected.id)}>Acknowledge</button>}<button onClick={() => onOpenTerminal(selected.id)}>Open terminal</button>{selected.isAlive ? <button className="danger" onClick={() => onAction("kill", selected.id)}>Stop</button> : <button className="primary" onClick={() => onAction("start", selected.id)}>Start</button>}</div></header>

      <nav className="agent-detail-tabs" role="tablist" aria-label="Selected agent details"><button role="tab" aria-selected={panel === "summary"} className={panel === "summary" ? "is-current" : ""} onClick={() => setPanel("summary")}>Summary</button><button role="tab" aria-selected={panel === "plan"} className={panel === "plan" ? "is-current" : ""} onClick={() => setPanel("plan")}>Progress <span>{mission?.progress?.verified || 0}/{mission?.progress?.total || 0}</span></button><button role="tab" aria-selected={panel === "history"} className={panel === "history" ? "is-current" : ""} onClick={() => setPanel("history")}>Lifecycle <span>{lifecycle.length}</span></button><button role="tab" aria-selected={panel === "evidence"} className={panel === "evidence" ? "is-current" : ""} onClick={() => setPanel("evidence")}>Evidence <span>{evidence.length}</span></button><button role="tab" aria-selected={panel === "approvals"} className={panel === "approvals" ? "is-current" : ""} onClick={() => setPanel("approvals")}>Approvals <span>{approvals.filter(item => item.state === "pending").length}</span></button></nav>

      <div className="agent-detail-scroll">
        {panel === "summary" && <div className="agent-summary-view">
          <section className={`agent-status-brief tone-${stateTone(selected)}`}><div><span className="section-kicker">CURRENT STATE</span><h2>{phaseFor(selected, mission)}</h2><p>{mission?.currentAction?.summary || summaryFor(selected, relatedActivity, mission)}</p>{mission?.currentAction && <small className="agent-truth-source">Observed from {String(mission.currentAction.source).replaceAll("-"," ")} · {timeAgo(mission.currentAction.observedAt)}</small>}</div><dl><div><dt>Official command</dt><dd><code>{displayCommand(selected)}</code></dd></div><div><dt>Runtime</dt><dd>{runtime(selected)}</dd></div><div><dt>Last output</dt><dd>{timeAgo(selected.lastOutputAt)}</dd></div><div><dt>Restore policy</dt><dd>{selected.autoStart ? "Automatic" : "Manual"}</dd></div></dl></section>
          <section className="agent-current-action"><span><small>CURRENT ACTION</small><strong>{mission?.currentAction?.summary || "No mission action has been observed."}</strong></span><em>{mission?.currentAction?.kind || "unreported"}</em><p>High-level observable state only. Mission Control never displays or infers private reasoning.</p></section>
          <section className="agent-summary-metrics" aria-label="Agent operational summary"><div><small>CHECKPOINTS</small><strong>{mission?.progress?.verified || 0}/{mission?.progress?.total || 0}</strong><span>evidence verified</span></div><div><small>DURABLE EVIDENCE</small><strong>{evidence.length}</strong><span>{changedFiles} changed paths</span></div><div><small>RELATED WORKERS</small><strong>{mission?.relatedWorkerIds?.length || 0}</strong><span>explicit relationships</span></div><div className={approvals.some(item => item.state === "pending") || risks ? "has-risk" : ""}><small>APPROVALS</small><strong>{approvals.filter(item => item.state === "pending").length || "Clear"}</strong><span>{approvals.some(item => item.state === "pending") ? "waiting in Needs You" : `${checks} command/check records`}</span></div></section>
          <div className="agent-summary-grid"><section className="agent-mission-card"><header><span className="section-kicker">ASSIGNED MISSION</span><strong>{mission?.status || "Not assigned"}</strong></header><h3>{mission?.title || "No durable mission has been recorded for this agent."}</h3><p>{mission ? `Scopes: ${(mission.scopes || ["read"]).join(" · ")} · ${mission.progress?.statement}` : "Assign a mission to define explicit authority, checkpoints and related workers."}</p><footer><button onClick={() => setMissionOpen(true)}>{mission ? "Edit contract" : "Assign mission"}</button>{mission?.status === "active" && <><button onClick={() => void transitionMission("completed")}>Mark complete</button><button className="danger" onClick={() => void transitionMission("cancelled")}>Cancel</button></>}</footer></section><section className="agent-recent-card"><header><span className="section-kicker">RECENT HISTORY</span><button onClick={() => setPanel("history")}>View all</button></header>{relatedActivity.length ? relatedActivity.slice(0, 4).map((event, index) => <article key={`${event.sequence || index}-${event.type}`}><i className={/failed|error|attention/i.test(String(event.type)) ? "is-risk" : ""}/><span><strong>{eventLabel(event)}</strong><small>{eventActor(event)} · {timeAgo(event.timestamp)}</small></span></article>) : <p>No lifecycle events have been recorded for this agent yet.</p>}</section></div>
        </div>}

        {panel === "plan" && <section className="agent-plan-view"><header><div><span className="section-kicker">EVIDENCE-BACKED PROGRESS</span><h2>{mission?.progress?.statement || "No mission plan assigned"}</h2><p>Progress is a count of verified checkpoints, never an estimated percentage.</p></div><button onClick={() => setMissionOpen(true)}>{mission ? "Edit plan" : "Assign mission"}</button></header><div>{checkpoints.length ? checkpoints.map((checkpoint,index) => <article className={`state-${checkpoint.state}`} key={checkpoint.id}><span>{String(index + 1).padStart(2,"0")}</span><i/><div><strong>{checkpoint.title}</strong><small>{checkpoint.verification} evidence · {checkpoint.state}{checkpoint.evidenceId ? " · evidence linked" : ""}</small></div>{checkpoint.state !== "verified" && checkpoint.verification === "manual" && <button onClick={() => void verifyCheckpoint(checkpoint)}>Verify</button>}</article>) : <div className="agent-detail-empty"><strong>No observable checkpoints</strong><p>Add tests, build, changes, service or manual review checkpoints to the mission contract.</p></div>}</div></section>}

        {panel === "history" && <section className="agent-history-view"><header><div><span className="section-kicker">MISSION LIFECYCLE</span><h2>Recorded state changes</h2><p>Engine and operator transitions for {agentName(selected)}, newest first.</p></div><span>{lifecycle.length} transitions</span></header><div>{lifecycle.length ? lifecycle.map((event,index) => <article key={event.id || `${event.phase}-${index}`}><time>{timeAgo(event.at)}</time><span className={/failed|cancelled|waiting/i.test(String(event.phase)) ? "is-risk" : ""}><i/></span><div><strong>{phaseLabel(event.phase)}</strong><p>{event.reason}</p><code>{String(event.source || "engine").replaceAll("-"," ")}</code></div><b>{String(lifecycle.length - index).padStart(2,"0")}</b></article>) : <div className="agent-detail-empty"><strong>No mission lifecycle yet</strong><p>Assign a mission to begin durable supervision history.</p></div>}</div></section>}

        {panel === "evidence" && <section className="agent-evidence-view"><header><div><span className="section-kicker">DURABLE EVIDENCE</span><h2>Mission records</h2><p>Structured evidence recorded by the engine. Raw terminal output stays in the terminal.</p></div><span>{evidence.length} records</span></header>{liveFiles.length > 0 && <section className="agent-live-files"><header><span>CURRENT FILES</span><small>Live bounded Git evidence · not persisted in mission history</small></header><div>{liveFiles.map((file,index) => <code key={`${file}-${index}`}>{file}</code>)}</div></section>}<div>{evidence.length ? evidence.map((item, index) => <article key={item.id || `${item.type}-${index}`}><span className="agent-evidence-type">{item.type || "record"}</span><div><strong>{evidenceSummary(item)}</strong><small>{evidenceDetail(item)} · {timeAgo(Number(item.at || item.timestamp || item.createdAt))}</small></div></article>) : <div className="agent-detail-empty"><strong>No structured evidence</strong><p>Tests, commands, diffs and results will appear here when the engine records them.</p></div>}</div></section>}

        {panel === "approvals" && <section className="agent-approval-view"><header><div><span className="section-kicker">MISSION AUTHORITY</span><h2>Permission history</h2><p>One-time decisions are durable and never execute an action by themselves.</p></div><span>{approvals.length} records</span></header><div>{approvals.length ? approvals.map(approval => <article key={approval.id}><i className={`state-${approval.state}`}/><div><span><strong>{approval.requestedScopes.join(" · ")}</strong><em>{approval.state}</em></span><p>{approval.reason}</p><small>{approval.impact} · {timeAgo(approval.createdAt)}</small></div></article>) : <div className="agent-detail-empty"><strong>No permission requests</strong><p>The mission is operating within its explicit scopes.</p></div>}</div></section>}
      </div>
    </main>}

    <AgentPicker open={addOpen} adapters={adapters} agents={agents} loading={loading} onClose={() => setAddOpen(false)} onAdd={addAgent}/>
    <MissionEditor open={missionOpen} agent={selected} sessions={sessions} mission={mission} onClose={() => setMissionOpen(false)} onSaved={refreshMissions}/>
  </div>;
}
