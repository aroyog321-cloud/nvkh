const fs = require("node:fs");
const path = require("node:path");

const WORKSPACE_VERSION = 1;
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

class WorkspaceConfigError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "WorkspaceConfigError";
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function resolveWorkingDirectory(value, baseDir) {
  const cwd = value === undefined ? "." : String(value).trim();
  if (!cwd) throw new WorkspaceConfigError("cwd cannot be empty");
  if (cwd.includes("\0")) throw new WorkspaceConfigError("cwd cannot contain null bytes");

  // A Windows workspace can be inspected from a non-Windows host during CI.
  // Keep drive-letter and UNC paths intact rather than resolving them as POSIX
  // relative paths.
  if (path.isAbsolute(cwd) || path.win32.isAbsolute(cwd)) return path.normalize(cwd);
  return path.resolve(baseDir, cwd);
}

function normalizeEnvironment(value) {
  if (value === undefined) return {};
  if (!isPlainObject(value)) {
    throw new WorkspaceConfigError("env must be an object of string values");
  }

  const env = {};
  const entries = Object.entries(value);
  if (entries.length > 256) {
    throw new WorkspaceConfigError("env cannot contain more than 256 entries");
  }
  for (const [key, entry] of entries) {
    if (!key || key.includes("=") || key.includes("\0")) {
      throw new WorkspaceConfigError("env keys must be non-empty and cannot contain equals signs or null bytes");
    }
    if (typeof entry !== "string") throw new WorkspaceConfigError("env values must be strings");
    if (entry.includes("\0")) throw new WorkspaceConfigError("env values cannot contain null bytes");
    env[key] = entry;
  }
  return env;
}

function normalizeSessionDefinition(definition, options = {}) {
  if (!isPlainObject(definition)) {
    throw new WorkspaceConfigError("session definition must be an object");
  }

  if (typeof definition.id !== "string") {
    throw new WorkspaceConfigError("session id must be a string");
  }
  const id = definition.id.trim();
  if (!SESSION_ID_PATTERN.test(id)) {
    throw new WorkspaceConfigError(
      "session id must be 1-64 characters using letters, numbers, dots, dashes, or underscores"
    );
  }

  if (typeof definition.command !== "string") {
    throw new WorkspaceConfigError("command must be a string");
  }
  const command = definition.command.trim();
  if (!command) throw new WorkspaceConfigError("command is required");
  if (command.length > 4096) throw new WorkspaceConfigError("command is too long");
  if (command.includes("\0")) throw new WorkspaceConfigError("command cannot contain null bytes");

  if (definition.name !== undefined && typeof definition.name !== "string") {
    throw new WorkspaceConfigError("name must be a string");
  }
  const name = (definition.name || id).trim();
  if (!name) throw new WorkspaceConfigError("name cannot be empty");
  if (name.length > 80) throw new WorkspaceConfigError("name cannot exceed 80 characters");

  const args = definition.args === undefined ? [] : definition.args;
  if (!Array.isArray(args) || args.some(value => typeof value !== "string")) {
    throw new WorkspaceConfigError("args must be an array of strings");
  }
  if (args.length > 128) throw new WorkspaceConfigError("args cannot contain more than 128 entries");
  if (args.some(value => value.includes("\0"))) {
    throw new WorkspaceConfigError("args cannot contain null bytes");
  }

  const baseDir = options.baseDir || process.cwd();
  if (definition.cwd !== undefined && typeof definition.cwd !== "string") {
    throw new WorkspaceConfigError("cwd must be a string");
  }
  const persistedCwd = definition.cwd === undefined ? "." : definition.cwd.trim();
  const runtime = {
    id,
    name,
    command,
    args: [...args],
    cwd: resolveWorkingDirectory(persistedCwd, baseDir),
    env: normalizeEnvironment(definition.env),
    powershellCompatibility: definition.powershellCompatibility === true,
    autoStart: definition.autoStart !== false
  };

  if (
    definition.powershellCompatibility !== undefined &&
    typeof definition.powershellCompatibility !== "boolean"
  ) {
    throw new WorkspaceConfigError("powershellCompatibility must be a boolean");
  }
  if (definition.powershellCompatibility === true && !args.length && /\s/.test(command)) {
    throw new WorkspaceConfigError(
      "powershellCompatibility requires the executable in command and options in the args array"
    );
  }
  if (definition.autoStart !== undefined && typeof definition.autoStart !== "boolean") {
    throw new WorkspaceConfigError("autoStart must be a boolean");
  }

  const persisted = {
    ...definition,
    id,
    name,
    command,
    cwd: persistedCwd || "."
  };
  if (args.length) persisted.args = [...args];
  else delete persisted.args;
  if (Object.keys(runtime.env).length) persisted.env = { ...runtime.env };
  else delete persisted.env;
  if (runtime.powershellCompatibility) persisted.powershellCompatibility = true;
  else delete persisted.powershellCompatibility;
  if (!runtime.autoStart) persisted.autoStart = false;
  else delete persisted.autoStart;

  return { runtime, persisted };
}

