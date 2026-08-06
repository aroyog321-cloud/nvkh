import React from "react";

export const TERMINAL_LAYOUTS = Object.freeze([
  { id: "single", label: "1", slots: 1, className: "layout-single" },
  { id: "horizontal", label: "1×2", slots: 2, className: "layout-horizontal" },
  { id: "vertical", label: "2×1", slots: 2, className: "layout-vertical" },
  { id: "grid-2x2", label: "2×2", slots: 4, className: "layout-grid-2x2" },
  { id: "grid-3x2", label: "3×2", slots: 6, className: "layout-grid-3x2" }
]);

const DEFAULT_LAYOUT_ID = "grid-2x2";
const STORAGE_PREFIX = "mission-control:terminal-layout:v1:";

function layoutById(id) {
  return TERMINAL_LAYOUTS.find(layout => layout.id === id) || TERMINAL_LAYOUTS.find(layout => layout.id === DEFAULT_LAYOUT_ID);
}

function sessionIds(sessions) {
  return new Set((sessions || []).map(session => session.id));
}

export function normalizeTerminalLayout(value, sessions) {
  const layout = layoutById(value?.layoutId);
  const validIds = sessionIds(sessions);
  const selected = [];
  const supplied = Array.isArray(value?.sessionIds) ? value.sessionIds : null;
  for (const id of supplied?.slice(0, layout.slots) || []) {
    selected.push(typeof id === "string" && validIds.has(id) && !selected.includes(id) ? id : null);
  }
  if (!supplied || selected.length < layout.slots) {
    for (const session of sessions || []) {
      if (selected.length === layout.slots) break;
      if (!selected.includes(session.id)) selected.push(session.id);
    }
  }
  while (selected.length < layout.slots) selected.push(null);
  return { layoutId: layout.id, sessionIds: selected };
}

export function assignTerminalSlot(value, index, sessionId, sessions) {
  const normalized = normalizeTerminalLayout(value, sessions);
  if (!Number.isInteger(index) || index < 0 || index >= normalized.sessionIds.length) return normalized;
  if (sessionId !== null && !sessionIds(sessions).has(sessionId)) return normalized;
  const next = [...normalized.sessionIds];
  const previous = next[index];
  const duplicateIndex = sessionId === null ? -1 : next.indexOf(sessionId);
  next[index] = sessionId;
  if (duplicateIndex !== -1 && duplicateIndex !== index) next[duplicateIndex] = previous || null;
  return { ...normalized, sessionIds: next };
}

function storageKey(workspace) {
  const identity = workspace?.path || null;
  return identity ? `${STORAGE_PREFIX}${identity}` : null;
}

export default function useTerminalLayout(workspace, sessions) {
  const key = storageKey(workspace);
  const [preference, setPreference] = React.useState(() => normalizeTerminalLayout(null, sessions));
  const [hydratedKey, setHydratedKey] = React.useState(null);

  React.useEffect(() => {
    let stored = null;
    if (key) {
      try {
        stored = JSON.parse(window.localStorage.getItem(key));
      } catch {
        stored = null;
      }
    }
    setPreference(normalizeTerminalLayout(stored, sessions));
    setHydratedKey(key);
  // Session changes are normalized by the separate effect below; this effect
  // runs only when the active workspace changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  React.useEffect(() => {
    setPreference(current => normalizeTerminalLayout(current, sessions));
  }, [sessions]);

  React.useEffect(() => {
    if (!key || hydratedKey !== key) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(preference));
    } catch {
      // Layout persistence is auxiliary and must never block terminal control.
    }
  }, [hydratedKey, key, preference]);

  const setLayoutId = React.useCallback(layoutId => {
    setPreference(current => normalizeTerminalLayout({ ...current, layoutId }, sessions));
  }, [sessions]);

  const setSlotSession = React.useCallback((index, sessionId) => {
    setPreference(current => assignTerminalSlot(current, index, sessionId || null, sessions));
  }, [sessions]);

  return {
    layout: layoutById(preference.layoutId),
    sessionIds: preference.sessionIds,
    setLayoutId,
    setSlotSession
  };
}
