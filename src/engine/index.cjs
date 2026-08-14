const EventEmitter = require("node:events");
const { SessionEngine } = require("./sessionEngine.cjs");
const {
  normalizeSavedCommandDefinition,
  normalizeSessionDefinition,
  openWorkspace
} = require("./workspaceConfig.cjs");
const { openActivityStore } = require("./activityStore.cjs");

const ENGINE_CONTRACT_VERSION = 1;
const MAX_ACTIVITY_EVENTS = 200;
const ACTIVITY_PERSIST_DELAY_MS = 50;

const ENGINE_EVENTS = Object.freeze([
  "session:created",
  "session:output",
  "session:status",
  "session:exit",
  "session:spawn-error",
  "session:supervision",
  "session:renamed",
  "session:autostart",
  "session:reconfigured",
  "session:removed"
]);

class EngineAPI extends EventEmitter {
  #sessionEngine;
  #workspaceStore;
  #activityStore;
  #openWorkspace;
  #openActivityStore;
  #sessionOperations;
  #stopping;
  #stopPromise;
  #projectLoaded;
  #loadErrors;
  #savedCommands;
  #savedCommandErrors;
  #engineBindings;
  #eventSequence;
  #activityEvents;
  #activityLimit;
  #activityDroppedThrough;
  #publicationQueue;
  #publishing;
  #onSubscriberError;
  #activityPersistTimer;
  #activityPersistDelayMs;
  #activityDirty;
  #reportingActivityPersistError;
  #lastActivityPersistError;

  constructor(options = {}) {
    super();
    this.#sessionEngine = new SessionEngine(options);
    this.#workspaceStore = null;
    this.#activityStore = null;
    this.#openWorkspace = options.openWorkspace || openWorkspace;
    this.#openActivityStore = options.openActivityStore || openActivityStore;
    this.#sessionOperations = new Map();
    this.#stopping = false;
    this.#stopPromise = null;
    this.#projectLoaded = false;
    this.#loadErrors = [];
    this.#savedCommands = new Map();
    this.#savedCommandErrors = [];
    this.#engineBindings = [];
    this.#eventSequence = 0;
    this.#activityEvents = [];
    this.#activityLimit = Number.isInteger(options.maxActivityEvents) && options.maxActivityEvents > 0
      ? options.maxActivityEvents
      : MAX_ACTIVITY_EVENTS;
    this.#activityDroppedThrough = 0;
    this.#publicationQueue = [];
    this.#publishing = false;
    this.#onSubscriberError = typeof options.onSubscriberError === "function"
      ? options.onSubscriberError
      : () => {};
    this.#activityPersistTimer = null;
    this.#activityPersistDelayMs = Number.isInteger(options.activityPersistDelayMs) && options.activityPersistDelayMs >= 0
      ? options.activityPersistDelayMs
      : ACTIVITY_PERSIST_DELAY_MS;
    this.#activityDirty = false;
    this.#reportingActivityPersistError = false;
    this.#lastActivityPersistError = null;

    for (const type of ENGINE_EVENTS) {
      const listener = payload => {
        this.#publish(type, payload);
      };
      this.#sessionEngine.on(type, listener);
      this.#engineBindings.push([type, listener]);
    }
  }

  loadProject(configOrPath) {
    if (this.#stopping) throw new Error("the engine is stopping");
    if (this.#projectLoaded || this.#sessionEngine.list().length > 0) {
      throw new Error("a workspace is already loaded; create a new EngineAPI to load another workspace");
    }
    let config = configOrPath;
    let baseDir = process.cwd();
    if (typeof configOrPath === "string") {
      this.#workspaceStore = this.#openWorkspace(configOrPath);
      this.#activityStore = this.#openActivityStore(this.#workspaceStore.filePath);
      try {
        const restored = this.#activityStore.load({
          contractVersion: ENGINE_CONTRACT_VERSION,
          maxEvents: this.#activityLimit
        });
        this.#eventSequence = restored.latestSequence;
        this.#activityEvents = restored.events;
        this.#activityDroppedThrough = restored.droppedThroughSequence;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        this.#publish("activity:load-error", { error });
      }
      config = {
        sessions: this.#workspaceStore.definitions(),
        commands: this.#workspaceStore.commandDefinitions()
      };
      baseDir = this.#workspaceStore.directory;
    }
    const sessionDefinitions = config?.sessions === undefined ? [] : config.sessions;
    const commandDefinitions = config?.commands === undefined ? [] : config.commands;
    if (!Array.isArray(sessionDefinitions)) throw new Error("workspace sessions must be an array");
    if (!Array.isArray(commandDefinitions)) throw new Error("workspace commands must be an array");
    this.#projectLoaded = true;

