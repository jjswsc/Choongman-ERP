/**
 * POS 주문 - 오프라인 지원 래퍼
 * API 실패 시 로컬 큐에 저장 후 로컬 성공 반환
 */

import { savePosOrder } from '@/lib/api-client'
import { addToQueue } from './queue'

export type SavePosOrderResult = {
  success: boolean
  orderId?: number
  orderNo?: string
  message?: string
  queued?: boolean
}

function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError && e.message?.toLowerCase().includes('fetch')) return true
  if (e instanceof Error) {
    const msg = e.message?.toLowerCase() ?? ''
    if (
      msg.includes('network') ||
      msg.includes('failed') ||
      msg.includes('load') ||
      msg.includes('enotfound') ||
      msg.includes('getaddrinfo') ||
      msg.includes('econnrefused') ||
      msg.includes('etimedout') ||
      msg.includes('supabase.co')
    )
      return true
  }
  return false
}

/** 구버전 API가 200 + success:false 로 DB 오류를 줄 때(큐 미적재) 보강 */
function looksLikeInfraFailureMessage(message: string | undefined): boolean {
  const m = String(message || '').toLowerCase()
  return (
    m.includes('getaddrinfo') ||
    m.includes('enotfound') ||
    m.includes('econnrefused') ||
    m.includes('etimedout') ||
    m.includes('supabase.co') ||
    m.includes('fetch failed')
  )
}

/**
 * POS 주문 저장 - 온라인 시 API 호출, 실패(오프라인) 시 큐에 적재 후 로컬 성공 반환
 */
export async function savePosOrderWithOffline(params: Parameters<typeof savePosOrder>[0]): Promise<SavePosOrderResult> {
  try {
    const res = await savePosOrder(params)
    if (res.success) return { ...res, queued: false }
    if (looksLikeInfraFailureMessage(res.message)) {
      const localOrderNo = `LOCAL-${Date.now()}`
      await addToQueue({
        api: '/api/savePosOrder',
        method: 'POST',
        body: JSON.stringify(params),
        metadata: { localOrderNo },
      })
      return { success: true, orderNo: localOrderNo, queued: true }
    }
    return { ...res, queued: false }
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
      queued: true,
    }
  }
}

export { syncPending, onSyncComplete } from './sync'
export { getPendingCount } from './queue'
