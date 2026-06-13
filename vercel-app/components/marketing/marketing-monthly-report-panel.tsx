"use client"

import * as React from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getMarketingCampaigns,
  getMarketingAds,
  getMarketingInfluencers,
  getMarketingCampaignCosts,
  type MarketingCampaign,
} from "@/lib/api-client"
import { marketingCampaignTouchesClosedDateRange } from "@/lib/marketing-campaign-periods"
import { getBangkokMonthRange } from "@/lib/bangkok-time"

function campaignListLabel(c: MarketingCampaign) {
  const no = (c.campaignNo ?? "").trim()
  return no ? `[${no}] ${c.topic}` : c.topic
}

export type MarketingMonthlyReportPanelProps = {
  campaignIdFromQuery?: string
}

export function MarketingMonthlyReportPanel({ campaignIdFromQuery = "" }: MarketingMonthlyReportPanelProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [campaigns, setCampaigns] = React.useState<MarketingCampaign[]>([])
  const [campaignFilter, setCampaignFilter] = React.useState("")
  const [month, setMonth] = React.useState(() => getBangkokMonthRange().yearMonth)
  const [loading, setLoading] = React.useState(false)
  const [summary, setSummary] = React.useState<{
    campaigns: number
    adsSpend: number
    influencerSpend: number
    totalCosts: number
    rows: { id: string; campaignNo: string; topic: string; budget: number; costs: number }[]
  } | null>(null)

  React.useEffect(() => {
    if (campaignIdFromQuery) setCampaignFilter(campaignIdFromQuery)
  }, [campaignIdFromQuery])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const cid = campaignFilter.trim()
      const [allCampaigns, ads, infs] = await Promise.all([
        getMarketingCampaigns(),
        cid ? getMarketingAds({ campaignId: cid }) : getMarketingAds(),
        cid ? getMarketingInfluencers({ campaignId: cid }) : getMarketingInfluencers(),
      ])
      setCampaigns(Array.isArray(allCampaigns) ? allCampaigns : [])

      const [y, m] = month.split("-").map(Number)
      const start = `${month}-01`
      const endDay = new Date(y, m, 0).getDate()
      const end = `${month}-${String(endDay).padStart(2, "0")}`

      const inRange = (d: string | null) => d && d >= start && d <= end

      const adsSpend = (ads || [])
        .filter((a) => (!cid || a.campaignId === cid) && inRange(a.publishDate ?? ""))
        .reduce((s, a) => s + (a.actualSpent ?? 0), 0)
      const influencerSpend = (infs || [])
        .filter((i) => (!cid || i.campaignId === cid) && inRange(i.publishDate ?? ""))
        .reduce((s, i) => s + (i.budget ?? 0), 0)

      let activeCampaigns = (allCampaigns || []).filter((c) =>
        marketingCampaignTouchesClosedDateRange(c, start, end),
      )
      if (cid) {
        activeCampaigns = activeCampaigns.filter((c) => c.id === cid)
      }

      const rows: { id: string; campaignNo: string; topic: string; budget: number; costs: number }[] = []
      let totalCosts = 0
      for (const c of activeCampaigns) {
        const res = await getMarketingCampaignCosts(c.id)
        const costs = res.totalCosts ?? 0
        totalCosts += costs
        rows.push({
          id: c.id,
          campaignNo: (c.campaignNo ?? "").trim(),
          topic: c.topic,
          budget: c.budgetTotal ?? 0,
          costs,
        })
      }

      setSummary({
        campaigns: activeCampaigns.length,
        adsSpend,
        influencerSpend,
        totalCosts,
        rows,
      })
    } catch {
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [month, campaignFilter])

  React.useEffect(() => {
    void load()
  }, [load])

  const handleDownload = () => {
    if (!summary) return
    const lines = [
      t("marketingMonthlyCsvTitle").replace("{month}", month),
      "",
      t("marketingMonthlyCsvHeader"),
      ...summary.rows.map((r) => {
        const pct = r.budget > 0 ? ((r.costs / r.budget) * 100).toFixed(1) : ""
        return `"${r.campaignNo.replace(/"/g, '""')}","${r.topic.replace(/"/g, '""')}",${r.budget},${r.costs},${pct}`
      }),
      "",
      `${t("marketingMonthlyCsvRowAds")},${summary.adsSpend}`,
      `${t("marketingMonthlyCsvRowInfluencer")},${summary.influencerSpend}`,
      `${t("marketingMonthlyCsvRowTotal")},${summary.totalCosts}`,
    ]
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `marketing-report-${month}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={campaignFilter}
          onChange={(e) => setCampaignFilter(e.target.value)}
          className="h-9 min-w-0 max-w-full rounded-md border border-input bg-background px-3 text-sm sm:max-w-[min(100%,16rem)]"
        >
          <option value="">{t("marketingMonthlyAllCampaigns")}</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {campaignListLabel(c)}
            </option>
          ))}
        </select>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-9 w-[min(100%,10.5rem)] min-w-0 shrink-0 rounded-md border border-input bg-background px-3 text-sm [color-scheme:light] dark:[color-scheme:dark]"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? t("marketingSavingShort") : t("marketingMonthlyBtnLoad")}
        </Button>
        <Button type="button" onClick={handleDownload} disabled={!summary}>
          <Download className="h-4 w-4" />
          {t("marketingMonthlyCsvDownload")}
        </Button>
      </div>

      <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        {t("marketingMonthlyNotePart1")}
        <strong className="text-foreground">{t("marketingMonthlyNoteStrong1")}</strong>
        {t("marketingMonthlyNotePart2")}
        <strong className="text-foreground">{t("marketingMonthlyNoteStrong2")}</strong>
        {t("marketingMonthlyNotePart3")}
      </div>

      {summary && (
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[10px] text-muted-foreground">{t("marketingMonthlyStatCampaigns")}</div>
              <div className="text-lg font-semibold">
                {summary.campaigns}
                {t("marketingCountUnit")}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[10px] text-muted-foreground">{t("marketingMonthlyStatAds")}</div>
              <div className="text-lg font-semibold tabular-nums">฿{summary.adsSpend.toLocaleString()}</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[10px] text-muted-foreground">{t("marketingMonthlyStatInfluencers")}</div>
              <div className="text-lg font-semibold tabular-nums">฿{summary.influencerSpend.toLocaleString()}</div>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
              <div className="text-[10px] text-muted-foreground">{t("marketingMonthlyStatTotalCosts")}</div>
              <div className="text-lg font-semibold tabular-nums">฿{summary.totalCosts.toLocaleString()}</div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2.5 pl-0 pr-2 text-left font-medium">{t("marketingMonthlyColCampaignNo")}</th>
                  <th className="py-2.5 pl-0 pr-2 text-left font-medium">{t("marketingMonthlyColCampaign")}</th>
                  <th className="py-2.5 pl-0 pr-2 text-right font-medium">{t("marketingMonthlyColBudget")}</th>
                  <th className="py-2.5 pl-0 pr-2 text-right font-medium">{t("marketingMonthlyColCosts")}</th>
                  <th className="py-2.5 pl-0 pr-0 text-right font-medium">{t("marketingMonthlyColCostRatio")}</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pl-0 pr-2 font-mono text-xs text-muted-foreground">{r.campaignNo || "—"}</td>
                    <td className="py-2.5 pl-0 pr-2">{r.topic}</td>
                    <td className="py-2.5 pl-0 pr-2 text-right font-mono">฿{r.budget.toLocaleString()}</td>
                    <td className="py-2.5 pl-0 pr-2 text-right font-mono">฿{r.costs.toLocaleString()}</td>
                    <td className="py-2.5 pl-0 pr-0 text-right">
                      {r.budget > 0 ? (
                        <span
                          className={
                            r.costs > r.budget ? "font-medium text-destructive" : "text-muted-foreground"
                          }
                        >
                          {((r.costs / r.budget) * 100).toFixed(1)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
