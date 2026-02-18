/**
 * POS 결산 - 오프라인 지원 래퍼
 * API 실패 시 로컬 큐에 저장 후 로컬 성공 반환
 */

import { savePosSettlement } from '@/lib/api-client'
import { addToQueue } from './queue'

export type SavePosSettlementResult = { success: boolean; message?: string }

function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError && e.message?.toLowerCase().includes('fetch')) return true
  if (e instanceof Error) {
    const msg = e.message?.toLowerCase() ?? ''
    if (msg.includes('network') || msg.includes('failed') || msg.includes('load')) return true
  }
  return false
}

/**
 * POS 결산 저장 - 온라인 시 API 호출, 실패(오프라인) 시 큐에 적재 후 로컬 성공 반환
 */
export async function savePosSettlementWithOffline(
  params: Parameters<typeof savePosSettlement>[0]
): Promise<SavePosSettlementResult> {
  try {
    return await savePosSettlement(params)
  } catch (e) {
    if (!isNetworkError(e)) {
      throw e
    }
    await addToQueue({
      api: '/api/savePosSettlement',
      method: 'POST',
      body: JSON.stringify(params),
    })
    return { success: true }
  }
}
