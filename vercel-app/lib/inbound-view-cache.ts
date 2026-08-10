import { createErpQueryViewCache } from "@/lib/erp-query-view-cache"
import type { InboundHistoryItem } from "@/lib/api-client"

export type InboundViewCache = {
  tabValue: "new" | "hist" | "summary" | "guide"
  histStart: string
  histEnd: string
  histMonth: string
  histVendor: string
  histVendorSearch: string
  histItemSearch: string
  histStore: string
  histPurchaseSource: "" | "hq" | "store"
  historyList: InboundHistoryItem[]
  historyHasQueried: boolean
  summaryStart: string
  summaryEnd: string
  summaryMonth: string
  summaryList: InboundHistoryItem[]
  summaryHasQueried: boolean
  summaryVendorFilter: string
  summaryCategoryFilter: string
  summaryItemSearch: string
  summaryStoreFilter: string
}

export const inboundViewCache = createErpQueryViewCache<InboundViewCache>()
