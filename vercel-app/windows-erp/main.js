const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, Menu, shell, dialog, ipcMain, globalShortcut } = require("electron");

const DEFAULT_ERP_URL = "https://choongman-erp.vercel.app/admin/login";
const UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 60 * 6; // 6 hours
const AUTO_UPDATE_ENABLED = String(process.env.WINDOWS_ERP_AUTO_UPDATE || "1") !== "0";

function readJsonFileIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readRuntimeConfig() {
  const bundledPath = path.join(app.getAppPath(), "runtime-config.json");
  const userPath = path.join(app.getPath("userData"), "runtime-config.json");

  const bundled = readJsonFileIfExists(bundledPath) || {};
  const user = readJsonFileIfExists(userPath) || {};
  return {
    ...bundled,
    ...user,
  };
}

function toOrigin(urlText) {
  try {
    return new URL(urlText).origin;
  } catch {
    return "";
  }
}

const runtimeConfig = readRuntimeConfig();
const ERP_URL = process.env.WINDOWS_ERP_URL || runtimeConfig.erpUrl || runtimeConfig.posUrl || DEFAULT_ERP_URL;
const ALLOWED_ORIGIN =
  process.env.WINDOWS_ERP_ALLOWED_ORIGIN || runtimeConfig.allowedOrigin || toOrigin(ERP_URL);
const isKiosk = String(process.env.WINDOWS_ERP_KIOSK || runtimeConfig.kiosk || "0") !== "0";
const updateManifestUrl =
  process.env.WINDOWS_ERP_UPDATE_MANIFEST_URL ||
  runtimeConfig.updateManifestUrl ||
  `${ALLOWED_ORIGIN}/downloads/windows-erp/latest.json`;
const DEFAULT_PRINT_SILENT =
  String(
    process.env.WINDOWS_ERP_PRINT_SILENT ??
      runtimeConfig.printSilent ??
      runtimeConfig.print?.silent ??
      "0"
  ) === "1";
const DEFAULT_PRINT_DEVICE =
  String(
    process.env.WINDOWS_ERP_PRINT_DEVICE ??
      runtimeConfig.printDeviceName ??
      runtimeConfig.print?.deviceName ??
      ""
  ).trim();

let mainWindow = null;
let isCheckingUpdate = false;

/** app.asar에는 node_modules가 없음 — semver 패키지 대신 x.y.z만 파싱·비교 */
function parseSemverTriplet(text) {
  if (!text || typeof text !== "string") return null;
  const m = String(text).match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

function normalizeVersion(versionText) {
  const t = parseSemverTriplet(versionText);
  return t ? `${t[0]}.${t[1]}.${t[2]}` : null;
}

/** true if a <= b */
function semverLte(a, b) {
  const pa = parseSemverTriplet(a);
  const pb = parseSemverTriplet(b);
  if (!pa || !pb) return false;
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] < pb[i]) return true;
    if (pa[i] > pb[i]) return false;
  }
  return true;
}

function senderAllowedOrigin(sender) {
  if (!ALLOWED_ORIGIN || !sender) return false;
  try {
    const url = sender.getURL();
    return typeof url === "string" && url.startsWith(ALLOWED_ORIGIN);
  } catch {
    return false;
  }
}

