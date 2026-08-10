import { createErpQueryViewCache } from "@/lib/erp-query-view-cache"

export type MemberVisitsViewCache = {
  tab: "history" | "analysis" | "rfm"
  startDate: string
  endDate: string
  storeCode: string
  memberId: string
  memberSearch: string
  rows: unknown[]
  analysisRows: unknown[]
  hasSearched: boolean
}

export const memberVisitsViewCache = createErpQueryViewCache<MemberVisitsViewCache>()
