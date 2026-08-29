import React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { missionApi } from "./missionApi.js";
import { MissionAISettings } from "./MissionAI.jsx";

const MODELS = [
  ["gemini-2.5-flash", "Gemini 2.5 Flash", "Balanced"],
  ["gemini-2.5-flash-lite", "Gemini 2.5 Flash-Lite", "Economical"],
  ["gemini-3.1-flash-lite", "Gemini 3.1 Flash-Lite", "Preview"],
  ["gemini-3.5-flash-lite", "Gemini 3.5 Flash-Lite", "Fast preview"],
  ["gemini-3.6-flash", "Gemini 3.6 Flash", "Capable preview"],
  ["gemini-3.7-flash", "Gemini 3.7 Flash", "Newest preview"]
];

const ASK_PRESETS = ["What is happening?", "What is broken?", "What needs me?"];
const PLAN_PRESETS = [
  "Create a safe daily workspace for this project.",
  "Plan how to recover the failed workers and verify them.",
  "Propose the next evidence-backed steps without executing anything."
];

function actionLabel(action) {
  const target = action.workerId || action.recipeId || action.definition?.id || action.profile?.id || "workspace";
  return `${String(action.type || "action").replaceAll("-", " ")} · ${target}`;
}

function modelLabel(model) {
  return MODELS.find(([id]) => id === model)?.[1] || model || "Gemini 2.5 Flash";
}

function Answer({ answer, onEvidence }) {
  return <div className="mai-response-content">
    <p>{answer.text}</p>
    {answer.estimate && <section className="mai-estimate"><div><span>Estimated range</span><strong>{answer.estimate.minimumHours}–{answer.estimate.maximumHours} hours</strong><small>{answer.estimate.confidence} confidence</small></div><div><span>Assumptions</span><p>{answer.estimate.assumptions?.length ? answer.estimate.assumptions.join(" · ") : "None declared"}</p></div><div><span>Missing evidence</span><p>{answer.estimate.missingEvidence?.length ? answer.estimate.missingEvidence.join(" · ") : "None declared"}</p></div></section>}
    {answer.citations?.length > 0 && <div className="mai-evidence"><span>Evidence used</span>{answer.citations.map(id => <button key={id} onClick={onEvidence}>{id}</button>)}</div>}
  </div>;
}

function Plan({ proposal, onNeedsYou }) {
  return <div className="mai-plan">
    <header><span>Validated locally · not executed</span><strong>{proposal.plan.summary}</strong></header>
    <ol>{proposal.plan.actions.map((action, index) => <li key={`${action.type}-${index}`}><b>{String(index + 1).padStart(2, "0")}</b><div><strong>{actionLabel(action)}</strong><p>{action.reason}</p></div><span className={/kill|delete|input/i.test(action.type) ? "risk-high" : "risk-low"}>{/kill|delete|input/i.test(action.type) ? "Review" : "Bounded"}</span></li>)}</ol>
    <footer><span>Expires in 15 minutes. Nothing runs from this screen.</span><button onClick={onNeedsYou}>Review in Needs You</button></footer>
  </div>;
}

