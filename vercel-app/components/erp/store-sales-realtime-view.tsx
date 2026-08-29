"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Radio } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useLang } from "@/lib/lang-context"
import { useT, tOr } from "@/lib/i18n"
import { getPosTodaySales } from "@/lib/api-client"
import { filterPosSalesStoreOptionsForManagement } from "@/lib/pos-sales-test-office"
import { useStoreList } from "@/lib/use-store-list"
import {
  computeRealtimeExpectedAddend,
  computeRealtimeTableTotal,
  mergeRealtimeStoreSalesRows,
} from "@/lib/pos-realtime-store-rows"
import type { Store } from "@/lib/pos-types"
import { Badge } from "@/components/ui/badge"
import { LiveSalesSearchButton } from "@/components/erp/live-sales-search-button"
import { cn } from "@/lib/utils"
import { ERP_NUMERIC_CHART_TICK, ADMIN_CHART_COLORS } from "@/lib/admin-ui-standards"

const ALL_STORE_VALUE = "All"
const CHART_COLORS = [...ADMIN_CHART_COLORS]

const chartYAxisProps = {
  tick: { fontSize: 11, ...ERP_NUMERIC_CHART_TICK },
  tickFormatter: (v: number) => `${(Number(v) / 1000).toFixed(0)}k`,
}

type TodaySalesSummary = {
  completedCount: number
  completedTotal: number
  completedCash: number
  pendingCount: number
}

