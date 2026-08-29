import React from "react";
import { missionApi } from "./missionApi.js";

const SCOPE_CHOICES = [
  { id: "context.read", label: "Mission Context", detail: "Workers, health, dependencies, missions, recipes, and bounded editor state." },
  { id: "memory.read", label: "Project Memory", detail: "Resumable chapters, evidence-backed recovery, and causal relationships." },
  { id: "attention.read", label: "Needs You", detail: "Current attention records and human-decision lifecycle." },
  { id: "terminal.read", label: "Terminal evidence", detail: "Sanitized bounded lines only. Off by default and never includes terminal input access.", sensitive: true },
  { id: "worker.lifecycle.request", label: "Request worker actions", detail: "May request start, restart, stop, or acknowledge. Every request waits in Needs You.", approval: true },
  { id: "supervisor.plan.request", label: "Request Gemini plans", detail: "External AI may ask Gemini for a validated workspace plan. It never executes directly.", approval: true },
  { id: "worker.create.request", label: "Request worker creation", detail: "Exact project-scoped worker definitions wait for local approval.", approval: true },
  { id: "terminal.input.request", label: "Request terminal input", detail: "Exact bounded input only; secret-bearing requests are rejected and approval is mandatory.", sensitive: true, approval: true },
  { id: "recipe.run.request", label: "Request recipe actions", detail: "May request run, recovery, or cancel. Every request waits in Needs You.", approval: true }
];

