/**
 * Android POS 앱(Capacitor) 무음 인쇄 — 기기 로컬 프린터 매핑.
 * Windows 하이브리드 `runtime-config.json`의 receipt / kitchen1~3 / kitchen(공통) 슬롯과 같은 규칙.
 */

export type AndroidThermalTarget =
  | { type: 'tcp'; host: string; port: number }
  | { type: 'bluetooth'; address: string; name?: string }
  | { type: 'usb'; vendorId: number; productId: number; name?: string }

export type AndroidThermalSlot = 'receipt' | 'kitchen' | 'kitchen1' | 'kitchen2' | 'kitchen3'

export const ANDROID_THERMAL_SLOTS: readonly AndroidThermalSlot[] = [
  'receipt',
  'kitchen1',
  'kitchen2',
  'kitchen3',
  'kitchen',
]

export type AndroidThermalPaperWidth = 80 | 58

export type AndroidThermalConfig = {
  enabled: boolean
  paperWidth: AndroidThermalPaperWidth
  /** 80mm로 그린 영수증에서 헤드(72mm) 창을 몇 mm 오른쪽에서 시작할지 */
  leftOffsetMm: number
  targets: Partial<Record<AndroidThermalSlot, AndroidThermalTarget>>
}

export const ANDROID_THERMAL_DEFAULT_LEFT_OFFSET_MM = 2
export const ANDROID_THERMAL_DEFAULT_TCP_PORT = 9100
const DOTS_PER_MM = 8
/** 80mm 용지 열전사 헤드 유효 폭 72mm */
const PRINT_HEAD_80MM_DOTS = 576
/** 58mm 용지 헤드 유효 폭 48mm */
const PRINT_HEAD_58MM_DOTS = 384

export function defaultAndroidThermalConfig(): AndroidThermalConfig {
  return {
    enabled: false,
    paperWidth: 80,
    leftOffsetMm: ANDROID_THERMAL_DEFAULT_LEFT_OFFSET_MM,
    targets: {},
  }
}

function toInt(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN
  return Number.isFinite(n) ? Math.trunc(n) : null
}

const BT_ADDRESS_RE = /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/

export function normalizeAndroidThermalTarget(raw: unknown): AndroidThermalTarget | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.type === 'tcp') {
    const host = String(r.host ?? '').trim()
    if (!host) return null
    const port = toInt(r.port)
    return {
      type: 'tcp',
      host,
      port: port != null && port > 0 && port < 65536 ? port : ANDROID_THERMAL_DEFAULT_TCP_PORT,
    }
  }
  if (r.type === 'bluetooth') {
    const address = String(r.address ?? '').trim().toUpperCase()
    if (!BT_ADDRESS_RE.test(address)) return null
    const name = String(r.name ?? '').trim()
    return name ? { type: 'bluetooth', address, name } : { type: 'bluetooth', address }
  }
  if (r.type === 'usb') {
    const vendorId = toInt(r.vendorId)
    const productId = toInt(r.productId)
    if (vendorId == null || productId == null || vendorId <= 0 || productId <= 0) return null
    const name = String(r.name ?? '').trim()
    return name ? { type: 'usb', vendorId, productId, name } : { type: 'usb', vendorId, productId }
  }
  return null
}

export function normalizeAndroidThermalConfig(raw: unknown): AndroidThermalConfig {
  const base = defaultAndroidThermalConfig()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Record<string, unknown>
  const offset = typeof r.leftOffsetMm === 'number' && Number.isFinite(r.leftOffsetMm) ? r.leftOffsetMm : null
  const targetsRaw = r.targets && typeof r.targets === 'object' ? (r.targets as Record<string, unknown>) : {}
  const targets: AndroidThermalConfig['targets'] = {}
  for (const slot of ANDROID_THERMAL_SLOTS) {
    const t = normalizeAndroidThermalTarget(targetsRaw[slot])
    if (t) targets[slot] = t
  }
  return {
    enabled: r.enabled === true,
    paperWidth: r.paperWidth === 58 ? 58 : 80,
    leftOffsetMm: offset == null ? base.leftOffsetMm : Math.min(8, Math.max(0, offset)),
    targets,
  }
}

export function parseAndroidThermalConfigJson(json: string | null | undefined): AndroidThermalConfig {
  const s = String(json ?? '').trim()
  if (!s) return defaultAndroidThermalConfig()
  try {
    return normalizeAndroidThermalConfig(JSON.parse(s))
  } catch {
    return defaultAndroidThermalConfig()
  }
}

export function hasAnyAndroidThermalTarget(cfg: AndroidThermalConfig | null | undefined): boolean {
  if (!cfg) return false
  return ANDROID_THERMAL_SLOTS.some((s) => cfg.targets[s] != null)
}

/** 주방 N → 주방 공통 → 영수증 순으로 폴백 (Windows `resolveThermalDeviceForHtmlPrintSync`와 동일) */
export function resolveAndroidThermalTarget(
  cfg: AndroidThermalConfig | null | undefined,
  opts: { printRole?: 'receipt' | 'kitchen'; kitchenStation?: number }
): AndroidThermalTarget | null {
  if (!cfg) return null
  const receipt = cfg.targets.receipt ?? null
  if (opts.printRole === 'kitchen') {
    const st = Math.min(3, Math.max(1, Number.isFinite(opts.kitchenStation) ? Number(opts.kitchenStation) : 1))
    const slot = st === 2 ? cfg.targets.kitchen2 : st === 3 ? cfg.targets.kitchen3 : cfg.targets.kitchen1
    return slot ?? cfg.targets.kitchen ?? receipt
  }
  return receipt
}

export function describeAndroidThermalTarget(t: AndroidThermalTarget | null | undefined): string {
  if (!t) return ''
  if (t.type === 'tcp') return `LAN ${t.host}:${t.port}`
  if (t.type === 'bluetooth') return `BT ${t.name ? `${t.name} ` : ''}(${t.address})`
  const hex = (n: number) => n.toString(16).toUpperCase().padStart(4, '0')
  return `USB ${t.name ? `${t.name} ` : ''}(${hex(t.vendorId)}:${hex(t.productId)})`
}

/**
 * 숨김 WebView는 화면(screen) 미디어로 그린다. 인쇄 전용 규칙(`.receipt-print-actions` 숨김 등)이
 * 적용되도록 `@media print` → 항상, `@media screen` → 적용 안 됨(print)으로 바꾼다.
 */
export function toPrintMediaHtml(html: string): string {
  return html.replace(/@media(\s+)(print|screen)\b/gi, (_m, sp: string, kind: string) =>
    kind.toLowerCase() === 'print' ? `@media${sp}all` : `@media${sp}print`
  )
}

export function resolveAndroidThermalRasterParams(cfg: AndroidThermalConfig): {
  paperWidthMm: number
  cropWidthDots: number
  printWidthDots: number
  leftOffsetDots: number
} {
  return {
    paperWidthMm: 80,
    cropWidthDots: PRINT_HEAD_80MM_DOTS,
    printWidthDots: cfg.paperWidth === 58 ? PRINT_HEAD_58MM_DOTS : PRINT_HEAD_80MM_DOTS,
    leftOffsetDots: Math.round(cfg.leftOffsetMm * DOTS_PER_MM),
  }
}
