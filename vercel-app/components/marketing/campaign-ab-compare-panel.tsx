"use client"

import * as React from "react"
import Link from "next/link"
import { GitCompare, BarChart3, ExternalLink } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
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
import { marketingCampaignEffectiveBounds } from "@/lib/marketing-campaign-periods"
import { getCampaignTypeLabel } from "@/lib/marketing-campaign-type-utils"
import { cn } from "@/lib/utils"

function bangkokTodayUtcMidnight(): number {
  const ymd = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
  const [y, m, d] = ymd.split("-").map(Number)
  return Date.UTC(y, m - 1, d)
}

function parseYmdUtc(s: string | null | undefined): number | null {
  if (!s) return null
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export type CompareRow = {
  id: string
  campaignNo: string
  topic: string
  campaignType: string
  format: string
  budget: number
  costs: number
  orders: number
  sales: number
  roi: number
  roas: number
  avgOrder: number
  startDate: string | null
  endDate: string | null
  costConfidence?: number
  salesConfidence?: number
  attributionModeCost?: string
  attributionModeSales?: string
}

type GroupBy = "topic" | "format" | "campaignType" | "none"
type StatusFilter = "finish" | "finish_or_ongoing"
type PeriodFilter = "all" | "365" | "180" | "90"
type SortKey = "roi" | "sales" | "costs" | "orders" | "roas"
type ChartMode = "amounts" | "roi"

function tr(lang: string, ko: string, en: string, th: string) {
  if (lang === "en") return en
  if (lang === "th") return th
  return ko
}

export function CampaignAbComparePanel() {
  const { lang } = useLang()
  const t = useT(lang)
  const [rows, setRows] = React.useState<CompareRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [groupBy, setGroupBy] = React.useState<GroupBy>("topic")
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("finish")
  const [periodFilter, setPeriodFilter] = React.useState<PeriodFilter>("all")
  const [sortKey, setSortKey] = React.useState<SortKey>("roi")
  const [chartMode, setChartMode] = React.useState<ChartMode>("amounts")

  const loadData = React.useCallback(async () => {
    setLoading(true)
    try {
      const campaigns = await getMarketingCampaigns()
      const today = bangkokTodayUtcMidnight()
      const periodDays =
        periodFilter === "all" ? null : periodFilter === "365" ? 365 : periodFilter === "180" ? 180 : 90
      const cutoff = periodDays !== null ? today - periodDays * 86400000 : null

      const eligible = campaigns.filter((c) => {
        const eff = marketingCampaignEffectiveBounds(c)
        if (statusFilter === "finish") {
          if (c.status !== "finish" || !eff.startDate || !eff.endDate) return false
        } else {
          if (c.status !== "finish" && c.status !== "ongoing") return false
          if (!eff.startDate) return false
        }
        if (cutoff === null) return true
        const endMs = parseYmdUtc(eff.endDate)
        const startMs = parseYmdUtc(eff.startDate)
        if (c.status === "ongoing" && endMs == null && startMs != null && startMs < cutoff) return false
        if (c.status === "finish" && endMs != null) return endMs >= cutoff
        if (c.status === "ongoing") {
          if (endMs != null) return endMs >= cutoff
          return true
        }
        return true
      })

      const BATCH = 8
      const result: CompareRow[] = []
      for (let i = 0; i < eligible.length; i += BATCH) {
        const slice = eligible.slice(i, i + BATCH)
        const part = await Promise.all(
          slice.map(async (c) => {
            const eff = marketingCampaignEffectiveBounds(c)
            const [costRes, posRes] = await Promise.all([
              getMarketingCampaignCosts(c.id),
              getMarketingCampaignResults({ campaignId: c.id }),
            ])
            const costs = costRes.totalCosts ?? 0
            const sales = posRes.totalSales ?? 0
            const orders = posRes.totalOrders ?? 0
            const roi = costs > 0 ? ((sales - costs) / costs) * 100 : 0
            const roas = costs > 0 ? sales / costs : 0
            const avgOrder = orders > 0 ? sales / orders : 0
            return {
              id: c.id,
              campaignNo: c.campaignNo ?? "",
              topic: c.topic,
              campaignType: c.campaignType ?? "menu_discount",
              format: c.format ?? "",
              budget: c.budgetTotal ?? 0,
              costs,
              orders,
              sales,
              roi,
              roas,
              avgOrder,
              startDate: eff.startDate ?? c.startDate ?? null,
              endDate: eff.endDate ?? c.endDate ?? null,
              costConfidence: costRes.attributionConfidence,
              salesConfidence: posRes.attributionConfidence,
              attributionModeCost: costRes.attributionMode,
              attributionModeSales: posRes.attributionMode,
            } satisfies CompareRow
          })
        )
        result.push(...part)
      }
      setRows(result)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [periodFilter, statusFilter])

  React.useEffect(() => {
    void loadData()
  }, [loadData])

  const sortedRows = React.useMemo(() => {
    const copy = [...rows]
    const dir = -1
    copy.sort((a, b) => {
      const va =
        sortKey === "roi"
          ? a.roi
          : sortKey === "sales"
            ? a.sales
            : sortKey === "costs"
              ? a.costs
              : sortKey === "orders"
                ? a.orders
                : a.roas
      const vb =
        sortKey === "roi"
          ? b.roi
          : sortKey === "sales"
            ? b.sales
            : sortKey === "costs"
              ? b.costs
              : sortKey === "orders"
                ? b.orders
                : b.roas
      if (va === vb) return a.topic.localeCompare(b.topic)
      return va > vb ? dir : -dir
    })
    return copy
  }, [rows, sortKey])

  const groups = React.useMemo(() => {
    if (groupBy === "none") return sortedRows.map((r) => ({ key: r.topic, items: [r] }))
    if (groupBy === "format") {
      const byFormat = new Map<string, CompareRow[]>()
      for (const r of sortedRows) {
        const k = r.format || tr(lang, "(미지정)", "(unset)", "(ไม่ระบุ)")
        if (!byFormat.has(k)) byFormat.set(k, [])
        byFormat.get(k)!.push(r)
      }
      return Array.from(byFormat.entries()).map(([key, items]) => ({ key, items }))
    }
    if (groupBy === "campaignType") {
      const m = new Map<string, CompareRow[]>()
      for (const r of sortedRows) {
        const k = getCampaignTypeLabel(r.campaignType, lang)
        if (!m.has(k)) m.set(k, [])
        m.get(k)!.push(r)
      }
      return Array.from(m.entries()).map(([key, items]) => ({ key, items }))
    }
    const byTopic = new Map<string, CompareRow[]>()
    for (const r of sortedRows) {
      let key = r.topic
      if (/CM\s*Set|cm\s*set/i.test(r.topic)) key = "CM Set"
      else if (/\d+\+\d+|1\+1|2\+1/i.test(r.topic)) key = "1+1 / 2+1"
      else if (/sale\s*here|Sale\s*Here/i.test(r.topic)) key = "Sale Here"
      if (!byTopic.has(key)) byTopic.set(key, [])
      byTopic.get(key)!.push(r)
    }
    return Array.from(byTopic.entries()).map(([key, items]) => ({ key, items }))
  }, [sortedRows, groupBy, lang])

  const summary = React.useMemo(() => {
    if (rows.length === 0) return null
    const totalSales = rows.reduce((s, r) => s + r.sales, 0)
    const totalCosts = rows.reduce((s, r) => s + r.costs, 0)
    const avgRoi = rows.length > 0 ? rows.reduce((s, r) => s + r.roi, 0) / rows.length : 0
    const weightedRoi = totalCosts > 0 ? ((totalSales - totalCosts) / totalCosts) * 100 : 0
    return { totalSales, totalCosts, avgRoi, weightedRoi, n: rows.length }
  }, [rows])

  const chartData = React.useMemo(() => {
    const base = [...sortedRows].slice(0, 12)
    return base.map((r) => ({
      name: r.topic.length > 14 ? r.topic.slice(0, 14) + "…" : r.topic,
      budget: r.budget,
      costs: r.costs,
      sales: r.sales,
      roi: Math.round(r.roi),
      roas: Math.round(r.roas * 100) / 100,
    }))
  }, [sortedRows])

  const groupInsights = React.useMemo(() => {
    if (groupBy === "none") return [] as { key: string; best: CompareRow; items: number }[]
    return groups
      .filter((g) => g.items.length >= 2)
      .map((g) => {
        const best = [...g.items].sort((a, b) => b.roi - a.roi)[0]
        return { key: g.key, best, items: g.items.length }
      })
  }, [groups, groupBy])

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">
          {t("adminMarketingAbCompare") || "A/B 캠페인 비교"}
        </p>
        <p className="mt-1 text-xs leading-relaxed">
          {tr(
            lang,
            "완료(또는 선택 시 진행 중) 캠페인의 예산·실비·POS 집계 매출을 한 화면에서 비교합니다. ROI% = (매출−실비)÷실비×100, ROAS = 매출÷실비입니다. 집계 방식은 캠페인별 성과/비용 화면과 동일합니다.",
            "Compare budget, actual costs, and POS-attributed sales across campaigns. ROI% = (sales−costs)÷costs×100; ROAS = sales÷costs. Attribution matches each campaign’s Result/Cost view.",
            "เปรียบเทียบงบประมาณ ต้นทุนจริง และยอดขาย POS ของแคมเปญ ROI% = (ยอดขาย−ต้นทุน)÷ต้นทุน×100; ROAS = ยอดขาย÷ต้นทุน",
          )}
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="finish">{tr(lang, "완료만", "Finished only", "เฉพาะที่เสร็จแล้ว")}</option>
            <option value="finish_or_ongoing">{tr(lang, "완료 + 진행중", "Finished + ongoing", "เสร็จ + กำลังดำเนินการ")}</option>
          </select>
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value as PeriodFilter)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">{tr(lang, "기간 전체", "All periods", "ทุกช่วง")}</option>
            <option value="365">{tr(lang, "종료일 기준 365일", "Ended in last 365d (BKK)", "สิ้นสุดใน 365 วัน")}</option>
            <option value="180">{tr(lang, "종료일 기준 180일", "Ended in last 180d", "สิ้นสุดใน 180 วัน")}</option>
            <option value="90">{tr(lang, "종료일 기준 90일", "Ended in last 90d", "สิ้นสุดใน 90 วัน")}</option>
          </select>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="roi">{tr(lang, "정렬: ROI%", "Sort: ROI%", "เรียง: ROI%")}</option>
            <option value="roas">{tr(lang, "정렬: ROAS", "Sort: ROAS", "เรียง: ROAS")}</option>
            <option value="sales">{tr(lang, "정렬: 매출", "Sort: Sales", "เรียง: ยอดขาย")}</option>
            <option value="costs">{tr(lang, "정렬: 실비", "Sort: Costs", "เรียง: ต้นทุน")}</option>
            <option value="orders">{tr(lang, "정렬: 주문 수", "Sort: Orders", "เรียง: จำนวนคำสั่งซื้อ")}</option>
          </select>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="topic">{tr(lang, "그룹: 유사 주제", "Group: topic pattern", "กลุ่ม: หัวข้อคล้ายกัน")}</option>
            <option value="format">{tr(lang, "그룹: 채널 형식", "Group: format", "กลุ่ม: รูปแบบช่องทาง")}</option>
            <option value="campaignType">{tr(lang, "그룹: 캠페인 유형", "Group: campaign type", "กลุ่ม: ประเภทแคมเปญ")}</option>
            <option value="none">{tr(lang, "그룹 없음", "No grouping", "ไม่จัดกลุ่ม")}</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{tr(lang, "차트", "Chart", "กราฟ")}:</span>
          <select
            value={chartMode}
            onChange={(e) => setChartMode(e.target.value as ChartMode)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="amounts">{tr(lang, "예산·실비·매출", "Budget / costs / sales", "งบ / ต้นทุน / ยอดขาย")}</option>
            <option value="roi">{tr(lang, "ROI% 막대", "ROI % bars", "แท่ง ROI%")}</option>
          </select>
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {loading ? t("loading") : tr(lang, "다시 불러오기", "Reload", "โหลดใหม่")}
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-muted/20 px-3 py-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {tr(lang, "캠페인 수", "Campaigns", "จำนวนแคมเปญ")}
            </div>
            <div className="text-lg font-semibold">{summary.n}</div>
          </div>
          <div className="rounded-lg border bg-muted/20 px-3 py-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {tr(lang, "합계 매출", "Total sales", "ยอดขายรวม")}
            </div>
            <div className="text-lg font-semibold font-mono">฿{summary.totalSales.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border bg-muted/20 px-3 py-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {tr(lang, "합계 실비", "Total costs", "ต้นทุนรวม")}
            </div>
            <div className="text-lg font-semibold font-mono">฿{summary.totalCosts.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border bg-muted/20 px-3 py-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {tr(lang, "포트폴리오 ROI (가중)", "Portfolio ROI (weighted)", "ROI พอร์ต (ถ่วงน้ำหนัก)")}
            </div>
            <div
              className={cn(
                "text-lg font-semibold font-mono",
                summary.weightedRoi >= 0 ? "text-green-600" : "text-red-600"
              )}
            >
              {summary.weightedRoi.toFixed(0)}%
            </div>
            <div className="text-[10px] text-muted-foreground">
              {tr(lang, "단순 평균 ROI", "Simple avg ROI", "ค่าเฉลี่ย ROI")}: {summary.avgRoi.toFixed(0)}%
            </div>
          </div>
        </div>
      )}

      {groupInsights.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <BarChart3 className="h-4 w-4" />
            {tr(lang, "그룹별 최고 ROI", "Best ROI per group", "ROI สูงสุดต่อกลุ่ม")}
          </h3>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {groupInsights.map((g) => (
              <li key={g.key} className="rounded-md border bg-muted/10 px-3 py-2">
                <span className="font-medium text-foreground">{g.key}</span>
                <span className="text-muted-foreground"> · {g.items}{tr(lang, "건", " campaigns", " แคมเปญ")}</span>
                <div className="mt-0.5 text-xs">
                  {tr(lang, "1위", "Top", "อันดับ1")}: {g.best.topic}{" "}
                  <span className={g.best.roi >= 0 ? "text-green-600" : "text-red-600"}>
                    ({g.best.roi.toFixed(0)}%)
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading && (
        <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">{t("loading")}</div>
      )}

      {!loading && rows.length > 0 && (
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">
              {chartMode === "amounts"
                ? t("adminMarketingAbChartTitle") || tr(lang, "캠페인별 예산·실비·매출", "Budget / costs / sales", "งบ / ต้นทุน / ยอดขาย")
                : tr(lang, "상위 캠페인 ROI%", "Top campaigns ROI%", "แคมเปญยอดนิยม ROI%")}
            </h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                {chartMode === "amounts" ? (
                  <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={72} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="budget" fill="#94a3b8" name={t("adminMarketingBudget") || "예산"} />
                    <Bar dataKey="costs" fill="#f97316" name={t("adminMarketingActualCosts") || "실비"} />
                    <Bar dataKey="sales" fill="#22c55e" name={t("adminMarketingSales") || "매출"} />
                  </BarChart>
                ) : (
                  <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={72} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="roi" fill="#6366f1" name="ROI %" />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border bg-card overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 px-3 text-left">{tr(lang, "캠페인", "Campaign", "แคมเปญ")}</th>
                  <th className="py-2 px-3 text-left">{tr(lang, "유형", "Type", "ประเภท")}</th>
                  <th className="py-2 px-3 text-left">{tr(lang, "기간", "Period", "ช่วงเวลา")}</th>
                  <th className="py-2 px-3 text-left">{t("adminMarketingFormat") || "형식"}</th>
                  <th className="py-2 px-3 text-right">{t("adminMarketingBudget") || "예산"}</th>
                  <th className="py-2 px-3 text-right">{t("adminMarketingActualCosts") || "실비"}</th>
                  <th className="py-2 px-3 text-right">{t("adminMarketingOrders") || "주문"}</th>
                  <th className="py-2 px-3 text-right">{t("adminMarketingSales") || "매출"}</th>
                  <th className="py-2 px-3 text-right">ROAS</th>
                  <th className="py-2 px-3 text-right">ROI %</th>
                  <th className="py-2 px-3 text-right">{tr(lang, "객단가", "AOV", "ต่อบิล")}</th>
                  <th className="py-2 px-3 text-center">{tr(lang, "신뢰도", "Conf.", "ความเชื่อมั่น")}</th>
                  <th className="py-2 px-3 text-right">{tr(lang, "이동", "Open", "เปิด")}</th>
                </tr>
              </thead>
              <tbody>
                {groups.flatMap((g) =>
                  g.items.map((r, idx) => (
                    <React.Fragment key={r.id}>
                      {groupBy !== "none" && idx === 0 && g.items.length > 1 && (
                        <tr className="bg-muted/40">
                          <td colSpan={13} className="px-3 py-1.5 text-xs font-semibold text-foreground">
                            {tr(lang, "그룹", "Group", "กลุ่ม")}: {g.key}{" "}
                            <span className="font-normal text-muted-foreground">
                              ({g.items.length}
                              {tr(lang, "건", "", " รายการ")})
                            </span>
                          </td>
                        </tr>
                      )}
                      <tr className="border-b border-border/60">
                        <td className="py-2 px-3">
                          <div className="font-medium">{r.topic}</div>
                          {r.campaignNo && (
                            <div className="text-[10px] text-muted-foreground">{r.campaignNo}</div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">{getCampaignTypeLabel(r.campaignType, lang)}</td>
                        <td className="py-2 px-3 text-xs text-muted-foreground whitespace-nowrap">
                          {(r.startDate || "—") + " ~ " + (r.endDate || "—")}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">{r.format}</td>
                        <td className="py-2 px-3 text-right font-mono">฿{r.budget.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right font-mono">฿{r.costs.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right font-mono">{r.orders.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right font-mono">฿{r.sales.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right font-mono">{r.roas > 0 ? r.roas.toFixed(2) : "—"}</td>
                        <td
                          className={cn(
                            "py-2 px-3 text-right font-mono",
                            r.roi >= 0 ? "text-green-600" : "text-red-600"
                          )}
                        >
                          {r.costs > 0 ? `${r.roi.toFixed(0)}%` : "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-muted-foreground">
                          {r.orders > 0 ? `฿${Math.round(r.avgOrder).toLocaleString()}` : "—"}
                        </td>
                        <td className="py-2 px-3 text-center text-[10px] text-muted-foreground">
                          {typeof r.salesConfidence === "number" || typeof r.costConfidence === "number" ? (
                            <span title={tr(lang, "매출/비용 귀속 신뢰도", "Sales/cost attribution confidence", "ความเชื่อมั่นการระบุที่มา")}>
                              S:{Math.round((r.salesConfidence ?? 0) * 100)}% / C:
                              {Math.round((r.costConfidence ?? 0) * 100)}%
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <Link
                            href={`/admin/marketing/campaigns?openCampaign=${encodeURIComponent(r.id)}&tab=results`}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {tr(lang, "성과", "Results", "ผลลัพธ์")}
                          </Link>
                        </td>
                      </tr>
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-muted-foreground/25 bg-muted/30 px-6 py-12 text-center text-muted-foreground">
          <GitCompare className="mx-auto mb-2 h-8 w-8 opacity-40" />
          <p className="text-sm">{t("adminMarketingAbNoData") || tr(lang, "조건에 맞는 캠페인이 없습니다.", "No campaigns match filters.", "ไม่มีแคมเปญที่ตรงตัวกรอง")}</p>
        </div>
      )}
    </div>
  )
}
