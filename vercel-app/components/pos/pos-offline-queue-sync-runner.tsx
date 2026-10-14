'use client'

import { useEffect } from 'react'
import { isOnline } from '@/lib/offline/network'
import { getOfflineQueueCounts, OFFLINE_QUEUE_UPDATED_EVENT } from '@/lib/offline/queue'
import { syncPending } from '@/lib/offline/sync'

const SYNC_INTERVAL_MS = 20_000

/**
 * POS 어느 화면에 있든 오프라인 큐를 서버로 보낸다 (배너가 있는 화면에만 의존하지 않음).
 * syncPending 은 탭 간 리더·메모리 잠금이 있어 배너와 동시에 돌아도 한 번만 전송된다.
 */
export function PosOfflineQueueSyncRunner() {
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (cancelled || !isOnline()) return
      try {
        const { retriable } = await getOfflineQueueCounts({ scope: 'pos_runtime_critical' })
        if (cancelled || retriable <= 0) return
        await syncPending()
      } catch {
        /* 다음 주기에 재시도 */
      }
    }
    const tid = window.setInterval(() => void run(), SYNC_INTERVAL_MS)
    const onOnline = () => void run()
    window.addEventListener('online', onOnline)
    window.addEventListener(OFFLINE_QUEUE_UPDATED_EVENT, onOnline)
    void run()
    return () => {
      cancelled = true
      window.clearInterval(tid)
      window.removeEventListener('online', onOnline)
      window.removeEventListener(OFFLINE_QUEUE_UPDATED_EVENT, onOnline)
    }
  }, [])
  return null
}
