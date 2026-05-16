"use client"

import { AdminAccountingCompliance } from "@/components/admin/admin-accounting-compliance"

type Props = {
  filingYearMonth: string
  onFilingYearMonthChange: (v: string) => void
  filingStoreFilter: string
  onFilingStoreFilterChange: (v: string) => void
  onOpenStoreProfiles?: () => void
}

export function TaxFilingCitTab(props: Props) {
  const { onOpenStoreProfiles, ...rest } = props
  return (
    <AdminAccountingCompliance
      initialTab="cit"
      hideTabBar
      filingYearMonth={rest.filingYearMonth}
      onFilingYearMonthChange={rest.onFilingYearMonthChange}
      filingStoreFilter={rest.filingStoreFilter}
      onFilingStoreFilterChange={rest.onFilingStoreFilterChange}
      onOpenStoreProfiles={onOpenStoreProfiles}
    />
  )
}