async function fetchUpdatePayload() {
  if (!updateManifestUrl) {
    throw new Error("missing manifest URL");
  }
  const response = await fetch(updateManifestUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function checkForUpdateIfAvailable() {
  if (!AUTO_UPDATE_ENABLED || !updateManifestUrl || isCheckingUpdate) return;
  isCheckingUpdate = true;
  try {
    const payload = await fetchUpdatePayload();
    const latestVersion = normalizeVersion(payload.version);
    const currentVersion = normalizeVersion(app.getVersion());
    if (!latestVersion || !currentVersion) return;
    if (semverLte(latestVersion, currentVersion)) return;

    const installerUrl = payload.installerUrl || payload.downloadUrl || "";
    const detail = payload.notes || "A new ERP version is available. Download the installer to update.";
    const message = `Current ${currentVersion} → Latest ${latestVersion}`;

    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["Download", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "ERP update",
      message,
      detail,
      noLink: true,
    });
    if (result.response === 0 && installerUrl) {
      await shell.openExternal(installerUrl);
    }
  } catch {
    // Ignore background check failures
  } finally {
    isCheckingUpdate = false;
  }
}

async function checkForUpdateManual() {
  if (!AUTO_UPDATE_ENABLED) {
    await dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["OK"],
      title: "ERP update",
      message: "Update checks are turned off for this installation.",
    });
    return { ok: false, reason: "disabled" };
  }
  if (!updateManifestUrl) {
    await dialog.showMessageBox(mainWindow, {
      type: "warning",
      buttons: ["OK"],
      title: "ERP update",
      message: "Update manifest URL is not configured.",
    });
    return { ok: false, reason: "no_manifest" };
  }

  if (isCheckingUpdate) {
    return { ok: false, reason: "busy" };
  }
  isCheckingUpdate = true;
  try {
    const payload = await fetchUpdatePayload();
    const latestVersion = normalizeVersion(payload.version);
    const currentVersion = normalizeVersion(app.getVersion());
    if (!latestVersion || !currentVersion) {
      await dialog.showMessageBox(mainWindow, {
        type: "warning",
        buttons: ["OK"],
        title: "ERP update",
        message: "Could not read version from the update server response.",
      });
      return { ok: false, reason: "bad_manifest", currentVersion, latestVersion };
    }

    if (semverLte(latestVersion, currentVersion)) {
      await dialog.showMessageBox(mainWindow, {
        type: "info",
        buttons: ["OK"],
        title: "ERP update",
        message: `You are on the latest version (${currentVersion}).`,
      });
      return { ok: true, upToDate: true, currentVersion, latestVersion };
    }

    const installerUrl = payload.installerUrl || payload.downloadUrl || "";
    const detail =
      payload.notes || "Download the installer, close ERP, run installer, then open ERP again.";
    const message = `Current ${currentVersion} → Latest ${latestVersion}`;

    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["Download", "Close"],
      defaultId: 0,
      cancelId: 1,
      title: "ERP update",
      message,
      detail,
      noLink: true,
    });
    if (result.response === 0 && installerUrl) {
      await shell.openExternal(installerUrl);
    }
    return {
      ok: true,
      upToDate: false,
      currentVersion,
      latestVersion,
      openedDownload: result.response === 0 && Boolean(installerUrl),
    };
  } catch (e) {
    await dialog.showMessageBox(mainWindow, {
      type: "error",
      buttons: ["OK"],
      title: "ERP update",
      message: "Could not check for updates. Check your network and try again.",
      detail: String(e && e.message ? e.message : e),
    });
    return { ok: false, reason: "fetch_failed" };
  } finally {
    isCheckingUpdate = false;
  }
}

function getQuickPrintOptions() {
  const options = {
    silent: DEFAULT_PRINT_SILENT,
    printBackground: true,
  };
  if (DEFAULT_PRINT_DEVICE) {
    options.deviceName = DEFAULT_PRINT_DEVICE;
  }
  return options;
}

function getDialogPrintOptions() {
  return {
    silent: false,
    printBackground: true,
  };
}

function printCurrentWindow(options) {
  return new Promise((resolve) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      resolve({ ok: false, reason: "no_window" });
      return;
    }
    mainWindow.webContents.print(options, (success, failureReason) => {
      if (success) {
        resolve({ ok: true });
        return;
      }
      resolve({ ok: false, reason: failureReason || "print_failed" });
    });
  });
}

