"use client"

import * as React from "react"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { BarChart3 } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { getMarketingCampaigns, getMarketingCampaignResults } from "@/lib/api-client"

type ChartRow = { topic: string; target: number; actual: number }

export default function MarketingDashboardPage() {
  const t = useT(useLang().lang)
  const [chartData, setChartData] = React.useState<ChartRow[]>([])
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    setLoading(true)
    getMarketingCampaigns()
      .then(async (campaigns) => {
        const rows: ChartRow[] = []
        for (const c of campaigns) {
          if (!c.startDate || !c.endDate || !c.kpiTarget) continue
          const res = await getMarketingCampaignResults({ campaignId: c.id })
          if (res.success && res.totalOrders != null) {
            rows.push({
              topic: c.topic.length > 20 ? c.topic.slice(0, 20) + "…" : c.topic,
              target: c.kpiTarget ?? 0,
              actual: res.totalOrders ?? 0,
            })
          }
        }
        setChartData(rows)
      })
      .catch(() => setChartData([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <BarChart3 className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">
              {t("adminMarketingDashboard") || "실적 대시보드"}
            </h1>
          </div>
        </div>
        {loading && (
          <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}
        {!loading && chartData.length === 0 && (
          <div className="rounded-lg border border-dashed border-muted-foreground/25 bg-muted/30 px-6 py-12 text-center text-muted-foreground">
            <p className="text-sm">캠페인 기간·KPI가 있는 데이터가 없습니다.</p>
          </div>
        )}
        {!loading && chartData.length > 0 && (
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">KPI 목표 vs 실적</h3>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.slice(0, 15)} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="topic" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={80} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="target" fill="#94a3b8" name="목표" />
                    <Bar dataKey="actual" fill="#3b82f6" name="실적" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-xl border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-2 px-4 text-left">캠페인</th>
                    <th className="py-2 px-4 text-right">목표</th>
                    <th className="py-2 px-4 text-right">실적</th>
                    <th className="py-2 px-4 text-right">달성률</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((r, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-2 px-4">{r.topic}</td>
                      <td className="py-2 px-4 text-right font-mono">{r.target.toLocaleString()}</td>
                      <td className="py-2 px-4 text-right font-mono">{r.actual.toLocaleString()}</td>
                      <td className="py-2 px-4 text-right">
                        {r.target > 0
                          ? ((r.actual / r.target) * 100).toFixed(1) + "%"
                          : "-"}
                      </td>
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
