const fs = require("fs");
const path = require("path");
const os = require("os");
const { app, BrowserWindow, Menu, shell, dialog, ipcMain, globalShortcut } = require("electron");

const DEFAULT_POS_URL = "https://choongman-erp.vercel.app/pos/login";
const UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 60 * 6; // 6 hours
const AUTO_UPDATE_ENABLED = String(process.env.WINDOWS_POS_AUTO_UPDATE || "1") !== "0";

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

/** JSON boolean / 0·1 / 문자열 모두 허용 */
function readConfigBool(value, defaultValue) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (value === undefined || value === null) return defaultValue;
  const s = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;
  if (s === "") return defaultValue;
  return defaultValue;
}

const POS_URL = process.env.WINDOWS_POS_URL || runtimeConfig.posUrl || DEFAULT_POS_URL;
const ALLOWED_ORIGIN = process.env.WINDOWS_POS_ALLOWED_ORIGIN || runtimeConfig.allowedOrigin || toOrigin(POS_URL);
const isKiosk = String(process.env.WINDOWS_POS_KIOSK || runtimeConfig.kiosk || "1") !== "0";
const updateManifestUrl =
  process.env.WINDOWS_UPDATE_MANIFEST_URL ||
  runtimeConfig.updateManifestUrl ||
  `${ALLOWED_ORIGIN}/downloads/windows-pos/latest.json`;

const printSilentResolved =
  process.env.WINDOWS_POS_PRINT_SILENT !== undefined && process.env.WINDOWS_POS_PRINT_SILENT !== ""
    ? process.env.WINDOWS_POS_PRINT_SILENT
    : runtimeConfig.printSilent ?? runtimeConfig.print?.silent ?? true;
const DEFAULT_PRINT_SILENT = readConfigBool(printSilentResolved, true);
const DEFAULT_PRINT_DEVICE =
  String(
    process.env.WINDOWS_POS_PRINT_DEVICE ??
      runtimeConfig.printDeviceName ??
      runtimeConfig.print?.deviceName ??
      ""
  ).trim();
const THERMAL_PAGE_WIDTH_80MM = 80000;
const THERMAL_PAGE_HEIGHT_600MM = 600000;

/**
 * 숨김 HTML 인쇄 창 폭은 80mm 용지와 맞춤(96 CSS px/in 기준 ≈302px).
 * 480px 등으로 넓으면 Chromium이 용지 폭에 맞추며 전체를 축소해, 상단에 미니어처·왜곡된 스케일이 생기는 경우가 있음.
 */
const PRINT_HTML_OFFSCREEN_WIDTH = Math.round((80 / 25.4) * 96);
const PRINT_HTML_OFFSCREEN_HEIGHT = 4096;
/** loadFile 직후 너무 빨리 print 하면 Windows에서 무인쇄가 실패·곧바로 대화상자로 떨어지는 경우가 있음 */
const PRINT_HTML_SETTLE_MS = 550;

/**
 * dev: repo 루트(c:\\CM_ERP\\…) — 패키징 앱은 __dirname이 asar/설치 경로라 여기엔 못 쓰는 경우가 많음.
 * packaged: Electron userData(항상 쓰기 가능) → 그래도 실패 시 OS temp.
 * 임의 경로: 환경 변수 CM_ERP_DEBUG_LOG
 */
function getDebugNdjsonLogCandidates() {
  const env = String(process.env.CM_ERP_DEBUG_LOG || "").trim();
  if (env) return [env];
  const out = [];
  try {
    if (!app.isPackaged) {
      out.push(path.join(__dirname, "..", "..", "debug-0dfc7e.log"));
    }
  } catch {
    /* ignore */
  }
  try {
    if (!app.isPackaged) {
      out.push(path.join(process.cwd(), "debug-0dfc7e.log"));
    }
  } catch {
    /* ignore */
  }
  try {
    out.push(path.join(app.getPath("userData"), "debug-0dfc7e.log"));
  } catch {
    /* ignore */
  }
  out.push(path.join(os.tmpdir(), "cm-pos-debug-0dfc7e.log"));
  return [...new Set(out)];
}

