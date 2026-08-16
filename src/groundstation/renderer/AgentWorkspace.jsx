import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  missionApi,
  notificationPayload,
  notificationType,
  streamIdentifier
} from "./missionApi.js";

const ANSI_PATTERN = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;
const AGENT_PROMPTS = [
  { label: "Inspect project", text: "Inspect this project and summarize its architecture, current state, and the safest next action. Do not modify files yet." },
  { label: "Diagnose failure", text: "Diagnose the current failure using terminal evidence. Explain the root cause and propose a minimal fix before changing anything." },
  { label: "Run checks", text: "Run the relevant tests and checks for the current task. Summarize failures with exact file paths and evidence." },
  { label: "Review changes", text: "Review the current working changes for bugs, regressions, missing tests, and risky assumptions. Report findings by severity." }
];

function cleanOutput(value) {
  return String(value || "")
    .replace(ANSI_PATTERN, "")
    .replace(/\r/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim();
}

function phaseFor(agent) {
  if (agent?.attentionRequired) return "Needs your approval";
  if (agent?.status === "failed") return "Failed";
  if (agent?.status === "starting") return "Starting";
  if (agent?.isAlive) return "Working";
  return "Standing by";
}

function timeLabel(timestamp) {
  if (!Number.isFinite(timestamp)) return "now";
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function eventLabel(event) {
  return String(event?.type || "Workspace event").replaceAll(":", " · ").replaceAll("-", " ");
}

function displayCommand(agent) {
  const args = Array.isArray(agent?.args) ? agent.args : [];
  const commandIndex = args.findIndex(arg => String(arg).toLowerCase() === "/c");
  return commandIndex >= 0 && args[commandIndex + 1] ? args.slice(commandIndex + 1).join(" ") : agent?.command;
}

function AgentPicker({ open, adapters, agents, loading, onClose, onAdd }) {
  const availableCount = adapters.filter(adapter => adapter.available !== false).length;
  return <Dialog.Root open={open} onOpenChange={value => !value && onClose()}><Dialog.Portal><Dialog.Overlay className="agent-picker-backdrop"/><Dialog.Content className="agent-picker" aria-describedby="agent-picker-description">
      <header><div><span className="section-kicker">AGENT DEPLOYMENT</span><Dialog.Title id="agent-picker-title">Expand your AI crew</Dialog.Title><Dialog.Description id="agent-picker-description">Choose an installed local agent. Mission Control creates a supervised worker and starts its official CLI.</Dialog.Description></div><Dialog.Close asChild><button aria-label="Close add agent dialog">×</button></Dialog.Close></header>
      <div className="agent-picker-summary"><div><span className="agent-picker-summary__mark">AI</span><span><strong>{availableCount} agents ready</strong><small>{adapters.length - availableCount} unavailable on this machine</small></span></div><div><span>ENGINE OWNED</span><span>LOCAL AUTH</span><span>MULTI-AGENT READY</span></div></div>
      <div className="agent-picker-label"><span>AVAILABLE AGENTS</span><small>Select one to add and start</small></div>
      <div className="agent-picker-grid">{adapters.map(adapter => {
        const count = agents.filter(agent => agent.id.startsWith(`agent-${adapter.id}-`)).length;
        const unavailable = adapter.available === false;
        return <button key={adapter.id} className={unavailable ? "is-unavailable" : ""} disabled={loading || unavailable} onClick={() => void onAdd(adapter.id)}>
          <span className="agent-picker-mark">{adapter.name.slice(0,1)}</span>
          <span className="agent-picker-copy"><span><strong>{adapter.name}</strong><i>{unavailable ? "Not installed" : "Ready"}</i></span><small>{unavailable ? `${adapter.command} was not found on PATH` : adapter.description}</small><em>{count ? `${count} already supervised in this workspace` : "No instance in this workspace"}</em></span>
          <span className="agent-picker-action">{unavailable ? "Unavailable" : loading ? "Starting…" : <>Add agent <b>→</b></>}</span>
        </button>;
      })}</div>
      <footer><span><b>Private by default.</b> Uses engine-owned PTYs and each CLI’s existing authentication.</span><Dialog.Close asChild><button>Cancel</button></Dialog.Close></footer>
    </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export default function AgentWorkspace({ sessions, activity, adapters, loading, selectedId, onSelect, onCreate, onAction, onOpenTerminal }) {
  const agents = sessions.filter(item => item.id.startsWith("agent-"));
  const selected = agents.find(item => item.id === selectedId) || agents[0] || null;
  const [draft, setDraft] = React.useState("");
  const [messages, setMessages] = React.useState([]);
  const [connection, setConnection] = React.useState("offline");
  const [streamId, setStreamId] = React.useState(null);
  const [sendError, setSendError] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const [missions, setMissions] = React.useState([]);
  const [scopes, setScopes] = React.useState(["read"]);
  const [approval, setApproval] = React.useState(null);
  const [comparing, setComparing] = React.useState(false);
  const [contextView, setContextView] = React.useState("mission");
  const transcriptRef = React.useRef(null);
  const missionRecord = selected ? missions.find(mission => mission.agentId === selected.id && mission.status === "active") || null : null;
  const currentMission = missionRecord?.title || "";

  const refreshMissions = React.useCallback(() => missionApi().request("mission.list").then(value => setMissions(Array.isArray(value) ? value : [])).catch(() => {}), []);
  React.useEffect(() => { void refreshMissions(); }, [activity.length, refreshMissions]);
  React.useEffect(() => { setScopes(missionRecord?.scopes || ["read"]); }, [missionRecord?.id]);

  const saveMission = async (agentId, mission, nextScopes = scopes) => {
    const title = String(mission || "").trim().slice(0, 240);
    if (!title) return null;
    const result = await missionApi().request("mission.save", { mission: { agentId, title, scopes: nextScopes } });
    await refreshMissions();
    return result?.mission || null;
  };

  const relatedActivity = React.useMemo(() => {
    if (!selected) return [];
    return activity.filter(event => event.id === selected.id || event.sessionId === selected.id || event.name === selected.name).slice(-5).reverse();
  }, [activity, selected]);

  React.useEffect(() => {
    setMessages([]);
    setSendError("");
    setStreamId(null);
    if (!selected?.isAlive) { setConnection("offline"); return undefined; }

    let disposed = false;
    let openedStream = null;
    let unsubscribe = missionApi().subscribe(notification => {
      if (notificationType(notification) !== "terminal:data") return;
      const payload = notificationPayload(notification);
      if (!openedStream || streamIdentifier(payload) !== openedStream) return;
      const text = cleanOutput(payload.data);
      if (!text) return;
      setMessages(current => {
        const now = Date.now();
        const retained = current.slice(-79);
        const last = retained.at(-1);
        if (last?.role === "agent" && !last.replay && now - last.timestamp < 800) {
          return [...retained.slice(0, -1), { ...last, text: `${last.text}\n${text}`.trim(), timestamp: now }];
        }
        return [...retained, { id: `agent-${now}-${current.length}`, role: "agent", text, timestamp: now }];
      });
    });

    const connect = async () => {
      setConnection("connecting");
      try {
        const opened = await missionApi().request("terminal.open", { sessionId: selected.id });
        openedStream = streamIdentifier(opened);
        if (!openedStream) throw new Error("Agent stream did not return an identifier");
        if (disposed) { await missionApi().request("terminal.close", { streamId: openedStream }).catch(() => {}); return; }
        setStreamId(openedStream);
        const replay = typeof opened.replay === "string" ? opened.replay : opened.replay?.data;
        const replayText = cleanOutput(replay || (opened.snapshot?.lines || opened.snapshotLines || []).join("\n"));
        if (replayText) setMessages([{ id: `agent-replay-${selected.id}`, role: "agent", text: replayText, timestamp: selected.lastOutputAt || Date.now(), replay: true }]);
        const activated = await missionApi().request("terminal.activate", { streamId: openedStream });
        const pendingText = cleanOutput(activated?.pending ?? activated?.data ?? opened.pending);
        if (pendingText) setMessages(current => [...current, { id: `agent-pending-${Date.now()}`, role: "agent", text: pendingText, timestamp: Date.now() }]);
        if (!disposed) setConnection("live");
      } catch (error) {
        if (!disposed) { setConnection("error"); setSendError(error instanceof Error ? error.message : String(error)); }
      }
    };
    void connect();
    return () => {
      disposed = true;
      unsubscribe?.();
      if (openedStream) void missionApi().request("terminal.close", { streamId: openedStream }).catch(() => {});
    };
  }, [selected?.id, selected?.isAlive, selected?.startTime]);

  React.useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "auto" });
  }, [messages]);

  const requestedScopesFor = text => ["read", /\b(?:edit|write|change|create|delete|fix|modify)\b/i.test(text) && "write", /\b(?:run|test|build|command|install|execute)\b/i.test(text) && "execute", /\b(?:download|fetch|network|online|api|install)\b/i.test(text) && "network"].filter(Boolean);
  const performSend = async (text, requestedScopes) => {
    if (!text || !streamId || connection !== "live") return;
    setDraft("");
    if (!currentMission) await saveMission(selected.id, text);
    await missionApi().request("mission.instruction.record", { agentId: selected.id, instructionLength: text.length, requestedScopes });
    setSendError("");
    setMessages(current => [...current, { id: `user-${Date.now()}`, role: "user", text, timestamp: Date.now() }]);
    try {
      await missionApi().request("terminal.write", { streamId, data: `${text}\r` });
    } catch (error) {
      setSendError(error instanceof Error ? error.message : String(error));
    }
  };
  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    const requestedScopes = requestedScopesFor(text);
    setApproval({ text, requestedScopes, denied: requestedScopes.filter(scope => !scopes.includes(scope)) });
  };

  const addAgent = async adapterId => { setAddOpen(false); await onCreate(adapterId); };
  const instructionCount = messages.filter(message => message.role === "user").length;
  const responseCount = messages.filter(message => message.role === "agent" && !message.replay).length;
  const lastResponse = [...messages].reverse().find(message => message.role === "agent");

  if (!agents.length) return <div className="agent-workspace agent-workspace-empty"><section><span className="section-kicker">AI WORKFORCE</span><h2>Bring in an AI teammate</h2><p>Choose an installed, allow-listed local CLI. Mission Control creates the worker and starts it immediately.</p><div className="agent-adapter-list">{adapters.map(adapter => <button key={adapter.id} disabled={loading || adapter.available === false} onClick={() => void addAgent(adapter.id)}><strong>{adapter.name}</strong><span>{adapter.available === false ? `${adapter.command} was not found on PATH` : adapter.description}</span><b>{adapter.available === false ? "Not installed" : "Add & start"}</b></button>)}</div></section></div>;

  return <div className="agent-workspace">
    <aside className="agent-workforce"><header><div><span className="section-kicker">AI WORKFORCE</span><strong>Agent roster</strong></div><small>{agents.filter(agent => agent.isAlive).length} active · {agents.length} total</small></header><div>{agents.map(agent => <button key={agent.id} className={selected?.id === agent.id ? "is-selected" : ""} onClick={() => onSelect(agent.id)}><span className="agent-workforce-icon">{agent.name.slice(0,1)}</span><span><strong>{agent.name.replace(" agent", "")}</strong><small>{phaseFor(agent)}</small></span><b className={`agent-state state-${agent.status}`}>{agent.attentionRequired ? "Needs you" : agent.isAlive ? "Working" : agent.status}</b></button>)}</div><footer><button className="agent-add-button" onClick={() => setAddOpen(true)} disabled={loading || !adapters.length}><span>+</span><span><strong>Add another agent</strong><small>Expand your AI workforce</small></span></button></footer></aside>
    {selected && <main className={`agent-conversation context-${contextView}`}><header className="agent-conversation-head"><div className="agent-workforce-icon is-large">{selected.name.slice(0,1)}</div><div className="agent-title-copy"><span className="section-kicker">AGENT COMMAND</span><h2>{selected.name.replace(" agent", "")}</h2><span className={`agent-state state-${selected.status}`}>{phaseFor(selected)}</span></div><div className="agent-head-actions"><button className="add" onClick={() => setAddOpen(true)}>+ Add agent</button>{selected.attentionRequired && <button className="attention" onClick={() => onAction("acknowledge", selected.id)}>Acknowledge alert</button>}<button onClick={() => onOpenTerminal(selected.id)}>Terminal</button>{selected.isAlive ? <button className="danger" onClick={() => onAction("kill", selected.id)}>Stop</button> : <button className="primary" onClick={() => onAction("start", selected.id)}>Start</button>}</div></header>
      <nav className="agent-command-tabs" aria-label="Agent command context">{[["mission","Mission"],["evidence",`Evidence ${missionRecord?.evidence?.length || 0}`],["permissions",`Permissions ${scopes.length}`],...(agents.length > 1 ? [["compare",`Compare ${agents.length}`]] : [])].map(([value,label]) => <button key={value} className={contextView === value ? "active" : ""} onClick={() => setContextView(value)}>{label}</button>)}</nav>
      <section className={`agent-briefing ${selected.status === "failed" ? "has-failure" : ""}`}><div><span className="section-kicker">CURRENT MISSION</span><div className="agent-mission-field"><input key={`${selected.id}:${missionRecord?.updatedAt || 0}`} defaultValue={currentMission} placeholder="Describe the outcome this agent owns…" onBlur={event => void saveMission(selected.id, event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void saveMission(selected.id, event.currentTarget.value); event.currentTarget.blur(); } }}/><span>Stored in the project by the engine · first instruction creates a mission when empty</span></div><strong>{selected.attentionReason || phaseFor(selected)}</strong><p>{selected.status === "failed" ? "The CLI did not stay running. Review the exact failure, then retry after correcting installation or authentication." : selected.isAlive ? "The agent terminal is connected. Send an instruction below or review its latest reported output." : "Start this agent to begin a supervised conversation."}</p>{selected.status === "failed" && <button className="agent-retry" onClick={() => onAction("start", selected.id)}>Retry start</button>}</div><dl><div><dt>Engine state</dt><dd>{selected.status}</dd></div><div><dt>Connection</dt><dd>{connection}</dd></div><div><dt>Last output</dt><dd>{timeLabel(selected.lastOutputAt)}</dd></div><div><dt>Agent command</dt><dd>{displayCommand(selected)}</dd></div></dl></section>
      <section className="agent-permissions"><header><div><span className="section-kicker">MISSION PERMISSIONS</span><strong>Allowed capabilities</strong></div><small>Checked before every instruction reaches the PTY</small></header><div>{["read","write","execute","network"].map(scope => <label key={scope}><input type="checkbox" checked={scopes.includes(scope)} disabled={scope === "read"} onChange={() => { const next = scopes.includes(scope) ? scopes.filter(value => value !== scope) : [...scopes, scope]; setScopes(next); if (currentMission) void saveMission(selected.id, currentMission, next); }}/><span><strong>{scope}</strong><small>{scope === "read" ? "Inspect project and evidence" : scope === "write" ? "Modify project files" : scope === "execute" ? "Run commands, tests, and builds" : "Access external services"}</small></span></label>)}</div></section>
      <section className="agent-evidence-strip" aria-label="Agent mission evidence"><div><small>DURABLE MISSION</small><strong>{currentMission ? "Engine owned" : "Not assigned"}</strong><span>{missionRecord ? `${missionRecord.evidence?.length || 0} structured records` : "First instruction creates mission"}</span></div><div><small>FILES & DIFF</small><strong>{missionRecord?.evidence?.filter(item => item.type === "diff").length || 0}</strong><span>safe Git change records</span></div><div><small>COMMANDS & TESTS</small><strong>{missionRecord?.evidence?.filter(item => ["command","test"].includes(item.type)).length || 0}</strong><span>permission checked</span></div><div><small>RESULTS</small><strong>{missionRecord?.evidence?.filter(item => item.type === "result").length || 0}</strong><span>{lastResponse ? `last response ${timeLabel(lastResponse.timestamp)}` : "waiting for output"}</span></div></section>
      <section className="agent-chat" ref={transcriptRef} aria-live="polite">{messages.length ? messages.map(message => <article key={message.id} className={`agent-message is-${message.role}`}><header><strong>{message.role === "user" ? "You" : selected.name.replace(" agent", "")}</strong><time>{timeLabel(message.timestamp)}</time>{message.replay && <span>Previous output</span>}</header><pre>{message.text}</pre></article>) : <div className="agent-chat-empty"><strong>No conversation output yet</strong><span>Send a clear mission or wait for this agent’s next response.</span></div>}</section>
      <section className="agent-session-summary"><header><span className="section-kicker">SESSION SUMMARY</span><small>{relatedActivity.length} recent events</small></header>{relatedActivity.length ? <ul>{relatedActivity.map(event => <li key={`${event.sequence}-${event.type}`}><time>{timeLabel(event.timestamp)}</time><span>{eventLabel(event)}</span></li>)}</ul> : <p>No lifecycle events have been recorded for this agent yet.</p>}</section>
      {agents.length > 1 && <section className={`agent-comparison ${comparing ? "is-open" : ""}`}><header><div><span className="section-kicker">MULTI-AGENT RESULTS</span><strong>Compare durable evidence</strong></div><button onClick={() => setComparing(value => !value)}>{comparing ? "Close" : `Compare ${agents.length} agents`}</button></header>{comparing && <div>{agents.map(agent => { const mission = missions.find(item => item.agentId === agent.id && item.status === "active"); const evidence = mission?.evidence || []; const tests = [...evidence].reverse().find(item => item.type === "test"); return <article key={agent.id}><span className={`agent-state state-${agent.status}`}>{phaseFor(agent)}</span><h3>{agent.name.replace(" agent", "")}</h3><p>{mission?.title || "No durable mission"}</p><dl><div><dt>Evidence</dt><dd>{evidence.length}</dd></div><div><dt>Tests</dt><dd>{tests ? `${tests.facts.passed} / ${tests.facts.failed}` : "—"}</dd></div><div><dt>Diffs</dt><dd>{evidence.filter(item => item.type === "diff").length}</dd></div><div><dt>Scopes</dt><dd>{mission?.scopes?.join(", ") || "read"}</dd></div></dl></article>; })}</div>}</section>}
      <footer className="agent-composer">{sendError && <div className="agent-send-error">{sendError}</div>}{approval && <section className={`agent-approval-preview ${approval.denied.length ? "has-denied" : ""}`}><div><span>PERMISSION PREVIEW</span><strong>{approval.requestedScopes.join(" · ")}</strong><small>{approval.denied.length ? `Enable ${approval.denied.join(", ")} before sending` : "Instruction is within this mission's allowed scopes"}</small></div><button onClick={() => setApproval(null)}>Cancel</button><button disabled={approval.denied.length > 0} onClick={() => { const request = approval; setApproval(null); void performSend(request.text, request.requestedScopes); }}>Approve & send</button></section>}<div className="agent-prompt-starters"><span>START WITH</span>{AGENT_PROMPTS.map(prompt => <button type="button" key={prompt.label} disabled={!selected.isAlive || connection !== "live"} onClick={() => setDraft(prompt.text)}>{prompt.label}</button>)}</div><textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder={selected.isAlive ? `Send an instruction to ${selected.name.replace(" agent", "")}…` : "Start the agent before sending instructions"} disabled={!selected.isAlive || connection !== "live"}/><div><span>Enter previews permissions · Shift+Enter for a new line</span><button onClick={() => void send()} disabled={!draft.trim() || connection !== "live"} aria-label="Preview instruction permissions">Review & send</button></div></footer>
    </main>}
    <AgentPicker open={addOpen} adapters={adapters} agents={agents} loading={loading} onClose={() => setAddOpen(false)} onAdd={addAgent}/>
  </div>;
}
