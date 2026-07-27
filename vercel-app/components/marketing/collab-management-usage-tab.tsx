"use client"

import * as React from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { MarketingCampaign } from "@/lib/api-client"
import { getCollabDiscountUsage, type CollabDiscountUsageRow } from "@/lib/api-client"
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

export function CollabManagementUsageTab(props: {
  campaigns: MarketingCampaign[]
  t: TFn
}) {
  const { campaigns, t } = props
  const { stores, loading: storesLoading, formatStoreLabel } = useStoreList()
  const [periodFrom, setPeriodFrom] = React.useState(() => getBangkokTodayRangeYmd().from)
  const [periodTo, setPeriodTo] = React.useState(() => getBangkokTodayRangeYmd().to)
  const [storeFilter, setStoreFilter] = React.useState("")
  const [campaignFilter, setCampaignFilter] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [rows, setRows] = React.useState<CollabDiscountUsageRow[]>([])
  const [totals, setTotals] = React.useState({ orderCount: 0, discountAmount: 0, campaignCount: 0 })
  const [sourceNote, setSourceNote] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    if (!periodFrom || !periodTo || periodFrom > periodTo) {
      setError(t("marketingCollabUsageInvalidPeriod"))
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await getCollabDiscountUsage({
        startStr: periodFrom,
        endStr: periodTo,
        ...(storeFilter.trim() ? { store: storeFilter.trim() } : {}),
        ...(campaignFilter.trim() ? { campaignId: campaignFilter.trim() } : {}),
      })
      if (!res.success) {
        setRows([])
        setTotals({ orderCount: 0, discountAmount: 0, campaignCount: 0 })
        setError(res.message || t("marketingCollabUsageLoadError"))
        setSourceNote(null)
        return
      }
      setRows(Array.isArray(res.rows) ? res.rows : [])
      setTotals({
        orderCount: res.totals?.orderCount ?? 0,
        discountAmount: res.totals?.discountAmount ?? 0,
        campaignCount: res.totals?.campaignCount ?? 0,
      })
      if (res.source === "unavailable") {
        setSourceNote(res.message || t("marketingCollabUsageSchemaMissing"))
      } else {
        setSourceNote(null)
      }
    } catch (e) {
      setRows([])
      setTotals({ orderCount: 0, discountAmount: 0, campaignCount: 0 })
      setError(String(e))
      setSourceNote(null)
    } finally {
      setLoading(false)
    }
  }, [campaignFilter, periodFrom, periodTo, storeFilter, t])

  React.useEffect(() => {
    void load()
  }, [load])

  const handleDownload = () => {
    const lines = [
      t("marketingCollabUsageCsvTitle")
        .replace("{from}", periodFrom)
        .replace("{to}", periodTo),
      "",
      t("marketingCollabUsageCsvHeader"),
      ...rows.map((r) => {
        const no = (r.campaignNo || "").replace(/"/g, '""')
        const topic = (r.topic || "").replace(/"/g, '""')
        return `"${no}","${topic}",${r.orderCount},${r.discountAmount},${r.storeCount}`
      }),
      "",
      `${t("marketingCollabUsageCsvTotalOrders")},${totals.orderCount}`,
      `${t("marketingCollabUsageCsvTotalDiscount")},${totals.discountAmount}`,
    ]
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `collab-discount-usage-${periodFrom}_${periodTo}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-muted-foreground">{t("marketingCollabUsageHint")}</p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{t("marketingCollabUsageLegacyNote")}</p>

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
          <div className="min-w-[12rem] flex-1 space-y-1 lg:max-w-[22rem]">
            <Label className="text-[10px] text-muted-foreground">{t("marketingCollabUsageCampaignFilter")}</Label>
            <select
              value={campaignFilter || "_all"}
              onChange={(e) => setCampaignFilter(e.target.value === "_all" ? "" : e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="_all">{t("marketingMonthlyAllCampaigns")}</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {campaignListLabel(c)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => void load()} disabled={loading}>
              {loading ? t("marketingSavingShort") : t("marketingMonthlyBtnLoad")}
            </Button>
            <Button type="button" size="sm" className="h-9 gap-1" onClick={handleDownload} disabled={rows.length === 0}>
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

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        <div className="rounded-lg border border-border bg-card px-3 py-2">
          <div className="text-[10px] text-muted-foreground">{t("marketingCollabUsageStatCampaigns")}</div>
          <div className="text-lg font-semibold tabular-nums">{totals.campaignCount}</div>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2">
          <div className="text-[10px] text-muted-foreground">{t("marketingCollabUsageStatOrders")}</div>
          <div className="text-lg font-semibold tabular-nums">{totals.orderCount.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 col-span-2 sm:col-span-1">
          <div className="text-[10px] text-muted-foreground">{t("marketingCollabUsageStatDiscount")}</div>
          <div className="text-lg font-semibold tabular-nums">฿{totals.discountAmount.toLocaleString()}</div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          {t("marketingCollabUsageEmpty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/80">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                <th className="px-3 py-2.5">{t("marketingCollabUsageColCampaignNo")}</th>
                <th className="min-w-[160px] px-3 py-2.5">{t("marketingCollabUsageColCampaign")}</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">{t("marketingCollabUsageColOrders")}</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">{t("marketingCollabUsageColDiscount")}</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">{t("marketingCollabUsageColStores")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.campaignId} className="border-b border-border/40 last:border-0">
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.campaignNo || "—"}</td>
                  <td className="px-3 py-2.5 font-medium leading-snug">{r.topic || r.campaignId}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.orderCount.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-rose-700 dark:text-rose-300">
                    -฿{r.discountAmount.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.storeCount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
