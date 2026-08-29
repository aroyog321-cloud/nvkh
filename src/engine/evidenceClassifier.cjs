"use strict";

const MAX_BRANCH_LENGTH = 120;
const MAX_RECORDS = 20;
const cleanText = value => String(value || "").replace(/\u001b\[[0-?]*[ -\/]*[@-~]/g, "");
const finiteInteger = value => { const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : null; };
const bounded = (values, limit = MAX_RECORDS) => [...new Set(values.filter(Boolean))].slice(0, limit);
const safeToken = (value, length = 180) => { const result = String(value || "").trim().replace(/[\u0000-\u001f]/g, ""); return result && result.length <= length ? result : null; };
const safePath = value => { const path = safeToken(value, 260)?.replace(/^["']|["']$/g, ""); return path && !/[\r\n]/.test(path) && !/(?:token|secret|password|api[_-]?key)=/i.test(path) ? path : null; };
const safeBranch = value => { const branch = String(value || "").trim().replace(/\.\.\..*$/, ""); return branch && branch.length <= MAX_BRANCH_LENGTH && /^[A-Za-z0-9._\/-]+$/.test(branch) ? branch : null; };
const safeOrigin = value => { try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.origin : null; } catch { return null; } };

function classifyEvidence(value, timestamp = Date.now()) {
  const text = cleanText(value);
  const lines = text.split(/\r?\n/).slice(-250);
  const next = {};

  const totals = text.match(/(?:tests?\s*)?(\d+)\s+(?:passed|passing)(?:[^\n\r]*?(\d+)\s+(?:failed|failing))?/i);
  const suites = bounded(lines.map(line => line.match(/^\s*(?:PASS|✓|√)\s+([^\s].*?)(?:\s+\(|$)/i)?.[1]).map(value => safePath(value)));
  const failedTests = bounded(lines.map(line => line.match(/^\s*(?:FAIL|✕|×|FAILED)\s+(.+)/i)?.[1]).map(value => safeToken(value, 200)));
  const suiteTotals = text.match(/test suites?:\s*(?:(\d+)\s+passed,?\s*)?(?:(\d+)\s+failed)?/i);
  if (totals || suites.length || failedTests.length || suiteTotals) next.tests = { passed: finiteInteger(totals?.[1]) ?? 0, failed: finiteInteger(totals?.[2]) ?? failedTests.length, suitesPassed: finiteInteger(suiteTotals?.[1]), suitesFailed: finiteInteger(suiteTotals?.[2]), suites, failedTests, status: (finiteInteger(totals?.[2]) || failedTests.length || finiteInteger(suiteTotals?.[2])) ? "failed" : "passed", at: timestamp };

  const branch = safeBranch(text.match(/(?:on branch|^##)\s+([^\s.]+)/im)?.[1]);
  const gitRows = lines.map(line => line.match(/^\s*([MADRCU?]{1,2}|modified:|new file:|deleted:)\s+(.+)$/i)).filter(Boolean);
  const changedFiles = bounded(gitRows.map(match => safePath(match[2])));
  const clean = /working tree clean|nothing to commit/i.test(text);
  const commit = text.match(/\bcommit\s+([a-f0-9]{7,40})\b/i)?.[1] || null;
  const author = safeToken(text.match(/^Author:\s*(.+)$/im)?.[1], 120);
  const diff = text.match(/(\d+) files? changed(?:,\s*(\d+) insertions?\(\+\))?(?:,\s*(\d+) deletions?\(-\))?/i);
  if (branch || gitRows.length || clean || commit || author || diff) next.git = { branch, changedPaths: gitRows.length || finiteInteger(diff?.[1]) || 0, changedFiles, clean, commit, author, insertions: finiteInteger(diff?.[2]), deletions: finiteInteger(diff?.[3]), attribution: commit ? "commit" : gitRows.length ? "working-tree" : "status", at: timestamp };

  const duration = text.match(/(?:built|compiled|ready)\s+(?:in\s+)?([\d.]+)\s*(ms|s|sec|seconds?)/i);
  const buildFailed = /build failed|compilation failed|failed to compile/i.test(text);
  const phase = text.match(/(?:build phase|phase):\s*([A-Za-z][\w -]{0,50})/i)?.[1] || (/bundl(?:e|ing)/i.test(text) ? "bundling" : /transpil(?:e|ing)/i.test(text) ? "transpiling" : /minif(?:y|ying)/i.test(text) ? "minifying" : null);
  const artifacts = bounded(lines.map(line => line.match(/(?:artifact|emitted|output):\s*([^\s].+)$/i)?.[1]).map(safePath));
  if (duration || buildFailed || phase || artifacts.length) { const amount = Number(duration?.[1]); next.build = { status: buildFailed ? "failed" : duration ? "completed" : "running", phase, durationMs: Number.isFinite(amount) ? Math.round(amount * (/^m/i.test(duration?.[2]) ? 1 : 1000)) : null, artifacts, at: timestamp }; }

  const origin = safeOrigin(text.match(/https?:\/\/[^\s]+/i)?.[0]?.replace(/[),.;]+$/, ""));
  const port = finiteInteger(text.match(/(?:--port(?:=|\s+)|localhost:|127\.0\.0\.1:)(\d{2,5})/i)?.[1]);
  const ready = /healthy|listening on|server running|ready in|compiled successfully/i.test(text);
  const health = text.match(/(?:health(?:check)?|probe)\s*(?:status)?[:=]?\s*(passed|healthy|ok|failed|unhealthy)/i);
  const statusCode = finiteInteger(text.match(/\bHTTP\/?\d(?:\.\d)?\s+(\d{3})/i)?.[1]);
  if (origin || port || ready || health || statusCode) next.service = { origin, port, ready, health: health || statusCode ? (/failed|unhealthy/i.test(health?.[1] || "") || statusCode >= 400 ? "failed" : "confirmed") : "unconfirmed", statusCode, checkedAt: health || statusCode ? timestamp : null, at: timestamp };

  const dbConnected = /(?:database|postgres|mysql|mongodb|redis).*(?:connected|connection established|ready to accept connections)/i.test(text);
  const dbFailed = /(?:database|postgres|mysql|mongodb|redis).*(?:connection refused|connection failed|unreachable)/i.test(text);
  const migrations = text.match(/(\d+)\s+migrations?\s+(applied|pending)/i);
  const migrationComplete = /migrations? (?:complete|applied|up to date)/i.test(text);
  if (dbConnected || dbFailed || migrations || migrationComplete) next.database = { connected: dbConnected && !dbFailed, connection: dbFailed ? "failed" : dbConnected ? "confirmed" : "unknown", migrations: migrations?.[2]?.toLowerCase() || (migrationComplete ? "current" : "unknown"), migrationCount: finiteInteger(migrations?.[1]), at: timestamp };

  const containerLine = text.match(/(?:container\s+)?([A-Za-z0-9_.-]+)\s+(?:image\s+)?([A-Za-z0-9_./:-]+)?\s*(running|exited|created|paused|restarting|healthy|unhealthy)/i);
  const image = safeToken(text.match(/image(?: id)?:\s*([A-Za-z0-9_./:@-]+)/i)?.[1] || containerLine?.[2], 180);
  const cpu = Number(text.match(/CPU(?: usage)?:\s*([\d.]+)%/i)?.[1]);
  const memory = Number(text.match(/MEM(?:ORY)?(?: usage)?:\s*([\d.]+)\s*(MiB|MB|GiB|GB)/i)?.[1]);
  const memoryUnit = text.match(/MEM(?:ORY)?(?: usage)?:\s*[\d.]+\s*(MiB|MB|GiB|GB)/i)?.[1];
  if (containerLine || image || Number.isFinite(cpu) || Number.isFinite(memory)) next.container = { name: safeToken(containerLine?.[1], 120), image, state: containerLine?.[3]?.toLowerCase() || "unknown", healthy: /healthy/i.test(containerLine?.[3] || text) && !/unhealthy/i.test(containerLine?.[3] || text), cpuPercent: Number.isFinite(cpu) ? cpu : null, memoryMB: Number.isFinite(memory) ? Math.round(memory * (/^g/i.test(memoryUnit || "") ? 1024 : 1)) : null, at: timestamp };

  return next;
}

function mergeEvidence(current, value, timestamp = Date.now()) {
  const update = classifyEvidence(value, timestamp);
  if (!Object.keys(update).length) return current || {};
  return { ...(current || {}), ...update };
}

module.exports = { classifyEvidence, mergeEvidence };
