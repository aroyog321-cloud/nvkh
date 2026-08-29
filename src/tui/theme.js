// Lifecycle facts come from the Engine; color and glyph choices remain a
// client concern so a future GUI can present the same state differently.

const colors = {
  idle: "blue",
  starting: "yellow",
  running: "green",
  exited: "gray",
  failed: "red",
  nominal: "green",
  dim: "gray",
};

const glyphs = {
  idle: "◇",
  starting: "◌",
  running: "●",
  exited: "○",
  failed: "✕",
};

export { colors, glyphs };
