"use client"

import { AdminAccountingCompliance } from "@/components/admin/admin-accounting-compliance"
import { TaxBooksFilingBridge } from "@/components/admin/tax-filing/tax-books-filing-bridge"

type Props = {
  filingYearMonth: string
  onFilingYearMonthChange: (v: string) => void
  filingStoreFilter: string
  onFilingStoreFilterChange: (v: string) => void
  onOpenStoreProfiles?: () => void
  onFilingSearch?: () => void
  onOpenTaxBooksVouchers?: () => void
}

export function TaxFilingVatTab(props: Props & { onOpenTaxBooksVouchers?: () => void }) {
  const { onOpenStoreProfiles, onFilingSearch, onOpenTaxBooksVouchers, ...rest } = props
  return (
    <div className="space-y-3">
      <TaxBooksFilingBridge
        yearMonth={rest.filingYearMonth}
        scopeFilter={rest.filingStoreFilter}
        mode="all"
        onOpenVouchers={onOpenTaxBooksVouchers}
      />
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
    </div>
  )
}
