"use client"

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, RefreshCw, Radio } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { canViewMobileStoreSales, isOfficeRole, isOfficeStore } from "@/lib/permissions"
import { usePosStore } from "@/hooks/use-pos-store"
import { getPosTodaySales } from "@/lib/api-client"
import { subscribePosOrdersInsert, subscribePosOrdersUpdate } from "@/lib/supabase-client"
import { StoreViewProvider, useStoreView } from "@/lib/store-view-context"
import { MobileStoreSelectorBar } from "@/components/erp/mobile-store-selector-bar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn, formatBahtNum } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SalesManagementTab } from "@/components/tabs/sales-management-tab"
import { Skeleton } from "@/components/ui/skeleton"

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

function SalesTabFallback() {
  return (
    <div className="space-y-4 rounded-xl border border-border/80 bg-card p-4" aria-hidden>
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-52 w-full" />
    </div>
  )
}

function StoreSalesBody() {
  const { auth, initialized } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { viewStore } = useStoreView()

  const isOfficeSelector =
    Boolean(auth) && (isOfficeRole(auth?.role || "") || isOfficeStore(auth?.store || ""))

  const effectiveStoreCode = useMemo(() => {
    if (isOfficeSelector && viewStore) return viewStore.trim()
    return (auth?.store || "").trim()
  }, [isOfficeSelector, viewStore, auth?.store])

  const {
    stores,
    currentStore,
    currentStoreId,
    setCurrentStoreId,
    loadingTables,
    refetchStores,
  } = usePosStore()

  const [todaySales, setTodaySales] = useState<{
    completedCount: number
    completedTotal: number
    completedCash: number
    pendingCount: number
  } | null>(null)
  const [tableSortMode, setTableSortMode] = useState<"amount" | "guests">("amount")

  const allowed = Boolean(auth) && canViewMobileStoreSales(auth?.role || "")

  useLayoutEffect(() => {
    if (typeof window === "undefined") return
    if (!initialized) return
    if (!auth) {
      window.location.replace("/login")
      return
    }
    if (!canViewMobileStoreSales(auth.role || "")) {
      window.location.replace("/")
    }
  }, [initialized, auth])

  useEffect(() => {
    if (!effectiveStoreCode || !allowed) return
    if (!stores.some((s) => s.id === effectiveStoreCode)) return
    setCurrentStoreId(effectiveStoreCode)
  }, [effectiveStoreCode, stores, setCurrentStoreId, allowed])

  const loadTodaySales = useCallback(() => {
    if (!effectiveStoreCode) return
    getPosTodaySales({ storeCode: effectiveStoreCode })
      .then(setTodaySales)
      .catch(() => setTodaySales(null))
  }, [effectiveStoreCode])

  useEffect(() => {
    if (!effectiveStoreCode || !allowed) return
    loadTodaySales()
    const id = window.setInterval(loadTodaySales, 15000)
    return () => window.clearInterval(id)
  }, [effectiveStoreCode, allowed, loadTodaySales])

  useEffect(() => {
    if (!currentStoreId || !allowed) return
    const onInsert = (payload: { new?: Record<string, unknown> }) => {
      const row = payload?.new
      if (!row || !rowMatchesPosStore(row, currentStoreId)) return
      void refetchStores()
      loadTodaySales()
    }
    const onUpdate = (payload: { new?: Record<string, unknown> }) => {
      const row = payload?.new
      if (!row || !rowMatchesPosStore(row, currentStoreId)) return
      void refetchStores()
      loadTodaySales()
    }
    const ch1 = subscribePosOrdersInsert(onInsert)
    const ch2 = subscribePosOrdersUpdate(onUpdate)
    return () => {
      ch1?.unsubscribe()
      ch2?.unsubscribe()
    }
  }, [currentStoreId, allowed, refetchStores, loadTodaySales])

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
    void refetchStores()
    loadTodaySales()
  }, [refetchStores, loadTodaySales])

  if (!initialized || !auth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <p className="text-sm text-muted-foreground">{t("mobileStoreSalesNoAccess")}</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/">{t("mobileStoreSalesBackHome")}</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-background">
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b border-border/60 bg-card/90 px-3 py-3 backdrop-blur-md">
        <Button variant="ghost" size="icon" className="shrink-0" asChild>
          <Link href="/" aria-label={t("mobileStoreSalesBackHome")}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-bold tracking-tight">{t("mobileStoreSalesTitle")}</h1>
            <Badge variant="outline" className="shrink-0 gap-1 border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 text-[10px] font-semibold text-emerald-800 dark:text-emerald-200">
              <Radio className="h-3 w-3" aria-hidden />
              {t("mobileStoreSalesRealtimeBadge")}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">{currentStoreId || effectiveStoreCode}</p>
        </div>
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
      </header>

      {isOfficeSelector ? <MobileStoreSelectorBar /> : null}

      <main className="space-y-4 p-4 pb-10">
        <Tabs defaultValue="analytics" className="space-y-4">
          <TabsList className="grid h-10 w-full grid-cols-2">
            <TabsTrigger value="realtime">{t("mobileStoreSalesMenuRealtime")}</TabsTrigger>
            <TabsTrigger value="analytics">{t("mobileStoreSalesMenuManagement")}</TabsTrigger>
          </TabsList>

          <TabsContent value="realtime" className="space-y-4">
            <p className="text-xs leading-relaxed text-muted-foreground">{t("mobileStoreSalesSub")}</p>

            <section className="rounded-xl border border-border/80 bg-gradient-to-br from-primary/10 via-card to-card p-4 shadow-sm">
              <p className="text-xs font-medium text-muted-foreground">{t("mobileStoreSalesTodayTotal")}</p>
              <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-foreground">
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
              <div className="mb-3 flex items-center justify-between gap-2">
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
                    매출액순
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
                    손님수순
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
                          <p className="text-sm font-bold tabular-nums text-foreground">
                            {formatBahtNum(amount)} ฿
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("mobileStoreSalesManagementSub")}
            </p>
            <Suspense fallback={<SalesTabFallback />}>
              <SalesManagementTab offlineAware />
            </Suspense>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

export default function StoreSalesMobilePage() {
  return (
    <StoreViewProvider>
      <StoreSalesBody />
    </StoreViewProvider>
  )
}
