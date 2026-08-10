import { createErpQueryViewCache } from "@/lib/erp-query-view-cache"
import type { PosOrder } from "@/lib/api-client"

export type PosOrdersViewCache = {
  activeTab: "orders" | "cookTime" | "linkposFailed" | "grabIntegration" | "auditTrail"
  startStr: string
  endStr: string
  storeFilter: string
  searchTerm: string
  statusFilter: string
  cancelScopeFilter: "all" | "line" | "order"
  cancelReasonFilter: string
  orders: PosOrder[]
  hasSearchedOrders: boolean
}

export const posOrdersViewCache = createErpQueryViewCache<PosOrdersViewCache>()
