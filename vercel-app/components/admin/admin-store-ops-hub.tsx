"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ClipboardCheck, Copy, MapPin, MessageSquareWarning, RefreshCw, Scale, Wrench } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getStoreOpsAlertSummary,
  getStoreVisitTodaySnapshot,
  getStockTakeKpi,
  type StoreOpsAlertSummary,
  type StockTakeKpiResponse,
} from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { buildStockTakeOpsLineCopy } from "@/lib/stock-take-kpi"

function stockTakeHref(store: string, asOfYmd: string) {
  const q = new URLSearchParams({ store, asOf: asOfYmd })
  return `/admin/stock?${q.toString()}`
}

function varianceHref(store: string, startYmd: string, endYmd: string) {
  const q = new URLSearchParams({ tab: "variance", store, start: startYmd, end: endYmd })
  return `/admin/pos-cost-analysis?${q.toString()}`
}

export function AdminStoreOpsHub() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [summary, setSummary] = useState<StoreOpsAlertSummary | null>(null)
  const [stockTake, setStockTake] = useState<StockTakeKpiResponse | null>(null)
  const [activeVisits, setActiveVisits] = useState(0)
  const [copyMsg, setCopyMsg] = useState("")
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, visit, take] = await Promise.all([
        getStoreOpsAlertSummary(),
        getStoreVisitTodaySnapshot({
          userStore: auth?.store || "",
          userRole: auth?.role || "",
        }).catch(() => ({ active: [] as { name: string }[] })),
        getStockTakeKpi().catch(() => null),
      ])
      setSummary(s)
      setActiveVisits(Array.isArray(visit.active) ? visit.active.length : 0)
      setStockTake(take)
    } catch {
      setSummary(null)
      setActiveVisits(0)
      setStockTake(null)
    } finally {
      setLoading(false)
    }
  }, [auth?.store, auth?.role])

  useEffect(() => {
    void load()
  }, [load])

  const missingStores = useMemo(
    () => (stockTake?.stores || []).filter((s) => !s.stockTakeDone),
    [stockTake]
  )

  const cards = [
    {
      label: t("store_ops_kpi_unchecked"),
      value: summary?.uncheckedToday ?? "—",
      sub: summary ? `${summary.checkedToday}/${summary.totalStores}` : "",
      href: "/admin/store-check",
      cta: t("store_ops_go_check"),
      icon: ClipboardCheck,
      className: "border-amber-500/40",
    },
    {
      label: t("store_ops_kpi_stale_repairs"),
      value: summary?.staleRepairs ?? "—",
      sub: t("repair_stale_days"),
      href: "/admin/store-repairs",
      cta: t("store_ops_go_repairs"),
      icon: Wrench,
      className: "border-red-500/40",
    },
    {
      label: t("store_ops_kpi_open_complaints"),
      value: summary?.openComplaints ?? "—",
      sub: t("complaint_status_recv"),
      href: "/admin/complaints",
      cta: t("store_ops_go_complaints"),
      icon: MessageSquareWarning,
      className: "border-orange-500/40",
    },
    {
      label: t("store_ops_kpi_active_visits"),
      value: activeVisits,
      sub: summary?.today ?? "",
      href: "/admin/store-visit",
      cta: t("store_ops_go_visits"),
      icon: MapPin,
      className: "border-emerald-500/40",
    },
    {
      label: t("store_ops_kpi_stock_take"),
      value: stockTake?.missingCount ?? "—",
      sub: stockTake
        ? `${stockTake.doneCount}/${stockTake.totalStores} · ${stockTake.yearMonth}`
        : "",
      href: "/admin/stock",
      cta: t("store_ops_go_stock_take"),
      icon: Scale,
      className: stockTake?.inDueWindow ? "border-violet-600/50" : "border-violet-500/40",
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? t("loading") : t("store_refresh")}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((k) => {
          const Icon = k.icon
          return (
            <Card key={k.label} className={`border-l-4 ${k.className}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">{k.label}</p>
                    <p className="text-2xl font-bold tabular-nums">{k.value}</p>
                    {k.sub ? <p className="text-[11px] text-muted-foreground mt-0.5">{k.sub}</p> : null}
                  </div>
                  <Icon className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden />
                </div>
                <Button asChild variant="secondary" size="sm" className="h-8 w-full text-xs">
                  <Link href={k.href}>{k.cta}</Link>
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {stockTake ? (
        <Card className="border-l-4 border-violet-500/40">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-sm font-medium">
                  {t("store_ops_stock_take_month")} {stockTake.yearMonth}
                  {stockTake.inDueWindow ? (
                    <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800 dark:bg-violet-900 dark:text-violet-100">
                      {t("store_ops_stock_take_due")}
                    </span>
                  ) : null}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {t("store_ops_stock_take_window")}: {stockTake.windowStart} ~ {stockTake.windowEnd}
                </p>
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                {t("store_ops_kpi_stock_take_done")} {stockTake.doneCount}/{stockTake.totalStores}
              </p>
            </div>
            {missingStores.length ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">{t("store_ops_stock_take_missing")}</p>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => {
                        const dueStart = stockTake.dueStartYmd || stockTake.windowStart
                        const dueEnd = stockTake.dueEndYmd || stockTake.windowEnd
                        const text = buildStockTakeOpsLineCopy({
                          yearMonth: stockTake.yearMonth,
                          endYmd: stockTake.endYmd,
                          dueStartYmd: dueStart,
                          dueEndYmd: dueEnd,
                          missingStores: missingStores.map((r) => r.store),
                          lang,
                        })
                        void navigator.clipboard.writeText(text).then(
                          () => setCopyMsg(t("store_ops_stock_take_copied")),
                          () => setCopyMsg(t("store_ops_stock_take_copy_fail"))
                        )
                      }}
                    >
                      <Copy className="mr-1 h-3 w-3" aria-hidden />
                      {t("store_ops_stock_take_copy_line")}
                    </Button>
                    <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-[11px]">
                      <Link href="/admin/notices?tab=auto">{t("store_ops_stock_take_auto_notice")}</Link>
                    </Button>
                  </div>
                </div>
                {copyMsg ? <p className="text-[11px] text-muted-foreground">{copyMsg}</p> : null}
                <ul className="space-y-1.5">
                  {missingStores.slice(0, 40).map((row) => (
                    <li
                      key={row.store}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs"
                    >
                      <span className="font-medium">{row.store}</span>
                      <span className="flex gap-1">
                        <Button asChild variant="outline" size="sm" className="h-7 px-2 text-[11px]">
                          <Link href={stockTakeHref(row.store, stockTake.endYmd)}>
                            {t("store_ops_go_stock_take")}
                          </Link>
                        </Button>
                        <Button asChild variant="secondary" size="sm" className="h-7 px-2 text-[11px]">
                          <Link href={varianceHref(row.store, stockTake.startYmd, stockTake.endYmd)}>
                            {t("store_ops_go_variance")}
                          </Link>
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("store_ops_stock_take_empty")}</p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