function debugLog(hypothesisId, location, message, data) {
  const payload = {
    sessionId: "0dfc7e",
    runId: "run1-pre-fix",
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  const line = JSON.stringify(payload) + "\n";
  // #region agent log
  try {
    for (const p of getDebugNdjsonLogCandidates()) {
      try {
        fs.appendFileSync(p, line, "utf8");
      } catch {
        /* try next path — 여러 위치에 동시 기록(워크스페이스·userData 등) */
      }
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof fetch === "function") {
      fetch("http://127.0.0.1:7510/ingest/f85ce2e6-3f30-4dec-a500-2fe4222a00ab", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0dfc7e" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }
  } catch {
    /* ignore */
  }
  try {
    const { request } = require("http");
    const req = request(
      "http://127.0.0.1:7510/ingest/f85ce2e6-3f30-4dec-a500-2fe4222a00ab",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "0dfc7e",
        },
      },
      () => {}
    );
    req.on("error", () => {});
    req.write(JSON.stringify(payload));
    req.end();
  } catch {
    /* ignore */
  }
  // #endregion
}

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

/** Background: notify only when a newer version exists */
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
    const detail =
      payload.notes || "A new version is available. Download the installer to update.";
    const message = `Current ${currentVersion} → Latest ${latestVersion}`;

    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["Download", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "POS update",
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

/**
 * Manual: always ends with a dialog (menu, shortcut, or in-app button).
 * @returns {Promise<{ ok: boolean, upToDate?: boolean, reason?: string, currentVersion?: string, latestVersion?: string }>}
 */
async function checkForUpdateManual() {
  if (!AUTO_UPDATE_ENABLED) {
    await dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["OK"],
      title: "POS update",
      message: "Update checks are turned off for this installation.",
    });
    return { ok: false, reason: "disabled" };
  }
  if (!updateManifestUrl) {
    await dialog.showMessageBox(mainWindow, {
      type: "warning",
      buttons: ["OK"],
      title: "POS update",
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
        title: "POS update",
        message: "Could not read version from the update server response.",
      });
      return { ok: false, reason: "bad_manifest", currentVersion, latestVersion };
    }

    if (semverLte(latestVersion, currentVersion)) {
      await dialog.showMessageBox(mainWindow, {
        type: "info",
        buttons: ["OK"],
        title: "POS update",
        message: `You are on the latest version (${currentVersion}).`,
      });
      return { ok: true, upToDate: true, currentVersion, latestVersion };
    }

    const installerUrl = payload.installerUrl || payload.downloadUrl || "";
    const detail =
      payload.notes || "Download the installer, close POS, run the installer, then open POS again.";
    const message = `Current ${currentVersion} → Latest ${latestVersion}`;

    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["Download", "Close"],
      defaultId: 0,
      cancelId: 1,
      title: "POS update",
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
      title: "POS update",
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

/** 영수증/주방전 HTML 전용: A4 기본값으로 축소되는 현상 방지 */
function getThermalHtmlPrintOptions() {
  const options = {
    silent: DEFAULT_PRINT_SILENT,
    printBackground: true,
    scaleFactor: 100,
    landscape: false,
    /** 한 장에 여러 페이지 축소 배치 방지(일부 드라이버 기본값 이슈) */
    pagesPerSheet: 1,
    margins: { marginType: "none" },
    pageSize: {
      width: THERMAL_PAGE_WIDTH_80MM,
      height: THERMAL_PAGE_HEIGHT_600MM,
    },
  };
  if (DEFAULT_PRINT_DEVICE) {
    options.deviceName = DEFAULT_PRINT_DEVICE;
  }
  return options;
}

/**
 * 일부 열전사 드라이버는 커스텀 pageSize(마이크론) 무인쇄를 거부하고 즉시 실패한다.
 * 그때도 무인쇄를 유지하려면 pageSize/margins 없이 드라이버 기본 용지(보통 80mm)로 한 번 더 시도.
 * (기본 프린터가 A4면 레이아웃이 어긋날 수 있어, 운영 시에는 print.deviceName 으로 영수증기 지정 권장)
 */
function getHtmlSilentDriverDefaultPrintOptions() {
  const options = {
    silent: true,
    printBackground: true,
    scaleFactor: 100,
    landscape: false,
  };
  if (DEFAULT_PRINT_DEVICE) {
    options.deviceName = DEFAULT_PRINT_DEVICE;
  }
  return options;
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

function printWebContentsPromise(wc, options) {
  return new Promise((resolve) => {
    wc.print(options, (success, failureReason) => {
      resolve({ success: Boolean(success), failureReason: failureReason || "" });
    });
  });
}

/** 영수증·주방전 HTML: 렌더러 iframe.print()는 Electron에서 무시되는 경우가 많아 메인에서 숨은 창으로 인쇄 */
async function printHtmlDocumentInHiddenWindow(htmlString) {
  const tmpRoot = app.getPath("temp");
  const tmpPath = path.join(
    tmpRoot,
    `cm-pos-print-${Date.now()}-${Math.random().toString(16).slice(2)}.html`
  );
  let printWindow;
  try {
    const resolvedDevice = await resolvePrintDeviceNameForJob();
    // #region agent log
    debugLog("H4_layout_shrink", "windows-pos/main.js:printHtmlDocumentInHiddenWindow:start", "print_html_start", {
      htmlLength: String(htmlString || "").length,
      offscreenWidth: PRINT_HTML_OFFSCREEN_WIDTH,
      offscreenHeight: PRINT_HTML_OFFSCREEN_HEIGHT,
      settleMs: PRINT_HTML_SETTLE_MS,
      resolvedDevice: resolvedDevice || "",
      configuredDevice: DEFAULT_PRINT_DEVICE || "",
    });
    // #endregion
    fs.writeFileSync(tmpPath, htmlString, "utf8");
    printWindow = new BrowserWindow({
      width: PRINT_HTML_OFFSCREEN_WIDTH,
      height: PRINT_HTML_OFFSCREEN_HEIGHT,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    });
    try {
      printWindow.webContents.setZoomFactor(1);
    } catch {
      /* ignore */
    }
    await printWindow.loadFile(tmpPath);
    await new Promise((r) => setTimeout(r, PRINT_HTML_SETTLE_MS));

    let printStage = "thermal";
    /** 1) 80mm 커스텀 용지 무인쇄 → 2) 드라이버 기본 용지 무인쇄(무인쇄 유지) → 3) 대화상자 */
    const thermalOpts = getThermalHtmlPrintOptions();
    if (resolvedDevice) thermalOpts.deviceName = resolvedDevice;
    // #region agent log
    debugLog("H1_silent_flag", "windows-pos/main.js:printHtmlDocumentInHiddenWindow:thermal_opts", "thermal_options", {
      silent: Boolean(thermalOpts.silent),
      deviceName: String(thermalOpts.deviceName || ""),
      scaleFactor: Number(thermalOpts.scaleFactor || 0),
      pageSize: thermalOpts.pageSize || null,
      margins: thermalOpts.margins || null,
      pagesPerSheet: Number(thermalOpts.pagesPerSheet || 0),
      defaultPrintSilent: DEFAULT_PRINT_SILENT,
      defaultPrintDevice: DEFAULT_PRINT_DEVICE || "",
    });
    // #endregion
    let r = await printWebContentsPromise(printWindow.webContents, thermalOpts);
    // #region agent log
    debugLog("H3_thermal_fail", "windows-pos/main.js:printHtmlDocumentInHiddenWindow:thermal_result", "thermal_result", {
      success: Boolean(r.success),
      failureReason: String(r.failureReason || ""),
    });
    // #endregion
    if (!r.success && DEFAULT_PRINT_SILENT) {
      printStage = "silent_driver_default";
      const driverDefaultOpts = getHtmlSilentDriverDefaultPrintOptions();
      if (resolvedDevice) driverDefaultOpts.deviceName = resolvedDevice;
      r = await printWebContentsPromise(printWindow.webContents, driverDefaultOpts);
      // #region agent log
      debugLog("H2_device_or_driver", "windows-pos/main.js:printHtmlDocumentInHiddenWindow:driver_default_result", "driver_default_result", {
        success: Boolean(r.success),
        failureReason: String(r.failureReason || ""),
        optsSilent: Boolean(driverDefaultOpts.silent),
        optsDeviceName: String(driverDefaultOpts.deviceName || ""),
      });
      // #endregion
    }
    if (!r.success) {
      printStage = "dialog";
      // #region agent log
      debugLog("H5_fallback_dialog", "windows-pos/main.js:printHtmlDocumentInHiddenWindow:dialog_fallback", "dialog_fallback_triggered", {
        previousFailureReason: String(r.failureReason || ""),
        defaultPrintSilent: DEFAULT_PRINT_SILENT,
      });
      // #endregion
      r = await printWebContentsPromise(printWindow.webContents, getDialogPrintOptions());
    }
    // #region agent log
    debugLog("H5_fallback_dialog", "windows-pos/main.js:printHtmlDocumentInHiddenWindow:final", "print_html_final", {
      ok: Boolean(r.success),
      finalFailureReason: String(r.failureReason || ""),
      printStage,
    });
    // #endregion
    return {
      ok: r.success,
      reason: r.failureReason || (r.success ? "" : "print_failed"),
      printStage,
    };
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  } finally {
    try {
      if (printWindow && !printWindow.isDestroyed()) printWindow.destroy();
    } catch {
      /* ignore */
    }
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
  }
}

async function printWithDialogManual() {
  const result = await printCurrentWindow(getDialogPrintOptions());
  if (!result.ok) {
    await dialog.showMessageBox(mainWindow, {
      type: "error",
      buttons: ["OK"],
      title: "POS print",
      message: "Print failed. Check printer status and try again.",
      detail: String(result.reason || "unknown"),
    });
  }
  return result;
}

async function quickPrintManual() {
  const opts = getQuickPrintOptions();
  const resolved = await resolvePrintDeviceNameForJob();
  if (resolved) opts.deviceName = resolved;
  const result = await printCurrentWindow(opts);
  if (!result.ok) {
    await dialog.showMessageBox(mainWindow, {
      type: "error",
      buttons: ["OK"],
      title: "POS print",
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

/** runtime-config에 deviceName이 없을 때 Windows 무인쇄가 실패·대화상자로 떨어지는 경우가 많아 OS 기본 프린터를 사용 */
async function resolvePrintDeviceNameForJob() {
  const configured = String(DEFAULT_PRINT_DEVICE || "").trim();
  if (configured) return configured;
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return "";
    const printers = await mainWindow.webContents.getPrintersAsync();
    const def = printers.find((p) => p.isDefault);
    return def && def.name ? String(def.name).trim() : "";
  } catch {
    return "";
  }
}

/**
 * 메뉴/이미지 이상 시 복구용:
 * - 로그인 세션은 유지하기 위해 cookies/localStorage는 건드리지 않음
 * - Service Worker + Cache Storage만 비우고 강력 새로고침
 */
async function clearRuntimeCacheAndReloadManual() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: false, reason: "no_window" };
  }

  const confirm = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    buttons: ["Reset cache + Reload", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    title: "POS cache reset",
    message: "Clear Service Worker cache and reload now?",
    detail:
      "Use this when menu images or API data look stale only in hybrid POS. Login/session is preserved.",
    noLink: true,
  });
  if (confirm.response !== 0) {
    return { ok: false, reason: "cancelled" };
  }

  const errs = [];
  const ses = mainWindow.webContents.session;
  try {
    await ses.clearStorageData({
      storages: ["serviceworkers", "cachestorage"],
    });
  } catch (e) {
    errs.push(`clearStorageData: ${String(e && e.message ? e.message : e)}`);
  }
  try {
    await ses.clearCache();
  } catch (e) {
    errs.push(`clearCache: ${String(e && e.message ? e.message : e)}`);
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.reloadIgnoringCache();
  }

  if (errs.length > 0) {
    await dialog.showMessageBox(mainWindow, {
      type: "warning",
      buttons: ["OK"],
      title: "POS cache reset",
      message: "Cache reset completed with warnings.",
      detail: errs.join("\n"),
      noLink: true,
    });
    return { ok: true, warnings: errs };
  }
  return { ok: true };
}

function buildAppMenu() {
  const template = [
    {
      label: "App",
      submenu: [
        {
          label: "Exit fullscreen (kiosk)",
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.setKiosk(false);
              mainWindow.setFullScreen(false);
              mainWindow.maximize();
            }
          },
        },
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
        {
          label: "Reset cache + reload",
          accelerator: "CommandOrControl+Shift+R",
          click: () => {
            void clearRuntimeCacheAndReloadManual();
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
    width: 1400,
    height: 900,
    autoHideMenuBar: true,
    kiosk: isKiosk,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      partition: "persist:choongman-pos",
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

  void mainWindow.loadURL(POS_URL);

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
    // #region agent log
    debugLog("H1_silent_flag", "windows-pos/main.js:app.whenReady", "print_runtime_boot", {
      defaultPrintSilent: DEFAULT_PRINT_SILENT,
      defaultPrintDevice: DEFAULT_PRINT_DEVICE || "",
      posUrl: POS_URL,
      allowedOrigin: ALLOWED_ORIGIN,
      isPackaged: Boolean(app.isPackaged),
      debugNdjsonTryPaths: getDebugNdjsonLogCandidates(),
    });
    // #endregion

    ipcMain.handle("cm-pos-get-version", (event) => {
      if (!senderAllowedOrigin(event.sender)) return null;
      return app.getVersion();
    });

    ipcMain.handle("cm-pos-check-updates", async (event) => {
      if (!senderAllowedOrigin(event.sender)) {
        return { ok: false, reason: "forbidden" };
      }
      return checkForUpdateManual();
    });

    ipcMain.handle("cm-pos-exit-kiosk", async (event) => {
      if (!senderAllowedOrigin(event.sender)) {
        return { ok: false, reason: "forbidden" };
      }
      if (!mainWindow || mainWindow.isDestroyed()) {
        return { ok: false, reason: "no_window" };
      }
      try {
        mainWindow.setKiosk(false);
        mainWindow.setFullScreen(false);
        if (!mainWindow.isDestroyed()) {
          mainWindow.maximize();
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: String(e && e.message ? e.message : e) };
      }
    });

    ipcMain.handle("cm-pos-minimize-window", async (event) => {
      if (!senderAllowedOrigin(event.sender)) {
        return { ok: false, reason: "forbidden" };
      }
      if (!mainWindow || mainWindow.isDestroyed()) {
        return { ok: false, reason: "no_window" };
      }
      try {
        mainWindow.minimize();
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: String(e && e.message ? e.message : e) };
      }
    });

    ipcMain.handle("cm-pos-quit-app", async (event) => {
      if (!senderAllowedOrigin(event.sender)) {
        return { ok: false, reason: "forbidden" };
      }
      try {
        app.quit();
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: String(e && e.message ? e.message : e) };
      }
    });

    ipcMain.handle("cm-pos-list-printers", async (event) => {
      if (!senderAllowedOrigin(event.sender)) return [];
      return listPrinters();
    });

    ipcMain.handle("cm-pos-get-print-config", (event) => {
      if (!senderAllowedOrigin(event.sender)) return null;
      return {
        silent: DEFAULT_PRINT_SILENT,
        deviceName: DEFAULT_PRINT_DEVICE || null,
      };
    });

    ipcMain.handle("cm-pos-print-dialog", async (event) => {
      if (!senderAllowedOrigin(event.sender)) return { ok: false, reason: "forbidden" };
      return printWithDialogManual();
    });

    ipcMain.handle("cm-pos-quick-print", async (event) => {
      if (!senderAllowedOrigin(event.sender)) return { ok: false, reason: "forbidden" };
      return quickPrintManual();
    });

    ipcMain.on("cm-pos-shell-print-html-invoke", (event, meta) => {
      let senderUrl = "";
      try {
        senderUrl = String(event.sender?.getURL?.() || "");
      } catch {
        senderUrl = "";
      }
      // #region agent log
      debugLog("H6_ipc_path", "windows-pos/main.js:ipc:on:shell-print-invoke", "shell_print_html_pre_invoke", {
        htmlLength: meta && typeof meta.htmlLength === "number" ? meta.htmlLength : 0,
        senderUrl,
        originAllowed: senderAllowedOrigin(event.sender),
      });
      // #endregion
    });

    ipcMain.handle("cm-pos-print-html", async (event, payload) => {
      if (!senderAllowedOrigin(event.sender)) {
        // #region agent log
        debugLog("H6_ipc_path", "windows-pos/main.js:ipcMain:cm-pos-print-html", "ipc_print_html_forbidden", {
          senderUrl: String(event.sender?.getURL?.() || ""),
        });
        // #endregion
        return { ok: false, reason: "forbidden" };
      }
      const html = typeof payload?.html === "string" ? payload.html : "";
      if (!html.trim()) {
        // #region agent log
        debugLog("H6_ipc_path", "windows-pos/main.js:ipcMain:cm-pos-print-html", "ipc_print_html_empty", {});
        // #endregion
        return { ok: false, reason: "empty_html" };
      }
      // #region agent log
      debugLog("H5_fallback_dialog", "windows-pos/main.js:ipcMain:cm-pos-print-html", "ipc_print_html_called", {
        htmlLength: html.length,
        senderUrl: String(event.sender?.getURL?.() || ""),
      });
      // #endregion
      return printHtmlDocumentInHiddenWindow(html);
    });

    ipcMain.handle("cm-pos-reset-cache-reload", async (event) => {
      if (!senderAllowedOrigin(event.sender)) {
        return { ok: false, reason: "forbidden" };
      }
      return clearRuntimeCacheAndReloadManual();
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
