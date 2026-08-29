const fs = require("node:fs");
const path = require("node:path");
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  screen,
  shell
} = require("electron");
const { EngineHost } = require("../../service/engineHost.cjs");
const { DiagnosticStore } = require("../../service/diagnosticStore.cjs");
const { ProjectCoordinator } = require("../../service/projectCoordinator.cjs");
const { ProjectRegistry } = require("../../service/projectRegistry.cjs");
const { GroundstationRecoveryService } = require("../../service/recoveryController.cjs");
const { RendererRecoverySupervisor } = require("../../service/rendererRecoverySupervisor.cjs");
const { VSCodeBridge } = require("../../service/vscodeBridge.cjs");
const { MissionContextService } = require("../../service/missionContext.cjs");
const { ProjectSupervisionService } = require("../../service/projectSupervision.cjs");
const { MissionAiCredentialStore } = require("../../service/missionAiCredentialStore.cjs");
const { MissionAIService } = require("../../service/missionAi.cjs");
const { MissionSupervisorService } = require("../../service/missionSupervisor.cjs");
const { McpGatewayStore } = require("../../service/mcpGatewayStore.cjs");
const { SecureMcpGateway } = require("../../service/mcpGateway.cjs");
const { MobileCompanionStore } = require("../../service/mobileCompanionStore.cjs");
const { MobileCompanionGateway } = require("../../service/mobileCompanion.cjs");
const { PluginPlatformStore } = require("../../service/pluginPlatformStore.cjs");
const { PermissionedPluginPlatform } = require("../../service/pluginPlatform.cjs");
const { createProtocolConnection } = require("../../protocol/connection.cjs");
const { GroundstationIpcHost } = require("./ipcHost.cjs");
const { parseGroundstationArgs } = require("./options.cjs");

let mainWindow = null;
let engineHost = null;
let ipcHost = null;
let projectCoordinator = null;
let recoveryService = null;
let rendererRecovery = null;
let vscodeBridge = null;
let missionAi = null;
let missionSupervisor = null;
let projectSupervision = null;
let mcpGateway = null;
let mobileCompanion = null;
let pluginPlatform = null;
let shutdownComplete = false;
let shutdownInProgress = false;
let recoveryDialogOpen = false;
let rendererFailureDuringShutdown = null;

function rendererEntry() {
  return path.resolve(__dirname, "../../../dist/groundstation/renderer/index.html");
}

function loadRenderer(window) {
  const developmentUrl = process.env.MISSION_CONTROL_RENDERER_URL;
  if (developmentUrl && !app.isPackaged) {
    const parsed = new URL(developmentUrl);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) {
      return Promise.reject(new Error("MISSION_CONTROL_RENDERER_URL must use a loopback host"));
    }
    return window.loadURL(parsed.toString());
  }
  return window.loadFile(rendererEntry());
}

function beginRendererLoad(window) {
  if (rendererRecovery) return rendererRecovery.beginLoad();
  return loadRenderer(window);
}

async function showManualRecovery(window) {
  if (recoveryDialogOpen || shutdownInProgress || shutdownComplete || window.isDestroyed()) return;
  recoveryDialogOpen = true;
  let response;
  try {
    response = await dialog.showMessageBox(window, {
      type: "error",
      title: "Groundstation recovery paused",
      message: "Groundstation stopped reloading after repeated renderer failures.",
      detail: "Engine-owned workers are still supervised. Retry the desktop interface, or close Mission Control safely.",
      buttons: ["Retry Groundstation", "Close safely"],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });
  } catch (error) {
    response = { response: 1 };
  } finally {
    recoveryDialogOpen = false;
  }
  if (response?.response === 0 && !window.isDestroyed()) {
    await rendererRecovery?.manualRetry();
  } else if (!window.isDestroyed()) {
    await shutdownAndClose(window);
  }
}

function scheduleRendererRecovery(window, details = {}) {
  return rendererRecovery?.recover(details) || Promise.resolve(false);
}

