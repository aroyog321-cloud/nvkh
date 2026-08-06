import React from "react";
import { Box, Text } from "ink";
import { colors, glyphs } from "./theme.js";
const e = React.createElement;

const STATUSES = ["running", "starting", "idle", "failed", "exited"];

function OverviewStrip({ sessions }) {
  const counts = Object.fromEntries(STATUSES.map(status => [
    status,
    sessions.filter(session => session.status === status).length
  ]));
  const attentionCount = sessions.filter(session => session.attentionRequired).length;

  return e(
    Box,
    { gap: 2 },
    attentionCount
      ? e(Text, { color: colors.failed, bold: true }, `! ${attentionCount} attention`)
      : e(Text, { color: colors.nominal }, "✓ clear"),
    ...STATUSES.map(status =>
      e(
        Box,
        { key: status },
        e(
          Text,
          { color: colors[status], bold: status === "failed" && counts[status] > 0 },
          `${glyphs[status]} ${counts[status]} ${status}`
        )
      )
    )
  );
}

export default OverviewStrip;
