"use client"

import * as React from "react"
import { StoreTaxFilingProfilesPanel } from "@/components/admin/tax-filing/store-tax-filing-profiles-panel"
import { useAuth } from "@/lib/auth-context"
import { canWriteAccountingCompliance } from "@/lib/accounting-auth"
import { isManagerOrFranchiseeRole, isOfficeRole, isOfficeStore } from "@/lib/permissions"
import { isHeadOfficeLikeStoreName } from "@/lib/internal-outbound"
import { useStoreList } from "@/lib/api-client"

type Props = {
  filingStoreFilter: string
  onFilingStoreFilterChange: (v: string) => void
}

export function TaxFilingStoreProfilesTab({ filingStoreFilter }: Props) {
  const { auth } = useAuth()
  const role = auth?.role || ""
  const managerStore = (auth?.store || "").trim()
  const officeByStore = isOfficeStore(managerStore) || isHeadOfficeLikeStoreName(managerStore)
  const isOffice = isOfficeRole(role) || officeByStore
  const isManager = !isOffice && isManagerOrFranchiseeRole(role)
  const { stores: storeList } = useStoreList()

  const storeOptions = React.useMemo(() => {
    if (!isOffice) return isManager && managerStore ? [managerStore] : []
    const uniq = Array.from(new Set((storeList || []).map((s) => String(s).trim()).filter(Boolean))).sort(
      (a, b) => a.localeCompare(b)
    )
    return ["All", ...uniq]
  }, [isOffice, isManager, managerStore, storeList])

  const initialStore =
    filingStoreFilter && filingStoreFilter !== "All" ? filingStoreFilter : isManager ? managerStore : ""

  return (
    <StoreTaxFilingProfilesPanel
      storeOptions={storeOptions}
      isOffice={isOffice}
      isManager={isManager}
      managerStore={managerStore}
      canWrite={canWriteAccountingCompliance(role)}
      initialStoreCode={initialStore || undefined}
    />
  )
}
