const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PROJECT_REGISTRY_VERSION = 1;
const DEFAULT_MAX_PROJECTS = 20;

class ProjectRegistryError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "ProjectRegistryError";
  }
}

function canonicalPath(value, platform = process.platform) {
  const absolute = path.resolve(value);
  return platform === "win32" ? absolute.toLowerCase() : absolute;
}

function projectIdFor(configPath, platform = process.platform) {
  return crypto
    .createHash("sha256")
    .update(canonicalPath(configPath, platform))
    .digest("hex")
    .slice(0, 24);
}

function cloneEntry(entry) {
  return {
    id: entry.id,
    name: entry.name,
    rootPath: entry.rootPath,
    configPath: entry.configPath,
    lastOpenedAt: entry.lastOpenedAt
  };
}

class ProjectRegistry {
  constructor(filePath, options = {}) {
    if (typeof filePath !== "string" || !filePath.trim()) {
      throw new TypeError("project registry file path is required");
    }
    this.filePath = path.resolve(filePath);
    this.platform = options.platform || process.platform;
    this.maxProjects = Number.isInteger(options.maxProjects) && options.maxProjects > 0
      ? options.maxProjects
      : DEFAULT_MAX_PROJECTS;
    this.entries = [];
    this.loadError = null;
    this._load();
  }

  _load() {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return;
      this.loadError = error instanceof SyntaxError
        ? "recent-project registry contains invalid JSON"
        : `unable to read recent-project registry: ${error.message}`;
      return;
    }

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      this.loadError = "recent-project registry root must be an object";
      return;
    }
    if (raw.version !== PROJECT_REGISTRY_VERSION || !Array.isArray(raw.projects)) {
      this.loadError = "recent-project registry has an unsupported format";
      return;
    }

    const identities = new Set();
    for (const entry of raw.projects) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      if (
        typeof entry.name !== "string" || !entry.name.trim() ||
        typeof entry.rootPath !== "string" || !entry.rootPath.trim() ||
        typeof entry.configPath !== "string" || !entry.configPath.trim() ||
        !Number.isFinite(entry.lastOpenedAt)
      ) continue;
      const configPath = path.resolve(entry.configPath);
      const identity = canonicalPath(configPath, this.platform);
      if (identities.has(identity)) continue;
      identities.add(identity);
      this.entries.push({
        id: projectIdFor(configPath, this.platform),
        name: entry.name.trim().slice(0, 80),
        rootPath: path.resolve(entry.rootPath),
        configPath,
        lastOpenedAt: entry.lastOpenedAt
      });
      if (this.entries.length === this.maxProjects) break;
    }
    this.entries.sort((left, right) => right.lastOpenedAt - left.lastOpenedAt);
  }

  list() {
    return this.entries.map(cloneEntry);
  }

  get(id) {
    const entry = this.entries.find(project => project.id === id);
    return entry ? cloneEntry(entry) : null;
  }

  remember(project, now = Date.now()) {
    if (!project || typeof project !== "object" || Array.isArray(project)) {
      throw new TypeError("project metadata is required");
    }
    const name = String(project.name || "").trim();
    if (!name) throw new ProjectRegistryError("project name is required");
    if (name.length > 80) throw new ProjectRegistryError("project name cannot exceed 80 characters");
    if (typeof project.configPath !== "string" || !project.configPath.trim()) {
      throw new ProjectRegistryError("project config path is required");
    }
    const configPath = path.resolve(project.configPath);
    const rootPath = path.resolve(project.rootPath || path.dirname(configPath));
    const id = projectIdFor(configPath, this.platform);
    const next = this.entries.filter(entry => entry.id !== id);
    next.unshift({ id, name, rootPath, configPath, lastOpenedAt: now });
    this._commit(next.slice(0, this.maxProjects));
    return cloneEntry(this.entries[0]);
  }

  remove(id) {
    const next = this.entries.filter(entry => entry.id !== id);
    if (next.length === this.entries.length) return false;
    this._commit(next);
    return true;
  }

  _commit(entries) {
    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true });
    const temporaryPath = path.join(
      directory,
      `.${path.basename(this.filePath)}.${process.pid}.${Date.now()}.tmp`
    );
    const contents = `${JSON.stringify({
      version: PROJECT_REGISTRY_VERSION,
      projects: entries.map(cloneEntry)
    }, null, 2)}\n`;
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
        try { fs.closeSync(descriptor); } catch (closeError) { /* Preserve the write error. */ }
      }
      try { fs.unlinkSync(temporaryPath); } catch (cleanupError) { /* It may not exist. */ }
      throw new ProjectRegistryError(`unable to save recent projects: ${error.message}`, { cause: error });
    }

    this.entries = entries.map(cloneEntry);
    this.loadError = null;
  }
}

module.exports = {
  DEFAULT_MAX_PROJECTS,
  PROJECT_REGISTRY_VERSION,
  ProjectRegistry,
  ProjectRegistryError,
  canonicalPath,
  projectIdFor
};