async function printWithDialogManual() {
  const result = await printCurrentWindow(getDialogPrintOptions());
  if (!result.ok) {
    await dialog.showMessageBox(mainWindow, {
      type: "error",
      buttons: ["OK"],
      title: "ERP print",
      message: "Print failed. Check printer status and try again.",
      detail: String(result.reason || "unknown"),
    });
  }
  return result;
}

async function quickPrintManual() {
  const result = await printCurrentWindow(getQuickPrintOptions());
  if (!result.ok) {
    await dialog.showMessageBox(mainWindow, {
      type: "error",
      buttons: ["OK"],
      title: "ERP print",
      message: "Quick print failed. Check printer status and settings.",
      detail: String(result.reason || "unknown"),
    });
  }
  return result;
}

async function listPrinters() {
  if (!mainWindow || mainWindow.isDestroyed()) return [];
  const printers = await mainWindow.webContents.getPrintersAsync();
  return printers.map((p) => ({
    name: p.name,
    displayName: p.displayName || p.name,
    isDefault: Boolean(p.isDefault),
  }));
}

function buildAppMenu() {
  const template = [
    {
      label: "App",
      submenu: [
        {
          label: "Check for updates…",
          click: () => {
            void checkForUpdateManual();
          },
        },
        {
          label: "Print…",
          accelerator: "CommandOrControl+P",
          click: () => {
            void printWithDialogManual();
          },
        },
        {
          label: "Quick print",
          accelerator: "CommandOrControl+Shift+P",
          click: () => {
            void quickPrintManual();
          },
        },
        { type: "separator" },
        {
          label: "Reload",
          accelerator: "CommandOrControl+R",
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.reload();
            }
          },
        },
        { type: "separator" },
        { role: "quit", label: "Quit" },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    autoHideMenuBar: true,
    kiosk: isKiosk,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      partition: "persist:choongman-erp",
      spellcheck: false,
    },
  });

  mainWindow.webContents.on("did-fail-load", () => {
    mainWindow.loadFile(path.join(__dirname, "offline.html"));
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (ALLOWED_ORIGIN && url.startsWith(ALLOWED_ORIGIN)) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (ALLOWED_ORIGIN && !url.startsWith(ALLOWED_ORIGIN)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  void mainWindow.loadURL(ERP_URL);

  setTimeout(() => {
    void checkForUpdateIfAvailable();
  }, 15000);
  setInterval(() => {
    void checkForUpdateIfAvailable();
  }, UPDATE_CHECK_INTERVAL_MS);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(buildAppMenu());

    ipcMain.handle("cm-erp-get-version", (event) => {
      if (!senderAllowedOrigin(event.sender)) return null;
      return app.getVersion();
    });

    ipcMain.handle("cm-erp-check-updates", async (event) => {
      if (!senderAllowedOrigin(event.sender)) {
        return { ok: false, reason: "forbidden" };
      }
      return checkForUpdateManual();
    });

    ipcMain.handle("cm-erp-list-printers", async (event) => {
      if (!senderAllowedOrigin(event.sender)) return [];
      return listPrinters();
    });

    ipcMain.handle("cm-erp-get-print-config", (event) => {
      if (!senderAllowedOrigin(event.sender)) return null;
      return {
        silent: DEFAULT_PRINT_SILENT,
        deviceName: DEFAULT_PRINT_DEVICE || null,
      };
    });

    ipcMain.handle("cm-erp-print-dialog", async (event) => {
      if (!senderAllowedOrigin(event.sender)) return { ok: false, reason: "forbidden" };
      return printWithDialogManual();
    });

    ipcMain.handle("cm-erp-quick-print", async (event) => {
      if (!senderAllowedOrigin(event.sender)) return { ok: false, reason: "forbidden" };
      return quickPrintManual();
    });

    createWindow();

    const registered = globalShortcut.register("CommandOrControl+Shift+U", () => {
      void checkForUpdateManual();
    });
    if (!registered) {
      console.warn("Global shortcut CommandOrControl+Shift+U could not be registered");
    }
  });
}

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