function normalizeSavedCommandDefinition(definition, options = {}) {
  if (!isPlainObject(definition)) {
    throw new WorkspaceConfigError("saved command definition must be an object");
  }

  // Saved commands are inert until an operator instantiates them. Defaulting
  // their resulting worker to manual startup preserves that safety boundary;
  // a workspace can opt into immediate startup explicitly.
  const withSafeDefault = Object.hasOwn(definition, "autoStart")
    ? definition
    : { ...definition, autoStart: false };
  return normalizeSessionDefinition(withSafeDefault, options);
}

function projectNameFrom(raw, directory) {
  if (typeof raw.project === "string" && raw.project.trim()) return raw.project.trim();
  if (isPlainObject(raw.project) && typeof raw.project.name === "string" && raw.project.name.trim()) {
    return raw.project.name.trim();
  }
  return path.basename(directory);
}

class WorkspaceStore {
  constructor(filePath, raw) {
    this.filePath = path.resolve(filePath);
    this.directory = path.dirname(this.filePath);
    this.raw = raw;
  }

  info() {
    return {
      version: Number.isInteger(this.raw.version) ? this.raw.version : WORKSPACE_VERSION,
      name: projectNameFrom(this.raw, this.directory),
      path: this.filePath,
      directory: this.directory,
      persistent: true
    };
  }

  definitions() {
    return [...this.raw.sessions];
  }

  commandDefinitions() {
    return Array.isArray(this.raw.commands) ? [...this.raw.commands] : [];
  }

  recipeDefinitions() {
    return Array.isArray(this.raw.recipes) ? this.raw.recipes.map(recipe => JSON.parse(JSON.stringify(recipe))) : [];
  }

  missionDefinitions() {
    return Array.isArray(this.raw.missions) ? this.raw.missions.map(mission => JSON.parse(JSON.stringify(mission))) : [];
  }

  attentionDefinitions() {
    return Array.isArray(this.raw.attention) ? this.raw.attention.map(item => JSON.parse(JSON.stringify(item))) : [];
  }

  attentionPreferences() {
    const value = isPlainObject(this.raw.attentionPreferences) ? this.raw.attentionPreferences : {};
    return JSON.parse(JSON.stringify(value));
  }

  upsertAttention(record) {
    const nextRaw = this._nextRaw();
    nextRaw.attention = this.attentionDefinitions();
    const index = nextRaw.attention.findIndex(item => item?.id === record.id);
    if (index === -1) nextRaw.attention.unshift(JSON.parse(JSON.stringify(record)));
    else nextRaw.attention[index] = JSON.parse(JSON.stringify(record));
    nextRaw.attention = nextRaw.attention.slice(0, 200);
    this._commit(nextRaw);
  }

  setAttentionPreferences(preferences) {
    const nextRaw = this._nextRaw();
    nextRaw.attentionPreferences = JSON.parse(JSON.stringify(preferences));
    this._commit(nextRaw);
  }

