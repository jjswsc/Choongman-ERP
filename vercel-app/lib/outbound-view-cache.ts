/**
 * 출고 관리 조회 결과 — 탭 전환 remount 시에도 복구.
 */

import type { GetOutboundByWarehouseResult, OutboundHistoryItem, UsageHistoryItem } from "@/lib/api-client"

export type OutboundViewCache = {
  tabValue: "new" | "hist" | "warehouse" | "invoice" | "summary" | "storeMonth"
  histStart: string
  histEnd: string
  histMonth: string
  histStore: string
  histTargetType: "" | "store" | "sales"
  histType: string
  histDeliveryStatus: string
  invoiceSearch: string
  itemSearch: string
  historyList: OutboundHistoryItem[]
  usageList: UsageHistoryItem[]
  historyHasQueried: boolean
  summaryList: OutboundHistoryItem[]
  summaryHasQueried: boolean
  summaryVendorFilter: string
  summaryCategoryFilter: string
  summaryMenuSearch: string
  summaryStoreFilter: string
  whStart: string
  whEnd: string
  whFilterBy: "order" | "delivery"
  whData: GetOutboundByWarehouseResult | null
  whHasQueried: boolean
  whWarehouseFilter: string
  whStoreFilter: string
  whItemFilter: string
}

let viewCache: OutboundViewCache | null = null

export function saveOutboundViewCache(snapshot: OutboundViewCache): void {
  viewCache = snapshot
}

export function readOutboundViewCache(): OutboundViewCache | null {
  return viewCache
}

export function clearOutboundViewCache(): void {
  viewCache = null
}
