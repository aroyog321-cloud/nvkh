import React from "react";
import { Box, Text, useInput } from "ink";
import { colors } from "./theme.js";
import { isEscapeInput } from "./input.js";

const e = React.createElement;
const MAX_VISIBLE = 12;

export default function SavedCommandPicker({ commands = [], onSubmit, onCancel }) {
  const [index, setIndex] = React.useState(0);
  const selected = commands[index] || null;
  const start = Math.max(0, Math.min(
    commands.length - MAX_VISIBLE,
    index - Math.floor(MAX_VISIBLE / 2)
  ));
  const visible = commands.slice(start, start + MAX_VISIBLE);

  useInput((input, key) => {
    if (isEscapeInput(input, key) || input === "p") {
      onCancel();
      return;
    }
    if (key.upArrow || input === "k") {
      setIndex(current => Math.max(0, current - 1));
      return;
    }
    if (key.downArrow || input === "j") {
      setIndex(current => Math.min(commands.length - 1, current + 1));
      return;
    }
    if (key.return && selected) onSubmit(selected);
  });

  return e(
    Box,
    { flexDirection: "column", borderStyle: "round", borderColor: "cyan", padding: 1 },
    e(Text, { color: "cyan", bold: true }, "SAVED WORKER PRESETS"),
    e(Text, { color: colors.dim }, "j/k selects · Enter adds worker · Esc or p cancels"),
    e(Text, null, ""),
    start > 0 ? e(Text, { color: colors.dim }, `  ↑ ${start} more`) : null,
    ...visible.map((command, visibleIndex) => {
      const absoluteIndex = start + visibleIndex;
      const active = absoluteIndex === index;
      const startup = command.autoStart ? "starts now" : "manual start";
      const availability = command.available ? startup : "already added";
      return e(
        Text,
        {
          key: command.id,
          color: active ? "cyan" : (command.available ? undefined : colors.dim),
          bold: active
        },
        `${active ? "›" : " "} ${command.name} · ${availability}`
      );
    }),
    start + visible.length < commands.length
      ? e(Text, { color: colors.dim }, `  ↓ ${commands.length - start - visible.length} more`)
      : null,
    selected
      ? e(Text, { color: colors.dim }, `${selected.command}${selected.args.length ? ` ${selected.args.join(" ")}` : ""}`)
      : null
  );
}
