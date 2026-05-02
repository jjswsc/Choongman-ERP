/**
 * 시재(카운터 현금) API - 오프라인 시 캐시/큐 사용
 * pos_till_transactions 전용
 */

import { isOnline } from './network'
import { getFromCache, setCache } from './cache'
import { addToQueue } from './queue'
import { getTillList, addTillTransaction, deleteTillTransaction, type TillItem } from '@/lib/api-client'

function cacheKeyTillList(params: { startStr: string; endStr: string; storeFilter?: string; typeFilter?: string }): string {
  const { startStr, endStr, storeFilter = '', typeFilter = '' } = params
  return `till:list:${storeFilter}:${startStr}:${endStr}:${typeFilter}`
}

export async function getTillListWithCache(params: {
  startStr: string
  endStr: string
  storeFilter?: string
  userStore?: string
  userRole?: string
  typeFilter?: 'all' | 'till_only' | 'sales_withdrawal_only'
}): Promise<TillItem[]> {
  const { startStr, endStr, storeFilter = '', typeFilter } = params
  const key = cacheKeyTillList({ startStr, endStr, storeFilter, typeFilter: typeFilter || '' })

  if (isOnline()) {
    try {
      const data = await getTillList(params)
      await setCache('pos_sales_cache', key, data)
      return data
    } catch {
      const cached = await getFromCache<TillItem[]>('pos_sales_cache', key)
      return cached ?? []
    }
  }

  const cached = await getFromCache<TillItem[]>('pos_sales_cache', key)
  return cached ?? []
}

function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError && e.message?.toLowerCase().includes('fetch')) return true
  if (e instanceof Error) {
    const msg = e.message?.toLowerCase() ?? ''
    if (msg.includes('network') || msg.includes('failed') || msg.includes('load')) return true
  }
  return false
}

export type AddTillResult = { success: boolean; message?: string; queued?: boolean }

/** 시재 입출금 - 온라인 시 API 호출, 오프라인 시 큐에 적재 */
export async function addTillTransactionWithOffline(
  params: Parameters<typeof addTillTransaction>[0]
): Promise<AddTillResult> {
  try {
    return await addTillTransaction(params)
  } catch (e) {
    if (!isNetworkError(e)) throw e
    await addToQueue({
      api: '/api/addTillTransaction',
      method: 'POST',
      body: JSON.stringify(params),
    })
    return { success: true, queued: true }
  }
}

/** 매출 출금 삭제 — 온라인 시 API, 오프라인 시 큐 */
export async function deleteTillTransactionWithOffline(params: {
  id: number
}): Promise<AddTillResult> {
  try {
    return await deleteTillTransaction(params)
  } catch (e) {
    if (!isNetworkError(e)) throw e
    await addToQueue({
      api: '/api/deleteTillTransaction',
      method: 'POST',
      body: JSON.stringify({ id: params.id }),
    })
    return { success: true, queued: true }
  }
}
