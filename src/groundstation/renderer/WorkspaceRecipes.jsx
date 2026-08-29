import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Select from "@radix-ui/react-select";
import { missionApi } from "./missionApi.js";
import { TERMINAL_LAYOUTS } from "./useTerminalLayout.js";
import { RECIPE_TEMPLATES, applyRecipeTemplate, dependencyCycle, toggleStepDependency } from "./recipeBuilderModel.js";

const GATES = [
  { value: "running", label: "Process running" },
  { value: "service", label: "Service ready" },
  { value: "tests", label: "Tests passing" },
  { value: "build", label: "Build completed" },
  { value: "database", label: "Database connected" },
  { value: "container", label: "Container healthy" },
  { value: "git-clean", label: "Git working tree clean" },
  { value: "exited-zero", label: "Exited successfully" },
  { value: "healthy", label: "Engine health signal" }
];

const RECIPE_AI_PROMPT = "Explain Mission Control Workspace Recipes to a beginner. A recipe is a saved Daily Workspace that reuses existing EngineAPI-owned workers without creating duplicate PTYs. Explain one-by-one versus parallel startup, worker order, readiness gates, start-after dependencies, timeout, retries, reuse-running, failure policy, recovery/rollback, saved terminal layout, Launch, Pause, Cancel, Recover and Delete. Then help me design a practical recipe for my current project. Do not claim that any action has executed.";

