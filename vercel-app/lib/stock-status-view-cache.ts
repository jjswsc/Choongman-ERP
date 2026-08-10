/**
 * 재고현황 조회 결과 — 탭 전환 remount 시에도 복구.
 * (keep-alive element 캐시만으로는 fiber state가 비는 경우가 있음)
 */

import type { StockStatusItem } from "@/lib/api-client"

export type StockStatusViewCache = {
  storeFilter: string
  stockDateFilter: string
  categoryFilter: string
  purchaseSourceFilter: "" | "hq" | "store"
  searchTerm: string
  list: StockStatusItem[]
  hasSearched: boolean
  activeTab: string
}

let viewCache: StockStatusViewCache | null = null

export function saveStockStatusViewCache(snapshot: StockStatusViewCache): void {
  viewCache = snapshot
}

export function readStockStatusViewCache(): StockStatusViewCache | null {
  return viewCache
}

export function clearStockStatusViewCache(): void {
  viewCache = null
}
