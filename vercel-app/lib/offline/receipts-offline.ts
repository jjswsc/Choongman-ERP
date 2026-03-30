/**
 * 영수증(주문) API - 오프라인 시 캐시 사용, 온라인 시 API 호출 후 캐시 저장
 * POS 영수증 관리는 매출 관리와 동일 동작: 인터넷 유무와 관계없이 같은 화면
 */

import { isOnline } from './network'
import { getFromCache, setCache, cacheKeyOrders } from './cache'
import { getPosOrders, type PosOrder } from '@/lib/api-client'
import { getPendingSavePosOrdersMerged } from './pending-pos-orders-from-queue'

async function mergePendingIntoRows(
  rows: PosOrder[],
  range: { startStr: string; endStr: string; storeCode?: string; status?: string }
): Promise<PosOrder[]> {
  const pending = await getPendingSavePosOrdersMerged(range)
  if (pending.length === 0) return rows
  const pendingNos = new Set(
    pending.map((p) => String(p.orderNo ?? '').trim()).filter(Boolean)
  )
  const rest = rows.filter((r) => !pendingNos.has(String(r.orderNo ?? '').trim()))
  return [...pending, ...rest]
}

export async function getPosOrdersWithCache(params: {
  startStr: string
  endStr: string
  storeCode?: string
  status?: string
}): Promise<PosOrder[]> {
  const { startStr, endStr, storeCode, status } = params
  const cacheStore = storeCode || 'all'
  const key = cacheKeyOrders(cacheStore, startStr, endStr)
  const range = { startStr, endStr, storeCode: storeCode || undefined, status }

  const applyStatus = (rows: PosOrder[]) => {
    let result = rows
    if (status && status !== 'all') {
      result = result.filter((o) => o.status === status)
    }
    return result
  }

  if (isOnline()) {
    try {
      const data = await getPosOrders({
        startStr,
        endStr,
        storeCode: storeCode || undefined,
        status,
      })
      await setCache('pos_orders_cache', key, data)
      return mergePendingIntoRows(data, range)
    } catch {
      const cached = await getFromCache<PosOrder[]>('pos_orders_cache', key)
      const merged = await mergePendingIntoRows(cached ?? [], range)
      return applyStatus(merged)
    }
  }

  const cached = await getFromCache<PosOrder[]>('pos_orders_cache', key)
  if (cached !== null) {
    const merged = await mergePendingIntoRows(cached, range)
    return applyStatus(merged)
  }
  try {
    const data = await getPosOrders({
      startStr,
      endStr,
      storeCode: storeCode || undefined,
    })
    await setCache('pos_orders_cache', key, data)
    const merged = await mergePendingIntoRows(data, range)
    return applyStatus(merged)
  } catch {
    const merged = await mergePendingIntoRows([], range)
    return applyStatus(merged)
  }
}
