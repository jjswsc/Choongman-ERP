/**
 * 오프라인 큐 동기화 - 온라인 복구 시 대기 중인 요청 전송
 */

import { apiFetch } from '@/lib/api/fetch'
import { isOnline } from './network'
import {
  getAllPending,
  removeFromQueue,
  updateQueueItem,
  type PendingRequest,
} from './queue'

export type SyncResult = { synced: number; failed: number }
export type SyncListener = (result: SyncResult) => void

const listeners = new Set<SyncListener>()

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

export async function syncPending(): Promise<SyncResult> {
  if (!isOnline()) return { synced: 0, failed: 0 }
  const pending = await getAllPending()
  if (pending.length === 0) return { synced: 0, failed: 0 }

  let synced = 0
  let failed = 0

  for (const item of pending) {
    try {
      const init: RequestInit = {
        method: item.method,
        headers: { 'Content-Type': 'application/json', ...item.headers },
        body: item.body,
      }
      const res = await apiFetch(item.api, init)

      if (res.status === 401) {
        // 토큰 만료 - 재로그인 필요, 큐 유지
        await updateQueueItem(item.id, {
          lastError: '로그인이 필요합니다.',
          retryCount: item.retryCount + 1,
        })
        failed++
        continue
      }

      if (!res.ok) {
        const text = await res.text()
        await updateQueueItem(item.id, {
          lastError: text?.slice(0, 200) || `HTTP ${res.status}`,
          retryCount: item.retryCount + 1,
        })
        failed++
        continue
      }

      await removeFromQueue(item.id)
      synced++
    } catch (e) {
      if (isNetworkError(e)) {
        // 네트워크 문제로 다시 실패 - 큐 유지
        await updateQueueItem(item.id, {
          lastError: String(e),
          retryCount: item.retryCount + 1,
        })
      }
      failed++
    }
  }

  if (synced > 0 || failed > 0) {
    notifySyncComplete({ synced, failed })
  }
  return { synced, failed }
}
