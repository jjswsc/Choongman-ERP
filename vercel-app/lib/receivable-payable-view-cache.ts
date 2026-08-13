/**
 * 미수·미지급 조회 결과 — 탭 전환으로 컴포넌트가 remount 되어도 복구.
 * (Next App Router + keep-alive element 캐시만으로는 fiber state가 비는 경우가 있음)
 *
 * 주의: remount 직후 초기 hasSearchedList=false effect에서 clear하지 말 것.
 */

import { createErpQueryViewCache } from "@/lib/erp-query-view-cache"
import type { ReceivablePayableItem } from "@/lib/api-client"

export type ReceivablePayableViewCache = {
  tab?: "receivable" | "payable"
  startStr?: string
  endStr?: string
  salesOutletFilter?: string
  payableStoreFilter?: string
  vendorFilter?: string
  invoiceSearch?: string
  filterUnpaidOnly?: boolean
  ledgerViewMode?: "ledger" | "paired"
  hasSearchedList?: boolean
  listData: ReceivablePayableItem[]
  cumulativeSummary: { totalAmount: number; byKey: Record<string, number> }
}

export const receivablePayableViewCache = createErpQueryViewCache<ReceivablePayableViewCache>()
