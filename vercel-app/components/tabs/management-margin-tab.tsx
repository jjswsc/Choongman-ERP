"use client"

import * as React from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getManagementMarginBridge, useStoreList, type ManagementMarginBridgeData } from "@/lib/api-client"
import { formatBahtInteger as formatBath } from "@/lib/financial-amount-format"
import { accountingFsDocumentCn, accountingFsTitleCn } from "@/lib/accounting-result-ui"
import { SalesCombinedDiscountEmbed } from "@/components/tabs/sales-discount-analytics-panel"
import {
  ManagementMarginWaterfall,
  type WaterfallStep,
} from "@/components/management-margin/management-margin-waterfall"
import {
  buildFinancialStatementsDrillUrl,
  buildSalesManagementDrillUrl,
  channelToOrderTypesParam,
} from "@/lib/management-margin-drill-links"
import { cn } from "@/lib/utils"
import { ChevronDown, ExternalLink, Loader2 } from "lucide-react"

type ManagementMarginTabProps = {
  yearMonthStart: string
  yearMonthEnd: string
  storeFilter: string
  queryToken: number
}

function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return `${n.toFixed(1)}%`
}

function momMetricLabel(key: string, t: (k: string) => string): string {
  const map: Record<string, string> = {
    netSales: "mmBridgeNetSales",
    totalDiscount: "mmBridgeTotalDiscount",
    theoreticalCost: "mmBridgeTheoreticalCost",
    contributionMargin: "mmBridgeContribution",
    netProfit: "pL_netProfit",
  }
  const i18nKey = map[key]
  return i18nKey ? t(i18nKey) : key
}

function channelLabel(
  channel: "dine_in" | "takeout" | "delivery" | "other",
  t: (k: string) => string
): string {
  const map = {
    dine_in: "mmBridgeChannelHall",
    takeout: "mmBridgeChannelTakeout",
    delivery: "mmBridgeChannelDelivery",
    other: "mmBridgeChannelOther",
  } as const
  return t(map[channel])
}

function formatMomDiff(diff: number): string {
  if (diff > 0) return `+${formatBath(diff)}`
  return formatBath(diff)
}

function dqReasonLabel(reason: string, t: (k: string) => string): string {
  const map: Record<string, string> = {
    truncated: "mmBridgeDqTruncated",
    bom_unmatched_high: "mmBridgeDqBomHigh",
    bom_unmatched: "mmBridgeDqBom",
    cogs_gap_high: "mmBridgeDqCogsGapHigh",
    cogs_gap: "mmBridgeDqCogsGap",
  }
  const key = map[reason]
  return key ? t(key) : reason
}

function MetricCard({
  label,
  value,
  sub,
  accent,
  highlight,
}: {
  label: string
  value: string
  sub?: string
  accent?: "rose" | "emerald" | "amber"
  highlight?: boolean
}) {
  const valueColor =
    accent === "rose"
      ? "text-rose-700 dark:text-rose-300"
      : accent === "emerald"
        ? "text-emerald-700 dark:text-emerald-300"
        : accent === "amber"
          ? "text-amber-700 dark:text-amber-300"
          : ""
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3",
        highlight && "border-2 border-primary/30 bg-primary/5"
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-bold font-erp-numeric tabular-nums", valueColor)}>{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{sub}</p> : null}
    </div>
  )
}

