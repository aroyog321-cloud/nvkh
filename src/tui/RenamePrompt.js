import React from "react";
import { Box, Text, useInput } from "ink";
import TextInputPkg from "ink-text-input";
const TextInput = TextInputPkg.default || TextInputPkg;
import { colors } from "./theme.js";
import { isEscapeInput } from "./input.js";
const e = React.createElement;

function RenamePrompt({ currentName, onSubmit, onCancel }) {
  const [value, setValue] = React.useState(currentName);

  useInput((input, key) => {
    if (isEscapeInput(input, key)) onCancel();
  });

  return e(
    Box,
    { flexDirection: "column", borderStyle: "round", borderColor: "cyan", padding: 1 },
    e(Text, { color: colors.dim }, "rename \u2014 enter to confirm, esc to cancel"),
    e(
      Box,
      null,
      e(Text, null, "> "),
      e(TextInput, {
        value,
        onChange: setValue,
        onSubmit: (val) => { if (val.trim()) onSubmit(val.trim()); else onCancel(); },
        focus: true,
      })
    )
  );
}

export default RenamePrompt;
