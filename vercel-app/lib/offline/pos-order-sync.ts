/**
 * POS 주문 - 오프라인 지원 래퍼
 * API 실패 시 로컬 큐에 저장 후 로컬 성공 반환
 */

import { savePosOrder } from '@/lib/api-client'
import { isOnline } from './network'
import { addToQueue } from './queue'
import { syncPending } from './sync'

export type SavePosOrderResult = {
  success: boolean
  orderId?: number
  orderNo?: string
  message?: string
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
 * POS 주문 저장 - 온라인 시 API 호출, 실패(오프라인) 시 큐에 적재 후 로컬 성공 반환
 */
export async function savePosOrderWithOffline(params: Parameters<typeof savePosOrder>[0]): Promise<SavePosOrderResult> {
  try {
    const res = await savePosOrder(params)
    if (res.success) return res
    return res
  } catch (e) {
    if (!isNetworkError(e)) {
      throw e
    }
    // 네트워크 오류 → 큐에 적재
    const localOrderNo = `LOCAL-${Date.now()}`
    await addToQueue({
      api: '/api/savePosOrder',
      method: 'POST',
      body: JSON.stringify(params),
      metadata: { localOrderNo },
    })
    return {
      success: true,
      orderNo: localOrderNo,
    }
  }
}

export { syncPending, onSyncComplete } from './sync'
export { getPendingCount } from './queue'
