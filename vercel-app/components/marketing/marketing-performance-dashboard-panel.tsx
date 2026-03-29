"use client"

import * as React from "react"
import Link from "next/link"
import { CalendarDays } from "lucide-react"
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
import { getMarketingCampaigns, getMarketingCampaignResults, type MarketingCampaign } from "@/lib/api-client"
import { marketingCampaignHasDefinedPeriod } from "@/lib/marketing-campaign-periods"
import { useStoreList } from "@/lib/use-store-list"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type ChartRow = {
  id: string
  label: string
  campaignNo: string
  topic: string
  target: number
  actual: number
}

function campaignListLabel(c: MarketingCampaign) {
  const no = (c.campaignNo ?? "").trim()
  return no ? `[${no}] ${c.topic}` : c.topic
}

export type MarketingPerformanceDashboardPanelProps = {
  campaignIdFromQuery?: string
}

export function MarketingPerformanceDashboardPanel({ campaignIdFromQuery = "" }: MarketingPerformanceDashboardPanelProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const { stores: storeList } = useStoreList()

  const [campaigns, setCampaigns] = React.useState<MarketingCampaign[]>([])
  const [campaignFilter, setCampaignFilter] = React.useState("")
  const [storeFilter, setStoreFilter] = React.useState("")
  const [chartData, setChartData] = React.useState<ChartRow[]>([])
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (campaignIdFromQuery) setCampaignFilter(campaignIdFromQuery)
  }, [campaignIdFromQuery])

  React.useEffect(() => {
    setLoading(true)
    getMarketingCampaigns()
      .then(async (all) => {
        setCampaigns(Array.isArray(all) ? all : [])
        const cid = campaignFilter.trim()
        const store = storeFilter.trim()
        let scoped = cid ? (all || []).filter((c) => c.id === cid) : all || []
        if (store) {
          scoped = scoped.filter((c) => {
            const br = Array.isArray(c.branches) ? c.branches.map((x) => String(x).trim()).filter(Boolean) : []
            if (br.length === 0) return true
            return br.includes(store)
          })
        }

        const rows: ChartRow[] = []
        for (const c of scoped) {
          if (!marketingCampaignHasDefinedPeriod(c) || !c.kpiTarget) continue
          const res = await getMarketingCampaignResults({ campaignId: c.id })
          if (res.success && res.totalOrders != null) {
            const topic = c.topic
            const short = topic.length > 18 ? topic.slice(0, 18) + "…" : topic
            const no = (c.campaignNo ?? "").trim()
            rows.push({
              id: c.id,
              campaignNo: no,
              topic,
              label: no ? `[${no}] ${short}` : short,
              target: c.kpiTarget ?? 0,
              actual: res.totalOrders ?? 0,
            })
          }
        }
        setChartData(rows)
      })
      .catch(() => {
        setCampaigns([])
        setChartData([])
      })
      .finally(() => setLoading(false))
  }, [campaignFilter, storeFilter])

  const summary = React.useMemo(() => {
    if (chartData.length === 0) return null
    const withTarget = chartData.filter((r) => r.target > 0)
    const avgPct =
      withTarget.length > 0
        ? withTarget.reduce((s, r) => s + (r.actual / r.target) * 100, 0) / withTarget.length
        : 0
    const totalActual = chartData.reduce((s, r) => s + r.actual, 0)
    const totalTarget = chartData.reduce((s, r) => s + r.target, 0)
    return { count: chartData.length, avgPct, totalActual, totalTarget }
  }, [chartData])

  const calendarHref = React.useMemo(() => {
    const p = new URLSearchParams()
    p.set("tab", "calendar")
    const cid = campaignFilter.trim() || campaignIdFromQuery.trim()
    if (cid) p.set("campaignId", cid)
    return `/admin/marketing/report?${p.toString()}`
  }, [campaignFilter, campaignIdFromQuery])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{t("marketingPerformanceFilterCampaign")}</label>
            <select
              value={campaignFilter}
              onChange={(e) => setCampaignFilter(e.target.value)}
              className="h-9 w-full min-w-[200px] rounded-md border border-input bg-background px-3 text-sm sm:max-w-xs"
            >
              <option value="">{t("marketingPerformanceAllCampaignsKpi")}</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {campaignListLabel(c)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{t("marketingPerformanceStore")}</label>
            <Select value={storeFilter || "__all__"} onValueChange={(v) => setStoreFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="h-9 w-full min-w-[160px] bg-background sm:max-w-xs">
                <SelectValue placeholder={t("marketingPerformanceAllStores")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("marketingPerformanceAllStores")}</SelectItem>
                {storeList.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Link
          href={calendarHref}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-muted"
        >
          <CalendarDays className="h-4 w-4 text-primary" />
          {t("marketingPerformanceIntegratedCalendar")}
        </Link>
      </div>

      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        {t("marketingPerformanceKpiNoteLead")}{" "}
        <strong className="text-foreground">{t("marketingPerformanceKpiNotePosBold")}</strong>
        {t("marketingPerformanceKpiNoteTrail")}
        {campaignIdFromQuery && (
          <span className="ml-1 text-primary">{t("marketingPerformanceHubLinkedFilterHint")}</span>
        )}
        {storeFilter ? (
          <span className="ml-1 block sm:inline">{t("marketingPerformanceStoreFilterMatchHint")}</span>
        ) : null}
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border bg-card px-3 py-2">
            <div className="text-[10px] text-muted-foreground">{t("marketingPerformanceAggregatedCampaigns")}</div>
            <div className="text-lg font-semibold">
              {summary.count}
              {t("marketingCountUnit")}
            </div>
          </div>
          <div className="rounded-lg border bg-card px-3 py-2">
            <div className="text-[10px] text-muted-foreground">{t("marketingPerformanceAvgAchievement")}</div>
            <div className="text-lg font-semibold">{summary.avgPct.toFixed(1)}%</div>
          </div>
          <div className="rounded-lg border bg-card px-3 py-2">
            <div className="text-[10px] text-muted-foreground">{t("marketingPerformanceSumTarget")}</div>
            <div className="text-lg font-semibold tabular-nums">{summary.totalTarget.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border bg-primary/10 px-3 py-2">
            <div className="text-[10px] text-muted-foreground">{t("marketingPerformanceSumActual")}</div>
            <div className="text-lg font-semibold tabular-nums">{summary.totalActual.toLocaleString()}</div>
          </div>
        </div>
      )}

      {loading && (
        <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">{t("loading")}</div>
      )}
      {!loading && chartData.length === 0 && (
        <div className="rounded-lg border border-dashed border-muted-foreground/25 bg-muted/30 px-6 py-12 text-center text-muted-foreground">
          <p className="text-sm">{t("marketingPerformanceEmptyNoData")}</p>
        </div>
      )}
      {!loading && chartData.length > 0 && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">{t("marketingPerformanceKpiChartTitle")}</h3>
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData.slice(0, 15)} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={88} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="target" fill="#94a3b8" name={t("marketingPerformanceChartTarget")} />
                  <Bar dataKey="actual" fill="#3b82f6" name={t("marketingPerformanceChartActual")} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="px-4 py-2 text-left">{t("marketingPerformanceColCampaignNo")}</th>
                  <th className="px-4 py-2 text-left">{t("marketingPerformanceColCampaign")}</th>
                  <th className="px-4 py-2 text-right">{t("marketingPerformanceColTarget")}</th>
                  <th className="px-4 py-2 text-right">{t("marketingPerformanceColActual")}</th>
                  <th className="px-4 py-2 text-right">{t("marketingPerformanceColRate")}</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((r) => {
                  const pct = r.target > 0 ? (r.actual / r.target) * 100 : 0
                  return (
                    <tr key={r.id} className="border-b">
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{r.campaignNo || "—"}</td>
                      <td className="px-4 py-2">{r.topic}</td>
                      <td className="px-4 py-2 text-right font-mono">{r.target.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right font-mono">{r.actual.toLocaleString()}</td>
                      <td className={cn("px-4 py-2 text-right font-medium", pct >= 100 ? "text-green-600" : "text-amber-700")}>
                        {r.target > 0 ? pct.toFixed(1) + "%" : "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
