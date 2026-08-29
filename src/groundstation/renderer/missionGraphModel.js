const MAX_GRAPH_WORKERS = 50;

export function workerTone(session) {
  if (!session) return "missing";
  if (session.status === "failed") return "failed";
  if (session.attentionRequired) return "attention";
  if (session.isAlive) return "running";
  return "idle";
}

export function readinessLabel(value) {
  return ({ running: "Process running", service: "Service ready", tests: "Tests passing", healthy: "Healthy signal" })[value] || "Process running";
}

export function buildMissionGraph(recipe, sessions = []) {
  const safeSessions = Array.isArray(sessions) ? sessions.slice(0, MAX_GRAPH_WORKERS) : [];
  const sessionById = new Map(safeSessions.map(session => [session.id, session]));
  const suppliedSteps = Array.isArray(recipe?.steps) ? recipe.steps.slice(0, MAX_GRAPH_WORKERS) : [];
  const steps = suppliedSteps.map(step => ({
    workerId: String(step?.workerId || ""),
    dependsOn: Array.isArray(step?.dependsOn) ? [...new Set(step.dependsOn.map(String))].slice(0, MAX_GRAPH_WORKERS) : [],
    readiness: String(step?.readiness || "running")
  })).filter(step => step.workerId);
  const stepById = new Map(steps.map(step => [step.workerId, step]));
  const levels = new Map();
  const cyclic = new Set();

  const resolveLevel = (workerId, lineage = []) => {
    if (levels.has(workerId)) return levels.get(workerId);
    if (lineage.includes(workerId)) {
      for (const id of lineage.slice(lineage.indexOf(workerId))) cyclic.add(id);
      cyclic.add(workerId);
      return 0;
    }
    const step = stepById.get(workerId);
    if (!step) return 0;
    const dependencies = step.dependsOn.filter(id => stepById.has(id));
    const level = dependencies.length
      ? Math.min(MAX_GRAPH_WORKERS - 1, 1 + Math.max(...dependencies.map(id => resolveLevel(id, [...lineage, workerId]))))
      : 0;
    levels.set(workerId, level);
    return level;
  };

  for (const step of steps) resolveLevel(step.workerId);
  const columns = [];
  for (const step of steps) {
    const level = cyclic.has(step.workerId) ? 0 : (levels.get(step.workerId) || 0);
    if (!columns[level]) columns[level] = [];
    const session = sessionById.get(step.workerId) || null;
    columns[level].push({
      workerId: step.workerId,
      session,
      readiness: step.readiness,
      dependsOn: step.dependsOn,
      downstream: steps.filter(candidate => candidate.dependsOn.includes(step.workerId)).map(candidate => candidate.workerId),
      tone: workerTone(session),
      cyclic: cyclic.has(step.workerId)
    });
  }

  const linkedIds = new Set(steps.map(step => step.workerId));
  const unlinked = safeSessions.filter(session => !linkedIds.has(session.id));
  const edgeCount = steps.reduce((count, step) => count + step.dependsOn.filter(id => stepById.has(id)).length, 0);
  const blockedCount = steps.filter(step => {
    const session = sessionById.get(step.workerId);
    return !session || session.status === "failed" || session.attentionRequired;
  }).length;

  return {
    columns: columns.filter(Boolean),
    unlinked,
    edgeCount,
    blockedCount,
    cyclicIds: [...cyclic],
    workerCount: steps.length
  };
}

