const fs = require("node:fs");
const path = require("node:path");

const ACTIVITY_STORE_VERSION = 1;
const MAX_ACTIVITY_FILE_BYTES = 5 * 1024 * 1024;

class ActivityStoreError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "ActivityStoreError";
  }
}

function activityPathFor(workspacePath) {
  return `${path.resolve(workspacePath)}.activity.json`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateEvent(event, contractVersion, previousSequence) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new ActivityStoreError("activity events must be objects");
  }
  if (typeof event.type !== "string" || !event.type || event.type === "session:output") {
    throw new ActivityStoreError("activity event type is invalid");
  }
  if (!Number.isInteger(event.sequence) || event.sequence <= previousSequence) {
    throw new ActivityStoreError("activity event sequences must be strictly increasing");
  }
  if (!Number.isInteger(event.timestamp) || event.timestamp < 0) {
    throw new ActivityStoreError("activity event timestamp is invalid");
  }
  if (event.contractVersion !== contractVersion) {
    throw new ActivityStoreError(`unsupported activity contract version: ${event.contractVersion}`);
  }
}

class ActivityStore {
  constructor(workspacePath) {
    this.filePath = activityPathFor(workspacePath);
  }

  load({ contractVersion, maxEvents }) {
    if (!Number.isInteger(maxEvents) || maxEvents < 1) {
      throw new TypeError("maxEvents must be a positive integer");
    }
    if (!fs.existsSync(this.filePath)) {
      return { latestSequence: 0, droppedThroughSequence: 0, events: [] };
    }

    let raw;
    try {
      if (fs.statSync(this.filePath).size > MAX_ACTIVITY_FILE_BYTES) {
        throw new ActivityStoreError("activity history exceeds the 5 MB safety limit");
      }
      raw = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    } catch (error) {
      if (error instanceof ActivityStoreError) throw error;
      const reason = error instanceof SyntaxError ? "invalid JSON" : error.message;
      throw new ActivityStoreError(`unable to load activity history: ${reason}`, { cause: error });
    }

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new ActivityStoreError("activity history root must be an object");
    }
    if (raw.version !== ACTIVITY_STORE_VERSION) {
      throw new ActivityStoreError(`unsupported activity store version: ${raw.version}`);
    }
    if (raw.contractVersion !== contractVersion) {
      throw new ActivityStoreError(`unsupported activity contract version: ${raw.contractVersion}`);
    }
    if (!Array.isArray(raw.events)) {
      throw new ActivityStoreError("activity history events must be an array");
    }

    let previousSequence = 0;
    for (const event of raw.events) {
      validateEvent(event, contractVersion, previousSequence);
      previousSequence = event.sequence;
    }

    const latestSequence = Number.isInteger(raw.latestSequence) && raw.latestSequence >= previousSequence
      ? raw.latestSequence
      : previousSequence;
    let droppedThroughSequence = Number.isInteger(raw.droppedThroughSequence) && raw.droppedThroughSequence >= 0
      ? raw.droppedThroughSequence
      : 0;
    if (droppedThroughSequence > latestSequence) {
      throw new ActivityStoreError("activity dropped-through sequence exceeds the latest sequence");
    }
    if (raw.events.length && droppedThroughSequence >= raw.events[0].sequence) {
      throw new ActivityStoreError("activity dropped-through sequence overlaps retained events");
    }
    const events = raw.events.slice(-maxEvents).map(clone);
    if (raw.events.length > events.length) {
      droppedThroughSequence = Math.max(
        droppedThroughSequence,
        raw.events[raw.events.length - events.length - 1]?.sequence || 0
      );
    }

    return { latestSequence, droppedThroughSequence, events };
  }

  save({ contractVersion, latestSequence, droppedThroughSequence, events }) {
    const raw = {
      version: ACTIVITY_STORE_VERSION,
      contractVersion,
      latestSequence,
      droppedThroughSequence,
      events
    };
    const directory = path.dirname(this.filePath);
    const temporaryPath = path.join(
      directory,
      `.${path.basename(this.filePath)}.${process.pid}.${Date.now()}.tmp`
    );
    let descriptor;

    try {
      descriptor = fs.openSync(temporaryPath, "wx", 0o600);
      fs.writeFileSync(descriptor, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.renameSync(temporaryPath, this.filePath);
    } catch (error) {
      if (descriptor !== undefined) {
        try {
          fs.closeSync(descriptor);
        } catch (closeError) {
          // The original persistence error is more useful.
        }
      }
      try {
        fs.unlinkSync(temporaryPath);
      } catch (cleanupError) {
        // The temporary file may never have been created.
      }
      throw new ActivityStoreError(`unable to save activity history: ${error.message}`, { cause: error });
    }
  }
}

function openActivityStore(workspacePath) {
  return new ActivityStore(workspacePath);
}

module.exports = {
  ACTIVITY_STORE_VERSION,
  MAX_ACTIVITY_FILE_BYTES,
  ActivityStore,
  ActivityStoreError,
  activityPathFor,
  openActivityStore
};
