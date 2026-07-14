"use client"

import * as React from "react"
import Link from "next/link"
import { BarChart3, ExternalLink, Loader2, Search, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getPosCostSalesWeighted,
  type PosMenuCostAnalysisRow,
  type PosCostSalesWeightedChannelFilter,
  type PosCostSalesWeightedResult,
} from "@/lib/api-client"
import {
  computePosCostRowMetrics,
  costRatioTierClass,
  countMenusUsingItemCode,
  simulateItemPriceDelta,
  type PosCostListSettings,
} from "@/lib/pos-cost-analysis-shared"
import {
  addBangkokCalendarDays,
  getBangkokMonthRange,
  getBangkokTodayDateString,
} from "@/lib/bangkok-time"
import { cn } from "@/lib/utils"
import { MetricCard } from "@/components/cost-analysis/metric-card"
import { PosCostSettingsPanel } from "@/components/cost-analysis/pos-cost-settings-panel"
import { FinancialStatementStorePicker } from "@/components/financial-statements/financial-statement-store-picker"
import {
  buildFinancialStatementFranchiseStoreOptions,
  FINANCIAL_STATEMENT_STORE_NONE,
  isFinancialStatementStoreNone,
} from "@/lib/financial-statement-store-options"
import { useStoreList } from "@/lib/use-store-list"
import { formatBahtInteger as formatBaht } from "@/lib/financial-amount-format"

type Props = {
  rows: PosMenuCostAnalysisRow[]
  settings: PosCostListSettings
  listQueried: boolean
  canEdit: boolean
  onSettingsSaved: (next: PosCostListSettings) => void
}

function monthStartBangkok(): string {
  return getBangkokMonthRange().startStr
}

function channelLabel(
  channel: PosCostSalesWeightedChannelFilter,
  t: (key: string) => string
): string {
  const map: Record<PosCostSalesWeightedChannelFilter, string> = {
    all: t("posCostActualChannelAll"),
    dine_in: t("mmBridgeChannelHall"),
    takeout: t("mmBridgeChannelTakeout"),
    delivery: t("mmBridgeChannelDelivery"),
    other: t("mmBridgeChannelOther"),
  }
  return map[channel] || channel
}

