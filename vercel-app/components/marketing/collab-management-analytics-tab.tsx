"use client"

import * as React from "react"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { BarChart3, Download, Search, X } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { MarketingCampaign } from "@/lib/api-client"
import {
  getCollabDiscountUsage,
  type CollabDiscountUsageDailyRow,
  type CollabDiscountUsageRow,
  type CollabDiscountUsageStoreRow,
} from "@/lib/api-client"
import { ADMIN_CHART_COLORS, ERP_NUMERIC_CHART_TICK } from "@/lib/admin-ui-standards"
import { normalizeMarketingCollabDetail } from "@/lib/marketing-collab-detail"
import { useStoreList } from "@/lib/use-store-list"
import {
  getBangkokCurrentMonthRangeYmd,
  getBangkokTodayRangeYmd,
} from "@/lib/collab-overview-period"

type TFn = (key: string) => string

function campaignListLabel(c: MarketingCampaign) {
  const no = (c.campaignNo ?? "").trim()
  return no ? `[${no}] ${c.topic}` : c.topic
}

function campaignSearchBlob(c: MarketingCampaign): string {
  const d = normalizeMarketingCollabDetail(c.collabDetail ?? {})
  return [c.campaignNo ?? "", c.topic ?? "", c.id, d.partnerName ?? "", d.partnerTypeOther ?? ""]
    .join(" ")
    .toLowerCase()
}

