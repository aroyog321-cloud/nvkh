import React from "react";
import { missionApi } from "./missionApi.js";

const TRIGGERS = [
  ["worker-failed", "Worker fails"],
  ["worker-needs-you", "Worker needs you"],
  ["worker-exited", "Worker exits"]
];
const ACTIONS = [
  ["restart-worker", "Restart worker"],
  ["start-worker", "Start worker"],
  ["acknowledge-worker", "Acknowledge worker"]
];

function ago(timestamp) {
  if (!timestamp) return "never";
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  return minutes < 1 ? "now" : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}

export function AutomationSettings({ workspace, sessions }) {
  const [data, setData] = React.useState({ definitions: [], approvals: [], audit: [] });
  const [draft, setDraft] = React.useState(null);
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const refresh = React.useCallback(() => missionApi().request("automation.list").then(setData).catch(error => setMessage(error.message || String(error))), []);
  React.useEffect(() => { void refresh(); }, [refresh, workspace?.path]);
  React.useEffect(() => {
    if (!draft && sessions[0]) setDraft({ name: "Recover failed worker", enabled: false, trigger: { type: "worker-failed", targetId: sessions[0].id }, action: { type: "restart-worker", targetId: sessions[0].id }, cooldownMs: 300000 });
  }, [draft, sessions]);
  const run = async (label, operation) => {
    setBusy(label); setMessage("");
    try { await operation(); await refresh(); setMessage(label === "save" ? "Workflow saved. Enable it when the trigger and action are correct." : label === "test" ? "Dry run recorded. No action executed." : "Workflow removed."); }
    catch (error) { setMessage(error.message || String(error)); }
    finally { setBusy(""); }
  };
  const save = automation => run("save", () => missionApi().request("automation.save", { automation }));
  const pending = data.approvals.filter(item => item.state === "pending").length;
  return <section className="settings-panel settings-panel-wide automation-settings"><header><div><span className="automation-mark">↻</span><span><h3>Automation workflows</h3><p>Event-driven recovery with cooldowns, dry runs, and a local approval before every action.</p></span></div><span className={pending ? "has-attention" : ""}><small>WAITING</small><strong>{pending}</strong></span></header>{draft && <div className="automation-builder"><label><span>NAME</span><input value={draft.name} maxLength="80" onChange={event => setDraft({ ...draft, name: event.target.value })}/></label><label><span>WHEN</span><select value={draft.trigger.type} onChange={event => setDraft({ ...draft, trigger: { ...draft.trigger, type: event.target.value } })}>{TRIGGERS.map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label><label><span>WATCH</span><select value={draft.trigger.targetId} onChange={event => setDraft({ ...draft, trigger: { ...draft.trigger, targetId: event.target.value } })}>{sessions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>PROPOSE</span><select value={draft.action.type} onChange={event => setDraft({ ...draft, action: { ...draft.action, type: event.target.value } })}>{ACTIONS.map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label><label><span>TARGET</span><select value={draft.action.targetId} onChange={event => setDraft({ ...draft, action: { ...draft.action, targetId: event.target.value } })}>{sessions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button disabled={!workspace?.persistent || !sessions.length || busy === "save"} onClick={() => save(draft)}>{busy === "save" ? "Saving…" : "Save disabled workflow"}</button></div>}<div className="automation-list">{data.definitions.length ? data.definitions.map(item => <article key={item.id}><i className={item.enabled ? "is-live" : ""}/><div><strong>{item.name}</strong><small>{item.trigger.type.replaceAll("-", " ")} → {item.action.type.replaceAll("-", " ")} · last matched {ago(item.lastMatchedAt)}</small></div><button onClick={() => save({ ...item, enabled: !item.enabled })}>{item.enabled ? "Disable" : "Enable"}</button><button onClick={() => run("test", () => missionApi().request("automation.test", { automationId: item.id }))}>Dry run</button><button className="is-danger" onClick={() => run("delete", () => missionApi().request("automation.delete", { automationId: item.id, confirmation: `confirm:automation.delete:${item.id}` }))}>Remove</button></article>) : <p>No workflows saved. Build one above; new workflows remain disabled until you explicitly enable them.</p>}</div>{message && <p role="status">{message}</p>}<footer><span>Every match enters Needs You. Approval is one-time and expires after 30 minutes.</span><small>{data.audit[0] ? `Last audit: ${data.audit[0].kind.replaceAll("-", " ")} · ${ago(data.audit[0].at)}` : "No automation activity recorded"}</small></footer></section>;
}

export function AutomationApprovalQueue({ visible = true, onPendingChange }) {
  const [approvals, setApprovals] = React.useState([]);
  const [busy, setBusy] = React.useState("");
  const refresh = React.useCallback(async () => { const result = await missionApi().request("automation.list"); const pending = (result.approvals || []).filter(item => item.state === "pending"); setApprovals(pending); onPendingChange?.(pending.length); }, [onPendingChange]);
  React.useEffect(() => { let active = true; void refresh().catch(() => { if (active) onPendingChange?.(0); }); const unsubscribe = missionApi().subscribe(notification => { if (active && notification?.type === "engine:event" && String(notification?.event?.type || notification?.payload?.event?.type || "").startsWith("automation:")) void refresh(); }); return () => { active = false; unsubscribe?.(); }; }, [refresh, onPendingChange]);
  const resolve = async (item, decision) => { setBusy(item.id); try { await missionApi().request("automation.approval.resolve", { approvalId: item.id, decision, confirmation: `confirm:automation.approval:${item.id}:${decision}` }); await refresh(); } finally { setBusy(""); } };
  if (!visible || !approvals.length) return null;
  return <section className="automation-approval-queue"><header><div><span>AUTOMATION APPROVALS</span><strong>{approvals.length} recovery action{approvals.length === 1 ? "" : "s"} waiting</strong></div><small>Trigger matched · nothing executed</small></header>{approvals.map(item => <article key={item.id}><i>↻</i><div><span>{item.automationName}</span><strong>{item.action.type.replaceAll("-", " ")} · {item.action.targetId}</strong><small>Because {item.trigger.type.replaceAll("-", " ")} matched. This approval expires automatically.</small></div><button disabled={Boolean(busy)} onClick={() => void resolve(item, "deny")}>Deny</button><button className="approve" disabled={Boolean(busy)} onClick={() => void resolve(item, "approve")}>{busy === item.id ? "Executing…" : "Approve once"}</button></article>)}</section>;
}
