/**
 * 오프라인·타임아웃 큐 주문의 기기 로컬 기록 (새로고침해도 유지, 24~48시간).
 * - 로컬에서 이미 인쇄한 큐 주문(localOrderNo / 서버 idempotency_key_hash) → 동기화 후 주방 job·Realtime 재인쇄 차단
 * - localOrderNo → 서버 pos_orders.id → 취소·상태 변경 시 추정 매칭 대신 정확한 id 사용
 */
import { hasRecentPosAutoPrintKey, reservePosAutoPrintKeys } from '@/lib/pos-auto-print-dedupe'

const PRINTED_TTL_MS = 24 * 60 * 60 * 1000
const MAP_STORAGE_KEY = 'cm_pos_local_order_server_id_v1'
const MAP_TTL_MS = 48 * 60 * 60 * 1000
const MAP_MAX_ENTRIES = 300

function norm(raw: unknown): string {
  return String(raw ?? '').trim()
}

export function localPrintedQueuedOrderKey(localOrderNo: string): string {
  return `local:${localOrderNo}:printed`
}

export function localPrintedQueuedHashKey(idempotencyKeyHash: string): string {
  return `localhash:${idempotencyKeyHash.toLowerCase()}`
}

async function sha256HexBrowser(value: string): Promise<string> {
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined
  if (!subtle) return ''
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** 큐 주문을 로컬에서 자동 인쇄했음을 기록 (savePosOrder 서버가 저장하는 해시와 같은 sha256) */
export function markPosQueuedOrderLocallyPrinted(localOrderNoRaw: unknown): void {
  const localOrderNo = norm(localOrderNoRaw)
  if (!localOrderNo) return
  reservePosAutoPrintKeys('', [localPrintedQueuedOrderKey(localOrderNo)], PRINTED_TTL_MS)
  void sha256HexBrowser(localOrderNo)
    .then((hash) => {
      if (hash) reservePosAutoPrintKeys('', [localPrintedQueuedHashKey(hash)], PRINTED_TTL_MS)
    })
    .catch(() => {})
}

export function wasPosQueuedOrderLocallyPrinted(localOrderNoRaw: unknown): boolean {
  const localOrderNo = norm(localOrderNoRaw)
  if (!localOrderNo) return false
  return hasRecentPosAutoPrintKey('', localPrintedQueuedOrderKey(localOrderNo), PRINTED_TTL_MS)
}

/** Realtime INSERT 행의 idempotency_key_hash 로 확인 (타임아웃 후 서버엔 이미 저장된 경우) */
export function wasPosQueuedOrderLocallyPrintedByHash(idempotencyKeyHashRaw: unknown): boolean {
  const hash = norm(idempotencyKeyHashRaw)
  if (!/^[0-9a-f]{64}$/i.test(hash)) return false
  return hasRecentPosAutoPrintKey('', localPrintedQueuedHashKey(hash), PRINTED_TTL_MS)
}

type ServerIdMap = Record<string, { id: number; at: number }>

function readMap(): ServerIdMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(MAP_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    return parsed && typeof parsed === 'object' ? (parsed as ServerIdMap) : {}
  } catch {
    return {}
  }
}

export function rememberPosLocalOrderServerId(localOrderNoRaw: unknown, serverIdRaw: unknown): void {
  const localOrderNo = norm(localOrderNoRaw)
  const id = Math.floor(Number(serverIdRaw))
  if (!localOrderNo || !Number.isFinite(id) || id <= 0 || typeof window === 'undefined') return
  const now = Date.now()
  const map = readMap()
  map[localOrderNo] = { id, at: now }
  const kept = Object.entries(map)
    .filter(([, v]) => v && Number.isFinite(v.at) && now - v.at < MAP_TTL_MS)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, MAP_MAX_ENTRIES)
  try {
    window.localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(Object.fromEntries(kept)))
  } catch {
    /* quota / private mode */
  }
}

export function lookupPosLocalOrderServerId(localOrderNoRaw: unknown): number | null {
  const localOrderNo = norm(localOrderNoRaw)
  if (!localOrderNo) return null
  const hit = readMap()[localOrderNo]
  if (!hit || !Number.isFinite(hit.at) || Date.now() - hit.at >= MAP_TTL_MS) return null
  const id = Math.floor(Number(hit.id))
  return Number.isFinite(id) && id > 0 ? id : null
}