function relativeTime(value) {
  if (!value) return "never";
  const seconds = Math.max(0, Math.floor((Date.now() - value) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function expiresIn(value) {
  const seconds = Math.max(0, Math.ceil((Number(value) - Date.now()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.ceil(seconds / 60)}m`;
}

export function McpGatewaySettings({ workspace }) {
  const [status, setStatus] = React.useState(null);
  const [scopes, setScopes] = React.useState([]);
  const [audit, setAudit] = React.useState([]);
  const [token, setToken] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [message, setMessage] = React.useState("");

  const refresh = React.useCallback(async () => {
    const next = await missionApi().request("mcp.status");
    setStatus(next);
    setScopes(next.scopes || []);
    try { setAudit(await missionApi().request("mcp.audit.list", { limit: 6 })); } catch { setAudit([]); }
    return next;
  }, []);

  React.useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    refresh().catch(error => active && setMessage(error.message || String(error)));
    try {
      unsubscribe = missionApi().subscribe(notification => {
        if (notification?.type !== "integration:event" || notification.integration !== "mcp" || !active) return;
        setStatus(notification.status);
        setScopes(notification.status?.scopes || []);
      });
    } catch { /* Status request remains authoritative. */ }
    return () => { active = false; unsubscribe?.(); };
  }, [refresh, workspace?.path]);

  const configure = async (operation, configuration) => {
    setBusy(operation);
    setMessage("");
    setToken("");
    try {
      const next = await missionApi().request("mcp.configure", { configuration });
      setStatus(next);
      setScopes(next.scopes || []);
      setMessage(next.running ? "Secure MCP Gateway is listening on authenticated localhost." : "Secure MCP Gateway is stopped.");
      await refresh();
    } catch (error) { setMessage(error.message || String(error)); }
    finally { setBusy(""); }
  };

  const rotate = async () => {
    setBusy("token");
    setMessage("");
    try {
      const result = await missionApi().request("mcp.rotateToken", { confirmation: "confirm:mcp.rotateToken" });
      setToken(result.token);
      setStatus(result.status);
      setMessage("Previous MCP credentials were revoked. Copy this token now; it will not be shown again.");
      await refresh();
    } catch (error) { setMessage(error.message || String(error)); }
    finally { setBusy(""); }
  };

  const copyConfiguration = async () => {
    if (!token) return;
    const value = JSON.stringify({ url: status?.endpoint, headers: { Authorization: `Bearer ${token}` } }, null, 2);
    try { await navigator.clipboard.writeText(value); setMessage("MCP client configuration copied."); }
    catch { setMessage("Clipboard access was unavailable. Select and copy the one-time token manually."); }
  };

  const toggleScope = id => setScopes(current => current.includes(id) ? current.filter(scope => scope !== id) : [...current, id]);
  const running = status?.running === true;
  const protectedStore = status?.available === true;
  return <section className={`settings-panel settings-panel-wide mcp-gateway-settings pm-card pm-card--feat-mcp ${running ? "is-running" : ""}`}>
    <header><div className="settings-panel__head"><span className="mcp-mark">M</span><div><h3>Secure MCP Gateway</h3><p>Connect external AI clients to bounded project intelligence without giving them terminal or process ownership.</p></div></div><div className={`mcp-state ${running ? "is-live" : status?.lastError ? "is-risk" : ""}`}><i/><span><small>LOCAL GATEWAY</small><strong>{running ? "Authenticated & listening" : status?.lastError ? "Needs review" : "Stopped"}</strong></span></div></header>
    <div className="mcp-summary"><div><span>ENDPOINT</span><strong title={status?.endpoint}>{status?.endpoint || "Loading…"}</strong><small>127.0.0.1 only · no LAN binding</small></div><div><span>PROTECTION</span><strong>{protectedStore ? "OS-encrypted token" : "Unavailable"}</strong><small>{status?.backend || "Waiting for secure storage"}</small></div><div><span>CLIENTS</span><strong>{status?.clientCount || 0} recently active</strong><small>Authenticated in the last five minutes</small></div><div className={status?.pendingApprovalCount ? "has-attention" : ""}><span>APPROVALS</span><strong>{status?.pendingApprovalCount || 0} waiting</strong><small>Mutations execute only from Needs You</small></div></div>
    <div className="mcp-permissions pm-stagger"><div className="mcp-permission-head"><div><span>EXPLICIT CAPABILITIES</span><strong>Grant only what this project needs</strong></div><small>Read permissions are independent. Requests never bypass approval.</small></div><div className="mcp-terminal-feed">{SCOPE_CHOICES.map(scope => <label key={scope.id} className={`terminal-toggle-card ${scope.sensitive ? "is-sensitive" : ""} ${scope.approval ? "is-approval" : ""}`}><div><strong>{scope.label}{scope.approval && <em>APPROVAL GATED</em>}</strong><p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--text-muted-semantic)" }}>{scope.detail}</p></div><div className="pm-toggle"><input type="checkbox" checked={scopes.includes(scope.id)} onChange={() => toggleScope(scope.id)}/><div className="pm-toggle-track"><div className="pm-toggle-thumb"/></div></div></label>)}</div></div>
    {token && <div className="mcp-token-reveal" role="status"><span>ONE-TIME ACCESS TOKEN</span><div><code>{token}</code><button onClick={() => void copyConfiguration()}>Copy client config</button></div><small>Store it in the MCP client’s secret configuration. Mission Control keeps only the OS-encrypted copy.</small></div>}
    {message && <p className={status?.lastError ? "is-error" : ""} role="status">{message}</p>}
    <footer><div><strong>{status?.protocolVersions?.[0] || "MCP"}</strong><span>Current protocol · compatible legacy handshake · strict Origin checks</span></div><div><button disabled={Boolean(busy) || !protectedStore} onClick={() => void configure("permissions", { scopes })}>{busy === "permissions" ? "Saving…" : "Save permissions"}</button><button disabled={Boolean(busy) || !protectedStore} onClick={() => void rotate()}>{busy === "token" ? "Rotating…" : status?.configured ? "Rotate token" : "Create access token"}</button>{running ? <button className="mcp-stop" disabled={Boolean(busy)} onClick={() => void configure("stop", { enabled: false, scopes })}>{busy === "stop" ? "Stopping…" : "Stop gateway"}</button> : <button className="mcp-start" disabled={Boolean(busy) || !protectedStore || !status?.configured || !workspace?.persistent} title={!status?.configured ? "Create and copy an access token first" : undefined} onClick={() => void configure("start", { enabled: true, scopes })}>{busy === "start" ? "Starting…" : "Enable gateway"}</button>}</div></footer>
    {audit.length > 0 && <div className="mcp-audit"><span>AUDIT TRAIL · NO PROMPTS, TOKENS, OR TERMINAL OUTPUT</span><div className="mcp-terminal-feed">{audit.slice(0,4).map(record => <article key={record.id} className={`mcp-terminal-row ${record.outcome === "denied" || record.outcome === "error" ? "is-failed" : "is-live"}`}><i className="mcp-dot"/><span><strong>{record.kind} · {record.outcome}</strong><p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--text-dim-semantic)" }}>{record.client} · {record.capability || "gateway"}</p></span><time style={{ fontSize: "11px", color: "var(--text-muted-semantic)" }}>{relativeTime(record.at)}</time></article>)}</div></div>}
  </section>;
}

export function McpApprovalQueue({ visible = true, onPendingChange }) {
  const [approvals, setApprovals] = React.useState([]);
  const [busy, setBusy] = React.useState("");
  const [message, setMessage] = React.useState("");
  const refresh = React.useCallback(async () => {
    try {
      const records = await missionApi().request("mcp.approval.list");
      setApprovals(Array.isArray(records) ? records : []);
      onPendingChange?.((records || []).filter(item => item.state === "pending").length);
    } catch { setApprovals([]); onPendingChange?.(0); }
  }, [onPendingChange]);
  React.useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    void refresh();
    try { unsubscribe = missionApi().subscribe(notification => { if (active && notification?.type === "integration:event" && notification.integration === "mcp") void refresh(); }); }
    catch { /* Explicit refreshes remain available. */ }
    return () => { active = false; unsubscribe?.(); };
  }, [refresh]);
  const pending = approvals.filter(item => item.state === "pending");
  const resolve = async (approval, decision) => {
    setBusy(approval.id);
    setMessage("");
    try {
      const result = await missionApi().request("mcp.approval.resolve", { approvalId: approval.id, decision, confirmation: `confirm:mcp.approval:${approval.id}:${decision}` });
      setMessage(decision === "approve" ? result.state === "approved" ? `${approval.targetName} action executed through EngineAPI.` : result.error || "The approved action did not complete." : "Request denied. No engine action was performed.");
      await refresh();
    } catch (error) { setMessage(error.message || String(error)); }
    finally { setBusy(""); }
  };
  if (!visible || !pending.length) return null;
  return <section className="mcp-approval-queue"><header><div><span className="section-kicker">EXTERNAL AI APPROVALS</span><strong>{pending.length} MCP request{pending.length === 1 ? "" : "s"} waiting</strong></div><small>Authenticated credential · local decision · EngineAPI execution</small></header>{message && <p role="status">{message}</p>}<div>{pending.map((approval, index) => <article key={approval.id}><div className="mcp-approval-index">M{String(index + 1).padStart(2,"0")}</div><div className="mcp-approval-copy"><div><span>{approval.type === "worker" ? "WORKER LIFECYCLE" : "WORKSPACE RECIPE"}</span><em>PENDING APPROVAL</em><time>expires in {expiresIn(approval.expiresAt)}</time></div><strong>{approval.client} requests {approval.action} · {approval.targetName}</strong><dl><div><dt>Evidence</dt><dd>Valid local credential requested an explicitly granted capability; the client name is self-reported.</dd></div><div><dt>Reason</dt><dd>{approval.reason}</dd></div><div><dt>Impact</dt><dd>{approval.type === "worker" ? "Changes one engine-owned worker lifecycle." : "Changes the selected recipe run state."}</dd></div></dl><small>No action has executed. Approval expires automatically after 15 minutes.</small></div><div className="mcp-approval-actions"><button disabled={Boolean(busy)} onClick={() => void resolve(approval,"deny")}>Deny</button><button className="approve" disabled={Boolean(busy)} onClick={() => void resolve(approval,"approve")}>{busy === approval.id ? "Executing…" : "Approve once"}</button></div></article>)}</div></section>;
}
