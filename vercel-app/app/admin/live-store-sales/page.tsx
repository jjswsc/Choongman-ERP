"use client"

import { useEffect, useMemo } from "react"
import { LayoutDashboard } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT, tOr } from "@/lib/i18n"
import { isOfficeRole, isOfficeStore } from "@/lib/permissions"
import { usePosStore } from "@/hooks/use-pos-store"
import { useStoreView } from "@/lib/store-view-context"
import { MobileStoreSelectorBar } from "@/components/erp/mobile-store-selector-bar"
import { StoreSalesRealtimeView } from "@/components/erp/store-sales-realtime-view"
import { PosRevenueRealtimeDashboard } from "@/components/erp/pos-revenue-realtime-dashboard"
import { AdminSalesDashboardCharts } from "@/components/erp/admin-sales-dashboard-charts"

const ALL_STORE_VALUE = "All"

export default function AdminLiveStoreSalesPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { viewStore } = useStoreView()

  const isOfficeSelector =
    Boolean(auth) && (isOfficeRole(auth?.role || "") || isOfficeStore(auth?.store || ""))

  /** 본사: Office 코드 → 전체 매장 집계. 가맹/매장: 로그인 매장만 */
  const effectiveStoreCode = useMemo(() => {
    if (isOfficeSelector) {
      const v = String(viewStore || ALL_STORE_VALUE).trim()
      if (!v || v === ALL_STORE_VALUE || isOfficeStore(v)) return ALL_STORE_VALUE
      return v
    }
    return (auth?.store || "").trim()
  }, [isOfficeSelector, viewStore, auth?.store])

  const { stores, currentStore, setCurrentStoreId, loadingTables, refetchStores } = usePosStore()

  const showBranchRealtime =
    !isOfficeSelector && effectiveStoreCode && effectiveStoreCode !== ALL_STORE_VALUE

  useEffect(() => {
    if (!showBranchRealtime) return
    if (!stores.some((s) => s.id === effectiveStoreCode)) return
    setCurrentStoreId(effectiveStoreCode)
  }, [showBranchRealtime, effectiveStoreCode, stores, setCurrentStoreId])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <LayoutDashboard className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                {tOr(t, "adminDashboard", "대시보드")}
              </h1>
              <p className="text-xs text-muted-foreground">
                {isOfficeSelector
                  ? effectiveStoreCode === ALL_STORE_VALUE
                    ? tOr(t, "adminDashboardOfficeAllStores", "전체 매장 · 당일 매출·운영 지표")
                    : `${effectiveStoreCode} · ${tOr(t, "adminDashboardBranchFocus", "지점 상세")}`
                  : effectiveStoreCode || "—"}
              </p>
            </div>
          </div>
        </div>

        {isOfficeSelector ? <MobileStoreSelectorBar /> : null}

        <AdminSalesDashboardCharts
          effectiveStoreCode={effectiveStoreCode}
          isOfficeSelector={isOfficeSelector}
        />
        <PosRevenueRealtimeDashboard
          effectiveStoreCode={effectiveStoreCode}
          isOfficeSelector={isOfficeSelector}
        />

        {showBranchRealtime ? (
          <StoreSalesRealtimeView
            effectiveStoreCode={effectiveStoreCode}
            stores={stores}
            loadingTables={loadingTables}
            refetchStores={refetchStores}
            currentStore={currentStore}
            showSalesCharts
          />
        ) : null}
      </div>
    </div>
  )
}
