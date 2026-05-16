"use client"

import { AdminAccountingCompliance } from "@/components/admin/admin-accounting-compliance"

type Props = {
  filingYearMonth: string
  onFilingYearMonthChange: (v: string) => void
  filingStoreFilter: string
  onFilingStoreFilterChange: (v: string) => void
  /** 세무 신고 셸 FilingFiltersCard 검색 버튼 틱 */
  filingSearchTick?: number
}

export function TaxFilingSsoTab(props: Props) {
  return (
    <AdminAccountingCompliance
      initialTab="sso"
      hideTabBar
      filingYearMonth={props.filingYearMonth}
      onFilingYearMonthChange={props.onFilingYearMonthChange}
      filingStoreFilter={props.filingStoreFilter}
      onFilingStoreFilterChange={props.onFilingStoreFilterChange}
      filingSearchTick={props.filingSearchTick}
    />
  )
}
