"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import { usePosStoreInternal } from "@/hooks/use-pos-store"
import { useStoreView } from "@/lib/store-view-context"
import { MobileStoreSelectorBar } from "@/components/erp/mobile-store-selector-bar"
import { StoreSalesRealtimeView } from "@/components/erp/store-sales-realtime-view"
import { PosRevenueRealtimeDashboard } from "@/components/erp/pos-revenue-realtime-dashboard"
import { AdminSalesDashboardCharts } from "@/components/erp/admin-sales-dashboard-charts"
import { SalesPageHeader } from "@/components/erp/sales-page-header"
import { LiveSalesSearchButton } from "@/components/erp/live-sales-search-button"
import { getPosOpenTableTotals } from "@/lib/api-client"
import { flattenOpenTableTotalLookup } from "@/lib/pos-open-table-totals"
import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { storeMatches } from "@/lib/admin-employee-store-access"
import { filterPosSalesStoreOptionsForManagement } from "@/lib/pos-sales-test-office"
import {
  computeRealtimeExpectedAddend,
  computeRealtimeTableTotal,
  mergeRealtimeStoreSalesRows,
} from "@/lib/pos-realtime-store-rows"
import { useStoreList } from "@/lib/use-store-list"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { getBangkokDateTimeString } from "@/lib/bangkok-time"

const ALL_STORE_VALUE = "All"

export default function AdminLiveStoreSalesPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { viewStore, setViewStore } = useStoreView()

  const role = auth?.role || ""
  const isOfficeSelector =
    Boolean(auth) && (isOfficeRole(role) || isOfficeStore(auth?.store || ""))

  const { stats: dashboardStats } = useAdminDashboardStats()

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

  const { stores, currentStore, setCurrentStoreId, loadingTables, refetchStores } = usePosStoreInternal({
    initialLoadScope: "current",
  })
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

  const liveOpenTableStoreCodes = useMemo(() => {
    if (franchiseSalesStoreCodes?.length) return franchiseSalesStoreCodes
    if (isAllStoresTableTotal) {
      return filterPosSalesStoreOptionsForManagement(storeListCodes)
    }
    const code = String(effectiveStoreCode || "").trim()
    return code && code !== ALL_STORE_VALUE ? [code] : []
  }, [franchiseSalesStoreCodes, isAllStoresTableTotal, storeListCodes, effectiveStoreCode])

  const [parentOpenTableTotals, setParentOpenTableTotals] = useState<{
    tableTotal: number
    expectedAddend: number
    byStore: Record<string, { tableTotal: number; expectedAddend: number }>
  } | null>(null)

  const loadParentOpenTables = useCallback(
    async (forceNetwork: boolean) => {
      const codes = liveOpenTableStoreCodes
      if (isAllStoresTableTotal && codes.length === 0) return
      try {
        const open =
          codes.length > 1 || (isAllStoresTableTotal && codes.length > 0)
            ? await getPosOpenTableTotals({ storeCodes: codes, forceNetwork })
            : await getPosOpenTableTotals({
                storeCode: codes[0] || effectiveStoreCode,
                forceNetwork,
              })
        setParentOpenTableTotals({
          tableTotal: Number(open.tableTotal ?? 0),
          expectedAddend: Number(open.expectedAddend ?? 0),
          byStore: open.byStore || {},
        })
      } catch {
        /* 직전 숫자 유지 */
      }
    },
    [liveOpenTableStoreCodes, isAllStoresTableTotal, effectiveStoreCode]
  )

  useEffect(() => {
    void loadParentOpenTables(false)
  }, [loadParentOpenTables])

  const snapshotTableTotal = useMemo(
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

  const snapshotExpectedAddend = useMemo(
    () =>
      computeRealtimeExpectedAddend({
        isAllStores: isAllStoresTableTotal,
        stores: operationalStoresForTableTotal,
        currentStore: isAllStoresTableTotal ? undefined : currentStore,
        storeCodes: storeListCodes,
        legacyToCanonical,
      }),
    [isAllStoresTableTotal, operationalStoresForTableTotal, currentStore, storeListCodes, legacyToCanonical]
  )

  const adminTableTotal =
    parentOpenTableTotals != null ? parentOpenTableTotals.tableTotal : snapshotTableTotal
  const adminExpectedTableAddend =
    parentOpenTableTotals != null ? parentOpenTableTotals.expectedAddend : snapshotExpectedAddend

  const tableTotalByStore = useMemo(() => {
    if (parentOpenTableTotals?.byStore) {
      return flattenOpenTableTotalLookup(parentOpenTableTotals.byStore)
    }
    const rows = mergeRealtimeStoreSalesRows({
      operationalStores: operationalStoresForTableTotal,
      storeSalesMap: {},
      storeCodes: storeListCodes,
      legacyToCanonical,
      formatStoreLabel,
    })
    return Object.fromEntries(rows.map((r) => [r.storeId, r.tableTotal]))
  }, [
    parentOpenTableTotals,
    operationalStoresForTableTotal,
    storeListCodes,
    legacyToCanonical,
    formatStoreLabel,
  ])

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

  const [refreshToken, setRefreshToken] = useState(0)
  const [searchBusy, setSearchBusy] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const searchGenRef = useRef(0)

  const runSearch = useCallback(async () => {
    const gen = ++searchGenRef.current
    setSearchBusy(true)
    setRefreshToken((n) => n + 1)
    try {
      const openTablesTask = loadParentOpenTables(true)
      const storesTask = isAllStoresTableTotal
        ? Promise.resolve()
        : Promise.resolve(
            refetchStores({
              scope: "current",
              storeCode: effectiveStoreCode,
              immediate: true,
              forceFullRefresh: true,
            })
          )
      await Promise.race([
        Promise.all([openTablesTask, storesTask]),
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, 40_000)
        }),
      ])
      if (gen === searchGenRef.current) setLastUpdated(new Date())
    } finally {
      if (gen === searchGenRef.current) setSearchBusy(false)
    }
  }, [refetchStores, isAllStoresTableTotal, effectiveStoreCode, loadParentOpenTables])

  const headerActions = (
    <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
      <AdminDashboardPendingOrdersAlert count={dashboardStats.unapprovedOrders} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <LiveSalesSearchButton
          onClick={runSearch}
          busy={searchBusy}
          label={t("search")}
          title={t("search")}
        />
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
        <SalesPageHeader
          title={tOr(t, "adminLiveStoreSales", "실시간 매출")}
          subtitle={liveSalesSubtitle}
          icon={Radio}
          iconTone="emerald"
          actions={headerActions}
        />

        {isOfficeSelector ? <MobileStoreSelectorBar /> : null}

        <Tabs defaultValue="realtime" className={adminTabsRootCn}>
          <AdminTabsBarWithHelp>
            <TabsList className={adminTabsListRowCn}>
              <TabsTrigger value="realtime" className={adminTabsTriggerCn}>
                {t("liveStoreSalesTabRealtime")}
              </TabsTrigger>
              <TabsTrigger value="charts" className={adminTabsTriggerCn}>
                {t("liveStoreSalesTabCharts")}
              </TabsTrigger>
              <TabsTrigger value="ops" className={adminTabsTriggerCn}>
                {t("liveStoreSalesTabOps")}
              </TabsTrigger>
            </TabsList>
          </AdminTabsBarWithHelp>

          <TabsContent value="realtime" className={`${adminTabsContentCn} space-y-4`}>
            {showRealtimeBlock ? (
              <StoreSalesRealtimeView
                effectiveStoreCode={effectiveStoreCode}
                stores={storesForRealtime}
                loadingTables={loadingTables}
                refetchStores={refetchStores}
                currentStore={
                  showFranchiseAllRealtime || showOfficeAllRealtime ? undefined : currentStore
                }
                hideByStoreSection={hideDuplicateByStoreSection}
                refreshToken={refreshToken}
                salesStoreCodes={franchiseSalesStoreCodes}
                parentOwnsOpenTables
                parentOpenTableTotals={parentOpenTableTotals}
              />
            ) : null}
          </TabsContent>

          <TabsContent value="charts" className={adminTabsContentCn}>
            <AdminSalesDashboardCharts
              effectiveStoreCode={effectiveStoreCode}
              isOfficeSelector={isOfficeSelector}
              salesStoreCodes={franchiseSalesStoreCodes}
              tableTotalByStore={tableTotalByStore}
              refreshToken={refreshToken}
              onLiveSearch={runSearch}
            />
          </TabsContent>

          <TabsContent value="ops" className={adminTabsContentCn}>
            <PosRevenueRealtimeDashboard
              effectiveStoreCode={effectiveStoreCode}
              isOfficeSelector={isOfficeSelector}
              salesStoreCodes={franchiseSalesStoreCodes}
              tableTotal={adminTableTotal}
              expectedTableAddend={adminExpectedTableAddend}
              tableTotalLoading={parentOpenTableTotals == null && loadingTables}
              refreshToken={refreshToken}
              onLiveSearch={runSearch}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
