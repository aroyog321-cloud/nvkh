import React from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { missionApi } from "./missionApi.js";

const MODELS = [
  ["gemini-2.5-flash", "Gemini 2.5 Flash", "Stable · balanced"],
  ["gemini-2.5-flash-lite", "Gemini 2.5 Flash-Lite", "Stable · economical"],
  ["gemini-3.1-flash-lite", "Gemini 3.1 Flash-Lite", "Preview · economical"],
  ["gemini-3.5-flash-lite", "Gemini 3.5 Flash-Lite", "Preview · fast"],
  ["gemini-3.6-flash", "Gemini 3.6 Flash", "Preview · capable"],
  ["gemini-3.7-flash", "Gemini 3.7 Flash", "Preview · newest"]
];

const QUESTIONS = [
  "What is happening?",
  "What is broken?",
  "What needs me?",
  "What changed while I was away?"
];

const PLAN_EXAMPLES = [
  "Create backend and frontend workers, then start backend before frontend.",
  "Create a daily workspace profile for database, backend, frontend, tests, and Git.",
  "Restart the failed worker and verify its current state."
];

function actionLabel(action) {
  const target = action.workerId || action.recipeId || action.definition?.id || action.profile?.id || "workspace";
  return `${String(action.type || "action").replaceAll("-", " ")} · ${target}`;
}

function modelLabel(model) {
  return MODELS.find(([id]) => id === model)?.[1] || model || "Gemini 2.5 Flash";
}

function StateMark({ status }) {
  const tone = status?.configured ? "ready" : status?.available === false ? "blocked" : "idle";
  const label = status?.configured ? "Ready" : status?.available === false ? "Encryption unavailable" : "Not configured";
  return <span className={`mission-ai-state is-${tone}`}><i/><span><small>OBSERVE-ONLY INTELLIGENCE</small><strong>{label}</strong></span></span>;
}

export function MissionSupervisorApprovalQueue({ visible = true, onPendingChange }) {
  const [approvals, setApprovals] = React.useState([]);
  const [busy, setBusy] = React.useState("");
  const [message, setMessage] = React.useState("");
  const refresh = React.useCallback(async () => {
    try {
      const records = await missionApi().request("missionSupervisor.approval.list");
      setApprovals(Array.isArray(records) ? records : []);
      onPendingChange?.((records || []).filter(item => item.state === "pending").length);
    } catch (error) { setMessage(error.message || String(error)); }
  }, [onPendingChange]);
  React.useEffect(() => { void refresh(); }, [refresh]);
  const resolve = async (approval, decision) => {
    setBusy(`${approval.id}:${decision}`);
    setMessage("");
    try {
      const result = await missionApi().request("missionSupervisor.approval.resolve", {
        approvalId: approval.id,
        decision,
        confirmation: `confirm:missionSupervisor.approval:${approval.id}:${decision}`
      });
      setMessage(result.state === "executed" ? "Mission Supervisor actions executed and verified through EngineAPI." : result.state === "denied" ? "Plan denied. No action executed." : `Plan finished with state: ${result.state}.`);
      await refresh();
    } catch (error) { setMessage(error.message || String(error)); }
    finally { setBusy(""); }
  };
  const pending = approvals.filter(item => item.state === "pending");
  if (!visible || (!pending.length && !message)) return null;
  return <section className="supervisor-approval-queue"><header><div><span className="section-kicker">MISSION SUPERVISOR</span><strong>{pending.length} Gemini plan{pending.length === 1 ? "" : "s"} awaiting your decision</strong></div><small>Nothing executes before approval</small></header>{message && <p role="status">{message}</p>}<div>{pending.map(approval => <article key={approval.id}><div className="supervisor-plan-copy"><span>{approval.model || "Gemini"} · {approval.plan.actions.length} exact actions</span><strong>{approval.plan.summary}</strong>{approval.instruction && <p>“{approval.instruction}”</p>}<ol>{approval.plan.actions.map((action, index) => <li key={`${approval.id}-${index}`}><b>{String(index + 1).padStart(2, "0")}</b><span><strong>{actionLabel(action)}</strong><small>{action.reason}</small>{action.type === "terminal-input" && <code>{action.input}</code>}</span></li>)}</ol>{approval.plan.assumptions?.length > 0 && <aside><b>ASSUMPTIONS</b>{approval.plan.assumptions.join(" · ")}</aside>}</div><footer><button disabled={Boolean(busy)} onClick={() => void resolve(approval, "deny")}>Deny</button><button className="primary" disabled={Boolean(busy)} onClick={() => void resolve(approval, "approve")}>{busy === `${approval.id}:approve` ? "Executing through EngineAPI…" : `Approve ${approval.plan.actions.length} actions`}</button></footer></article>)}</div></section>;
}

