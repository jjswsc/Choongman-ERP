"use client"

import { useEffect, useMemo } from "react"
import { Radio } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT, tOr } from "@/lib/i18n"
import { isOfficeRole, isOfficeStore } from "@/lib/permissions"
import { useAdminDashboardStats } from "@/lib/use-admin-dashboard-stats"
import { AdminDashboardPendingOrdersAlert } from "@/components/erp/admin-dashboard-pending-orders-alert"
import {
  canFranchiseeAggregateAllowedStores,
  FRANCHISEE_AGGREGATE_ALL_STORES_VALUE,
  isFranchiseeAggregateAllStoresView,
  resolveFranchiseePosSalesFetchStoreCodes,
} from "@/lib/franchisee-multi-store"
import { usePosStoreStandalone } from "@/hooks/use-pos-store"
import { useStoreView } from "@/lib/store-view-context"
import { MobileStoreSelectorBar } from "@/components/erp/mobile-store-selector-bar"
import { StoreSalesRealtimeView } from "@/components/erp/store-sales-realtime-view"
import { PosRevenueRealtimeDashboard } from "@/components/erp/pos-revenue-realtime-dashboard"
import { AdminSalesDashboardCharts } from "@/components/erp/admin-sales-dashboard-charts"
import { storeMatches } from "@/lib/admin-employee-store-access"
import { filterPosSalesStoreOptionsForManagement } from "@/lib/pos-sales-test-office"
import { computeRealtimeTableTotal, mergeRealtimeStoreSalesRows } from "@/lib/pos-realtime-store-rows"
import { useStoreList } from "@/lib/use-store-list"

const ALL_STORE_VALUE = "All"

export default function AdminLiveStoreSalesPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { viewStore, setViewStore } = useStoreView()

  const role = auth?.role || ""
  const isOfficeSelector =
    Boolean(auth) && (isOfficeRole(role) || isOfficeStore(auth?.store || ""))

  const { stats: dashboardStats } = useAdminDashboardStats({ poll: true })

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

  const { stores, currentStore, setCurrentStoreId, loadingTables, refetchStores } = usePosStoreStandalone()
  const { stores: storeListCodes, legacyToCanonical, formatStoreLabel } = useStoreList()

  const storesForRealtime = useMemo(() => {
    if (effectiveStoreCode !== FRANCHISEE_AGGREGATE_ALL_STORES_VALUE || !franchiseSalesStoreCodes?.length) {
      return stores
    }
    return stores.filter((s) =>
      franchiseSalesStoreCodes.some((code) => storeMatches(code, String(s.id || "").trim()))
    )
  }, [stores, effectiveStoreCode, franchiseSalesStoreCodes])

  const operationalStoresForTableTotal = useMemo(() => {
    const allowed = new Set(
      filterPosSalesStoreOptionsForManagement(
        storesForRealtime.map((s) => String(s.id || "").trim()).filter(Boolean)
      )
    )
    return storesForRealtime.filter((s) => allowed.has(String(s.id || "").trim()))
  }, [storesForRealtime])

  const isAllStoresTableTotal =
    effectiveStoreCode === ALL_STORE_VALUE ||
    effectiveStoreCode === FRANCHISEE_AGGREGATE_ALL_STORES_VALUE

  const adminTableTotal = useMemo(
    () =>
      computeRealtimeTableTotal({
        isAllStores: isAllStoresTableTotal,
        stores: operationalStoresForTableTotal,
        currentStore: isAllStoresTableTotal ? undefined : currentStore,
      }),
    [isAllStoresTableTotal, operationalStoresForTableTotal, currentStore]
  )

  const tableTotalByStore = useMemo(() => {
    const rows = mergeRealtimeStoreSalesRows({
      operationalStores: operationalStoresForTableTotal,
      storeSalesMap: {},
      storeCodes: storeListCodes,
      legacyToCanonical,
      formatStoreLabel,
    })
    return Object.fromEntries(rows.map((r) => [r.storeId, r.tableTotal]))
  }, [operationalStoresForTableTotal, storeListCodes, legacyToCanonical, formatStoreLabel])

  const showBranchRealtime =
    effectiveStoreCode &&
    effectiveStoreCode !== ALL_STORE_VALUE &&
    effectiveStoreCode !== FRANCHISEE_AGGREGATE_ALL_STORES_VALUE

  const showFranchiseAllRealtime =
    canFranchiseeAll && effectiveStoreCode === FRANCHISEE_AGGREGATE_ALL_STORES_VALUE

  /** 본사 전체 매장 — 매장별·테이블 총 금액 실시간 패널(차트는 AdminSalesDashboardCharts) */
  const showOfficeAllRealtime =
    isOfficeSelector && effectiveStoreCode === ALL_STORE_VALUE

  useEffect(() => {
    if (!showBranchRealtime) return
    if (!stores.some((s) => s.id === effectiveStoreCode)) return
    setCurrentStoreId(effectiveStoreCode)
  }, [showBranchRealtime, effectiveStoreCode, stores, setCurrentStoreId])

  const liveSalesSubtitle = useMemo(() => {
    if (isOfficeSelector) {
      return effectiveStoreCode === ALL_STORE_VALUE
        ? tOr(t, "adminLiveStoreSalesSubtitleAll", "전체 매장 · 당일 실시간 매출·테이블 현황")
        : `${effectiveStoreCode} · ${tOr(t, "adminLiveStoreSalesSubtitleBranch", "지점 실시간 매출")}`
    }
    if (showFranchiseAllRealtime) {
      return tOr(t, "adminLiveStoreSalesSubtitleFranchiseAll", "내 매장 전체 · 실시간 매출·테이블")
    }
    return effectiveStoreCode || "—"
  }, [isOfficeSelector, effectiveStoreCode, showFranchiseAllRealtime, t])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
              <Radio className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                {tOr(t, "adminLiveStoreSales", "실시간 매출")}
              </h1>
              <p className="text-xs text-muted-foreground">{liveSalesSubtitle}</p>
            </div>
          </div>
          <AdminDashboardPendingOrdersAlert count={dashboardStats.unapprovedOrders} />
        </div>

        <>
          {isOfficeSelector ? <MobileStoreSelectorBar /> : null}

          <AdminSalesDashboardCharts
            effectiveStoreCode={effectiveStoreCode}
            isOfficeSelector={isOfficeSelector}
            salesStoreCodes={franchiseSalesStoreCodes}
            tableTotalByStore={tableTotalByStore}
          />
          <PosRevenueRealtimeDashboard
            effectiveStoreCode={effectiveStoreCode}
            isOfficeSelector={isOfficeSelector}
            salesStoreCodes={franchiseSalesStoreCodes}
            tableTotal={adminTableTotal}
            tableTotalLoading={loadingTables}
          />

          {showBranchRealtime || showFranchiseAllRealtime || showOfficeAllRealtime ? (
            <StoreSalesRealtimeView
              effectiveStoreCode={effectiveStoreCode}
              stores={storesForRealtime}
              loadingTables={loadingTables}
              refetchStores={refetchStores}
              currentStore={
                showFranchiseAllRealtime || showOfficeAllRealtime ? undefined : currentStore
              }
              showInlineRefresh
              showHeaderBadge
            />
          ) : null}
        </>
      </div>
    </div>
  )
}
