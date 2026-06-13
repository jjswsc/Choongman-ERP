"use client"

import { MetricCard } from "@/components/cost-analysis/metric-card"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import type { PosCostListSummary } from "@/lib/pos-cost-analysis-shared"
import { AlertTriangle, ChefHat, Package, TrendingDown } from "lucide-react"

type Props = {
  summary: PosCostListSummary
  lastLoadedAt: string | null
  onIssueFilter?: (kind: "zero_cost" | "no_bom" | "high_ratio") => void
}

export function PosCostListKpi({ summary, lastLoadedAt, onIssueFilter }: Props) {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <div className="space-y-3">
      {lastLoadedAt ? (
        <p className="text-[11px] text-muted-foreground">
          {t("posCostLastLoaded")}: {lastLoadedAt}
        </p>
      ) : null}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <MetricCard
          size="sm"
          label={t("posCostListAverage")}
          value={`${summary.avgRatioH.toFixed(1)}%`}
          subLabel={`${t("posCostRatioHall")} · ${summary.nHall}${t("posCostItemsUnit")}`}
          variant="primary"
          icon={<ChefHat className="h-4 w-4" />}
        />
        <MetricCard
          size="sm"
          label={t("posCostRatioDelivery")}
          value={`${summary.avgRatioD.toFixed(1)}%`}
          subLabel={`${summary.nDelivery}${t("posCostItemsUnit")}`}
          variant="default"
          icon={<Package className="h-4 w-4" />}
        />
        <MetricCard
          size="sm"
          label={t("posCostMarginHall")}
          value={summary.avgMarginH.toFixed(1)}
          subLabel={t("posCostDineIn")}
          variant="success"
        />
        <MetricCard
          size="sm"
          label={t("posCostMarginDelivery")}
          value={summary.avgMarginD.toFixed(1)}
          subLabel={t("posCostDelivery")}
          variant="success"
        />
        <MetricCard
          size="sm"
          label={t("posCostIssueNoBom")}
          value={String(summary.issueNoBom)}
          subLabel={t("posCostIssueClickFilter")}
          variant={summary.issueNoBom > 0 ? "warning" : "default"}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <MetricCard
          size="sm"
          label={t("posCostIssueHighRatio")}
          value={String(summary.issueHighRatio)}
          subLabel={t("posCostIssueClickFilter")}
          variant={summary.issueHighRatio > 0 ? "warning" : "default"}
          icon={<TrendingDown className="h-4 w-4" />}
        />
      </div>
      {(summary.issueNoBom > 0 || summary.issueZeroCost > 0 || summary.issueHighRatio > 0) && onIssueFilter ? (
        <div className="flex flex-wrap gap-2 text-xs">
          {summary.issueNoBom > 0 ? (
            <button
              type="button"
              className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 hover:bg-amber-500/20"
              onClick={() => onIssueFilter("no_bom")}
            >
              {t("posCostIssueNoBom")} {summary.issueNoBom}
            </button>
          ) : null}
          {summary.issueZeroCost > 0 ? (
            <button
              type="button"
              className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 hover:bg-rose-500/20"
              onClick={() => onIssueFilter("zero_cost")}
            >
              {t("posCostIssueZeroCost")} {summary.issueZeroCost}
            </button>
          ) : null}
          {summary.issueHighRatio > 0 ? (
            <button
              type="button"
              className="rounded-full border border-orange-500/40 bg-orange-500/10 px-2.5 py-1 hover:bg-orange-500/20"
              onClick={() => onIssueFilter("high_ratio")}
            >
              {t("posCostIssueHighRatio")} {summary.issueHighRatio}
            </button>
          ) : null}
        </div>
      ) : null}
      {summary.nHall < summary.n || summary.nDelivery < summary.n ? (
        <p className="text-xs text-muted-foreground leading-snug">{t("posCostAvgExcludeZeroRatio")}</p>
      ) : null}
    </div>
  )
}