function createWindow(options = {}) {
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.min(1480, Math.max(960, Math.floor(workArea.width * 0.94)));
  const height = Math.min(940, Math.max(640, Math.floor(workArea.height * 0.92)));
  const window = new BrowserWindow({
    width,
    height,
    minWidth: Math.min(1040, width),
    minHeight: Math.min(680, height),
    center: true,
    backgroundColor: "#080a09",
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
  window.once("ready-to-show", () => {
    window.maximize();
    window.show();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", event => event.preventDefault());
  window.webContents.on("will-attach-webview", event => event.preventDefault());
  window.webContents.on("before-input-event", (event, input) => {
    if (!app.isPackaged && input.control && input.shift && input.key.toLowerCase() === "i") {
      window.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    if (shutdownComplete) return;
    if (shutdownInProgress) {
      rendererFailureDuringShutdown = details || {};
      return;
    }
    void scheduleRendererRecovery(window, details || {});
  });
  window.webContents.on("did-finish-load", () => rendererRecovery?.rendererLoaded());

  window.on("close", event => {
    if (shutdownComplete) return;
    event.preventDefault();
    void shutdownAndClose(window);
  });

  rendererRecovery?.dispose();
  rendererRecovery = recoveryService
    ? new RendererRecoverySupervisor({
        recoveryService,
        loadRenderer: () => loadRenderer(window),
        disposeConnection: () => ipcHost?.disposeConnection(window.webContents.id),
        onPaused: () => showManualRecovery(window),
        isBlocked: () => shutdownInProgress || shutdownComplete || window.isDestroyed()
      })
    : null;
  if (options.load !== false) void beginRendererLoad(window);
  return window;
}

async function shutdownAndClose(window) {
  if (shutdownInProgress) return;
  shutdownInProgress = true;
  let result;
  try {
    try { await mcpGateway?.stop(); } catch { /* Engine shutdown remains authoritative. */ }
    try { await mobileCompanion?.stop(); } catch { /* Engine shutdown remains authoritative. */ }
    result = await engineHost.shutdown();
  } catch (error) {
    result = {
      ok: false,
      error: "Unexpected engine shutdown error",
      pendingIds: []
    };
  } finally {
    shutdownInProgress = false;
  }
  if (!result.ok) {
    recoveryService?.shutdownFailed();
    const ids = Array.isArray(result.pendingIds) ? result.pendingIds.join(", ") : "";
    try {
      await dialog.showMessageBox(window, {
        type: "error",
        title: "Mission Control is still supervising workers",
        message: "Groundstation could not safely stop every PTY.",
        detail: ids ? `Still running: ${ids}` : result.error || "Unknown shutdown failure"
      });
    } catch (error) {
      // Native dialog failure must not strand a renderer that also crashed
      // during shutdown; the recovery path below remains authoritative.
    }
    if (rendererFailureDuringShutdown) {
      const failure = rendererFailureDuringShutdown;
      rendererFailureDuringShutdown = null;
      void scheduleRendererRecovery(window, failure);
    }
    return result;
  }

  shutdownComplete = true;
  rendererFailureDuringShutdown = null;
  rendererRecovery?.dispose();
  missionAi?.dispose();
  void mcpGateway?.dispose();
  void mobileCompanion?.dispose();
  pluginPlatform?.dispose();
  vscodeBridge?.dispose();
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
  vscodeBridge = new VSCodeBridge({
    getWorkspace: () => engineHost?.engineApi?.getWorkspace?.() || null,
    openExternal: uri => shell.openExternal(uri)
  });
  const missionContext = new MissionContextService({
    getEngineApi: () => engineHost?.engineApi || null,
    getVSCodeStatus: () => vscodeBridge?.status?.() || null
  });
  projectSupervision = new ProjectSupervisionService({ missionContext });
  missionAi = new MissionAIService({
    credentialStore: new MissionAiCredentialStore(
      path.join(app.getPath("userData"), "mission-ai-credentials.json"),
      { safeStorage }
    ),
    missionContext,
    projectSupervision
  });
  missionSupervisor = new MissionSupervisorService({
    missionAi,
    getEngineApi: () => engineHost?.engineApi || null
  });
  mcpGateway = new SecureMcpGateway({
    store: new McpGatewayStore(
      path.join(app.getPath("userData"), "mcp-gateway-credentials.json"),
      { safeStorage }
    ),
    missionContext,
    projectSupervision,
    missionSupervisor,
    getEngineApi: () => engineHost?.engineApi || null
  });
  mobileCompanion = new MobileCompanionGateway({
    store: new MobileCompanionStore(
      path.join(app.getPath("userData"), "mobile-companion-credentials.json"),
      { safeStorage }
    ),
    missionContext,
    getEngineApi: () => engineHost?.engineApi || null
  });
  pluginPlatform = new PermissionedPluginPlatform({
    store: new PluginPlatformStore(path.join(app.getPath("userData"), "plugin-platform.json")),
    missionContext,
    getEngineApi: () => engineHost?.engineApi || null,
    chooseManifest: async () => {
      const options = {
        title: "Install a Mission Control plugin manifest",
        buttonLabel: "Inspect manifest",
        properties: ["openFile"],
        filters: [{ name: "Mission Control plugin manifest", extensions: ["json"] }]
      };
      const result = mainWindow && !mainWindow.isDestroyed()
        ? await dialog.showOpenDialog(mainWindow, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || !result.filePaths[0]) return null;
      const filePath = result.filePaths[0];
      const raw = fs.readFileSync(filePath);
      if (raw.length > 256 * 1024) throw new Error("Plugin manifest exceeds the 256 KiB limit");
      let manifest;
      try { manifest = JSON.parse(raw.toString("utf8")); }
      catch { throw new Error("Plugin manifest is not valid JSON"); }
      return { manifest, source: path.basename(filePath) };
    }
  });
  ipcMain.handle("mission-control:open-external", async (_event, url) => {
    const allowed = new Set(["https://github.com/radix-ui/primitives", "https://github.com/pacocoursey/cmdk"]);
    if (!allowed.has(url)) throw new Error("External resource is not allow-listed");
    await shell.openExternal(url);
    return true;
  });
  recoveryService = new GroundstationRecoveryService({
    store: new DiagnosticStore(path.join(app.getPath("userData"), "recovery-diagnostics.json"))
  });
  const projectRegistry = new ProjectRegistry(path.join(app.getPath("userData"), "projects.json"));
  projectCoordinator = new ProjectCoordinator({
    engineHost,
    registry: projectRegistry,
    chooseDirectory: async () => {
      const dialogOptions = {
        title: "Open a project in Mission Control",
        buttonLabel: "Choose project",
        properties: ["openDirectory", "createDirectory"]
      };
      const result = mainWindow && !mainWindow.isDestroyed()
        ? await dialog.showOpenDialog(mainWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);
      return result.canceled ? null : result.filePaths[0] || null;
    }
  });
  try {
    const startupOptions = projectCoordinator.resolveStartupOptions(options);
    await engineHost.open(startupOptions);
    try {
      projectCoordinator.rememberCurrent();
    } catch (registryError) {
      projectCoordinator.lastWarning = registryError instanceof Error
        ? registryError.message
        : String(registryError);
    }
  } catch (error) {
    dialog.showErrorBox("Mission Control could not open the workspace", error.message);
    app.quit();
    return;
  }

  mainWindow = createWindow({ load: false });
  ipcHost = new GroundstationIpcHost({
    ipcMain,
    getEngineApi: () => engineHost.engineApi,
    createProtocolConnection,
    onShutdown: () => shutdownAndClose(mainWindow),
    projectService: projectCoordinator,
    recoveryService,
    vscodeBridge,
    missionAi,
    missionSupervisor,
    projectSupervision,
    mcpGateway,
    mobileCompanion,
    pluginPlatform
  });
  ipcHost.bind();
  try { await mcpGateway.start(); }
  catch (error) { mcpGateway.lastError = error instanceof Error ? error.message : String(error); }
  try { await mobileCompanion.start(); }
  catch (error) { mobileCompanion.lastError = error instanceof Error ? error.message : String(error); }
  void beginRendererLoad(mainWindow);
}

app.whenReady().then(start).catch(async error => {
  recoveryService?.mainFailed("startup-failure");
  missionAi?.dispose();
  await mcpGateway?.dispose();
  await mobileCompanion?.dispose();
  pluginPlatform?.dispose();
  vscodeBridge?.dispose();
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

// Observe fatal main-process exceptions without changing Node's default fatal
// behavior. The durable record contains only an allow-listed classification;
// exception text, paths, commands, output, and environment values are omitted.
process.on("uncaughtExceptionMonitor", () => {
  recoveryService?.mainFailed("uncaught-exception");
});

app.on("web-contents-created", (_event, contents) => {
  contents.on("will-navigate", event => event.preventDefault());
});

module.exports = {
  beginRendererLoad,
  createWindow,
  loadRenderer,
  rendererEntry,
  scheduleRendererRecovery,
  shutdownAndClose
};
