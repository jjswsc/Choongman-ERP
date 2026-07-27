const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const { app, BrowserWindow, Menu, shell, dialog, ipcMain, globalShortcut, screen, net } = require("electron");

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

let linkposBridgeApi = null;
try {
  linkposBridgeApi = require("./linkpos-bridge-server");
} catch (e) {
  console.warn(
    "[cm-pos] linkpos-bridge-server not loaded:",
    e && e.message ? e.message : e
  );
}

let linkposBridgeStarted = false;

function readLinkposBridgeOptionsFromRuntime() {
  const cfg = readRuntimeConfig() || {};
  const lp = cfg.linkpos && typeof cfg.linkpos === "object" ? cfg.linkpos : {};
  const enabledRaw = lp.enabled;
  // 기본 ON — runtime-config에 linkpos 블록이 있으면 브리지 기동. 끄려면 enabled=false
  const enabled =
    enabledRaw === false ||
    enabledRaw === 0 ||
    String(enabledRaw ?? "").trim().toLowerCase() === "false" ||
    String(enabledRaw ?? "").trim() === "0"
      ? false
      : true;
  const serialPath = String(lp.serialPath || lp.comPort || lp.path || "COM3").trim() || "COM3";
  const baudRate = Math.max(1200, Number(lp.baudRate || 9600) || 9600);
  const httpPort = Math.max(1, Number(lp.httpPort || 18181) || 18181);
  const responseTimeoutMs = Math.max(3000, Number(lp.responseTimeoutMs || 120000) || 120000);
  const verbose =
    lp.verbose === true ||
    String(process.env.WINDOWS_POS_LINKPOS_VERBOSE || "").trim() === "1";
  return {
    enabled,
    httpPort,
    responseTimeoutMs,
    verbose,
    serial: {
      path: serialPath,
      baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
    },
  };
}

