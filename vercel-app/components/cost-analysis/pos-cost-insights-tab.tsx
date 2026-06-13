"use client"

import * as React from "react"
import Link from "next/link"
import { BarChart3, ExternalLink, Search, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import type { PosMenuCostAnalysisRow } from "@/lib/api-client"
import { getPosSalesByMenuHierarchy } from "@/lib/api-client"
import {
  computePosCostRowMetrics,
  costRatioTierClass,
  countMenusUsingItemCode,
  simulateItemPriceDelta,
  type PosCostListSettings,
} from "@/lib/pos-cost-analysis-shared"
import { getBangkokTodayDateString, addBangkokCalendarDays } from "@/lib/bangkok-time"
import { cn } from "@/lib/utils"
import { MetricCard } from "@/components/cost-analysis/metric-card"
import { PosCostSettingsPanel } from "@/components/cost-analysis/pos-cost-settings-panel"

type Props = {
  rows: PosMenuCostAnalysisRow[]
  settings: PosCostListSettings
  listQueried: boolean
  canEdit: boolean
  onSettingsSaved: (next: PosCostListSettings) => void
}

export function PosCostInsightsTab({ rows, settings, listQueried, canEdit, onSettingsSaved }: Props) {
  const { lang } = useLang()
  const t = useT(lang)
  const [itemCode, setItemCode] = React.useState("")
  const [whatIfPct, setWhatIfPct] = React.useState(10)
  const [weightedLoading, setWeightedLoading] = React.useState(false)
  const [weightedRatio, setWeightedRatio] = React.useState<number | null>(null)
  const [weightedMenuCount, setWeightedMenuCount] = React.useState(0)

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

  const loadWeighted = React.useCallback(async () => {
    if (!listQueried || rows.length === 0) return
    setWeightedLoading(true)
    try {
      const end = getBangkokTodayDateString()
      const start = addBangkokCalendarDays(end, -29)
      const sales = await getPosSalesByMenuHierarchy({
        startStr: start,
        endStr: end,
      })
      const menuSales = sales.levels?.menu ?? []
      const salesByName = new Map<string, number>()
      for (const m of menuSales) {
        const name = String(m.label ?? "").trim().toLowerCase()
        if (!name) continue
        salesByName.set(name, (salesByName.get(name) ?? 0) + (Number(m.sales) || 0))
      }
      let weightedCost = 0
      let weightedSales = 0
      let matched = 0
      for (const r of rows) {
        if (r.optionId != null) continue
        const name = String(r.menuName ?? "").trim().toLowerCase()
        const s = salesByName.get(name) ?? 0
        if (s <= 0) continue
        const metrics = computePosCostRowMetrics(r, settings.misePercent)
        weightedCost += metrics.costHMise * s
        weightedSales += metrics.priceH * s
        matched++
      }
      const ratio = weightedSales > 0 ? (weightedCost / weightedSales) * 100 : null
      setWeightedRatio(ratio)
      setWeightedMenuCount(matched)
    } catch {
      setWeightedRatio(null)
      setWeightedMenuCount(0)
    } finally {
      setWeightedLoading(false)
    }
  }, [listQueried, rows, settings.misePercent])

  if (!listQueried) {
    return (
      <div className="rounded-xl border bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">
        {t("posCostInsightsNeedList")}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PosCostSettingsPanel
        settings={settings}
        rows={rows}
        canEdit={canEdit}
        onSaved={onSettingsSaved}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <MetricCard
          label={t("posCostWeightedRatioTitle")}
          value={weightedRatio != null ? `${weightedRatio.toFixed(1)}%` : "—"}
          subLabel={
            weightedMenuCount > 0
              ? `${t("posCostWeightedMenuCount")}: ${weightedMenuCount}`
              : t("posCostWeightedHint")
          }
          variant="primary"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <div className="md:col-span-2 flex items-end gap-2">
          <Button size="sm" onClick={() => void loadWeighted()} disabled={weightedLoading || rows.length === 0}>
            {weightedLoading ? t("loading") : t("posCostWeightedLoad")}
          </Button>
          <Link
            href="/admin/financial-statements?tab=margin"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline pb-2"
          >
            {t("posCostOpenManagementMargin")}
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{t("posCostCategoryTargetTitle")}</h3>
        </div>
        <div className="space-y-3">
          {categoryStats.slice(0, 12).map((c) => {
            const target = c.target ?? settings.costRatioGoodMax
            const over = c.avgRatio > target
            const canEditTarget = canEdit
            return (
              <div key={c.cat} className="space-y-1">
                <div className="flex justify-between items-center gap-2 text-xs">
                  <span className="font-medium">{c.cat}</span>
                  <span className={cn("tabular-nums shrink-0", over ? "text-rose-600" : "text-emerald-600")}>
                    {c.avgRatio.toFixed(1)}% / {t("posCostTarget")}{" "}
                    {canEditTarget ? (
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
                    <td className={cn("px-3 py-2 text-right tabular-nums", costRatioTierClass(computePosCostRowMetrics(w.row).tierH))}>
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

      <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-3 text-xs text-muted-foreground flex items-start gap-2">
        <Search className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>{t("posCostInsightsAuditHint")}</span>
      </div>
    </div>
  )
}
