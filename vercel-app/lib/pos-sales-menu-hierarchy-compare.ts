import type { PosSalesHierarchyLevel, PosSalesHierarchyRow } from '@/lib/pos-sales-menu-hierarchy-aggregate'
import type { PosOrderTypeValue } from '@/lib/pos-sales-order-type-filter'

export type HierarchyLevelsByOrderType = Partial<
  Record<PosOrderTypeValue, Record<PosSalesHierarchyLevel, PosSalesHierarchyRow[]>>
>

export type TotalSalesChannelCompareRow = {
  key: string
  label: string
  categoryMain?: string
  category?: string
  channels: Partial<Record<PosOrderTypeValue, { qty: number; sales: number }>>
  totalQty: number
  totalSales: number
}

export function buildHierarchyChannelCompareRows(
  level: PosSalesHierarchyLevel,
  byOrderType: HierarchyLevelsByOrderType,
  channels: PosOrderTypeValue[]
): TotalSalesChannelCompareRow[] {
  const rowMap = new Map<string, TotalSalesChannelCompareRow>()

  for (const ch of channels) {
    const rows = byOrderType[ch]?.[level] ?? []
    for (const r of rows) {
      let entry = rowMap.get(r.key)
      if (!entry) {
        entry = {
          key: r.key,
          label: r.label,
          categoryMain: r.categoryMain,
          category: r.category,
          channels: {},
          totalQty: 0,
          totalSales: 0,
        }
        rowMap.set(r.key, entry)
      }
      entry.channels[ch] = { qty: r.qty, sales: r.sales }
      if (!entry.categoryMain && r.categoryMain) entry.categoryMain = r.categoryMain
      if (!entry.category && r.category) entry.category = r.category
    }
  }

  for (const entry of rowMap.values()) {
    let totalQty = 0
    let totalSales = 0
    for (const ch of channels) {
      const c = entry.channels[ch]
      if (!c) continue
      totalQty += c.qty
      totalSales += c.sales
    }
    entry.totalQty = totalQty
    entry.totalSales = totalSales
  }

  return [...rowMap.values()].sort(
    (a, b) => b.totalSales - a.totalSales || b.totalQty - a.totalQty || a.label.localeCompare(b.label)
  )
}

export function topChannelCompareChartRows(
  rows: TotalSalesChannelCompareRow[],
  channels: PosOrderTypeValue[],
  channelLabels: Record<PosOrderTypeValue, string>,
  topN: number
) {
  return rows.slice(0, topN).map((r) => {
    const short =
      r.label.length > 28 ? `${r.label.slice(0, 26)}…` : r.label
    const out: Record<string, string | number> = {
      name: short,
      fullName: r.label,
    }
    for (const ch of channels) {
      out[channelLabels[ch]] = Math.round(r.channels[ch]?.sales ?? 0)
    }
    return out
  })
}
