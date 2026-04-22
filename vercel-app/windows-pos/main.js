const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const { app, BrowserWindow, Menu, shell, dialog, ipcMain, globalShortcut, screen } = require("electron");

function requireDeployPublicOrigin() {
  const candidates = [
    path.join(__dirname, "lib", "deploy-public-origin.cjs"),
    path.join(__dirname, "..", "lib", "deploy-public-origin.cjs"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return require(p);
  }
  return {
    resolveDeployPublicOrigin: () => "https://choongman-erp.vercel.app",
  };
}
const { resolveDeployPublicOrigin } = requireDeployPublicOrigin();
const DEPLOY_ORIGIN = resolveDeployPublicOrigin();

function readJsonFileIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    let raw = fs.readFileSync(filePath, "utf8");
    // PowerShell Set-Content -Encoding UTF8 등으로 저장된 UTF-8 BOM 이 있으면 JSON.parse 가 실패함 → 번들 URL 이 무시될 수 있음
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** package.json build.appId 와 동일 — 작업 표시줄·점프 목록이 Electron 기본 아이콘으로 남는 현상 완화 */
if (process.platform === "win32") {
  const pkgPath = path.join(__dirname, "package.json");
  const pkg = readJsonFileIfExists(pkgPath);
  const appId = (pkg && pkg.build && pkg.build.appId) || "com.choongman.erp.pos.windows";
  app.setAppUserModelId(appId);
}

/**
 * `userData` 루트(캐시·세션·runtime-config.json) — App **ready** 전, 첫 `getPath("userData")` 전에만.
 * 순서: (1) `WINDOWS_POS_USER_DATA` / `CM_POS_USER_DATA` (2) 설치 본(Windows) 기본: `…\resources\choongman-pos-user-data` (3) 그 외: Electron 기본(보통 AppData)
 * (2)는 `Program Files\…\resources`에 쓰기 권한이 없는 PC에선 자동으로 (3)으로 폴백.
 * AppData로 고정하려면 `CM_POS_USE_DEFAULT_USERDATA=1` 또는 (2) 대신) `WINDOWS_POS_USER_DATA`에 원하는 경로.
 */
function applyUserDataPathEarly() {
  if (!app || typeof app.setPath !== "function") return;
  const raw = (process.env.WINDOWS_POS_USER_DATA ?? process.env.CM_POS_USER_DATA) ?? "";
  const s = String(raw).trim();
  if (s) {
    let d = s;
    const portables = new Set(["portable", "next-to-exe", "beside-exe"]);
    if (portables.has(s.toLowerCase())) {
      d = path.join(path.dirname(process.execPath), "choongman-pos-user-data");
    } else {
      d = path.isAbsolute(s) ? s : path.resolve(s);
    }
    try {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
      app.setPath("userData", d);
      if (portables.has(String(raw).trim().toLowerCase()) && process.platform === "win32") {
        try {
          if (d.toLowerCase().includes("program files")) {
            console.warn(
              "[cm-pos] userData is next to exe but under Program Files — if writes fail, set WINDOWS_POS_USER_DATA to D:\\... or use a portable build outside Program Files"
            );
          }
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      console.warn("[cm-pos] WINDOWS_POS_USER_DATA ignored (use default AppData):", e && e.message ? e.message : e);
    }
    return;
  }
  if (String(process.env.CM_POS_USE_DEFAULT_USERDATA ?? process.env.WINDOWS_POS_USE_DEFAULT_USERDATA ?? "").trim() === "1") {
    return;
  }
  if (process.platform === "win32" && app.isPackaged) {
    const res = process.resourcesPath;
    if (!res || !String(res).trim()) return;
    const d = path.join(res, "choongman-pos-user-data");
    try {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
      const test = path.join(d, ".cm-pos-write-test");
      fs.writeFileSync(test, "1", "utf8");
      try {
        fs.unlinkSync(test);
      } catch {
        /* ignore */
      }
      app.setPath("userData", d);
    } catch (e) {
      console.warn(
        "[cm-pos] could not use resources\\choongman-pos-user-data; using default AppData:",
        e && e.message ? e.message : e
      );
    }
  }
}
applyUserDataPathEarly();

const DEFAULT_POS_URL = `${DEPLOY_ORIGIN}/pos/login`;

/** 무인쇄 HTML 작업 직후 다음 invoke 전까지 — Windows 스풀·Zywell 등이 컷/배출을 끝내도록 */
const POST_HTML_PRINT_SPOOL_FLUSH_MS = 750;
const UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 60 * 6; // 6 hours
const AUTO_UPDATE_ENABLED = String(process.env.WINDOWS_POS_AUTO_UPDATE || "1") !== "0";

function toOrigin(urlText) {
  try {
    return new URL(urlText).origin;
  } catch {
    return "";
  }
}

/**
 * 번들에 runtime-config.json 이 없거나 asar 복사에 실패해도 userData 쪽에 **항상** 기본본을 씀.
 * - 설치 직후: Windows 설치 본이면 `…\Program Files\…\resources\choongman-pos-user-data\runtime-config.json` (권한 실패 시 AppData)
 * - 0바이트 파일: 덮어써서 다시 씀
 * - 이후 정상 JSON이 있으면 건드리지 않음(사용자 편집 보존)
 */
function buildDefaultUserRuntimeConfigText() {
  const origin = String(DEPLOY_ORIGIN || "https://choongman-erp.vercel.app").replace(/\/+$/, "");
  return (
    JSON.stringify(
      {
        posUrl: `${origin}/pos/login`,
        allowedOrigin: origin,
        openDevtools: false,
        updateManifestUrl: `${origin}/downloads/windows-pos/latest.json`,
        kiosk: "1",
        print: {
          deviceName: "",
          receiptDeviceName: "",
          kitchenDeviceName: "",
          kitchen1DeviceName: "",
          kitchen2DeviceName: "",
          kitchen3DeviceName: "",
          silent: true,
          escPosCutAfterKitchenHtml: true,
          escPosCutAfterHallOrderHtml: false,
          escPosCutAfterPaymentReceiptHtml: false,
        },
      },
      null,
      4
    ) + "\n"
  );
}

function userRuntimeConfigNeedsSeeding(userPath) {
  try {
    if (!fs.existsSync(userPath)) return true;
    const st = fs.statSync(userPath);
    if (st.isFile() && st.size === 0) return true;
  } catch {
    return true;
  }
  return false;
}

/**
 * 첫 실행(또는 0바이트 복구): userData에 runtime-config.json이 반드시 생기게 함.
 */
function ensureUserRuntimeConfigSeeded() {
  try {
    const userPath = path.join(app.getPath("userData"), "runtime-config.json");
    if (!userRuntimeConfigNeedsSeeding(userPath)) return;
    const bundledPath = path.join(app.getAppPath(), "runtime-config.json");
    fs.mkdirSync(path.dirname(userPath), { recursive: true });
    let written = false;
    if (fs.existsSync(bundledPath)) {
      try {
        fs.copyFileSync(bundledPath, userPath);
        written = true;
      } catch (e1) {
        try {
          const raw = fs.readFileSync(bundledPath, "utf8");
          fs.writeFileSync(userPath, raw, "utf8");
          written = true;
        } catch (e2) {
          console.warn(
            "[cm-pos] copy bundled runtime-config (asar→userData) failed, using generated default",
            e1 && e1.message,
            e2 && e2.message
          );
        }
      }
    } else {
      console.warn("[cm-pos] packaged runtime-config.json not found, writing generated default to userData");
    }
    if (!written) {
      fs.writeFileSync(userPath, buildDefaultUserRuntimeConfigText(), "utf8");
    }
  } catch (e) {
    console.warn("[cm-pos] ensureUserRuntimeConfigSeeded:", e && e.message ? e.message : e);
  }
}

function readRuntimeConfig() {
  const bundledPath = path.join(app.getAppPath(), "runtime-config.json");
  const userPath = path.join(app.getPath("userData"), "runtime-config.json");

  const bundled = readJsonFileIfExists(bundledPath) || {};
  const user = readJsonFileIfExists(userPath) || {};
  const merged = { ...bundled, ...user };
  // 설치본(bundled)에 배포 URL이 있으면 항상 우선 — userData 에 남은 예전 내부용 URL 이 덮어쓰지 않게
  if (bundled.posUrl) {
    merged.posUrl = bundled.posUrl;
    if (Object.prototype.hasOwnProperty.call(bundled, "allowedOrigin")) {
      merged.allowedOrigin = bundled.allowedOrigin;
    } else {
      merged.allowedOrigin = toOrigin(bundled.posUrl);
    }
  }
  if (Object.prototype.hasOwnProperty.call(bundled, "updateManifestUrl")) {
    merged.updateManifestUrl = bundled.updateManifestUrl;
  }
  return merged;
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

function readConfigInt(value, defaultValue, minValue, maxValue) {
  const n = Number(value);
  if (!Number.isFinite(n)) return defaultValue;
  const i = Math.trunc(n);
  const lo = Number.isFinite(minValue) ? minValue : i;
  const hi = Number.isFinite(maxValue) ? maxValue : i;
  return Math.min(hi, Math.max(lo, i));
}

/**
 * 원격 POS URL이 did-fail-load 없이 무한 대기할 때(오프라인·DNS 지연 등) 흰 화면으로 멈추지 않게 함.
 * `runtime-config.json` 의 `mainLoadTimeoutMs` 또는 환경 변수 `WINDOWS_POS_MAIN_LOAD_TIMEOUT_MS` (밀리초).
 */
const POS_MAIN_LOAD_WATCHDOG_MS = readConfigInt(
  process.env.WINDOWS_POS_MAIN_LOAD_TIMEOUT_MS !== undefined && process.env.WINDOWS_POS_MAIN_LOAD_TIMEOUT_MS !== ""
    ? process.env.WINDOWS_POS_MAIN_LOAD_TIMEOUT_MS
    : runtimeConfig.mainLoadTimeoutMs,
  45000,
  5000,
  300000
);

/**
 * 문서는 캐시·SW로 빨리 did-finish-load(워치독 취소) 되지만 JS 청크가 끊기면 흰 화면만 남는 경우.
 * `runtime-config.json`의 `posDomBlankCheckMs` 또는 `WINDOWS_POS_DOM_BLANK_CHECK_MS`.
 */
const POS_DOM_BLANK_CHECK_MS = readConfigInt(
  process.env.WINDOWS_POS_DOM_BLANK_CHECK_MS !== undefined && process.env.WINDOWS_POS_DOM_BLANK_CHECK_MS !== ""
    ? process.env.WINDOWS_POS_DOM_BLANK_CHECK_MS
    : runtimeConfig.posDomBlankCheckMs,
  22000,
  8000,
  120000
);

const POS_URL = process.env.WINDOWS_POS_URL || runtimeConfig.posUrl || DEFAULT_POS_URL;
const ALLOWED_ORIGIN = process.env.WINDOWS_POS_ALLOWED_ORIGIN || runtimeConfig.allowedOrigin || toOrigin(POS_URL);
const isKiosk = String(process.env.WINDOWS_POS_KIOSK || runtimeConfig.kiosk || "1") !== "0";
const updateManifestUrl =
  process.env.WINDOWS_UPDATE_MANIFEST_URL ||
  runtimeConfig.updateManifestUrl ||
  `${ALLOWED_ORIGIN}/downloads/windows-pos/latest.json`;

/** 디버그: Network 탭 등 — `runtime-config.json` 의 openDevtools 또는 환경 변수 WINDOWS_POS_DEVTOOLS=1 */
const OPEN_DEVTOOLS_ON_START = readConfigBool(
  process.env.WINDOWS_POS_DEVTOOLS !== undefined && process.env.WINDOWS_POS_DEVTOOLS !== ""
    ? process.env.WINDOWS_POS_DEVTOOLS
    : runtimeConfig.openDevtools,
  false
);

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
/**
 * HTML 무인쇄 직후 WinSpool RAW로 ESC/POS 절단 전송(Zywell 등 GDI만으로는 컷 없음).
 * 끄기: runtime-config.json `"printEscPosCutAfterHtml": false` 또는 환경 변수 WINDOWS_POS_PRINT_ESC_POS_CUT=0
 */
const PRINT_ESC_POS_CUT_AFTER_HTML = readConfigBool(
  process.env.WINDOWS_POS_PRINT_ESC_POS_CUT !== undefined && process.env.WINDOWS_POS_PRINT_ESC_POS_CUT !== ""
    ? process.env.WINDOWS_POS_PRINT_ESC_POS_CUT
    : runtimeConfig.printEscPosCutAfterHtml ?? runtimeConfig.print?.escPosCutAfterHtml,
  true
);
/**
 * (레거시) 영수증 전체에 공통 — `printReceiptKind` 미지정 시에만 사용.
 * 세분화: `print.escPosCutAfterKitchenHtml` / `escPosCutAfterHallOrderHtml` / `escPosCutAfterPaymentReceiptHtml`
 * 또는 WINDOWS_POS_ESC_POS_CUT_AFTER_* 환경 변수.
 */
const LEGACY_ESC_POS_CUT_AFTER_RECEIPT_HTML = readConfigBool(
  process.env.WINDOWS_POS_ESC_POS_CUT_AFTER_RECEIPT_HTML !== undefined &&
    process.env.WINDOWS_POS_ESC_POS_CUT_AFTER_RECEIPT_HTML !== ""
    ? process.env.WINDOWS_POS_ESC_POS_CUT_AFTER_RECEIPT_HTML
    : runtimeConfig.printEscPosCutAfterReceiptHtml ?? runtimeConfig.print?.escPosCutAfterReceiptHtml,
  false
);

function readEscPosCutKitchenResolved() {
  if (process.env.WINDOWS_POS_ESC_POS_CUT_AFTER_KITCHEN_HTML !== undefined && process.env.WINDOWS_POS_ESC_POS_CUT_AFTER_KITCHEN_HTML !== "") {
    return readConfigBool(process.env.WINDOWS_POS_ESC_POS_CUT_AFTER_KITCHEN_HTML, true);
  }
  const p = runtimeConfig.print || {};
  if (Object.prototype.hasOwnProperty.call(p, "escPosCutAfterKitchenHtml")) {
    return readConfigBool(p.escPosCutAfterKitchenHtml, true);
  }
  if (runtimeConfig.printEscPosCutAfterKitchenHtml !== undefined) {
    return readConfigBool(runtimeConfig.printEscPosCutAfterKitchenHtml, true);
  }
  return true;
}

function readEscPosCutHallResolved() {
  if (process.env.WINDOWS_POS_ESC_POS_CUT_AFTER_HALL_ORDER_HTML !== undefined && process.env.WINDOWS_POS_ESC_POS_CUT_AFTER_HALL_ORDER_HTML !== "") {
    return readConfigBool(process.env.WINDOWS_POS_ESC_POS_CUT_AFTER_HALL_ORDER_HTML, false);
  }
  const p = runtimeConfig.print || {};
  if (Object.prototype.hasOwnProperty.call(p, "escPosCutAfterHallOrderHtml")) {
    return readConfigBool(p.escPosCutAfterHallOrderHtml, false);
  }
  if (runtimeConfig.printEscPosCutAfterHallOrderHtml !== undefined) {
    return readConfigBool(runtimeConfig.printEscPosCutAfterHallOrderHtml, false);
  }
  return LEGACY_ESC_POS_CUT_AFTER_RECEIPT_HTML;
}

function readEscPosCutPaymentResolved() {
  if (process.env.WINDOWS_POS_ESC_POS_CUT_AFTER_PAYMENT_RECEIPT_HTML !== undefined && process.env.WINDOWS_POS_ESC_POS_CUT_AFTER_PAYMENT_RECEIPT_HTML !== "") {
    return readConfigBool(process.env.WINDOWS_POS_ESC_POS_CUT_AFTER_PAYMENT_RECEIPT_HTML, false);
  }
  const p = runtimeConfig.print || {};
  if (Object.prototype.hasOwnProperty.call(p, "escPosCutAfterPaymentReceiptHtml")) {
    return readConfigBool(p.escPosCutAfterPaymentReceiptHtml, false);
  }
  if (runtimeConfig.printEscPosCutAfterPaymentReceiptHtml !== undefined) {
    return readConfigBool(runtimeConfig.printEscPosCutAfterPaymentReceiptHtml, false);
  }
  return LEGACY_ESC_POS_CUT_AFTER_RECEIPT_HTML;
}

const ESC_POS_CUT_AFTER_KITCHEN_HTML = readEscPosCutKitchenResolved();
const ESC_POS_CUT_AFTER_HALL_ORDER_HTML = readEscPosCutHallResolved();
const ESC_POS_CUT_AFTER_PAYMENT_RECEIPT_HTML = readEscPosCutPaymentResolved();

/**
 * @param {object} payload cm-pos-print-html IPC payload
 */
function shouldSendEscPosRawCut(payload) {
  if (!PRINT_ESC_POS_CUT_AFTER_HTML) return false;
  if (payload && Object.prototype.hasOwnProperty.call(payload, "escPosCutOverride")) {
    return Boolean(payload.escPosCutOverride);
  }
  const role = payload?.printRole;
  if (role === "kitchen") return ESC_POS_CUT_AFTER_KITCHEN_HTML;
  if (role === "receipt") {
    const rk = payload?.printReceiptKind;
    if (rk === "payment") return ESC_POS_CUT_AFTER_PAYMENT_RECEIPT_HTML;
    if (rk === "hall_order") return ESC_POS_CUT_AFTER_HALL_ORDER_HTML;
    return LEGACY_ESC_POS_CUT_AFTER_RECEIPT_HTML;
  }
  return false;
}
const PRINT_HTML_DEBUG_ENABLED = readConfigBool(
  process.env.CM_POS_DEBUG_LOG_ENABLED !== undefined && process.env.CM_POS_DEBUG_LOG_ENABLED !== ""
    ? process.env.CM_POS_DEBUG_LOG_ENABLED
    : runtimeConfig.printDebugLogEnabled,
  false
);
const PRINT_HTML_INGEST_URL = String(
  process.env.CM_POS_DEBUG_LOG_INGEST_URL ?? runtimeConfig.printDebugLogIngestUrl ?? ""
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
const PRINT_HTML_SETTLE_MS = readConfigInt(
  process.env.WINDOWS_POS_PRINT_HTML_SETTLE_MS || runtimeConfig.printHtmlSettleMs || 550,
  550,
  150,
  5000
);
const POST_HTML_PRINT_SPOOL_FLUSH_MS_RESOLVED = readConfigInt(
  process.env.WINDOWS_POS_PRINT_SPOOL_FLUSH_MS || runtimeConfig.postHtmlPrintSpoolFlushMs || POST_HTML_PRINT_SPOOL_FLUSH_MS,
  POST_HTML_PRINT_SPOOL_FLUSH_MS,
  0,
  10000
);
const PRINT_HTML_SILENT_RETRY_COUNT = readConfigInt(
  process.env.WINDOWS_POS_PRINT_HTML_RETRY || runtimeConfig.printHtmlSilentRetryCount || 1,
  1,
  0,
  3
);

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
  if (!PRINT_HTML_DEBUG_ENABLED) return;
  const payload = {
    sessionId: `${Date.now()}-${process.pid}`,
    runId: `windows-pos-${app.getVersion()}`,
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
    if (PRINT_HTML_INGEST_URL && typeof fetch === "function") {
      fetch(PRINT_HTML_INGEST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": payload.sessionId },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }
  } catch {
    /* ignore */
  }
  try {
    if (!PRINT_HTML_INGEST_URL) return;
    const { request } = require("http");
    const req = request(
      PRINT_HTML_INGEST_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": payload.sessionId,
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
/** POS 메인 URL 로드 실패 시 재시도(did-fail-load 일시 오류·리다이렉트 완화) */
let posMainLoadFailAttempts = 0;
let posMainLoadRetryTimer = null;
let posMainLoadWatchdogTimer = null;
let posDomBlankWatchdogTimer = null;
const POS_MAIN_LOAD_MAX_ATTEMPTS = 5;
let customerDisplayWindow = null;
let isCheckingUpdate = false;
let customerDisplayConfig = {
  enabled: false,
  autoOpen: true,
  monitorPreference: "secondary-first",
  storeCode: "",
};
let customerDisplayLastState = null;

function getCustomerDisplayUrl() {
  try {
    const url = new URL(POS_URL);
    url.pathname = "/pos/customer-display";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return `${ALLOWED_ORIGIN || DEPLOY_ORIGIN}/pos/customer-display`;
  }
}

function resolveCustomerDisplayTarget() {
  const displays = screen.getAllDisplays();
  if (!displays.length) return null;
  if (customerDisplayConfig.monitorPreference === "primary-only") {
    return screen.getPrimaryDisplay();
  }
  const primary = screen.getPrimaryDisplay();
  const secondary = displays.find((d) => d.id !== primary.id);
  return secondary || primary;
}

function placeCustomerWindowOnTarget(win) {
  if (!win || win.isDestroyed()) return;
  const target = resolveCustomerDisplayTarget();
  if (!target) return;
  const b = target.bounds;
  win.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height }, false);
}

function broadcastCustomerDisplayState(payload) {
  customerDisplayLastState = payload;
  if (customerDisplayWindow && !customerDisplayWindow.isDestroyed()) {
    customerDisplayWindow.webContents.send("cm-pos-customer-display-state", payload);
  }
}

async function ensureCustomerDisplayWindow(forceOpen = false) {
  const allowOpen = forceOpen || (customerDisplayConfig.enabled && customerDisplayConfig.autoOpen);
  if (!allowOpen) return { ok: true, reason: "disabled" };
  if (customerDisplayWindow && !customerDisplayWindow.isDestroyed()) {
    placeCustomerWindowOnTarget(customerDisplayWindow);
    customerDisplayWindow.show();
    customerDisplayWindow.focus();
    return { ok: true };
  }
  try {
    customerDisplayWindow = new BrowserWindow({
      width: 1200,
      height: 900,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        partition: "persist:choongman-pos",
        spellcheck: false,
      },
    });
    customerDisplayWindow.setMenuBarVisibility(false);
    customerDisplayWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (ALLOWED_ORIGIN && url.startsWith(ALLOWED_ORIGIN)) {
        return { action: "allow" };
      }
      shell.openExternal(url);
      return { action: "deny" };
    });
    customerDisplayWindow.webContents.on("will-navigate", (event, url) => {
      if (ALLOWED_ORIGIN && !url.startsWith(ALLOWED_ORIGIN)) {
        event.preventDefault();
        shell.openExternal(url);
      }
    });
    customerDisplayWindow.on("closed", () => {
      customerDisplayWindow = null;
    });
    await customerDisplayWindow.loadURL(getCustomerDisplayUrl());
    placeCustomerWindowOnTarget(customerDisplayWindow);
    customerDisplayWindow.setFullScreen(true);
    customerDisplayWindow.show();
    if (customerDisplayLastState) {
      customerDisplayWindow.webContents.send("cm-pos-customer-display-state", customerDisplayLastState);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  }
}

function closeCustomerDisplayWindow() {
  try {
    if (customerDisplayWindow && !customerDisplayWindow.isDestroyed()) {
      customerDisplayWindow.close();
    }
    customerDisplayWindow = null;
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  }
}

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

/** 로컬 offline.html 또는 허용 origin — 복구용 IPC(cm-pos-reload-pos-url)만 허용 */
function senderAllowedForTrustedShell(sender) {
  if (!sender) return false;
  try {
    const url = String(sender.getURL() || "");
    if (ALLOWED_ORIGIN && url.startsWith(ALLOWED_ORIGIN)) return true;
    if (url.startsWith("file:") && url.includes("offline.html")) return true;
    return false;
  } catch {
    return false;
  }
}

function clearPosMainLoadRetryTimer() {
  if (posMainLoadRetryTimer) {
    try {
      clearTimeout(posMainLoadRetryTimer);
    } catch {
      /* ignore */
    }
    posMainLoadRetryTimer = null;
  }
}

function clearPosMainLoadWatchdog() {
  if (posMainLoadWatchdogTimer) {
    try {
      clearTimeout(posMainLoadWatchdogTimer);
    } catch {
      /* ignore */
    }
    posMainLoadWatchdogTimer = null;
  }
}

function clearPosDomBlankWatchdog() {
  if (posDomBlankWatchdogTimer) {
    try {
      clearTimeout(posDomBlankWatchdogTimer);
    } catch {
      /* ignore */
    }
    posDomBlankWatchdogTimer = null;
  }
}

/**
 * 원격 origin 로드는 됐는데(메인 URL 워치독만으로는 누락) 클라이언트 번들 실패·무한 대기로 흰 화면만 이어질 때 offline.html
 */
function schedulePosDomBlankWatchdog() {
  clearPosDomBlankWatchdog();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  posDomBlankWatchdogTimer = setTimeout(() => {
    posDomBlankWatchdogTimer = null;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const u = mainWindow.webContents.getURL() || "";
      if (ALLOWED_ORIGIN && u.startsWith(ALLOWED_ORIGIN)) {
        void mainWindow.webContents
          .executeJavaScript(
            "(() => { try { const b = document && document.body; if (!b) return true; if (b.querySelector('svg,img,button,input,select,form,main,nav,header,footer,textarea,canvas,iframe')) return false; const t = (b.innerText || '').replace(/\\s/g, ''); if (t.length > 0) return false; return ((b.textContent || '').replace(/\\s/g, '')).length === 0; } catch (e) { return true; } })()"
          )
          .then((isBlank) => {
            if (isBlank) {
              console.warn("[cm-pos] DOM blank watchdog: nothing rendered, showing offline fallback");
              loadOfflineFallbackPage();
            }
          })
          .catch(() => {
            loadOfflineFallbackPage();
          });
      }
    } catch (e) {
      console.warn("[cm-pos] dom blank probe failed", e && e.message ? e.message : e);
    }
  }, POS_DOM_BLANK_CHECK_MS);
}

/** POS URL 로드 시작 후 일정 시간 안에 화면이 확정되지 않으면 offline.html 로 폴백 */
function schedulePosMainLoadWatchdog() {
  clearPosMainLoadWatchdog();
  posMainLoadWatchdogTimer = setTimeout(() => {
    posMainLoadWatchdogTimer = null;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const u = mainWindow.webContents.getURL() || "";
      if (ALLOWED_ORIGIN && u.startsWith(ALLOWED_ORIGIN)) return;
      if (u.includes("offline.html")) return;
      console.warn("[cm-pos] main URL load watchdog: no usable page, showing offline fallback");
      loadOfflineFallbackPage();
    } catch (e) {
      console.warn("[cm-pos] watchdog check failed", e && e.message ? e.message : e);
      loadOfflineFallbackPage();
    }
  }, POS_MAIN_LOAD_WATCHDOG_MS);
}

function loadOfflineFallbackPage() {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    clearPosDomBlankWatchdog();
    try {
      mainWindow.webContents.stop();
    } catch {
      /* ignore */
    }
    clearPosMainLoadRetryTimer();
    posMainLoadFailAttempts = 0;
    clearPosMainLoadWatchdog();
    void mainWindow.loadFile(path.join(__dirname, "offline.html"));
  } catch (e) {
    console.error("[cm-pos] loadFile offline failed", e);
  }
}

function schedulePosMainUrlRetryFromFailure() {
  clearPosMainLoadRetryTimer();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (posMainLoadFailAttempts >= POS_MAIN_LOAD_MAX_ATTEMPTS) {
    posMainLoadFailAttempts = 0;
    loadOfflineFallbackPage();
    return;
  }
  posMainLoadFailAttempts += 1;
  const delay = Math.min(350 + posMainLoadFailAttempts * 450, 4000);
  posMainLoadRetryTimer = setTimeout(() => {
    posMainLoadRetryTimer = null;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    clearPosDomBlankWatchdog();
    try {
      void mainWindow.loadURL(POS_URL, {
        extraHeaders: "Cache-Control: no-cache\r\nPragma: no-cache\r\n",
      });
    } catch (e) {
      console.error("[cm-pos] loadURL retry error", e);
    }
  }, delay);
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

/**
 * 수동 인쇄(시스템 대화상자) — 무인쇄와 동일한 80mm·스케일·여백을 넣지 않으면 드라이버 기본(A4)으로
 * 좁은 영수증이 페이지 안에 축소되어 인쇄되는 PC가 많음.
 * @param {string} [resolvedDevice] runtime-config 매칭 프린터(있으면 대화상자에도 동일 기기 우선)
 */
function getThermalHtmlDialogPrintOptions(resolvedDevice) {
  const dev = String(resolvedDevice || "").trim() || DEFAULT_PRINT_DEVICE || "";
  const options = {
    silent: false,
    printBackground: true,
    scaleFactor: 100,
    landscape: false,
    pagesPerSheet: 1,
    margins: { marginType: "printableArea" },
    pageSize: {
      width: THERMAL_PAGE_WIDTH_80MM,
      height: THERMAL_PAGE_HEIGHT_600MM,
    },
  };
  if (dev) options.deviceName = dev;
  return options;
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
    /** none 은 논리 폭을 용지 끝까지 쓰여 열전사 오른쪽 비인쇄 영역에서 잘리기 쉬움 → 드라이버 printable area 사용 */
    margins: { marginType: "printableArea" },
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

/** 영수증·주방전 HTML: 렌더러 iframe.print()는 Electron에서 무시되는 경우가 많아 메인에서 숨은 창으로 인쇄
 * @param {{ preferDialog?: boolean }} [options] preferDialog true면 무인쇄·열전사 최적화를 건너뛰고 시스템 인쇄 대화상자만 사용(프린터 선택·미리보기)
 */
async function printHtmlDocumentInHiddenWindow(htmlString, options = {}) {
  const preferDialog = Boolean(options && options.preferDialog);
  const tmpRoot = app.getPath("temp");
  const tmpPath = path.join(
    tmpRoot,
    `cm-pos-print-${Date.now()}-${Math.random().toString(16).slice(2)}.html`
  );
  let printWindow;
  try {
    const warnings = [];
    let resolvedDevice = resolveThermalDeviceForHtmlPrintSync(options);
    if (resolvedDevice && mainWindow && !mainWindow.isDestroyed()) {
      try {
        const printers = await mainWindow.webContents.getPrintersAsync();
        const matched = printers.some((p) => String(p.name || "").trim() === resolvedDevice);
        if (!matched) {
          warnings.push(`configured device not found: ${resolvedDevice}`);
          resolvedDevice = "";
        }
      } catch {
        /* ignore */
      }
    }
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
    const printWinOptions = {
      width: PRINT_HTML_OFFSCREEN_WIDTH,
      height: PRINT_HTML_OFFSCREEN_HEIGHT,
      show: false,
      /** 매 인쇄마다 작업 표시줄 아이콘이 깜빡이지 않게 */
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    };
    /** 수동 인쇄(시스템 대화상자): 부모 없이 숨은 창만 쓰면 일부 Windows에서 대화상자가 안 뜨거나 뒤에 깔림 */
    if (preferDialog && mainWindow && !mainWindow.isDestroyed()) {
      printWinOptions.parent = mainWindow;
    }
    printWindow = new BrowserWindow(printWinOptions);
    try {
      printWindow.webContents.setZoomFactor(1);
    } catch {
      /* ignore */
    }
    await printWindow.loadFile(tmpPath);
    await new Promise((r) => setTimeout(r, PRINT_HTML_SETTLE_MS));

    if (preferDialog) {
      const printStage = "dialog_only";
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.focus();
        }
        /** 완전 비표시 창에서 print(silent:false) 호출 시 OS 인쇄 창이 생략되는 사례 완화 */
        printWindow.showInactive();
      } catch {
        /* ignore */
      }
      const r = await printWebContentsPromise(
        printWindow.webContents,
        getThermalHtmlDialogPrintOptions(resolvedDevice)
      );
      debugLog("H5_fallback_dialog", "windows-pos/main.js:printHtmlDocumentInHiddenWindow:preferDialog", "print_dialog_only", {
        ok: Boolean(r.success),
        reason: String(r.failureReason || ""),
      });
      return {
        ok: r.success,
        reason: r.failureReason || (r.success ? "" : "print_failed"),
        printStage,
        warnings,
        usedDevice: "",
      };
    }

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
    let thermalAttempts = 1;
    while (!r.success && thermalAttempts <= PRINT_HTML_SILENT_RETRY_COUNT) {
      thermalAttempts += 1;
      await new Promise((x) => setTimeout(x, 120 * thermalAttempts));
      r = await printWebContentsPromise(printWindow.webContents, thermalOpts);
    }
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
      let driverAttempts = 1;
      while (!r.success && driverAttempts <= PRINT_HTML_SILENT_RETRY_COUNT) {
        driverAttempts += 1;
        await new Promise((x) => setTimeout(x, 120 * driverAttempts));
        r = await printWebContentsPromise(printWindow.webContents, driverDefaultOpts);
      }
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
      r = await printWebContentsPromise(
        printWindow.webContents,
        getThermalHtmlDialogPrintOptions(resolvedDevice)
      );
      if (!DEFAULT_PRINT_DEVICE) {
        warnings.push("print dialog fallback used without explicit thermal device");
      }
    }
    // #region agent log
    debugLog("H5_fallback_dialog", "windows-pos/main.js:printHtmlDocumentInHiddenWindow:final", "print_html_final", {
      ok: Boolean(r.success),
      finalFailureReason: String(r.failureReason || ""),
      printStage,
    });
    // #endregion
    /** deviceName 없이 무인쇄 성공 시 실제로는 OS 기본 프린터로 나감 — 절단(RAW) 대상 이름이 비지 않게 보정 */
    let usedDeviceOut = resolvedDevice || "";
    if (r.success && !String(usedDeviceOut).trim() && printStage !== "dialog") {
      usedDeviceOut = await getWindowsDefaultPrinterName();
    }
    return {
      ok: r.success,
      reason: r.failureReason || (r.success ? "" : "print_failed"),
      printStage,
      warnings,
      usedDevice: usedDeviceOut,
    };
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e), usedDevice: "" };
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

/**
 * 매 인쇄 시 runtime-config 재읽기 → 매장에서 JSON만 고쳐도 반영(재시작 없이 시도).
 * - print.deviceName / printDeviceName: 레거시 기본(영수증 후보)
 * - print.receiptDeviceName: 영수증
 * - print.kitchen1~3DeviceName: 주방 분할 시 해당 Windows 프린터 이름
 * - print.kitchenDeviceName: 주방 공통 폴백
 */
function resolveThermalDeviceForHtmlPrintSync(opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const cfg = readRuntimeConfig();
  const p = cfg.print || {};
  const legacyDefault = String(
    process.env.WINDOWS_POS_PRINT_DEVICE ?? cfg.printDeviceName ?? p.deviceName ?? ""
  ).trim();
  const receiptDev = String(p.receiptDeviceName || "").trim() || legacyDefault;

  const explicit = String(o.deviceName || "").trim();
  if (explicit) return explicit;

  if (o.printRole === "kitchen") {
    const stRaw = o.kitchenStation != null ? Number(o.kitchenStation) : 1;
    const st = Math.min(3, Math.max(1, Number.isFinite(stRaw) ? stRaw : 1));
    const k1 = String(p.kitchen1DeviceName || "").trim();
    const k2 = String(p.kitchen2DeviceName || "").trim();
    const k3 = String(p.kitchen3DeviceName || "").trim();
    const kAny = String(p.kitchenDeviceName || "").trim();
    const slot = st === 2 ? k2 : st === 3 ? k3 : k1;
    return slot || kAny || receiptDev;
  }
  return receiptDev;
}

/** OS 기본 프린터 표시 이름(무인쇄 시 deviceName 미지정과 동일 대상) */
async function getWindowsDefaultPrinterName() {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return "";
    const printers = await mainWindow.webContents.getPrintersAsync();
    const def = printers.find((p) => p.isDefault);
    return def && def.name ? String(def.name).trim() : "";
  } catch {
    return "";
  }
}

