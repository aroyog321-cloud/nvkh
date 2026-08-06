const crypto = require("node:crypto");
const { CommandRouter } = require("../engine/commandRouter.cjs");

const PROTOCOL_VERSION = 1;
const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_TERMINAL_INPUT_BYTES = 64 * 1024;
const MAX_TERMINAL_REPLAY_BYTES = 1024 * 1024;
const MAX_TERMINAL_QUEUE_BYTES = 1024 * 1024;
const MAX_TERMINAL_BATCH_BYTES = 64 * 1024;
const MAX_EVENT_QUEUE = 1000;
const MAX_TERMINAL_DIMENSION = 1000;
const MAX_OPEN_TERMINALS = 64;

const METHODS = Object.freeze([
  "system.hello",
  "state.get",
  "events.activate",
  "activity.get",
  "workspace.get",
  "session.get",
  "session.configuration.get",
  "preset.list",
  "action.dispatch",
  "terminal.open",
  "terminal.activate",
  "terminal.write",
  "terminal.resize",
  "terminal.close",
  "system.shutdown"
]);

class ProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProtocolError";
    this.code = code;
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function byteLength(value) {
  return Buffer.byteLength(String(value), "utf8");
}

function splitUtf8(value, maxBytes) {
  const text = String(value);
  if (byteLength(text) <= maxBytes) return text ? [text] : [];

  const encoded = Buffer.from(text, "utf8");
  const chunks = [];
  let offset = 0;
  while (offset < encoded.length) {
    let end = Math.min(offset + maxBytes, encoded.length);
    if (end < encoded.length) {
      // Move a boundary at most three bytes so a chunk never begins in the
      // middle of a UTF-8 sequence. This keeps large output bursts linear in
      // the number of batches instead of iterating every JavaScript character.
      while (end > offset && (encoded[end] & 0xc0) === 0x80) end--;
    }
    if (end === offset) end = Math.min(offset + maxBytes, encoded.length);
    chunks.push(encoded.subarray(offset, end).toString("utf8"));
    offset = end;
  }
  return chunks;
}

class BoundedOutputQueue {
  constructor(maxBytes = MAX_TERMINAL_QUEUE_BYTES) {
    this.maxBytes = maxBytes;
    this.chunks = [];
    this.bytes = 0;
    this.droppedBytes = 0;
  }

  append(data) {
    for (const chunk of splitUtf8(data, MAX_TERMINAL_BATCH_BYTES)) {
      const bytes = byteLength(chunk);
      this.chunks.push({ data: chunk, bytes });
      this.bytes += bytes;
    }
    while (this.bytes > this.maxBytes && this.chunks.length) {
      const removed = this.chunks.shift();
      this.bytes -= removed.bytes;
      this.droppedBytes += removed.bytes;
    }
  }

  clear() {
    this.chunks = [];
    this.bytes = 0;
    this.droppedBytes = 0;
  }

  drainBatch() {
    if (!this.chunks.length) return null;
    const selected = [];
    let selectedBytes = 0;
    while (this.chunks.length) {
      const next = this.chunks[0];
      if (selected.length && selectedBytes + next.bytes > MAX_TERMINAL_BATCH_BYTES) break;
      this.chunks.shift();
      this.bytes -= next.bytes;
      selected.push(next.data);
      selectedBytes += next.bytes;
    }
    const droppedBytes = this.droppedBytes;
    this.droppedBytes = 0;
    return { data: selected.join(""), droppedBytes };
  }
}

function requestIdFrom(value) {
  return isPlainObject(value) && typeof value.id === "string" ? value.id : null;
}