async function startEmbeddedLinkposBridge() {
  if (!linkposBridgeApi || typeof linkposBridgeApi.startLinkposBridge !== "function") {
    return { ok: false, error: "module_missing" };
  }
  const opts = readLinkposBridgeOptionsFromRuntime();
  if (!opts.enabled) {
    console.log("[cm-pos] linkpos bridge disabled in runtime-config (linkpos.enabled=false)");
    return { ok: false, error: "disabled" };
  }
  try {
    const result = await linkposBridgeApi.startLinkposBridge({
      httpPort: opts.httpPort,
      serial: opts.serial,
      responseTimeoutMs: opts.responseTimeoutMs,
      verbose: opts.verbose,
    });
    linkposBridgeStarted = Boolean(result && result.ok);
    if (result && result.ok) {
      console.log(
        `[cm-pos] linkpos bridge on :${opts.httpPort} → ${opts.serial.path} @ ${opts.serial.baudRate}`
      );
    } else {
      console.warn("[cm-pos] linkpos bridge start failed:", result && result.error);
    }
    return result || { ok: false, error: "unknown" };
  } catch (e) {
    console.warn("[cm-pos] linkpos bridge start error:", e && e.message ? e.message : e);
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

async function stopEmbeddedLinkposBridge() {
  if (!linkposBridgeStarted || !linkposBridgeApi || typeof linkposBridgeApi.stopLinkposBridge !== "function") {
    return;
  }
  try {
    await linkposBridgeApi.stopLinkposBridge();
  } catch (e) {
    console.warn("[cm-pos] linkpos bridge stop:", e && e.message ? e.message : e);
  } finally {
    linkposBridgeStarted = false;
  }
}

function writeLinkposIntoUserRuntimeConfig(patch) {
  ensureUserRuntimeConfigSeeded();
  const userPath = path.join(app.getPath("userData"), "runtime-config.json");
  let parsed = {};
  try {
    let raw = fs.readFileSync(userPath, "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    parsed = JSON.parse(raw) || {};
  } catch {
    parsed = {};
  }
  const prev = parsed.linkpos && typeof parsed.linkpos === "object" ? parsed.linkpos : {};
  parsed.linkpos = {
    enabled: true,
    httpPort: 18181,
    serialPath: "COM3",
    baudRate: 9600,
    responseTimeoutMs: 120000,
    ...prev,
    ...patch,
  };
  fs.writeFileSync(userPath, JSON.stringify(parsed, null, 4) + "\n", "utf8");
  return parsed.linkpos;
}

async function listLinkposSerialPorts() {
  try {
    const SP = require("serialport").SerialPort;
    const ports = await SP.list();
    return (ports || [])
      .map((p) => ({
        path: String(p.path || "").trim(),
        label: [p.path, p.friendlyName || p.manufacturer].filter(Boolean).join(" — "),
      }))
      .filter((p) => p.path);
  } catch (e) {
    console.warn("[cm-pos] list serial ports:", e && e.message ? e.message : e);
    return [];
  }
}

async function configureLinkposEdcFromMenu() {
  const ports = await listLinkposSerialPorts();
  const current = readLinkposBridgeOptionsFromRuntime();
  if (!ports.length) {
    await dialog.showMessageBox({
      type: "warning",
      title: "เครื่องรูดบัตร",
      message: "ยังไม่พบพอร์ต COM",
      detail: "เสียบสายเครื่อง EDC แล้วเปิด Device Manager → Ports (COM & LPT) จากนั้นลองใหม่ครับ",
    });
    return;
  }

  const buttons = ports.map((p) => p.path);
  buttons.push("ปิดการเชื่อมต่อ", "ยกเลิก");
  const { response } = await dialog.showMessageBox({
    type: "question",
    title: "ตั้งค่าเครื่องรูดบัตร",
    message: "เลือกพอร์ต COM ของเครื่อง",
    detail:
      `ตอนนี้ใช้: ${current.serial.path}\n\n` +
      ports.map((p) => `• ${p.label}`).join("\n"),
    buttons,
    defaultId: Math.max(
      0,
      ports.findIndex((p) => p.path.toUpperCase() === String(current.serial.path || "").toUpperCase())
    ),
    cancelId: buttons.length - 1,
  });

  if (response === buttons.length - 1) return;

  if (response === buttons.length - 2) {
    writeLinkposIntoUserRuntimeConfig({ enabled: false });
    await stopEmbeddedLinkposBridge();
    await dialog.showMessageBox({
      type: "info",
      title: "เครื่องรูดบัตร",
      message: "ปิดการเชื่อมต่อแล้ว",
      detail: "การชำระบัตรจะไม่ส่งไปที่เครื่องจนกว่าจะเปิดอีกครั้งครับ",
    });
    return;
  }

  const selected = ports[response];
  if (!selected) return;
  writeLinkposIntoUserRuntimeConfig({
    enabled: true,
    serialPath: selected.path,
    baudRate: current.serial.baudRate || 9600,
    httpPort: current.httpPort || 18181,
  });
  await stopEmbeddedLinkposBridge();
  const started = await startEmbeddedLinkposBridge();
  const st =
    linkposBridgeApi && typeof linkposBridgeApi.getStatus === "function"
      ? linkposBridgeApi.getStatus()
      : {};
  await dialog.showMessageBox({
    type: started && started.ok ? "info" : "warning",
    title: "เครื่องรูดบัตร",
    message: started && started.ok ? `บันทึกแล้ว: ${selected.path}` : `บันทึก ${selected.path} แล้ว แต่ยังเชื่อมไม่สำเร็จ`,
    detail: st.serialReady
      ? "เครื่องพร้อมใช้งานแล้ว ลองชำระด้วยแท็บ「บัตร」ได้เลยครับ"
      : "ยังไม่พร้อม — เช็คสาย/พอร์ต แล้วเปิด POS ใหม่ครับ",
  });
}


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
 * `userData` 루트(캐시·세션·runtime-config.json·메인 단말 localStorage) — App **ready** 전.
 *
 * **기본(권장): Electron AppData** (`%APPDATA%\<app-name>\`)
 * — NSIS 업데이트 시 Program Files\resources 가 통째로 교체되어도 프린터·메인 설정이 유지됨.
 *
 * 순서:
 * (1) `WINDOWS_POS_USER_DATA` / `CM_POS_USER_DATA`
 *     - 절대/상대 경로, 또는 `portable`/`next-to-exe`/`beside-exe`(실행 파일 옆)
 *     - `resources` = 예전처럼 `…\resources\choongman-pos-user-data` (업데이트 시 초기화됨 — 비권장)
 * (2) 그 외: Electron 기본 AppData (설치 폴더 밖)
 *
 * 레거시 resources / 다른 브랜드 AppData 폴더에 남은 설정은 `migrateLegacyPosSettingsIntoUserData` 가 복구.
 */
function applyUserDataPathEarly() {
  if (!app || typeof app.setPath !== "function") return;
  const raw = (process.env.WINDOWS_POS_USER_DATA ?? process.env.CM_POS_USER_DATA) ?? "";
  const s = String(raw).trim();
  if (s) {
    let d = s;
    const portables = new Set(["portable", "next-to-exe", "beside-exe"]);
    const key = s.toLowerCase();
    if (portables.has(key)) {
      d = path.join(path.dirname(process.execPath), "choongman-pos-user-data");
    } else if (key === "resources") {
      // 구 기본값 호환 — 업데이트마다 날아갈 수 있음
      const res = process.resourcesPath;
      if (!res || !String(res).trim()) return;
      d = path.join(res, "choongman-pos-user-data");
    } else {
      d = path.isAbsolute(s) ? s : path.resolve(s);
    }
    try {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
      app.setPath("userData", d);
      if ((portables.has(key) || key === "resources") && process.platform === "win32") {
        try {
          if (d.toLowerCase().includes("program files")) {
            console.warn(
              "[cm-pos] userData under Program Files may be wiped on NSIS update — prefer default AppData or D:\\..."
            );
          }
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      console.warn("[cm-pos] WINDOWS_POS_USER_DATA ignored (use default AppData):", e && e.message ? e.message : e);
    }
  }
  // 기본: AppData — CM_POS_USE_DEFAULT_USERDATA 는 이제 no-op(하위 호환)
}

/** 충만·Omni 공통 프린터 설정 백업 (브랜드 AppData 폴더가 달라도 복구) */
function getSharedPosSettingsBackupPath() {
  try {
    const roaming =
      process.env.APPDATA ||
      (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Roaming") : "");
    if (!roaming) return "";
    return path.join(roaming, "cm-erp-pos-settings", "runtime-config-backup.json");
  } catch {
    return "";
  }
}

function readJsonObjectFromFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    let raw = fs.readFileSync(filePath, "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function printConfigHasDevice(printObj) {
  if (!printObj || typeof printObj !== "object") return false;
  const keys = [
    "deviceName",
    "receiptDeviceName",
    "kitchenDeviceName",
    "kitchen1DeviceName",
    "kitchen2DeviceName",
    "kitchen3DeviceName",
  ];
  return keys.some((k) => {
    const v = String(printObj[k] || "").trim();
    return Boolean(v) && v !== "-" && v !== "—";
  });
}

function copyDirRecursiveIfMissing(srcDir, destDir) {
  if (!srcDir || !destDir || !fs.existsSync(srcDir)) return false;
  if (fs.existsSync(destDir)) {
    try {
      const entries = fs.readdirSync(destDir);
      if (entries && entries.length > 0) return false;
    } catch {
      return false;
    }
  }
  const copyRecursive = (from, to) => {
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(from)) {
      const a = path.join(from, name);
      const b = path.join(to, name);
      const st = fs.statSync(a);
      if (st.isDirectory()) copyRecursive(a, b);
      else fs.copyFileSync(a, b);
    }
  };
  try {
    copyRecursive(srcDir, destDir);
    return true;
  } catch (e) {
    console.warn("[cm-pos] copyDirRecursiveIfMissing failed:", e && e.message ? e.message : e);
    return false;
  }
}

function listLegacyPosUserDataDirs(currentUserData) {
  const out = [];
  const push = (d) => {
    const n = String(d || "").trim();
    if (!n) return;
    try {
      if (!fs.existsSync(n)) return;
      const resolved = path.resolve(n);
      if (currentUserData && path.resolve(currentUserData) === resolved) return;
      if (out.includes(resolved)) return;
      out.push(resolved);
    } catch {
      /* ignore */
    }
  };
  try {
    const roaming =
      process.env.APPDATA ||
      (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Roaming") : "");
    if (roaming) {
      push(path.join(roaming, "choongman-pos-windows"));
      push(path.join(roaming, "omnifoodtech-pos-windows"));
      push(path.join(roaming, "cm-erp-pos-settings"));
    }
  } catch {
    /* ignore */
  }
  try {
    if (process.resourcesPath) {
      push(path.join(process.resourcesPath, "choongman-pos-user-data"));
    }
  } catch {
    /* ignore */
  }
  try {
    push(path.join(path.dirname(process.execPath), "choongman-pos-user-data"));
  } catch {
    /* ignore */
  }
  return out;
}

/**
 * 업데이트·브랜드 전환 후에도 프린터/메인(세션) 설정을 살린다.
 * - runtime-config.json
 * - Partitions (persist:choongman-pos → 메인 단말 deviceToken localStorage)
 * - 공유 백업(%APPDATA%\cm-erp-pos-settings)
 */
function migrateLegacyPosSettingsIntoUserData() {
  try {
    const userData = app.getPath("userData");
    if (!userData) return;
    fs.mkdirSync(userData, { recursive: true });
    const targetCfgPath = path.join(userData, "runtime-config.json");
    let targetCfg = readJsonObjectFromFile(targetCfgPath);
    const targetPrintOk = printConfigHasDevice(targetCfg && targetCfg.print);

    const legacyDirs = listLegacyPosUserDataDirs(userData);
    const backupPath = getSharedPosSettingsBackupPath();

    // 1) runtime-config 복구
    if (!targetCfg || !targetPrintOk) {
      let donor = null;
      let donorPath = "";
      for (const dir of legacyDirs) {
        const p = path.join(dir, "runtime-config.json");
        const cfg = readJsonObjectFromFile(p);
        if (cfg && printConfigHasDevice(cfg.print)) {
          donor = cfg;
          donorPath = p;
          break;
        }
        if (!donor && cfg && Object.keys(cfg).length > 0) {
          donor = cfg;
          donorPath = p;
        }
      }
      if ((!donor || !printConfigHasDevice(donor.print)) && backupPath) {
        const bak = readJsonObjectFromFile(backupPath);
        if (bak && (!donor || printConfigHasDevice(bak.print))) {
          donor = bak;
          donorPath = backupPath;
        }
      }
      if (donor) {
        let next = targetCfg ? { ...targetCfg } : { ...donor };
        if (!targetCfg) {
          next = { ...donor };
        } else if (donor.print) {
          const mergedPrint = { ...(donor.print || {}), ...(targetCfg.print || {}) };
          for (const [k, v] of Object.entries(donor.print || {})) {
            const cur = String((targetCfg.print && targetCfg.print[k]) || "").trim();
            if (!cur || cur === "-" || cur === "—") mergedPrint[k] = v;
          }
          next.print = mergedPrint;
        }
        fs.writeFileSync(targetCfgPath, JSON.stringify(next, null, 4) + "\n", "utf8");
        console.log("[cm-pos] restored runtime-config from", donorPath);
      }
    }

    // 2) 메인 단말(localStorage) — Partitions 복구
    const targetPartitions = path.join(userData, "Partitions");
    let partitionsRestored = false;
    for (const dir of legacyDirs) {
      const src = path.join(dir, "Partitions");
      if (copyDirRecursiveIfMissing(src, targetPartitions)) {
        console.log("[cm-pos] restored Partitions (Main device session) from", src);
        partitionsRestored = true;
        break;
      }
    }
    if (!partitionsRestored) {
      // 일부 Electron 빌드는 Local Storage 를 userData 루트에 둠
      for (const dir of legacyDirs) {
        const src = path.join(dir, "Local Storage");
        const dest = path.join(userData, "Local Storage");
        if (copyDirRecursiveIfMissing(src, dest)) {
          console.log("[cm-pos] restored Local Storage from", src);
          break;
        }
      }
    }

    // 3) 현재 설정을 공유 백업에도 반영(다음 브랜드/업데이트 대비)
    try {
      const cfgNow = readJsonObjectFromFile(targetCfgPath);
      if (cfgNow && printConfigHasDevice(cfgNow.print) && backupPath) {
        fs.mkdirSync(path.dirname(backupPath), { recursive: true });
        fs.writeFileSync(backupPath, JSON.stringify(cfgNow, null, 4) + "\n", "utf8");
      }
    } catch {
      /* ignore */
    }
  } catch (e) {
    console.warn("[cm-pos] migrateLegacyPosSettingsIntoUserData:", e && e.message ? e.message : e);
  }
}

applyUserDataPathEarly();
migrateLegacyPosSettingsIntoUserData();

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
 * - 설치 직후: 기본은 `%APPDATA%\<app-name>\runtime-config.json` (NSIS 업데이트에도 유지)
 * - 레거시 `resources\choongman-pos-user-data` / 다른 브랜드 폴더 / 공유 백업에서 자동 복구
 * - 0바이트 파일: 덮어써서 다시 씀
 * - 이후 정상 JSON이 있으면 건드리지 않음(사용자 편집 보존)
 */
/** Omni 빌드(appId·origin)면 latest.json, 그 외(충만)는 latest-choongman.json */
function resolveDefaultUpdateManifestUrl(origin) {
  const o = String(origin || "").replace(/\/+$/, "");
  let manifest = "latest-choongman.json";
  try {
    const pkg = readJsonFileIfExists(path.join(__dirname, "package.json"));
    const appId = String((pkg && pkg.build && pkg.build.appId) || (pkg && pkg.name) || "");
    if (/omnifoodtech/i.test(appId) || /omnifoodtech/i.test(o)) {
      manifest = "latest.json";
    }
  } catch {
    /* keep choongman default */
  }
  return `${o}/downloads/windows-pos/${manifest}`;
}

function buildDefaultUserRuntimeConfigText() {
  const origin = String(DEPLOY_ORIGIN || "https://choongman-erp.vercel.app").replace(/\/+$/, "");
  return (
    JSON.stringify(
      {
        posUrl: `${origin}/pos/login`,
        allowedOrigin: origin,
        openDevtools: false,
        updateManifestUrl: resolveDefaultUpdateManifestUrl(origin),
        kiosk: "1",
        linkpos: {
          enabled: false,
          httpPort: 18181,
          serialPath: "COM3",
          baudRate: 9600,
          responseTimeoutMs: 120000,
        },
        print: {
          deviceName: "",
          receiptDeviceName: "",
          kitchenDeviceName: "",
          kitchen1DeviceName: "",
          kitchen2DeviceName: "",
          kitchen3DeviceName: "",
          silent: true,
          escPosCutAfterKitchenHtml: true,
          escPosCutAfterHallOrderHtml: true,
          escPosCutAfterPaymentReceiptHtml: true,
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
 * 이미 있는 파일에는 linkpos 블록만 없으면 병합(기존 키는 유지).
 */
function ensureUserRuntimeConfigSeeded() {
  try {
    const userPath = path.join(app.getPath("userData"), "runtime-config.json");
    if (userRuntimeConfigNeedsSeeding(userPath)) {
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
    }
    ensureLinkposRuntimeConfigMerged(userPath);
  } catch (e) {
    console.warn("[cm-pos] ensureUserRuntimeConfigSeeded:", e && e.message ? e.message : e);
  }
}

/** 기존 매장 runtime-config에 linkpos 키가 없으면 기본값을 추가한다. */
function ensureLinkposRuntimeConfigMerged(userPath) {
  try {
    if (!userPath || !fs.existsSync(userPath)) return;
    let raw = fs.readFileSync(userPath, "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    if (parsed.linkpos && typeof parsed.linkpos === "object") return;
    parsed.linkpos = {
      enabled: true,
      httpPort: 18181,
      serialPath: "COM3",
      baudRate: 9600,
      responseTimeoutMs: 120000,
    };
    fs.writeFileSync(userPath, JSON.stringify(parsed, null, 4) + "\n", "utf8");
    console.log("[cm-pos] merged default linkpos into runtime-config.json — set serialPath to your EDC COM port");
  } catch (e) {
    console.warn("[cm-pos] ensureLinkposRuntimeConfigMerged:", e && e.message ? e.message : e);
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
  resolveDefaultUpdateManifestUrl(ALLOWED_ORIGIN);

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
  true
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
    return readConfigBool(process.env.WINDOWS_POS_ESC_POS_CUT_AFTER_HALL_ORDER_HTML, true);
  }
  const p = runtimeConfig.print || {};
  if (Object.prototype.hasOwnProperty.call(p, "escPosCutAfterHallOrderHtml")) {
    return readConfigBool(p.escPosCutAfterHallOrderHtml, true);
  }
  if (runtimeConfig.printEscPosCutAfterHallOrderHtml !== undefined) {
    return readConfigBool(runtimeConfig.printEscPosCutAfterHallOrderHtml, true);
  }
  /** 기본 켬: 다중 단말이 같은 열전사로 거의 동시에 찍을 때 컷 없이 한 롤로 이어붙는 사례 완화 */
  return true;
}

function readEscPosCutPaymentResolved() {
  if (process.env.WINDOWS_POS_ESC_POS_CUT_AFTER_PAYMENT_RECEIPT_HTML !== undefined && process.env.WINDOWS_POS_ESC_POS_CUT_AFTER_PAYMENT_RECEIPT_HTML !== "") {
    return readConfigBool(process.env.WINDOWS_POS_ESC_POS_CUT_AFTER_PAYMENT_RECEIPT_HTML, true);
  }
  const p = runtimeConfig.print || {};
  if (Object.prototype.hasOwnProperty.call(p, "escPosCutAfterPaymentReceiptHtml")) {
    return readConfigBool(p.escPosCutAfterPaymentReceiptHtml, true);
  }
  if (runtimeConfig.printEscPosCutAfterPaymentReceiptHtml !== undefined) {
    return readConfigBool(runtimeConfig.printEscPosCutAfterPaymentReceiptHtml, true);
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
  process.env.WINDOWS_POS_PRINT_HTML_SETTLE_MS || runtimeConfig.printHtmlSettleMs || 260,
  260,
  80,
  5000
);
/** 영수증 role 전용 settle (지정 없으면 공통값 사용) */
const PRINT_HTML_SETTLE_MS_RECEIPT = readConfigInt(
  process.env.WINDOWS_POS_PRINT_HTML_SETTLE_MS_RECEIPT || runtimeConfig.printHtmlSettleMsReceipt || 140,
  140,
  60,
  5000
);
const POST_HTML_PRINT_SPOOL_FLUSH_MS_RESOLVED = readConfigInt(
  process.env.WINDOWS_POS_PRINT_SPOOL_FLUSH_MS || runtimeConfig.postHtmlPrintSpoolFlushMs || 350,
  350,
  0,
  10000
);
/** 영수증 role 전용 스풀 flush (지정 없으면 공통값 사용) */
const POST_HTML_PRINT_SPOOL_FLUSH_MS_RECEIPT = readConfigInt(
  process.env.WINDOWS_POS_PRINT_SPOOL_FLUSH_MS_RECEIPT || runtimeConfig.postHtmlPrintSpoolFlushMsReceipt || 120,
  120,
  0,
  10000
);
const PRINT_HTML_SILENT_RETRY_COUNT = readConfigInt(
  process.env.WINDOWS_POS_PRINT_HTML_RETRY || runtimeConfig.printHtmlSilentRetryCount || 1,
  1,
  0,
  3
);
const PRINT_HTML_QUEUE_GAP_MS = readConfigInt(
  process.env.WINDOWS_POS_PRINT_HTML_QUEUE_GAP_MS || runtimeConfig.printHtmlQueueGapMs || 80,
  80,
  0,
  2000
);
/** 영수증 role 전용 큐 간격 (지정 없으면 20ms) */
const PRINT_HTML_QUEUE_GAP_MS_RECEIPT = readConfigInt(
  process.env.WINDOWS_POS_PRINT_HTML_QUEUE_GAP_MS_RECEIPT || runtimeConfig.printHtmlQueueGapMsReceipt || 20,
  20,
  0,
  2000
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
/** 주방·영수증 분리 — 결제 영수증이 주방 인쇄 뒤에 수 초 대기하지 않도록 */
let htmlPrintQueueKitchen = Promise.resolve();
let htmlPrintQueueReceipt = Promise.resolve();
let htmlHiddenPrintWindow = null;
let htmlPrintFailureStreak = 0;
/** POS 메인 URL 로드 실패 시 재시도(did-fail-load 일시 오류·리다이렉트 완화) */
let posMainLoadFailAttempts = 0;
let posMainLoadRetryTimer = null;
let posMainLoadWatchdogTimer = null;
let posDomBlankWatchdogTimer = null;
const POS_MAIN_LOAD_MAX_ATTEMPTS = 5;
/** 오프라인 cold start: SW·Chromium 캐시에서 셸을 띄울 시간을 더 준다 */
const POS_MAIN_LOAD_MAX_ATTEMPTS_OFFLINE = 12;
let customerDisplayWindow = null;
let isCheckingUpdate = false;
let customerDisplayConfig = {
  enabled: false,
  autoOpen: true,
  monitorPreference: "secondary-first",
  storeCode: "",
};
let customerDisplayLastState = null;
/** secondary 모니터가 늦게 잡히는 경우 auto-open 재시도 */
let customerDisplayAutoOpenRetryTimers = [];

function clearCustomerDisplayAutoOpenRetries() {
  for (const timer of customerDisplayAutoOpenRetryTimers) {
    try {
      clearTimeout(timer);
    } catch {
      /* ignore */
    }
  }
  customerDisplayAutoOpenRetryTimers = [];
}

function scheduleCustomerDisplayAutoOpenRetries() {
  clearCustomerDisplayAutoOpenRetries();
  if (!customerDisplayConfig.enabled || !customerDisplayConfig.autoOpen) return;
  for (const ms of [1500, 4000, 9000]) {
    customerDisplayAutoOpenRetryTimers.push(
      setTimeout(() => {
        if (!customerDisplayConfig.enabled || !customerDisplayConfig.autoOpen) return;
        if (customerDisplayWindow && !customerDisplayWindow.isDestroyed()) return;
        void ensureCustomerDisplayWindow(false);
      }, ms)
    );
  }
}

function readCustomerDisplayConfigFromRuntime() {
  try {
    const userPath = path.join(app.getPath("userData"), "runtime-config.json");
    if (!fs.existsSync(userPath)) return null;
    let raw = fs.readFileSync(userPath, "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    const parsed = JSON.parse(raw) || {};
    const cd = parsed.customerDisplay;
    if (!cd || typeof cd !== "object") return null;
    return {
      enabled: Boolean(cd.enabled),
      autoOpen: cd.autoOpen !== false,
      monitorPreference:
        String(cd.monitorPreference || "secondary-first") === "primary-only"
          ? "primary-only"
          : "secondary-first",
      storeCode: String(cd.storeCode || "").trim(),
    };
  } catch {
    return null;
  }
}

function writeCustomerDisplayConfigToRuntime(cfg) {
  try {
    ensureUserRuntimeConfigSeeded();
    const userPath = path.join(app.getPath("userData"), "runtime-config.json");
    let parsed = {};
    try {
      let raw = fs.readFileSync(userPath, "utf8");
      if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
      parsed = JSON.parse(raw) || {};
    } catch {
      parsed = {};
    }
    parsed.customerDisplay = {
      enabled: Boolean(cfg.enabled),
      autoOpen: cfg.autoOpen !== false,
      monitorPreference:
        String(cfg.monitorPreference || "secondary-first") === "primary-only"
          ? "primary-only"
          : "secondary-first",
      storeCode: String(cfg.storeCode || "").trim(),
    };
    fs.writeFileSync(userPath, JSON.stringify(parsed, null, 4) + "\n", "utf8");
  } catch (e) {
    console.warn(
      "[cm-pos] write customerDisplay runtime-config failed:",
      e && e.message ? e.message : e
    );
  }
}

function applySavedCustomerDisplayConfig() {
  const saved = readCustomerDisplayConfigFromRuntime();
  if (!saved) return;
  customerDisplayConfig = {
    ...customerDisplayConfig,
    ...saved,
  };
}

/**
 * Electron 메인에서 간헐적으로 발생하는 "Object has been destroyed" 레이스는
 * 윈도우/웹콘텐츠가 이미 닫힌 뒤 비동기 콜백이 접근할 때 생긴다.
 * 이 경우 프로세스를 죽이지 않고 경고 로그만 남겨 POS 연속 운영을 보장한다.
 */
function isDestroyedObjectRaceError(error) {
  const msg = String(
    (error && (error.message || error.toString && error.toString())) || ""
  ).toLowerCase();
  return msg.includes("object has been destroyed");
}

process.on("uncaughtException", (error) => {
  if (isDestroyedObjectRaceError(error)) {
    console.warn("[cm-pos] ignored destroyed-object race:", error && error.message ? error.message : error);
    return;
  }
  console.error("[cm-pos] uncaughtException", error);
  try {
    process.exit(1);
  } catch {
    /* ignore */
  }
});

process.on("unhandledRejection", (reason) => {
  if (isDestroyedObjectRaceError(reason)) {
    console.warn("[cm-pos] ignored destroyed-object rejection:", reason && reason.message ? reason.message : reason);
    return;
  }
  console.error("[cm-pos] unhandledRejection", reason);
});

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

function getMainPosDisplay() {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  try {
    const b = mainWindow.getBounds();
    const cx = Math.round(b.x + Math.max(1, b.width) / 2);
    const cy = Math.round(b.y + Math.max(1, b.height) / 2);
    return screen.getDisplayNearestPoint({ x: cx, y: cy });
  } catch {
    return null;
  }
}

function resolveCustomerDisplayTarget() {
  const displays = screen.getAllDisplays();
  if (!displays.length) return null;
  if (customerDisplayConfig.monitorPreference === "primary-only") {
    return screen.getPrimaryDisplay();
  }
  /** POS 메인 창이 있는 모니터가 아닌 쪽 — Seacon 등 2대 PC에서 캐셔·고객 모니터 뒤바뀜 방지 */
  const posDisplay = getMainPosDisplay();
  if (posDisplay && displays.length >= 2) {
    const other = displays.find((d) => d.id !== posDisplay.id);
    if (other) return other;
  }
  const primary = screen.getPrimaryDisplay();
  const secondary = displays.find((d) => d.id !== primary.id);
  return secondary || primary;
}

/** 보조 모니터가 실제로 연결돼 있는지 (Windows가 디스플레이 1개만 잡을 때 false) */
function hasSecondaryDisplay() {
  const displays = screen.getAllDisplays();
  if (displays.length < 2) return false;
  const primary = screen.getPrimaryDisplay();
  return displays.some((d) => d.id !== primary.id);
}

/**
 * secondary-first 인데 모니터 1대뿐이면 고객창을 POS 위에 띄우지 않음.
 * (Seacon 등 터치 POS 1대 + dualMonitor 설정 켜진 매장에서 주문 중 화면 전환 방지)
 */
function shouldSkipCustomerDisplayWindow(forceOpen) {
  if (forceOpen) return false;
  if (customerDisplayConfig.monitorPreference === "primary-only") return false;
  return !hasSecondaryDisplay();
}

function refocusMainPosWindow() {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
    }
  } catch {
    /* ignore */
  }
}

function placeCustomerWindowOnTarget(win) {
  if (!win || win.isDestroyed()) return;
  const target = resolveCustomerDisplayTarget();
  if (!target) return;
  const b = target.bounds;
  win.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height }, false);
  /** 배치 후에도 POS와 같은 모니터면 한 번 더 반대쪽 시도 */
  try {
    const posDisplay = getMainPosDisplay();
    if (posDisplay && posDisplay.id === target.id && screen.getAllDisplays().length >= 2) {
      const alt = screen.getAllDisplays().find((d) => d.id !== posDisplay.id);
      if (alt) {
        const ab = alt.bounds;
        win.setBounds({ x: ab.x, y: ab.y, width: ab.width, height: ab.height }, false);
      }
    }
  } catch {
    /* ignore */
  }
}

function broadcastCustomerDisplayState(payload) {
  customerDisplayLastState = payload;
  if (customerDisplayWindow && !customerDisplayWindow.isDestroyed()) {
    customerDisplayWindow.webContents.send("cm-pos-customer-display-state", payload);
  }
}

async function ensureCustomerDisplayWindow(forceOpen = false, options = {}) {
  const reposition = Boolean(options && options.reposition);
  const allowOpen = forceOpen || (customerDisplayConfig.enabled && customerDisplayConfig.autoOpen);
  if (!allowOpen) return { ok: true, reason: "disabled" };
  if (shouldSkipCustomerDisplayWindow(forceOpen)) {
    if (customerDisplayWindow && !customerDisplayWindow.isDestroyed()) {
      try {
        customerDisplayWindow.hide();
      } catch {
        /* ignore */
      }
    }
    refocusMainPosWindow();
    return { ok: true, reason: "single-display-skip" };
  }
  if (customerDisplayWindow && !customerDisplayWindow.isDestroyed()) {
    if (forceOpen || reposition) {
      placeCustomerWindowOnTarget(customerDisplayWindow);
    }
    if (forceOpen) {
      customerDisplayWindow.show();
      customerDisplayWindow.focus();
    } else if (!customerDisplayWindow.isVisible()) {
      /** 숨김 상태일 때만 다시 표시 — 매 상태 갱신마다 setBounds/showInactive 하면 보조 모니터가 깜빡임 */
      customerDisplayWindow.showInactive();
      refocusMainPosWindow();
    }
    return { ok: true };
  }
  try {
    customerDisplayWindow = new BrowserWindow({
      width: 1200,
      height: 900,
      show: false,
      autoHideMenuBar: true,
      skipTaskbar: true,
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
    if (forceOpen) {
      customerDisplayWindow.show();
      customerDisplayWindow.focus();
    } else {
      customerDisplayWindow.showInactive();
      refocusMainPosWindow();
    }
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
function isSystemOnline() {
  try {
    return net.isOnline();
  } catch {
    return true;
  }
}

/** 온라인 + 강제 새로고침일 때만 no-cache — 오프라인 cold start는 SW·디스크 캐시 우선 */
function posUrlLoadOptions(preferFresh) {
  if (preferFresh && isSystemOnline()) {
    return {
      extraHeaders: "Cache-Control: no-cache\r\nPragma: no-cache\r\n",
    };
  }
  return {};
}

/** Phase A/B — 오프라인·캐시 부팅 시 로그인 URL에 파일럿 쿼리 전달 */
function isOfflinePilotOfficeFromConfig() {
  const p = String(runtimeConfig.offlinePilot || process.env.WINDOWS_POS_OFFLINE_PILOT || "").trim().toLowerCase();
  return p === "office" || p === "1" || p === "true";
}

function resolvePosLoadUrl(preferFresh) {
  const useBootV2 = !preferFresh || !isSystemOnline();
  if (!useBootV2) return POS_URL;
  try {
    const u = new URL(POS_URL);
    u.searchParams.set("offlineBootV2", "1");
    if (isOfflinePilotOfficeFromConfig() || process.env.WINDOWS_POS_OFFLINE_PHASE_B === "1") {
      u.searchParams.set("offlinePhaseB", "1");
    }
    return u.toString();
  } catch {
    return POS_URL;
  }
}

/** loadURL 무한 대기 방지 — offline.html「연결 중…」멈춤 완화 */
function reloadPosUrlTimeoutMs(preferFresh) {
  if (preferFresh && isSystemOnline()) return Math.min(POS_MAIN_LOAD_WATCHDOG_MS, 45000);
  return Math.max(22000, Math.min(POS_MAIN_LOAD_WATCHDOG_MS, 32000));
}

function loadPosUrlWithTimeout(preferFresh) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return Promise.resolve({ ok: false, reason: "no_window" });
  }
  const url = resolvePosLoadUrl(preferFresh);
  const effectivePreferFresh = preferFresh && isSystemOnline();
  const timeoutMs = reloadPosUrlTimeoutMs(effectivePreferFresh);
  clearPosDomBlankWatchdog();
  schedulePosMainLoadWatchdog();
  return Promise.race([
    mainWindow.loadURL(url, posUrlLoadOptions(effectivePreferFresh)).then(() => ({ ok: true })),
    new Promise((resolve) => {
      setTimeout(() => resolve({ ok: false, reason: "load_timeout" }), timeoutMs);
    }),
  ]).catch((e) => ({
    ok: false,
    reason: String(e && e.message ? e.message : e),
  }));
}

function loadPosMainUrl(preferFresh) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  clearPosDomBlankWatchdog();
  schedulePosMainLoadWatchdog();
  try {
    void mainWindow.loadURL(resolvePosLoadUrl(preferFresh), posUrlLoadOptions(preferFresh && isSystemOnline()));
  } catch (e) {
    console.error("[cm-pos] loadURL error", e);
  }
}

function posMainLoadMaxAttempts() {
  return isSystemOnline() ? POS_MAIN_LOAD_MAX_ATTEMPTS : POS_MAIN_LOAD_MAX_ATTEMPTS_OFFLINE;
}

function posMainLoadWatchdogMs() {
  const base = POS_MAIN_LOAD_WATCHDOG_MS;
  return isSystemOnline() ? base : Math.max(base, 90000);
}

function posDomBlankCheckMs() {
  const base = POS_DOM_BLANK_CHECK_MS;
  return isSystemOnline() ? base : Math.max(base, 35000);
}

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
  }, posDomBlankCheckMs());
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
  }, posMainLoadWatchdogMs());
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
  if (posMainLoadFailAttempts >= posMainLoadMaxAttempts()) {
    posMainLoadFailAttempts = 0;
    loadOfflineFallbackPage();
    return;
  }
  posMainLoadFailAttempts += 1;
  const delay = Math.min(350 + posMainLoadFailAttempts * 450, 4000);
  posMainLoadRetryTimer = setTimeout(() => {
    posMainLoadRetryTimer = null;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    loadPosMainUrl(false);
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

    const dialogTarget = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    const result = await dialog.showMessageBox(dialogTarget, {
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
    const dialogTarget = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    await dialog.showMessageBox(dialogTarget, {
      type: "info",
      buttons: ["OK"],
      title: "POS update",
      message: "Update checks are turned off for this installation.",
    });
    return { ok: false, reason: "disabled" };
  }
  if (!updateManifestUrl) {
    const dialogTarget = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    await dialog.showMessageBox(dialogTarget, {
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
      const dialogTarget = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
      await dialog.showMessageBox(dialogTarget, {
        type: "warning",
        buttons: ["OK"],
        title: "POS update",
        message: "Could not read version from the update server response.",
      });
      return { ok: false, reason: "bad_manifest", currentVersion, latestVersion };
    }

    if (semverLte(latestVersion, currentVersion)) {
      const dialogTarget = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
      await dialog.showMessageBox(dialogTarget, {
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

    const dialogTarget = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    const result = await dialog.showMessageBox(dialogTarget, {
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
    const dialogTarget = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    await dialog.showMessageBox(dialogTarget, {
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
    preferCSSPageSize: true,
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
    /** CSS @page size(80mm)와 API pageSize 이중 지정 충돌로 일부 열전사에서 본문이 좌우로 찢어지는 사례 완화 */
    preferCSSPageSize: true,
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
    try {
      wc.print(options, (success, failureReason) => {
        resolve({ success: Boolean(success), failureReason: failureReason || "" });
      });
    } catch (e) {
      resolve({ success: false, failureReason: String(e && e.message ? e.message : e) });
    }
  });
}

/**
 * 일부 Windows 열전사/네트워크 프린터는 print() 콜백이 수 초~10초+ 늦게 옴.
 * 영수증은 제출 후 짧게만 기다리고 IPC·큐를 풀어, 창은 백그라운드에서 유지하다 정리.
 */
function printWebContentsPromiseReceipt(wc, options, waitMs = 2200) {
  const printJob = printWebContentsPromise(wc, options);
  const ms = Math.max(800, Math.min(8000, Math.trunc(Number(waitMs) || 2200)));
  return Promise.race([
    printJob.then((r) => ({ ...r, earlyReturn: false })),
    delayMs(ms).then(() => ({
      success: true,
      failureReason: "",
      earlyReturn: true,
      printJob,
    })),
  ]);
}

function delayMs(ms) {
  const n = Math.max(0, Math.trunc(Number(ms) || 0));
  if (n <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, n));
}

function queueHtmlPrintTask(runTask, gapMsOverride, queueKind) {
  const isReceipt = queueKind === "receipt";
  const prev = isReceipt ? htmlPrintQueueReceipt : htmlPrintQueueKitchen;
  const queued = prev
    .catch(() => {})
    .then(async () => {
      const gapMs = Number.isFinite(Number(gapMsOverride))
        ? Math.max(0, Math.trunc(Number(gapMsOverride) || 0))
        : PRINT_HTML_QUEUE_GAP_MS;
      if (gapMs > 0) {
        await delayMs(gapMs);
      }
      return runTask();
    });
  const tail = queued.then(
    () => undefined,
    () => undefined
  );
  if (isReceipt) htmlPrintQueueReceipt = tail;
  else htmlPrintQueueKitchen = tail;
  return queued;
}

function buildHiddenPrintWindowOptions(preferDialog) {
  const printWinOptions = {
    width: PRINT_HTML_OFFSCREEN_WIDTH,
    height: PRINT_HTML_OFFSCREEN_HEIGHT,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  };
  if (preferDialog && mainWindow && !mainWindow.isDestroyed()) {
    printWinOptions.parent = mainWindow;
  }
  return printWinOptions;
}

function ensureReusableHiddenPrintWindow() {
  if (htmlHiddenPrintWindow && !htmlHiddenPrintWindow.isDestroyed()) {
    return htmlHiddenPrintWindow;
  }
  htmlHiddenPrintWindow = new BrowserWindow(buildHiddenPrintWindowOptions(false));
  htmlHiddenPrintWindow.on("closed", () => {
    if (htmlHiddenPrintWindow && htmlHiddenPrintWindow.isDestroyed()) {
      htmlHiddenPrintWindow = null;
    }
  });
  try {
    htmlHiddenPrintWindow.webContents.setZoomFactor(1);
  } catch {
    /* ignore */
  }
  return htmlHiddenPrintWindow;
}

async function waitForHiddenWindowSettle(printWindow, baseSettleMs, options = {}) {
  const isReceiptRole = Boolean(options && options.printRole === "receipt");
  const settle = Math.max(0, Math.trunc(Number(baseSettleMs) || 0));
  const adaptiveExtra = isReceiptRole ? 0 : Math.min(800, htmlPrintFailureStreak * 160);
  /** 성능 롤아웃 때 220ms 상한을 두면 연속 주방 인쇄에서 본문이 깨진 채 스풀에 올라가는 경우가 있음 */
  const totalSettleMs = Math.min(settle + adaptiveExtra, 5000);
  if (totalSettleMs > 0) {
    await delayMs(totalSettleMs);
  }
  /** 영수증: 원격 img load 대기 금지 — DOM만 안정되면 즉시 인쇄 (이전 ~10초 지연 원인) */
  const raceCapMs = isReceiptRole
    ? Math.max(200, Math.min(totalSettleMs + 120, 500))
    : Math.max(600, Math.min(totalSettleMs + 400, 2500));
  try {
    await Promise.race([
      printWindow.webContents.executeJavaScript(
        isReceiptRole
          ? "new Promise((resolve)=>{const done=()=>{try{requestAnimationFrame(()=>requestAnimationFrame(resolve));}catch(_e){resolve();}};if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',done,{once:true});}else{done();}})"
          : "new Promise((resolve)=>{const finish=()=>{const deadline=Date.now()+4500;let last=-1,stable=0;const tick=()=>{if(Date.now()>deadline)return resolve();const n=document.body&&document.body.innerText?document.body.innerText.length:0;if(n>0&&n===last)stable++;else{stable=0;last=n;}if(stable>=3)return resolve();requestAnimationFrame(tick);};if(document.readyState==='complete')tick();else window.addEventListener('load',tick,{once:true});};const done=()=>{try{requestAnimationFrame(()=>requestAnimationFrame(finish));}catch(_e){finish();}};if(document.fonts&&document.fonts.ready){document.fonts.ready.then(done).catch(done);}else{done();}})",
        true
      ),
      delayMs(raceCapMs),
    ]);
  } catch {
    /* ignore */
  }
}

/** file:// 인쇄 HTML의 https img는 Electron did-finish-load를 수 초~10초 지연시킴 */
function stripRemoteImgSrcForThermalPrint(html) {
  const transparent =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
  return String(html || "").replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(["'])(https?:\/\/[^"']*)\2/gi,
    `$1$2${transparent}$2`
  );
}

/**
 * 영수증(printRole=receipt): 용지 부족 등으로 1차 무인쇄가 이미 나갔는데 실패로 잡히면
 * 동일 HTML 재시도 시 홀·결제 영수증이 2장 나갈 수 있어 무인쇄 재시도·드라이버 기본값 자동 2차를 쓰지 않음.
 */
function resolvePrintHtmlSilentRetryMax(options) {
  if (options && options.printRole === "receipt") return 0;
  return PRINT_HTML_SILENT_RETRY_COUNT;
}

/**
 * Windows getPrintersAsync()는 네트워크 프린터가 있으면 수 초~10초+ 걸릴 수 있음.
 * 영수증 경로에서는 절대 호출하지 않음(설정 프린터명 신뢰 / deviceName 비우면 드라이버 기본).
 */
async function getPrintersAsyncWithTimeout(timeoutMs = 2500) {
  if (!mainWindow || mainWindow.isDestroyed()) return [];
  const ms = Math.max(200, Math.trunc(Number(timeoutMs) || 2500));
  try {
    return await Promise.race([
      mainWindow.webContents.getPrintersAsync(),
      delayMs(ms).then(() => {
        throw new Error("getPrintersAsync_timeout");
      }),
    ]);
  } catch (e) {
    console.warn("[cm-pos] getPrintersAsync:", String(e && e.message ? e.message : e));
    return [];
  }
}

/**
 * 영수증·주방전 HTML: 렌더러 iframe.print()는 Electron에서 무시되는 경우가 많아 메인에서 숨은 창으로 인쇄
 * @param {{ preferDialog?: boolean }} [options] preferDialog true면 무인쇄·열전사 최적화를 건너뛰고 시스템 인쇄 대화상자만 사용(프린터 선택·미리보기)
 */
async function printHtmlDocumentInHiddenWindow(htmlString, options = {}) {
  const isReceiptRole = Boolean(options && options.printRole === "receipt");
  const queueGapMsForJob = isReceiptRole ? PRINT_HTML_QUEUE_GAP_MS_RECEIPT : undefined;
  const t0 = Date.now();
  return queueHtmlPrintTask(
    async () => {
    const preferDialog = Boolean(options && options.preferDialog);
    const silentRetryMax = resolvePrintHtmlSilentRetryMax(options);
    const tmpRoot = app.getPath("temp");
    const tmpPath = path.join(
      tmpRoot,
      `cm-pos-print-${Date.now()}-${Math.random().toString(16).slice(2)}.html`
    );
    let printWindow = null;
    let destroyAfterRun = false;
    let wroteTmpFile = false;
    /** 영수증: print() 콜백이 늦을 때 창을 바로 닫지 않고 백그라운드 유지 */
    let deferWindowDestroyMs = 0;
    let backgroundPrintJob = null;
    try {
      const warnings = [];
      let resolvedDevice = resolveThermalDeviceForHtmlPrintSync(options);
      /** 영수증: getPrintersAsync 스킵 — 설정명 그대로 사용(미설정이면 deviceName 없이 무인쇄) */
      if (!isReceiptRole) {
        if (!resolvedDevice) {
          try {
            resolvedDevice = await getWindowsDefaultPrinterName();
          } catch {
            /* ignore */
          }
        }
        if (resolvedDevice && mainWindow && !mainWindow.isDestroyed()) {
          try {
            const printers = await getPrintersAsyncWithTimeout(2500);
            const matched = printers.some((p) => String(p.name || "").trim() === resolvedDevice);
            if (!matched && printers.length > 0) {
              warnings.push(`configured device not found: ${resolvedDevice}`);
              resolvedDevice = "";
            }
          } catch {
            /* ignore */
          }
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
        isReceiptRole,
        prepMs: Date.now() - t0,
      });
      // #endregion
      const htmlForPrint = isReceiptRole ? stripRemoteImgSrcForThermalPrint(htmlString) : htmlString;
      if (preferDialog) {
        printWindow = new BrowserWindow(buildHiddenPrintWindowOptions(true));
        destroyAfterRun = true;
        try {
          printWindow.webContents.setZoomFactor(1);
        } catch {
          /* ignore */
        }
      } else {
        /** 재사용 창에 loadFile 하면 이전 작업 래스터화 중 DOM이 바뀌어 주방전 본문이 깨질 수 있음 → 건별 전용 창 */
        printWindow = new BrowserWindow(buildHiddenPrintWindowOptions(false));
        destroyAfterRun = true;
        try {
          printWindow.webContents.setZoomFactor(1);
        } catch {
          /* ignore */
        }
      }

      /**
       * 영수증: loadFile(file://) 대신 about:blank + document.write —
       * Chromium이 잔여 https/폰트 리소스를 기다리며 did-finish-load가 지연되는 경로를 피함.
       */
      if (isReceiptRole) {
        await printWindow.loadURL("about:blank");
        await printWindow.webContents.executeJavaScript(
          `(()=>{const h=${JSON.stringify(htmlForPrint)};document.open();document.write(h);document.close();})()`,
          true
        );
      } else {
        fs.writeFileSync(tmpPath, htmlForPrint, "utf8");
        wroteTmpFile = true;
        await printWindow.loadFile(tmpPath);
      }
      console.log(
        `[cm-pos] printHtml role=${isReceiptRole ? "receipt" : "other"} loadMs=${Date.now() - t0} device=${resolvedDevice || "(default)"}`
      );
      const settleMsForJob = isReceiptRole ? PRINT_HTML_SETTLE_MS_RECEIPT : PRINT_HTML_SETTLE_MS;
      await waitForHiddenWindowSettle(printWindow, settleMsForJob, {
        printRole: isReceiptRole ? "receipt" : undefined,
      });

      if (preferDialog) {
        const printStage = "dialog_only";
        try {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.focus();
          }
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
      let r;
      if (isReceiptRole) {
        const raced = await printWebContentsPromiseReceipt(printWindow.webContents, thermalOpts, 2200);
        r = { success: Boolean(raced.success), failureReason: String(raced.failureReason || "") };
        if (raced.earlyReturn && raced.printJob) {
          deferWindowDestroyMs = 12000;
          backgroundPrintJob = raced.printJob;
          console.log(
            `[cm-pos] receipt print early-return after 2200ms (driver callback still pending) totalMs=${Date.now() - t0}`
          );
        }
      } else {
        r = await printWebContentsPromise(printWindow.webContents, thermalOpts);
        let thermalAttempts = 1;
        while (!r.success && thermalAttempts <= silentRetryMax) {
          thermalAttempts += 1;
          await delayMs(120 * thermalAttempts + htmlPrintFailureStreak * 80);
          await waitForHiddenWindowSettle(printWindow, settleMsForJob, {
            printRole: undefined,
          });
          r = await printWebContentsPromise(printWindow.webContents, thermalOpts);
        }
      }
      // #region agent log
      debugLog("H3_thermal_fail", "windows-pos/main.js:printHtmlDocumentInHiddenWindow:thermal_result", "thermal_result", {
        success: Boolean(r.success),
        failureReason: String(r.failureReason || ""),
      });
      // #endregion
      if (!r.success && DEFAULT_PRINT_SILENT && !isReceiptRole) {
        printStage = "silent_driver_default";
        const driverDefaultOpts = getHtmlSilentDriverDefaultPrintOptions();
        if (resolvedDevice) driverDefaultOpts.deviceName = resolvedDevice;
        r = await printWebContentsPromise(printWindow.webContents, driverDefaultOpts);
        let driverAttempts = 1;
        while (!r.success && driverAttempts <= silentRetryMax) {
          driverAttempts += 1;
          await delayMs(120 * driverAttempts + htmlPrintFailureStreak * 80);
          await waitForHiddenWindowSettle(printWindow, settleMsForJob, {
            printRole: undefined,
          });
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
      /** 영수증: 대화상자 폴백 금지 — 사용자 대기·수 초 지연의 주원인 */
      if (!r.success && !isReceiptRole) {
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
      if (r.success) {
        htmlPrintFailureStreak = 0;
        const spoolFlushMs = isReceiptRole
          ? POST_HTML_PRINT_SPOOL_FLUSH_MS_RECEIPT
          : POST_HTML_PRINT_SPOOL_FLUSH_MS_RESOLVED;
        if (spoolFlushMs > 0 && deferWindowDestroyMs <= 0) {
          await delayMs(spoolFlushMs);
        }
      } else {
        htmlPrintFailureStreak = Math.min(htmlPrintFailureStreak + 1, 6);
      }
      let usedDeviceOut = resolvedDevice || "";
      /** 영수증은 getPrintersAsync 금지 — 미설정이면 빈 문자열(무인쇄는 OS 기본으로 이미 성공했을 수 있음) */
      if (
        !isReceiptRole &&
        r.success &&
        !String(usedDeviceOut).trim() &&
        printStage !== "dialog"
      ) {
        usedDeviceOut = await getWindowsDefaultPrinterName();
      }
      console.log(
        `[cm-pos] printHtml done role=${isReceiptRole ? "receipt" : "other"} totalMs=${Date.now() - t0} ok=${Boolean(r.success)} stage=${printStage}`
      );
      return {
        ok: r.success,
        reason: r.failureReason || (r.success ? "" : "print_failed"),
        printStage,
        warnings,
        usedDevice: usedDeviceOut,
      };
    } catch (e) {
      htmlPrintFailureStreak = Math.min(htmlPrintFailureStreak + 1, 6);
      console.warn(`[cm-pos] printHtml error totalMs=${Date.now() - t0}`, e);
      return { ok: false, reason: String(e && e.message ? e.message : e), usedDevice: "" };
    } finally {
      const destroyWindowNow = () => {
        try {
          if (destroyAfterRun && printWindow && !printWindow.isDestroyed()) printWindow.destroy();
        } catch {
          /* ignore */
        }
        try {
          if (wroteTmpFile && fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {
          /* ignore */
        }
      };
      if (deferWindowDestroyMs > 0 && printWindow && !printWindow.isDestroyed()) {
        const win = printWindow;
        const job = backgroundPrintJob;
        const delay = deferWindowDestroyMs;
        printWindow = null;
        destroyAfterRun = false;
        setTimeout(() => {
          void Promise.resolve(job)
            .catch(() => {})
            .finally(() => {
              try {
                if (win && !win.isDestroyed()) win.destroy();
              } catch {
                /* ignore */
              }
            });
        }, delay);
        try {
          if (wroteTmpFile && fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {
          /* ignore */
        }
      } else {
        destroyWindowNow();
      }
    }
  },
    queueGapMsForJob,
    isReceiptRole ? "receipt" : "kitchen"
  );
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
  const printers = await getPrintersAsyncWithTimeout(4000);
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
  const legacyDefault = normalizePrinterNameValue(
    process.env.WINDOWS_POS_PRINT_DEVICE ?? cfg.printDeviceName ?? p.deviceName ?? ""
  );
  const receiptDev = normalizePrinterNameValue(p.receiptDeviceName || "") || legacyDefault;

  const explicit = normalizePrinterNameValue(o.deviceName || "");
  if (explicit) return explicit;

  if (o.printRole === "kitchen") {
    const stRaw = o.kitchenStation != null ? Number(o.kitchenStation) : 1;
    const st = Math.min(3, Math.max(1, Number.isFinite(stRaw) ? stRaw : 1));
    const k1 = normalizePrinterNameValue(p.kitchen1DeviceName || "");
    const k2 = normalizePrinterNameValue(p.kitchen2DeviceName || "");
    const k3 = normalizePrinterNameValue(p.kitchen3DeviceName || "");
    const kAny = normalizePrinterNameValue(p.kitchenDeviceName || "");
    const slot = st === 2 ? k2 : st === 3 ? k3 : k1;
    return slot || kAny || receiptDev;
  }
  return receiptDev;
}

/** OS 기본 프린터 표시 이름(무인쇄 시 deviceName 미지정과 동일 대상) */
async function getWindowsDefaultPrinterName() {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return "";
    const printers = await getPrintersAsyncWithTimeout(2500);
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

function normalizePrinterNameValue(value) {
  if (value === null || value === undefined) return "";
  const s = String(value).trim();
  // 점검 UI에서 미지정 값을 "-"로 두는 경우가 있어 실제 프린터명 저장/사용 시 실패를 유발함
  if (!s || s === "-" || s === "—") return "";
  return s;
}

/**
 * POS 점검창에서 runtime-config print 설정을 바로 저장한다.
 * - userData/runtime-config.json 에만 기록(매장별 로컬 오버라이드)
 * - print 하위 알 수 없는 키는 보존
 */
function savePrintConfigSnapshotFromIpc(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("invalid_payload");
  }
  const cfg = readRuntimeConfig();
  const prevPrint = cfg && typeof cfg.print === "object" && cfg.print ? cfg.print : {};
  const nextPrint = {
    ...prevPrint,
    silent: readConfigBool(payload.silent, readConfigBool(prevPrint.silent, true)),
    deviceName: normalizePrinterNameValue(payload.deviceName),
    receiptDeviceName: normalizePrinterNameValue(payload.receiptDeviceName),
    kitchenDeviceName: normalizePrinterNameValue(payload.kitchenDeviceName),
    kitchen1DeviceName: normalizePrinterNameValue(payload.kitchen1DeviceName),
    kitchen2DeviceName: normalizePrinterNameValue(payload.kitchen2DeviceName),
    kitchen3DeviceName: normalizePrinterNameValue(payload.kitchen3DeviceName),
  };
  const nextCfg = {
    ...cfg,
    print: nextPrint,
  };
  const userPath = path.join(app.getPath("userData"), "runtime-config.json");
  fs.mkdirSync(path.dirname(userPath), { recursive: true });
  const text = JSON.stringify(nextCfg, null, 4) + "\n";
  fs.writeFileSync(userPath, text, "utf8");
  // 업데이트·브랜드 전환 대비 공유 백업 (충만/Omni AppData 폴더가 달라도 복구)
  try {
    const backupPath = getSharedPosSettingsBackupPath();
    if (backupPath) {
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.writeFileSync(backupPath, text, "utf8");
    }
  } catch (e) {
    console.warn("[cm-pos] shared print backup failed:", e && e.message ? e.message : e);
  }
  return getPrintConfigSnapshotForIpc();
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

/** HTML 인쇄 후 RAW ESC/POS로 용지 절단 — 실패해도 인쇄 성공은 유지
 * @param {string} printerName
 * @param {{ timeoutMs?: number }} [opts]
 */
function sendEscPosCutForPrinter(printerName, opts = {}) {
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
    const timeoutMs = Math.max(
      1500,
      Math.min(30000, Math.trunc(Number(opts.timeoutMs) || 8000))
    );
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-PrinterName", name],
      { windowsHide: true, timeout: timeoutMs, maxBuffer: 256 * 1024 },
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
    const script = getEscPosDrawerScriptPath();
    if (!fs.existsSync(script)) {
      console.warn("[cm-pos] ESC/POS drawer script missing:", script);
      resolve({ ok: false, reason: "no_script" });
      return;
    }
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-PrinterName", name],
      { windowsHide: true, timeout: 5000, maxBuffer: 256 * 1024 },
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
        {
          label: "ตั้งค่าเครื่องรูดบัตร…",
          click: () => {
            void configureLinkposEdcFromMenu();
          },
        },
        {
          label: "สถานะเครื่องรูดบัตร…",
          click: () => {
            const st =
              linkposBridgeApi && typeof linkposBridgeApi.getStatus === "function"
                ? linkposBridgeApi.getStatus()
                : { running: false };
            const opts = readLinkposBridgeOptionsFromRuntime();
            const lines = [
              opts.enabled ? "เปิดใช้งาน: ใช่" : "เปิดใช้งาน: ไม่",
              st.running
                ? `เชื่อมต่อภายใน: พร้อม`
                : "เชื่อมต่อภายใน: ยังไม่พร้อม",
              `พอร์ต: ${opts.serial.path}`,
              st.serialReady ? "เครื่องพร้อม: ใช่" : "เครื่องพร้อม: ไม่ — เช็คสาย/พอร์ต",
              "",
              "เลือกพอร์ตได้ที่เมนู 「ตั้งค่าเครื่องรูดบัตร」",
            ];
            dialog.showMessageBox({
              type: "info",
              title: "เครื่องรูดบัตร",
              message: "สถานะการเชื่อมต่อ",
              detail: lines.join("\n"),
            });
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

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  loadPosMainUrl(false);

  if (OPEN_DEVTOOLS_ON_START) {
    try {
      const wc = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null;
      if (wc && (typeof wc.isDestroyed !== "function" || !wc.isDestroyed())) {
        wc.once("did-finish-load", () => {
          try {
            const w = mainWindow;
            if (!w || w.isDestroyed()) return;
            const currentWc = w.webContents;
            if (!currentWc || (typeof currentWc.isDestroyed === "function" && currentWc.isDestroyed())) return;
            currentWc.openDevTools({ mode: "detach" });
          } catch (e) {
            console.warn("[cm-pos] openDevTools on start skipped:", e && e.message ? e.message : e);
          }
        });
      }
    } catch (e) {
      console.warn("[cm-pos] failed to register openDevTools listener:", e && e.message ? e.message : e);
    }
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
    try {
      if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow();
        return;
      }
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } catch (e) {
      console.warn("[cm-pos] second-instance focus failed; recreating window", e && e.message ? e.message : e);
      try {
        if (!mainWindow || mainWindow.isDestroyed()) {
          createWindow();
        }
      } catch {
        /* ignore */
      }
    }
  });

  app.whenReady().then(() => {
    migrateLegacyPosSettingsIntoUserData();
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

    ipcMain.handle("cm-pos-is-system-online", (event) => {
      if (!senderAllowedForTrustedShell(event.sender)) return false;
      return isSystemOnline();
    });

    ipcMain.handle("cm-pos-reload-pos-url", async (event, opts) => {
      if (!senderAllowedForTrustedShell(event.sender)) {
        return { ok: false, reason: "forbidden" };
      }
      if (!mainWindow || mainWindow.isDestroyed()) {
        return { ok: false, reason: "no_window" };
      }
      const preferFresh = opts && opts.preferFresh === true;
      const effectivePreferFresh = preferFresh && isSystemOnline();
      posMainLoadFailAttempts = 0;
      clearPosMainLoadRetryTimer();
      return loadPosUrlWithTimeout(effectivePreferFresh);
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

    ipcMain.handle("cm-pos-save-print-config", (event, payload) => {
      if (!senderAllowedOrigin(event.sender)) {
        return { ok: false, reason: "forbidden" };
      }
      try {
        const config = savePrintConfigSnapshotFromIpc(payload);
        return { ok: true, config };
      } catch (e) {
        return { ok: false, reason: String(e && e.message ? e.message : e) };
      }
    });

    ipcMain.handle("cm-pos-open-cash-drawer", async (event) => {
      if (!senderAllowedOrigin(event.sender)) {
        return { ok: false, reason: "forbidden" };
      }
      /**
       * getPrintersAsync(기본 프린터 조회) 금지 — 네트워크 프린터 PC에서 수 초~10초 지연.
       * runtime-config의 receiptDeviceName(또는 legacy deviceName)만 사용.
       */
      const device = String(resolveThermalDeviceForHtmlPrintSync({ printRole: "receipt" }) || "").trim();
      if (!device) {
        return { ok: false, reason: "no_printer" };
      }
      const r = await sendEscPosDrawerKickForPrinter(device);
      return r.ok
        ? { ok: true, usedDevice: device }
        : { ok: false, reason: String(r.reason || "drawer_kick_failed") };
    });

    ipcMain.handle("cm-pos-linkpos-health", async (event) => {
      if (!senderAllowedOrigin(event.sender)) {
        return { ok: false, running: false, serialReady: false, reason: "forbidden" };
      }
      try {
        if (!linkposBridgeApi || typeof linkposBridgeApi.getStatus !== "function") {
          return { ok: false, running: false, serialReady: false, reason: "module_missing" };
        }
        const st = linkposBridgeApi.getStatus() || {};
        return {
          ok: true,
          running: Boolean(st.running),
          serialReady: Boolean(st.serialReady),
          mock: Boolean(st.mock),
          httpPort: st.httpPort || null,
          serialPort: st.serialPort || null,
        };
      } catch (e) {
        return {
          ok: false,
          running: false,
          serialReady: false,
          reason: String(e && e.message ? e.message : e),
        };
      }
    });

    ipcMain.handle("cm-pos-linkpos-transaction", async (event, payload) => {
      if (!senderAllowedOrigin(event.sender)) {
        return { success: false, error: "forbidden" };
      }
      try {
        if (!linkposBridgeApi || typeof linkposBridgeApi.runLinkposTransaction !== "function") {
          return { success: false, error: "module_missing" };
        }
        const body = payload && typeof payload === "object" ? payload : {};
        return await linkposBridgeApi.runLinkposTransaction(body);
      } catch (e) {
        return { success: false, error: String(e && e.message ? e.message : e) };
      }
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
      const printRole =
        payload?.printRole === "kitchen" || payload?.printRole === "receipt"
          ? payload.printRole
          : undefined;
      const isReceiptRole = printRole === "receipt";
      const result = await printHtmlDocumentInHiddenWindow(html, {
        preferDialog: Boolean(payload?.preferDialog),
        printRole,
        kitchenStation: Number.isFinite(kitchenStation) ? Math.min(3, Math.max(1, kitchenStation)) : undefined,
        deviceName: typeof payload?.deviceName === "string" ? payload.deviceName : "",
      });
      const out = { ...result };
      const sendCut = shouldSendEscPosRawCut(payload);
      /** 스풀 안정화는 printHtmlDocumentInHiddenWindow 성공 시 이미 수행됨(절단 직전 중복 대기 제거) */
      if (result.ok && !Boolean(payload?.preferDialog) && sendCut) {
        try {
          let device = String(result.usedDevice || "").trim() || resolveThermalDeviceForHtmlPrintSync({
            printRole,
            kitchenStation: Number.isFinite(kitchenStation) ? Math.min(3, Math.max(1, kitchenStation)) : undefined,
          });
          /** 영수증: getPrintersAsync(기본프린터 조회)로 절단을 지연시키지 않음 */
          if (!device && !isReceiptRole) {
            device = String((await resolvePrintDeviceNameForJob()) || "").trim();
          }
          /** 무인쇄 실패 후 인쇄 대화상자로만 성공한 경우 — 사용자가 고른 기기명을 알 수 없어 RAW 절단 생략(빈 이름으로 no_printer 오탐 방지) */
          if (!device && result.printStage === "dialog") {
            console.warn("[cm-pos] skip ESC/POS cut: dialog fallback without resolved printer name");
          } else if (device) {
            if (isReceiptRole) {
              /** 절단은 백그라운드 — IPC·다음 인쇄 큐를 붙잡지 않음 (RAW 포트 지연 시 ~10s+ 체감 방지) */
              out.cutOk = true;
              out.cutDeferred = true;
              void sendEscPosCutForPrinter(device, { timeoutMs: 4000 }).then((cutRes) => {
                if (!cutRes.ok) {
                  console.warn("[cm-pos] ESC/POS cut (deferred) failed:", cutRes.reason || "");
                }
              });
            } else {
              const cutRes = await sendEscPosCutForPrinter(device, { timeoutMs: 8000 });
              out.cutOk = Boolean(cutRes.ok);
              if (cutRes.reason) out.cutReason = String(cutRes.reason);
              if (!cutRes.ok) {
                console.warn("[cm-pos] ESC/POS cut failed:", cutRes.reason || "");
              }
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
      const prevEnabled = Boolean(customerDisplayConfig.enabled);
      const prevMonitorPreference = customerDisplayConfig.monitorPreference;
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
      writeCustomerDisplayConfigToRuntime(customerDisplayConfig);
      if (!customerDisplayConfig.enabled) {
        clearCustomerDisplayAutoOpenRetries();
        return closeCustomerDisplayWindow();
      }
      if (customerDisplayConfig.autoOpen) {
        const windowMissing = !customerDisplayWindow || customerDisplayWindow.isDestroyed();
        const needReposition =
          windowMissing ||
          !prevEnabled ||
          prevMonitorPreference !== customerDisplayConfig.monitorPreference;
        const result = await ensureCustomerDisplayWindow(false, { reposition: needReposition });
        scheduleCustomerDisplayAutoOpenRetries();
        return result;
      }
      clearCustomerDisplayAutoOpenRetries();
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
      const kind = ["idle", "ordering", "payment", "qr", "change"].includes(kindRaw) ? kindRaw : "idle";
      const normalized = {
        storeCode,
        kind,
        updatedAt: String(payload?.updatedAt || new Date().toISOString()),
        uiLang: ["ko", "en", "th", "mm", "la", "kh", "vi", "ms"].includes(String(payload?.uiLang || ""))
          ? String(payload.uiLang)
          : undefined,
        title: typeof payload?.title === "string" ? payload.title : undefined,
        message: typeof payload?.message === "string" ? payload.message : undefined,
        qrPayload: typeof payload?.qrPayload === "string" ? payload.qrPayload : undefined,
        qrType:
          String(payload?.qrType || "").trim().toUpperCase() === "CREDIT_CARD"
            ? "CREDIT_CARD"
            : typeof payload?.qrPayload === "string"
              ? "THAI_QR"
              : undefined,
        paymentLines: Array.isArray(payload?.paymentLines) ? payload.paymentLines : undefined,
        brandLogoUrl: typeof payload?.brandLogoUrl === "string" ? payload.brandLogoUrl : undefined,
        items: Array.isArray(payload?.items) ? payload.items : undefined,
        totalAmount: Number(payload?.totalAmount || 0),
        changeAmountBaht:
          payload?.changeAmountBaht != null && Number.isFinite(Number(payload.changeAmountBaht))
            ? Number(payload.changeAmountBaht)
            : undefined,
        breakdown:
          payload?.breakdown && typeof payload.breakdown === "object"
            ? {
                subtotal: Number(payload.breakdown.subtotal || 0),
                discountAmt: Number(payload.breakdown.discountAmt || 0),
                vatFeeAmt: Number(payload.breakdown.vatFeeAmt || 0),
                receiptExclusiveSubtotalDisplay:
                  payload.breakdown.receiptExclusiveSubtotalDisplay != null
                    ? Number(payload.breakdown.receiptExclusiveSubtotalDisplay)
                    : undefined,
                receiptVatDisplayAmt:
                  payload.breakdown.receiptVatDisplayAmt != null
                    ? Number(payload.breakdown.receiptVatDisplayAmt)
                    : undefined,
                receiptTaxableGrossForDisplay:
                  payload.breakdown.receiptTaxableGrossForDisplay != null
                    ? Number(payload.breakdown.receiptTaxableGrossForDisplay)
                    : undefined,
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
        idleMediaType:
          payload?.idleMediaType === "image" || payload?.idleMediaType === "video"
            ? payload.idleMediaType
            : payload?.idleMediaType === "none"
              ? "none"
              : undefined,
        idleMediaUrl: typeof payload?.idleMediaUrl === "string" ? payload.idleMediaUrl : undefined,
      };
      broadcastCustomerDisplayState(normalized);
      if (
        customerDisplayConfig.enabled &&
        customerDisplayConfig.autoOpen &&
        (!customerDisplayWindow || customerDisplayWindow.isDestroyed())
      ) {
        await ensureCustomerDisplayWindow(false);
      }
      return { ok: true };
    });

    applySavedCustomerDisplayConfig();
    createWindow();
    void startEmbeddedLinkposBridge();
    if (customerDisplayConfig.enabled && customerDisplayConfig.autoOpen) {
      void ensureCustomerDisplayWindow(false).finally(() => {
        scheduleCustomerDisplayAutoOpenRetries();
      });
    }

    const rebalanceCustomerDisplay = () => {
      if (customerDisplayWindow && !customerDisplayWindow.isDestroyed()) {
        placeCustomerWindowOnTarget(customerDisplayWindow);
        return;
      }
      if (customerDisplayConfig.enabled && customerDisplayConfig.autoOpen) {
        void ensureCustomerDisplayWindow(false);
      }
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
  void stopEmbeddedLinkposBridge();
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
