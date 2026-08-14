function isEscapeInput(input, key = {}) {
  // Ink recognizes the ordinary ESC byte. Windows Terminal can also use the
  // enhanced-keyboard VT encoding, which Ink 4 leaves in `input` after
  // stripping its leading ESC byte (for example: "[27;1;27~").
  return Boolean(key.escape) || /^\[27;\d+;27~$/.test(input);
}

export { isEscapeInput };
