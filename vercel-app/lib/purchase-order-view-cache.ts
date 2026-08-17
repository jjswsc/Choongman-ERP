/**
 * PO 관리·발주 내역 조회 결과 — 탭 전환 remount 시에도 복구.
 * (keep-alive element 캐시만으로는 fiber state가 비는 경우가 있음)
 */

import { createErpQueryViewCache } from "@/lib/erp-query-view-cache"
import type { PurchaseOrderRow } from "@/lib/api-client"

export type PurchaseOrderHistorySourceFilter = "all" | "logistics" | "accounting"
export type PurchaseOrderPageTab = "hq" | "billing_settings" | "history"

export type PurchaseOrderViewCache = {
  tab?: PurchaseOrderPageTab
  startDate: string
  endDate: string
  vendorFilter: string
  sourceFilter: PurchaseOrderHistorySourceFilter
  searchText: string
  hasSearched: boolean
  list: PurchaseOrderRow[]
}

const EMPTY: PurchaseOrderViewCache = {
  startDate: "",
  endDate: "",
  vendorFilter: "All",
  sourceFilter: "all",
  searchText: "",
  hasSearched: false,
  list: [],
}

export const purchaseOrderViewCache = createErpQueryViewCache<PurchaseOrderViewCache>()

export function patchPurchaseOrderViewCache(patch: Partial<PurchaseOrderViewCache>): void {
  const prev = purchaseOrderViewCache.read()
  purchaseOrderViewCache.save({
    ...EMPTY,
    ...prev,
    ...patch,
  })
}

export function readPurchaseOrderViewCache(): PurchaseOrderViewCache | null {
  return purchaseOrderViewCache.read()
}

export function clearPurchaseOrderViewCache(): void {
  purchaseOrderViewCache.clear()
}
