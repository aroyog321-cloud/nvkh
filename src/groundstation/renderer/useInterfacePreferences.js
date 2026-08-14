import React from "react";

const STORAGE_KEY = "mission-control:interface-preferences:v1";
export const DEFAULT_INTERFACE_PREFERENCES = Object.freeze({
  typeScale: "comfortable",
  density: "comfortable",
  motion: "full",
  terminalFontSize: 13,
  showCommandHints: true
});

function normalize(value) {
  return {
    typeScale: ["compact", "comfortable", "large"].includes(value?.typeScale) ? value.typeScale : DEFAULT_INTERFACE_PREFERENCES.typeScale,
    density: ["compact", "comfortable"].includes(value?.density) ? value.density : DEFAULT_INTERFACE_PREFERENCES.density,
    motion: ["full", "reduced"].includes(value?.motion) ? value.motion : DEFAULT_INTERFACE_PREFERENCES.motion,
    terminalFontSize: Number.isInteger(value?.terminalFontSize) && value.terminalFontSize >= 11 && value.terminalFontSize <= 18 ? value.terminalFontSize : DEFAULT_INTERFACE_PREFERENCES.terminalFontSize,
    showCommandHints: typeof value?.showCommandHints === "boolean" ? value.showCommandHints : DEFAULT_INTERFACE_PREFERENCES.showCommandHints
  };
}

export default function useInterfacePreferences() {
  const [preferences, setPreferences] = React.useState(() => {
    try { return normalize(JSON.parse(window.localStorage.getItem(STORAGE_KEY))); } catch { return { ...DEFAULT_INTERFACE_PREFERENCES }; }
  });

  React.useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch { /* Interface preferences are optional. */ }
  }, [preferences]);

  const update = React.useCallback((field, value) => setPreferences(current => normalize({ ...current, [field]: value })), []);
  const reset = React.useCallback(() => setPreferences({ ...DEFAULT_INTERFACE_PREFERENCES }), []);
  return { preferences, update, reset };
}