function decodeRequest(input) {
  let value = input;
  let encodedBytes;

  if (Buffer.isBuffer(input) || typeof input === "string") {
    encodedBytes = Buffer.isBuffer(input) ? input.length : byteLength(input);
    if (encodedBytes > MAX_REQUEST_BYTES) {
      throw new ProtocolError("REQUEST_TOO_LARGE", `request cannot exceed ${MAX_REQUEST_BYTES} bytes`);
    }
    try {
      value = JSON.parse(Buffer.isBuffer(input) ? input.toString("utf8") : input);
    } catch (error) {
      throw new ProtocolError("INVALID_REQUEST", "request must contain valid JSON");
    }
  }

  if (!isPlainObject(value)) {
    throw new ProtocolError("INVALID_REQUEST", "request must be an object");
  }
  if (encodedBytes === undefined) {
    try {
      encodedBytes = byteLength(JSON.stringify(value));
    } catch (error) {
      throw new ProtocolError("INVALID_REQUEST", "request must be JSON-serializable");
    }
    if (encodedBytes > MAX_REQUEST_BYTES) {
      throw new ProtocolError("REQUEST_TOO_LARGE", `request cannot exceed ${MAX_REQUEST_BYTES} bytes`);
    }
  }

  const unsupported = Object.keys(value).filter(key => !["version", "id", "method", "params"].includes(key));
  if (unsupported.length) {
    throw new ProtocolError("INVALID_REQUEST", `unsupported request field: ${unsupported[0]}`);
  }
  if (value.version !== PROTOCOL_VERSION) {
    throw new ProtocolError("VERSION_MISMATCH", `unsupported protocol version: ${value.version}`);
  }
  if (typeof value.id !== "string" || !value.id || value.id.length > 128) {
    throw new ProtocolError("INVALID_REQUEST", "request id must be a non-empty string of at most 128 characters");
  }
  if (typeof value.method !== "string" || !value.method || value.method.length > 128) {
    throw new ProtocolError("INVALID_REQUEST", "method must be a non-empty string");
  }
  if (!isPlainObject(value.params)) {
    throw new ProtocolError("INVALID_REQUEST", "params must be an object");
  }
  return value;
}

function requireString(params, field) {
  const value = params[field];
  if (typeof value !== "string" || !value) {
    throw new ProtocolError("INVALID_PARAMS", `${field} must be a non-empty string`);
  }
  return value;
}

function terminalReplay(engineApi, sessionId, rawReplay) {
  const replay = typeof rawReplay === "string" ? { data: rawReplay, complete: true } : rawReplay;
  const rawData = typeof replay?.data === "string" ? replay.data : "";
  const complete = replay?.complete !== false;
  let source = "raw";
  let data = rawData;

  if (!complete) {
    source = "snapshot";
    const snapshot = engineApi.getSnapshot(sessionId);
    data = Array.isArray(snapshot?.lines) ? snapshot.lines.join("\r\n") : "";
    if (data) data += "\r\n";
  }

  const queue = new BoundedOutputQueue(MAX_TERMINAL_REPLAY_BYTES);
  queue.append(data);
  const retained = [];
  let droppedBytes = 0;
  let batch;
  while ((batch = queue.drainBatch())) {
    retained.push(batch.data);
    droppedBytes += batch.droppedBytes;
  }
  return {
    data: retained.join(""),
    byteLength: retained.reduce((total, chunk) => total + byteLength(chunk), 0),
    complete: complete && droppedBytes === 0,
    source,
    droppedBytes
  };
}

