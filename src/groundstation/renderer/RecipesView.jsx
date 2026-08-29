import React from "react";
import { missionApi } from "./missionApi.js";

function phaseLabel(recipe) {
  const phase = recipe?.run?.phase;
  if (!phase) return "Ready";
  if (phase === "failed") return "Needs recovery";
  if (phase === "paused") return "Paused";
  if (phase === "running") return "Running";
  return phase.replaceAll("-", " ");
}

export default function RecipesView({ sessions, onManage, onLaunch, onAskAI }) {
  const [recipes, setRecipes] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const refresh = React.useCallback(async () => {
    try {
      const value = await missionApi().request("recipe.list");
      setRecipes(Array.isArray(value) ? value : []);
      setError("");
    } catch (value) {
      setError(value.message || String(value));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let unsubscribe = () => {};
    void refresh();
    try {
      unsubscribe = missionApi().subscribe(notification => {
        if (String(notification?.type || "").startsWith("recipe:")) void refresh();
      });
    } catch { /* Explicit refresh remains available. */ }
    return () => unsubscribe?.();
  }, [refresh]);

  const sessionById = React.useMemo(() => new Map(sessions.map(session => [session.id, session])), [sessions]);
  const running = recipes.filter(recipe => ["running", "paused", "cancelling"].includes(recipe.run?.phase)).length;
  const failed = recipes.filter(recipe => recipe.run?.phase === "failed").length;

  return <div className="recipes-page">
    <header className="page-command-header pm-page-hero feat-recipe">
      <div><span className="page-eyebrow">PROJECT AUTOMATION</span><h1>Daily workspaces</h1><p>Start the right terminals in the right order, restore the layout, and keep every run evidence-backed.</p></div>
      <div className="page-command-actions"><button className="btn-secondary feat-ai" onClick={onAskAI}>Design with Mission AI</button><button className="btn-primary feat-recipe" onClick={onManage}>New recipe</button></div>
    </header>
    <section className="recipes-status-strip" aria-label="Recipe status">
      <div><span>SAVED</span><strong>{recipes.length}</strong><small>project recipes</small></div>
      <div><span>RUNNING</span><strong>{running}</strong><small>active launches</small></div>
      <div className={failed ? "has-risk" : ""}><span>RECOVERY</span><strong>{failed}</strong><small>{failed ? "runs need review" : "nothing blocked"}</small></div>
      <div><span>WORKERS</span><strong>{sessions.length}</strong><small>available to recipes</small></div>
    </section>
    <div className="recipes-page-layout">
      <section className="recipes-library">
        <header><div><span className="section-kicker">SAVED DAILY WORKSPACES</span><h2>Launch a project setup</h2></div><button onClick={refresh}>Refresh</button></header>
        {loading ? <div className="page-empty-state"><span className="empty-orbit"/><strong>Loading recipes</strong><p>Reading the project-owned recipe graph.</p></div> : error ? <div className="page-empty-state is-error"><strong>Recipes unavailable</strong><p>{error}</p><button onClick={refresh}>Try again</button></div> : recipes.length ? <div className="recipes-page-list">{recipes.map(recipe => {
          const steps = recipe.steps || [];
          const available = (recipe.workerIds || []).filter(id => sessionById.has(id)).length;
          const active = ["running", "paused", "cancelling"].includes(recipe.run?.phase);
          return <article key={recipe.id} className={`recipe-row pm-card pm-card--interactive phase-${recipe.run?.phase || "ready"}`}>
            <div className="recipe-row-main"><span className="recipe-status-dot"/><div><div className="recipe-row-title"><h3>{recipe.name}</h3><span>{phaseLabel(recipe)}</span></div><p>{available}/{recipe.workerIds?.length || 0} workers available · max {recipe.maxParallel || 1} parallel</p></div></div>
            <div className="recipe-flow" aria-label={`${recipe.name} startup order`}>{steps.slice(0,5).map((step, index) => <React.Fragment key={step.workerId}>{index > 0 && <i>→</i>}<span><b>{sessionById.get(step.workerId)?.name || step.workerId}</b><small>{step.dependsOn?.length ? `after ${step.dependsOn.length}` : "starts first"}</small></span></React.Fragment>)}{steps.length > 5 && <em>+{steps.length - 5}</em>}</div>
            <footer><button className="btn-ghost" onClick={onManage}>Edit graph</button><button className="btn-primary feat-recipe" disabled={!available || active} onClick={() => onLaunch(recipe, { recover: recipe.run?.phase === "failed" })}>{active ? phaseLabel(recipe) : recipe.run?.phase === "failed" ? "Recover run" : "Launch workspace"}</button></footer>
          </article>;
        })}</div> : <div className="page-empty-state recipes-first-run pm-card"><span className="empty-orbit">+</span><strong>Build your first daily workspace</strong><p>Choose backend, frontend, agents, tests, Git, databases, or containers and decide what must become ready first.</p><div><button className="btn-secondary feat-ai" onClick={onAskAI}>Ask Mission AI</button><button className="btn-primary feat-recipe" onClick={onManage}>Create recipe</button></div></div>}
      </section>
      <aside className="recipes-guide">
        <span className="section-kicker">HOW IT RUNS</span><h2>One click. Ordered startup.</h2>
        <ol><li><b>1</b><span><strong>Start roots</strong><small>Independent workers launch in parallel.</small></span></li><li><b>2</b><span><strong>Verify readiness</strong><small>Ports, tests, builds, databases, and health gates provide evidence.</small></span></li><li><b>3</b><span><strong>Unlock dependants</strong><small>Frontend waits for backend; tests wait for both.</small></span></li><li><b>4</b><span><strong>Restore the canvas</strong><small>The saved terminal layout opens without duplicate PTYs.</small></span></li></ol>
        <button onClick={onManage}>Open advanced builder</button>
      </aside>
    </div>
  </div>;
}
