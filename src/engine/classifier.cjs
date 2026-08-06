// Facts, not presentation: this module only ever returns one of
// "nominal" | "progress" | "claim" | null (no change) — never a color,
// never a glyph. Every client (this TUI, the future GUI) maps these to
// its own rendering.

const { stripAnsi } = require("./ansi.cjs");

const DEFAULT_RULES = {
  claim: [
    "Error:", "FAILED", "Traceback", "EADDRINUSE",
    "Cannot connect to the Docker daemon", "panic:", "fatal:",
  ],
  nominal: [
    "Ready in", "succeeded", "passed", "Compiled successfully", "listening on",
  ],
  progress: [
    "Compiling", "Installing", "Building", "Resolving", "Downloading",
  ],
};

function classify(chunk, rules = DEFAULT_RULES) {
  // Strip ANSI before keyword matching — otherwise a colored chunk like
  // `Erro\x1b[31mr:` fails to match "error:" because the escape splits
  // the keyword. This is a real bug: many tools (npm, jest, etc.) emit
  // colored output by default, and we'd silently miss those matches.
  const lower = stripAnsi(chunk).toLowerCase();
  // Test runners commonly print successful summaries such as "0 failed" or
  // "failed: 0". Remove only those zero-count phrases before matching the
  // generic FAILED rule so a healthy test run does not create false attention.
  const claimText = lower
    .replace(/\b0\s+failed\b/g, "")
    .replace(/\bfailed\s*:?\s*0\b/g, "");
  for (const p of rules.claim || []) if (claimText.includes(p.toLowerCase())) return "claim";
  for (const p of rules.nominal || []) if (lower.includes(p.toLowerCase())) return "nominal";
  for (const p of rules.progress || []) if (lower.includes(p.toLowerCase())) return "progress";
  return null;
}

module.exports = { classify, DEFAULT_RULES };
