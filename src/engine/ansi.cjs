// Strips ANSI escape sequences (color codes, cursor movement, etc.) for
// display in Snapshot/Tail, where Ink's <Text> doesn't interpret raw
// escapes itself. Classification still runs on the raw chunk, since escape
// codes rarely split a matched keyword and stripping first would just cost
// cycles on every chunk for no benefit there.

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z0-9]*(?:;[a-zA-Z0-9]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PRZcf-ntqry=><~]))/g;

function stripAnsi(str) {
  return str.replace(ANSI_PATTERN, "");
}

module.exports = { stripAnsi };
