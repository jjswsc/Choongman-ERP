/**
 * 영수증(주문) API - 오프라인 시 캐시 사용, 온라인 시 API 호출 후 캐시 저장
 * POS 영수증 관리는 매출 관리와 동일 동작: 인터넷 유무와 관계없이 같은 화면
 */

import { isOnline } from './network'
import { deleteCache, getFromCache, setCache, cacheKeyOrders } from './cache'
import { getPosBusinessDateStr } from '@/lib/pos-business-day'
import { getPosOrders, type PosOrder } from '@/lib/api-client'
import { getPendingSavePosOrdersMerged, getQueuedPosOrderStatusById } from './pending-pos-orders-from-queue'

async function applyQueuedOrderStatusOverrides(rows: PosOrder[]): Promise<PosOrder[]> {
  const map = await getQueuedPosOrderStatusById()
  if (map.size === 0) return rows
  return rows.map((r) => {
    const id = Number(r.id)
    if (!Number.isFinite(id)) return r
    const st = map.get(id)
    return st ? { ...r, status: st } : r
  })
}

async function mergePendingIntoRows(
  rows: PosOrder[],
  range: { startStr: string; endStr: string; storeCode?: string; status?: string }
): Promise<PosOrder[]> {
  const pending = await getPendingSavePosOrdersMerged(range)
  let merged: PosOrder[]
  if (pending.length === 0) {
    merged = rows
  } else {
    const pendingNos = new Set(
      pending.map((p) => String(p.orderNo ?? '').trim()).filter(Boolean)
    )
    const rest = rows.filter((r) => !pendingNos.has(String(r.orderNo ?? '').trim()))
    merged = [...pending, ...rest]
  }
  return applyQueuedOrderStatusOverrides(merged)
}

/** 주문 저장 직후 당일 목록 캐시 무효화(refetch가 구 스냅샷으로 덮는 것 방지) */
export async function invalidatePosOrdersDayCache(storeCode: string): Promise<void> {
  const sc = String(storeCode || '').trim()
  if (!sc) return
  const day = getPosBusinessDateStr()
  const key = cacheKeyOrders(sc, day, day, { posBizDay: true })
  try {
    await deleteCache('pos_orders_cache', key)
  } catch {
    /* ignore */
  }
}

export async function getPosOrdersWithCache(params: {
  startStr: string
  endStr: string
  storeCode?: string
  status?: string
  debugPosOrders?: boolean
  /** POS 단말 당일 스냅샷 — 영업일 경계 UTC 구간 */
  posBizDayScope?: boolean
  /** true: API 실패 시 IndexedDB 캐시 폴백 생략(저장 직후 refetch용) */
  fresh?: boolean
}): Promise<PosOrder[]> {
  const { startStr, endStr, storeCode, status, debugPosOrders, posBizDayScope, fresh } = params
  const cacheStore = storeCode || 'all'
  const key = cacheKeyOrders(cacheStore, startStr, endStr, { posBizDay: Boolean(posBizDayScope) })
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
        debugPosOrders,
        ...(posBizDayScope ? { posBizDayScope: true } : {}),
      })
      await setCache('pos_orders_cache', key, data)
      return mergePendingIntoRows(data, range)
    } catch {
      if (fresh) throw new Error('getPosOrders failed (fresh)')
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
      debugPosOrders,
      ...(posBizDayScope ? { posBizDayScope: true } : {}),
    })
    await setCache('pos_orders_cache', key, data)
    const merged = await mergePendingIntoRows(data, range)
    return applyStatus(merged)
  } catch {
    const merged = await mergePendingIntoRows([], range)
    return applyStatus(merged)
  }
}
