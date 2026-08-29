import React from "react";
import { Box, Text, useInput } from "ink";
import TextInputPkg from "ink-text-input";
const TextInput = TextInputPkg.default || TextInputPkg;
import { colors } from "./theme.js";
import { isEscapeInput } from "./input.js";
const e = React.createElement;

function ConfirmPrompt({ confirm, onResolve }) {
  const [value, setValue] = React.useState("");
  const expectedText = confirm.expectedText || "RUN";

  useInput((input, key) => {
    if (isEscapeInput(input, key)) onResolve(false);
  });

  return e(
    Box,
    { flexDirection: "column", borderStyle: "round", borderColor: "red", padding: 1 },
    e(Text, { color: colors.failed }, confirm.message || `about to run: ${confirm.command}`),
    e(Text, { color: colors.dim }, `type ${expectedText} to confirm, esc to cancel`),
    e(
      Box,
      null,
      e(Text, null, "> "),
      e(TextInput, {
        value,
        onChange: setValue,
        onSubmit: (val) => onResolve(val === expectedText),
        focus: true,
      })
    )
  );
}

export default ConfirmPrompt;