/** runtime-config에 deviceName이 없을 때 Windows 무인쇄가 실패·대화상자로 떨어지는 경우가 많아 OS 기본 프린터를 사용 */
async function resolvePrintDeviceNameForJob() {
  const configured = resolveThermalDeviceForHtmlPrintSync({ printRole: "receipt" });
  if (configured) return configured;
  return getWindowsDefaultPrinterName();
}

/**
 * 프린터 점검 UI·IPC — 항상 readRuntimeConfig() 기준(파일 수정 후「다시 읽기」시 반영).
 * 주의: 모듈 로드 시 캡처한 DEFAULT_PRINT_* 는 사용하지 말 것(재시작 전까지 갱신 안 됨).
 */
function getPrintConfigSnapshotForIpc() {
  const cfg = readRuntimeConfig();
  const p = cfg.print || {};
  const legacyDefault = String(
    process.env.WINDOWS_POS_PRINT_DEVICE ?? cfg.printDeviceName ?? p.deviceName ?? ""
  ).trim();
  const silent = readConfigBool(
    process.env.WINDOWS_POS_PRINT_SILENT !== undefined && process.env.WINDOWS_POS_PRINT_SILENT !== ""
      ? process.env.WINDOWS_POS_PRINT_SILENT
      : cfg.printSilent ?? p.silent ?? true,
    true
  );
  return {
    silent,
    deviceName: legacyDefault || null,
    receiptDeviceName: String(p.receiptDeviceName || "").trim() || legacyDefault || null,
    kitchen1DeviceName: String(p.kitchen1DeviceName || "").trim() || null,
    kitchen2DeviceName: String(p.kitchen2DeviceName || "").trim() || null,
    kitchen3DeviceName: String(p.kitchen3DeviceName || "").trim() || null,
    kitchenDeviceName: String(p.kitchenDeviceName || "").trim() || null,
  };
}

