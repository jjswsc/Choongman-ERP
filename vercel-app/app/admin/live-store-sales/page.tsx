"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Radio, RefreshCw } from "lucide-react"
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
import { SalesSubnav } from "@/components/erp/sales-subnav"
import { SalesPageHeader } from "@/components/erp/sales-page-header"
import { storeMatches } from "@/lib/admin-employee-store-access"
import { filterPosSalesStoreOptionsForManagement } from "@/lib/pos-sales-test-office"
import { computeRealtimeTableTotal, mergeRealtimeStoreSalesRows } from "@/lib/pos-realtime-store-rows"
import { useStoreList } from "@/lib/use-store-list"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { getBangkokDateTimeString } from "@/lib/bangkok-time"

const ALL_STORE_VALUE = "All"
const AUTO_REFRESH_MS = 60_000

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
        storeCodes: storeListCodes,
        legacyToCanonical,
      }),
    [isAllStoresTableTotal, operationalStoresForTableTotal, currentStore, storeListCodes, legacyToCanonical]
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

  const showOfficeAllRealtime =
    isOfficeSelector && effectiveStoreCode === ALL_STORE_VALUE

  const hideDuplicateByStoreSection = showOfficeAllRealtime || showFranchiseAllRealtime

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

  const [autoRefresh, setAutoRefresh] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const refreshInFlight = useRef(false)

  const runRefresh = useCallback(() => {
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    setRefreshToken((n) => n + 1)
    const refreshTask = refetchStores({
      scope: isAllStoresTableTotal ? "all" : "current",
      storeCode: isAllStoresTableTotal ? undefined : effectiveStoreCode,
      immediate: true,
    })
    void Promise.resolve(refreshTask).finally(() => {
      refreshInFlight.current = false
      setLastUpdated(new Date())
    })
  }, [refetchStores, isAllStoresTableTotal, effectiveStoreCode])

  useEffect(() => {
    if (!autoRefresh) return
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return
      runRefresh()
    }, AUTO_REFRESH_MS)
    return () => window.clearInterval(id)
  }, [autoRefresh, runRefresh])

  const headerActions = (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="gap-2" onClick={runRefresh}>
          <RefreshCw className="h-4 w-4" />
          {t("adminOpsCenterReload")}
        </Button>
        <AdminDashboardPendingOrdersAlert count={dashboardStats.unapprovedOrders} />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="live-auto-refresh"
          checked={autoRefresh}
          onCheckedChange={(c) => setAutoRefresh(c === true)}
        />
        <Label htmlFor="live-auto-refresh" className="text-xs text-muted-foreground cursor-pointer">
          {t("liveStoreSalesAutoRefresh")}
        </Label>
      </div>
      {lastUpdated ? (
        <p className="text-[11px] text-muted-foreground">
          {t("liveStoreSalesLastUpdated")}: {getBangkokDateTimeString(lastUpdated)}
        </p>
      ) : null}
    </div>
  )

  const showRealtimeBlock =
    showBranchRealtime || showFranchiseAllRealtime || showOfficeAllRealtime

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <SalesSubnav />
        <SalesPageHeader
          href="/admin/live-store-sales"
          title={tOr(t, "adminLiveStoreSales", "실시간 매출")}
          subtitle={liveSalesSubtitle}
          icon={Radio}
          iconTone="emerald"
          actions={headerActions}
        />

        {isOfficeSelector ? <MobileStoreSelectorBar /> : null}

        <Tabs defaultValue="realtime" className="space-y-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="realtime">{t("liveStoreSalesTabRealtime")}</TabsTrigger>
            <TabsTrigger value="charts">{t("liveStoreSalesTabCharts")}</TabsTrigger>
            <TabsTrigger value="ops">{t("liveStoreSalesTabOps")}</TabsTrigger>
          </TabsList>

          <TabsContent value="realtime" className="mt-0 space-y-4">
            {showRealtimeBlock ? (
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
                hideByStoreSection={hideDuplicateByStoreSection}
                refreshToken={refreshToken}
              />
            ) : null}
          </TabsContent>

          <TabsContent value="charts" className="mt-0">
            <AdminSalesDashboardCharts
              effectiveStoreCode={effectiveStoreCode}
              isOfficeSelector={isOfficeSelector}
              salesStoreCodes={franchiseSalesStoreCodes}
              tableTotalByStore={tableTotalByStore}
              refreshToken={refreshToken}
            />
          </TabsContent>

          <TabsContent value="ops" className="mt-0">
            <PosRevenueRealtimeDashboard
              effectiveStoreCode={effectiveStoreCode}
              isOfficeSelector={isOfficeSelector}
              salesStoreCodes={franchiseSalesStoreCodes}
              tableTotal={adminTableTotal}
              tableTotalLoading={loadingTables}
              refreshToken={refreshToken}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
