import type { PosPrinterSettings } from '@/lib/api-client'

/** 1–99만 영수증·주방전표에 노출 */
export function posGuestCountForThermalPrint(n: unknown): number | undefined {
  const g = Math.max(0, Math.min(99, Math.trunc(Number(n) || 0)))
  return g > 0 ? g : undefined
}

export function posGuestCountSpread(n: unknown): { guestCount: number } | Record<PropertyKey, never> {
  const g = posGuestCountForThermalPrint(n)
  return g != null ? { guestCount: g } : {}
}

export function posKitchenGuestSpread(
  n: unknown,
  label: string
): { guestCount: number; guestCountLabel: string } | Record<PropertyKey, never> {
  const g = posGuestCountForThermalPrint(n)
  return g != null ? { guestCount: g, guestCountLabel: label } : {}
}

export type StoreAutoPrintFlags = {
  receiptOnOrder: boolean
  receiptOnAddOrder: boolean
  receiptOnPayment: boolean
  kitchenOnOrder: boolean
}

export function storeAutoPrintFlagsFromSettings(s: PosPrinterSettings | null | undefined): StoreAutoPrintFlags {
  return {
    receiptOnOrder: Boolean(s?.autoPrintReceiptOnOrder),
    receiptOnAddOrder: Boolean(s?.autoPrintReceiptOnAddOrder || s?.autoPrintReceiptOnOrder),
    receiptOnPayment: Boolean(s?.autoPrintReceiptOnPayment ?? s?.autoPrintReceiptOnOrder),
    kitchenOnOrder: Boolean(s?.autoPrintKitchenSlipOnOrder),
  }
}

export function mergeStoreAutoPrintFlags(
  fromSettings: StoreAutoPrintFlags,
  fromState: StoreAutoPrintFlags
): StoreAutoPrintFlags {
  return {
    receiptOnOrder: fromState.receiptOnOrder || fromSettings.receiptOnOrder,
    receiptOnAddOrder: fromState.receiptOnAddOrder || fromSettings.receiptOnAddOrder,
    receiptOnPayment: fromState.receiptOnPayment || fromSettings.receiptOnPayment,
    kitchenOnOrder: fromState.kitchenOnOrder || fromSettings.kitchenOnOrder,
  }
}

/** Supabase Realtime INSERT 페이로드의 id는 number가 아닐 수 있음(bigint 등 → 문자열) */
export function coercePosOrderIdFromRealtime(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.trunc(raw)
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    const n = parseInt(raw.trim(), 10)
    return n > 0 ? n : null
  }
  return null
}

export function isSessionNewOrder(createdAtRaw: unknown, sessionStartedAtMs: number, graceMs = 5000): boolean {
  const s = String(createdAtRaw ?? '').trim()
  if (!s) return false
  const ms = new Date(s).getTime()
  if (!Number.isFinite(ms)) return false
  return ms >= sessionStartedAtMs - graceMs
}

export const MAIN_POS_LAST_SEEN_ORDER_ID_KEY_PREFIX = 'pos_main_last_seen_order_id:'
export const MAIN_POS_STARTUP_CATCHUP_WINDOW_MS = 10 * 60 * 1000
export const MAIN_POS_STARTUP_CATCHUP_DURATION_MS = 3 * 60 * 1000
export const POS_PRINT_DEBUG_STORAGE_KEY = 'pos_print_debug'
export const MAIN_POS_META_SCAN_INTERVAL_MS = 12_000
export const KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS = 80
export const DINE_IN_LOCAL_SUBMIT_PRINT_SUPPRESS_MS = 45_000

export function readMainPosLastSeenOrderId(storeCodeRaw: unknown): number {
  const storeCode = String(storeCodeRaw ?? '').trim()
  if (!storeCode || typeof window === 'undefined') return 0
  try {
    const raw = localStorage.getItem(`${MAIN_POS_LAST_SEEN_ORDER_ID_KEY_PREFIX}${storeCode}`)
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0
  } catch {
    return 0
  }
}

export function writeMainPosLastSeenOrderId(storeCodeRaw: unknown, orderIdRaw: unknown): void {
  if (typeof window === 'undefined') return
  const storeCode = String(storeCodeRaw ?? '').trim()
  const orderId = typeof orderIdRaw === 'number' ? orderIdRaw : Number(orderIdRaw)
  if (!storeCode || !Number.isFinite(orderId) || orderId <= 0) return
  try {
    localStorage.setItem(
      `${MAIN_POS_LAST_SEEN_ORDER_ID_KEY_PREFIX}${storeCode}`,
      String(Math.trunc(orderId))
    )
  } catch {
    /* ignore localStorage failures */
  }
}

export function isPosPrintDebugEnabledInBrowser(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const byQuery = new URLSearchParams(window.location.search).get('printDebug')
    if (byQuery === '1' || byQuery === 'true') return true
  } catch {
    /* ignore */
  }
  try {
    return localStorage.getItem(POS_PRINT_DEBUG_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}
