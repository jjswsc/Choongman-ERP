"use client"

import { AdminAccountingCompliance } from "@/components/admin/admin-accounting-compliance"

type Props = {
  filingYearMonth: string
  onFilingYearMonthChange: (v: string) => void
  filingStoreFilter: string
  onFilingStoreFilterChange: (v: string) => void
}

export function TaxFilingVatTab(props: Props) {
  return (
    <AdminAccountingCompliance
      initialTab="summary"
      initialPp30SubView="output"
      pp30Mode="vat_only"
      hideTabBar
      filingYearMonth={props.filingYearMonth}
      onFilingYearMonthChange={props.onFilingYearMonthChange}
      filingStoreFilter={props.filingStoreFilter}
      onFilingStoreFilterChange={props.onFilingStoreFilterChange}
    />
  )
}