function getEscPosCutScriptPath() {
  const name = "send-thermal-escpos-cut.ps1";
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "scripts", name);
  }
  return path.join(__dirname, "scripts", name);
}

function getEscPosDrawerScriptPath() {
  const name = "send-thermal-escpos-drawer-kick.ps1";
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "scripts", name);
  }
  return path.join(__dirname, "scripts", name);
}

/** HTML 인쇄 후 RAW ESC/POS로 용지 절단 — 실패해도 인쇄 성공은 유지 */
function sendEscPosCutForPrinter(printerName) {
  return new Promise((resolve) => {
    const name = String(printerName || "").trim();
    if (!name) {
      resolve({ ok: false, reason: "no_printer" });
      return;
    }
    const script = getEscPosCutScriptPath();
    if (!fs.existsSync(script)) {
      console.warn("[cm-pos] ESC/POS cut script missing:", script);
      resolve({ ok: false, reason: "no_script" });
      return;
    }
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-PrinterName", name],
      { windowsHide: true, timeout: 30000, maxBuffer: 256 * 1024 },
      (err, _stdout, stderr) => {
        if (err) {
          console.warn("[cm-pos] ESC/POS cut failed:", err.message, stderr ? String(stderr) : "");
          resolve({ ok: false, reason: String(err.message || err) });
          return;
        }
        resolve({ ok: true });
      }
    );
  });
}

