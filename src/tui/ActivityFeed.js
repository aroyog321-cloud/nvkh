import React from "react";
import { Box, Text } from "ink";
import { colors } from "./theme.js";

const e = React.createElement;

function eventName(event, sessions) {
  if (event.session?.name) return event.session.name;
  if (event.name) return event.name;
  return sessions.find(session => session.id === event.id)?.name || event.id || "Workspace";
}

function describe(event, sessions) {
  const name = eventName(event, sessions);
  switch (event.type) {
    case "session:created": return `${name} added`;
    case "session:status": return `${name} ${event.status}`;
    case "session:exit": return event.intentional
      ? `${name} stopped`
      : `${name} exited${event.exitCode === null ? "" : ` (${event.exitCode})`}`;
    case "session:spawn-error": return `${name} failed to start: ${event.error}`;
    case "session:supervision": return event.attentionRequired
      ? `${name} needs attention`
      : `${name} attention cleared`;
    case "session:renamed": return `${event.id} renamed to ${event.name}`;
    case "session:autostart": return `${name} startup ${event.autoStart ? "automatic" : "manual"}`;
    case "session:reconfigured": return `${name} configuration updated`;
    case "session:removed": return `${name} removed`;
    case "project:load-errors": return `${event.errorCount || 0} session definitions failed to load`;
    case "project:command-errors": return `${event.errorCount || 0} saved command definitions failed to load`;
    case "saved-command:instantiated": return `${name} added from saved preset`;
    case "workspace:persist-error": return `${name} ${event.operation} save failed`;
    case "attach:rejected": return `${name} attach rejected (${event.reason})`;
    default: return event.type;
  }
}

function eventColor(event) {
  if (
    event.type.includes("error") ||
    event.type === "attach:rejected" ||
    (event.type === "session:supervision" && event.attentionRequired) ||
    (event.type === "session:exit" && !event.intentional && event.exitCode !== 0)
  ) return colors.failed;
  return colors.dim;
}

function formatClock(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function ActivityFeed({ events = [], sessions = [] }) {
  const visible = events.slice(-3).reverse();
  return e(
    Box,
    { flexDirection: "column" },
    e(Text, { color: colors.dim, bold: true }, "RECENT ACTIVITY"),
    ...(visible.length
      ? visible.map(event => e(
        Text,
        { key: event.sequence, color: eventColor(event), wrap: "truncate-end" },
        `${formatClock(event.timestamp)}  ${describe(event, sessions)}`
      ))
      : [e(Text, { key: "empty", color: colors.dim }, "No activity yet.")])
  );
}
