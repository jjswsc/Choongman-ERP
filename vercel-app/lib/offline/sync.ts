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
  type PendingRequest,
} from './queue'
import { registerQueuedSavePosOrderSyncedServerId } from './pos-queued-sync-print-suppress'

export type SyncResult = { synced: number; failed: number }
export type SyncListener = (result: SyncResult) => void

const listeners = new Set<SyncListener>()
const MAX_RETRY_COUNT = 8
const RETRY_BASE_MS = 2_000
const RETRY_MAX_MS = 5 * 60_000

export function onSyncComplete(cb: SyncListener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
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
 * 동기화 순서: 신규 주문(0) → 본문 수정·기타(1, createdAt) → 주문 상태(2) → 결산(3)
 * updatePosOrder는 1번 티어에 두어 다른 요청과 시간순으로 섞이고, status는 항상 그 뒤.
 */
function syncOrder(item: { api: string; createdAt: number }): number {
  if (item.api === '/api/savePosOrder') return 0
  if (item.api === '/api/updatePosOrderStatus') return 2
  if (item.api === '/api/savePosSettlement') return 3
  return 1 // updatePosOrder 및 그 외
}

function nextRetryDelayMs(retryCount: number): number {
  if (retryCount <= 0) return 0
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, retryCount - 1))
}

export async function syncPending(): Promise<SyncResult> {
  if (!isOnline()) return { synced: 0, failed: 0 }
  let pending = await getAllPending()
  if (pending.length === 0) return { synced: 0, failed: 0 }

  pending = [...pending].sort(
    (a, b) => syncOrder(a) - syncOrder(b) || a.createdAt - b.createdAt
  )

  let synced = 0
  let failed = 0

  for (const item of pending) {
    if (item.retryCount >= MAX_RETRY_COUNT) {
      continue
    }
    const now = Date.now()
    const retryDelay = nextRetryDelayMs(item.retryCount)
    const lastTriedAt = item.lastTriedAt ?? item.createdAt
    if (retryDelay > 0 && now - lastTriedAt < retryDelay) {
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
    notifySyncComplete({ synced, failed })
  }
  return { synced, failed }
}