export function MissionAISettings({ onOpen }) {
  const [status, setStatus] = React.useState(null);
  const [apiKey, setApiKey] = React.useState("");
  const [model, setModel] = React.useState("gemini-2.5-flash");
  const [includeTerminalEvidence, setIncludeTerminalEvidence] = React.useState(false);
  const [busy, setBusy] = React.useState("");
  const [message, setMessage] = React.useState("");
  const refresh = React.useCallback(async () => {
    try {
      const value = await missionApi().request("missionAi.status");
      setStatus(value);
      setModel(value.model || "gemini-2.5-flash");
      setIncludeTerminalEvidence(value.includeTerminalEvidence === true);
    } catch (error) { setMessage(error.message || String(error)); }
  }, []);

  React.useEffect(() => { void refresh(); }, [refresh]);

  const save = async () => {
    setBusy("save");
    setMessage("");
    try {
      const value = await missionApi().request("missionAi.configure", {
        configuration: {
          ...(apiKey ? { apiKey } : {}),
          model,
          includeTerminalEvidence
        }
      });
      setApiKey("");
      setStatus(value);
      setMessage("Mission AI configuration protected by this device.");
    } catch (error) { setMessage(error.message || String(error)); }
    finally { setBusy(""); }
  };

  const clear = async () => {
    setBusy("clear");
    setMessage("");
    try {
      const value = await missionApi().request("missionAi.clear", { confirmation: "confirm:missionAi.clear" });
      setApiKey("");
      setStatus(value.status);
      setMessage(value.removed ? "Gemini credential removed from this device." : "No Gemini credential was stored.");
    } catch (error) { setMessage(error.message || String(error)); }
    finally { setBusy(""); }
  };

  const selectedModel = MODELS.find(([id]) => id === model) || MODELS[0];
  const blocked = status?.available === false;
  return <section className={`pm-page-hero feat-ai ${status?.configured ? "is-configured" : ""}`}>
    <header><div className="mission-ai-heading"><span className="mission-ai-mark">AI</span><div><h3>Gemini Mission Supervisor</h3><p>Ask grounded project questions or generate exact action plans. Plans have no authority until you approve them in Needs You.</p></div></div><StateMark status={status}/></header>
    <div className="mission-ai-settings-grid">
      <div className="ai-api-key-banner"><label htmlFor="mission-ai-key" style={{flex: 1}}><span>Gemini API key</span><small style={{display: "block", fontSize: "11px", color: "var(--text-muted-semantic)"}}>{status?.configured ? "A protected key is stored. Enter a new key only to replace it." : "Stored with OS credential encryption—not in project files."}</small></label><input id="mission-ai-key" type="password" style={{padding: "8px 12px", borderRadius: "var(--radius-md)", border: "1px solid rgba(184,168,248,.3)", background: "var(--surface-raised)", color: "var(--text-strong)"}} autoComplete="off" spellCheck="false" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={status?.configured ? "Protected on this device" : "Enter API key"} disabled={blocked || Boolean(busy)}/></div>
      <div className="mission-ai-model"><span>Model</span><DropdownMenu.Root><DropdownMenu.Trigger asChild><button disabled={blocked || Boolean(busy)}><span><strong>{selectedModel[1]}</strong><small>{selectedModel[2]}</small></span><b>⌄</b></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="mission-ai-model-menu" align="start" sideOffset={7}>{MODELS.map(([id, label, detail]) => <DropdownMenu.Item key={id} className={model === id ? "is-selected" : ""} onSelect={() => setModel(id)}><span><strong>{label}</strong><small>{detail}</small></span><b>{model === id ? "✓" : ""}</b></DropdownMenu.Item>)}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></div>
      <label className="mission-ai-evidence-permission"><input type="checkbox" checked={includeTerminalEvidence} onChange={event => setIncludeTerminalEvidence(event.target.checked)} disabled={blocked || Boolean(busy)}/><span><strong>Include bounded terminal evidence</strong><small>Explicit permission. Recent output is redacted and size-limited; it remains omitted by default.</small></span><i/></label>
      <aside><span>AUTHORITY BOUNDARY</span><ul><li>Healthy live evidence only when permitted</li><li>Stateless provider requests; server storage disabled</li><li>Structured plans are validated locally</li><li>Every mutation enters Needs You</li><li>Terminal input requires exact local approval</li></ul></aside>
    </div>
    {status?.error && <p className="mission-ai-message is-error" role="alert">{status.error}</p>}
    {message && <p className="mission-ai-message" role="status">{message}</p>}
    <footer><span>{blocked ? "Mission Control refuses plaintext credential storage on this device." : status?.configured ? `${modelLabel(status.model)} · terminal evidence ${status.includeTerminalEvidence ? "permitted" : "omitted"}` : "An API key is required before Mission AI can answer."}</span><div>{status?.configured && <button className="mission-ai-ask" onClick={onOpen} disabled={Boolean(busy)}>Ask Mission AI</button>}<AlertDialog.Root><AlertDialog.Trigger asChild><button className="mission-ai-clear" disabled={!status?.configured || Boolean(busy)}>Remove key</button></AlertDialog.Trigger><AlertDialog.Portal><AlertDialog.Overlay className="palette-backdrop confirmation-backdrop"/><AlertDialog.Content className="confirmation-dialog"><span className="confirmation-mark">!</span><div><span className="section-kicker">REMOVE CREDENTIAL</span><AlertDialog.Title>Remove the Gemini API key?</AlertDialog.Title><AlertDialog.Description>The OS-encrypted credential will be deleted from this device.</AlertDialog.Description><small>You can configure Mission AI again later.</small></div><footer><AlertDialog.Cancel asChild><button>Cancel</button></AlertDialog.Cancel><AlertDialog.Action asChild><button className="danger-confirm" onClick={() => void clear()}>Remove key</button></AlertDialog.Action></footer></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root><button className="mission-ai-save" disabled={blocked || Boolean(busy) || (!status?.configured && !apiKey)} onClick={() => void save()}>{busy === "save" ? "Protecting…" : status?.configured ? "Save preferences" : "Protect & enable"}</button></div></footer>
  </section>;
}

