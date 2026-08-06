const path = require("node:path");
const { DEFAULT_CONFIG_NAME } = require("../../cli/options.cjs");

function parseGroundstationArgs(argv, options = {}) {
  const cwd = options.cwd || process.cwd();
  const parsed = {
    configPath: path.resolve(cwd, DEFAULT_CONFIG_NAME),
    configExplicit: false
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "-c" || argument === "--config") {
      const value = argv[++index];
      if (!value || value.startsWith("-")) {
        throw new Error(`${argument} requires a file path`);
      }
      parsed.configPath = path.resolve(cwd, value);
      parsed.configExplicit = true;
      continue;
    }
    if (argument.startsWith("--config=")) {
      const value = argument.slice("--config=".length);
      if (!value) throw new Error("--config requires a file path");
      parsed.configPath = path.resolve(cwd, value);
      parsed.configExplicit = true;
      continue;
    }
    throw new Error(`unknown Groundstation option: ${argument}`);
  }

  return parsed;
}

module.exports = { parseGroundstationArgs };
