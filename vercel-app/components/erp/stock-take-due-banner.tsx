"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { getStockTakeKpi, type StockTakeKpiResponse } from "@/lib/api-client"
import { storesMatchForGradeLookup } from "@/lib/grade-store-key-variants"
import { isOfficeStockSelection } from "@/lib/stock-location-patterns"

export function StockTakeDueBanner({
  storeFilter,
  stockDateFilter,
  onUseMonthEnd,
  t,
}: {
  storeFilter: string
  stockDateFilter: string
  onUseMonthEnd: (ymd: string) => void
  t: (key: string) => string
}) {
  const [kpi, setKpi] = useState<StockTakeKpiResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    getStockTakeKpi()
      .then((d) => {
        if (!cancelled && d?.yearMonth) setKpi(d)
      })
      .catch(() => {
        if (!cancelled) setKpi(null)
      })
    return () => {
      cancelled = true
    }
  }, [storeFilter])

  if (!kpi?.inDueWindow) return null

  const store = String(storeFilter || "").trim()
  const dueStart = kpi.dueStartYmd || kpi.windowStart
  const dueEnd = kpi.dueEndYmd || kpi.windowEnd
  const dateOk = stockDateFilter.trim() === kpi.endYmd

  if (!store || isOfficeStockSelection(store)) {
    if (!kpi.missingCount) return null
    return (
      <div className="mb-4 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2.5 text-sm text-violet-950 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100">
        <p className="font-medium">
          {t("stockTakeDueBannerHqTitle")} {kpi.yearMonth}
        </p>
        <p className="mt-1 text-xs text-violet-800 dark:text-violet-200">
          {t("stockTakeDueBannerDue")
            .replace("{start}", dueStart)
            .replace("{end}", dueEnd)}{" "}
          {t("stockTakeDueBannerHqMissing").replace("{n}", String(kpi.missingCount))}
        </p>
        <Button asChild variant="secondary" size="sm" className="mt-2 h-8 text-xs">
          <Link href="/admin/store-ops">{t("stockTakeDueBannerGoOps")}</Link>
        </Button>
      </div>
    )
  }

  const row = kpi.stores.find((s) => storesMatchForGradeLookup(s.store, store))
  if (row?.stockTakeDone) return null

  return (
    <div className="mb-4 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2.5 text-sm text-violet-950 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100">
      <p className="font-medium">{t("stockTakeDueBannerStoreTitle")}</p>
      <p className="mt-1 text-xs text-violet-800 dark:text-violet-200">
        {t("stockTakeDueBannerDue").replace("{start}", dueStart).replace("{end}", dueEnd)}{" "}
        {t("stockTakeDueBannerAsOf").replace("{date}", kpi.endYmd)}
      </p>
      {!dateOk ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-2 h-8 text-xs"
          onClick={() => onUseMonthEnd(kpi.endYmd)}
        >
          {t("stockTakeDueBannerSetAsOf")}
        </Button>
      ) : (
        <p className="mt-1.5 text-xs">{t("stockTakeDueBannerAsOfReady")}</p>
      )}
    </div>
  )
}
