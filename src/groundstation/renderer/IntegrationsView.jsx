import React from "react";
import { missionApi } from "./missionApi.js";

const INTEGRATIONS = [
  { id: "intelligence", mark: "AI", role: "ENGINE", name: "Mission AI", detail: "Gemini project supervisor", request: "missionAi.status" },
  { id: "vscode", mark: "VS", role: "EDITOR", name: "VS Code Bridge", detail: "Editor context and managed terminals", request: "vscode.status" },
  { id: "mcp", mark: "MC", role: "GATEWAY", name: "Secure MCP", detail: "Claude, ChatGPT, and external AI gateway", request: "mcp.status" },
  { id: "automation", mark: "AU", role: "WORKFLOW", name: "Automation", detail: "Approval-gated operational workflows", request: "automation.list" },
  { id: "companion", mark: "MB", role: "CLIENT", name: "Mobile Companion", detail: "Encrypted Android supervision", request: "mobile.status" },
  { id: "extensions", mark: "PL", role: "PLATFORM", name: "Plugins", detail: "Permission-controlled extensions", request: "plugin.status" }
];

// The tab strip. "overview" always leads; the rest mirror INTEGRATIONS so a
// new bridge only needs one entry, not a second list to keep in sync.
const TABS = [["overview", "Overview"], ...INTEGRATIONS.map(item => [item.id, item.name])];

function connectionState(id, value, failed) {
  if (failed) return { tone: "error", label: "Unavailable", detail: failed };
  if (id === "intelligence") return value?.configured ? { tone: "ready", label: "Ready", detail: `${value.provider || "Gemini"} · ${value.authority || "observe"}` } : { tone: "idle", label: "Set up", detail: "Add a Gemini API key" };
  if (id === "vscode") return value?.connected ? { tone: "ready", label: "Connected", detail: value.editor?.relativePath || "Project linked" } : value?.awaitingHandshake ? { tone: "waiting", label: "Waiting", detail: "Complete the extension handshake" } : { tone: "idle", label: "Not connected", detail: value?.lastError || "Connect the included extension" };
  if (id === "mcp") return value?.listening ? { tone: "ready", label: "Listening", detail: value.endpoint || "Authenticated local gateway" } : value?.enabled ? { tone: "waiting", label: "Needs attention", detail: value.lastError || "Gateway is enabled but offline" } : { tone: "idle", label: "Disabled", detail: "Configure a client credential" };
  if (id === "companion") return value?.listening ? { tone: "ready", label: "Available", detail: `${value.deviceCount || value.devices?.length || 0} paired devices` } : value?.enabled ? { tone: "waiting", label: "Needs attention", detail: value.lastError || "Desktop gateway is offline" } : { tone: "idle", label: "Disabled", detail: "Pair an Android companion" };
  if (id === "extensions") return { tone: value?.enabledCount ? "ready" : "idle", label: value?.enabledCount ? `${value.enabledCount} enabled` : "No active plugins", detail: `${value?.installedCount || 0} installed · ${value?.pendingApprovalCount || 0} approvals` };
  if (id === "automation") return { tone: value?.definitions?.some(item => item.enabled) ? "ready" : "idle", label: value?.definitions?.some(item => item.enabled) ? "Active" : "No active workflows", detail: `${value?.definitions?.length || 0} configured · ${value?.approvals?.filter(item => item.state === "pending").length || 0} approvals` };
  return { tone: "idle", label: "Not configured", detail: "Open setup" };
}

// The overview tab: a live directory, not a static list. Every count and
// status label below is read from the same protected service calls the
// detail panels use — nothing here is asserted without a request behind it.
function IntegrationOverview({ workspace, onOpen, onAskAI }) {
  const [statuses, setStatuses] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const refresh = React.useCallback(async () => {
    const results = await Promise.all(INTEGRATIONS.map(async integration => {
      try { return [integration.id, { value: await missionApi().request(integration.request) }]; }
      catch (error) { return [integration.id, { error: error.message || String(error) }]; }
    }));
    setStatuses(Object.fromEntries(results));
    setLoading(false);
  }, []);

  React.useEffect(() => {
    let unsubscribe = () => {};
    void refresh();
    try { unsubscribe = missionApi().subscribe(notification => { if (notification?.type === "integration:event") void refresh(); }); } catch { /* Manual refresh remains available. */ }
    return () => unsubscribe?.();
  }, [refresh, workspace?.path]);

  const withState = INTEGRATIONS.map(item => ({ item, status: connectionState(item.id, statuses[item.id]?.value, statuses[item.id]?.error) }));
  const readyCount = withState.filter(({ status }) => status.tone === "ready").length;
  const attentionCount = withState.filter(({ status }) => status.tone === "waiting" || status.tone === "error").length;
  const idleCount = withState.filter(({ status }) => status.tone === "idle").length;

  return <>
    <section className="integration-feature-callout pm-card pm-card--feat-ai"><div className="integration-feature-mark">AI</div><div><span className="section-kicker">MISSION AI SUPERVISOR</span><h2>Ask about the project. Plan the next move.</h2><p>Summarize terminals, explain blockers, estimate remaining work from recorded evidence, or propose a safe multi-worker workspace.</p></div><button className="btn-primary feat-ai" onClick={onAskAI}>Ask Mission AI</button></section>
    <div className="integration-stat-row">
      <div className="integration-stat"><small>READY</small><strong className="tone-ready">{loading ? "—" : readyCount}</strong></div>
      <div className="integration-stat"><small>NEEDS ATTENTION</small><strong className={attentionCount ? "tone-waiting" : ""}>{loading ? "—" : attentionCount}</strong></div>
      <div className="integration-stat"><small>NOT CONFIGURED</small><strong>{loading ? "—" : idleCount}</strong></div>
    </div>
    <section className="integration-directory"><header><div><span className="section-kicker">CAPABILITY DIRECTORY</span><strong>Connections and extensions</strong></div><button type="button" onClick={refresh}>Refresh status</button></header>
      <div className="integration-list">{withState.map(({ item, status }) => <article key={item.id} className={`integration-list-row tone-${status.tone}`}>
        <div className="integration-list-copy"><strong>{item.name}</strong><small>{item.detail}</small></div>
        <span className="integration-role-tag">{item.role}</span>
        <span className="integration-status"><i/>{loading ? "Checking" : status.label}</span>
        <button type="button" className="integration-inspect" onClick={() => onOpen(item.id)}>Inspect</button>
      </article>)}</div>
    </section>
  </>;
}

export default function IntegrationHubView({ workspace, section = "overview", onSection, onAskAI, children }) {
  return <div className="integrations-page integration-hub-v2">
    <header className="page-command-header pm-page-hero"><div><span className="page-eyebrow">INTEGRATION HUB</span><h1>Integrations</h1><p>Connect tools without surrendering control. Every bridge declares its capability and permission boundary before it can touch the active project.</p></div></header>
    <nav className="integration-hub-tabs" aria-label="Integration sections">{TABS.map(([id, label]) => <button key={id} type="button" className={section === id ? "is-current" : ""} aria-current={section === id ? "page" : undefined} onClick={() => onSection(id)}>{label}</button>)}</nav>
    <div className="integration-hub-body">
      {section === "overview" ? <IntegrationOverview workspace={workspace} onOpen={onSection} onAskAI={onAskAI}/> : children}
    </div>
  </div>;
}
