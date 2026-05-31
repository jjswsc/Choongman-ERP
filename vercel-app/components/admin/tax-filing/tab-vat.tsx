"use client"

import { AdminAccountingCompliance } from "@/components/admin/admin-accounting-compliance"

type Props = {
  filingYearMonth: string
  onFilingYearMonthChange: (v: string) => void
  filingStoreFilter: string
  onFilingStoreFilterChange: (v: string) => void
  onOpenStoreProfiles?: () => void
  onFilingSearch?: () => void
}

export function TaxFilingVatTab(props: Props) {
  const { onOpenStoreProfiles, onFilingSearch, ...rest } = props
  return (
    <AdminAccountingCompliance
      initialTab="summary"
      initialPp30SubView="output"
      pp30Mode="vat_only"
      hideTabBar
      filingYearMonth={rest.filingYearMonth}
      onFilingYearMonthChange={rest.onFilingYearMonthChange}
      filingStoreFilter={rest.filingStoreFilter}
      onFilingStoreFilterChange={rest.onFilingStoreFilterChange}
      onOpenStoreProfiles={onOpenStoreProfiles}
      onFilingSearch={onFilingSearch}
    />
  )
}
