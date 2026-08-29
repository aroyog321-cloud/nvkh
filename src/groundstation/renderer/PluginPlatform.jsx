import React from "react";
import { missionApi } from "./missionApi.js";

const PERMISSIONS = {
  "context.read": ["Mission Context", "Bounded workers, missions, recipes, and project state"],
  "memory.read": ["Project Memory", "Resumable chapters and verified recovery relationships"],
  "attention.read": ["Needs You", "Current human-attention records"],
  "events.read": ["Activity events", "Bounded metadata without terminal output"],
  "health.read": ["Worker health", "Lifecycle, root-process resources, and dependency impact"],
  "worker.lifecycle.request": ["Request worker actions", "Creates an expiring local approval"],
  "recipe.run.request": ["Request recipe actions", "Creates an expiring local approval"]
};

function relativeTime(value) {
  if (!value) return "never";
  const minutes = Math.max(0, Math.floor((Date.now() - value) / 60000));
  return minutes < 1 ? "now" : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}

export function PluginPlatformSettings() {
  const [status, setStatus] = React.useState(null);
  const [plugins, setPlugins] = React.useState([]);
  const [audit, setAudit] = React.useState([]);
  const [expanded, setExpanded] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [message, setMessage] = React.useState("");
  const refresh = React.useCallback(async () => {
    const [nextStatus, nextPlugins, nextAudit] = await Promise.all([
      missionApi().request("plugin.status"),
      missionApi().request("plugin.list"),
      missionApi().request("plugin.audit.list", { limit: 8 })
    ]);
    setStatus(nextStatus); setPlugins(nextPlugins || []); setAudit(nextAudit || []);
  }, []);
  React.useEffect(() => {
    let active = true; let unsubscribe = () => {};
    void refresh().catch(error => { if (active) setMessage(error.message || String(error)); });
    try { unsubscribe = missionApi().subscribe(notification => { if (active && notification?.type === "integration:event" && notification.integration === "plugins") { setStatus(notification.status); void missionApi().request("plugin.list").then(setPlugins).catch(() => {}); } }); } catch {}
    return () => { active = false; unsubscribe?.(); };
  }, [refresh]);
  const install = async () => {
    setBusy("install"); setMessage("");
    try { const result = await missionApi().request("plugin.install", { confirmation: "confirm:plugin.install" }); if (!result?.canceled) { setExpanded(result.plugin.manifest.id); setMessage(`${result.plugin.manifest.name} manifest installed disabled with no permissions granted.`); } await refresh(); }
    catch (error) { setMessage(error.message || String(error)); }
    finally { setBusy(""); }
  };
  const configure = async (plugin, configuration) => {
    setBusy(plugin.manifest.id); setMessage("");
    try { await missionApi().request("plugin.configure", { pluginId: plugin.manifest.id, configuration, confirmation: `confirm:plugin.configure:${plugin.manifest.id}` }); await refresh(); setMessage(`${plugin.manifest.name} permissions updated.`); }
    catch (error) { setMessage(error.message || String(error)); }
    finally { setBusy(""); }
  };
  const togglePermission = (plugin, permission) => {
    const grants = plugin.grantedPermissions.includes(permission) ? plugin.grantedPermissions.filter(item => item !== permission) : [...plugin.grantedPermissions, permission];
    void configure(plugin, { grantedPermissions: grants });
  };
  const uninstall = async plugin => {
    setBusy(plugin.manifest.id); setMessage("");
    try { await missionApi().request("plugin.uninstall", { pluginId: plugin.manifest.id, confirmation: `confirm:plugin.uninstall:${plugin.manifest.id}` }); await refresh(); setMessage(`${plugin.manifest.name} was removed and pending requests were revoked.`); }
    catch (error) { setMessage(error.message || String(error)); }
    finally { setBusy(""); }
  };
  return <section className="settings-panel settings-panel-wide plugin-platform-settings pm-card pm-card--feat-plugin">
    <header><div className="plugin-title"><span className="plugin-mark">P</span><div><h3>Permission-controlled plugins</h3><p>Declarative integrations for bounded context, health, and approval requests—never arbitrary desktop code.</p></div></div><div className="plugin-platform-state"><i/><span><small>ISOLATION MODEL</small><strong>No code execution</strong></span></div></header>
    <div className="plugin-boundary"><div><span>ALLOWED</span><strong>Manifest-declared capabilities</strong><small>Every grant is independent and visible</small></div><div><span>ACTIONS</span><strong>Needs You approval only</strong><small>EngineAPI executes after a local decision</small></div><div><span>FORBIDDEN</span><strong>Files · process · network · secrets</strong><small>No raw terminal or renderer authority</small></div><div><span>INSTALLED</span><strong>{status?.pluginCount || 0} manifests</strong><small>{status?.enabledCount || 0} enabled · {status?.pendingApprovalCount || 0} waiting</small></div></div>
    <div className="plugin-registry-head"><div><span>LOCAL MANIFEST REGISTRY</span><strong>Inspect permissions before enabling</strong></div><button disabled={Boolean(busy)} onClick={() => void install()}>{busy === "install" ? "Opening…" : "Install manifest…"}</button></div>
    <div className="plugin-registry">{plugins.length ? plugins.map(plugin => {
      const open = expanded === plugin.manifest.id;
      return <article key={plugin.manifest.id} className={`${plugin.enabled ? "is-enabled" : ""} ${open ? "is-open" : ""}`}><button className="plugin-summary" onClick={() => setExpanded(open ? null : plugin.manifest.id)}><span className="plugin-avatar">{plugin.manifest.name.slice(0, 2).toUpperCase()}</span><span><small>{plugin.manifest.publisher} · v{plugin.manifest.version}</small><strong>{plugin.manifest.name}</strong><p>{plugin.manifest.description}</p></span><em>{plugin.enabled ? "ENABLED" : "DISABLED"}</em><b>{open ? "−" : "+"}</b></button>{open && <div className="plugin-detail"><div className="plugin-manifest-facts"><span><small>PLUGIN ID</small><code>{plugin.manifest.id}</code></span><span><small>SURFACES</small><strong>{plugin.manifest.surfaces.length ? plugin.manifest.surfaces.join(" · ") : "None"}</strong></span><span><small>ACTIONS</small><strong>{plugin.manifest.actions.length} declared</strong></span></div><div className="plugin-permission-list"><header><span>DECLARED PERMISSIONS</span><small>Installed manifests start with every grant off</small></header>{plugin.manifest.permissions.map(permission => <label key={permission} className="terminal-toggle-card"><div><strong>{PERMISSIONS[permission]?.[0] || permission}{permission.endsWith(".request") && <em>APPROVAL GATED</em>}</strong><p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--text-muted-semantic)" }}>{PERMISSIONS[permission]?.[1]}</p></div><div className="pm-toggle"><input type="checkbox" checked={plugin.grantedPermissions.includes(permission)} disabled={Boolean(busy)} onChange={() => togglePermission(plugin, permission)}/><div className="pm-toggle-track"><div className="pm-toggle-thumb"/></div></div></label>)}</div><footer><span>Installed {relativeTime(plugin.installedAt)} · source {plugin.source}</span><div><button disabled={Boolean(busy)} onClick={() => void uninstall(plugin)}>Uninstall</button><button className={plugin.enabled ? "is-stop" : "is-start"} disabled={Boolean(busy)} onClick={() => void configure(plugin, { enabled: !plugin.enabled })}>{busy === plugin.manifest.id ? "Updating…" : plugin.enabled ? "Disable plugin" : "Enable plugin"}</button></div></footer></div>}</article>;
    }) : <div className="plugin-empty"><span>P</span><strong>No plugin manifests installed</strong><p>Import a local `.json` manifest. Mission Control validates it and rejects executable or privileged fields.</p></div>}</div>
    {message && <p className="plugin-message" role="status">{message}</p>}
    {audit.length > 0 && <div className="plugin-audit"><span>AUDIT · METADATA ONLY</span><div className="mcp-terminal-feed">{audit.slice(0, 5).map(item => <article key={item.id} className="mcp-terminal-row is-live"><i className="mcp-dot"/><span><strong>{item.kind} · {item.outcome}</strong><p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--text-dim-semantic)" }}>{item.pluginId || "platform"} · {item.capability || "registry"}</p></span><time style={{ fontSize: "11px", color: "var(--text-muted-semantic)" }}>{relativeTime(item.at)}</time></article>)}</div></div>}
  </section>;
}

export function PluginApprovalQueue({ visible = true, onPendingChange }) {
  const [items, setItems] = React.useState([]);
  const [busy, setBusy] = React.useState("");
  const [message, setMessage] = React.useState("");
  const refresh = React.useCallback(async () => { const records = await missionApi().request("plugin.approval.list"); const pending = (records || []).filter(item => item.state === "pending"); setItems(pending); onPendingChange?.(pending.length); }, [onPendingChange]);
  React.useEffect(() => { let active = true; let unsubscribe = () => {}; void refresh().catch(() => active && onPendingChange?.(0)); try { unsubscribe = missionApi().subscribe(notification => { if (active && notification?.type === "integration:event" && notification.integration === "plugins") void refresh(); }); } catch {} return () => { active = false; unsubscribe?.(); }; }, [refresh, onPendingChange]);
  const resolve = async (item, decision) => { setBusy(item.id); setMessage(""); try { const result = await missionApi().request("plugin.approval.resolve", { approvalId: item.id, decision, confirmation: `confirm:plugin.approval:${item.id}:${decision}` }); setMessage(decision === "deny" ? "Plugin request denied. No engine action was performed." : result.state === "approved" ? "Approved action completed through EngineAPI." : result.error || "Approved action did not complete."); await refresh(); } catch (error) { setMessage(error.message || String(error)); } finally { setBusy(""); } };
  if (!visible || !items.length) return null;
  return <section className="plugin-approval-queue"><header><div><span>PLUGIN REQUESTS</span><strong>{items.length} permissioned action{items.length === 1 ? "" : "s"} waiting</strong></div><small>Manifest declared · grant checked · local execution only</small></header>{message && <p role="status">{message}</p>}{items.map((item, index) => <article key={item.id}><div className="plugin-request-index">P{String(index + 1).padStart(2, "0")}</div><div><span>{item.pluginName} · {item.type}</span><strong>{item.operation} · {item.targetName}</strong><dl><div><dt>Reason</dt><dd>{item.reason}</dd></div><div><dt>Authority</dt><dd>{item.actionLabel} is declared and granted; no action has executed.</dd></div></dl></div><div><button disabled={Boolean(busy)} onClick={() => void resolve(item, "deny")}>Deny</button><button className="approve" disabled={Boolean(busy)} onClick={() => void resolve(item, "approve")}>{busy === item.id ? "Executing…" : "Approve once"}</button></div></article>)}</section>;
}
