import {
  buildManagementMarginPosSlice,
  type ManagementMarginChannelKey,
} from '@/lib/management-margin-pos-slice'
import type { PosMenuCostIndexEntry } from '@/lib/pos-menu-cost-index-server'
import type { PromoPricingCatalog } from '@/lib/pos-order-promo-regular-price'

export type ManagementMarginStoreRankRow = {
  storeCode: string
  orderCount: number
  netSales: number
  totalDiscount: number
  discountPctOfGross: number
  totalCost: number
  costPctOfNet: number
  contributionMargin: number
  contributionPct: number
}

const MAX_STORE_RANK_ROWS = 40

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function pctOf(part: number, whole: number): number {
  if (whole <= 0.0001) return 0
  return round2((part / whole) * 100)
}

type OrderRow = {
  store_code?: string
  order_type?: string
  items_json?: string
  total?: number
  discount_amt?: number
  coupon_discount_amt?: number
}

export function buildManagementMarginStoreRanking(params: {
  orderRows: OrderRow[]
  catalog: PromoPricingCatalog
  costIndex: Map<string, PosMenuCostIndexEntry>
  maxRows?: number
}): ManagementMarginStoreRankRow[] {
  const byStore = new Map<string, OrderRow[]>()
  for (const row of params.orderRows) {
    const code = String(row.store_code ?? '').trim() || '__unknown__'
    const list = byStore.get(code) ?? []
    list.push(row)
    byStore.set(code, list)
  }
  if (byStore.size <= 1) return []

  const out: ManagementMarginStoreRankRow[] = []
  for (const [storeCode, rows] of byStore) {
    const slice = buildManagementMarginPosSlice({
      orderRows: rows,
      catalog: params.catalog,
      costIndex: params.costIndex,
    })
    const contribution = round2(slice.netSales - slice.theoreticalCost.totalCost)
    out.push({
      storeCode,
      orderCount: slice.periodOrderCount,
      netSales: slice.netSales,
      totalDiscount: slice.totalDiscount,
      discountPctOfGross: pctOf(slice.totalDiscount, slice.grossSalesBeforeDiscount),
      totalCost: slice.theoreticalCost.totalCost,
      costPctOfNet: slice.theoreticalCost.costPctOfNet,
      contributionMargin: contribution,
      contributionPct: pctOf(contribution, slice.netSales),
    })
  }
  out.sort((a, b) => b.netSales - a.netSales)
  return out.slice(0, params.maxRows ?? MAX_STORE_RANK_ROWS)
}

/** 하이라이트: 할인율 상위 25% & 원가율 상위 25% (최소 4매장) */
export function pickStoreRankingHighlights(rows: ManagementMarginStoreRankRow[]): {
  highDiscount: string[]
  highCost: string[]
} {
  if (rows.length < 4) return { highDiscount: [], highCost: [] }
  const n = Math.max(1, Math.ceil(rows.length * 0.25))
  const byDiscount = [...rows].sort((a, b) => b.discountPctOfGross - a.discountPctOfGross)
  const byCost = [...rows].sort((a, b) => b.costPctOfNet - a.costPctOfNet)
  return {
    highDiscount: byDiscount.slice(0, n).map((r) => r.storeCode),
    highCost: byCost.slice(0, n).map((r) => r.storeCode),
  }
}

export type { ManagementMarginChannelKey }