  upsertMission(mission) {
    const nextRaw = this._nextRaw();
    nextRaw.missions = this.missionDefinitions();
    const index = nextRaw.missions.findIndex(item => item?.id === mission.id);
    if (index === -1) nextRaw.missions.unshift(JSON.parse(JSON.stringify(mission)));
    else nextRaw.missions[index] = JSON.parse(JSON.stringify(mission));
    nextRaw.missions = nextRaw.missions.slice(0, 100);
    this._commit(nextRaw);
  }

  upsertRecipe(recipe) {
    const nextRaw = this._nextRaw();
    nextRaw.recipes = Array.isArray(this.raw.recipes) ? this.recipeDefinitions() : [];
    const index = nextRaw.recipes.findIndex(item => item?.id === recipe.id);
    if (index === -1) nextRaw.recipes.unshift(JSON.parse(JSON.stringify(recipe)));
    else nextRaw.recipes[index] = JSON.parse(JSON.stringify(recipe));
    nextRaw.recipes = nextRaw.recipes.slice(0, 20);
    this._commit(nextRaw);
  }

  removeRecipe(id) {
    const nextRaw = this._nextRaw();
    const recipes = Array.isArray(this.raw.recipes) ? this.recipeDefinitions() : [];
    nextRaw.recipes = recipes.filter(recipe => recipe?.id !== id);
    if (nextRaw.recipes.length === recipes.length) return false;
    this._commit(nextRaw);
    return true;
  }

  getDefinition(id) {
    const definition = this.raw.sessions.find(item => item && item.id === id);
    return isPlainObject(definition) ? { ...definition } : null;
  }

  _nextRaw() {
    return {
      ...this.raw,
      sessions: this.raw.sessions.map(item => isPlainObject(item) ? { ...item } : item)
    };
  }

  _commit(nextRaw) {
    this._writeRaw(nextRaw);
    this.raw = nextRaw;
  }

  upsert(definition) {
    const nextRaw = this._nextRaw();
    const index = nextRaw.sessions.findIndex(item => item && item.id === definition.id);
    if (index === -1) nextRaw.sessions.push({ ...definition });
    else nextRaw.sessions[index] = { ...nextRaw.sessions[index], ...definition };
    this._commit(nextRaw);
  }

  replace(id, definition) {
    const nextRaw = this._nextRaw();
    const index = nextRaw.sessions.findIndex(item => item && item.id === id);
    if (index === -1) return false;
    nextRaw.sessions[index] = { ...definition };
    this._commit(nextRaw);
    return true;
  }

  rename(id, name) {
    const nextRaw = this._nextRaw();
    const index = nextRaw.sessions.findIndex(item => item && item.id === id);
    if (index === -1) return false;
    nextRaw.sessions[index] = { ...nextRaw.sessions[index], name };
    this._commit(nextRaw);
    return true;
  }

  setAutoStart(id, enabled) {
    const nextRaw = this._nextRaw();
    const index = nextRaw.sessions.findIndex(item => item && item.id === id);
    if (index === -1) return false;
    nextRaw.sessions[index] = { ...nextRaw.sessions[index] };
    if (enabled) delete nextRaw.sessions[index].autoStart;
    else nextRaw.sessions[index].autoStart = false;
    this._commit(nextRaw);
    return true;
  }

  remove(id) {
    const nextRaw = this._nextRaw();
    const nextSessions = nextRaw.sessions.filter(item => !item || item.id !== id);
    if (nextSessions.length === nextRaw.sessions.length) return false;
    nextRaw.sessions = nextSessions;
    this._commit(nextRaw);
    return true;
  }

  save() {
    this._writeRaw(this.raw);
  }