export default function MissionAIScreen({ initialPrompt = "", onConfigure, onNeedsYou, onEvidence }) {
  const [status, setStatus] = React.useState(null);
  const [mode, setMode] = React.useState("ask");
  const [question, setQuestion] = React.useState(initialPrompt || ASK_PRESETS[0]);
  const [turns, setTurns] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const refresh = React.useCallback(async () => {
    try { setStatus(await missionApi().request("missionAi.status")); }
    catch (value) { setError(value.message || String(value)); }
  }, []);

  React.useEffect(() => { void refresh(); }, [refresh]);
  React.useEffect(() => {
    if (!initialPrompt) return;
    setMode("ask");
    setQuestion(initialPrompt.slice(0, 1200));
  }, [initialPrompt]);

  const changeModel = async model => {
    if (busy || model === status?.model) return;
    setBusy(true);
    setError("");
    try {
      setStatus(await missionApi().request("missionAi.configure", {
        configuration: { model, includeTerminalEvidence: status?.includeTerminalEvidence === true }
      }));
    } catch (value) { setError(value.message || String(value)); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    const prompt = question.trim();
    if (!prompt || busy) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "ask") {
        const answer = await missionApi().request("missionAi.ask", { question: prompt });
        setTurns(current => [...current, { id: `${Date.now()}-answer`, prompt, answer }]);
      } else {
        const proposal = await missionApi().request("missionSupervisor.plan", { instruction: prompt });
        setTurns(current => [...current, { id: `${Date.now()}-plan`, prompt, proposal }]);
      }
      setQuestion("");
    } catch (value) { setError(value.message || String(value)); }
    finally { setBusy(false); }
  };

  const presets = mode === "ask" ? ASK_PRESETS : PLAN_PRESETS;
  return <div className="mission-ai-screen">
    <header className="mai-header">
      <div className="mai-title"><span className="mai-orb">AI</span><div><span>Mission AI</span><h1>Project intelligence, grounded in evidence.</h1></div></div>
      <div className="mai-header-actions">
        {status?.configured && <DropdownMenu.Root><DropdownMenu.Trigger asChild><button className="mai-model" disabled={busy}><span><small>Model</small><strong>{modelLabel(status.model)}</strong></span><i>⌄</i></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="mission-ai-model-menu mai-model-menu" align="end" sideOffset={8}>{MODELS.map(([id, label, detail]) => <DropdownMenu.Item key={id} className={status.model === id ? "is-selected" : ""} onSelect={() => void changeModel(id)}><span><strong>{label}</strong><small>{detail}</small></span><b>{status.model === id ? "✓" : ""}</b></DropdownMenu.Item>)}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>}
        <button className="mai-settings-link" onClick={onConfigure}>AI settings</button>
      </div>
    </header>

    {!status?.configured ? <div className="mai-setup"><div><span className="mai-setup-mark">◇</span><h2>Connect Mission AI securely</h2><p>Add an OS-encrypted Gemini key. Credentials never enter project files, renderer storage, or mission history.</p></div><MissionAISettings onOpen={refresh}/></div> : <div className="mai-workspace">
      <aside className="mai-context">
        <div><span>Project intelligence</span><strong>Live, bounded context</strong><p>Mission AI reads the current supervision snapshot and cites recorded evidence. It does not own terminals or execute tools.</p></div>
        <dl><div><dt>Authority</dt><dd>{mode === "ask" ? "Read-only answers" : "Proposal only"}</dd></div><div><dt>Evidence</dt><dd>{status.includeTerminalEvidence ? "Bounded output permitted" : "Terminal output omitted"}</dd></div><div><dt>Storage</dt><dd>Provider storage disabled</dd></div></dl>
        <button onClick={onEvidence}>Open project evidence</button>
      </aside>

      <main className="mai-chat">
        <div className="mai-mode" role="tablist" aria-label="Mission AI mode"><button role="tab" aria-selected={mode === "ask"} className={mode === "ask" ? "is-current" : ""} onClick={() => { setMode("ask"); setQuestion(ASK_PRESETS[0]); }}>Ask</button><button role="tab" aria-selected={mode === "plan"} className={mode === "plan" ? "is-current" : ""} onClick={() => { setMode("plan"); setQuestion(PLAN_PRESETS[0]); }}>Plan actions</button><span>{mode === "ask" ? "Read-only interpretation" : "Approval-gated proposal"}</span></div>
        <div className="mai-thread" aria-live="polite">
          {!turns.length && !busy && <section className="mai-welcome"><span>AI</span><h2>What do you need to understand?</h2><p>Ask about current workers, failures, changes, evidence, or the decisions waiting for you.</p></section>}
          {turns.map(turn => <React.Fragment key={turn.id}><article className="mai-message is-user"><span>You</span><p>{turn.prompt}</p></article><article className="mai-message is-ai"><span>Mission AI</span>{turn.answer ? <Answer answer={turn.answer} onEvidence={onEvidence}/> : <Plan proposal={turn.proposal} onNeedsYou={onNeedsYou}/>}</article></React.Fragment>)}
          {busy && <div className="mai-thinking"><i/><div><strong>{mode === "ask" ? "Reading project evidence" : "Validating a bounded plan"}</strong><small>No action is being executed.</small></div></div>}
          {error && <div className="mai-error" role="alert"><strong>Mission AI could not complete the request</strong><p>{error}</p></div>}
        </div>
        <div className="mai-composer">
          <div className="mai-prompts">{presets.map(value => <button key={value} onClick={() => setQuestion(value)}>{value}</button>)}</div>
          <div><textarea aria-label="Ask Mission AI" maxLength="1200" value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void submit(); }} placeholder={mode === "ask" ? "Ask about your project…" : "Describe the outcome you want planned…"}/><button disabled={busy || !question.trim()} onClick={() => void submit()}>{busy ? "Working…" : mode === "ask" ? "Ask Mission AI" : "Build plan"}<kbd>Ctrl ↵</kbd></button></div>
          <small>Gemini proposes. Local validation constrains. You approve. EngineAPI executes and verifies.</small>
        </div>
      </main>
    </div>}
  </div>;
}
