import React from "react";
import { Box, Text, useInput } from "ink";
import TextInputPkg from "ink-text-input";
import { colors } from "./theme.js";
import { isEscapeInput } from "./input.js";

const TextInput = TextInputPkg.default || TextInputPkg;
const e = React.createElement;

const FIELDS = [
  { key: "command", label: "Command", hint: current => `current: ${current.command}` },
  {
    key: "args",
    label: "Arguments",
    hint: current => `JSON array; current: ${JSON.stringify(current.args || [])}`
  },
  { key: "cwd", label: "Working directory", hint: current => `current: ${current.cwd}` },
  {
    key: "powershellCompatibility",
    label: "PowerShell compatibility",
    hint: current => `yes/no; current: ${current.powershellCompatibility ? "yes" : "no"}`
  },
  {
    key: "env",
    label: "Environment overrides",
    hint: current => current.envKeys?.length
      ? `JSON object; blank keeps ${current.envKeys.join(", ")}; {} clears all`
      : "JSON object; blank keeps none"
  }
];

function parseField(field, value) {
  const trimmed = value.trim();
  if (!trimmed) return { skip: true };
  if (field.key === "command" && !trimmed) return { error: "Command cannot be empty" };
  if (field.key === "args") {
    try {
      const args = JSON.parse(trimmed);
      if (!Array.isArray(args) || args.some(item => typeof item !== "string")) {
        return { error: "Arguments must be a JSON array of strings" };
      }
      return { value: args };
    } catch (error) {
      return { error: "Arguments must be valid JSON" };
    }
  }
  if (field.key === "powershellCompatibility") {
    if (!/^(?:y|yes|n|no)$/i.test(trimmed)) return { error: "Enter yes or no" };
    return { value: /^(?:y|yes)$/i.test(trimmed) };
  }
  if (field.key === "env") {
    try {
      const env = JSON.parse(trimmed);
      if (!env || typeof env !== "object" || Array.isArray(env)) {
        return { error: "Environment must be a JSON object" };
      }
      if (Object.values(env).some(item => typeof item !== "string")) {
        return { error: "Environment values must be strings" };
      }
      return { value: env };
    } catch (error) {
      return { error: "Environment must be valid JSON" };
    }
  }
  return { value: trimmed };
}

export default function EditSessionPrompt({ configuration, onSubmit, onCancel }) {
  const [index, setIndex] = React.useState(0);
  const [value, setValue] = React.useState("");
  const [patch, setPatch] = React.useState({});
  const [error, setError] = React.useState("");
  const field = FIELDS[index];

  useInput((input, key) => {
    if (isEscapeInput(input, key)) onCancel();
  });

  const submitField = input => {
    const parsed = parseField(field, input);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    const nextPatch = parsed.skip ? patch : { ...patch, [field.key]: parsed.value };
    setPatch(nextPatch);
    setError("");
    setValue("");
    if (index < FIELDS.length - 1) {
      setIndex(index + 1);
      return;
    }
    onSubmit(nextPatch);
  };

  return e(
    Box,
    { flexDirection: "column", borderStyle: "round", borderColor: "cyan", padding: 1 },
    e(Text, { color: "cyan", bold: true }, `EDIT WORKER · ${configuration.name}`),
    e(Text, { color: colors.dim }, `Step ${index + 1} of ${FIELDS.length} · blank keeps current · Esc cancels`),
    e(Text, null, ""),
    e(Text, { bold: true }, field.label),
    e(Text, { color: colors.dim }, field.hint(configuration)),
    e(
      Box,
      null,
      e(Text, { color: "cyan" }, "> "),
      e(TextInput, {
        key: field.key,
        value,
        onChange: next => {
          setValue(next);
          if (error) setError("");
        },
        onSubmit: submitField,
        focus: true
      })
    ),
    error ? e(Text, { color: colors.failed }, error) : null
  );
}
