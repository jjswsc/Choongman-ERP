import { createErpQueryViewCache } from "@/lib/erp-query-view-cache"
import type { PosSalesHierarchyLevel } from "@/lib/api-client"
import type { PosSalesDrillFilter } from "@/lib/pos-sales-menu-hierarchy-aggregate"

export type TotalSalesViewCache = {
  startStr: string
  endStr: string
  periodPreset: string
  selectedStores: string[]
  search: string
  searchAnd: boolean
  orderTypesKey: string
  compareChannels: boolean
  level: PosSalesHierarchyLevel
  drillFilter: PosSalesDrillFilter
  levelsData: unknown
  truncated: boolean
  hasQueried: boolean
}

export const totalSalesViewCache = createErpQueryViewCache<TotalSalesViewCache>()
