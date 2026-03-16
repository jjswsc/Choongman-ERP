"use client"

import * as React from "react"
import { GitCompare, BarChart3 } from "lucide-react"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
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
import {
  getMarketingCampaigns,
  getMarketingCampaignCosts,
  getMarketingCampaignResults,
  type MarketingCampaign,
} from "@/lib/api-client"

type CompareRow = {
  topic: string
  id: string
  format: string
  budget: number
  costs: number
  orders: number
  sales: number
  roi: number // (sales - costs) / costs * 100
}

export default function MarketingAbComparePage() {
  const t = useT(useLang().lang)
  const [rows, setRows] = React.useState<CompareRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [groupBy, setGroupBy] = React.useState<"format" | "topic" | "none">("topic")

  React.useEffect(() => {
    setLoading(true)
    getMarketingCampaigns()
      .then(async (campaigns) => {
        const completed: MarketingCampaign[] = campaigns.filter(
          (c) => c.status === "finish" && c.startDate && c.endDate
        )
        const result: CompareRow[] = []
        for (const c of completed) {
          const [costRes, posRes] = await Promise.all([
            getMarketingCampaignCosts(c.id),
            getMarketingCampaignResults({ campaignId: c.id }),
          ])
          const costs = costRes.totalCosts ?? 0
          const sales = posRes.totalSales ?? 0
          const orders = posRes.totalOrders ?? 0
          const roi = costs > 0 ? ((sales - costs) / costs) * 100 : 0
          result.push({
            topic: c.topic,
            id: c.id,
            format: c.format ?? "",
            budget: c.budgetTotal ?? 0,
            costs,
            orders,
            sales,
            roi,
          })
        }
        setRows(result)
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [])

  // 그룹별 유사 캠페인 (topic 키워드 기준)
  const groups = React.useMemo(() => {
    if (groupBy === "none") return rows.map((r) => ({ key: r.topic, items: [r] }))
    if (groupBy === "format") {
      const byFormat = new Map<string, CompareRow[]>()
      for (const r of rows) {
        const k = r.format || "(미지정)"
        if (!byFormat.has(k)) byFormat.set(k, [])
        byFormat.get(k)!.push(r)
      }
      return Array.from(byFormat.entries()).map(([key, items]) => ({ key, items }))
    }
    // topic: CM Set, 1+1 등 패턴으로 그룹
    const byTopic = new Map<string, CompareRow[]>()
    for (const r of rows) {
      let key = r.topic
      if (/CM\s*Set|cm\s*set/i.test(r.topic)) key = "CM Set"
      else if (/\d+\+\d+|1\+1|2\+1/i.test(r.topic)) key = "1+1/2+1"
      else if (/sale\s*here|Sale\s*Here/i.test(r.topic)) key = "Sale Here"
      else key = r.topic
      if (!byTopic.has(key)) byTopic.set(key, [])
      byTopic.get(key)!.push(r)
    }
    return Array.from(byTopic.entries()).map(([key, items]) => ({ key, items }))
  }, [rows, groupBy])

  const chartData = React.useMemo(() => {
    return rows.slice(0, 12).map((r) => ({
      name: r.topic.length > 15 ? r.topic.slice(0, 15) + "…" : r.topic,
      budget: r.budget,
      costs: r.costs,
      sales: r.sales,
      roi: Math.round(r.roi),
    }))
  }, [rows])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <GitCompare className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-xl font-bold">
              {t("adminMarketingAbCompare") || "A/B 캠페인 비교"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as "format" | "topic" | "none")}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="topic">{t("adminMarketingGroupByTopic") || "유사 주제별"}</option>
              <option value="format">{t("adminMarketingGroupByFormat") || "형식별"}</option>
              <option value="none">{t("adminMarketingGroupNone") || "그룹 없음"}</option>
            </select>
          </div>
        </div>

        {loading && (
          <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div className="space-y-6">
            <div className="rounded-xl border bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">
                {t("adminMarketingAbChartTitle") || "캠페인별 예산·실비·매출·ROI"}
              </h3>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={70} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="budget" fill="#94a3b8" name={t("adminMarketingBudget") || "예산"} />
                    <Bar dataKey="costs" fill="#f97316" name={t("adminMarketingActualCosts") || "실비"} />
                    <Bar dataKey="sales" fill="#22c55e" name={t("adminMarketingSales") || "매출"} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-2 px-4 text-left">{t("adminMarketingCampaign") || "캠페인"}</th>
                    <th className="py-2 px-4 text-left">{t("adminMarketingFormat") || "형식"}</th>
                    <th className="py-2 px-4 text-right">{t("adminMarketingBudget") || "예산"}</th>
                    <th className="py-2 px-4 text-right">{t("adminMarketingActualCosts") || "실비"}</th>
                    <th className="py-2 px-4 text-right">{t("adminMarketingOrders") || "주문"}</th>
                    <th className="py-2 px-4 text-right">{t("adminMarketingSales") || "매출"}</th>
                    <th className="py-2 px-4 text-right">ROI %</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.flatMap((g) =>
                    g.items.map((r) => (
                      <tr key={r.id} className="border-b">
                        <td className="py-2 px-4">{r.topic}</td>
                        <td className="py-2 px-4 text-muted-foreground">{r.format}</td>
                        <td className="py-2 px-4 text-right font-mono">฿{r.budget.toLocaleString()}</td>
                        <td className="py-2 px-4 text-right font-mono">฿{r.costs.toLocaleString()}</td>
                        <td className="py-2 px-4 text-right font-mono">{r.orders.toLocaleString()}</td>
                        <td className="py-2 px-4 text-right font-mono">฿{r.sales.toLocaleString()}</td>
                        <td className={`py-2 px-4 text-right font-mono ${r.roi >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {r.roi.toFixed(0)}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div className="rounded-lg border border-dashed border-muted-foreground/25 bg-muted/30 px-6 py-12 text-center text-muted-foreground">
            <p className="text-sm">{t("adminMarketingAbNoData") || "비교할 완료된 캠페인이 없습니다."}</p>
          </div>
        )}
      </div>
    </div>
  )
}
