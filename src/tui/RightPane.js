import React from "react";
import { Box, Text } from "ink";
import { colors } from "./theme.js";

const e = React.createElement;

function formatRuntime(runtimeMs) {
  const totalSeconds = Math.max(0, Math.floor((runtimeMs || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatClock(timestamp) {
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function Metadata({ snapshot }) {
  if (!snapshot) return null;
  const command = [snapshot.command, ...(snapshot.args || [])].join(" ");
  return e(
    Box,
    { flexDirection: "column" },
    e(Text, { color: colors.dim }, `status   ${snapshot.status}`),
    e(Text, { color: colors.dim }, `command  ${command}`),
    e(Text, { color: colors.dim }, `cwd      ${snapshot.cwd}`),
    e(Text, { color: colors.dim }, `runtime  ${formatRuntime(snapshot.runtimeMs)}`),
    e(Text, { color: colors.dim }, `startup  ${snapshot.autoStart ? "automatic" : "manual"}`),
    snapshot.pid === null
      ? null
      : e(Text, { color: colors.dim }, `pid      ${snapshot.pid}`),
    snapshot.envKeys?.length
      ? e(Text, { color: colors.dim }, `env      ${snapshot.envKeys.length} overrides`)
      : null,
    snapshot.lastOutputAt === null
      ? null
      : e(Text, { color: colors.dim }, `output   ${formatClock(snapshot.lastOutputAt)}`),
    snapshot.exitCode === null
      ? null
      : e(Text, { color: colors.dim }, `exit     ${snapshot.exitCode}`),
    snapshot.spawnError
      ? e(Text, { color: colors.failed }, `error    ${snapshot.spawnError.split("\n")[0]}`)
      : null
  );
}

export default function RightPane({ session, snapshot, mode, tailLines = [] }) {
  const view = snapshot ? {
    ...snapshot,
    status: session?.status ?? snapshot.status,
    attentionRequired: session?.attentionRequired ?? snapshot.attentionRequired,
    attentionReason: session?.attentionReason ?? snapshot.attentionReason
  } : session;
  const status = view?.status;
  const borderColor = colors[status] || "cyan";

  if (mode === "tail") {
    return e(
      Box,
      {
        flexDirection: "column",
        flexGrow: 1,
        borderStyle: "round",
        borderColor,
        padding: 1
      },
      e(Text, { color: borderColor, bold: true }, `TAIL · ${session?.name || "No session"}`),
      e(Text, { color: colors.dim }, `${status || "unknown"} · read-only · bounded live output`),
      e(Text, null, ""),
      tailLines.length
        ? e(Text, null, tailLines.join("\n"))
        : e(Text, { color: colors.dim }, "Waiting for terminal output…")
    );
  }

  const previewLines = (snapshot?.lines || []).slice(-6);
  const needsAttention = Boolean(view?.attentionRequired);
  const failed = status === "failed";

  return e(
    Box,
    {
      flexDirection: "column",
      flexGrow: 1,
      borderStyle: "round",
      borderColor,
      padding: 1
    },
    e(Text, { color: borderColor, bold: true }, session?.name || "No session selected"),
    needsAttention
      ? e(Text, { color: colors.failed, bold: true }, "NEEDS ATTENTION")
      : (failed ? e(Text, { color: colors.failed, bold: true }, "PROCESS FAILED") : null),
    needsAttention && view?.attentionReason
      ? e(Text, { color: colors.failed, wrap: "truncate-end" }, view.attentionReason)
      : null,
    needsAttention && view?.attentionSince
      ? e(Text, { color: colors.dim }, `Raised ${formatClock(view.attentionSince)} · press a to acknowledge`)
      : null,
    e(Text, null, ""),
    e(Metadata, { snapshot: view }),
    previewLines.length ? e(Text, null, "") : null,
    previewLines.length ? e(Text, { color: colors.dim, bold: true }, "RECENT OUTPUT") : null,
    previewLines.length
      ? e(Text, { wrap: "truncate-end" }, previewLines.join("\n"))
      : e(Text, { color: colors.dim }, "No terminal output yet.")
  );
}
