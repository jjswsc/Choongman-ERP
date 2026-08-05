import { isPosPaidLikeStatus } from '@/lib/pos-order-policy'
import { resolveStoreListKey } from '@/lib/store-list-keys'
import { orderListMergeKey } from '@/lib/pos-terminal-active-orders-persist'
import type { Store } from '@/lib/pos-types'

/**
 * 실시간「미결제 테이블」합산 대상 — pending/cooking/preparing 등.
 * ready·paid·completed 는 확정 매출(홀)에 이미 포함되므로 제외해 이중 집계를 막는다.
 */
export function countsTowardUnpaidTableTotal(order: { status?: string } | null | undefined): boolean {
  if (!order) return false
  const st = String(order.status ?? 'pending').trim().toLowerCase()
  if (['cancelled', 'canceled', 'refunded'].includes(st)) return false
  if (isPosPaidLikeStatus(st)) return false
  return true
}

/** 매장 스냅샷의 미결제 테이블 주문 금액 합 — 동일 주문이 여러 테이블에 매칭돼도 1회만 합산 */
export function sumStoreTableOrders(store: Store | undefined | null): number {
  const seen = new Set<string>()
  let total = 0
  for (const tbl of store?.tables || []) {
    const order = tbl.order
    if (!order || !countsTowardUnpaidTableTotal(order)) continue
    const key =
      orderListMergeKey(order) ||
      `${String(tbl.id || tbl.name || '').trim()}:${Number(order.total ?? 0)}`
    if (seen.has(key)) continue
    seen.add(key)
    total += Number(order.total ?? 0)
  }
  return total
}

/** 단일 매장 또는 전체 매장 선택 시 미결제 테이블 총액(ready·paid·completed 제외) */
export function computeRealtimeTableTotal(params: {
  isAllStores: boolean
  stores: ReadonlyArray<Store>
  currentStore?: Store
  /** legacy·Grab ID 중복 스냅샷 합산 방지 — `mergeRealtimeStoreSalesRows`와 동일 canonical */
  storeCodes?: string[]
  legacyToCanonical?: Record<string, string>
}): number {
  if (!params.isAllStores && params.currentStore) {
    return sumStoreTableOrders(params.currentStore)
  }

  const storeCodes = params.storeCodes?.map((s) => String(s || '').trim()).filter(Boolean) ?? []
  const legacy = params.legacyToCanonical ?? {}

  if (storeCodes.length > 0) {
    const byCanon = new Map<string, number>()
    for (const store of params.stores) {
      const rawId = String(store.id || '').trim()
      if (!rawId) continue
      const canon = resolveStoreListKey(rawId, storeCodes, legacy)
      const tableTotal = sumStoreTableOrders(store)
      byCanon.set(canon, Math.max(byCanon.get(canon) ?? 0, tableTotal))
    }
    let sum = 0
    for (const v of byCanon.values()) sum += v
    return sum
  }

  return params.stores.reduce((acc, s) => acc + sumStoreTableOrders(s), 0)
}

export type RealtimeStoreSalesRow = {
  /** 집계·정렬용 canonical store_code */
  storeId: string
  storeDisplayName: string
  paid: number
  tableTotal: number
}

type TodaySalesLike = {
  completedCount?: number
  completedTotal?: number
  completedCash?: number
  pendingCount?: number
}

export type TodaySalesSummaryTotals = {
  completedCount: number
  completedTotal: number
  completedCash: number
  pendingCount: number
}

/** 전체 매장 선택 시 헤더 합계 — legacy·Grab ID를 canonical 하나로 합산 */
export function aggregateTodaySalesByCanonical(params: {
  entries: ReadonlyArray<readonly [string, TodaySalesLike]>
  storeCodes: string[]
  legacyToCanonical: Record<string, string>
}): TodaySalesSummaryTotals {
  const storeCodes = params.storeCodes.map((s) => String(s || '').trim()).filter(Boolean)
  const byCanon = new Map<string, TodaySalesLike>()

  for (const [rawCode, data] of params.entries) {
    const canon = resolveStoreListKey(rawCode, storeCodes, params.legacyToCanonical)
    const prev = byCanon.get(canon)
    if (!prev) {
      byCanon.set(canon, {
        completedCount: Number(data.completedCount ?? 0),
        completedTotal: Number(data.completedTotal ?? 0),
        completedCash: Number(data.completedCash ?? 0),
        pendingCount: Number(data.pendingCount ?? 0),
      })
    } else {
      prev.completedCount = Number(prev.completedCount ?? 0) + Number(data.completedCount ?? 0)
      prev.completedTotal = Number(prev.completedTotal ?? 0) + Number(data.completedTotal ?? 0)
      prev.completedCash = Number(prev.completedCash ?? 0) + Number(data.completedCash ?? 0)
      prev.pendingCount = Number(prev.pendingCount ?? 0) + Number(data.pendingCount ?? 0)
    }
  }

  const total: TodaySalesSummaryTotals = {
    completedCount: 0,
    completedTotal: 0,
    completedCash: 0,
    pendingCount: 0,
  }
  for (const data of byCanon.values()) {
    total.completedCount += Number(data.completedCount ?? 0)
    total.completedTotal += Number(data.completedTotal ?? 0)
    total.completedCash += Number(data.completedCash ?? 0)
    total.pendingCount += Number(data.pendingCount ?? 0)
  }
  return total
}

/**
 * 동일 매장의 레거시 코드·Grab partner ID(1040/1042)를 canonical 하나로 합산.
 */
export function mergeRealtimeStoreSalesRows(params: {
  operationalStores: Store[]
  storeSalesMap: Record<string, TodaySalesLike>
  storeCodes: string[]
  legacyToCanonical: Record<string, string>
  /** `useStoreList().formatStoreLabel` — erp_stores·Grab ID 매핑 반영 */
  formatStoreLabel: (code: string) => string
}): RealtimeStoreSalesRow[] {
  const storeCodes = params.storeCodes.map((s) => String(s || '').trim()).filter(Boolean)
  const resolveCanonical = (rawId: string) =>
    resolveStoreListKey(String(rawId || '').trim(), storeCodes, params.legacyToCanonical)

  const groups = new Map<string, { paid: number; tableTotal: number }>()

  for (const store of params.operationalStores) {
    const rawId = String(store.id || '').trim()
    if (!rawId) continue
    const canon = resolveCanonical(rawId)
    const prev = groups.get(canon) || { paid: 0, tableTotal: 0 }
    prev.paid += Number(params.storeSalesMap[rawId]?.completedTotal ?? 0)
    prev.tableTotal = Math.max(prev.tableTotal, sumStoreTableOrders(store))
    groups.set(canon, prev)
  }

  return Array.from(groups.entries())
    .map(([storeId, agg]) => ({
      storeId,
      storeDisplayName: params.formatStoreLabel(storeId) || storeId,
      paid: agg.paid,
      tableTotal: agg.tableTotal,
    }))
    .sort((a, b) => {
      if (b.paid !== a.paid) return b.paid - a.paid
      if (b.tableTotal !== a.tableTotal) return b.tableTotal - a.tableTotal
      return a.storeDisplayName.localeCompare(b.storeDisplayName, 'ko')
    })
}
