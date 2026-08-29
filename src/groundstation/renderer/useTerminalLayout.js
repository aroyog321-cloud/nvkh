import React from "react";

export const TERMINAL_LAYOUTS = Object.freeze([
  { id: "single", label: "Focus", glyph: "1", slots: 1, className: "layout-single", cols: 1, rows: 1 },
  { id: "horizontal", label: "Columns", glyph: "1×2", slots: 2, className: "layout-horizontal", cols: 2, rows: 1 },
  { id: "vertical", label: "Rows", glyph: "2×1", slots: 2, className: "layout-vertical", cols: 1, rows: 2 },
  { id: "grid-2x2", label: "Grid 4", glyph: "2×2", slots: 4, className: "layout-grid-2x2", cols: 2, rows: 2 },
  { id: "grid-3x2", label: "Grid 6", glyph: "3×2", slots: 6, className: "layout-grid-3x2", cols: 3, rows: 2 }
]);

const DEFAULT_LAYOUT_ID = "grid-2x2";
const STORAGE_PREFIX = "mission-control:terminal-layout:v1:";

// A pane split may never fall below this fraction of its axis. It guarantees
// that dragging a handle to the edge still leaves a usable terminal on both
// sides; the CSS grid enforces an absolute pixel minimum on top of this.
export const MIN_SPLIT = 25;
export const MAX_SPLIT = 75;

// Every axis a layout can resize. `col` is the first vertical split (columns),
// `row` the first horizontal split (rows). The 3×2 grid resizes its first
// column and its row midline; the remaining columns share what is left.
const RATIO_KEYS = Object.freeze(["col", "row"]);
const DEFAULT_RATIOS = Object.freeze({ col: 50, row: 50 });
export const DEFAULT_RATIOS_BY_LAYOUT = Object.freeze({
  single: Object.freeze({ col: 50, row: 50 }),
  horizontal: Object.freeze({ col: 50, row: 50 }),
  vertical: Object.freeze({ col: 50, row: 50 }),
  "grid-2x2": Object.freeze({ col: 50, row: 50 }),
  // A three-column canvas must begin with three balanced panes. The previous
  // 50/25/25 split made the first pane dominate and could force the last pane
  // beyond the visible canvas once minimum widths were applied.
  "grid-3x2": Object.freeze({ col: 34, row: 50 })
});

export function clampSplit(value, fallback = 50) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, Math.round(number)));
}

function layoutById(id) {
  return TERMINAL_LAYOUTS.find(layout => layout.id === id) || TERMINAL_LAYOUTS.find(layout => layout.id === DEFAULT_LAYOUT_ID);
}

// Which resize handles a layout exposes, in DOM order. `axis` selects the
// pointer coordinate to track; `ratio` selects the persisted key it drives.
export function layoutHandles(layoutId) {
  switch (layoutId) {
    case "horizontal": return [{ id: "col", axis: "x", ratio: "col" }];
    case "vertical": return [{ id: "row", axis: "y", ratio: "row" }];
    case "grid-2x2": return [
      { id: "col", axis: "x", ratio: "col" },
      { id: "row", axis: "y", ratio: "row" }
    ];
    case "grid-3x2": return [
      { id: "col", axis: "x", ratio: "col" },
      { id: "row", axis: "y", ratio: "row" }
    ];
    default: return [];
  }
}

function normalizeRatios(value, layoutId = DEFAULT_LAYOUT_ID) {
  const source = value && typeof value === "object" ? value : {};
  const defaults = DEFAULT_RATIOS_BY_LAYOUT[layoutId] || DEFAULT_RATIOS;
  const ratios = {};
  for (const key of RATIO_KEYS) {
    const normalized = clampSplit(source[key], defaults[key]);
    // In 3×2, leave at least 28% for each of the two columns sharing the
    // remaining width. Other layouts retain the broader 25–75% range.
    ratios[key] = layoutId === "grid-3x2" && key === "col"
      ? Math.min(44, Math.max(28, normalized))
      : normalized;
  }
  return ratios;
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

  // Accept both the historical single `paneRatio` and the per-axis `ratios`
  // object so older persisted layouts keep working after an upgrade.
  const storedByLayout = value?.ratiosByLayout && typeof value.ratiosByLayout === "object" ? value.ratiosByLayout : {};
  const historicalRatios = {
    ...value?.ratios,
    col: value?.ratios?.col ?? value?.paneRatio,
    row: value?.ratios?.row ?? value?.paneRatioRow
  };
  const ratiosByLayout = Object.fromEntries(TERMINAL_LAYOUTS.map(option => [
    option.id,
    normalizeRatios(storedByLayout[option.id] || (value?.layoutId === option.id ? historicalRatios : null), option.id)
  ]));
  const ratios = ratiosByLayout[layout.id];
  return { layoutId: layout.id, sessionIds: selected, ratios, ratiosByLayout, paneRatio: ratios.col };
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

export function setLayoutRatio(value, key, ratio, sessions) {
  const normalized = normalizeTerminalLayout(value, sessions);
  if (!RATIO_KEYS.includes(key)) return normalized;
  const ratios = normalizeRatios({ ...normalized.ratios, [key]: ratio }, normalized.layoutId);
  const ratiosByLayout = { ...normalized.ratiosByLayout, [normalized.layoutId]: ratios };
  return { ...normalized, ratios, ratiosByLayout, paneRatio: ratios.col };
}

// CSS custom properties consumed by the terminal grid. Kept here so the grid
// template and the handle offsets always agree on the same numbers.
export function layoutStyle(preference) {
  const ratios = preference?.ratios || DEFAULT_RATIOS_BY_LAYOUT[preference?.layoutId] || DEFAULT_RATIOS;
  return {
    "--pane-primary": `${ratios.col}%`,
    "--col-ratio": `${ratios.col}%`,
    "--row-ratio": `${ratios.row}%`
  };
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

  const applyLayout = React.useCallback(value => {
    setPreference(current => normalizeTerminalLayout({ ...current, ...value }, sessions));
  }, [sessions]);

  const setRatio = React.useCallback((key, ratio) => {
    setPreference(current => setLayoutRatio(current, key, ratio, sessions));
  }, [sessions]);

  // Back-compatible single-ratio setter kept for existing call sites.
  const setPaneRatio = React.useCallback(paneRatio => {
    setPreference(current => setLayoutRatio(current, "col", paneRatio, sessions));
  }, [sessions]);

  return {
    layout: layoutById(preference.layoutId),
    sessionIds: preference.sessionIds,
    ratios: preference.ratios,
    paneRatio: preference.ratios.col,
    style: layoutStyle(preference),
    handles: layoutHandles(preference.layoutId),
    setLayoutId,
    setSlotSession,
    setRatio,
    setPaneRatio,
    applyLayout
  };
}
