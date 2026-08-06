const REQUEST_CHANNEL = "mission-control:request";
const EVENT_CHANNEL = "mission-control:event";

class GroundstationIpcHost {
  #ipcMain;
  #engineApi;
  #createProtocolConnection;
  #onShutdown;
  #connections;
  #observedWebContents;
  #bound;

  constructor(options) {
    this.#ipcMain = options.ipcMain;
    this.#engineApi = options.engineApi;
    this.#createProtocolConnection = options.createProtocolConnection;
    this.#onShutdown = options.onShutdown;
    this.#connections = new Map();
    this.#observedWebContents = new Set();
    this.#bound = false;
  }

  bind() {
    if (this.#bound) return;
    this.#bound = true;
    this.#ipcMain.handle(REQUEST_CHANNEL, (event, request) => {
      if (event.senderFrame && event.senderFrame !== event.sender.mainFrame) {
        return {
          version: 1,
          id: request?.id || null,
          ok: false,
          error: { code: "FORBIDDEN_FRAME", message: "requests are accepted only from the main frame" }
        };
      }
      return this.#connectionFor(event.sender).handle(request);
    });
  }

  #connectionFor(webContents) {
    let connection = this.#connections.get(webContents.id);
    if (connection) return connection;

    connection = this.#createProtocolConnection(this.#engineApi, {
      send: message => {
        // invoke() carries request responses. The event channel is reserved
        // for unsolicited engine/terminal notifications so renderers never
        // observe the same response twice.
        if (message?.type && !webContents.isDestroyed()) {
          webContents.send(EVENT_CHANNEL, message);
        }
      },
      onShutdown: this.#onShutdown
    });
    this.#connections.set(webContents.id, connection);
    if (!this.#observedWebContents.has(webContents.id)) {
      this.#observedWebContents.add(webContents.id);
      webContents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
        if (isMainFrame && !isInPlace) this.disposeConnection(webContents.id);
      });
      webContents.on("render-process-gone", () => this.disposeConnection(webContents.id));
      webContents.once("destroyed", () => {
        this.disposeConnection(webContents.id);
        this.#observedWebContents.delete(webContents.id);
      });
    }
    return connection;
  }

  disposeConnection(webContentsId) {
    const connection = this.#connections.get(webContentsId);
    if (!connection) return false;
    this.#connections.delete(webContentsId);
    connection.dispose();
    return true;
  }

  dispose() {
    if (this.#bound) this.#ipcMain.removeHandler(REQUEST_CHANNEL);
    this.#bound = false;
    for (const connection of this.#connections.values()) connection.dispose();
    this.#connections.clear();
    this.#observedWebContents.clear();
  }
}

module.exports = {
  EVENT_CHANNEL,
  GroundstationIpcHost,
  REQUEST_CHANNEL
};
