"use client"

import { useEffect, useMemo } from "react"
import { LayoutDashboard } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT, tOr } from "@/lib/i18n"
import { isOfficeRole, isOfficeStore } from "@/lib/permissions"
import {
  canFranchiseeAggregateAllowedStores,
  FRANCHISEE_AGGREGATE_ALL_STORES_VALUE,
  isFranchiseeAggregateAllStoresView,
  resolveFranchiseePosSalesFetchStoreCodes,
} from "@/lib/franchisee-multi-store"
import { usePosStore } from "@/hooks/use-pos-store"
import { useStoreView } from "@/lib/store-view-context"
import { MobileStoreSelectorBar } from "@/components/erp/mobile-store-selector-bar"
import { StoreSalesRealtimeView } from "@/components/erp/store-sales-realtime-view"
import { PosRevenueRealtimeDashboard } from "@/components/erp/pos-revenue-realtime-dashboard"
import { AdminSalesDashboardCharts } from "@/components/erp/admin-sales-dashboard-charts"
import { storeMatches } from "@/lib/admin-employee-store-access"

const ALL_STORE_VALUE = "All"

export default function AdminLiveStoreSalesPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { viewStore, setViewStore } = useStoreView()

  const isOfficeSelector =
    Boolean(auth) && (isOfficeRole(auth?.role || "") || isOfficeStore(auth?.store || ""))

  const canFranchiseeAll = canFranchiseeAggregateAllowedStores(
    auth?.role,
    auth?.allowedStores,
    auth?.store
  )

  useEffect(() => {
    if (!canFranchiseeAll) return
    const v = String(viewStore || "").trim()
    if (!v) setViewStore(FRANCHISEE_AGGREGATE_ALL_STORES_VALUE)
  }, [canFranchiseeAll, viewStore, setViewStore])

  /** 본사: Office → 전체 매장. 가맹 복수: viewStore All → 허용 매장 합산. 그 외: 단일 매장 */
  const effectiveStoreCode = useMemo(() => {
    if (isOfficeSelector) {
      const v = String(viewStore || ALL_STORE_VALUE).trim()
      if (!v || v === ALL_STORE_VALUE || isOfficeStore(v)) return ALL_STORE_VALUE
      return v
    }
    if (canFranchiseeAll) {
      const v = String(viewStore || FRANCHISEE_AGGREGATE_ALL_STORES_VALUE).trim()
      if (isFranchiseeAggregateAllStoresView(v)) return FRANCHISEE_AGGREGATE_ALL_STORES_VALUE
      return v || String(auth?.store || "").trim()
    }
    return (auth?.store || "").trim()
  }, [isOfficeSelector, canFranchiseeAll, viewStore, auth?.store])

  const franchiseSalesStoreCodes = useMemo(() => {
    if (!canFranchiseeAll || !auth) return undefined
    if (effectiveStoreCode !== FRANCHISEE_AGGREGATE_ALL_STORES_VALUE) return undefined
    const codes = resolveFranchiseePosSalesFetchStoreCodes(auth, FRANCHISEE_AGGREGATE_ALL_STORES_VALUE)
    return codes.length > 0 ? codes : undefined
  }, [canFranchiseeAll, auth, effectiveStoreCode])

  const { stores, currentStore, setCurrentStoreId, loadingTables, refetchStores } = usePosStore()

  const storesForRealtime = useMemo(() => {
    if (effectiveStoreCode !== FRANCHISEE_AGGREGATE_ALL_STORES_VALUE || !franchiseSalesStoreCodes?.length) {
      return stores
    }
    return stores.filter((s) =>
      franchiseSalesStoreCodes.some((code) => storeMatches(code, String(s.id || "").trim()))
    )
  }, [stores, effectiveStoreCode, franchiseSalesStoreCodes])

  const showBranchRealtime =
    effectiveStoreCode &&
    effectiveStoreCode !== ALL_STORE_VALUE &&
    effectiveStoreCode !== FRANCHISEE_AGGREGATE_ALL_STORES_VALUE

  const showFranchiseAllRealtime =
    canFranchiseeAll && effectiveStoreCode === FRANCHISEE_AGGREGATE_ALL_STORES_VALUE

  useEffect(() => {
    if (!showBranchRealtime) return
    if (!stores.some((s) => s.id === effectiveStoreCode)) return
    setCurrentStoreId(effectiveStoreCode)
  }, [showBranchRealtime, effectiveStoreCode, stores, setCurrentStoreId])

  const dashboardSubtitle = useMemo(() => {
    if (isOfficeSelector) {
      return effectiveStoreCode === ALL_STORE_VALUE
        ? tOr(t, "adminDashboardOfficeAllStores", "전체 매장 · 당일 매출·운영 지표")
        : `${effectiveStoreCode} · ${tOr(t, "adminDashboardBranchFocus", "지점 상세")}`
    }
    if (showFranchiseAllRealtime) {
      return tOr(t, "adminDashboardFranchiseAllStores", "내 매장 전체 · 당일 매출·운영 지표")
    }
    return effectiveStoreCode || "—"
  }, [isOfficeSelector, effectiveStoreCode, showFranchiseAllRealtime, t])

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
              <p className="text-xs text-muted-foreground">{dashboardSubtitle}</p>
            </div>
          </div>
        </div>

        {isOfficeSelector ? <MobileStoreSelectorBar /> : null}

        <AdminSalesDashboardCharts
          effectiveStoreCode={effectiveStoreCode}
          isOfficeSelector={isOfficeSelector}
          salesStoreCodes={franchiseSalesStoreCodes}
        />
        <PosRevenueRealtimeDashboard
          effectiveStoreCode={effectiveStoreCode}
          isOfficeSelector={isOfficeSelector}
          salesStoreCodes={franchiseSalesStoreCodes}
        />

        {showBranchRealtime || showFranchiseAllRealtime ? (
          <StoreSalesRealtimeView
            effectiveStoreCode={effectiveStoreCode}
            stores={storesForRealtime}
            loadingTables={loadingTables}
            refetchStores={refetchStores}
            currentStore={showFranchiseAllRealtime ? undefined : currentStore}
            showSalesCharts
          />
        ) : null}
      </div>
    </div>
  )
}
