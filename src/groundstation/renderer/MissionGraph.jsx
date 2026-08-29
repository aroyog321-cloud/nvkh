import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { engineEventFrom, missionApi } from "./missionApi.js";
import { buildMissionGraph, readinessLabel } from "./missionGraphModel.js";

function statusLabel(session) {
  if (!session) return "Missing worker";
  if (session.status === "failed") return "Failed";
  if (session.attentionRequired) return "Needs you";
  if (session.isAlive) return "Running";
  return session.status === "exited" ? "Exited" : "Idle";
}

function GraphNode({ node, selected, sessionById, onSelect }) {
  const dependencyNames = node.dependsOn.map(id => sessionById.get(id)?.name || id);
  return <button type="button" className={`mission-node tone-${node.tone} ${selected ? "is-selected" : ""}`} onClick={() => onSelect(node.workerId)} aria-pressed={selected}>
    <span className="mission-node__status"><i/></span>
    <span className="mission-node__copy"><small>{readinessLabel(node.readiness)}</small><strong>{node.session?.name || node.workerId}</strong><code>{node.session?.command || "Worker definition unavailable"}</code>{dependencyNames.length > 0 && <em>After {dependencyNames.join(", ")}</em>}</span>
    <span className="mission-node__state">{statusLabel(node.session)}</span>
  </button>;
}