  _writeRaw(raw) {
    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true });
    const temporaryPath = path.join(
      directory,
      `.${path.basename(this.filePath)}.${process.pid}.${Date.now()}.tmp`
    );
    const contents = `${JSON.stringify(raw, null, 2)}\n`;
    let descriptor;

    try {
      descriptor = fs.openSync(temporaryPath, "wx", 0o600);
      fs.writeFileSync(descriptor, contents, "utf8");
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.renameSync(temporaryPath, this.filePath);
    } catch (error) {
      if (descriptor !== undefined) {
        try {
          fs.closeSync(descriptor);
        } catch (closeError) {
          // Best effort; the original save error is more useful.
        }
      }
      try {
        fs.unlinkSync(temporaryPath);
      } catch (cleanupError) {
        // The temporary file may never have been created.
      }
      throw new WorkspaceConfigError(`unable to save workspace: ${error.message}`, { cause: error });
    }
  }
}

function openWorkspace(filePath) {
  const absolutePath = path.resolve(filePath);
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    const reason = error instanceof SyntaxError ? "invalid JSON" : error.message;
    throw new WorkspaceConfigError(`unable to load workspace ${absolutePath}: ${reason}`, { cause: error });
  }

  if (!isPlainObject(raw)) throw new WorkspaceConfigError("workspace root must be an object");
  if (raw.version !== undefined && raw.version !== WORKSPACE_VERSION) {
    throw new WorkspaceConfigError(`unsupported workspace version: ${raw.version}`);
  }
  if (!Array.isArray(raw.sessions)) throw new WorkspaceConfigError("workspace sessions must be an array");
  if (raw.commands !== undefined && !Array.isArray(raw.commands)) {
    throw new WorkspaceConfigError("workspace commands must be an array");
  }
  if (raw.recipes !== undefined && !Array.isArray(raw.recipes)) {
    throw new WorkspaceConfigError("workspace recipes must be an array");
  }
  if (raw.missions !== undefined && !Array.isArray(raw.missions)) {
    throw new WorkspaceConfigError("workspace missions must be an array");
  }
  if (raw.attention !== undefined && !Array.isArray(raw.attention)) {
    throw new WorkspaceConfigError("workspace attention must be an array");
  }
  if (raw.attentionPreferences !== undefined && !isPlainObject(raw.attentionPreferences)) {
    throw new WorkspaceConfigError("workspace attentionPreferences must be an object");
  }

  if (raw.version === undefined) raw.version = WORKSPACE_VERSION;
  return new WorkspaceStore(absolutePath, raw);
}

function validateWorkspaceFile(filePath) {
  const workspace = openWorkspace(filePath);
  const errors = [];
  const commandErrors = [];
  const ids = new Set();
  const commandIds = new Set();
  let validSessionCount = 0;
  let validCommandCount = 0;

  for (const definition of workspace.definitions()) {
    try {
      const { runtime } = normalizeSessionDefinition(definition, { baseDir: workspace.directory });
      if (ids.has(runtime.id)) {
        throw new WorkspaceConfigError(`session id already in use: ${runtime.id}`);
      }
      ids.add(runtime.id);
      validSessionCount++;
    } catch (err) {
      errors.push({
        id: definition?.id || null,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  for (const definition of workspace.commandDefinitions()) {
    try {
      const { runtime } = normalizeSavedCommandDefinition(definition, { baseDir: workspace.directory });
      if (commandIds.has(runtime.id)) {
        throw new WorkspaceConfigError(`saved command id already in use: ${runtime.id}`);
      }
      commandIds.add(runtime.id);
      validCommandCount++;
    } catch (err) {
      commandErrors.push({
        id: definition?.id || null,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return {
    workspace: workspace.info(),
    sessionCount: workspace.definitions().length,
    validSessionCount,
    errors,
    commandCount: workspace.commandDefinitions().length,
    validCommandCount,
    commandErrors
  };
}

module.exports = {
  WORKSPACE_VERSION,
  WorkspaceConfigError,
  WorkspaceStore,
  normalizeSavedCommandDefinition,
  normalizeSessionDefinition,
  openWorkspace,
  validateWorkspaceFile
};
