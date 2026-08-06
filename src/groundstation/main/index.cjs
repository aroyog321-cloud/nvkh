const path = require("node:path");
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain
} = require("electron");
const { EngineHost } = require("../../service/engineHost.cjs");
const { createProtocolConnection } = require("../../protocol/connection.cjs");
const { GroundstationIpcHost } = require("./ipcHost.cjs");
const { parseGroundstationArgs } = require("./options.cjs");

let mainWindow = null;
let engineHost = null;
let ipcHost = null;
let shutdownComplete = false;
let shutdownInProgress = false;

function rendererEntry() {
  return path.resolve(__dirname, "../../../dist/groundstation/renderer/index.html");
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: "#0b0e14",
    title: "Mission Control Groundstation",
    show: false,
    webPreferences: {
      preload: path.resolve(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  window.removeMenu();
  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", event => event.preventDefault());
  window.webContents.on("will-attach-webview", event => event.preventDefault());
  window.webContents.on("before-input-event", (event, input) => {
    if (!app.isPackaged && input.control && input.shift && input.key.toLowerCase() === "i") {
      window.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  window.on("close", event => {
    if (shutdownComplete) return;
    event.preventDefault();
    void shutdownAndClose(window);
  });

  const developmentUrl = process.env.MISSION_CONTROL_RENDERER_URL;
  if (developmentUrl && !app.isPackaged) {
    const parsed = new URL(developmentUrl);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) {
      throw new Error("MISSION_CONTROL_RENDERER_URL must use a loopback host");
    }
    window.loadURL(parsed.toString()).catch(error => handleRendererLoadError(window, error));
  } else {
    window.loadFile(rendererEntry()).catch(error => handleRendererLoadError(window, error));
  }
  return window;
}

function handleRendererLoadError(window, error) {
  if (window.isDestroyed()) return;
  dialog.showErrorBox("Mission Control could not load Groundstation", error.message);
  void shutdownAndClose(window);
}

async function shutdownAndClose(window) {
  if (shutdownInProgress) return;
  shutdownInProgress = true;
  const result = await engineHost.shutdown();
  shutdownInProgress = false;
  if (!result.ok) {
    const ids = Array.isArray(result.pendingIds) ? result.pendingIds.join(", ") : "";
    await dialog.showMessageBox(window, {
      type: "error",
      title: "Mission Control is still supervising workers",
      message: "Groundstation could not safely stop every PTY.",
      detail: ids ? `Still running: ${ids}` : result.error || "Unknown shutdown failure"
    });
    return result;
  }

  shutdownComplete = true;
  ipcHost?.dispose();
  window.destroy();
  return result;
}

async function start() {
  let options;
  try {
    const argv = process.argv.slice(app.isPackaged ? 1 : 2);
    options = parseGroundstationArgs(argv);
  } catch (error) {
    dialog.showErrorBox("Mission Control could not start", error.message);
    app.quit();
    return;
  }

  engineHost = new EngineHost();
  try {
    await engineHost.open(options);
  } catch (error) {
    dialog.showErrorBox("Mission Control could not open the workspace", error.message);
    app.quit();
    return;
  }

  mainWindow = createWindow();
  ipcHost = new GroundstationIpcHost({
    ipcMain,
    engineApi: engineHost.engineApi,
    createProtocolConnection,
    onShutdown: () => shutdownAndClose(mainWindow)
  });
  ipcHost.bind();
}

app.whenReady().then(start).catch(async error => {
  try {
    await engineHost?.shutdown();
  } catch (shutdownError) {
    // Startup reporting must still complete if cleanup itself throws.
  }
  dialog.showErrorBox("Mission Control crashed during startup", error.message);
  app.quit();
});

app.on("window-all-closed", () => {
  if (shutdownComplete) app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && engineHost?.isOpen) {
    mainWindow = createWindow();
  }
});

app.on("web-contents-created", (_event, contents) => {
  contents.on("will-navigate", event => event.preventDefault());
});

module.exports = { createWindow, rendererEntry, shutdownAndClose };