/**
 * 영수증(또는 동일 포트) ESC/POS 드로어 — 실패해도 주문/결제는 영향 없음
 */
function sendEscPosDrawerKickForPrinter(printerName) {
  return new Promise((resolve) => {
    const name = String(printerName || "").trim();
    if (!name) {
      resolve({ ok: false, reason: "no_printer" });
      return;
    }
    const script = getEscPosDrawerScriptPath();
    if (!fs.existsSync(script)) {
      console.warn("[cm-pos] ESC/POS drawer script missing:", script);
      resolve({ ok: false, reason: "no_script" });
      return;
    }
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-PrinterName", name],
      { windowsHide: true, timeout: 30000, maxBuffer: 256 * 1024 },
      (err, _stdout, stderr) => {
        if (err) {
          console.warn("[cm-pos] ESC/POS drawer kick failed:", err.message, stderr ? String(stderr) : "");
          resolve({ ok: false, reason: String(err.message || err) });
          return;
        }
        resolve({ ok: true });
      }
    );
  });
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
          label: "Toggle Developer Tools",
          role: "toggleDevTools",
          accelerator: process.platform === "darwin" ? "Alt+Command+I" : "F12",
        },
        {
          label: "Reset cache + reload",
          accelerator: "CommandOrControl+Shift+R",
          click: () => {
            void clearRuntimeCacheAndReloadManual();
          },
        },
        {
          label: "Open runtime-config.json in Explorer",
          click: () => {
            try {
              ensureUserRuntimeConfigSeeded();
              const p = path.join(app.getPath("userData"), "runtime-config.json");
              if (fs.existsSync(p)) {
                shell.showItemInFolder(p);
              } else {
                void shell.openPath(path.dirname(p));
              }
            } catch (e) {
              console.warn("[cm-pos] show runtime-config folder", e);
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

  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame === false) return;
    const urlStr = typeof validatedURL === "string" ? validatedURL : "";
    if (urlStr.startsWith("file:")) return;
    try {
      console.error("[cm-pos] did-fail-load", errorCode, errorDescription, urlStr);
    } catch {
      /* ignore */
    }
    clearPosDomBlankWatchdog();
    schedulePosMainUrlRetryFromFailure();
  });

  mainWindow.webContents.on("did-finish-load", () => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const u = mainWindow.webContents.getURL() || "";
      if (u.includes("offline.html")) {
        clearPosDomBlankWatchdog();
        clearPosMainLoadWatchdog();
        clearPosMainLoadRetryTimer();
        posMainLoadFailAttempts = 0;
        return;
      }
      if (ALLOWED_ORIGIN && u.startsWith(ALLOWED_ORIGIN)) {
        posMainLoadFailAttempts = 0;
        clearPosMainLoadRetryTimer();
        clearPosMainLoadWatchdog();
        schedulePosDomBlankWatchdog();
      }
    } catch {
      /* ignore */
    }
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
  schedulePosMainLoadWatchdog();

  if (OPEN_DEVTOOLS_ON_START) {
    mainWindow.webContents.once("did-finish-load", () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.openDevTools({ mode: "detach" });
      }
    });
  }

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
    ensureUserRuntimeConfigSeeded();
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

    ipcMain.handle("cm-pos-reload-pos-url", async (event) => {
      if (!senderAllowedForTrustedShell(event.sender)) {
        return { ok: false, reason: "forbidden" };
      }
      if (!mainWindow || mainWindow.isDestroyed()) {
        return { ok: false, reason: "no_window" };
      }
      posMainLoadFailAttempts = 0;
      clearPosMainLoadRetryTimer();
      clearPosDomBlankWatchdog();
      schedulePosMainLoadWatchdog();
      try {
        await mainWindow.loadURL(POS_URL, {
          extraHeaders: "Cache-Control: no-cache\r\nPragma: no-cache\r\n",
        });
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: String(e && e.message ? e.message : e) };
      }
    });

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
      return getPrintConfigSnapshotForIpc();
    });

    ipcMain.handle("cm-pos-open-cash-drawer", async (event) => {
      if (!senderAllowedOrigin(event.sender)) {
        return { ok: false, reason: "forbidden" };
      }
      let device = String(resolveThermalDeviceForHtmlPrintSync({ printRole: "receipt" }) || "").trim();
      if (!device) {
        device = String((await resolvePrintDeviceNameForJob()) || "").trim();
      }
      if (!device) {
        return { ok: false, reason: "no_printer" };
      }
      const r = await sendEscPosDrawerKickForPrinter(device);
      return r.ok
        ? { ok: true, usedDevice: device }
        : { ok: false, reason: String(r.reason || "drawer_kick_failed") };
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
      const ks = payload?.kitchenStation;
      const kitchenStation =
        ks === 1 || ks === 2 || ks === 3 ? ks : ks != null ? Number(ks) : undefined;
      const result = await printHtmlDocumentInHiddenWindow(html, {
        preferDialog: Boolean(payload?.preferDialog),
        printRole: payload?.printRole === "kitchen" || payload?.printRole === "receipt" ? payload.printRole : undefined,
        kitchenStation: Number.isFinite(kitchenStation) ? Math.min(3, Math.max(1, kitchenStation)) : undefined,
        deviceName: typeof payload?.deviceName === "string" ? payload.deviceName : "",
      });
      const out = { ...result };
      const sendCut = shouldSendEscPosRawCut(payload);
      if (result.ok && !Boolean(payload?.preferDialog) && sendCut) {
        await new Promise((r) => setTimeout(r, POST_HTML_PRINT_SPOOL_FLUSH_MS_RESOLVED));
        try {
          let device = String(result.usedDevice || "").trim() || resolveThermalDeviceForHtmlPrintSync({
            printRole: payload?.printRole,
            kitchenStation: Number.isFinite(kitchenStation) ? Math.min(3, Math.max(1, kitchenStation)) : undefined,
          });
          if (!device) {
            device = String((await resolvePrintDeviceNameForJob()) || "").trim();
          }
          /** 무인쇄 실패 후 인쇄 대화상자로만 성공한 경우 — 사용자가 고른 기기명을 알 수 없어 RAW 절단 생략(빈 이름으로 no_printer 오탐 방지) */
          if (!device && result.printStage === "dialog") {
            console.warn("[cm-pos] skip ESC/POS cut: dialog fallback without resolved printer name");
          } else if (device) {
            const cutRes = await sendEscPosCutForPrinter(device);
            out.cutOk = Boolean(cutRes.ok);
            if (cutRes.reason) out.cutReason = String(cutRes.reason);
            if (!cutRes.ok) {
              console.warn("[cm-pos] ESC/POS cut failed:", cutRes.reason || "");
            }
          } else {
            console.warn("[cm-pos] skip ESC/POS cut: no printer name (thermal silent used default but name unresolved)");
          }
        } catch (e) {
          out.cutOk = false;
          out.cutReason = String(e && e.message ? e.message : e);
          console.warn("[cm-pos] ESC/POS cut:", out.cutReason);
        }
      }
      return out;
    });

    ipcMain.handle("cm-pos-reset-cache-reload", async (event) => {
      if (!senderAllowedOrigin(event.sender)) {
        return { ok: false, reason: "forbidden" };
      }
      return clearRuntimeCacheAndReloadManual();
    });

    ipcMain.handle("cm-pos-customer-display-configure", async (event, params) => {
      if (!senderAllowedOrigin(event.sender)) {
        return { ok: false, reason: "forbidden" };
      }
      customerDisplayConfig = {
        ...customerDisplayConfig,
        enabled: Boolean(params?.enabled),
        autoOpen: params?.autoOpen !== false,
        monitorPreference:
          String(params?.monitorPreference || "secondary-first") === "primary-only"
            ? "primary-only"
            : "secondary-first",
        storeCode: String(params?.storeCode || customerDisplayConfig.storeCode || "").trim(),
      };
      if (!customerDisplayConfig.enabled) {
        return closeCustomerDisplayWindow();
      }
      if (customerDisplayConfig.autoOpen) {
        return ensureCustomerDisplayWindow(false);
      }
      return { ok: true };
    });

    ipcMain.handle("cm-pos-customer-display-open", async (event) => {
      if (!senderAllowedOrigin(event.sender)) {
        return { ok: false, reason: "forbidden" };
      }
      return ensureCustomerDisplayWindow(true);
    });

    ipcMain.handle("cm-pos-customer-display-close", async (event) => {
      if (!senderAllowedOrigin(event.sender)) {
        return { ok: false, reason: "forbidden" };
      }
      return closeCustomerDisplayWindow();
    });

    ipcMain.handle("cm-pos-customer-display-state", async (event, payload) => {
      if (!senderAllowedOrigin(event.sender)) {
        return { ok: false, reason: "forbidden" };
      }
      const storeCode = String(payload?.storeCode || customerDisplayConfig.storeCode || "").trim();
      const kindRaw = String(payload?.kind || "idle");
      const kind = ["idle", "ordering", "payment", "qr"].includes(kindRaw) ? kindRaw : "idle";
      const normalized = {
        storeCode,
        kind,
        updatedAt: String(payload?.updatedAt || new Date().toISOString()),
        title: typeof payload?.title === "string" ? payload.title : undefined,
        message: typeof payload?.message === "string" ? payload.message : undefined,
        qrPayload: typeof payload?.qrPayload === "string" ? payload.qrPayload : undefined,
        items: Array.isArray(payload?.items) ? payload.items : undefined,
        totalAmount: Number(payload?.totalAmount || 0),
        breakdown:
          payload?.breakdown && typeof payload.breakdown === "object"
            ? {
                subtotal: Number(payload.breakdown.subtotal || 0),
                discountAmt: Number(payload.breakdown.discountAmt || 0),
                vatFeeAmt: Number(payload.breakdown.vatFeeAmt || 0),
                vatRate: Number(payload.breakdown.vatRate || 0),
                vatMode:
                  String(payload.breakdown.vatMode || "included") === "separate"
                    ? "separate"
                    : "included",
                serviceFeeAmt: Number(payload.breakdown.serviceFeeAmt || 0),
                serviceRate: Number(payload.breakdown.serviceRate || 0),
                serviceMode:
                  String(payload.breakdown.serviceMode || "separate") === "included"
                    ? "included"
                    : "separate",
                cardFeeAmt: Number(payload.breakdown.cardFeeAmt || 0),
                cardRate: Number(payload.breakdown.cardRate || 0),
                cardMode:
                  String(payload.breakdown.cardMode || "separate") === "included"
                    ? "included"
                    : "separate",
                otherFeeAmt: Number(payload.breakdown.otherFeeAmt || 0),
                otherRate: Number(payload.breakdown.otherRate || 0),
                otherMode:
                  String(payload.breakdown.otherMode || "separate") === "included"
                    ? "included"
                    : "separate",
                total: Number(payload.breakdown.total || 0),
              }
            : undefined,
        showOrderSummary: payload?.showOrderSummary !== false,
        showOrderTotal: payload?.showOrderTotal !== false,
      };
      broadcastCustomerDisplayState(normalized);
      if (customerDisplayConfig.enabled && customerDisplayConfig.autoOpen) {
        await ensureCustomerDisplayWindow(false);
      }
      return { ok: true };
    });

    createWindow();

    const rebalanceCustomerDisplay = () => {
      if (!customerDisplayWindow || customerDisplayWindow.isDestroyed()) return;
      placeCustomerWindowOnTarget(customerDisplayWindow);
    };
    screen.on("display-added", rebalanceCustomerDisplay);
    screen.on("display-removed", rebalanceCustomerDisplay);
    screen.on("display-metrics-changed", rebalanceCustomerDisplay);

    const toggleMainWindowDevTools = () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.webContents.isDevToolsOpened()) {
          mainWindow.webContents.closeDevTools();
        } else {
          mainWindow.webContents.openDevTools({ mode: "detach" });
        }
      }
    };

    let devToolsGlobalOk = globalShortcut.register("F12", toggleMainWindowDevTools);
    if (!devToolsGlobalOk) {
      const fallbackAccel =
        process.platform === "darwin" ? "Command+Option+I" : "CommandOrControl+Shift+I";
      devToolsGlobalOk = globalShortcut.register(fallbackAccel, toggleMainWindowDevTools);
      if (devToolsGlobalOk) {
        const human =
          process.platform === "darwin"
            ? "Cmd+Option+I"
            : "Ctrl+Shift+I";
        const hint =
          process.platform === "darwin"
            ? "or use the application menu View → Toggle Developer Tools."
            : "or press Alt once to show the menu bar, then View → Toggle Developer Tools.";
        console.warn(
          `[POS] F12 global shortcut could not be registered (often taken by the OS or another app). Use ${human} to toggle DevTools, ${hint}`
        );
      } else {
        const hint =
          process.platform === "darwin"
            ? "Use the application menu View → Toggle Developer Tools."
            : "Press Alt to show the menu bar, then View → Toggle Developer Tools.";
        console.warn(`[POS] Could not register global DevTools shortcuts (F12 or fallback). ${hint}`);
      }
    }

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
