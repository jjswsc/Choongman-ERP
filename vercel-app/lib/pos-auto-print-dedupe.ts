/**
 * 메인 POS 자동 인쇄(홀 주문서·주방전) dedupe — 탭·브라우저·기기 간 localStorage 공유.
 * seenOrderIdsRef 는 탭마다 따로라서, 카운터에 터미널 탭 2~3개 또는 메인 PC 여러 대면
 * 같은 주문이 2~3장 나갈 수 있음. 이 모듈로 한 매장·한 키당 TTL 안 1회만 허용.
 */

const STORAGE_KEY = 'cm_pos_autoprint_dedupe_v1'
const MAX_ENTRIES = 400
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000
const STALE_ENTRY_MS = 24 * 60 * 60 * 1000

/** Realtime·폴링이 같은 탭에서 동시에 reserve 하면 localStorage 만으로는 둘 다 통과할 수 있음 */
const memoryReservedAt = new Map<string, number>()

type DedupeMap = Record<string, number>

function readMap(): DedupeMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: DedupeMap = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const ts = Number(v)
      if (k && Number.isFinite(ts)) out[k] = ts
    }
    return out
  } catch {
    return {}
  }
}

function writeMap(map: DedupeMap): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* quota / private mode */
  }
}

function pruneMap(map: DedupeMap, now: number): DedupeMap {
  const next: DedupeMap = {}
  for (const [k, ts] of Object.entries(map)) {
    if (!Number.isFinite(ts) || now - ts > STALE_ENTRY_MS) continue
    next[k] = ts
  }
  const keys = Object.keys(next)
  if (keys.length <= MAX_ENTRIES) return next
  keys
    .sort((a, b) => (next[a] ?? 0) - (next[b] ?? 0))
    .slice(0, keys.length - MAX_ENTRIES)
    .forEach((k) => delete next[k])
  return next
}

function fullKey(storeCode: string, key: string): string {
  const store = String(storeCode ?? '').trim()
  const part = String(key ?? '').trim()
  if (!part) return ''
  return store ? `${store}::${part}` : part
}

/**
 * @returns true 이면 이번에 인쇄해도 됨(예약 성공). false 이면 최근에 같은 키로 이미 인쇄됨.
 */
function pruneMemory(now: number): void {
  for (const [k, ts] of memoryReservedAt.entries()) {
    if (!Number.isFinite(ts) || now - ts > STALE_ENTRY_MS) memoryReservedAt.delete(k)
  }
}

export function posHallAutoPrintDedupeKey(orderId: number, variant: 'auto' | `add:${string}` = 'auto'): string {
  const id = Math.floor(Number(orderId))
  if (!Number.isFinite(id) || id <= 0) return ''
  return variant === 'auto' ? `order:${id}:hall:auto` : `order:${id}:hall:${variant}`
}

/** 결제 영수증 자동 인쇄 — Realtime UPDATE vs payment poll scan 중복 방지 */
export function posPaymentAutoPrintDedupeKey(
  orderId: number,
  printInstanceKey?: string | null
): string {
  const id = Math.floor(Number(orderId))
  if (!Number.isFinite(id) || id <= 0) return ''
  const inst = String(printInstanceKey ?? '').trim()
  return inst ? `order:${id}:payment:${inst}` : `order:${id}:payment:auto`
}

export function reservePosAutoPrintKey(
  storeCode: string,
  key: string,
  ttlMs: number = DEFAULT_TTL_MS
): boolean {
  return reservePosAutoPrintKeys(storeCode, [key], ttlMs)
}

/** 관련 키 묶음을 한 번에 예약(별칭 키 포함). 하나라도 최근 키면 모두 차단 */
export function reservePosAutoPrintKeys(
  storeCode: string,
  keys: string[],
  ttlMs: number = DEFAULT_TTL_MS
): boolean {
  const uniqueKeys = Array.from(
    new Set((Array.isArray(keys) ? keys : []).map((k) => String(k ?? '').trim()).filter(Boolean))
  )
  if (uniqueKeys.length === 0) return true
  const fullKeys = uniqueKeys.map((k) => fullKey(storeCode, k)).filter(Boolean)
  if (fullKeys.length === 0) return true
  const now = Date.now()
  const ttl = Math.max(1000, Number(ttlMs) || DEFAULT_TTL_MS)
  pruneMemory(now)
  for (const fk of fullKeys) {
    const memPrev = memoryReservedAt.get(fk)
    if (typeof memPrev === 'number' && now - memPrev < ttl) return false
  }
  const map = pruneMap(readMap(), now)
  for (const fk of fullKeys) {
    const prev = map[fk]
    if (typeof prev === 'number' && now - prev < ttl) return false
  }
  for (const fk of fullKeys) {
    memoryReservedAt.set(fk, now)
    map[fk] = now
  }
  writeMap(map)
  return true
}

/** reserve 없이 최근 인쇄 여부만 확인(Realtime 추가주문 오인 차단용) */
export function hasRecentPosAutoPrintKey(
  storeCode: string,
  key: string,
  ttlMs: number = DEFAULT_TTL_MS
): boolean {
  const part = String(key ?? '').trim()
  if (!part) return false
  const fk = fullKey(storeCode, part)
  if (!fk) return false
  const now = Date.now()
  const ttl = Math.max(1000, Number(ttlMs) || DEFAULT_TTL_MS)
  pruneMemory(now)
  const memPrev = memoryReservedAt.get(fk)
  if (typeof memPrev === 'number' && now - memPrev < ttl) return true
  const map = pruneMap(readMap(), now)
  const prev = map[fk]
  return typeof prev === 'number' && now - prev < ttl
}

/** 테스트·디버그용 */
export function clearPosAutoPrintDedupeForTests(): void {
  memoryReservedAt.clear()
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