function formatBahtInt(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  if (!Number.isFinite(v)) return "0"
  return Math.round(v).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

export type StoreSalesRefetchOptions = {
  scope?: "all" | "current"
  storeCode?: string
  /** 사용자 수동 새로고침 — 테이블 스냅샷 즉시 재조회 */
  immediate?: boolean
  /** 수동 새로고침 — 레이아웃 재조회·주문 캐시 합집합 생략 */
  forceFullRefresh?: boolean
}

export type StoreSalesRealtimeViewProps = {
  effectiveStoreCode: string
  stores: Store[]
  loadingTables: boolean
  refetchStores: (options?: StoreSalesRefetchOptions) => void
  currentStore: Store | undefined
  /** true면 상단에 새로고침(·배지) 표시. 모바일 `/store-sales`는 헤더에만 두고 false */
  showInlineRefresh?: boolean
  /** `showInlineRefresh`일 때 배지+라벨 버튼 스타일 (관리자 페이지용) */
  showHeaderBadge?: boolean
  /** 모바일 등 외부 헤더 버튼에서 같은 갱신을 호출할 때 */
  onRegisterRefresh?: (refresh: () => void | Promise<void>) => void
  /** 관리자 대시보드: 실시간 합계·매장·테이블을 차트로 표시 */
  showSalesCharts?: boolean
  /** 관리자 전체 매장: 상단 `AdminSalesDashboardCharts` 매장별 표와 중복 방지 */
  hideByStoreSection?: boolean
  /** 부모「검색」토큰 — 당일 매출만 강제 재조회(테이블은 부모가 refetch) */
  refreshToken?: number
  className?: string
}

/**
 * 당일 POS 합계 + 테이블 현황. `usePosStore`는 부모 한 곳에서만 호출하고 이 컴포넌트에는 스냅샷·refetch만 넘긴다.
 */
export function StoreSalesRealtimeView({
  effectiveStoreCode,
  stores,
  loadingTables,
  refetchStores,
  currentStore,
  showInlineRefresh = false,
  showHeaderBadge = false,
  onRegisterRefresh,
  showSalesCharts = false,
  hideByStoreSection = false,
  refreshToken,
  className,
}: StoreSalesRealtimeViewProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const tr = (key: string, fallback: string) => tOr(t, key, fallback)
  const { stores: storeListCodes, legacyToCanonical, formatStoreLabel } = useStoreList()
  const isAllStoresSelected = effectiveStoreCode === ALL_STORE_VALUE

  /** HQ·TEST 등 비운영 매장 — 관리자 실시간 API와 동일하게 집계·목록에서 제외 */
  const operationalStores = useMemo(() => {
    const allowed = new Set(
      filterPosSalesStoreOptionsForManagement(
        stores.map((s) => String(s.id || "").trim()).filter(Boolean)
      )
    )
    return stores.filter((s) => allowed.has(String(s.id || "").trim()))
  }, [stores])

  const [todaySales, setTodaySales] = useState<TodaySalesSummary | null>(null)
  const [storeSalesMap, setStoreSalesMap] = useState<Record<string, TodaySalesSummary>>({})
  const [tableSortMode, setTableSortMode] = useState<"amount" | "guests">("amount")

  /** 테이블/주문만 바뀌고 매장 ID 집합이 같으면 동일 — `stores` 참조 변경으로 당일 매출 API가 반복 호출되는 것을 막음 */
  const allStoresCodesKey = useMemo(() => {
    if (!isAllStoresSelected) return ""
    return [...new Set(operationalStores.map((s) => String(s.id || "").trim()).filter(Boolean))].sort().join(",")
  }, [isAllStoresSelected, operationalStores])

  const loadTodaySales = useCallback((opts?: { forceNetwork?: boolean }) => {
    const forceNetwork = Boolean(opts?.forceNetwork)
    if (!effectiveStoreCode) return Promise.resolve()
    const empty: TodaySalesSummary = {
      completedCount: 0,
      completedTotal: 0,
      completedCash: 0,
      pendingCount: 0,
    }
    const applyTotals = (data: TodaySalesSummary & { byStore?: Record<string, TodaySalesSummary> }) => {
      setTodaySales({
        completedCount: Number(data.completedCount ?? 0),
        completedTotal: Number(data.completedTotal ?? 0),
        completedCash: Number(data.completedCash ?? 0),
        pendingCount: Number(data.pendingCount ?? 0),
      })
    }

    if (!isAllStoresSelected) {
      return getPosTodaySales({ storeCode: effectiveStoreCode, forceNetwork })
        .then((data) => {
          applyTotals(data)
          setStoreSalesMap((prev) => ({ ...prev, [effectiveStoreCode]: data }))
        })
        .catch(() => setTodaySales(null))
    }
    const storeCodes = allStoresCodesKey
      ? allStoresCodesKey.split(",").map((c) => c.trim()).filter(Boolean)
      : []
    if (!storeCodes.length) {
      setTodaySales(empty)
      setStoreSalesMap({})
      return Promise.resolve()
    }
    return getPosTodaySales({ storeCodes, forceNetwork })
      .then((data) => {
        const nextMap: Record<string, TodaySalesSummary> = { ...(data.byStore || {}) }
        for (const code of storeCodes) {
          if (!nextMap[code]) nextMap[code] = empty
        }
        setStoreSalesMap(nextMap)
        applyTotals(data)
      })
      .catch(() => {
        setStoreSalesMap({})
        setTodaySales(null)
      })
  }, [effectiveStoreCode, isAllStoresSelected, allStoresCodesKey])

  const refreshRealtimeSection = useCallback(async () => {
    const salesTask = loadTodaySales({ forceNetwork: true })
    const storesTask =
      effectiveStoreCode && !isAllStoresSelected
        ? refetchStores({
            storeCode: effectiveStoreCode,
            immediate: true,
            forceFullRefresh: true,
          })
        : refetchStores({ scope: "all", immediate: true, forceFullRefresh: true })
    await Promise.all([Promise.resolve(salesTask), Promise.resolve(storesTask)])
  }, [loadTodaySales, refetchStores, effectiveStoreCode, isAllStoresSelected])

  /** 당일 매출 숫자만 자동 갱신. 테이블/주문(getPosOrders)은 부모 usePosStore 초기 로드·수동 새로고침에만 맡김 — 중복 호출·전송량 절감 */
  useEffect(() => {
    if (!effectiveStoreCode) return
    loadTodaySales()
  }, [effectiveStoreCode, loadTodaySales])

  const sortedTables = useMemo(() => {
    const tables = currentStore?.tables || []
    return [...tables].sort((a, b) => {
      const aAmount = Number(a.order?.total ?? 0)
      const bAmount = Number(b.order?.total ?? 0)
      const aGuests = Number(a.order?.guestCount ?? 0)
      const bGuests = Number(b.order?.guestCount ?? 0)
      if (tableSortMode === "guests") {
        if (bGuests !== aGuests) return bGuests - aGuests
        if (bAmount !== aAmount) return bAmount - aAmount
      } else {
        if (bAmount !== aAmount) return bAmount - aAmount
        if (bGuests !== aGuests) return bGuests - aGuests
      }
      return String(a.name || "").localeCompare(String(b.name || ""), "ko")
    })
  }, [currentStore?.tables, tableSortMode])
  const byStoreRows = useMemo(
    () =>
      mergeRealtimeStoreSalesRows({
        operationalStores,
        storeSalesMap,
        storeCodes: storeListCodes,
        legacyToCanonical,
        formatStoreLabel,
      }),
    [operationalStores, storeSalesMap, storeListCodes, legacyToCanonical, formatStoreLabel]
  )
  const byStoreTotal = useMemo(
    () =>
      byStoreRows.reduce(
        (acc, row) => {
          acc.paid += row.paid
          acc.tableTotal += row.tableTotal
          return acc
        },
        { paid: 0, tableTotal: 0 }
      ),
    [byStoreRows]
  )

  const summaryTableTotal = useMemo(
    () =>
      computeRealtimeTableTotal({
        isAllStores: isAllStoresSelected,
        stores: operationalStores,
        currentStore,
        storeCodes: storeListCodes,
        legacyToCanonical,
      }),
    [isAllStoresSelected, operationalStores, currentStore, storeListCodes, legacyToCanonical]
  )

  const expectedTableAddend = useMemo(
    () =>
      computeRealtimeExpectedAddend({
        isAllStores: isAllStoresSelected,
        stores: operationalStores,
        currentStore,
        storeCodes: storeListCodes,
        legacyToCanonical,
      }),
    [isAllStoresSelected, operationalStores, currentStore, storeListCodes, legacyToCanonical]
  )

  const expectedTotal =
    todaySales != null ? Number(todaySales.completedTotal ?? 0) + expectedTableAddend : null

  const summaryMetricsGrid = (
    <div className="mt-4 space-y-2">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-background/60 px-2 py-2">
          <p className="text-[10px] text-muted-foreground">{t("mobileStoreSalesCompletedOrders")}</p>
          <p className="text-lg font-semibold tabular-nums">{todaySales?.completedCount ?? "—"}</p>
        </div>
        <div className="rounded-lg bg-background/60 px-2 py-2">
          <p className="text-[10px] text-muted-foreground">{t("mobileStoreSalesPendingOrders")}</p>
          <p className="text-lg font-semibold tabular-nums">{todaySales?.pendingCount ?? "—"}</p>
        </div>
        <div className="rounded-lg bg-background/60 px-2 py-2">
          <p className="text-[10px] text-muted-foreground">
            {tr("mobileStoreSalesUnpaidTableTotal", "미결제 테이블")}
          </p>
          <p className="text-sm font-semibold tabular-nums leading-snug">
            {loadingTables ? "—" : formatBahtInt(summaryTableTotal)}
          </p>
        </div>
      </div>
      <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2 text-center">
        <p className="text-[10px] text-muted-foreground">
          {tr("mobileStoreSalesExpectedTotal", "예상 총액")}
          <span className="ml-1 text-muted-foreground/80">
            ({tr("mobileStoreSalesExpectedTotalHint", "확정 + 미확정 좌석")})
          </span>
        </p>
        <p className="text-base font-semibold tabular-nums text-foreground">
          {expectedTotal == null || loadingTables ? "—" : formatBahtInt(expectedTotal)}
        </p>
      </div>
    </div>
  )

  const cashMixPieRows = useMemo(() => {
    if (!todaySales) return []
    const cash = Math.max(0, Number(todaySales.completedCash ?? 0))
    const total = Math.max(0, Number(todaySales.completedTotal ?? 0))
    const other = Math.max(0, total - cash)
    if (cash <= 0 && other <= 0) return []
    return [
      { key: "cash", label: tr("mobileStoreSalesCashTotal", "현금"), value: cash },
      { key: "other", label: tr("adminRealtimeSalesNonCash", "현금 외"), value: other },
    ].filter((r) => r.value > 0)
  }, [todaySales, tr])

  const orderCountBarRows = useMemo(() => {
    if (!todaySales) return []
    return [
      {
        key: "completed",
        label: tr("mobileStoreSalesCompletedOrders", "완료 주문"),
        count: Number(todaySales.completedCount ?? 0),
      },
      {
        key: "pending",
        label: tr("mobileStoreSalesPendingOrders", "조리 진행중"),
        count: Number(todaySales.pendingCount ?? 0),
      },
    ]
  }, [todaySales, tr])

  const byStoreChartRows = useMemo(
    () =>
      byStoreRows.map((r) => ({
        storeId: r.storeId,
        storeDisplayName: r.storeDisplayName,
        paid: r.paid,
        tableTotal: r.tableTotal,
      })),
    [byStoreRows]
  )

  const tableAmountBarRows = useMemo(
    () =>
      sortedTables
        .map((tbl) => ({
          name: String(tbl.name || "—"),
          amount: Number(tbl.order?.total ?? 0),
          guests: Number(tbl.order?.guestCount ?? 0),
        }))
        .filter((r) => r.amount > 0)
        .slice(0, 24),
    [sortedTables]
  )

  const [manualBusy, setManualBusy] = useState(false)

  const handleManualRefresh = useCallback(async () => {
    if (manualBusy) return
    setManualBusy(true)
    try {
      await refreshRealtimeSection()
    } finally {
      setManualBusy(false)
    }
  }, [manualBusy, refreshRealtimeSection])

  useEffect(() => {
    if (refreshToken == null || refreshToken <= 0) return
    /** 부모 runRefresh/검색이 이미 refetchStores 함 — 여기서는 당일 매출만 강제 재조회 */
    void loadTodaySales({ forceNetwork: true })
  }, [refreshToken, loadTodaySales])

  const refreshLatest = useRef(refreshRealtimeSection)
  refreshLatest.current = refreshRealtimeSection

  useLayoutEffect(() => {
    if (!onRegisterRefresh) return
    onRegisterRefresh(() => refreshLatest.current())
    return () => {
      onRegisterRefresh(() => Promise.resolve())
    }
  }, [onRegisterRefresh])

  return (
    <div className={cn("space-y-4", className)}>
      {showInlineRefresh ? (
        showHeaderBadge ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge
              variant="outline"
              className="gap-1 border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-200"
            >
              <Radio className="h-3 w-3" aria-hidden />
              {t("mobileStoreSalesRealtimeBadge")}
            </Badge>
            <LiveSalesSearchButton
              onClick={handleManualRefresh}
              busy={manualBusy}
              label={t("search")}
              title={t("mobileStoreSalesRefresh")}
            />
          </div>
        ) : (
          <div className="flex justify-end">
            <LiveSalesSearchButton
              onClick={handleManualRefresh}
              busy={manualBusy}
              label={t("search")}
              title={t("mobileStoreSalesRefresh")}
            />
          </div>
        )
      ) : null}

      <section className="rounded-xl border border-border/80 bg-gradient-to-br from-primary/10 via-card to-card p-4 shadow-sm">
        <p className="text-xs font-medium text-muted-foreground">
          {tr("mobileStoreSalesConfirmedTotal", "확정 매출")}
        </p>
        <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-foreground sm:text-4xl">
          {todaySales != null ? formatBahtInt(todaySales.completedTotal) : "—"}
        </p>
        {summaryMetricsGrid}
        {showSalesCharts ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {cashMixPieRows.length > 0 ? (
              <div>
                <p className="mb-2 text-[11px] font-medium text-muted-foreground">
                  {tr("adminRealtimeSalesCashMix", "실매출 구성 (현금/기타)")}
                </p>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={cashMixPieRows}
                        dataKey="value"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        outerRadius={72}
                        label={({ name, percent }) =>
                          `${String(name ?? "")} ${((percent ?? 0) * 100).toFixed(0)}%`
                        }
                      >
                        {cashMixPieRows.map((r, i) => (
                          <Cell key={r.key} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatBahtInt(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : null}
            <div>
              <p className="mb-2 text-[11px] font-medium text-muted-foreground">
                {tr("adminRealtimeSalesOrderCounts", "주문 건수 (실시간)")}
              </p>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={orderCountBarRows}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, ...ERP_NUMERIC_CHART_TICK }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#22c55e" name={tr("salesOccupancy", "주문건수")} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {isAllStoresSelected && !hideByStoreSection ? (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              {t("mobileStoreSalesByStoreHeading")}
              {loadingTables ? (
                <span className="text-xs font-normal text-muted-foreground">{t("loading")}</span>
              ) : null}
            </h2>
          </div>
          {byStoreRows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
              {t("mobileStoreSalesByStoreEmpty")}
            </p>
          ) : showSalesCharts ? (
            <div className="space-y-4">
              <div className="h-[min(320px,45vh)] rounded-xl border border-border/70 bg-card p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  {tr("adminRealtimeSalesByStorePaid", "매장별 실매출 (막대)")}
                </p>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={byStoreChartRows} layout="vertical" margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" {...chartYAxisProps} />
                    <YAxis dataKey="storeDisplayName" type="category" width={108} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => formatBahtInt(v)} />
                    <Legend />
                    <Bar
                      dataKey="paid"
                      fill="#f97316"
                      name={t("mobileStoreSalesPaidAmount")}
                      radius={[0, 4, 4, 0]}
                    />
                    <Bar
                      dataKey="tableTotal"
                      fill="#3b82f6"
                      name={tr("mobileStoreSalesUnpaidTableTotal", "미결제 테이블")}
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {byStoreChartRows.length > 0 ? (
                <div className="h-[240px] rounded-xl border border-border/70 bg-card p-3">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">
                    {tr("adminRealtimeSalesByStoreShare", "매장별 실매출 비중")}
                  </p>
                  <ResponsiveContainer width="100%" height="88%">
                    <PieChart>
                      <Pie
                        data={byStoreChartRows}
                        dataKey="paid"
                        nameKey="storeDisplayName"
                        cx="50%"
                        cy="50%"
                        outerRadius={88}
                        label={({ name, percent }) =>
                          `${String(name ?? "")} ${((percent ?? 0) * 100).toFixed(0)}%`
                        }
                      >
                        {byStoreChartRows.map((r, i) => (
                          <Cell key={`${r.storeId}-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatBahtInt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex max-h-[min(52vh,640px)] flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
              <div className="grid shrink-0 grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b border-border/60 bg-muted/40 px-3 py-2 text-[11px] font-semibold text-muted-foreground">
                <p className="min-w-0">{t("mobileStoreSalesStoreName")}</p>
                <p className="min-w-0 text-right">{t("mobileStoreSalesPaidAmount")}</p>
                <p className="min-w-0 text-right">
                  {tr("mobileStoreSalesUnpaidTableTotal", "미결제 테이블")}
                </p>
              </div>
              <ul className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto overscroll-contain">
                {byStoreRows.map((row) => (
                  <li
                    key={row.storeId}
                    className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-3 py-2 text-sm"
                  >
                    <p className="min-w-0 truncate font-medium text-foreground" title={row.storeId}>
                      {row.storeDisplayName}
                    </p>
                    <p className="min-w-0 truncate text-right tabular-nums font-semibold text-orange-600 dark:text-orange-400">
                      {formatBahtInt(row.paid)}
                    </p>
                    <p className="min-w-0 truncate text-right tabular-nums font-medium text-foreground">
                      {formatBahtInt(row.tableTotal)}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="relative z-10 grid shrink-0 grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-t-2 border-border/80 bg-card px-3 py-2.5 text-xs font-semibold shadow-[0_-6px_12px_-8px_rgba(0,0,0,0.18)]">
                <p className="min-w-0">{t("mobileStoreSalesSummaryTotal")}</p>
                <p className="min-w-0 truncate text-right tabular-nums text-orange-600 dark:text-orange-400">
                  {formatBahtInt(byStoreTotal.paid)}
                </p>
                <p className="min-w-0 truncate text-right tabular-nums text-foreground">
                  {formatBahtInt(byStoreTotal.tableTotal)}
                </p>
              </div>
            </div>
          )}
        </section>
      ) : (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              {t("mobileStoreSalesTableHeading")}
              {loadingTables ? (
                <span className="text-xs font-normal text-muted-foreground">{t("loading")}</span>
              ) : null}
            </h2>
            <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
              <button
                type="button"
                onClick={() => setTableSortMode("amount")}
                className={cn(
                  "rounded px-2 py-1 text-[11px] font-medium",
                  tableSortMode === "amount"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t("mobileStoreSalesSortByAmount")}
              </button>
              <button
                type="button"
                onClick={() => setTableSortMode("guests")}
                className={cn(
                  "rounded px-2 py-1 text-[11px] font-medium",
                  tableSortMode === "guests"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t("mobileStoreSalesSortByGuests")}
              </button>
            </div>
          </div>
          {sortedTables.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
              {t("mobileStoreSalesTableEmpty")}
            </p>
          ) : showSalesCharts ? (
            tableAmountBarRows.length > 0 ? (
            <div className="h-[min(360px,50vh)] rounded-xl border border-border/70 bg-card p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tableAmountBarRows} layout="vertical" margin={{ left: 4, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" {...chartYAxisProps} />
                  <YAxis dataKey="name" type="category" width={72} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(v: number, _name, item) => {
                      const payload = item?.payload as { guests?: number } | undefined
                      const guests = payload?.guests ?? 0
                      return [
                        `${formatBahtInt(v)} (${tr("mobileStoreSalesGuests", "손님")} ${guests})`,
                        tr("mobileStoreSalesOrderAmt", "주문금액"),
                      ]
                    }}
                  />
                  <Bar dataKey="amount" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            ) : (
              <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                {t("mobileStoreSalesTableEmpty")}
              </p>
            )
          ) : (
            <ul className="flex flex-col gap-2">
              {sortedTables.map((tbl) => {
                const guests = Number(tbl.order?.guestCount ?? 0)
                const amount = Number(tbl.order?.total ?? 0)
                return (
                  <li
                    key={tbl.id || tbl.name}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-card px-3 py-3 shadow-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{tbl.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("mobileStoreSalesGuests")}: {guests}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] text-muted-foreground">{t("mobileStoreSalesOrderAmt")}</p>
                      <p className="text-sm font-bold tabular-nums text-foreground">{formatBahtInt(amount)}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
