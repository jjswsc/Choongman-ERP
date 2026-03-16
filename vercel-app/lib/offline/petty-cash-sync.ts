/**
 * 시재(패티캐시) 입출금 - 오프라인 지원 래퍼
 * API 실패 시 로컬 큐에 저장 후 로컬 성공 반환
 */

import { addPettyCashTransaction } from '@/lib/api-client'
import { addToQueue } from './queue'

function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError && e.message?.toLowerCase().includes('fetch')) return true
  if (e instanceof Error) {
    const msg = e.message?.toLowerCase() ?? ''
    if (msg.includes('network') || msg.includes('failed') || msg.includes('load')) return true
  }
  return false
}

export type AddPettyCashResult = { success: boolean; message?: string }

/**
 * 시재 입출금 - 온라인 시 API 호출, 실패(오프라인) 시 큐에 적재 후 로컬 성공 반환
 */
export async function addPettyCashTransactionWithOffline(
  params: Parameters<typeof addPettyCashTransaction>[0]
): Promise<AddPettyCashResult> {
  try {
    return await addPettyCashTransaction(params)
  } catch (e) {
    if (!isNetworkError(e)) {
      throw e
    }
    await addToQueue({
      api: '/api/addPettyCashTransaction',
      method: 'POST',
      body: JSON.stringify(params),
    })
    return { success: true }
  }
}