function DataQualityBadge({
  level,
  reasons,
  t,
}: {
  level: "good" | "caution" | "review"
  reasons: string[]
  t: (k: string) => string
}) {
  const badgeClass =
    level === "good"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
      : level === "caution"
        ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        : "border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
  return (
    <div className={cn("rounded-lg border px-3 py-2 text-xs", badgeClass)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{t("mmBridgeDqTitle")}</span>
        <span className="rounded-full bg-background/60 px-2 py-0.5 font-medium">
          {t(`mmBridgeDqLevel_${level}`)}
        </span>
      </div>
      {reasons.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5 text-[11px] opacity-90">
          {reasons.map((r) => (
            <li key={r}>· {dqReasonLabel(r, t)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function buildPosWaterfallSteps(
  data: ManagementMarginBridgeData,
  t: (k: string) => string
): WaterfallStep[] {
  const pos = data.pos!
  const theory = data.theoreticalCost!
  const discountUrl = buildSalesManagementDrillUrl({
    startStr: data.startStr,
    endStr: data.endStr,
    storeFilter: data.storeFilter,
  })
  return [
    {
      key: "gross",
      label: t("mmBridgeWaterfallGross"),
      amount: pos.grossSalesBeforeDiscount,
      kind: "start",
    },
    {
      key: "discount",
      label: t("mmBridgeTotalDiscount"),
      amount: pos.totalDiscount,
      kind: "subtract",
      href: discountUrl,
    },
    {
      key: "net",
      label: t("mmBridgeNetSales"),
      amount: pos.netSales,
      kind: "subtotal",
    },
    {
      key: "food",
      label: t("mmBridgeFoodCostTheory"),
      amount: theory.foodCost,
      kind: "subtract",
      href: "/admin/pos-cost-analysis",
    },
    {
      key: "pack",
      label: t("mmBridgePackagingCostTheory"),
      amount: theory.packagingCost,
      kind: "subtract",
      href: "/admin/pos-cost-analysis",
    },
    {
      key: "contrib",
      label: t("mmBridgeContribution"),
      amount: data.bridge.contributionMargin ?? 0,
      kind: "end",
    },
  ]
}

export function ManagementMarginTab({
  yearMonthStart,
  yearMonthEnd,
  storeFilter,
  queryToken,
}: ManagementMarginTabProps) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { storeLabels } = useStoreList()
  const [data, setData] = React.useState<ManagementMarginBridgeData | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const tr = React.useCallback(
    (key: string, fallback: string) => {
      const v = t(key)
      return v === key ? fallback : v
    },
    [t]
  )

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void getManagementMarginBridge({
      yearMonthStart,
      yearMonthEnd,
      storeFilter,
      userStore: auth?.store,
      userRole: auth?.role,
    })
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) {
          setData(null)
          setError(String(e?.message || e))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [yearMonthStart, yearMonthEnd, storeFilter, auth?.store, auth?.role, queryToken])

  const periodLine =
    yearMonthStart === yearMonthEnd
      ? yearMonthStart
      : `${yearMonthStart} ~ ${yearMonthEnd}`

  const resolveStoreLabel = React.useCallback(
    (code: string) => storeLabels[code] || code,
    [storeLabels]
  )

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("loading")}
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-destructive">{error}</CardContent>
      </Card>
    )
  }

  if (!data) return null

  const pos = data.pos
  const theory = data.theoreticalCost
  const acc = data.accounting
  const execSummary =
    pos && theory
      ? t("mmBridgeExecSummary")
          .replace("{net}", formatBath(pos.netSales))
          .replace("{discPct}", pct(pos.combined.totals.totalDiscountPctOfGross))
          .replace("{costPct}", pct(theory.costPctOfNet))
          .replace("{contribPct}", pct(data.bridge.contributionMarginPct))
      : null

  const highDiscount = new Set(data.storeRankingHighlights?.highDiscount ?? [])
  const highCost = new Set(data.storeRankingHighlights?.highCost ?? [])

  return (
    <div className={accountingFsDocumentCn}>
      <div className="mb-4 space-y-2">
        <div className={accountingFsTitleCn}>{t("mmBridgeTitle")}</div>
        <p className="text-xs text-muted-foreground">
          {periodLine} · {data.storeFilter || t("all")} · {t("mmBridgeSubtitle")}
        </p>
        {execSummary ? (
          <p className="text-sm font-medium text-foreground">{execSummary}</p>
        ) : null}
        {data.dataQuality ? (
          <DataQualityBadge level={data.dataQuality.level} reasons={data.dataQuality.reasons} t={t} />
        ) : null}
      </div>

      {(data.warnings?.length || 0) > 0 && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 space-y-1">
          {data.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}

      {data.posAvailable && pos && theory ? (
        <div className="mb-6 space-y-4">
          <div className="text-sm font-semibold">{t("mmBridgeLayerPos")}</div>

          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            <MetricCard
              label={t("mmBridgeGrossSales")}
              value={formatBath(pos.grossSalesBeforeDiscount)}
              sub={`${pos.periodOrderCount.toLocaleString()} ${t("mmBridgeOrders")}`}
            />
            <MetricCard
              label={t("mmBridgeTotalDiscount")}
              value={`-${formatBath(pos.totalDiscount)}`}
              sub={pct(pos.combined.totals.totalDiscountPctOfGross)}
              accent="rose"
            />
            <MetricCard
              label={t("mmBridgeNetSales")}
              value={formatBath(pos.netSales)}
              highlight
            />
            <MetricCard
              label={t("mmBridgeTheoreticalCost")}
              value={formatBath(theory.totalCost)}
              sub={pct(theory.costPctOfNet)}
            />
            <MetricCard
              label={t("mmBridgeContribution")}
              value={formatBath(data.bridge.contributionMargin ?? 0)}
              sub={pct(data.bridge.contributionMarginPct)}
              accent="emerald"
              highlight
            />
          </div>

          <Card>
            <CardContent className="pt-4">
              <p className="mb-3 text-xs font-medium text-muted-foreground">{t("mmBridgeWaterfall")}</p>
              <ManagementMarginWaterfall
                steps={buildPosWaterfallSteps(data, t)}
                baseAmount={pos.grossSalesBeforeDiscount}
              />
            </CardContent>
          </Card>

          {(data.momCompare?.length || 0) > 0 && data.priorPeriod ? (
            <Card>
              <CardContent className="pt-4">
                <p className="mb-2 text-xs font-semibold">{t("mmBridgeMomTitle")}</p>
                <p className="mb-3 text-[11px] text-muted-foreground">
                  {t("mmBridgeMomHint").replace(
                    "{prior}",
                    data.priorPeriod.yearMonthStart === data.priorPeriod.yearMonthEnd
                      ? data.priorPeriod.yearMonthStart
                      : `${data.priorPeriod.yearMonthStart} ~ ${data.priorPeriod.yearMonthEnd}`
                  )}
                </p>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-muted-foreground text-xs">
                        <th className="px-3 py-2 text-left">{t("mmBridgeMomMetric")}</th>
                        <th className="px-3 py-2 text-right">{t("mmBridgeMomCurrent")}</th>
                        <th className="px-3 py-2 text-right">{t("mmBridgeMomPrior")}</th>
                        <th className="px-3 py-2 text-right">{t("mmBridgeMomDiff")}</th>
                        <th className="px-3 py-2 text-right">{t("mmBridgeMomDiffPct")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.momCompare!.map((row) => (
                        <tr key={row.label} className="border-b border-border/60">
                          <td className="px-3 py-2">{momMetricLabel(row.label, t)}</td>
                          <td className="px-3 py-2 text-right font-erp-numeric tabular-nums">
                            {formatBath(row.current)}
                          </td>
                          <td className="px-3 py-2 text-right font-erp-numeric tabular-nums text-muted-foreground">
                            {formatBath(row.prior)}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2 text-right font-erp-numeric tabular-nums font-medium",
                              row.diff > 0 ? "text-emerald-700" : row.diff < 0 ? "text-rose-700" : ""
                            )}
                          >
                            {formatMomDiff(row.diff)}
                          </td>
                          <td className="px-3 py-2 text-right font-erp-numeric tabular-nums text-muted-foreground">
                            {row.diffPct != null ? `${row.diffPct >= 0 ? "+" : ""}${row.diffPct.toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {(pos.byChannel?.length || 0) > 0 ? (
            <Card>
              <CardContent className="pt-4">
                <p className="mb-2 text-xs font-semibold">{t("mmBridgeChannelTitle")}</p>
                <p className="mb-3 text-[11px] text-muted-foreground leading-relaxed">{t("mmBridgeChannelHint")}</p>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[960px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                        <th className="px-3 py-2 text-left">{t("mmBridgeChannelCol")}</th>
                        <th className="px-3 py-2 text-right">{t("mmBridgeOrders")}</th>
                        <th className="px-3 py-2 text-right">{t("mmBridgeNetSales")}</th>
                        <th className="px-3 py-2 text-right">{t("mmBridgeTotalDiscount")}</th>
                        <th className="px-3 py-2 text-right">{t("mmBridgeChannelFoodCost")}</th>
                        <th className="px-3 py-2 text-right">{t("mmBridgeChannelPackCost")}</th>
                        <th className="px-3 py-2 text-right">{t("mmBridgeTheoreticalCost")}</th>
                        <th className="px-3 py-2 text-right">{t("mmBridgeContribution")}</th>
                        <th className="px-3 py-2 text-right">{t("mmBridgeCostPctNet")}</th>
                        <th className="px-3 py-2 text-right" />
                      </tr>
                    </thead>
                    <tbody>
                      {pos.byChannel.map((row) => {
                        const channelUrl = buildSalesManagementDrillUrl({
                          startStr: data.startStr,
                          endStr: data.endStr,
                          storeFilter: data.storeFilter,
                          menu: "sales-analysis",
                          topic: "analysis-channel",
                          orderTypes: channelToOrderTypesParam(row.channel),
                        })
                        return (
                          <tr key={row.channel} className="border-b border-border/60">
                            <td className="px-3 py-2 font-medium">{channelLabel(row.channel, t)}</td>
                            <td className="px-3 py-2 text-right font-erp-numeric tabular-nums">
                              {row.orderCount.toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-right font-erp-numeric tabular-nums">
                              {formatBath(row.netSales)}
                            </td>
                            <td className="px-3 py-2 text-right font-erp-numeric tabular-nums text-rose-700">
                              -{formatBath(row.totalDiscount)}
                            </td>
                            <td className="px-3 py-2 text-right font-erp-numeric tabular-nums">
                              {formatBath(row.foodCost)}
                            </td>
                            <td className="px-3 py-2 text-right font-erp-numeric tabular-nums">
                              {formatBath(row.packagingCost)}
                            </td>
                            <td className="px-3 py-2 text-right font-erp-numeric tabular-nums">
                              {formatBath(row.totalCost)}
                            </td>
                            <td className="px-3 py-2 text-right font-erp-numeric tabular-nums text-emerald-700">
                              {formatBath(row.contributionMargin)}
                            </td>
                            <td className="px-3 py-2 text-right font-erp-numeric tabular-nums text-muted-foreground">
                              {pct(row.costPctOfNet)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Link
                                href={channelUrl}
                                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline whitespace-nowrap"
                              >
                                {t("mmBridgeDrillChannel")}
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {(data.storeRanking?.length || 0) > 0 ? (
            <Card>
              <CardContent className="pt-4">
                <p className="mb-2 text-xs font-semibold">{t("mmBridgeStoreRankingTitle")}</p>
                <p className="mb-3 text-[11px] text-muted-foreground leading-relaxed">
                  {t("mmBridgeStoreRankingHint")}
                </p>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[880px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                        <th className="px-3 py-2 text-left">{t("mmBridgeStoreCol")}</th>
                        <th className="px-3 py-2 text-right">{t("mmBridgeOrders")}</th>
                        <th className="px-3 py-2 text-right">{t("mmBridgeNetSales")}</th>
                        <th className="px-3 py-2 text-right">{t("mmBridgeTotalDiscount")}</th>
                        <th className="px-3 py-2 text-right">{t("mmBridgeDiscountPct")}</th>
                        <th className="px-3 py-2 text-right">{t("mmBridgeTheoreticalCost")}</th>
                        <th className="px-3 py-2 text-right">{t("mmBridgeCostPctNet")}</th>
                        <th className="px-3 py-2 text-right">{t("mmBridgeContribution")}</th>
                        <th className="px-3 py-2 text-right">{t("mmBridgeContribPct")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.storeRanking!.map((row) => {
                        const storeUrl = buildFinancialStatementsDrillUrl({
                          yearMonthStart: data.yearMonthStart,
                          yearMonthEnd: data.yearMonthEnd,
                          storeFilter: row.storeCode,
                          tab: "margin",
                        })
                        const isHighDisc = highDiscount.has(row.storeCode)
                        const isHighCost = highCost.has(row.storeCode)
                        return (
                          <tr
                            key={row.storeCode}
                            className={cn(
                              "border-b border-border/60",
                              (isHighDisc || isHighCost) && "bg-amber-50/60 dark:bg-amber-950/20"
                            )}
                          >
                            <td className="px-3 py-2">
                              <Link href={storeUrl} className="font-medium text-primary hover:underline">
                                {resolveStoreLabel(row.storeCode)}
                              </Link>
                              <div className="mt-0.5 flex flex-wrap gap-1">
                                {isHighDisc ? (
                                  <span className="rounded bg-rose-100 px-1.5 py-0 text-[10px] text-rose-800">
                                    {t("mmBridgeHighDiscountTag")}
                                  </span>
                                ) : null}
                                {isHighCost ? (
                                  <span className="rounded bg-amber-100 px-1.5 py-0 text-[10px] text-amber-900">
                                    {t("mmBridgeHighCostTag")}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-erp-numeric tabular-nums">
                              {row.orderCount.toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-right font-erp-numeric tabular-nums">
                              {formatBath(row.netSales)}
                            </td>
                            <td className="px-3 py-2 text-right font-erp-numeric tabular-nums text-rose-700">
                              -{formatBath(row.totalDiscount)}
                            </td>
                            <td className="px-3 py-2 text-right font-erp-numeric tabular-nums">
                              {pct(row.discountPctOfGross)}
                            </td>
                            <td className="px-3 py-2 text-right font-erp-numeric tabular-nums">
                              {formatBath(row.totalCost)}
                            </td>
                            <td className="px-3 py-2 text-right font-erp-numeric tabular-nums">
                              {pct(row.costPctOfNet)}
                            </td>
                            <td className="px-3 py-2 text-right font-erp-numeric tabular-nums text-emerald-700">
                              {formatBath(row.contributionMargin)}
                            </td>
                            <td className="px-3 py-2 text-right font-erp-numeric tabular-nums">
                              {pct(row.contributionPct)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Collapsible defaultOpen className="rounded-lg border">
            <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/30">
              {t("mmBridgeLayerDiscount")}
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-4 pb-4">
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="mb-2 text-xs font-semibold">{t("mmBridgeDiscountBreakdown")}</p>
                <SalesCombinedDiscountEmbed combined={pos.combined} tr={tr} />
                <Link
                  href={buildSalesManagementDrillUrl({
                    startStr: data.startStr,
                    endStr: data.endStr,
                    storeFilter: data.storeFilter,
                  })}
                  className="mt-3 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  {t("mmBridgeOpenDiscountReport")}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              <div className="mt-3 rounded-lg border bg-muted/20 p-3">
                <p className="mb-2 text-xs font-semibold">{t("mmBridgeCostStructureTheory")}</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t("mmBridgeFoodCostTheory")}</span>
                    <span className="font-erp-numeric tabular-nums">{formatBath(theory.foodCost)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t("mmBridgePackagingCostTheory")}</span>
                    <span className="font-erp-numeric tabular-nums">{formatBath(theory.packagingCost)}</span>
                  </div>
                  <p className="pt-1 text-[11px] text-muted-foreground leading-relaxed">
                    {t("mmBridgeTheoryHint").replace("{mise}", String(theory.miseRatePercent))}
                  </p>
                  {theory.unmatchedLineQty > 0 ? (
                    <p className="text-[11px] text-amber-700">
                      {t("mmBridgeUnmatchedLines").replace(
                        "{qty}",
                        theory.unmatchedLineQty.toLocaleString()
                      )}
                    </p>
                  ) : null}
                </div>
                <Link
                  href="/admin/pos-cost-analysis"
                  className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  {t("mmBridgeOpenCostAnalysis")}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      ) : (
        <Card className="mb-4">
          <CardContent className="py-6 text-sm text-muted-foreground">{t("mmBridgePosUnavailable")}</CardContent>
        </Card>
      )}

      {acc ? (
        <Collapsible defaultOpen={false} className="rounded-lg border">
          <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/30">
            {t("mmBridgeLayerAccounting")}
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-4 pb-4 space-y-4">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <MetricCard label={t("pL_sales")} value={formatBath(acc.sales)} />
              <MetricCard label={t("pL_cogs")} value={formatBath(acc.cogs)} />
              <MetricCard
                label={t("pL_grossProfit") || "매출총이익"}
                value={formatBath(acc.grossProfit)}
                accent="emerald"
              />
              <MetricCard label={t("pL_netProfit") || "당기순이익"} value={formatBath(acc.netProfit)} />
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-xs font-semibold">{t("mmBridgeActualPurchaseSplit")}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-sm">
                <div className="flex justify-between gap-2 rounded border px-3 py-2">
                  <span className="text-muted-foreground">{t("mmBridgeFoodCostActual")}</span>
                  <span className="font-erp-numeric tabular-nums">{formatBath(acc.purchasesFood)}</span>
                </div>
                <div className="flex justify-between gap-2 rounded border px-3 py-2">
                  <span className="text-muted-foreground">{t("mmBridgePackagingCostActual")}</span>
                  <span className="font-erp-numeric tabular-nums">{formatBath(acc.purchasesPackaging)}</span>
                </div>
                <div className="flex justify-between gap-2 rounded border px-3 py-2">
                  <span className="text-muted-foreground">{t("pL_purchases")}</span>
                  <span className="font-erp-numeric tabular-nums">{formatBath(acc.purchases)}</span>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{t("mmBridgeActualPurchaseHint")}</p>

              {theory && data.bridge.theoreticalVsActualCogsDiff != null ? (
                <div className="rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2 text-xs text-sky-950">
                  <p className="font-medium">{t("mmBridgeTheoryVsActual")}</p>
                  <p className="mt-1 font-erp-numeric tabular-nums">
                    {t("pL_cogs")} {formatBath(acc.cogs)} − {t("mmBridgeTheoreticalCost")}{" "}
                    {formatBath(theory.totalCost)} ={" "}
                    <span
                      className={cn(
                        "font-semibold",
                        data.bridge.theoreticalVsActualCogsDiff > 0 ? "text-amber-800" : "text-emerald-800"
                      )}
                    >
                      {data.bridge.theoreticalVsActualCogsDiff >= 0 ? "+" : ""}
                      {formatBath(data.bridge.theoreticalVsActualCogsDiff)}
                    </span>
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed">{t("mmBridgeTheoryVsActualHint")}</p>
                  <Link
                    href={buildFinancialStatementsDrillUrl({
                      yearMonthStart: data.yearMonthStart,
                      yearMonthEnd: data.yearMonthEnd,
                      storeFilter: data.storeFilter,
                      tab: "income",
                    })}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                  >
                    {t("adminIncomeStatement")}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              ) : null}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  )
}
