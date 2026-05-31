"use client"

import { AdminAccountingCompliance } from "@/components/admin/admin-accounting-compliance"

type Props = {
  filingYearMonth: string
  onFilingYearMonthChange: (v: string) => void
  filingStoreFilter: string
  onFilingStoreFilterChange: (v: string) => void
  onOpenStoreProfiles?: () => void
  whtFocusMode?: "all" | "pnd1391" | "pnd5354" | "pp36"
  initialWhtSubmissionFormHint?: "PND3" | "PND53" | "ALL"
}

export function TaxFilingWhtTab(props: Props) {
  const { onOpenStoreProfiles, whtFocusMode, initialWhtSubmissionFormHint, ...rest } = props
  return (
    <AdminAccountingCompliance
      initialTab="summary"
      initialPp30SubView="wht"
      pp30Mode="wht_only"
      whtFocusMode={whtFocusMode}
      initialWhtSubmissionFormHint={initialWhtSubmissionFormHint}
      hideTabBar
      filingYearMonth={rest.filingYearMonth}
      onFilingYearMonthChange={rest.onFilingYearMonthChange}
      filingStoreFilter={rest.filingStoreFilter}
      onFilingStoreFilterChange={rest.onFilingStoreFilterChange}
      onOpenStoreProfiles={onOpenStoreProfiles}
    />
  )
}
