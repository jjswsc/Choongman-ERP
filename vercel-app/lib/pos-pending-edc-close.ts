/**
 * EDC/카드 승인 후 서버 결제 저장이 실패했을 때 기기 로컬에 남기는 “빌 마감 대기”.
 * 새로고침 후에도 유지 · 이중승인 유도 방지.
 */

export const POS_PENDING_EDC_CLOSE_STORAGE_KEY = 'cm_pos_pending_edc_close_v1'
export const POS_PENDING_EDC_CLOSE_TTL_MS = 48 * 60 * 60 * 1000
export const POS_PENDING_EDC_CLOSE_MAX_ENTRIES = 80
/** 플로어: 결제액 0인 홀 주문이 이 시간 이상이면 PAY 경고 */
export const POS_UNPAID_FLOOR_WARN_AFTER_MS = 45 * 60 * 1000

export type PendingEdcCloseMode = 'linkpos' | 'manual_intent'

export type PendingEdcCloseRecord = {
  orderId: number
  storeCode: string
  tableName?: string
  amount: number
  approvalCode?: string
  traceNo?: string
  mode: PendingEdcCloseMode
  createdAt: number
}

export type PendingEdcCloseInput = {
  orderId: number
  storeCode: string
  tableName?: string | null
  amount: number
  approvalCode?: string | null
  traceNo?: string | null
  mode: PendingEdcCloseMode
  createdAt?: number
}

type StoreMap = Record<string, PendingEdcCloseRecord>

function normStore(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase()
}

function normTable(raw: unknown): string {
  return String(raw ?? '').trim()
}

function round2(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100
}

function orderKey(orderId: number): string {
  return String(Math.floor(orderId))
}

function readMap(storage?: Storage | null): StoreMap {
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null)
  if (!store) return {}
  try {
    const raw = store.getItem(POS_PENDING_EDC_CLOSE_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as StoreMap) : {}
  } catch {
    return {}
  }
}

function writeMap(map: StoreMap, storage?: Storage | null, now = Date.now()): void {
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null)
  if (!store) return
  const kept = Object.entries(map)
    .filter(([, v]) => v && Number.isFinite(v.createdAt) && now - v.createdAt < POS_PENDING_EDC_CLOSE_TTL_MS)
    .filter(([, v]) => Number.isFinite(v.orderId) && v.orderId > 0 && normStore(v.storeCode))
    .sort((a, b) => b[1].createdAt - a[1].createdAt)
    .slice(0, POS_PENDING_EDC_CLOSE_MAX_ENTRIES)
  try {
    store.setItem(POS_PENDING_EDC_CLOSE_STORAGE_KEY, JSON.stringify(Object.fromEntries(kept)))
  } catch {
    /* quota / private mode */
  }
}

function pruneMap(map: StoreMap, now = Date.now()): StoreMap {
  const next: StoreMap = {}
  for (const [k, v] of Object.entries(map)) {
    if (!v || !Number.isFinite(v.createdAt) || now - v.createdAt >= POS_PENDING_EDC_CLOSE_TTL_MS) continue
    const orderId = Math.floor(Number(v.orderId))
    if (!Number.isFinite(orderId) || orderId <= 0) continue
    const storeCode = String(v.storeCode ?? '').trim()
    if (!storeCode) continue
    next[k] = {
      orderId,
      storeCode,
      tableName: normTable(v.tableName) || undefined,
      amount: round2(Number(v.amount) || 0),
      approvalCode: String(v.approvalCode ?? '').trim().toUpperCase() || undefined,
      traceNo: String(v.traceNo ?? '').trim() || undefined,
      mode: v.mode === 'linkpos' ? 'linkpos' : 'manual_intent',
      createdAt: Number(v.createdAt),
    }
  }
  return next
}

export function upsertPendingEdcClose(
  input: PendingEdcCloseInput,
  opts?: { storage?: Storage | null; now?: number }
): PendingEdcCloseRecord | null {
  const orderId = Math.floor(Number(input.orderId))
  const storeCode = String(input.storeCode ?? '').trim()
  const amount = round2(Number(input.amount) || 0)
  if (!Number.isFinite(orderId) || orderId <= 0 || !storeCode || amount <= 0.005) return null
  const now = opts?.now ?? Date.now()
  const map = pruneMap(readMap(opts?.storage), now)
  const prev = map[orderKey(orderId)]
  const approvalCode =
    String(input.approvalCode ?? prev?.approvalCode ?? '')
      .trim()
      .toUpperCase() || undefined
  const traceNo = String(input.traceNo ?? prev?.traceNo ?? '').trim() || undefined
  const record: PendingEdcCloseRecord = {
    orderId,
    storeCode,
    tableName: normTable(input.tableName) || prev?.tableName,
    amount,
    approvalCode,
    traceNo,
    mode: input.mode === 'linkpos' || prev?.mode === 'linkpos' ? 'linkpos' : 'manual_intent',
    createdAt: Number.isFinite(input.createdAt) ? Number(input.createdAt) : (prev?.createdAt ?? now),
  }
  // linkpos 승인이 오면 mode·코드를 우선
  if (input.mode === 'linkpos') {
    record.mode = 'linkpos'
    if (approvalCode) record.approvalCode = approvalCode
    if (traceNo) record.traceNo = traceNo
  }
  map[orderKey(orderId)] = record
  writeMap(map, opts?.storage, now)
  return record
}

