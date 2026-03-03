"use client"

import * as React from "react"
import { FileText, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getMarketingCampaigns, getMarketingAds, getMarketingInfluencers, getMarketingCampaignCosts } from "@/lib/api-client"

export default function MarketingReportPage() {
  const [month, setMonth] = React.useState(() => new Date().toISOString().slice(0, 7))
  const [loading, setLoading] = React.useState(false)
  const [summary, setSummary] = React.useState<{
    campaigns: number
    adsSpend: number
    influencerSpend: number
    totalCosts: number
    rows: { topic: string; budget: number; costs: number }[]
  } | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [campaigns, ads, infs] = await Promise.all([
        getMarketingCampaigns(),
        getMarketingAds(),
        getMarketingInfluencers(),
      ])
      const [y, m] = month.split("-").map(Number)
      const start = `${month}-01`
      const endDay = new Date(y, m, 0).getDate()
      const end = `${month}-${String(endDay).padStart(2, "0")}`

      const inRange = (d: string | null) => d && d >= start && d <= end
      const campaignInRange = (c: { startDate?: string | null; endDate?: string | null }) =>
        inRange(c.startDate ?? "") || inRange(c.endDate ?? "") || (c.startDate && c.endDate && c.startDate <= end && (c.endDate ?? "") >= start)
      const adsSpend = (ads || []).filter((a) => inRange(a.publishDate ?? "")).reduce((s, a) => s + (a.actualSpent ?? 0), 0)
      const influencerSpend = (infs || []).filter((i) => inRange(i.publishDate ?? "")).reduce((s, i) => s + (i.budget ?? 0), 0)

      const activeCampaigns = (campaigns || []).filter(campaignInRange)
      const rows: { topic: string; budget: number; costs: number }[] = []
      let totalCosts = 0
      for (const c of activeCampaigns) {
        const res = await getMarketingCampaignCosts(c.id)
        const costs = res.totalCosts ?? 0
        totalCosts += costs
        rows.push({ topic: c.topic, budget: c.budgetTotal ?? 0, costs })
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
  }, [month])

  React.useEffect(() => {
    load()
  }, [load])

  const handleDownload = () => {
    if (!summary) return
    const lines = [
      `마케팅 월간 리포트 ${month}`,
      "",
      "캠페인,예산,실비",
      ...summary.rows.map((r) => `${r.topic},${r.budget},${r.costs}`),
      "",
      `광고비,${summary.adsSpend}`,
      `인플루언서비,${summary.influencerSpend}`,
      `총 비용,${summary.totalCosts}`,
    ]
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `marketing-report-${month}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-xl font-bold">월간 리포트</h1>
          </div>
          <div className="flex gap-2">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 rounded border px-3 text-sm" />
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? "..." : "조회"}
            </Button>
            <Button size="sm" onClick={handleDownload} disabled={!summary}>
              <Download className="h-4 w-4 mr-1" />
              CSV 다운로드
            </Button>
          </div>
        </div>
        {summary && (
          <div className="rounded-xl border bg-card p-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded bg-muted/50 p-3">
                <div className="text-xs text-muted-foreground">캠페인</div>
                <div className="text-lg font-semibold">{summary.campaigns}건</div>
              </div>
              <div className="rounded bg-muted/50 p-3">
                <div className="text-xs text-muted-foreground">광고비</div>
                <div className="text-lg font-semibold">฿{summary.adsSpend.toLocaleString()}</div>
              </div>
              <div className="rounded bg-muted/50 p-3">
                <div className="text-xs text-muted-foreground">인플루언서비</div>
                <div className="text-lg font-semibold">฿{summary.influencerSpend.toLocaleString()}</div>
              </div>
              <div className="rounded bg-primary/10 p-3">
                <div className="text-xs text-muted-foreground">총 비용</div>
                <div className="text-lg font-semibold">฿{summary.totalCosts.toLocaleString()}</div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 text-left">캠페인</th>
                    <th className="py-2 text-right">예산</th>
                    <th className="py-2 text-right">실비</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((r) => (
                    <tr key={r.topic} className="border-b">
                      <td className="py-2">{r.topic}</td>
                      <td className="py-2 text-right font-mono">฿{r.budget.toLocaleString()}</td>
                      <td className="py-2 text-right font-mono">฿{r.costs.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