export function PosCostActualTab({ rows, settings, listQueried, canEdit, onSettingsSaved }: Props) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores, storeLabels } = useStoreList()

  const franchiseStoreOptions = React.useMemo(
    () => buildFinancialStatementFranchiseStoreOptions(stores, storeLabels),
    [stores, storeLabels]
  )

  const defaultStoreFilter = React.useMemo(() => {
    const userStore = String(auth?.store || "").trim()
    if (userStore && franchiseStoreOptions.some((o) => o.value === userStore)) {
      return userStore
    }
    if (franchiseStoreOptions.length > 0) return "All"
    return FINANCIAL_STATEMENT_STORE_NONE
  }, [auth?.store, franchiseStoreOptions])

  const [startStr, setStartStr] = React.useState(monthStartBangkok)
  const [endStr, setEndStr] = React.useState(() => getBangkokTodayDateString())
  const [storeFilter, setStoreFilter] = React.useState(defaultStoreFilter)
  const [channel, setChannel] = React.useState<PosCostSalesWeightedChannelFilter>("all")
  const [queryToken, setQueryToken] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<PosCostSalesWeightedResult | null>(null)

  const [itemCode, setItemCode] = React.useState("")
  const [whatIfPct, setWhatIfPct] = React.useState(10)

  React.useEffect(() => {
    setStoreFilter((prev) => {
      if (prev !== FINANCIAL_STATEMENT_STORE_NONE) return prev
      return defaultStoreFilter
    })
  }, [defaultStoreFilter])

  const itemUsage = React.useMemo(
    () => countMenusUsingItemCode(rows, itemCode),
    [rows, itemCode]
  )

  const whatIfRows = React.useMemo(
    () => simulateItemPriceDelta(rows, itemCode, whatIfPct, settings.misePercent).slice(0, 15),
    [rows, itemCode, whatIfPct, settings.misePercent]
  )

  const categoryStats = React.useMemo(() => {
    const map = new Map<string, { sumRatio: number; n: number; target?: number }>()
    for (const r of rows) {
      const cat = String(r.categoryMain ?? r.category ?? t("posMenuCategoryAll")).trim() || "—"
      const m = computePosCostRowMetrics(r, settings.misePercent)
      if (m.costRatioH <= 0) continue
      const prev = map.get(cat) ?? { sumRatio: 0, n: 0, target: settings.categoryTargets[cat] }
      prev.sumRatio += m.costRatioH
      prev.n += 1
      map.set(cat, prev)
    }
    return Array.from(map.entries())
      .map(([cat, v]) => ({
        cat,
        avgRatio: v.n > 0 ? v.sumRatio / v.n : 0,
        n: v.n,
        target: settings.categoryTargets[cat],
      }))
      .sort((a, b) => b.avgRatio - a.avgRatio)
  }, [rows, settings, t])

  React.useEffect(() => {
    if (queryToken <= 0) return
    if (isFinancialStatementStoreNone(storeFilter)) {
      setError(t("posCostActualSelectStore"))
      setResult(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void getPosCostSalesWeighted({
      startStr,
      endStr,
      storeFilter,
      channel,
      misePercent: settings.misePercent,
    })
      .then((data) => {
        if (!cancelled) setResult(data)
      })
      .catch((e) => {
        if (!cancelled) {
          setResult(null)
          setError(String(e?.message || e))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [queryToken, startStr, endStr, storeFilter, channel, settings.misePercent, t])

  const runQuery = React.useCallback(() => {
    setQueryToken((n) => n + 1)
  }, [])

  const applyPreset = React.useCallback((preset: "today" | "7d" | "month") => {
    const today = getBangkokTodayDateString()
    if (preset === "today") {
      setStartStr(today)
      setEndStr(today)
      return
    }
    if (preset === "7d") {
      setStartStr(addBangkokCalendarDays(today, -6))
      setEndStr(today)
      return
    }
    setStartStr(monthStartBangkok())
    setEndStr(today)
  }, [])

  const summary = result?.summary
  const warningMessages = React.useMemo(() => {
    if (!result?.warnings?.length) return [] as string[]
    const msgs: string[] = []
    if (result.warnings.includes("STORE_NOT_SELECTED")) msgs.push(t("posCostActualSelectStore"))
    if (result.warnings.includes("OFFICE_SCOPE_NO_POS")) msgs.push(t("posCostActualOfficeNoPos"))
    if (result.warnings.includes("POS_TRUNCATED")) msgs.push(t("posCostActualTruncated"))
    if (result.warnings.includes("CAT_BOM_UNMATCHED_EXCLUDED")) {
      const meta = result.categoryMeta
      msgs.push(
        t("posCostActualBomExcludedWarn")
          .replace("{sales}", formatBaht(meta?.excludedUnmatchedSales ?? 0))
          .replace("{qty}", String(Math.round(meta?.excludedUnmatchedQty ?? 0)))
      )
    }
    if (result.warnings.includes("CAT_ORDER_DISCOUNT_APPLIED")) {
      const meta = result.categoryMeta
      msgs.push(
        t("posCostActualOrderDiscWarn")
          .replace("{payment}", formatBaht(meta?.paymentDiscountAllocated ?? 0))
          .replace("{service}", formatBaht(meta?.serviceAmtAllocated ?? 0))
      )
    }
    return msgs
  }, [result, t])

  const channelTableTotals = React.useMemo(() => {
    if (!result?.byChannel.length) return null
    let netSales = 0
    let totalCost = 0
    for (const row of result.byChannel) {
      netSales += row.netSales
      totalCost += row.totalCost
    }
    return {
      netSales,
      totalCost,
      costPctOfNet: netSales > 0 ? (totalCost / netSales) * 100 : 0,
    }
  }, [result])

  const categoryTableTotals = React.useMemo(() => {
    if (!result?.byCategory.length) return null
    let netSales = 0
    let totalCost = 0
    for (const row of result.byCategory) {
      netSales += row.netSales
      totalCost += row.totalCost
    }
    return {
      netSales,
      totalCost,
      costPctOfNet: netSales > 0 ? (totalCost / netSales) * 100 : 0,
    }
  }, [result])

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <h3 className="text-sm font-semibold">{t("posCostActualFiltersTitle")}</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("posCostActualPeriodStart")}</Label>
            <Input
              type="date"
              value={startStr}
              onChange={(e) => setStartStr(e.target.value)}
              className="h-9 w-[150px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("posCostActualPeriodEnd")}</Label>
            <Input
              type="date"
              value={endStr}
              onChange={(e) => setEndStr(e.target.value)}
              className="h-9 w-[150px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("salesStore") || "매장"}</Label>
            <FinancialStatementStorePicker
              value={storeFilter}
              onChange={setStoreFilter}
              franchiseStoreOptions={franchiseStoreOptions}
              allLabel={t("all") || "전체"}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("posCostActualChannel")}</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as PosCostSalesWeightedChannelFilter)}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["all", "dine_in", "takeout", "delivery", "other"] as const).map((ch) => (
                  <SelectItem key={ch} value={ch}>
                    {channelLabel(ch, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("today")}>
              {t("posCostActualPresetToday")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("7d")}>
              {t("posCostActualPreset7d")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("month")}>
              {t("posCostActualPresetMonth")}
            </Button>
            <Button type="button" size="sm" onClick={runQuery} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  {t("loading")}
                </>
              ) : (
                t("posCostActualQuery")
              )}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{t("posCostActualFormulaHint")}</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {warningMessages.length > 0 ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 space-y-1.5">
          {warningMessages.map((msg) => (
            <p key={msg}>{msg}</p>
          ))}
        </div>
      ) : null}

      {summary ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard
              label={t("posCostWeightedRatioTitle")}
              value={`${summary.costPctOfNet.toFixed(1)}%`}
              subLabel={t("posCostActualCostPctNetHint")}
              variant="primary"
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <MetricCard
              label={t("posCostActualNetSales")}
              value={`฿${formatBaht(summary.netSales)}`}
              subLabel={`${t("posCostActualOrderCount")}: ${summary.periodOrderCount.toLocaleString()}`}
            />
            <MetricCard
              label={t("posCostActualTotalCost")}
              value={`฿${formatBaht(summary.totalCost)}`}
              subLabel={`${t("posCostFood")} ฿${formatBaht(summary.foodCost)} · ${t("posCostPackaging")} ฿${formatBaht(summary.packagingCost)}`}
            />
            <MetricCard
              label={t("posCostActualBomMatch")}
              value={`${summary.matchedLineQty.toLocaleString()} / ${(summary.matchedLineQty + summary.unmatchedLineQty).toLocaleString()}`}
              subLabel={`${t("posCostActualUnmatchedLines")}: ${summary.unmatchedLineQty.toLocaleString()}`}
            />
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin/financial-statements?tab=margin"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {t("posCostOpenManagementMargin")}
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          {result && result.byChannel.length > 0 ? (
            <div className="rounded-xl border bg-card p-5 space-y-3 overflow-x-auto">
              <h3 className="text-sm font-semibold">{t("posCostActualByChannel")}</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-3 py-2 text-left">{t("posCostActualChannel")}</th>
                    <th className="px-3 py-2 text-right">{t("posCostActualNetSales")}</th>
                    <th className="px-3 py-2 text-right">{t("posCostActualTotalCost")}</th>
                    <th className="px-3 py-2 text-right">{t("posCostWeightedRatioTitle")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.byChannel.map((row) => (
                    <tr key={row.channel} className="border-b border-border/60">
                      <td className="px-3 py-2">
                        {channelLabel(row.channel as PosCostSalesWeightedChannelFilter, t)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">฿{formatBaht(row.netSales)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">฿{formatBaht(row.totalCost)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.costPctOfNet.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
                {channelTableTotals ? (
                  <tfoot>
                    <tr className="border-t-2 bg-muted/50 font-semibold">
                      <td className="px-3 py-2.5">{t("posCostActualTableTotal")}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        ฿{formatBaht(channelTableTotals.netSales)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        ฿{formatBaht(channelTableTotals.totalCost)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {channelTableTotals.costPctOfNet.toFixed(1)}%
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          ) : null}

          {result && result.byCategory.length > 0 ? (
            <div className="rounded-xl border bg-card p-5 space-y-4 overflow-x-auto">
              <div>
                <h3 className="text-sm font-semibold">{t("posCostActualByCategory")}</h3>
                <p className="text-xs text-muted-foreground mt-1">{t("posCostActualByCategoryHint")}</p>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-3 py-2 text-left">{t("posMenuCategoryMain") || "대분류"}</th>
                    <th className="px-3 py-2 text-right">{t("posCostActualNetSales")}</th>
                    <th className="px-3 py-2 text-right">{t("posCostActualTotalCost")}</th>
                    <th className="px-3 py-2 text-right">{t("posCostWeightedRatioTitle")}</th>
                    <th className="px-3 py-2 text-right">{t("posCostTarget")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.byCategory.map((row) => {
                    const target = settings.categoryTargets[row.categoryMain] ?? settings.costRatioGoodMax
                    const over = row.costPctOfNet > target
                    return (
                      <tr key={row.categoryMain} className="border-b border-border/60">
                        <td className="px-3 py-2 font-medium">{row.categoryMain}</td>
                        <td className="px-3 py-2 text-right tabular-nums">฿{formatBaht(row.netSales)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">฿{formatBaht(row.totalCost)}</td>
                        <td
                          className={cn(
                            "px-3 py-2 text-right tabular-nums font-medium",
                            over ? "text-rose-600" : "text-emerald-600"
                          )}
                        >
                          {row.costPctOfNet.toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{target}%</td>
                      </tr>
                    )
                  })}
                </tbody>
                {categoryTableTotals ? (
                  <tfoot>
                    <tr className="border-t-2 bg-muted/50 font-semibold">
                      <td className="px-3 py-2.5">{t("posCostActualTableTotal")}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        ฿{formatBaht(categoryTableTotals.netSales)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        ฿{formatBaht(categoryTableTotals.totalCost)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {categoryTableTotals.costPctOfNet.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">—</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          ) : null}

          {result && result.bomUnmatchedLines.length > 0 ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-5 space-y-3 overflow-x-auto">
              <div>
                <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                  {t("posCostActualUnmatchedTitle")}
                </h3>
                {result.categoryMeta &&
                (result.categoryMeta.excludedUnmatchedSales > 0 ||
                  result.categoryMeta.excludedUnmatchedQty > 0) ? (
                  <p className="text-xs text-amber-800/90 dark:text-amber-200/90 mt-1">
                    {t("posCostActualBomExcludedWarn")
                      .replace("{sales}", formatBaht(result.categoryMeta.excludedUnmatchedSales))
                      .replace("{qty}", String(Math.round(result.categoryMeta.excludedUnmatchedQty)))}
                  </p>
                ) : null}
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-3 py-2 text-left">{t("posMenuName")}</th>
                    <th className="px-3 py-2 text-left">{t("posCostActualUnmatchedReason")}</th>
                    <th className="px-3 py-2 text-right">{t("posCostQty")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.bomUnmatchedLines.slice(0, 20).map((row, i) => (
                    <tr key={`${row.menuId}-${row.optionId}-${i}`} className="border-b border-border/60">
                      <td className="px-3 py-2">
                        {row.menuLabel}
                        {row.optionLabel && row.optionLabel !== "—" ? ` (${row.optionLabel})` : ""}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {row.reason === "missing_menu_id"
                          ? t("posCostActualUnmatchedNoMenu")
                          : t("posCostIssueNoBom")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.lineQty.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : queryToken === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
          {t("posCostActualClickQuery")}
        </div>
      ) : null}

      {listQueried ? (
        <>
          <PosCostSettingsPanel
            settings={settings}
            rows={rows}
            canEdit={canEdit}
            onSaved={onSettingsSaved}
          />

          <div className="rounded-xl border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">{t("posCostCategoryTargetTitle")}</h3>
            </div>
            <p className="text-xs text-muted-foreground">{t("posCostActualCategoryMasterHint")}</p>
            <div className="space-y-3">
              {categoryStats.slice(0, 12).map((c) => {
                const target = c.target ?? settings.costRatioGoodMax
                const over = c.avgRatio > target
                return (
                  <div key={c.cat} className="space-y-1">
                    <div className="flex justify-between items-center gap-2 text-xs">
                      <span className="font-medium">{c.cat}</span>
                      <span className={cn("tabular-nums shrink-0", over ? "text-rose-600" : "text-emerald-600")}>
                        {c.avgRatio.toFixed(1)}% / {t("posCostTarget")}{" "}
                        {canEdit ? (
                          <button
                            type="button"
                            className="underline underline-offset-2 hover:text-primary"
                            onClick={() => {
                              document.querySelector<HTMLButtonElement>('[data-pos-cost-settings-toggle]')?.click()
                            }}
                          >
                            {target}%
                          </button>
                        ) : (
                          `${target}%`
                        )}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", over ? "bg-rose-500" : "bg-emerald-500")}
                        style={{ width: `${Math.min(100, (c.avgRatio / Math.max(target, 1)) * 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {c.n}
                      {t("posCostItemsUnit")}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="text-sm font-semibold">{t("posCostWhatIfTitle")}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{t("posCostWhatIfHint")}</p>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1.5 min-w-[160px]">
                <Label className="text-xs">{t("posCostItemCode")}</Label>
                <Input value={itemCode} onChange={(e) => setItemCode(e.target.value)} className="h-9 font-mono text-sm" />
              </div>
              <div className="space-y-1.5 flex-1 min-w-[200px] max-w-md">
                <Label className="text-xs">
                  {t("posCostWhatIfDelta")}: {whatIfPct > 0 ? "+" : ""}
                  {whatIfPct}%
                </Label>
                <Input
                  type="range"
                  min={-30}
                  max={30}
                  step={1}
                  value={whatIfPct}
                  onChange={(e) => setWhatIfPct(Number(e.target.value) || 0)}
                  className="h-2"
                />
              </div>
            </div>
            {itemCode.trim() ? (
              <p className="text-xs text-muted-foreground">
                {t("posCostItemUsageCount")}: {itemUsage.count}
              </p>
            ) : null}
            {whatIfRows.length > 0 ? (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-3 py-2 text-left">{t("posMenuName")}</th>
                      <th className="px-3 py-2 text-right">{t("posCostRatioHall")}</th>
                      <th className="px-3 py-2 text-right">{t("posCostWhatIfAfter")}</th>
                      <th className="px-3 py-2 text-right">{t("posCostWhatIfDeltaCol")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {whatIfRows.map((w, i) => (
                      <tr key={i} className="border-b border-border/60">
                        <td className="px-3 py-2">
                          {w.row.menuName}
                          {w.row.optionName ? ` (${w.row.optionName})` : ""}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2 text-right tabular-nums",
                            costRatioTierClass(computePosCostRowMetrics(w.row).tierH)
                          )}
                        >
                          {w.beforeRatioH.toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{w.afterRatioH.toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right tabular-nums text-rose-600">
                          {w.deltaRatioH > 0 ? "+" : ""}
                          {w.deltaRatioH.toFixed(1)}%p
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : itemCode.trim() ? (
              <p className="text-xs text-muted-foreground">{t("posCostWhatIfEmpty")}</p>
            ) : null}
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
          {t("posCostActualNeedListForExtras")}
        </div>
      )}

      <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-3 text-xs text-muted-foreground flex items-start gap-2">
        <Search className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>{t("posCostInsightsAuditHint")}</span>
      </div>
    </div>
  )
}
