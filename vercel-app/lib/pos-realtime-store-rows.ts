import { labelForStore, resolveStoreListKey } from '@/lib/store-list-keys'
import type { Store } from '@/lib/pos-types'

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
  storeLabels: Record<string, string>
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
    prev.tableTotal += (store.tables || []).reduce(
      (acc, tbl) => acc + Number(tbl.order?.total ?? 0),
      0
    )
    groups.set(canon, prev)
  }

  return Array.from(groups.entries())
    .map(([storeId, agg]) => ({
      storeId,
      storeDisplayName: labelForStore(params.storeLabels, storeId) || storeId,
      paid: agg.paid,
      tableTotal: agg.tableTotal,
    }))
    .sort((a, b) => {
      if (b.paid !== a.paid) return b.paid - a.paid
      if (b.tableTotal !== a.tableTotal) return b.tableTotal - a.tableTotal
      return a.storeDisplayName.localeCompare(b.storeDisplayName, 'ko')
    })
}
