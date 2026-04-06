"use client"

import { AdminAccountingCompliance } from "@/components/admin/admin-accounting-compliance"

type Props = {
  filingYearMonth: string
  onFilingYearMonthChange: (v: string) => void
  filingStoreFilter: string
  onFilingStoreFilterChange: (v: string) => void
}

export function TaxFilingCitTab(props: Props) {
  return (
    <AdminAccountingCompliance
      initialTab="cit"
      hideTabBar
      filingYearMonth={props.filingYearMonth}
      onFilingYearMonthChange={props.onFilingYearMonthChange}
      filingStoreFilter={props.filingStoreFilter}
      onFilingStoreFilterChange={props.onFilingStoreFilterChange}
    />
  )
}