function tokenizeSearch(q: string): string[] {
  return q
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

function campaignMatchesTokens(c: MarketingCampaign, tokens: string[]): boolean {
  if (tokens.length === 0) return true
  const blob = campaignSearchBlob(c)
  return tokens.every((t) => blob.includes(t))
}

function sharePercent(value: number, total: number): string {
  if (!Number.isFinite(total) || total <= 0) return "0.0%"
  return `${((Number(value) / total) * 100).toFixed(1)}%`
}

function shortCampaignLabel(r: CollabDiscountUsageRow): string {
  const no = (r.campaignNo || "").trim()
  const topic = (r.topic || r.campaignId || "").trim()
  if (no) return `[${no}] ${topic.length > 18 ? `${topic.slice(0, 18)}…` : topic}`
  return topic.length > 24 ? `${topic.slice(0, 24)}…` : topic
}

function avgDiscountPerOrder(orders: number, discount: number): number {
  if (!orders) return 0
  return Math.round((discount / orders) * 100) / 100
}

export function CollabManagementAnalyticsTab(props: {
  campaigns: MarketingCampaign[]
  t: TFn
}) {
  const { campaigns, t } = props
  const { stores, loading: storesLoading, formatStoreLabel } = useStoreList()

  const [periodFrom, setPeriodFrom] = React.useState(() => getBangkokCurrentMonthRangeYmd().from)
  const [periodTo, setPeriodTo] = React.useState(() => getBangkokCurrentMonthRangeYmd().to)
  const [storeFilter, setStoreFilter] = React.useState("")
  const [campaignSearchDraft, setCampaignSearchDraft] = React.useState("")
  const [selectedCampaignId, setSelectedCampaignId] = React.useState("")
  const [campaignPickerOpen, setCampaignPickerOpen] = React.useState(false)

  const [loading, setLoading] = React.useState(false)
  const [hasQueried, setHasQueried] = React.useState(false)
  const [campaignRows, setCampaignRows] = React.useState<CollabDiscountUsageRow[]>([])
  const [storeRows, setStoreRows] = React.useState<CollabDiscountUsageStoreRow[]>([])
  const [dailyRows, setDailyRows] = React.useState<CollabDiscountUsageDailyRow[]>([])
  const [totals, setTotals] = React.useState({ orderCount: 0, discountAmount: 0, campaignCount: 0 })
  const [sourceNote, setSourceNote] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const selectedCampaign = React.useMemo(
    () => campaigns.find((c) => c.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId]
  )

  const campaignSearchTokens = React.useMemo(
    () => tokenizeSearch(campaignSearchDraft),
    [campaignSearchDraft]
  )

  const campaignSuggestions = React.useMemo(() => {
    const matched =
      campaignSearchTokens.length === 0
        ? [...campaigns]
        : campaigns.filter((c) => campaignMatchesTokens(c, campaignSearchTokens))
    return matched
      .sort((a, b) => {
        const ac = a.collabManagement === true ? 0 : 1
        const bc = b.collabManagement === true ? 0 : 1
        if (ac !== bc) return ac - bc
        return (a.topic || "").localeCompare(b.topic || "", "ko")
      })
      .slice(0, 20)
  }, [campaigns, campaignSearchTokens])

  const campaignPickerRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (!campaignPickerOpen) return
    const onPointerDown = (e: PointerEvent) => {
      const el = campaignPickerRef.current
      if (el && !el.contains(e.target as Node)) setCampaignPickerOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [campaignPickerOpen])

  const topCampaignChart = React.useMemo(
    () =>
      campaignRows.slice(0, 8).map((r) => ({
        name: shortCampaignLabel(r),
        discount: r.discountAmount,
        orders: r.orderCount,
      })),
    [campaignRows]
  )

  const topStoreChart = React.useMemo(
    () =>
      storeRows.slice(0, 10).map((r) => ({
        name: formatStoreLabel(r.storeCode),
        discount: r.discountAmount,
        orders: r.orderCount,
      })),
    [formatStoreLabel, storeRows]
  )

  const dailyChart = React.useMemo(
    () =>
      dailyRows.map((r) => ({
        ymd: r.ymd.slice(5),
        fullYmd: r.ymd,
        discount: r.discountAmount,
        orders: r.orderCount,
      })),
    [dailyRows]
  )

  const peakDay = React.useMemo(() => {
    if (dailyRows.length === 0) return null
    return dailyRows.reduce((best, r) => (r.discountAmount > best.discountAmount ? r : best), dailyRows[0])
  }, [dailyRows])

  const avgPerOrder = React.useMemo(
    () => avgDiscountPerOrder(totals.orderCount, totals.discountAmount),
    [totals.discountAmount, totals.orderCount]
  )

  const load = React.useCallback(async () => {
    if (!periodFrom || !periodTo || periodFrom > periodTo) {
      setError(t("marketingCollabUsageInvalidPeriod"))
      return
    }
    setLoading(true)
    setError(null)
    setHasQueried(true)
    const base = {
      startStr: periodFrom,
      endStr: periodTo,
      ...(storeFilter.trim() ? { store: storeFilter.trim() } : {}),
      ...(selectedCampaignId.trim() ? { campaignId: selectedCampaignId.trim() } : {}),
    }
    try {
      const [campaignRes, storeRes, dayRes] = await Promise.all([
        getCollabDiscountUsage({ ...base, groupBy: "campaign" }),
        getCollabDiscountUsage({ ...base, groupBy: "store" }),
        getCollabDiscountUsage({ ...base, groupBy: "day" }),
      ])
      if (!campaignRes.success && !storeRes.success && !dayRes.success) {
        setCampaignRows([])
        setStoreRows([])
        setDailyRows([])
        setTotals({ orderCount: 0, discountAmount: 0, campaignCount: 0 })
        setError(campaignRes.message || storeRes.message || dayRes.message || t("marketingCollabAnalyticsLoadError"))
        setSourceNote(null)
        return
      }
      const nextCampaigns = Array.isArray(campaignRes.rows) ? campaignRes.rows : []
      const nextStores = Array.isArray(storeRes.storeRows) ? storeRes.storeRows : []
      const nextDaily = Array.isArray(dayRes.dailyRows) ? dayRes.dailyRows : []
      setCampaignRows(nextCampaigns)
      setStoreRows(nextStores)
      setDailyRows(nextDaily)
      setTotals({
        orderCount: campaignRes.totals?.orderCount ?? storeRes.totals?.orderCount ?? dayRes.totals?.orderCount ?? 0,
        discountAmount:
          campaignRes.totals?.discountAmount ??
          storeRes.totals?.discountAmount ??
          dayRes.totals?.discountAmount ??
          0,
        campaignCount: campaignRes.totals?.campaignCount ?? nextCampaigns.length,
      })
      const notes = [campaignRes, storeRes, dayRes]
        .filter((r) => r.source === "unavailable")
        .map((r) => r.message)
        .filter(Boolean)
      setSourceNote(notes[0] || null)
      if (!campaignRes.success || !storeRes.success || !dayRes.success) {
        setError(t("marketingCollabAnalyticsPartialError"))
      }
    } catch (e) {
      setCampaignRows([])
      setStoreRows([])
      setDailyRows([])
      setTotals({ orderCount: 0, discountAmount: 0, campaignCount: 0 })
      setError(String(e))
      setSourceNote(null)
    } finally {
      setLoading(false)
      setCampaignPickerOpen(false)
    }
  }, [periodFrom, periodTo, selectedCampaignId, storeFilter, t])

  const clearCampaignSelection = React.useCallback(() => {
    setSelectedCampaignId("")
    setCampaignSearchDraft("")
    setCampaignPickerOpen(false)
  }, [])

  const handleDownload = () => {
    const lines = [
      t("marketingCollabAnalyticsCsvTitle")
        .replace("{from}", periodFrom)
        .replace("{to}", periodTo),
      "",
      t("marketingCollabUsageCsvHeader"),
      ...campaignRows.map((r) => {
        const no = (r.campaignNo || "").replace(/"/g, '""')
        const topic = (r.topic || "").replace(/"/g, '""')
        return `"${no}","${topic}",${r.orderCount},${r.discountAmount},${r.storeCount}`
      }),
      "",
      t("marketingCollabUsageStoreCsvHeader"),
      ...storeRows.map((r) => {
        const label = formatStoreLabel(r.storeCode).replace(/"/g, '""')
        const share = sharePercent(r.discountAmount, totals.discountAmount).replace("%", "")
        return `"${r.storeCode.replace(/"/g, '""')}","${label}",${r.orderCount},${r.discountAmount},${share}`
      }),
      "",
      t("marketingCollabAnalyticsDailyCsvHeader"),
      ...dailyRows.map((r) => `${r.ymd},${r.orderCount},${r.discountAmount}`),
      "",
      `${t("marketingCollabUsageCsvTotalOrders")},${totals.orderCount}`,
      `${t("marketingCollabUsageCsvTotalDiscount")},${totals.discountAmount}`,
    ]
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `collab-discount-analytics-${periodFrom}_${periodTo}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const hasData = campaignRows.length > 0 || storeRows.length > 0 || dailyRows.length > 0

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-muted-foreground">{t("marketingCollabAnalyticsHint")}</p>

      <div className="space-y-3 rounded-lg border border-border/70 bg-muted/10 p-3 sm:px-4">
        <div className="flex flex-wrap gap-2">
          <div className="min-w-[9rem] space-y-1">
            <Label className="text-[10px] text-muted-foreground">{t("marketingCollabOverviewPeriodFrom")}</Label>
            <Input
              type="date"
              className="h-9"
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
            />
          </div>
          <div className="min-w-[9rem] space-y-1">
            <Label className="text-[10px] text-muted-foreground">{t("marketingCollabOverviewPeriodTo")}</Label>
            <Input
              type="date"
              className="h-9"
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 text-xs"
              onClick={() => {
                const r = getBangkokTodayRangeYmd()
                setPeriodFrom(r.from)
                setPeriodTo(r.to)
              }}
            >
              {t("today")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 text-xs"
              onClick={() => {
                const r = getBangkokCurrentMonthRangeYmd()
                setPeriodFrom(r.from)
                setPeriodTo(r.to)
              }}
            >
              {t("marketingCollabOverviewPeriodResetMonth")}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="min-w-[10rem] flex-1 space-y-1 lg:max-w-[14rem]">
            <Label className="text-[10px] text-muted-foreground">{t("marketingCollabOverviewStoreFilter")}</Label>
            <select
              value={storeFilter || "_all"}
              disabled={storesLoading}
              onChange={(e) => setStoreFilter(e.target.value === "_all" ? "" : e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs disabled:opacity-60"
            >
              <option value="_all">{t("all")}</option>
              {stores.map((s) => (
                <option key={s} value={s}>
                  {formatStoreLabel(s)}
                </option>
              ))}
            </select>
          </div>

          <div className="relative min-w-[14rem] flex-1 space-y-1 lg:max-w-[28rem]" ref={campaignPickerRef}>
            <Label className="text-[10px] text-muted-foreground">{t("marketingCollabUsageCampaignSearch")}</Label>
            {selectedCampaign ? (
              <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-background px-2 text-xs">
                <span className="min-w-0 flex-1 truncate font-medium">{campaignListLabel(selectedCampaign)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 px-1.5"
                  onClick={clearCampaignSelection}
                  aria-label={t("marketingCollabUsageCampaignClear")}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-9 pl-7 text-xs"
                    value={campaignSearchDraft}
                    onChange={(e) => {
                      setCampaignSearchDraft(e.target.value)
                      setCampaignPickerOpen(true)
                    }}
                    onFocus={() => setCampaignPickerOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        void load()
                      }
                      if (e.key === "Escape") setCampaignPickerOpen(false)
                    }}
                    placeholder={t("marketingCollabUsageCampaignSearchPh")}
                    autoComplete="off"
                  />
                </div>
                {campaignPickerOpen ? (
                  <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover py-1 shadow-md">
                    {campaignSuggestions.length === 0 ? (
                      <li className="px-3 py-2 text-xs text-muted-foreground">
                        {t("marketingCollabUsageCampaignNoMatch")}
                      </li>
                    ) : (
                      campaignSuggestions.map((c) => {
                        const partner = normalizeMarketingCollabDetail(c.collabDetail ?? {}).partnerName
                        return (
                          <li key={c.id}>
                            <button
                              type="button"
                              className="flex w-full flex-col gap-0.5 px-3 py-1.5 text-left text-xs hover:bg-muted"
                              onClick={() => {
                                setSelectedCampaignId(c.id)
                                setCampaignSearchDraft("")
                                setCampaignPickerOpen(false)
                              }}
                            >
                              <span className="font-medium leading-snug">{campaignListLabel(c)}</span>
                              {partner ? (
                                <span className="text-[10px] text-muted-foreground">{partner}</span>
                              ) : null}
                            </button>
                          </li>
                        )
                      })
                    )}
                  </ul>
                ) : null}
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="h-9 gap-1" onClick={() => void load()} disabled={loading}>
              <BarChart3 className="h-3.5 w-3.5" />
              {loading ? t("marketingSavingShort") : t("marketingMonthlyBtnLoad")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1"
              onClick={handleDownload}
              disabled={!hasData}
            >
              <Download className="h-3.5 w-3.5" />
              {t("marketingCollabUsageCsvDownload")}
            </Button>
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {sourceNote ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-50/80 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          {sourceNote}
        </p>
      ) : null}

      {!hasQueried && !loading ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          {t("marketingCollabAnalyticsNeedQuery")}
        </p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : !hasData ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          {t("marketingCollabUsageEmpty")}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[10px] text-muted-foreground">{t("marketingCollabUsageStatCampaigns")}</div>
              <div className="text-lg font-semibold tabular-nums">{totals.campaignCount}</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[10px] text-muted-foreground">{t("marketingCollabUsageStatOrders")}</div>
              <div className="text-lg font-semibold tabular-nums">{totals.orderCount.toLocaleString()}</div>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
              <div className="text-[10px] text-muted-foreground">{t("marketingCollabUsageStatDiscount")}</div>
              <div className="text-lg font-semibold tabular-nums">฿{totals.discountAmount.toLocaleString()}</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[10px] text-muted-foreground">{t("marketingCollabAnalyticsStatAvgOrder")}</div>
              <div className="text-lg font-semibold tabular-nums">฿{avgPerOrder.toLocaleString()}</div>
              {peakDay ? (
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {t("marketingCollabAnalyticsPeakDay")
                    .replace("{ymd}", peakDay.ymd)
                    .replace("{amt}", peakDay.discountAmount.toLocaleString())}
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border/80 bg-card p-3 sm:p-4">
              <h3 className="mb-3 text-sm font-semibold">{t("marketingCollabAnalyticsTopCampaigns")}</h3>
              {topCampaignChart.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">{t("marketingCollabUsageEmpty")}</p>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topCampaignChart} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, ...ERP_NUMERIC_CHART_TICK }} tickFormatter={(v) => `${Number(v).toLocaleString()}`} />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                      <Tooltip
                        formatter={(value) => [`฿${Number(value ?? 0).toLocaleString()}`, t("marketingCollabUsageColDiscount")]}
                        labelFormatter={(label) => String(label)}
                      />
                      <Bar dataKey="discount" fill={ADMIN_CHART_COLORS[0]} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border/80 bg-card p-3 sm:p-4">
              <h3 className="mb-3 text-sm font-semibold">{t("marketingCollabAnalyticsTopStores")}</h3>
              {topStoreChart.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">{t("marketingCollabUsageEmpty")}</p>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topStoreChart} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, ...ERP_NUMERIC_CHART_TICK }} tickFormatter={(v) => `${Number(v).toLocaleString()}`} />
                      <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} />
                      <Tooltip
                        formatter={(value) => [`฿${Number(value ?? 0).toLocaleString()}`, t("marketingCollabUsageColDiscount")]}
                        labelFormatter={(label) => String(label)}
                      />
                      <Bar dataKey="discount" fill={ADMIN_CHART_COLORS[1] ?? ADMIN_CHART_COLORS[0]} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-card p-3 sm:p-4">
            <h3 className="mb-3 text-sm font-semibold">{t("marketingCollabAnalyticsDailyTrend")}</h3>
            {dailyChart.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">{t("marketingCollabUsageEmpty")}</p>
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyChart} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                    <XAxis dataKey="ymd" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, ...ERP_NUMERIC_CHART_TICK }} tickFormatter={(v) => `${Number(v).toLocaleString()}`} width={56} />
                    <Tooltip
                      formatter={(value) => [`฿${Number(value ?? 0).toLocaleString()}`, t("marketingCollabUsageColDiscount")]}
                      labelFormatter={(_, payload) => {
                        const full = payload?.[0]?.payload?.fullYmd
                        return full ? String(full) : ""
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="discount"
                      stroke={ADMIN_CHART_COLORS[2] ?? ADMIN_CHART_COLORS[0]}
                      strokeWidth={2}
                      dot={dailyChart.length <= 31}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t("marketingCollabAnalyticsCampaignTable")}</h3>
              <AdminTableScroll className="rounded-xl border border-border/80" hint={false}>
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                      <th className="px-3 py-2.5">{t("marketingCollabUsageColCampaign")}</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-right">{t("marketingCollabUsageColOrders")}</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-right">{t("marketingCollabUsageColDiscount")}</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-right">{t("marketingCollabUsageColShare")}</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-right">{t("marketingCollabUsageColStores")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignRows.map((r) => (
                      <tr key={r.campaignId} className="border-b border-border/40 last:border-0">
                        <td className="px-3 py-2.5 text-xs font-medium leading-snug">
                          {r.campaignNo ? `[${r.campaignNo}] ` : ""}
                          {r.topic || r.campaignId}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.orderCount.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-rose-700 dark:text-rose-300">
                          -฿{r.discountAmount.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {sharePercent(r.discountAmount, totals.discountAmount)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.storeCount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminTableScroll>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t("marketingCollabAnalyticsStoreTable")}</h3>
              <AdminTableScroll className="rounded-xl border border-border/80" hint={false}>
                <table className="w-full min-w-[480px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                      <th className="px-3 py-2.5">{t("marketingCollabUsageStoreColStore")}</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-right">{t("marketingCollabUsageColOrders")}</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-right">{t("marketingCollabUsageColDiscount")}</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-right">{t("marketingCollabUsageColShare")}</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-right">{t("marketingCollabUsageStatCampaigns")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storeRows.map((r) => (
                      <tr key={r.storeCode} className="border-b border-border/40 last:border-0">
                        <td className="px-3 py-2.5 text-xs font-medium leading-snug">{formatStoreLabel(r.storeCode)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.orderCount.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-rose-700 dark:text-rose-300">
                          -฿{r.discountAmount.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {sharePercent(r.discountAmount, totals.discountAmount)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.campaignCount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminTableScroll>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
