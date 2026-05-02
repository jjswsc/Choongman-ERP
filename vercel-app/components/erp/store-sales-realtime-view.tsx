"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Radio, Search } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getPosTodaySales } from "@/lib/api-client"
import type { Store } from "@/lib/pos-types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const ALL_STORE_VALUE = "All"

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

export type StoreSalesRefetchOptions = { scope?: "all" | "current"; storeCode?: string }

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
  onRegisterRefresh?: (refresh: () => void) => void
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
  className,
}: StoreSalesRealtimeViewProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const isAllStoresSelected = effectiveStoreCode === ALL_STORE_VALUE

  const [todaySales, setTodaySales] = useState<TodaySalesSummary | null>(null)
  const [storeSalesMap, setStoreSalesMap] = useState<Record<string, TodaySalesSummary>>({})
  const [tableSortMode, setTableSortMode] = useState<"amount" | "guests">("amount")

  const loadTodaySales = useCallback(() => {
    if (!effectiveStoreCode) return
    if (!isAllStoresSelected) {
      getPosTodaySales({ storeCode: effectiveStoreCode })
        .then((data) => {
          setTodaySales(data)
          setStoreSalesMap((prev) => ({ ...prev, [effectiveStoreCode]: data }))
        })
        .catch(() => setTodaySales(null))
      return
    }
    const storeCodes = stores
      .map((store) => String(store.id || "").trim())
      .filter(Boolean)
    if (!storeCodes.length) {
      setTodaySales({ completedCount: 0, completedTotal: 0, completedCash: 0, pendingCount: 0 })
      setStoreSalesMap({})
      return
    }
    Promise.all(
      storeCodes.map((code) =>
        getPosTodaySales({ storeCode: code }).then(
          (data) => [code, data] as const,
          () =>
            [
              code,
              { completedCount: 0, completedTotal: 0, completedCash: 0, pendingCount: 0 },
            ] as const
        )
      )
    )
      .then((rows) => {
        const nextMap: Record<string, TodaySalesSummary> = {}
        const total = { completedCount: 0, completedTotal: 0, completedCash: 0, pendingCount: 0 }
        for (const [code, data] of rows) {
          nextMap[code] = data
          total.completedCount += Number(data.completedCount ?? 0)
          total.completedTotal += Number(data.completedTotal ?? 0)
          total.completedCash += Number(data.completedCash ?? 0)
          total.pendingCount += Number(data.pendingCount ?? 0)
        }
        setStoreSalesMap(nextMap)
        setTodaySales(total)
      })
      .catch(() => {
        setStoreSalesMap({})
        setTodaySales(null)
      })
  }, [effectiveStoreCode, isAllStoresSelected, stores])

  const refreshRealtimeSection = useCallback(() => {
    loadTodaySales()
    if (effectiveStoreCode && !isAllStoresSelected) {
      void refetchStores({ storeCode: effectiveStoreCode })
      return
    }
    void refetchStores({ scope: "all" })
  }, [loadTodaySales, refetchStores, effectiveStoreCode, isAllStoresSelected])

  useEffect(() => {
    if (!effectiveStoreCode) return
    refreshRealtimeSection()
  }, [effectiveStoreCode, refreshRealtimeSection])

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
  const byStoreRows = useMemo(() => {
    return stores
      .map((store) => {
        const paid = Number(storeSalesMap[store.id]?.completedTotal ?? 0)
        const tableTotal = Number(
          (store.tables || []).reduce((acc, tbl) => acc + Number(tbl.order?.total ?? 0), 0)
        )
        return {
          storeId: store.id,
          paid,
          tableTotal,
        }
      })
      .sort((a, b) => {
        if (b.paid !== a.paid) return b.paid - a.paid
        if (b.tableTotal !== a.tableTotal) return b.tableTotal - a.tableTotal
        return String(a.storeId || "").localeCompare(String(b.storeId || ""), "ko")
      })
  }, [stores, storeSalesMap])
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

  const handleManualRefresh = useCallback(() => {
    refreshRealtimeSection()
  }, [refreshRealtimeSection])

  const refreshLatest = useRef(refreshRealtimeSection)
  refreshLatest.current = refreshRealtimeSection

  useLayoutEffect(() => {
    if (!onRegisterRefresh) return
    onRegisterRefresh(() => refreshLatest.current())
    return () => {
      onRegisterRefresh(() => {})
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={handleManualRefresh}
              disabled={loadingTables}
              title={t("mobileStoreSalesRefresh")}
            >
              <Search className="h-4 w-4" />
              {t("search")}
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={handleManualRefresh}
              disabled={loadingTables}
              title={t("mobileStoreSalesRefresh")}
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
        )
      ) : null}

      <p className="text-xs leading-relaxed text-muted-foreground">{t("mobileStoreSalesSub")}</p>

      <section className="rounded-xl border border-border/80 bg-gradient-to-br from-primary/10 via-card to-card p-4 shadow-sm">
        <p className="text-xs font-medium text-muted-foreground">{t("mobileStoreSalesTodayTotal")}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-foreground sm:text-4xl">
          {todaySales != null ? formatBahtInt(todaySales.completedTotal) : "—"}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-background/60 px-2 py-2">
            <p className="text-[10px] text-muted-foreground">{t("mobileStoreSalesCompletedOrders")}</p>
            <p className="text-lg font-semibold tabular-nums">{todaySales?.completedCount ?? "—"}</p>
          </div>
          <div className="rounded-lg bg-background/60 px-2 py-2">
            <p className="text-[10px] text-muted-foreground">{t("mobileStoreSalesPendingOrders")}</p>
            <p className="text-lg font-semibold tabular-nums">{todaySales?.pendingCount ?? "—"}</p>
          </div>
          <div className="rounded-lg bg-background/60 px-2 py-2">
            <p className="text-[10px] text-muted-foreground">{t("mobileStoreSalesCashTotal")}</p>
            <p className="text-sm font-semibold tabular-nums leading-snug">
              {todaySales != null ? formatBahtInt(todaySales.completedCash) : "—"}
            </p>
          </div>
        </div>
      </section>

      {isAllStoresSelected ? (
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
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
              <div className="grid grid-cols-[1.5fr_1fr_1fr] gap-2 border-b border-border/60 bg-muted/40 px-3 py-2 text-[11px] font-semibold text-muted-foreground">
                <p>{t("mobileStoreSalesStoreName")}</p>
                <p className="text-right">{t("mobileStoreSalesPaidAmount")}</p>
                <p className="text-right">{t("mobileStoreSalesTableTotalAmount")}</p>
              </div>
              <div className="grid grid-cols-[1.5fr_1fr_1fr] gap-2 border-b border-border/60 bg-primary/5 px-3 py-2 text-xs font-semibold">
                <p>{t("mobileStoreSalesSummaryTotal")}</p>
                <p className="text-right tabular-nums text-orange-600 dark:text-orange-400">
                  {formatBahtInt(byStoreTotal.paid)}
                </p>
                <p className="text-right tabular-nums text-foreground">{formatBahtInt(byStoreTotal.tableTotal)}</p>
              </div>
              <ul className="max-h-[52vh] divide-y divide-border/60 overflow-auto">
                {byStoreRows.map((row) => (
                  <li key={row.storeId} className="grid grid-cols-[1.5fr_1fr_1fr] gap-2 px-3 py-2 text-sm">
                    <p className="truncate font-medium text-foreground">{row.storeId}</p>
                    <p className="text-right tabular-nums font-semibold text-orange-600 dark:text-orange-400">
                      {formatBahtInt(row.paid)}
                    </p>
                    <p className="text-right tabular-nums font-medium text-foreground">{formatBahtInt(row.tableTotal)}</p>
                  </li>
                ))}
              </ul>
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
