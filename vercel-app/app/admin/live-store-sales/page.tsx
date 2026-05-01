"use client"

import { useEffect, useMemo } from "react"
import Link from "next/link"
import { Radio } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { isOfficeRole, isOfficeStore } from "@/lib/permissions"
import { usePosStore } from "@/hooks/use-pos-store"
import { useStoreView } from "@/lib/store-view-context"
import { MobileStoreSelectorBar } from "@/components/erp/mobile-store-selector-bar"
import { StoreSalesRealtimeView } from "@/components/erp/store-sales-realtime-view"
import { HelpSumHowBlocks } from "@/components/erp/help-sum-how-blocks"
import { hrefToHelpSummaryKey } from "@/lib/admin-help-registry"
import { Button } from "@/components/ui/button"

const LIVE_STORE_SALES_HELP_SUM = hrefToHelpSummaryKey("/admin/live-store-sales")

export default function AdminLiveStoreSalesPage() {
  const { auth } = useAuth()
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

  useEffect(() => {
    if (!effectiveStoreCode) return
    if (!stores.some((s) => s.id === effectiveStoreCode)) return
    setCurrentStoreId(effectiveStoreCode)
  }, [effectiveStoreCode, stores, setCurrentStoreId])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Radio className="h-4 w-4 text-primary" />
              </div>
              <h1 className="text-xl font-bold tracking-tight">{t("adminLiveStoreSalesTitle")}</h1>
            </div>
            <p className="text-xs text-muted-foreground">
              {currentStoreId || effectiveStoreCode || "—"}
            </p>
            <HelpSumHowBlocks helpSumKey={LIVE_STORE_SALES_HELP_SUM} className="mt-2 max-w-xl" compact />
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href="/store-sales">{t("adminLiveStoreSalesOpenMobile")}</Link>
          </Button>
        </div>

        {isOfficeSelector ? <MobileStoreSelectorBar /> : null}

        <StoreSalesRealtimeView
          effectiveStoreCode={effectiveStoreCode}
          loadingTables={loadingTables}
          refetchStores={refetchStores}
          currentStore={currentStore}
          showInlineRefresh
          showHeaderBadge
        />
      </div>
    </div>
  )
}