function createProtocolConnection(engineApi, options = {}) {
  if (!engineApi || typeof engineApi.subscribe !== "function") {
    throw new TypeError("createProtocolConnection requires an EngineAPI-compatible object");
  }
  if (typeof options.send !== "function") {
    throw new TypeError("createProtocolConnection requires a send function");
  }

  const router = new CommandRouter(engineApi);
  const send = options.send;
  const onShutdown = options.onShutdown;
  const terminalStreams = new Map();
  let disposed = false;
  let eventMode = "queued";
  let snapshotSequence = null;
  let eventQueue = [];
  let eventDroppedThrough = 0;

  function safeSend(message) {
    if (disposed) return false;
    try {
      const result = send(message);
      if (result && typeof result.catch === "function") result.catch(() => {});
      return true;
    } catch (error) {
      return false;
    }
  }

  function eventFrame(event) {
    return { version: PROTOCOL_VERSION, type: "engine:event", event };
  }

  function onEngineEvent(event) {
    if (disposed || event?.type === "session:output") return;
    if (eventMode === "active") {
      safeSend(eventFrame(event));
      return;
    }
    eventQueue.push(event);
    if (eventQueue.length > MAX_EVENT_QUEUE) {
      const removed = eventQueue.splice(0, eventQueue.length - MAX_EVENT_QUEUE);
      eventDroppedThrough = removed.at(-1)?.sequence || eventDroppedThrough;
    }
  }

  const unsubscribeEvents = engineApi.subscribe("all", onEngineEvent);

  function closeTerminal(streamId) {
    const state = terminalStreams.get(streamId);
    if (!state) return false;
    terminalStreams.delete(streamId);
    state.closed = true;
    if (state.flushHandle) clearImmediate(state.flushHandle);
    state.flushHandle = null;
    for (const cleanup of [state.offData, state.offExit]) {
      try { cleanup?.(); } catch (error) { /* Cleanup is best effort. */ }
    }
    state.offData = null;
    state.offExit = null;
    state.output.clear();
    return true;
  }

  function requireTerminal(params) {
    const streamId = requireString(params, "streamId");
    const state = terminalStreams.get(streamId);
    if (!state || state.closed) {
      throw new ProtocolError("TERMINAL_STALE", `terminal stream is stale or missing: ${streamId}`);
    }
    if (params.terminalEpoch !== undefined && params.terminalEpoch !== state.terminalEpoch) {
      throw new ProtocolError("TERMINAL_STALE", `terminal stream epoch is stale: ${streamId}`);
    }
    return state;
  }

  function sendTerminalExit(state) {
    if (!state.active || !state.exitInfo || state.exitSent || state.closed) return;
    state.exitSent = true;
    safeSend({
      version: PROTOCOL_VERSION,
      type: "terminal:exit",
      streamId: state.streamId,
      terminalEpoch: state.terminalEpoch,
      sessionId: state.sessionId,
      exit: state.exitInfo
    });
  }

  function flushTerminal(state) {
    if (state.closed || !state.active) return;
    state.flushHandle = null;
    let batch;
    while ((batch = state.output.drainBatch())) {
      if (batch.droppedBytes) {
        safeSend({
          version: PROTOCOL_VERSION,
          type: "terminal:overflow",
          streamId: state.streamId,
          terminalEpoch: state.terminalEpoch,
          sessionId: state.sessionId,
          droppedBytes: batch.droppedBytes
        });
      }
      safeSend({
        version: PROTOCOL_VERSION,
        type: "terminal:data",
        streamId: state.streamId,
        terminalEpoch: state.terminalEpoch,
        sessionId: state.sessionId,
        data: batch.data
      });
    }
    sendTerminalExit(state);
  }

  function scheduleTerminalFlush(state) {
    if (state.closed || !state.active || state.flushHandle) return;
    state.flushHandle = setImmediate(() => flushTerminal(state));
    state.flushHandle.unref?.();
  }

  function prepareEventActivation(afterSequence) {
    if (!Number.isInteger(afterSequence) || afterSequence < 0) {
      throw new ProtocolError("INVALID_PARAMS", "afterSequence must be a non-negative integer");
    }
    if (snapshotSequence === null) {
      throw new ProtocolError("SNAPSHOT_REQUIRED", "state.get must be called before events.activate");
    }
    if (afterSequence !== snapshotSequence) {
      throw new ProtocolError("STALE_SNAPSHOT", "afterSequence must match the latest state snapshot sequence");
    }
    if (eventDroppedThrough > afterSequence) {
      throw new ProtocolError("EVENT_GAP", "queued events overflowed; obtain a new state snapshot");
    }
    eventMode = "flushing";
    return () => {
      while (eventQueue.length) {
        const event = eventQueue.shift();
        if (event.sequence > afterSequence) safeSend(eventFrame(event));
      }
      eventMode = "active";
    };
  }

  async function dispatchMethod(method, params) {
    switch (method) {
      case "system.hello": {
        const state = engineApi.getState();
        return {
          result: {
            protocolVersion: PROTOCOL_VERSION,
            engineContractVersion: state.contractVersion,
            methods: [...METHODS],
            limits: {
              maxRequestBytes: MAX_REQUEST_BYTES,
              maxTerminalInputBytes: MAX_TERMINAL_INPUT_BYTES,
              maxTerminalQueueBytes: MAX_TERMINAL_QUEUE_BYTES,
              maxTerminalDimension: MAX_TERMINAL_DIMENSION
            }
          }
        };
      }
      case "state.get": {
        const state = engineApi.getState();
        snapshotSequence = state.sequence;
        eventMode = "queued";
        return { result: state };
      }
      case "events.activate": {
        const afterSend = prepareEventActivation(params.afterSequence);
        return {
          result: { active: true, afterSequence: params.afterSequence },
          afterSend
        };
      }
      case "activity.get":
        return { result: engineApi.getActivity(params) };
      case "workspace.get":
        return { result: engineApi.getWorkspace() };
      case "session.get": {
        const sessionId = requireString(params, "sessionId");
        const session = engineApi.getSnapshot(sessionId);
        if (!session) throw new ProtocolError("NOT_FOUND", `no such session: ${sessionId}`);
        return { result: session };
      }
      case "session.configuration.get": {
        const sessionId = requireString(params, "sessionId");
        const configuration = engineApi.getSessionConfiguration(sessionId);
        if (!configuration) throw new ProtocolError("NOT_FOUND", `no such session: ${sessionId}`);
        return { result: configuration };
      }
      case "preset.list":
        return { result: engineApi.listSavedCommands() };
      case "action.dispatch": {
        const sessionId = params.sessionId === null || params.sessionId === undefined
          ? null
          : requireString(params, "sessionId");
        if (!isPlainObject(params.action) || typeof params.action.type !== "string") {
          throw new ProtocolError("INVALID_PARAMS", "action must be an object with a type");
        }
        const riskTier = router.riskTier(params.action.type);
        if (riskTier === "destructive") {
          const expected = `confirm:${params.action.type}:${sessionId}`;
          if (params.confirmation !== expected) {
            throw new ProtocolError("CONFIRMATION_REQUIRED", `confirmation must equal ${expected}`);
          }
        }
        const result = await router.dispatch(sessionId, params.action);
        if (!result?.ok) {
          throw new ProtocolError("ACTION_FAILED", result?.error || "action failed");
        }
        return { result };
      }
      case "terminal.open": {
        const sessionId = requireString(params, "sessionId");
        if (terminalStreams.size >= MAX_OPEN_TERMINALS) {
          throw new ProtocolError("TERMINAL_LIMIT", "too many terminal streams are open");
        }
        if ([...terminalStreams.values()].some(state => !state.closed && state.sessionId === sessionId)) {
          throw new ProtocolError(
            "TERMINAL_ALREADY_OPEN",
            `a terminal stream is already open for session: ${sessionId}`
          );
        }
        const rawStream = engineApi.attachRawStream(sessionId);
        if (!rawStream) {
          throw new ProtocolError("TERMINAL_NOT_RUNNING", `session is not running: ${sessionId}`);
        }

        const streamId = crypto.randomUUID();
        const state = {
          streamId,
          terminalEpoch: crypto.randomUUID(),
          sessionId,
          rawStream,
          output: new BoundedOutputQueue(),
          active: false,
          closed: false,
          exitInfo: null,
          exitSent: false,
          flushHandle: null,
          offData: null,
          offExit: null
        };
        terminalStreams.set(streamId, state);

        try {
          state.offData = rawStream.onData(data => {
            if (state.closed) return;
            state.output.append(String(data));
            scheduleTerminalFlush(state);
          });
          state.offExit = rawStream.onExit(exit => {
            if (state.closed) return;
            state.exitInfo = isPlainObject(exit) ? { ...exit } : {};
            try { state.offData?.(); } catch (error) { /* Best effort. */ }
            try { state.offExit?.(); } catch (error) { /* Best effort. */ }
            state.offData = null;
            state.offExit = null;
            if (state.active) {
              if (state.flushHandle) clearImmediate(state.flushHandle);
              state.flushHandle = null;
              flushTerminal(state);
            }
          });
          const replay = terminalReplay(engineApi, sessionId, rawStream.replay?.());
          // Session output is appended to the engine replay buffer before raw
          // listeners observe it, so anything captured during replay is already
          // represented by the replay/snapshot checkpoint.
          state.output.clear();
          return {
            result: {
              streamId,
              terminalEpoch: state.terminalEpoch,
              sessionId,
              replay
            }
          };
        } catch (error) {
          closeTerminal(streamId);
          throw new ProtocolError(
            "TERMINAL_ERROR",
            error instanceof Error ? error.message : String(error)
          );
        }
      }
      case "terminal.activate": {
        const state = requireTerminal(params);
        state.active = true;
        return {
          result: { active: true, streamId: state.streamId, terminalEpoch: state.terminalEpoch },
          afterSend: () => flushTerminal(state)
        };
      }
      case "terminal.write": {
        const state = requireTerminal(params);
        if (state.exitInfo) {
          throw new ProtocolError("TERMINAL_NOT_RUNNING", "terminal has exited");
        }
        if (typeof params.data !== "string") {
          throw new ProtocolError("INVALID_PARAMS", "terminal data must be a string");
        }
        if (byteLength(params.data) > MAX_TERMINAL_INPUT_BYTES) {
          throw new ProtocolError(
            "TERMINAL_INPUT_TOO_LARGE",
            `terminal input cannot exceed ${MAX_TERMINAL_INPUT_BYTES} bytes`
          );
        }
        if (!state.rawStream.write(params.data)) {
          throw new ProtocolError("TERMINAL_NOT_RUNNING", "terminal is not running or write failed");
        }
        return { result: { written: true } };
      }
      case "terminal.resize": {
        const state = requireTerminal(params);
        if (state.exitInfo) {
          throw new ProtocolError("TERMINAL_NOT_RUNNING", "terminal has exited");
        }
        const { cols, rows } = params;
        if (
          !Number.isInteger(cols) || !Number.isInteger(rows) ||
          cols < 1 || rows < 1 ||
          cols > MAX_TERMINAL_DIMENSION || rows > MAX_TERMINAL_DIMENSION
        ) {
          throw new ProtocolError(
            "INVALID_PARAMS",
            `terminal dimensions must be integers between 1 and ${MAX_TERMINAL_DIMENSION}`
          );
        }
        if (!state.rawStream.resize(cols, rows)) {
          throw new ProtocolError("TERMINAL_NOT_RUNNING", "terminal is not running or resize failed");
        }
        return { result: { resized: true, cols, rows } };
      }
      case "terminal.close": {
        const state = requireTerminal(params);
        closeTerminal(state.streamId);
        return { result: { closed: true } };
      }
      case "system.shutdown": {
        if (typeof onShutdown !== "function") {
          throw new ProtocolError("UNAVAILABLE", "shutdown is not available on this connection");
        }
        const result = await onShutdown();
        if (result && result.ok === false) {
          throw new ProtocolError("SHUTDOWN_FAILED", result.error || "shutdown failed");
        }
        return { result: result === undefined ? { accepted: true } : result };
      }
      default:
        throw new ProtocolError("METHOD_NOT_FOUND", `unknown protocol method: ${method}`);
    }
  }

  async function handle(input) {
    let request;
    let response;
    let afterSend = null;
    try {
      if (disposed) throw new ProtocolError("CONNECTION_CLOSED", "protocol connection is closed");
      request = decodeRequest(input);
      const dispatched = await dispatchMethod(request.method, request.params);
      response = {
        version: PROTOCOL_VERSION,
        id: request.id,
        ok: true,
        result: dispatched.result
      };
      afterSend = dispatched.afterSend || null;
    } catch (error) {
      const protocolError = error instanceof ProtocolError
        ? error
        : new ProtocolError("INTERNAL_ERROR", error instanceof Error ? error.message : String(error));
      response = {
        version: PROTOCOL_VERSION,
        id: request?.id || requestIdFrom(input),
        ok: false,
        error: { code: protocolError.code, message: protocolError.message }
      };
    }

    safeSend(response);
    afterSend?.();
    return response;
  }

  function dispose() {
    if (disposed) return false;
    try { unsubscribeEvents?.(); } catch (error) { /* Best effort. */ }
    for (const streamId of [...terminalStreams.keys()]) closeTerminal(streamId);
    eventQueue = [];
    disposed = true;
    return true;
  }

  return { handle, dispose };
}

module.exports = {
  PROTOCOL_VERSION,
  METHODS,
  MAX_REQUEST_BYTES,
  MAX_TERMINAL_INPUT_BYTES,
  MAX_TERMINAL_REPLAY_BYTES,
  MAX_TERMINAL_QUEUE_BYTES,
  MAX_TERMINAL_BATCH_BYTES,
  MAX_EVENT_QUEUE,
  MAX_TERMINAL_DIMENSION,
  ProtocolError,
  createProtocolConnection
};
