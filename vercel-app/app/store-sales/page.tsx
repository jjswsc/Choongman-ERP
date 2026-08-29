"use client"

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Radio } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { canViewMobileStoreSales, isOfficeRole, isOfficeStore } from "@/lib/permissions"
import { usePosStoreStandalone } from "@/hooks/use-pos-store"
import { useStoreList } from "@/lib/use-store-list"
import { StoreViewProvider, useStoreView } from "@/lib/store-view-context"
import { MobileStoreSelectorBar } from "@/components/erp/mobile-store-selector-bar"
import { StoreSalesRealtimeView } from "@/components/erp/store-sales-realtime-view"
import { LiveSalesSearchButton } from "@/components/erp/live-sales-search-button"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SalesManagementTab } from "@/components/tabs/sales-management-tab"
import { Skeleton } from "@/components/ui/skeleton"
import { getBangkokDateTimeString } from "@/lib/bangkok-time"

const ALL_STORE_VALUE = "All"
/** 헤더 검색 busy 상한 — 네트워크가 일부 매장에서 걸려도 버튼이 다시 눌리게 */
const SEARCH_BUSY_MAX_MS = 40_000

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
  const [searchBusy, setSearchBusy] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const searchGenRef = useRef(0)

  const isOfficeSelector =
    Boolean(auth) && (isOfficeRole(auth?.role || "") || isOfficeStore(auth?.store || ""))

  const effectiveStoreCode = useMemo(() => {
    if (isOfficeSelector && viewStore) return viewStore.trim()
    return (auth?.store || "").trim()
  }, [isOfficeSelector, viewStore, auth?.store])
  const { formatStoreLabel } = useStoreList()
  const {
    stores,
    currentStore,
    currentStoreId,
    setCurrentStoreId,
    loadingTables,
    refetchStores,
  } = usePosStoreStandalone()
  const selectedStoreLabel = useMemo(() => {
    if (effectiveStoreCode === ALL_STORE_VALUE) return t("store_all_stores")
    const code = effectiveStoreCode || currentStoreId
    return (code ? formatStoreLabel(code) : "") || t("store")
  }, [effectiveStoreCode, currentStoreId, formatStoreLabel, t])

  const allowed = Boolean(auth) && canViewMobileStoreSales(auth?.role || "")
  const isAllStores = effectiveStoreCode === ALL_STORE_VALUE

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
    if (isAllStores) return
    if (!stores.some((s) => s.id === effectiveStoreCode)) return
    setCurrentStoreId(effectiveStoreCode)
  }, [effectiveStoreCode, isAllStores, stores, setCurrentStoreId, allowed])

  const runSearch = useCallback(async () => {
    const gen = ++searchGenRef.current
    setSearchBusy(true)
    setRefreshToken((n) => n + 1)
    try {
      await Promise.race([
        Promise.resolve(
          refetchStores({
            scope: isAllStores ? "all" : "current",
            storeCode: isAllStores ? undefined : effectiveStoreCode,
            immediate: true,
            forceFullRefresh: true,
          })
        ),
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, SEARCH_BUSY_MAX_MS)
        }),
      ])
      if (gen === searchGenRef.current) setLastUpdated(new Date())
    } finally {
      if (gen === searchGenRef.current) setSearchBusy(false)
    }
  }, [refetchStores, isAllStores, effectiveStoreCode])

  useEffect(() => {
    if (typeof document === "undefined") return
    const onVisible = () => {
      if (document.visibilityState !== "visible") return
      void runSearch()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [runSearch])

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
          <p className="truncate text-xs text-muted-foreground">{selectedStoreLabel}</p>
          {lastUpdated ? (
            <p className="truncate text-[10px] text-muted-foreground">
              {t("liveStoreSalesLastUpdated")}: {getBangkokDateTimeString(lastUpdated)}
            </p>
          ) : null}
        </div>
        <LiveSalesSearchButton
          onClick={runSearch}
          busy={searchBusy}
          label={t("search")}
          title={t("search")}
          className="shrink-0"
        />
      </header>

      {isOfficeSelector ? <MobileStoreSelectorBar /> : null}

      <main className="space-y-4 p-4 pb-10">
        <Tabs defaultValue="realtime" className="space-y-4">
          <TabsList className="grid h-10 w-full grid-cols-2">
            <TabsTrigger value="realtime">{t("mobileStoreSalesMenuRealtime")}</TabsTrigger>
            <TabsTrigger value="analytics">{t("mobileStoreSalesMenuManagement")}</TabsTrigger>
          </TabsList>

          <TabsContent value="realtime" forceMount className="space-y-4 data-[state=inactive]:hidden">
            <StoreSalesRealtimeView
              effectiveStoreCode={effectiveStoreCode}
              stores={stores}
              loadingTables={loadingTables}
              refetchStores={refetchStores}
              currentStore={currentStore}
              refreshToken={refreshToken}
            />
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
