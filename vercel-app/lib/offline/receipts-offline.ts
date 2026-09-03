/**
 * 영수증(주문) API - 오프라인 시 캐시 사용, 온라인 시 API 호출 후 캐시 저장
 * POS 영수증 관리는 매출 관리와 동일 동작: 인터넷 유무와 관계없이 같은 화면
 */

import { isOnline } from './network'
import { getFromCache, setCache, cacheKeyOrders } from './cache'
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

export async function getPosOrdersWithCache(params: {
  startStr: string
  endStr: string
  storeCode?: string
  status?: string
  debugPosOrders?: boolean
  /** POS 단말 당일 스냅샷 — 영업일 경계 UTC 구간 */
  posBizDayScope?: boolean
  orderBy?: 'created_at.desc' | 'id.desc' | 'updated_at.desc'
  /** 테이블·실시간 목록 — linkpos 제외 경량 select (영수증 탭은 생략) */
  pollMinimal?: boolean
  /** 수동 새로고침 — 직전 IndexedDB 캐시와 id 합집합 생략(결제 후 잔존 방지) */
  skipPollMinimalCache?: boolean
  limit?: number
  includeAdvancePending?: boolean
}): Promise<PosOrder[]> {
  const {
    startStr,
    endStr,
    storeCode,
    status,
    debugPosOrders,
    posBizDayScope,
    orderBy,
    pollMinimal,
    skipPollMinimalCache,
    limit,
    includeAdvancePending,
  } = params
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
        ...(orderBy ? { orderBy } : {}),
        ...(posBizDayScope ? { posBizDayScope: true } : {}),
        ...(pollMinimal ? { pollMinimal: true } : {}),
        ...(includeAdvancePending ? { includeAdvancePending: true } : {}),
        ...(limit != null && limit > 0 ? { limit } : {}),
      })
      let rows = data
      /** 테이블·배달 목록 폴링 — API 지연·빈 응답 시 직전 캐시와 id 합집합(주문 직후 사라짐 방지) */
      if (pollMinimal && !skipPollMinimalCache) {
        const cached = await getFromCache<PosOrder[]>('pos_orders_cache', key)
        if (Array.isArray(cached) && cached.length > 0) {
          const byId = new Map<number, PosOrder>()
          for (const row of cached) {
            const id = Number(row.id)
            if (Number.isFinite(id) && id > 0) byId.set(id, row)
          }
          for (const row of data) {
            const id = Number(row.id)
            if (Number.isFinite(id) && id > 0) byId.set(id, row)
          }
          rows = Array.from(byId.values())
        }
      } else {
        await setCache('pos_orders_cache', key, data)
      }
      return mergePendingIntoRows(rows, range)
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
      debugPosOrders,
      ...(orderBy ? { orderBy } : {}),
      ...(posBizDayScope ? { posBizDayScope: true } : {}),
        ...(pollMinimal ? { pollMinimal: true } : {}),
        ...(includeAdvancePending ? { includeAdvancePending: true } : {}),
        ...(limit != null && limit > 0 ? { limit } : {}),
    })
    await setCache('pos_orders_cache', key, data)
    const merged = await mergePendingIntoRows(data, range)
    return applyStatus(merged)
  } catch {
    const merged = await mergePendingIntoRows([], range)
    return applyStatus(merged)
  }
}