export function MissionAIOverlay({ open, onClose, onConfigure, onNeedsYou, onEvidence, initialPrompt = "" }) {
  const [status, setStatus] = React.useState(null);
  const [mode, setMode] = React.useState("ask");
  const [question, setQuestion] = React.useState(QUESTIONS[0]);
  const [answer, setAnswer] = React.useState(null);
  const [proposal, setProposal] = React.useState(null);
  const [turns, setTurns] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    let active = true;
    missionApi().request("missionAi.status").then(value => { if (active) setStatus(value); }).catch(value => { if (active) setError(value.message || String(value)); });
    return () => { active = false; };
  }, [open]);

  React.useEffect(() => {
    if (!open || !initialPrompt) return;
    setMode("ask");
    setQuestion(initialPrompt.slice(0, 1200));
    setAnswer(null);
    setProposal(null);
    setError("");
  }, [initialPrompt, open]);

  const ask = async () => {
    if (!question.trim() || busy) return;
    const submittedQuestion = question.trim();
    setBusy(true);
    setError("");
    setAnswer(null);
    try {
      const value = await missionApi().request("missionAi.ask", { question: submittedQuestion });
      setAnswer(value);
      setTurns(current => [...current, { id: `${Date.now()}-answer`, mode: "ask", prompt: submittedQuestion, answer: value }]);
    }
    catch (value) { setError(value.message || String(value)); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (mode === "ask") return ask();
    if (!question.trim() || busy) return;
    const submittedQuestion = question.trim();
    setBusy(true);
    setError("");
    setAnswer(null);
    setProposal(null);
    try {
      const value = await missionApi().request("missionSupervisor.plan", { instruction: submittedQuestion });
      setProposal(value);
      setTurns(current => [...current, { id: `${Date.now()}-plan`, mode: "plan", prompt: submittedQuestion, proposal: value }]);
    }
    catch (value) { setError(value.message || String(value)); }
    finally { setBusy(false); }
  };

  const configure = () => { onClose(); onConfigure(); };
  const presets = mode === "ask" ? QUESTIONS : PLAN_EXAMPLES;
  return <Dialog.Root open={open} onOpenChange={value => !value && onClose()}><Dialog.Portal><Dialog.Overlay className="palette-backdrop mission-ai-backdrop"/><Dialog.Content className="mission-ai-dialog" aria-describedby="mission-ai-boundary"><header><div><span className="mission-ai-mark">AI</span><span><small>MISSION SUPERVISOR · APPROVAL GATED</small><Dialog.Title>Mission Command</Dialog.Title></span></div><div className="mission-ai-header-actions">{turns.length > 0 && <button onClick={() => { setTurns([]); setAnswer(null); setProposal(null); setError(""); }}>New session</button>}<Dialog.Close asChild><button aria-label="Close Mission AI">×</button></Dialog.Close></div></header>
        {!status?.configured ? <div className="mission-ai-unconfigured"><span className="mission-ai-lock">◇</span><h3>Connect Gemini securely</h3><p>Mission AI needs an OS-encrypted API key before it can interpret the current project snapshot.</p><button onClick={configure}>Open secure settings</button></div> : <><div className="mission-ai-mode" role="tablist" aria-label="Mission AI mode"><button role="tab" aria-selected={mode === "ask"} className={mode === "ask" ? "is-current" : ""} onClick={() => { setMode("ask"); setQuestion(QUESTIONS[0]); setProposal(null); }}>Ask about project</button><button role="tab" aria-selected={mode === "plan"} className={mode === "plan" ? "is-current" : ""} onClick={() => { setMode("plan"); setQuestion(PLAN_EXAMPLES[0]); setAnswer(null); }}>Plan workspace actions</button></div><div className="gemini-chat"><div className="gemini-chat__messages" aria-label="Earlier turns in this Mission AI session">{turns.length > 1 && turns.slice(0,-1).map(turn => <React.Fragment key={turn.id}><div className="chat-message is-user"><div className="chat-message__avatar">U</div><div className="chat-message__bubble"><p style={{margin: 0}}>{turn.prompt}</p></div></div><div className="chat-message is-ai"><div className="chat-message__avatar">AI</div><div className="chat-message__bubble">{turn.answer ? <><p style={{margin: 0, marginBottom: "8px"}}>{turn.answer.text}</p>{turn.answer.estimate && <small style={{display: "block", color: "var(--text-muted-semantic)"}}>Estimate: {turn.answer.estimate.minimumHours}–{turn.answer.estimate.maximumHours} hours</small>}{turn.answer.citations?.length > 0 && <button className="mission-ai-evidence-link" onClick={onEvidence}>Review {turn.answer.citations.length} evidence reference{turn.answer.citations.length === 1 ? "" : "s"} in History</button>}</> : <><p style={{margin: 0}}>{turn.proposal?.plan?.summary}</p><small style={{display: "block", color: "var(--text-muted-semantic)", marginTop: "8px"}}>{turn.proposal?.plan?.actions?.length || 0} validated actions · not executed</small></>}</div></div></React.Fragment>)}</div></div><div className="gemini-chat__input-area"><div className="gemini-chat__chips">{presets.map(value => <button key={value} className="gemini-chat__chip" onClick={() => setQuestion(value)}>{value}</button>)}</div><div className="gemini-chat__input-row"><textarea className="gemini-chat__textarea" maxLength="1200" value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void submit(); }} placeholder={mode === "ask" ? "Ask about current state, evidence, impact..." : "Describe workers, order, profile..."}/><button className="btn-primary feat-ai" disabled={busy || !question.trim()} onClick={() => void submit()}>{busy ? "Thinking…" : mode === "ask" ? "Ask" : "Plan"}</button></div></div>
      <div className={`mission-ai-answer ${busy ? "is-busy" : ""}`} aria-live="polite">{busy ? <div className="mission-ai-reading"><i/><span><strong>{mode === "ask" ? "Reading unified project supervision" : "Building a dependency-aware action plan"}</strong><small>{mode === "ask" ? "No worker or terminal action is being performed." : "Gemini cannot execute; local validation and approval follow."}</small></span></div> : proposal ? <div className="mission-ai-proposal"><span className="section-kicker">VALIDATED PLAN · NOT EXECUTED</span><strong>{proposal.plan.summary}</strong><ol>{proposal.plan.actions.map((action, index) => <li key={index}><b>{index + 1}</b><span><strong>{actionLabel(action)}</strong><small>{action.reason}</small></span></li>)}</ol><footer><span>Expires in 15 minutes</span><button onClick={() => { onClose(); onNeedsYou?.(); }}>Review exact plan in Needs You</button></footer></div> : answer ? <><div className="mission-ai-answer-copy"><span className="section-kicker">GROUNDED INTERPRETATION · VERIFY EVIDENCE</span><p>{answer.text}</p>{answer.estimate && <section className="mission-ai-estimate"><header><span>AI TIME RANGE</span><strong>{answer.estimate.minimumHours}–{answer.estimate.maximumHours} hours</strong><small>{answer.estimate.confidence} confidence</small></header><div><span><b>Assumptions</b>{answer.estimate.assumptions?.length ? answer.estimate.assumptions.join(" · ") : "None declared"}</span><span><b>Missing evidence</b>{answer.estimate.missingEvidence?.length ? answer.estimate.missingEvidence.join(" · ") : "None declared"}</span></div></section>}<div className="mission-ai-citations"><span>EVIDENCE USED</span>{(answer.citations || []).map(id => <button type="button" key={id} onClick={onEvidence}>{id}</button>)}</div></div><footer><span>{modelLabel(answer.model)} · {answer.authority} authority</span><span>{answer.context?.workerCount || 0} workers · {answer.context?.evidenceCount || 0} evidence references</span></footer></> : error ? <div className="mission-ai-answer-error"><strong>Mission AI could not complete the request</strong><p>{error}</p></div> : <div className="mission-ai-answer-empty"><strong>{mode === "ask" ? "One question. One current supervision snapshot." : "Plan freely. Execute only after review."}</strong><p>{mode === "ask" ? "Mission AI summarizes bounded evidence without inventing progress, percentages, or deadlines." : "Every action will be validated, shown in Needs You, executed through EngineAPI, and verified in History."}</p></div>}</div></>}
    <p id="mission-ai-boundary" className="mission-ai-boundary">Provider storage is disabled. Gemini proposes; local validation constrains; Needs You approves; EngineAPI executes and verifies.</p>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
