const { contextBridge, ipcRenderer } = require("electron");

const PROTOCOL_VERSION = 1;
// Sandboxed Electron preload scripts can require Electron but not arbitrary
// local modules, so keep these stable wire-channel literals self-contained.
const REQUEST_CHANNEL = "mission-control:request";
const EVENT_CHANNEL = "mission-control:event";
const MAX_BUFFERED_EVENTS = 512;
let requestSequence = 0;
let bufferedEvents = [];
const subscribers = new Set();

function request(method, params = {}) {
  const id = `renderer-${Date.now()}-${++requestSequence}`;
  return ipcRenderer.invoke(REQUEST_CHANNEL, {
    version: PROTOCOL_VERSION,
    id,
    method,
    params
  });
}

function subscribe(callback) {
  if (typeof callback !== "function") throw new TypeError("subscribe requires a callback");
  subscribers.add(callback);
  if (bufferedEvents.length) {
    const pending = bufferedEvents;
    bufferedEvents = [];
    for (const message of pending) callback(message);
  }
  return () => subscribers.delete(callback);
}

function openExternal(url) {
  return ipcRenderer.invoke("mission-control:open-external", url);
}

ipcRenderer.on(EVENT_CHANNEL, (_event, message) => {
  if (!message || message.version !== PROTOCOL_VERSION) return;
  if (!subscribers.size) {
    bufferedEvents.push(message);
    if (bufferedEvents.length > MAX_BUFFERED_EVENTS) {
      bufferedEvents = bufferedEvents.slice(-MAX_BUFFERED_EVENTS);
    }
    return;
  }
  for (const callback of [...subscribers]) {
    try {
      callback(message);
    } catch (error) {
      // A renderer observer must not starve other observers.
    }
  }
});

contextBridge.exposeInMainWorld("missionControl", Object.freeze({
  version: PROTOCOL_VERSION,
  request,
  openExternal,
  subscribe
}));
