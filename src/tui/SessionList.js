import React from "react";
import { Box, Text } from "ink";
import { colors, glyphs } from "./theme.js";

const e = React.createElement;

export default function SessionList({ sessions = [], selected = 0, maxVisible = 16 }) {
  const visibleCount = Math.max(4, maxVisible);
  const start = Math.max(0, Math.min(
    selected - Math.floor(visibleCount / 2),
    sessions.length - visibleCount
  ));
  const visible = sessions.slice(start, start + visibleCount);

  return e(
    Box,
    {
      flexDirection: "column",
      width: 38,
      borderStyle: "round",
      padding: 1
    },
    start > 0 ? e(Text, { color: colors.dim }, `  ↑ ${start} more`) : null,
    ...visible.map((s, visibleIndex) => {
      const i = start + visibleIndex;
      return (
      e(
        Text,
        {
          key: s.id,
          color: s.attentionRequired ? colors.failed : (i === selected ? "cyan" : colors[s.status]),
          bold: s.attentionRequired
        },
        `${i === selected ? "› " : "  "}${s.attentionRequired ? "!" : (glyphs[s.status] || "?")} ${s.name}`
      )
      );
    }),
    start + visible.length < sessions.length
      ? e(Text, { color: colors.dim }, `  ↓ ${sessions.length - start - visible.length} more`)
      : null
  );
}
