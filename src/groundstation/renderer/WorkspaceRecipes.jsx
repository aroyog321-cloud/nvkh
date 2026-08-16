import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Select from "@radix-ui/react-select";
import { missionApi } from "./missionApi.js";
import { TERMINAL_LAYOUTS } from "./useTerminalLayout.js";

function RecipeSelect({ value, onChange, options }) {
  return <Select.Root value={value} onValueChange={onChange}><Select.Trigger className="recipe-select" aria-label="Recipe policy"><Select.Value/><Select.Icon>⌄</Select.Icon></Select.Trigger><Select.Portal><Select.Content className="recipe-select-content" position="popper" sideOffset={6}><Select.Viewport>{options.map(option => <Select.Item className="recipe-select-item" value={option.value} key={option.value}><Select.ItemText>{option.label}</Select.ItemText><Select.ItemIndicator>✓</Select.ItemIndicator></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root>;
}

export default function WorkspaceRecipes({ open, projectKey, sessions, layoutId, sessionIds, onClose, onLaunch }) {
  const [recipes, setRecipes] = React.useState([]);
  const [name, setName] = React.useState("");
  const [workerIds, setWorkerIds] = React.useState([]);
  const [readiness, setReadiness] = React.useState("running");
  const [failurePolicy, setFailurePolicy] = React.useState("stop");
  const [error, setError] = React.useState("");
  const refresh = React.useCallback(() => missionApi().request("recipe.list").then(value => { setRecipes(Array.isArray(value) ? value : []); setError(""); }).catch(value => setError(value.message || String(value))), []);

  React.useEffect(() => { setWorkerIds(sessions.map(session => session.id)); }, [projectKey, sessions]);
  React.useEffect(() => { if (open) void refresh(); }, [open, projectKey, refresh]);

  const toggleWorker = id => setWorkerIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const moveWorker = (index, direction) => setWorkerIds(current => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= current.length) return current;
    const next = [...current];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    return next;
  });
  const save = async event => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !workerIds.length) return;
    const recipe = {
      id: globalThis.crypto?.randomUUID?.() || `recipe-${Date.now()}`,
      name: trimmed.slice(0, 60),
      workerIds,
      steps: workerIds.map((workerId, index) => ({ workerId, dependsOn: index ? [workerIds[index - 1]] : [], readiness })),
      layoutId,
      sessionIds,
      failurePolicy,
      readinessTimeoutMs: 10000
    };
    try { await missionApi().request("recipe.save", { recipe }); setName(""); await refresh(); }
    catch (value) { setError(value.message || String(value)); }
  };

  const sessionById = new Map(sessions.map(session => [session.id, session]));
  return <Dialog.Root open={open} onOpenChange={value => !value && onClose()}><Dialog.Portal><Dialog.Overlay className="recipes-backdrop"/><Dialog.Content className="recipes-dialog" aria-describedby="recipes-description">
      <header><div><span className="section-kicker">WORKSPACE RECIPES</span><Dialog.Title id="recipes-title">Launch your working set</Dialog.Title><Dialog.Description id="recipes-description">Project-shared startup graphs with engine-owned readiness and failure policy.</Dialog.Description></div><Dialog.Close asChild><button aria-label="Close workspace recipes">×</button></Dialog.Close></header>
      <div className="recipes-content">
        <form className="recipe-builder" onSubmit={save}>
          <div className="recipe-builder__intro"><span>NEW SHARED RECIPE</span><strong>Capture this workspace</strong><small>{TERMINAL_LAYOUTS.find(item => item.id === layoutId)?.label || layoutId} layout · {workerIds.length} selected</small></div>
          <label><span>Recipe name</span><input autoFocus maxLength="60" value={name} onChange={event => setName(event.target.value)} placeholder="Morning development stack" /></label>
          <div className="recipe-policy-grid"><label><span>Readiness gate</span><RecipeSelect value={readiness} onChange={setReadiness} options={[{value:"running",label:"Process running"},{value:"service",label:"Service ready"},{value:"tests",label:"Tests passing"},{value:"healthy",label:"Healthy signal"}]}/></label><label><span>On failure</span><RecipeSelect value={failurePolicy} onChange={setFailurePolicy} options={[{value:"stop",label:"Stop recipe"},{value:"continue",label:"Continue remaining"}]}/></label></div>
          <div className="recipe-worker-list" aria-label="Worker startup order">
            {sessions.map(session => { const selectedIndex = workerIds.indexOf(session.id); return <div key={session.id} className={selectedIndex >= 0 ? "is-selected" : ""}><label><input type="checkbox" checked={selectedIndex >= 0} onChange={() => toggleWorker(session.id)}/><span><strong>{session.name}</strong><small>{session.command}</small></span></label>{selectedIndex >= 0 && <div><b>{selectedIndex + 1}</b><button type="button" aria-label={`Move ${session.name} earlier`} disabled={selectedIndex === 0} onClick={() => moveWorker(selectedIndex, -1)}>↑</button><button type="button" aria-label={`Move ${session.name} later`} disabled={selectedIndex === workerIds.length - 1} onClick={() => moveWorker(selectedIndex, 1)}>↓</button></div>}</div>; })}
          </div>
          {error && <p className="recipe-error" role="alert">{error}</p>}<button className="recipe-save" disabled={!name.trim() || !workerIds.length}>Save to project</button>
        </form>
        <div className="recipe-library">
          <div className="recipe-library__head"><span>SHARED PROJECT RECIPES</span><small>{recipes.length}/20 in workspace configuration</small></div>
          {recipes.length ? recipes.map(recipe => { const available = recipe.workerIds.filter(id => sessionById.has(id)); const layout = TERMINAL_LAYOUTS.find(item => item.id === recipe.layoutId); const active = ["running","paused"].includes(recipe.run?.phase); return <article key={recipe.id}><div><strong>{recipe.name}</strong><div className="recipe-dependency-map" aria-label={`${recipe.name} dependency graph`}>{(recipe.steps || []).map((step, index) => <React.Fragment key={step.workerId}>{index > 0 && <i>→</i>}<span className={recipe.run?.completed?.includes(step.workerId) ? "is-ready" : recipe.run?.currentWorkerId === step.workerId ? "is-active" : ""}><b>{sessionById.get(step.workerId)?.name || step.workerId}</b><small>{step.readiness}</small></span></React.Fragment>)}</div><small>{layout?.label || "Custom"} · {recipe.failurePolicy} on failure · engine dependency gates</small></div><footer>{active && <button className="recipe-pause" onClick={async () => { await missionApi().request(recipe.run.phase === "paused" ? "recipe.resume" : "recipe.pause", { recipeId: recipe.id }); await refresh(); }}>{recipe.run.phase === "paused" ? "Resume" : "Pause"}</button>}<button className="recipe-delete" onClick={async () => { await missionApi().request("recipe.delete", { recipeId: recipe.id }); await refresh(); }}>Delete</button><button className="recipe-launch" disabled={!available.length || active} onClick={() => onLaunch(recipe)}>{recipe.run?.phase === "paused" ? "Paused" : recipe.run?.phase === "running" ? "Running" : "Launch recipe"}</button></footer></article>; }) : <div className="recipe-empty"><strong>No shared recipes yet</strong><p>Name this setup, choose startup order, and save it into the project workspace.</p></div>}
        </div>
      </div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
