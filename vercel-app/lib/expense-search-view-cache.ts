import { createErpQueryViewCache } from "@/lib/erp-query-view-cache"
import type { ExpenseSearchOverviewRow, ExpenseSearchOverviewSummary } from "@/lib/api-client"

export type ExpenseSearchViewCache = {
  storeFilter: string
  accountId: string
  startStr: string
  endStr: string
  categoryFilter: string
  vendorFilter: string
  documentNoFilter: string
  relationFilter: string
  list: ExpenseSearchOverviewRow[]
  summary: ExpenseSearchOverviewSummary
  loadedOnce: boolean
}

export const expenseSearchViewCache = createErpQueryViewCache<ExpenseSearchViewCache>()
