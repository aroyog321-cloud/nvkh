import React from "react";
import { missionApi } from "./missionApi.js";

const SCOPE_OPTIONS = [
  ["summary.read", "Project summary", "Health and aggregate state"],
  ["workers.read", "Workers and agents", "Lifecycle, evidence, resources, and missions"],
  ["needs.read", "Needs You", "Current human decisions"],
  ["memory.read", "Project Memory", "Bounded chapters and recovery links"],
  ["terminal.read", "Terminal evidence", "Bounded redacted lines; disabled by default"],
  ["actions.request", "Request actions", "Creates a local approval; never executes remotely"]
];

function timeLabel(timestamp) {
  if (!timestamp) return "Never connected";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  return minutes < 1 ? "Active now" : minutes < 60 ? `Seen ${minutes}m ago` : `Seen ${Math.floor(minutes / 60)}h ago`;
}

export function MobileCompanionSettings({ workspace }) {
  const [status, setStatus] = React.useState(null);
  const [devices, setDevices] = React.useState([]);
  const [invitation, setInvitation] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [message, setMessage] = React.useState("");
  const refresh = React.useCallback(async () => {
    const [nextStatus, nextDevices] = await Promise.all([missionApi().request("mobile.status"), missionApi().request("mobile.device.list")]);
    setStatus(nextStatus); setDevices(nextDevices || []);
  }, []);
  React.useEffect(() => {
    let active = true; let unsubscribe = () => {};
    void refresh().catch(error => { if (active) setMessage(error.message || String(error)); });
    try { unsubscribe = missionApi().subscribe(notification => { if (active && notification?.type === "integration:event" && notification.integration === "mobile") { setStatus(notification.status); void missionApi().request("mobile.device.list").then(setDevices).catch(() => {}); } }); } catch {}
    return () => { active = false; unsubscribe?.(); };
  }, [refresh, workspace?.path]);
  const configure = async configuration => { setBusy("configure"); setMessage(""); try { const next = await missionApi().request("mobile.configure", { configuration }); setStatus(next); await refresh(); setMessage(next.running ? "Mobile supervision service is available on your local network." : "Mobile supervision service is disabled."); } catch (error) { setMessage(error.message || String(error)); } finally { setBusy(""); } };
  const toggleScope = scope => { const scopes = status?.scopes || []; const next = scopes.includes(scope) ? scopes.filter(item => item !== scope) : [...scopes, scope]; void configure({ scopes: next }); };
  const invite = async () => { setBusy("invite"); setMessage(""); try { const value = await missionApi().request("mobile.invite", { confirmation: "confirm:mobile.invite" }); setInvitation(value); setMessage("Pairing invitation created for five minutes. Keep the code private."); } catch (error) { setMessage(error.message || String(error)); } finally { setBusy(""); } };
  const copyInvitation = async () => {
    if (!invitation) return;
    const pairing = JSON.stringify({ code: invitation.code, endpoints: invitation.endpoints || [] }, null, 2);
    try { await navigator.clipboard.writeText(pairing); setMessage("Pairing details copied. They expire with this invitation."); }
    catch { setMessage("Clipboard access was unavailable. Enter the code and endpoint on the phone manually."); }
  };
  const revoke = async device => { setBusy(device.id); setMessage(""); try { await missionApi().request("mobile.device.revoke", { deviceId: device.id, confirmation: `confirm:mobile.device.revoke:${device.id}` }); await refresh(); setMessage(`${device.name} was revoked immediately.`); } catch (error) { setMessage(error.message || String(error)); } finally { setBusy(""); } };
  const protectedStore = status?.available === true;
  return <section className={`settings-panel settings-panel-wide mobile-companion-settings ${status?.running ? "is-running" : ""}`}><header><div className="mobile-title"><span className="mobile-mark">M</span><div><h3>Mobile supervision companion</h3><p>Pair a trusted device for encrypted project supervision—not a remote shell or mobile IDE.</p></div></div><div className={`mobile-service-state ${status?.running ? "is-live" : ""}`}><i/><span><small>LOCAL SERVICE</small><strong>{status?.running ? "Available" : status?.enabled ? "Needs review" : "Disabled"}</strong></span></div></header><div className="mobile-lan-boundary"><strong>LOCAL NETWORK ONLY</strong><span>Remote access outside your LAN requires a separately hosted authenticated relay; this build does not expose one.</span></div><div className="mobile-security-summary"><div><span>TRANSPORT</span><strong>{status?.transport || "Encrypted payloads"}</strong><small>Application-layer confidentiality and integrity</small></div><div><span>DEVICE TRUST</span><strong>{status?.deviceCount || 0} paired · {status?.revokedDeviceCount || 0} revoked</strong><small>OS-protected device credentials</small></div><div className={status?.pendingApprovalCount ? "has-attention" : ""}><span>REQUESTS</span><strong>{status?.pendingApprovalCount || 0} waiting</strong><small>Every action stops in Needs You</small></div><div><span>REPLAY DEFENSE</span><strong>Timestamp + one-time nonce</strong><small>Immediate revocation on this desktop</small></div></div><div className="mobile-companion-body"><div className="mobile-scope-list pm-stagger"><span className="section-kicker">DEVICE PERMISSIONS</span><div className="mcp-terminal-feed">{SCOPE_OPTIONS.map(([id,label,detail]) => <label key={id} className="terminal-toggle-card"><div><strong>{label}</strong><p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--text-muted-semantic)" }}>{detail}</p></div><div className="pm-toggle"><input type="checkbox" checked={(status?.scopes || []).includes(id)} disabled={!protectedStore || Boolean(busy)} onChange={() => toggleScope(id)}/><div className="pm-toggle-track"><div className="pm-toggle-thumb"/></div></div></label>)}</div></div><aside><span className="section-kicker">PAIRING</span>{invitation ? <div className="mobile-invitation"><small>ONE-TIME CODE · EXPIRES IN 5 MINUTES</small><strong>{invitation.code}</strong><span>{invitation.endpoints?.[0] || "No local IPv4 address detected"}</span><p>The code is used only to prove the encrypted key exchange and is never transmitted.</p><div><button onClick={() => void copyInvitation()}>Copy details</button><button onClick={() => setInvitation(null)}>Hide code</button></div></div> : <><strong>{status?.running ? "Ready to pair a device" : "Enable the local service first"}</strong><p>Pairing uses a short-lived proof, X25519 key exchange, HKDF-SHA256, and encrypted device-secret delivery.</p><button disabled={!status?.running || busy === "invite"} onClick={() => void invite()}>{busy === "invite" ? "Creating…" : "Pair new device"}</button></>}</aside></div>{devices.length > 0 && <div className="mobile-device-list"><header><span>PAIRED DEVICES</span><small>Revocation invalidates credentials and pending requests immediately</small></header>{devices.map(device => <article key={device.id} className={device.state === "revoked" ? "is-revoked" : ""}><i>{device.name.slice(0,1).toUpperCase()}</i><div><strong>{device.name}</strong><small>{device.state === "revoked" ? "Revoked" : `${timeLabel(device.lastSeenAt)} · ${device.scopes.length} permissions`}</small></div><span>{device.state}</span>{device.state !== "revoked" && <button disabled={Boolean(busy)} onClick={() => void revoke(device)}>{busy === device.id ? "Revoking…" : "Revoke"}</button>}</article>)}</div>}{message && <p className={status?.lastError ? "is-error" : ""} role="status">{message}</p>}<footer><span>{status?.endpoints?.length ? `${status.endpoints.length} local network endpoint${status.endpoints.length === 1 ? "" : "s"}` : "No local network address is currently available"}</span><button disabled={!workspace?.persistent || !protectedStore || Boolean(busy)} onClick={() => void configure({ enabled: !status?.enabled })}>{busy === "configure" ? "Updating…" : status?.enabled ? "Disable companion" : "Enable companion"}</button></footer></section>;
}

export function MobileApprovalQueue({ visible = true, onPendingChange }) {
  const [items, setItems] = React.useState([]);
  const [busy, setBusy] = React.useState("");
  const refresh = React.useCallback(async () => { const records = await missionApi().request("mobile.approval.list"); const pending = (records || []).filter(item => item.state === "pending"); setItems(pending); onPendingChange?.(pending.length); }, [onPendingChange]);
  React.useEffect(() => { let active = true; let unsubscribe = () => {}; void refresh().catch(() => { if (active) onPendingChange?.(0); }); try { unsubscribe = missionApi().subscribe(notification => { if (active && notification?.type === "integration:event" && notification.integration === "mobile") void refresh(); }); } catch {} return () => { active = false; unsubscribe?.(); }; }, [refresh, onPendingChange]);
  const resolve = async (item, decision) => { setBusy(item.id); try { await missionApi().request("mobile.approval.resolve", { approvalId: item.id, decision, confirmation: `confirm:mobile.approval:${item.id}:${decision}` }); await refresh(); } finally { setBusy(""); } };
  if (!visible || !items.length) return null;
  return <section className="mobile-approval-queue"><header><div><span>MOBILE REQUESTS</span><strong>{items.length} paired-device request{items.length === 1 ? "" : "s"}</strong></div><small>Encrypted request · local execution only</small></header>{items.map(item => <article key={item.id}><i>M</i><div><span>{item.deviceName} · {item.type}</span><strong>{item.action} · {item.targetName}</strong><small>{item.reason} No action has executed.</small></div><button disabled={Boolean(busy)} onClick={() => void resolve(item, "deny")}>Deny</button><button className="approve" disabled={Boolean(busy)} onClick={() => void resolve(item, "approve")}>{busy === item.id ? "Executing…" : "Approve once"}</button></article>)}</section>;
}
