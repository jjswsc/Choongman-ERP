export type KitchenPrintFailureRecord = {
  orderRef: string
  lastFailedAt: string
  reason: string
  attempts: number
  lastTrackingId?: string
}

const KITCHEN_PRINT_FAILURE_STORAGE_KEY = 'cm_pos_kitchen_print_failures_v1'
const KITCHEN_PRINT_FAILURE_EVENT = 'cm-pos-kitchen-print-failures-changed'

function sanitizeToken(value: string): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function toKitchenPrintTrackingToken(value: string): string {
  return sanitizeToken(value)
}

function normalizeOrderRef(raw: string): string {
  const ref = String(raw || '').trim()
  return ref ? ref : 'UNKNOWN'
}

export function buildKitchenPrintTrackingId(params: {
  orderRef: string
  station?: number
  label?: string
}): string {
  const ref = sanitizeToken(normalizeOrderRef(params.orderRef)) || 'UNKNOWN'
  const stationNum = Number(params.station)
  const station =
    Number.isFinite(stationNum) && stationNum >= 1 && stationNum <= 3
      ? `S${Math.trunc(stationNum)}`
      : 'S0'
  const labelToken = sanitizeToken(String(params.label || 'KITCHEN')) || 'KITCHEN'
  return `K-${ref}-${station}-${labelToken}`
}

export function extractOrderTokenFromKitchenPrintTrackingId(trackingId: string): string {
  const raw = String(trackingId || '').trim().toUpperCase()
  if (!raw.startsWith('K-')) return ''
  const m = /^K-(.+)-S[0-3]-/.exec(raw)
  if (!m?.[1]) return ''
  return sanitizeToken(m[1])
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readFailureMap(): Record<string, KitchenPrintFailureRecord> {
  if (!canUseStorage()) return {}
  try {
    const raw = window.localStorage.getItem(KITCHEN_PRINT_FAILURE_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, KitchenPrintFailureRecord>
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  } catch {
    return {}
  }
}

function writeFailureMap(next: Record<string, KitchenPrintFailureRecord>): void {
  if (!canUseStorage()) return
  try {
    window.localStorage.setItem(KITCHEN_PRINT_FAILURE_STORAGE_KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent(KITCHEN_PRINT_FAILURE_EVENT))
  } catch {
    // ignore
  }
}

export function getKitchenPrintFailure(orderRefRaw: string): KitchenPrintFailureRecord | null {
  const orderRef = normalizeOrderRef(orderRefRaw)
  const map = readFailureMap()
  const row = map[orderRef]
  return row ? row : null
}

export function markKitchenPrintFailure(params: {
  orderRef: string
  reason: string
  trackingId?: string
}): void {
  const orderRef = normalizeOrderRef(params.orderRef)
  const map = readFailureMap()
  const prev = map[orderRef]
  map[orderRef] = {
    orderRef,
    lastFailedAt: new Date().toISOString(),
    reason: String(params.reason || '').trim() || 'print_failed',
    attempts: Number(prev?.attempts || 0) + 1,
    ...(params.trackingId ? { lastTrackingId: params.trackingId } : {}),
  }
  writeFailureMap(map)
}

export function clearKitchenPrintFailure(orderRefRaw: string): void {
  const orderRef = normalizeOrderRef(orderRefRaw)
  const map = readFailureMap()
  if (!map[orderRef]) return
  delete map[orderRef]
  writeFailureMap(map)
}

export function subscribeKitchenPrintFailureChanges(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onEvent = () => listener()
  const onStorage = (ev: StorageEvent) => {
    if (ev.key === KITCHEN_PRINT_FAILURE_STORAGE_KEY) listener()
  }
  window.addEventListener(KITCHEN_PRINT_FAILURE_EVENT, onEvent as EventListener)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(KITCHEN_PRINT_FAILURE_EVENT, onEvent as EventListener)
    window.removeEventListener('storage', onStorage)
  }
}