export function getPendingEdcClose(
  orderIdRaw: unknown,
  opts?: { storage?: Storage | null; now?: number }
): PendingEdcCloseRecord | null {
  const orderId = Math.floor(Number(orderIdRaw))
  if (!Number.isFinite(orderId) || orderId <= 0) return null
  const now = opts?.now ?? Date.now()
  const map = pruneMap(readMap(opts?.storage), now)
  writeMap(map, opts?.storage, now)
  return map[orderKey(orderId)] ?? null
}

export function listPendingEdcCloseForStore(
  storeCodeRaw: unknown,
  opts?: { storage?: Storage | null; now?: number }
): PendingEdcCloseRecord[] {
  const want = normStore(storeCodeRaw)
  if (!want) return []
  const now = opts?.now ?? Date.now()
  const map = pruneMap(readMap(opts?.storage), now)
  writeMap(map, opts?.storage, now)
  return Object.values(map)
    .filter((r) => normStore(r.storeCode) === want)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function clearPendingEdcClose(
  orderIdRaw: unknown,
  opts?: { storage?: Storage | null; now?: number }
): boolean {
  const orderId = Math.floor(Number(orderIdRaw))
  if (!Number.isFinite(orderId) || orderId <= 0) return false
  const now = opts?.now ?? Date.now()
  const map = pruneMap(readMap(opts?.storage), now)
  const key = orderKey(orderId)
  if (!(key in map)) {
    writeMap(map, opts?.storage, now)
    return false
  }
  delete map[key]
  writeMap(map, opts?.storage, now)
  return true
}

export function findPendingEdcCloseForTable(
  storeCodeRaw: unknown,
  tableNameRaw: unknown,
  opts?: { storage?: Storage | null; now?: number }
): PendingEdcCloseRecord | null {
  const table = normTable(tableNameRaw)
  if (!table) return null
  const list = listPendingEdcCloseForStore(storeCodeRaw, opts)
  return list.find((r) => normTable(r.tableName) === table) ?? null
}

/** 홀 플로어: 결제합≈0 이고 경과가 임계 이상이면 장기 미결제 경고 */
export function shouldWarnUnpaidOpenTable(input: {
  status?: string | null
  paidSum?: number | null
  total?: number | null
  createdAtMs?: number | null
  nowMs?: number
  warnAfterMs?: number
}): boolean {
  const st = String(input.status ?? '').trim().toLowerCase()
  if (!['ready', 'cooking', 'preparing', 'pending'].includes(st)) return false
  const total = round2(Number(input.total) || 0)
  if (total <= 0.005) return false
  const paid = round2(Number(input.paidSum) || 0)
  if (paid + 0.02 >= total) return false
  const createdAtMs = Number(input.createdAtMs)
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return false
  const now = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now()
  const warnAfter = Number.isFinite(input.warnAfterMs)
    ? Number(input.warnAfterMs)
    : POS_UNPAID_FLOOR_WARN_AFTER_MS
  return now - createdAtMs >= warnAfter
}

/** LinkPOS 요약 → pending upsert용 필드 */
export function pendingEdcCloseFromLinkpos(input: {
  orderId: number
  storeCode: string
  tableName?: string | null
  amount: number
  linkposPayment?: {
    approvalCode?: string | null
    traceNo?: string | null
    mode?: string | null
  } | null
}): PendingEdcCloseInput | null {
  const orderId = Math.floor(Number(input.orderId))
  const amount = round2(Number(input.amount) || 0)
  const storeCode = String(input.storeCode ?? '').trim()
  if (!Number.isFinite(orderId) || orderId <= 0 || !storeCode || amount <= 0.005) return null
  const lp = input.linkposPayment
  if (lp) {
    return {
      orderId,
      storeCode,
      tableName: input.tableName,
      amount,
      approvalCode: lp.approvalCode,
      traceNo: lp.traceNo,
      mode: 'linkpos',
    }
  }
  return {
    orderId,
    storeCode,
    tableName: input.tableName,
    amount,
    mode: 'manual_intent',
  }
}
