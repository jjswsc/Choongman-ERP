/**
 * 오프라인 큐 동기화 - 온라인 복구 시 대기 중인 요청 전송
 */

import { apiFetch } from '@/lib/api/fetch'
import {
  isOnline,
  reportNetworkFailure,
  reportNetworkSuccess,
} from './network'
import {
  getAllPending,
  removeFromQueue,
  updateQueueItem,
  OFFLINE_QUEUE_MAX_RETRIES,
} from './queue'
import { registerQueuedSavePosOrderSyncedServerId } from './pos-queued-sync-print-suppress'

export type SyncResult = { synced: number; failed: number }
export type SyncListener = (result: SyncResult) => void
export type SyncSnapshot = {
  lastAttemptAt?: number
  lastSuccessAt?: number
  lastSynced: number
  lastFailed: number
}

const listeners = new Set<SyncListener>()
const snapshotListeners = new Set<(snapshot: SyncSnapshot) => void>()
const RETRY_BASE_MS = 2_000
const RETRY_MAX_MS = 5 * 60_000
const SNAPSHOT_KEY = 'cm_offline_sync_snapshot_v1'
let syncSnapshot: SyncSnapshot = { lastSynced: 0, lastFailed: 0 }

function readStoredSnapshot(): SyncSnapshot | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SyncSnapshot>
    return {
      lastAttemptAt:
        parsed.lastAttemptAt != null ? Number(parsed.lastAttemptAt) : undefined,
      lastSuccessAt:
        parsed.lastSuccessAt != null ? Number(parsed.lastSuccessAt) : undefined,
      lastSynced: Math.max(0, Number(parsed.lastSynced ?? 0)),
      lastFailed: Math.max(0, Number(parsed.lastFailed ?? 0)),
    }
  } catch {
    return null
  }
}

function saveSnapshot(snapshot: SyncSnapshot) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot))
  } catch {
    /* ignore storage failures */
  }
}

function updateSnapshot(next: SyncSnapshot) {
  syncSnapshot = next
  saveSnapshot(next)
  snapshotListeners.forEach((cb) => cb(next))
}

const initialSnapshot = readStoredSnapshot()
if (initialSnapshot) {
  syncSnapshot = initialSnapshot
}

export function onSyncComplete(cb: SyncListener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getSyncSnapshot(): SyncSnapshot {
  return syncSnapshot
}

export function onSyncSnapshot(cb: (snapshot: SyncSnapshot) => void): () => void {
  snapshotListeners.add(cb)
  return () => snapshotListeners.delete(cb)
}

function notifySyncComplete(result: SyncResult) {
  listeners.forEach((cb) => cb(result))
}

function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError && e.message?.toLowerCase().includes('fetch')) return true
  if (e instanceof Error) {
    const msg = e.message?.toLowerCase() ?? ''
    if (msg.includes('network') || msg.includes('failed') || msg.includes('load')) return true
  }
  return false
}

/**
 * 동기화 순서
 * - POS 주문 파이프라인: 신규 주문(0) → 본문 수정·기타(1, createdAt) → 주문 상태(2) → 재고 차감(3) → 결산(4)
 * - ERP 저위험 저장: 일반 저장(5)
 * - ERP 발주 승인/취소·인보이스 반영: 저장 이후(6)
 * - ERP 정산·전표 반영 성격(은행/출납/현금): 가장 뒤(7)
 */
function syncOrder(item: { api: string; createdAt: number }): number {
  if (item.api === '/api/savePosOrder') return 0
  if (item.api === '/api/updatePosOrderStatus') return 2
  if (item.api === '/api/processPosStockDeduction') return 3
  if (item.api === '/api/savePosSettlement') return 4
  if (
    item.api === '/api/processPurchaseOrderApproval' ||
    item.api === '/api/processPurchaseOrderCancel' ||
    item.api === '/api/updatePurchaseOrderInvoice'
  ) {
    return 6
  }
  if (
    item.api === '/api/addBankTransaction' ||
    item.api === '/api/addBankTransactionsBulk' ||
    item.api === '/api/updateBankTransaction' ||
    item.api === '/api/addPettyCashTransaction' ||
    item.api === '/api/addTillTransaction' ||
    item.api === '/api/saveCardTransaction'
  ) {
    return 7
  }
  if (item.api.startsWith('/api/save') || item.api.startsWith('/api/update')) return 5
  return 1 // updatePosOrder 및 그 외
}

