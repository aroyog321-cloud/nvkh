// Facts, not presentation: this module only ever returns one of
// "nominal" | "progress" | "claim" | null (no change) — never a color,
// never a glyph. Every client (this TUI, the future GUI) maps these to
// its own rendering.

const { stripAnsi } = require("./ansi.cjs");

const DEFAULT_RULES = {
  claim: [
    "Error:", "FAILED", "Traceback", "EADDRINUSE",
    "Cannot connect to the Docker daemon", "panic:", "fatal:",
    "npm error", "npm ERR!", "[ERROR]", "error TS", "error[",
    "CommandNotFoundException", "FullyQualifiedErrorId",
    "Unhandled exception", "Unhandled rejection", "Exception:", "Exception in thread",
    "Command failed", "Permission denied", "Access is denied",
    "Cannot find module", "Module not found", "Error response from daemon", "ENOENT", "EACCES",
    // Signatures that were never a substring of any rule above, so real
    // failures matching only these silently never raised attention:
    // PowerShell's own "command not found" phrasing (this app's default
    // Windows shell), POSIX shells, Rust panics (which don't say "panic:"),
    // common Node/network error codes, native crashes, and MSVC/PHP-style
    // "fatal error" (distinct from git's "fatal:").
    "is not recognized as the name of a cmdlet", "command not found",
    "is not recognized as an internal or external command",
    "panicked at", "fatal error", "segmentation fault",
    "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT",
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