function RecipeSelect({ value, onChange, options, label = "Recipe policy" }) {
  return <Select.Root value={String(value)} onValueChange={onChange}><Select.Trigger className="recipe-select" aria-label={label}><Select.Value/><Select.Icon>⌄</Select.Icon></Select.Trigger><Select.Portal><Select.Content className="recipe-select-content" position="popper" sideOffset={6}><Select.Viewport>{options.map(option => <Select.Item className="recipe-select-item" value={String(option.value)} key={option.value}><Select.ItemText>{option.label}</Select.ItemText><Select.ItemIndicator>✓</Select.ItemIndicator></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root>;
}

function DependencyPicker({ step, steps, sessionsById, onChange }) {
  const available = steps.filter(candidate => candidate.workerId !== step.workerId);
  const label = step.dependsOn.length ? `After ${step.dependsOn.length}` : "Starts first";
  return <DropdownMenu.Root><DropdownMenu.Trigger asChild><button type="button" className="recipe-dependency-trigger"><span>{label}</span><b>⌄</b></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="recipe-dependency-menu" align="end" sideOffset={6}><DropdownMenu.Label>START ONLY AFTER</DropdownMenu.Label>{available.length ? available.map(candidate => <DropdownMenu.CheckboxItem key={candidate.workerId} checked={step.dependsOn.includes(candidate.workerId)} onCheckedChange={() => onChange(candidate.workerId)} onSelect={event => event.preventDefault()}><DropdownMenu.ItemIndicator>✓</DropdownMenu.ItemIndicator><span>{sessionsById.get(candidate.workerId)?.name || candidate.workerId}</span></DropdownMenu.CheckboxItem>) : <DropdownMenu.Item disabled>No other selected workers</DropdownMenu.Item>}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>;
}

function runTone(phase) {
  if (["failed", "blocked"].includes(phase)) return "failed";
  if (phase === "ready") return "ready";
  if (["starting", "retrying", "retry-wait"].includes(phase)) return "active";
  return "idle";
}

export default function WorkspaceRecipes({ open, projectKey, sessions, layoutId, sessionIds, onClose, onLaunch, onAskAI }) {
  const sessionIdentity = sessions.map(session => session.id).join("\u0000");
  const [recipes, setRecipes] = React.useState([]);
  const [name, setName] = React.useState("");
  const [steps, setSteps] = React.useState([]);
  const [templateId, setTemplateId] = React.useState("sequential");
  const [failurePolicy, setFailurePolicy] = React.useState("stop");
  const [recoveryPolicy, setRecoveryPolicy] = React.useState("keep-running");
  const [restartPolicy, setRestartPolicy] = React.useState("reuse-running");
  const [maxParallel, setMaxParallel] = React.useState("2");
  const [retryAttempts, setRetryAttempts] = React.useState("1");
  const [readinessTimeoutMs, setReadinessTimeoutMs] = React.useState("10000");
  const [advanced, setAdvanced] = React.useState(false);
  const [error, setError] = React.useState("");
  const refresh = React.useCallback(() => missionApi().request("recipe.list").then(value => { setRecipes(Array.isArray(value) ? value : []); setError(""); }).catch(value => setError(value.message || String(value))), []);

  React.useEffect(() => {
    const initial = sessions.map(session => ({ workerId: session.id, dependsOn: [], readiness: "running", timeoutMs: 10000 }));
    setSteps(applyRecipeTemplate("sequential", initial));
    setTemplateId("sequential");
  }, [projectKey, sessionIdentity]);
  React.useEffect(() => { if (open) void refresh(); }, [open, projectKey, refresh]);

  const sessionById = React.useMemo(() => new Map(sessions.map(session => [session.id, session])), [sessions]);
  const workerIds = steps.map(step => step.workerId);
  const applyTemplate = id => { setTemplateId(id); setSteps(current => applyRecipeTemplate(id, current)); setError(""); };
  const toggleWorker = id => setSteps(current => {
    if (current.some(step => step.workerId === id)) return current.filter(step => step.workerId !== id).map(step => ({ ...step, dependsOn: step.dependsOn.filter(dependency => dependency !== id) }));
    const next = [...current, { workerId: id, dependsOn: [], readiness: "running", timeoutMs: Number(readinessTimeoutMs) }];
    return applyRecipeTemplate(templateId, next);
  });
  const moveWorker = (index, direction) => setSteps(current => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= current.length) return current;
    const next = [...current];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    return next;
  });
  const changeDependency = (workerId, dependencyId) => setSteps(current => {
    const next = toggleStepDependency(current, workerId, dependencyId);
    const cycle = dependencyCycle(next);
    if (cycle.length) { setError(`That relationship would create a dependency cycle: ${cycle.join(", ")}`); return current; }
    setTemplateId("custom");
    setError("");
    return next;
  });
  const changeGate = (workerId, readiness) => setSteps(current => current.map(step => step.workerId === workerId ? { ...step, readiness } : step));

  // A design request, not a conversation: Mission AI is handed the real
  // workers and the current draft so the answer is about this project rather
  // than a generic recipe. It may only propose — the closing sentence keeps it
  // from reporting work it has not done.
  const askMissionAiToDesign = () => {
    const chosen = steps.map((step, index) => {
      const session = sessionById.get(step.workerId);
      return `${index + 1}. ${session?.name || step.workerId} (${session?.command || "unknown command"}, readiness gate: ${step.readiness})`;
    });
    const available = sessions.map(session => `${session.name} (${session.command})`);
    onAskAI?.([
      "Help me design a Mission Control Daily Workspace (recipe) for this project.",
      `Workers available in this project: ${available.join("; ") || "none configured yet"}.`,
      chosen.length ? `Currently selected, in launch order: ${chosen.join(" ")}` : "No workers are selected yet.",
      `Startup template: ${templateId}. Terminal layout: ${layoutId}. Maximum parallel workers: ${maxParallel}. Readiness retries: ${retryAttempts}. Gate timeout: ${readinessTimeoutMs} ms.`,
      "Recommend which of these workers should open together, a safe launch order with explicit start-after dependencies, and the right readiness gate for each one. Explain your reasoning before recommending anything, and do not claim that a recipe has been created, saved, or launched."
    ].join(" "));
  };

  const save = async event => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !steps.length) return;
    const recipe = {
      id: globalThis.crypto?.randomUUID?.() || `recipe-${Date.now()}`,
      name: trimmed.slice(0, 60),
      workerIds,
      steps: steps.map(step => ({ ...step, timeoutMs: Number(readinessTimeoutMs) })),
      layoutId,
      sessionIds,
      failurePolicy,
      recoveryPolicy,
      restartPolicy,
      maxParallel: Number(maxParallel),
      retryAttempts: Number(retryAttempts),
      retryDelayMs: 500,
      readinessTimeoutMs: Number(readinessTimeoutMs)
    };
    try { await missionApi().request("recipe.save", { recipe }); setName(""); await refresh(); }
    catch (value) { setError(value.message || String(value)); }
  };
  const runAction = async (method, recipeId, params = {}) => {
    try { await missionApi().request(method, { recipeId, ...params }); await refresh(); }
    catch (value) { setError(value.message || String(value)); }
  };

  return <Dialog.Root open={open} onOpenChange={value => !value && onClose()}><Dialog.Portal><Dialog.Overlay className="recipes-backdrop dialog-backdrop"/><Dialog.Content className="recipes-dialog recipes-dialog-v2 pm-dialog" aria-describedby="recipes-description">
      <header><div><span className="section-kicker">DAILY WORKSPACES</span><Dialog.Title id="recipes-title">Start the same project setup in one click</Dialog.Title><Dialog.Description id="recipes-description">Choose existing workers, decide their order, save once, and launch without duplicating a running terminal.</Dialog.Description></div><div className="recipe-header-actions"><button className="recipe-ai-help" onClick={() => onAskAI?.(RECIPE_AI_PROMPT)}><span>AI</span> Explain recipes</button><Dialog.Close asChild><button aria-label="Close workspace recipes">×</button></Dialog.Close></div></header>
      <div className="recipes-content">
        <form className="recipe-builder pm-card pm-card--feat-recipe" onSubmit={save}>
          <div className="recipe-builder__intro"><div><span>NEW DAILY WORKSPACE</span><strong>Choose what should open together</strong><small>{TERMINAL_LAYOUTS.find(item => item.id === layoutId)?.label || layoutId} layout · {workerIds.length} selected</small></div><button type="button" className="recipe-ai-design" onClick={askMissionAiToDesign} title="Ask Mission AI to propose the workers, order and readiness gates for this recipe"><span aria-hidden="true">AI</span> Ask Mission AI</button></div>
          <label><span>Recipe name</span><input autoFocus maxLength="60" value={name} onChange={event => setName(event.target.value)} placeholder="Morning development stack" /></label>
          <div className="recipe-template-strip"><span>HOW SHOULD IT START?</span><div>{RECIPE_TEMPLATES.map(template => <button type="button" key={template.id} className={templateId === template.id ? "is-current" : ""} onClick={() => applyTemplate(template.id)}><strong>{template.label}</strong><small>{template.detail}</small></button>)}</div></div>
          <section className="recipe-simple-workers"><header><div><span>WORKERS IN THIS RECIPE</span><strong>Select terminals and arrange the launch order</strong></div><small>Running workers are reused by default</small></header><div>{sessions.map(session => { const selectedIndex = workerIds.indexOf(session.id); const step = steps.find(item => item.workerId === session.id); const dependencyNames = (step?.dependsOn || []).map(id => sessionById.get(id)?.name || id); return <article key={session.id} className={selectedIndex >= 0 ? "is-selected" : ""}><label><input type="checkbox" checked={selectedIndex >= 0} onChange={() => toggleWorker(session.id)}/><span><strong>{session.name}</strong><small>{session.command}</small></span></label>{selectedIndex >= 0 && <><span className="recipe-simple-order"><b>{selectedIndex + 1}</b><small>{dependencyNames.length ? `Starts after ${dependencyNames.join(", ")}` : "Starts first"}</small></span><div><button type="button" aria-label={`Move ${session.name} earlier`} disabled={selectedIndex === 0} onClick={() => moveWorker(selectedIndex, -1)}>↑</button><button type="button" aria-label={`Move ${session.name} later`} disabled={selectedIndex === workerIds.length - 1} onClick={() => moveWorker(selectedIndex, 1)}>↓</button></div></>}</article>; })}</div></section>
          <button type="button" className={`recipe-advanced-toggle ${advanced ? "is-open" : ""}`} onClick={() => setAdvanced(value => !value)}><span><strong>{advanced ? "Hide advanced controls" : "Advanced startup controls"}</strong><small>Readiness checks, dependencies, retries, failure and recovery</small></span><b>{advanced ? "−" : "+"}</b></button>
          {advanced && <><div className="recipe-policy-grid recipe-policy-grid-v2"><label><span>Parallel workers</span><RecipeSelect value={maxParallel} onChange={setMaxParallel} label="Maximum parallel workers" options={[1,2,3,4].map(value => ({ value, label: `${value} at once` }))}/></label><label><span>Readiness retries</span><RecipeSelect value={retryAttempts} onChange={setRetryAttempts} label="Readiness retries" options={[0,1,2,3].map(value => ({ value, label: value ? `${value} retr${value === 1 ? "y" : "ies"}` : "No retry" }))}/></label><label><span>Gate timeout</span><RecipeSelect value={readinessTimeoutMs} onChange={setReadinessTimeoutMs} label="Readiness timeout" options={[5000,10000,20000,30000].map(value => ({ value, label: `${value / 1000} seconds` }))}/></label><label><span>Running workers</span><RecipeSelect value={restartPolicy} onChange={setRestartPolicy} label="Running worker policy" options={[{value:"reuse-running",label:"Reuse current process"},{value:"restart-running",label:"Restart on launch"}]}/></label><label><span>On failure</span><RecipeSelect value={failurePolicy} onChange={setFailurePolicy} label="Failure policy" options={[{value:"stop",label:"Stop scheduling"},{value:"continue",label:"Continue independent branches"}]}/></label><label><span>Recovery</span><RecipeSelect value={recoveryPolicy} onChange={setRecoveryPolicy} label="Recovery policy" options={[{value:"keep-running",label:"Keep started workers"},{value:"rollback-started",label:"Stop recipe-started workers"}]}/></label></div>
          <div className="recipe-worker-list recipe-dag-editor" aria-label="Worker startup order and parallel dependency graph editor">
            {sessions.map(session => { const selectedIndex = workerIds.indexOf(session.id); const step = steps.find(item => item.workerId === session.id); return <div key={session.id} className={selectedIndex >= 0 ? "is-selected" : ""}><label><input type="checkbox" checked={selectedIndex >= 0} onChange={() => toggleWorker(session.id)}/><span><strong>{session.name}</strong><small>{session.command}</small></span></label>{selectedIndex >= 0 && <><div className="recipe-step-order"><b>{selectedIndex + 1}</b><button type="button" aria-label={`Move ${session.name} earlier`} disabled={selectedIndex === 0} onClick={() => moveWorker(selectedIndex, -1)}>↑</button><button type="button" aria-label={`Move ${session.name} later`} disabled={selectedIndex === workerIds.length - 1} onClick={() => moveWorker(selectedIndex, 1)}>↓</button></div><div className="recipe-step-policy"><RecipeSelect value={step.readiness} onChange={value => changeGate(session.id, value)} label={`${session.name} readiness gate`} options={GATES}/><DependencyPicker step={step} steps={steps} sessionsById={sessionById} onChange={dependencyId => changeDependency(session.id, dependencyId)}/></div></>}</div>; })}
          </div></>}
          <div className="recipe-dag-summary"><span><b>{steps.filter(step => !step.dependsOn.length).length}</b> parallel roots</span><span><b>{steps.reduce((total, step) => total + step.dependsOn.length, 0)}</b> dependency edges</span><span><b>{maxParallel}</b> worker limit</span><span><b>{retryAttempts}</b> retries</span></div>
          {error && <p className="recipe-error" role="alert">{error}</p>}<button className="recipe-save btn-primary feat-recipe" disabled={!name.trim() || !workerIds.length}>Save Daily Workspace</button>
        </form>
        <div className="recipe-launch-grid">
          <div className="recipe-library__head" style={{gridColumn: "1 / -1", display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: "600", letterSpacing: "0.5px", color: "var(--text-muted-semantic)", marginBottom: "16px"}}><span>SAVED DAILY WORKSPACES</span><small>{recipes.length}/20 in this project</small></div>
          {recipes.length ? recipes.map(recipe => { const available = recipe.workerIds.filter(id => sessionById.has(id)); const layout = TERMINAL_LAYOUTS.find(item => item.id === recipe.layoutId); const active = ["running","paused","cancelling"].includes(recipe.run?.phase); return <article key={recipe.id} className={`recipe-launch-card pm-card pm-card--interactive pm-card--feat-recipe phase-${recipe.run?.phase || "idle"}`}><div><header><strong>{recipe.name}</strong>{recipe.run?.phase && <span>{recipe.run.phase}</span>}</header><div className="recipe-chain" aria-label={`${recipe.name} dependency graph`}>{(recipe.steps || []).map((step, index) => { const phase = recipe.run?.stepStates?.[step.workerId]?.phase; return <React.Fragment key={step.workerId}>{index > 0 && <span className="recipe-chain__arrow">→</span>}<span className={`recipe-chain__node is-${runTone(phase)}`}><b>{sessionById.get(step.workerId)?.name || step.workerId}</b><small>{step.dependsOn.length ? `after ${step.dependsOn.length}` : "root"}</small></span></React.Fragment>; })}</div><small className="recipe-launch-meta">{layout?.label || "Custom"} · max {recipe.maxParallel || 1} parallel</small>{recipe.run?.rollback && <p className="recipe-rollback-status">Recovery {recipe.run.rollback.phase} · {recipe.run.rollback.stoppedCount} stop requests</p>}</div><footer className="recipe-launch-actions">{active && <button className="recipe-pause btn-secondary" disabled={recipe.run.phase === "cancelling"} onClick={() => runAction(recipe.run.phase === "paused" ? "recipe.resume" : "recipe.pause", recipe.id)}>{recipe.run.phase === "paused" ? "Resume" : recipe.run.phase === "cancelling" ? "Cancelling…" : "Pause"}</button>}{active && recipe.run.phase !== "cancelling" && <button className="recipe-cancel btn-secondary" onClick={() => runAction("recipe.cancel", recipe.id)}>Cancel run</button>}<button className="recipe-delete btn-danger" disabled={active} onClick={() => runAction("recipe.delete", recipe.id)}>Delete</button><button className="recipe-launch-btn btn-primary feat-recipe" disabled={!available.length || active} onClick={() => onLaunch(recipe, { recover: recipe.run?.phase === "failed" })}>{recipe.run?.phase === "paused" ? "Paused" : recipe.run?.phase === "running" ? "Running" : recipe.run?.phase === "failed" ? "Recover failed run" : "Launch recipe"}</button></footer></article>; }) : <div className="recipe-empty empty-state pm-card"><strong>No shared recipes yet</strong><p>Choose a template, edit the dependency graph, and save it into the project workspace.</p></div>}
        </div>
      </div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
