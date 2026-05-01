"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { RefreshCw, Radio } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getPosTodaySales } from "@/lib/api-client"
import { subscribePosOrdersInsert, subscribePosOrdersUpdate } from "@/lib/supabase-client"
import type { Store } from "@/lib/pos-types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn, formatBahtNum } from "@/lib/utils"

function rowMatchesPosStore(row: Record<string, unknown>, storeId: string): boolean {
  const rowStore = String(row.store_code ?? "").trim()
  if (!rowStore) return false
  const variants = [
    storeId,
    storeId.startsWith("CM ") ? storeId.slice(3).trim() : `CM ${storeId}`.trim(),
    storeId.replace(/^CM\s+/i, ""),
  ].filter(Boolean)
  return variants.some((v) => v && (rowStore === v || rowStore.toLowerCase() === v.toLowerCase()))
}

export type StoreSalesRefetchOptions = { scope?: "all" | "current"; storeCode?: string }

export type StoreSalesRealtimeViewProps = {
  effectiveStoreCode: string
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

  const [todaySales, setTodaySales] = useState<{
    completedCount: number
    completedTotal: number
    completedCash: number
    pendingCount: number
  } | null>(null)
  const [tableSortMode, setTableSortMode] = useState<"amount" | "guests">("amount")

  const loadTodaySales = useCallback(() => {
    if (!effectiveStoreCode) return
    getPosTodaySales({ storeCode: effectiveStoreCode })
      .then(setTodaySales)
      .catch(() => setTodaySales(null))
  }, [effectiveStoreCode])

  const refreshRealtimeSection = useCallback(() => {
    loadTodaySales()
    if (effectiveStoreCode) {
      void refetchStores({ storeCode: effectiveStoreCode })
    }
  }, [loadTodaySales, refetchStores, effectiveStoreCode])

  useEffect(() => {
    if (!effectiveStoreCode) return
    refreshRealtimeSection()
    const id = window.setInterval(refreshRealtimeSection, 15000)
    return () => window.clearInterval(id)
  }, [effectiveStoreCode, refreshRealtimeSection])

  useEffect(() => {
    if (!effectiveStoreCode) return
    const onInsert = (payload: { new?: Record<string, unknown> }) => {
      const row = payload?.new
      if (!row || !rowMatchesPosStore(row, effectiveStoreCode)) return
      void refetchStores({ storeCode: effectiveStoreCode })
      loadTodaySales()
    }
    const onUpdate = (payload: { new?: Record<string, unknown> }) => {
      const row = payload?.new
      if (!row || !rowMatchesPosStore(row, effectiveStoreCode)) return
      void refetchStores({ storeCode: effectiveStoreCode })
      loadTodaySales()
    }
    const ch1 = subscribePosOrdersInsert(onInsert)
    const ch2 = subscribePosOrdersUpdate(onUpdate)
    return () => {
      ch1?.unsubscribe()
      ch2?.unsubscribe()
    }
  }, [effectiveStoreCode, refetchStores, loadTodaySales])

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
              <RefreshCw className={cn("h-4 w-4", loadingTables && "animate-spin")} />
              {t("mobileStoreSalesRefresh")}
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
              <RefreshCw className={cn("h-4 w-4", loadingTables && "animate-spin")} />
            </Button>
          </div>
        )
      ) : null}

      <p className="text-xs leading-relaxed text-muted-foreground">{t("mobileStoreSalesSub")}</p>

      <section className="rounded-xl border border-border/80 bg-gradient-to-br from-primary/10 via-card to-card p-4 shadow-sm">
        <p className="text-xs font-medium text-muted-foreground">{t("mobileStoreSalesTodayTotal")}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-foreground sm:text-4xl">
          {todaySales != null ? `${formatBahtNum(todaySales.completedTotal)} ฿` : "—"}
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
              {todaySales != null ? `${formatBahtNum(todaySales.completedCash)} ฿` : "—"}
            </p>
          </div>
        </div>
      </section>

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
                    <p className="text-sm font-bold tabular-nums text-foreground">{formatBahtNum(amount)} ฿</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