function nextRetryDelayMs(retryCount: number): number {
  if (retryCount <= 0) return 0
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, retryCount - 1))
}

export type SyncPendingOptions = {
  /**
   * true: 재시도 간격(백오프) 무시 — 배너「재시도」클릭 시 즉시 전송 시도.
   * false/미지정: 자동 동기화와 동일하게 마지막 시도 시각 기준 백오프 적용.
   */
  bypassBackoff?: boolean
}

export async function syncPending(options?: SyncPendingOptions): Promise<SyncResult> {
  if (!isOnline()) return { synced: 0, failed: 0 }
  let pending = await getAllPending()
  if (pending.length === 0) return { synced: 0, failed: 0 }
  const startedAt = Date.now()
  const bypassBackoff = Boolean(options?.bypassBackoff)

  pending = [...pending].sort(
    (a, b) => syncOrder(a) - syncOrder(b) || a.createdAt - b.createdAt
  )

  let synced = 0
  let failed = 0

  for (const item of pending) {
    if (item.retryCount >= OFFLINE_QUEUE_MAX_RETRIES) {
      continue
    }
    const now = Date.now()
    const retryDelay = nextRetryDelayMs(item.retryCount)
    const lastTriedAt = item.lastTriedAt ?? item.createdAt
    if (!bypassBackoff && retryDelay > 0 && now - lastTriedAt < retryDelay) {
      continue
    }
    try {
      const idempotencyKey = item.metadata?.localOrderNo || item.id
      const init: RequestInit = {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey,
          ...item.headers,
        },
        body: item.body,
      }
      const res = await apiFetch(item.api, init)

      if (res.status === 401) {
        // 토큰 만료 - 재로그인 필요, 큐 유지
        await updateQueueItem(item.id, {
          lastError: '로그인이 필요합니다.',
          retryCount: item.retryCount + 1,
          lastTriedAt: now,
        })
        failed++
        continue
      }

      if (!res.ok) {
        const text = await res.text()
        await updateQueueItem(item.id, {
          lastError: text?.slice(0, 200) || `HTTP ${res.status}`,
          retryCount: item.retryCount + 1,
          lastTriedAt: now,
        })
        if (res.status >= 500) reportNetworkFailure()
        failed++
        continue
      }

      reportNetworkSuccess()
      if (item.api === '/api/savePosOrder') {
        try {
          const data = (await res.json()) as { orderId?: unknown }
          const oid = Number(data?.orderId)
          if (Number.isFinite(oid) && oid > 0) {
            registerQueuedSavePosOrderSyncedServerId(oid)
          }
        } catch {
          /* 본문 없음·JSON 아님 무시 */
        }
      } else {
        try {
          await res.text()
        } catch {
          /* ignore */
        }
      }
      await removeFromQueue(item.id)
      synced++
    } catch (e) {
      if (isNetworkError(e)) {
        // 네트워크 문제로 다시 실패 - 큐 유지
        await updateQueueItem(item.id, {
          lastError: String(e),
          retryCount: item.retryCount + 1,
          lastTriedAt: Date.now(),
        })
        reportNetworkFailure()
      }
      failed++
    }
  }

  if (synced > 0 || failed > 0) {
    updateSnapshot({
      lastAttemptAt: startedAt,
      lastSuccessAt: synced > 0 ? Date.now() : syncSnapshot.lastSuccessAt,
      lastSynced: synced,
      lastFailed: failed,
    })
    notifySyncComplete({ synced, failed })
  }
  return { synced, failed }
}
