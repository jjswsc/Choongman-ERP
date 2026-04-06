"use client"

import { AdminAccountingCompliance } from "@/components/admin/admin-accounting-compliance"

type Props = {
  filingYearMonth: string
  onFilingYearMonthChange: (v: string) => void
  filingStoreFilter: string
  onFilingStoreFilterChange: (v: string) => void
}

export function TaxFilingWhtTab(props: Props) {
  return (
    <AdminAccountingCompliance
      initialTab="summary"
      initialPp30SubView="wht"
      hideTabBar
      filingYearMonth={props.filingYearMonth}
      onFilingYearMonthChange={props.onFilingYearMonthChange}
      filingStoreFilter={props.filingStoreFilter}
      onFilingStoreFilterChange={props.onFilingStoreFilterChange}
    />
  )
}