export default function MissionGraph({ open, sessions, onClose, onOpenTerminal, onOpenRecipes }) {
  const [recipes, setRecipes] = React.useState([]);
  const [selectedRecipeId, setSelectedRecipeId] = React.useState("");
  const [selectedWorkerId, setSelectedWorkerId] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const value = await missionApi().request("recipe.list");
      const next = Array.isArray(value) ? value.slice(0, 20) : [];
      setRecipes(next);
      setSelectedRecipeId(current => next.some(recipe => recipe.id === current) ? current : next[0]?.id || "");
      setError("");
    } catch (value) {
      setError(value.message || String(value));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!open) return undefined;
    void refresh();
    let unsubscribe = () => {};
    try {
      unsubscribe = missionApi().subscribe(notification => {
        const event = engineEventFrom(notification);
        if (event && String(event.type || "").startsWith("recipe:")) void refresh();
      });
    } catch {
      // The initial request already exposes an actionable error if the bridge is unavailable.
    }
    return () => unsubscribe?.();
  }, [open, refresh]);

  const selectedRecipe = recipes.find(recipe => recipe.id === selectedRecipeId) || recipes[0] || null;
  const graph = React.useMemo(() => buildMissionGraph(selectedRecipe, sessions), [selectedRecipe, sessions]);
  const sessionById = React.useMemo(() => new Map(sessions.map(session => [session.id, session])), [sessions]);
  const selectedNode = graph.columns.flat().find(node => node.workerId === selectedWorkerId) || graph.columns.flat()[0] || null;

  React.useEffect(() => {
    if (selectedNode && selectedWorkerId !== selectedNode.workerId) setSelectedWorkerId(selectedNode.workerId);
    if (!selectedNode && selectedWorkerId) setSelectedWorkerId("");
  }, [selectedNode, selectedWorkerId]);

  const run = selectedRecipe?.run;
  const runLabel = run?.phase ? `${run.phase}${run.currentWorkerId ? ` · ${sessionById.get(run.currentWorkerId)?.name || run.currentWorkerId}` : ""}` : "Not running";

  return <Dialog.Root open={open} onOpenChange={value => !value && onClose()}><Dialog.Portal><Dialog.Overlay className="mission-graph-backdrop"/><Dialog.Content className="mission-graph-dialog" aria-describedby="mission-graph-description">
    <header className="mission-graph-header"><div><span className="section-kicker">MISSION GRAPH</span><Dialog.Title>How this workspace starts and depends</Dialog.Title><Dialog.Description id="mission-graph-description">Configured relationships only. Mission Control does not infer dependencies from worker names or terminal output.</Dialog.Description></div><div><button type="button" onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button><Dialog.Close asChild><button type="button" aria-label="Close Mission Graph">×</button></Dialog.Close></div></header>
    {recipes.length > 0 && <nav className="mission-graph-recipes" aria-label="Workspace dependency recipes">{recipes.map(recipe => <button type="button" key={recipe.id} className={recipe.id === selectedRecipe?.id ? "is-current" : ""} aria-current={recipe.id === selectedRecipe?.id ? "true" : undefined} onClick={() => { setSelectedRecipeId(recipe.id); setSelectedWorkerId(""); }}><strong>{recipe.name}</strong><small>{recipe.steps?.length || 0} workers</small></button>)}</nav>}
    {error && <div className="mission-graph-error" role="alert">{error}</div>}
    {!loading && !error && !selectedRecipe ? <section className="mission-graph-empty"><span>↳</span><h2>No configured dependency graph</h2><p>Mission Graph only displays relationships saved in Workspace Recipes. Your {sessions.length} worker{sessions.length === 1 ? " is" : "s are"} currently remain independent.</p><button type="button" onClick={onOpenRecipes}>Configure a workspace recipe</button></section> : selectedRecipe && <>
      <section className="mission-graph-summary" aria-label="Mission Graph summary"><div><small>RECIPE</small><strong>{selectedRecipe.name}</strong></div><div><small>WORKERS</small><strong>{graph.workerCount}</strong></div><div><small>DEPENDENCIES</small><strong>{graph.edgeCount}</strong></div><div className={graph.blockedCount ? "has-risk" : ""}><small>NEEDS REVIEW</small><strong>{graph.blockedCount}</strong></div><div><small>RUN STATE</small><strong>{runLabel}</strong></div></section>
      <div className="mission-graph-layout">
        <section className="mission-graph-canvas" aria-label={`${selectedRecipe.name} dependency flow`}>
          {graph.cyclicIds.length > 0 && <div className="mission-graph-warning" role="alert">This recipe contains a dependency cycle involving {graph.cyclicIds.join(", ")}. Review the recipe before launching it.</div>}
          <div className="mission-graph-flow">{graph.columns.map((column, columnIndex) => <section className="mission-graph-layer" key={`layer-${columnIndex}`}><header><span>{columnIndex === 0 ? "START" : `STAGE ${columnIndex + 1}`}</span><small>{column.length} worker{column.length === 1 ? "" : "s"}</small></header><div>{column.map(node => <GraphNode key={node.workerId} node={node} selected={selectedNode?.workerId === node.workerId} sessionById={sessionById} onSelect={setSelectedWorkerId}/>)}</div>{columnIndex < graph.columns.length - 1 && <span className="mission-graph-connector" aria-hidden="true">→</span>}</section>)}</div>
          {graph.unlinked.length > 0 && <div className="mission-graph-unlinked"><header><span>OUTSIDE THIS RECIPE</span><small>{graph.unlinked.length} independent worker{graph.unlinked.length === 1 ? "" : "s"}</small></header><div>{graph.unlinked.map(session => <button type="button" key={session.id} onClick={() => onOpenTerminal(session.id)}><i className={`tone-${session.status === "failed" ? "failed" : session.attentionRequired ? "attention" : session.isAlive ? "running" : "idle"}`}/><span><strong>{session.name}</strong><small>{session.command}</small></span></button>)}</div></div>}
        </section>
        <aside className="mission-graph-inspector">{selectedNode ? <><div className="mission-graph-inspector__head"><span className="section-kicker">SELECTED WORKER</span><i className={`tone-${selectedNode.tone}`}/></div><h2>{selectedNode.session?.name || selectedNode.workerId}</h2><p>{selectedNode.session ? `${statusLabel(selectedNode.session)} under EngineAPI supervision.` : "This configured worker is not present in the current engine state."}</p>{selectedNode.session?.health && <div className={`mission-graph-health tone-${selectedNode.session.health.tone}`}><i/><span><strong>{selectedNode.session.health.label}</strong><small>{selectedNode.session.health.summary}</small></span></div>}<dl><div><dt>Readiness gate</dt><dd>{readinessLabel(selectedNode.readiness)}</dd></div><div><dt>CPU / memory</dt><dd>{selectedNode.session?.resources?.available ? `${Number.isFinite(selectedNode.session.resources.cpuPercent) ? `${selectedNode.session.resources.cpuPercent}%` : "—"} · ${Number.isFinite(selectedNode.session.resources.memoryMB) ? `${selectedNode.session.resources.memoryMB} MB` : "—"}` : "Process sample pending"}</dd></div><div><dt>Depends on</dt><dd>{selectedNode.dependsOn.length ? selectedNode.dependsOn.map(id => sessionById.get(id)?.name || id).join(", ") : "Nothing — starts first"}</dd></div><div><dt>Unlocks</dt><dd>{selectedNode.downstream.length ? selectedNode.downstream.map(id => sessionById.get(id)?.name || id).join(", ") : "No downstream workers"}</dd></div><div><dt>Transitive impact</dt><dd>{selectedNode.session?.dependencyImpact?.downstreamCount ? `${selectedNode.session.dependencyImpact.downstreamCount} configured downstream worker${selectedNode.session.dependencyImpact.downstreamCount === 1 ? "" : "s"}` : "No configured downstream impact"}</dd></div><div><dt>Restore policy</dt><dd>{selectedNode.session?.autoStart ? "Automatic" : "Manual"}</dd></div></dl>{selectedNode.cyclic && <div className="mission-graph-cycle">Dependency cycle detected for this worker.</div>}<footer>{selectedNode.session && <button type="button" className="primary" onClick={() => onOpenTerminal(selectedNode.workerId)}>Open terminal</button>}<button type="button" onClick={onOpenRecipes}>Edit recipe</button></footer></> : <div className="mission-graph-inspector__empty">Select a worker to inspect its configured upstream and downstream relationships.</div>}</aside>
      </div>
    </>}
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
