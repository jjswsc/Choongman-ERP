import { Capacitor, registerPlugin } from '@capacitor/core'
import { isCapacitorAndroid } from '@/lib/cm-native-app'
import {
  hasAnyAndroidThermalTarget,
  parseAndroidThermalConfigJson,
  resolveAndroidThermalRasterParams,
  resolveAndroidThermalTarget,
  toPrintMediaHtml,
  type AndroidThermalConfig,
  type AndroidThermalTarget,
} from '@/lib/android-thermal-printer-config'

type NativeResult = { ok: boolean; reason?: string; usedDevice?: string }

interface CmThermalPrinterPlugin {
  getConfig(): Promise<{ json?: string }>
  saveConfig(opts: { json: string }): Promise<{ ok: boolean }>
  listBluetoothPrinters(): Promise<
    NativeResult & { devices: Array<{ address: string; name: string }> }
  >
  listUsbPrinters(): Promise<
    NativeResult & {
      devices: Array<{ vendorId: number; productId: number; name: string; hasPermission: boolean }>
    }
  >
  requestUsbPermission(opts: { vendorId: number; productId: number }): Promise<NativeResult & { granted: boolean }>
  printHtml(opts: {
    html: string
    baseUrl?: string
    target: AndroidThermalTarget
    paperWidthMm: number
    cropWidthDots: number
    printWidthDots: number
    leftOffsetDots: number
    cut: boolean
    kickDrawer?: boolean
    settleMs?: number
  }): Promise<NativeResult>
  openCashDrawer(opts: { target: AndroidThermalTarget }): Promise<NativeResult>
}

const PLUGIN_NAME = 'CmThermalPrinter'
const CmThermalPrinter = registerPlugin<CmThermalPrinterPlugin>(PLUGIN_NAME)

let cachedConfig: AndroidThermalConfig | null = null
let loadPromise: Promise<AndroidThermalConfig | null> | null = null

/** 무음 인쇄 플러그인이 들어간 APK(versionCode 2+)에서만 true. 구버전 APK는 기존 인쇄 대화상자 경로. */
export function isAndroidThermalPluginAvailable(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return isCapacitorAndroid() && Capacitor.isPluginAvailable(PLUGIN_NAME)
  } catch {
    return false
  }
}

export function loadAndroidThermalConfig(opts?: { force?: boolean }): Promise<AndroidThermalConfig | null> {
  if (!isAndroidThermalPluginAvailable()) return Promise.resolve(null)
  if (!opts?.force && cachedConfig) return Promise.resolve(cachedConfig)
  if (!opts?.force && loadPromise) return loadPromise
  loadPromise = CmThermalPrinter.getConfig()
    .then((r) => {
      cachedConfig = parseAndroidThermalConfigJson(r?.json)
      return cachedConfig
    })
    .catch(() => null)
    .finally(() => {
      loadPromise = null
    })
  return loadPromise
}

export function getCachedAndroidThermalConfig(): AndroidThermalConfig | null {
  return cachedConfig
}

/** 동기 판정(지연값·QR 큐 분기용). 앱 시작 시 `loadAndroidThermalConfig()`로 캐시를 채워 둔다. */
export function isAndroidSilentPrintActive(): boolean {
  if (!cachedConfig?.enabled) return false
  return hasAnyAndroidThermalTarget(cachedConfig) && isAndroidThermalPluginAvailable()
}

export async function saveAndroidThermalConfig(cfg: AndroidThermalConfig): Promise<boolean> {
  if (!isAndroidThermalPluginAvailable()) return false
  const r = await CmThermalPrinter.saveConfig({ json: JSON.stringify(cfg) })
  if (r?.ok) cachedConfig = cfg
  return Boolean(r?.ok)
}

export type AndroidThermalPrintResult = NativeResult & {
  /** 무음 인쇄 대상이 아님(플러그인 없음·꺼짐·프린터 미지정) → 호출부가 기존 경로로 진행 */
  skipped?: boolean
}

export async function printHtmlViaAndroidThermal(
  html: string,
  opts: {
    printRole?: 'receipt' | 'kitchen'
    kitchenStation?: number
    cut?: boolean
    kickDrawer?: boolean
    /** 설정 화면 테스트 인쇄: 꺼져 있어도 지정 대상으로 보냄 */
    target?: AndroidThermalTarget
    config?: AndroidThermalConfig
  }
): Promise<AndroidThermalPrintResult> {
  if (!isAndroidThermalPluginAvailable()) return { ok: false, skipped: true }
  const cfg = opts.config ?? (await loadAndroidThermalConfig())
  if (!cfg) return { ok: false, skipped: true }
  const target =
    opts.target ??
    (cfg.enabled ? resolveAndroidThermalTarget(cfg, { printRole: opts.printRole, kitchenStation: opts.kitchenStation }) : null)
  if (!target) return { ok: false, skipped: true }
  try {
    const r = await CmThermalPrinter.printHtml({
      html: toPrintMediaHtml(html),
      baseUrl: window.location.origin,
      target,
      ...resolveAndroidThermalRasterParams(cfg),
      cut: opts.cut !== false,
      kickDrawer: opts.kickDrawer === true,
    })
    return { ok: Boolean(r?.ok), reason: r?.reason, usedDevice: r?.usedDevice }
  } catch (e) {
    return { ok: false, reason: `plugin_error:${String(e)}` }
  }
}

export async function openCashDrawerViaAndroidThermal(): Promise<AndroidThermalPrintResult> {
  if (!isAndroidThermalPluginAvailable()) return { ok: false, skipped: true }
  const cfg = await loadAndroidThermalConfig()
  const target = cfg?.enabled ? resolveAndroidThermalTarget(cfg, { printRole: 'receipt' }) : null
  if (!target) return { ok: false, skipped: true }
  try {
    const r = await CmThermalPrinter.openCashDrawer({ target })
    return { ok: Boolean(r?.ok), reason: r?.reason, usedDevice: r?.usedDevice }
  } catch (e) {
    return { ok: false, reason: `plugin_error:${String(e)}` }
  }
}

export async function listAndroidBluetoothPrinters() {
  return CmThermalPrinter.listBluetoothPrinters()
}

export async function listAndroidUsbPrinters() {
  return CmThermalPrinter.listUsbPrinters()
}

export async function requestAndroidUsbPermission(vendorId: number, productId: number) {
  return CmThermalPrinter.requestUsbPermission({ vendorId, productId })
}
