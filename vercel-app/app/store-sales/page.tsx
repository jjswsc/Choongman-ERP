"use client"

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import Link from "next/link"
import { ArrowLeft, RefreshCw, Radio } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { canViewMobileStoreSales, isOfficeRole, isOfficeStore } from "@/lib/permissions"
import { usePosStore } from "@/hooks/use-pos-store"
import { StoreViewProvider, useStoreView } from "@/lib/store-view-context"
import { MobileStoreSelectorBar } from "@/components/erp/mobile-store-selector-bar"
import { StoreSalesRealtimeView } from "@/components/erp/store-sales-realtime-view"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SalesManagementTab } from "@/components/tabs/sales-management-tab"
import { Skeleton } from "@/components/ui/skeleton"

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
  const realtimeRefreshRef = useRef<(() => void) | null>(null)

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
  const selectedStoreLabel = useMemo(() => {
    if (effectiveStoreCode === "All") return t("store_all_stores")
    return effectiveStoreCode || currentStoreId || t("store")
  }, [effectiveStoreCode, currentStoreId, t])

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

  const registerRealtimeRefresh = useCallback((fn: () => void) => {
    realtimeRefreshRef.current = fn
  }, [])

  const handleHeaderRefresh = useCallback(() => {
    realtimeRefreshRef.current?.()
  }, [])

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
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={handleHeaderRefresh}
          disabled={loadingTables}
          title={t("mobileStoreSalesRefresh")}
        >
          <RefreshCw className={cn("h-4 w-4", loadingTables && "animate-spin")} />
        </Button>
      </header>

      {isOfficeSelector ? <MobileStoreSelectorBar /> : null}

      <main className="space-y-4 p-4 pb-10">
        {/* 실시간 패널은 forceMount — 비활성 탭에서도 마운트 유지(헤더 새로고침·Realtime 구독이 동작). */}
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
              onRegisterRefresh={registerRealtimeRefresh}
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