    const commandErrors = [];
    for (const def of commandDefinitions) {
      try {
        const normalized = normalizeSavedCommandDefinition(def, { baseDir });
        if (this.#savedCommands.has(normalized.runtime.id)) {
          throw new Error(`saved command id already in use: ${normalized.runtime.id}`);
        }
        this.#savedCommands.set(normalized.runtime.id, normalized);
      } catch (err) {
        commandErrors.push({
          id: def?.id || null,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    this.#savedCommandErrors = commandErrors.map(error => ({ ...error }));
    if (commandErrors.length) {
      this.#publish(
        "project:command-errors",
        { errors: commandErrors.map(error => ({ ...error })) },
        commandErrors.map(error => ({ ...error }))
      );
    }

    const errors = [];
    for (const def of sessionDefinitions) {
      try {
        const { runtime } = normalizeSessionDefinition(def, { baseDir });
        this.#sessionEngine.create(runtime);
      } catch (err) {
        errors.push({
          id: def?.id || null,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    this.#loadErrors = errors;
    if (errors.length) {
      this.#publish(
        "project:load-errors",
        { errors: errors.map(error => ({ ...error })) },
        errors
      );
    }
    return errors;
  }

  getWorkspace() {
    if (this.#workspaceStore) {
      return {
        ...this.#workspaceStore.info(),
        loadErrorCount: this.#loadErrors.length + this.#savedCommandErrors.length,
        sessionLoadErrorCount: this.#loadErrors.length,
        savedCommandCount: this.#savedCommands.size,
        savedCommandErrorCount: this.#savedCommandErrors.length,
        activityPersistent: Boolean(this.#activityStore)
      };
    }
    return {
      version: 1,
      name: "Unsaved workspace",
      path: null,
      directory: process.cwd(),
      persistent: false,
      activityPersistent: false,
      loadErrorCount: this.#loadErrors.length + this.#savedCommandErrors.length,
      sessionLoadErrorCount: this.#loadErrors.length,
      savedCommandCount: this.#savedCommands.size,
      savedCommandErrorCount: this.#savedCommandErrors.length
    };
  }

  create(definition) {
    if (this.#stopping) return { ok: false, error: "the engine is stopping" };
    const baseDir = this.#workspaceStore?.directory || process.cwd();
    let normalized;
    try {
      normalized = normalizeSessionDefinition(definition, { baseDir });
      if (this.#sessionEngine.get(normalized.runtime.id)) {
        return { ok: false, error: `session id already in use: ${normalized.runtime.id}` };
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    const previousDefinition = this.#workspaceStore?.getDefinition(normalized.persisted.id) || null;
    if (this.#workspaceStore) {
      try {
        this.#workspaceStore.upsert(normalized.persisted);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        this.#publish("workspace:persist-error", { operation: "create", id: normalized.runtime.id, error });
        return { ok: false, error };
      }
    }

    let session;
    try {
      session = this.#sessionEngine.create(normalized.runtime);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      if (this.#workspaceStore) {
        try {
          if (previousDefinition) this.#workspaceStore.upsert(previousDefinition);
          else this.#workspaceStore.remove(normalized.runtime.id);
        } catch (rollbackError) {
          const rollback = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
          this.#publish("workspace:persist-error", {
            operation: "create-rollback",
            id: normalized.runtime.id,
            error: rollback
          });
          return { ok: false, error: `${error}; workspace rollback failed: ${rollback}` };
        }
      }
      return { ok: false, error };
    }

    return { ok: true, session: session.summary() };
  }

  list() {
    return this.#sessionEngine.list();
  }

  getSnapshot(id) {
    return this.#sessionEngine.getSnapshot(id);
  }

  getSessionConfiguration(id) {
    const definition = this.#workspaceStore?.getDefinition(id) || this.#sessionEngine.getDefinition(id);
    if (!definition) return null;
    const env = definition.env && typeof definition.env === "object" ? definition.env : {};
    return {
      id: definition.id,
      name: definition.name || definition.id,
      command: definition.command,
      args: Array.isArray(definition.args) ? [...definition.args] : [],
      cwd: definition.cwd === undefined ? "." : definition.cwd,
      envKeys: Object.keys(env),
      powershellCompatibility: definition.powershellCompatibility === true,
      autoStart: definition.autoStart !== false
    };
  }

  listSavedCommands() {
    return [...this.#savedCommands.values()].map(command => {
      const definition = command.persisted;
      const env = definition.env && typeof definition.env === "object" ? definition.env : {};
      return {
        id: definition.id,
        name: definition.name || definition.id,
        command: definition.command,
        args: Array.isArray(definition.args) ? [...definition.args] : [],
        cwd: definition.cwd === undefined ? "." : definition.cwd,
        envKeys: Object.keys(env),
        powershellCompatibility: command.runtime.powershellCompatibility,
        autoStart: command.runtime.autoStart,
        available: !this.#sessionEngine.get(definition.id)
      };
    });
  }

  createFromSavedCommand(commandId) {
    if (this.#stopping) return { ok: false, error: "the engine is stopping" };
    const savedCommand = this.#savedCommands.get(commandId);
    if (!savedCommand) return { ok: false, error: `no such saved command: ${commandId}` };
    if (this.#sessionEngine.get(savedCommand.runtime.id)) {
      return { ok: false, error: `session id already in use: ${savedCommand.runtime.id}` };
    }

    const result = this.create({ ...savedCommand.persisted });
    if (!result.ok) return result;
    this.#publish("saved-command:instantiated", {
      id: result.session.id,
      commandId,
      session: {
        id: result.session.id,
        name: result.session.name,
        status: result.session.status,
        autoStart: result.session.autoStart
      }
    });
    return { ...result, commandId };
  }

  getState() {
    return {
      contractVersion: ENGINE_CONTRACT_VERSION,
      sequence: this.#eventSequence,
      generatedAt: Date.now(),
      workspace: this.getWorkspace(),
      loadErrors: this.#loadErrors.map(error => ({ ...error })),
      savedCommandErrors: this.#savedCommandErrors.map(error => ({ ...error })),
      savedCommands: this.listSavedCommands(),
      sessions: this.list(),
      activity: this.getActivity()
    };
  }

  getActivity(options = {}) {
    if (options === null || typeof options !== "object" || Array.isArray(options)) {
      throw new TypeError("getActivity options must be an object");
    }
    const afterSequence = Number.isInteger(options.afterSequence) && options.afterSequence >= 0
      ? options.afterSequence
      : null;
    const limit = Number.isInteger(options.limit) && options.limit > 0
      ? Math.min(options.limit, this.#activityLimit)
      : Math.min(50, this.#activityLimit);
    const available = afterSequence === null
      ? this.#activityEvents
      : this.#activityEvents.filter(event => event.sequence > afterSequence);
    const selected = afterSequence === null
      ? available.slice(-limit)
      : available.slice(0, limit);
    const gap = afterSequence !== null && afterSequence < this.#activityDroppedThrough;
    const firstSelectedSequence = selected[0]?.sequence ?? null;

    return {
      contractVersion: ENGINE_CONTRACT_VERSION,
      latestSequence: this.#eventSequence,
      latestActivitySequence: this.#activityEvents.at(-1)?.sequence ?? null,
      oldestActivitySequence: this.#activityEvents[0]?.sequence ?? null,
      droppedThroughSequence: this.#activityDroppedThrough,
      gap,
      hasEarlier: this.#activityDroppedThrough > 0 || (
        firstSelectedSequence === null
          ? this.#activityEvents.length > 0
          : this.#activityEvents[0]?.sequence < firstSelectedSequence
      ),
      hasMore: afterSequence !== null && available.length > selected.length,
      events: selected.map(event => this.#cloneContractValue(event))
    };
  }

  subscribe(scope, callback) {
    if (typeof scope === "function") {
      callback = scope;
      scope = "all";
    }
    if (typeof callback !== "function") {
      throw new TypeError("subscribe requires a callback");
    }

    const listener = event => {
      if (scope === "all" || scope === event.id || scope === `session:${event.id}`) {
        try {
          callback(event);
        } catch (error) {
          this.#reportSubscriberError(error, { scope, event });
        }
      }
    };

    this.on("engine:event", listener);
    return () => this.off("engine:event", listener);
  }

  write(id, data) {
    return this.#sessionEngine.write(id, data);
  }

  resize(id, cols, rows) {
    return this.#sessionEngine.resize(id, cols, rows);
  }

  attachRawStream(id) {
    const stream = this.#sessionEngine.attachRawStream(id);
    if (!stream) {
      const snapshot = this.getSnapshot(id);
      this.#publish("attach:rejected", {
        id,
        reason: snapshot ? snapshot.status : "missing"
      });
    }
    return stream;
  }

  start(id) {
    return this.#runSessionOperation(id, () => this.#sessionEngine.start(id));
  }

  restart(id) {
    return this.#runSessionOperation(id, () => this.#sessionEngine.restart(id));
  }

  kill(id) {
    if (this.#sessionOperations.has(id)) {
      return { ok: false, error: "a lifecycle operation is already in progress for this session" };
    }
    return this.#sessionEngine.kill(id);
  }

  rename(id, name) {
    const snapshot = this.getSnapshot(id);
    if (!snapshot) return { ok: false, error: `no such session: ${id}` };
    const nextName = String(name || "").trim();
    if (!nextName) return { ok: false, error: "name cannot be empty" };
    if (nextName.length > 80) return { ok: false, error: "name cannot exceed 80 characters" };

    if (this.#workspaceStore) {
      try {
        if (!this.#workspaceStore.rename(id, nextName)) {
          return { ok: false, error: `session is missing from workspace configuration: ${id}` };
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        this.#publish("workspace:persist-error", { operation: "rename", id, error });
        return { ok: false, error };
      }
    }

    const result = this.#sessionEngine.rename(id, nextName);
    if (result.ok || !this.#workspaceStore) return result;

    try {
      this.#workspaceStore.rename(id, snapshot.name);
    } catch (rollbackError) {
      const rollback = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
      this.#publish("workspace:persist-error", { operation: "rename-rollback", id, error: rollback });
      return { ok: false, error: `${result.error}; workspace rollback failed: ${rollback}` };
    }
    return result;
  }

  setAutoStart(id, enabled) {
    return this.#runSessionOperation(id, () => {
      if (typeof enabled !== "boolean") {
        return { ok: false, error: "autoStart must be a boolean" };
      }
      const snapshot = this.getSnapshot(id);
      if (!snapshot) return { ok: false, error: `no such session: ${id}` };
      if (snapshot.autoStart === enabled) return { ok: true };

      if (this.#workspaceStore) {
        try {
          if (!this.#workspaceStore.setAutoStart(id, enabled)) {
            return { ok: false, error: `session is missing from workspace configuration: ${id}` };
          }
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          this.#publish("workspace:persist-error", { operation: "autostart", id, error });
          return { ok: false, error };
        }
      }

      const result = this.#sessionEngine.setAutoStart(id, enabled);
      if (result.ok || !this.#workspaceStore) return result;

      try {
        this.#workspaceStore.setAutoStart(id, snapshot.autoStart);
      } catch (rollbackError) {
        const rollback = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        this.#publish("workspace:persist-error", {
          operation: "autostart-rollback",
          id,
          error: rollback
        });
        return { ok: false, error: `${result.error}; workspace rollback failed: ${rollback}` };
      }
      return result;
    });
  }

  reconfigure(id, patch) {
    return this.#runSessionOperation(id, () => {
      const snapshot = this.getSnapshot(id);
      if (!snapshot) return { ok: false, error: `no such session: ${id}` };
      if (snapshot.isAlive) {
        return { ok: false, error: "stop the session before changing its configuration" };
      }
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        return { ok: false, error: "configuration patch must be an object" };
      }
      if (Object.hasOwn(patch, "id") && patch.id !== id) {
        return { ok: false, error: "session id cannot be changed" };
      }

      const allowedFields = new Set([
        "id", "name", "command", "args", "cwd", "env", "powershellCompatibility", "autoStart"
      ]);
      const unsupported = Object.keys(patch).filter(field => !allowedFields.has(field));
      if (unsupported.length) {
        return { ok: false, error: `unsupported configuration field: ${unsupported[0]}` };
      }

      const previousDefinition = this.#workspaceStore?.getDefinition(id) || this.#sessionEngine.getDefinition(id);
      if (!previousDefinition) return { ok: false, error: `no such session: ${id}` };
      const merged = { ...previousDefinition };
      for (const field of allowedFields) {
        if (field !== "id" && Object.hasOwn(patch, field)) merged[field] = patch[field];
      }
      merged.id = id;

      let normalized;
      try {
        normalized = normalizeSessionDefinition(merged, {
          baseDir: this.#workspaceStore?.directory || process.cwd()
        });
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }

      if (this.#workspaceStore) {
        try {
          if (!this.#workspaceStore.replace(id, normalized.persisted)) {
            return { ok: false, error: `session is missing from workspace configuration: ${id}` };
          }
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          this.#publish("workspace:persist-error", { operation: "reconfigure", id, error });
          return { ok: false, error };
        }
      }

      const result = this.#sessionEngine.reconfigure(id, normalized.runtime);
      if (result.ok || !this.#workspaceStore) return result;

      try {
        this.#workspaceStore.replace(id, previousDefinition);
      } catch (rollbackError) {
        const rollback = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        this.#publish("workspace:persist-error", {
          operation: "reconfigure-rollback",
          id,
          error: rollback
        });
        return { ok: false, error: `${result.error}; workspace rollback failed: ${rollback}` };
      }
      return result;
    });
  }

  acknowledge(id) {
    return this.#sessionEngine.acknowledge(id);
  }

  async remove(id) {
    return this.#runSessionOperation(id, async () => {
      if (!this.#workspaceStore) return this.#sessionEngine.remove(id);

      const wasAlive = this.getSnapshot(id)?.isAlive || false;
      const stopped = await this.#sessionEngine.stopForRemoval(id);
      if (!stopped.ok) return stopped;

      try {
        if (!this.#workspaceStore.remove(id)) {
          return { ok: false, error: `session is missing from workspace configuration: ${id}` };
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        this.#publish("workspace:persist-error", { operation: "remove", id, error });
        return { ok: false, error, sessionStopped: wasAlive };
      }

      return this.#sessionEngine.finalizeRemove(id);
    });
  }

  #runSessionOperation(id, operation) {
    if (this.#stopping) return Promise.resolve({ ok: false, error: "the engine is stopping" });

    const previous = this.#sessionOperations.get(id) || Promise.resolve();
    const current = previous
      .catch(() => {})
      .then(operation);
    this.#sessionOperations.set(id, current);
    current.then(
      () => {
        if (this.#sessionOperations.get(id) === current) this.#sessionOperations.delete(id);
      },
      () => {
        if (this.#sessionOperations.get(id) === current) this.#sessionOperations.delete(id);
      }
    );
    return current;
  }

  #cloneContractValue(value) {
    return JSON.parse(JSON.stringify(value));
  }

  #deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    for (const nested of Object.values(value)) this.#deepFreeze(nested);
    return Object.freeze(value);
  }

  #activityRecord(envelope) {
    const record = this.#cloneContractValue(envelope);
    if (record.type === "project:load-errors") {
      record.errorCount = Array.isArray(record.errors) ? record.errors.length : 0;
      delete record.errors;
    }
    if (record.type === "project:command-errors") {
      record.errorCount = Array.isArray(record.errors) ? record.errors.length : 0;
      delete record.errors;
    }
    if (["session:created", "session:reconfigured"].includes(record.type) && record.session) {
      record.session = {
        id: record.session.id,
        name: record.session.name,
        status: record.session.status,
        autoStart: record.session.autoStart
      };
    }
    return record;
  }

  #persistableActivityRecord(event) {
    const record = this.#cloneContractValue(event);
    if (record.type === "session:supervision") {
      delete record.attentionReason;
    }
    return record;
  }

  #activityPersistenceState() {
    return {
      contractVersion: ENGINE_CONTRACT_VERSION,
      latestSequence: this.#eventSequence,
      droppedThroughSequence: this.#activityDroppedThrough,
      events: this.#activityEvents.map(event => this.#persistableActivityRecord(event))
    };
  }

  #scheduleActivityPersist() {
    if (!this.#activityStore) return;
    this.#activityDirty = true;
    if (this.#activityPersistDelayMs === 0) {
      this.#persistActivityNow();
      return;
    }
    if (this.#activityPersistTimer) return;
    this.#activityPersistTimer = setTimeout(() => {
      this.#activityPersistTimer = null;
      this.#persistActivityNow();
    }, this.#activityPersistDelayMs);
    this.#activityPersistTimer.unref?.();
  }

  #persistActivityNow(reportError = true) {
    if (this.#activityPersistTimer) {
      clearTimeout(this.#activityPersistTimer);
      this.#activityPersistTimer = null;
    }
    if (!this.#activityStore || !this.#activityDirty) return { ok: true };

    try {
      this.#activityStore.save(this.#activityPersistenceState());
      this.#activityDirty = false;
      this.#lastActivityPersistError = null;
      return { ok: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      if (
        reportError &&
        error !== this.#lastActivityPersistError &&
        !this.#reportingActivityPersistError
      ) {
        this.#lastActivityPersistError = error;
        this.#reportingActivityPersistError = true;
        try {
          this.#publish("activity:persist-error", { error }, { error }, { persist: false });
        } finally {
          this.#reportingActivityPersistError = false;
        }
      }
      return { ok: false, error };
    }
  }

  #publish(type, payload = {}, observedPayload = payload, options = {}) {
    const envelopeValue = {
      ...payload,
      contractVersion: ENGINE_CONTRACT_VERSION,
      sequence: ++this.#eventSequence,
      timestamp: Date.now(),
      type
    };
    const envelope = type === "session:output"
      ? Object.freeze(envelopeValue)
      : this.#deepFreeze(this.#cloneContractValue(envelopeValue));

    const shouldPersist = type !== "session:output" && options.persist !== false;
    if (type !== "session:output") {
      this.#activityEvents.push(this.#activityRecord(envelope));
      if (this.#activityEvents.length > this.#activityLimit) {
        const removed = this.#activityEvents.splice(0, this.#activityEvents.length - this.#activityLimit);
        this.#activityDroppedThrough = removed.at(-1)?.sequence ?? this.#activityDroppedThrough;
      }
    }

    this.#publicationQueue.push({ type, payload: observedPayload, envelope });
    if (this.#publishing) {
      if (shouldPersist) this.#scheduleActivityPersist();
      return envelope;
    }

    this.#publishing = true;
    try {
      while (this.#publicationQueue.length) {
        const next = this.#publicationQueue.shift();
        this.#emitObserved("engine:event", next.envelope);
        this.#emitObserved(next.type, next.payload);
      }
    } finally {
      this.#publishing = false;
    }
    if (shouldPersist) this.#scheduleActivityPersist();
    return envelope;
  }

  #emitObserved(type, payload) {
    for (const listener of this.rawListeners(type)) {
      try {
        listener.call(this, payload);
      } catch (error) {
        this.#reportSubscriberError(error, { type, payload });
      }
    }
  }

  #reportSubscriberError(error, context) {
    try {
      this.#onSubscriberError(error, context);
    } catch (reportingError) {
      // Observers must never be able to break PTY ownership or lifecycle work.
    }
  }

  stopAll(timeoutMs) {
    if (this.#stopPromise) return this.#stopPromise;
    this.#stopping = true;
    this.#stopPromise = (async () => {
      await Promise.allSettled([...this.#sessionOperations.values()]);
      const result = await this.#sessionEngine.stopAll(timeoutMs);
      this.#persistActivityNow();
      if (!result.ok) {
        this.#stopping = false;
        this.#stopPromise = null;
      }
      return result;
    })();
    return this.#stopPromise;
  }

  dispose() {
    for (const [type, listener] of this.#engineBindings) {
      this.#sessionEngine.off(type, listener);
    }
    this.#engineBindings = [];
    this.#persistActivityNow(false);
    this.#stopping = true;
    this.#sessionOperations.clear();
    this.#savedCommands.clear();
    this.#savedCommandErrors = [];
    this.#activityEvents = [];
    if (this.#activityPersistTimer) clearTimeout(this.#activityPersistTimer);
    this.#activityPersistTimer = null;
    this.#publicationQueue = [];
    this.#sessionEngine.dispose();
    this.removeAllListeners();
  }
}

module.exports = { EngineAPI, ENGINE_EVENTS, ENGINE_CONTRACT_VERSION, MAX_ACTIVITY_EVENTS };
