import React from "react";
import { missionApi } from "./missionApi.js";
import { TERMINAL_LAYOUTS } from "./useTerminalLayout.js";

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
  React.useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = event => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

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

  if (!open) return null;
  const sessionById = new Map(sessions.map(session => [session.id, session]));
  return <div className="recipes-backdrop" onMouseDown={onClose}>
    <section className="recipes-dialog" role="dialog" aria-modal="true" aria-labelledby="recipes-title" onMouseDown={event => event.stopPropagation()}>
      <header><div><span className="section-kicker">WORKSPACE RECIPES</span><h2 id="recipes-title">Launch your working set</h2><p>Project-shared startup graphs with engine-owned readiness and failure policy.</p></div><button aria-label="Close workspace recipes" onClick={onClose}>×</button></header>
      <div className="recipes-content">
        <form className="recipe-builder" onSubmit={save}>
          <div className="recipe-builder__intro"><span>NEW SHARED RECIPE</span><strong>Capture this workspace</strong><small>{TERMINAL_LAYOUTS.find(item => item.id === layoutId)?.label || layoutId} layout · {workerIds.length} selected</small></div>
          <label><span>Recipe name</span><input autoFocus maxLength="60" value={name} onChange={event => setName(event.target.value)} placeholder="Morning development stack" /></label>
          <div className="recipe-policy-grid"><label><span>Readiness gate</span><select value={readiness} onChange={event => setReadiness(event.target.value)}><option value="running">Process running</option><option value="service">Service ready</option><option value="tests">Tests passing</option><option value="healthy">Healthy signal</option></select></label><label><span>On failure</span><select value={failurePolicy} onChange={event => setFailurePolicy(event.target.value)}><option value="stop">Stop recipe</option><option value="continue">Continue remaining</option></select></label></div>
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
    </section>
  </div>;
}
