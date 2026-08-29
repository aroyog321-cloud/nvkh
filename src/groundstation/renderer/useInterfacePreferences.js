import React from "react";

const STORAGE_KEY = "mission-control:interface-preferences:v1";
export const DEFAULT_INTERFACE_PREFERENCES = Object.freeze({
  theme: "orbital",
  typeScale: "comfortable",
  density: "comfortable",
  motion: "full",
  terminalFontSize: 13,
  terminalTheme: "orbital",
  terminalCursor: "bar",
  terminalScrollback: 5000,
  showCommandHints: true
});

function normalize(value) {
  return {
    theme: ["orbital", "solar", "contrast"].includes(value?.theme) ? value.theme : DEFAULT_INTERFACE_PREFERENCES.theme,
    typeScale: ["compact", "comfortable", "large"].includes(value?.typeScale) ? value.typeScale : DEFAULT_INTERFACE_PREFERENCES.typeScale,
    density: ["compact", "comfortable", "spacious"].includes(value?.density) ? value.density : DEFAULT_INTERFACE_PREFERENCES.density,
    motion: ["full", "reduced"].includes(value?.motion) ? value.motion : DEFAULT_INTERFACE_PREFERENCES.motion,
    terminalFontSize: Number.isInteger(value?.terminalFontSize) && value.terminalFontSize >= 11 && value.terminalFontSize <= 18 ? value.terminalFontSize : DEFAULT_INTERFACE_PREFERENCES.terminalFontSize,
    terminalTheme: ["orbital", "solar", "contrast"].includes(value?.terminalTheme) ? value.terminalTheme : DEFAULT_INTERFACE_PREFERENCES.terminalTheme,
    terminalCursor: ["bar", "block", "underline"].includes(value?.terminalCursor) ? value.terminalCursor : DEFAULT_INTERFACE_PREFERENCES.terminalCursor,
    terminalScrollback: [1000, 5000, 20000].includes(value?.terminalScrollback) ? value.terminalScrollback : DEFAULT_INTERFACE_PREFERENCES.terminalScrollback,
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
