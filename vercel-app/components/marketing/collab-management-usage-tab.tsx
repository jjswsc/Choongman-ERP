"use client"

import * as React from "react"
import { Download, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { MarketingCampaign } from "@/lib/api-client"
import { getCollabDiscountUsage, type CollabDiscountUsageRow } from "@/lib/api-client"
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

function rowMatchesTokens(r: CollabDiscountUsageRow, tokens: string[]): boolean {
  if (tokens.length === 0) return true
  const blob = [r.campaignNo, r.topic, r.campaignId].join(" ").toLowerCase()
  return tokens.every((t) => blob.includes(t))
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
  /** 캠페인 검색어(초안) — 번호·주제 */
  const [campaignSearchDraft, setCampaignSearchDraft] = React.useState("")
  /** 특정 캠페인 선택 시 API에 id 전달 (비우면 기간·매장만) */
  const [selectedCampaignId, setSelectedCampaignId] = React.useState("")
  const [campaignPickerOpen, setCampaignPickerOpen] = React.useState(false)

  const [loading, setLoading] = React.useState(false)
  const [hasQueried, setHasQueried] = React.useState(false)
  const [rows, setRows] = React.useState<CollabDiscountUsageRow[]>([])
  const [appliedSearchTokens, setAppliedSearchTokens] = React.useState<string[]>([])
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

  const displayRows = React.useMemo(() => {
    if (selectedCampaignId) return rows
    return rows.filter((r) => rowMatchesTokens(r, appliedSearchTokens))
  }, [appliedSearchTokens, rows, selectedCampaignId])

  const displayTotals = React.useMemo(() => {
    if (selectedCampaignId || appliedSearchTokens.length === 0) {
      return totals
    }
    return {
      campaignCount: displayRows.length,
      orderCount: displayRows.reduce((s, r) => s + r.orderCount, 0),
      discountAmount:
        Math.round(displayRows.reduce((s, r) => s + r.discountAmount, 0) * 100) / 100,
    }
  }, [appliedSearchTokens.length, displayRows, selectedCampaignId, totals])

  const load = React.useCallback(async () => {
    if (!periodFrom || !periodTo || periodFrom > periodTo) {
      setError(t("marketingCollabUsageInvalidPeriod"))
      return
    }
    setLoading(true)
    setError(null)
    setHasQueried(true)
    const tokens = selectedCampaignId ? [] : tokenizeSearch(campaignSearchDraft)
    setAppliedSearchTokens(tokens)
    try {
      const res = await getCollabDiscountUsage({
        startStr: periodFrom,
        endStr: periodTo,
        ...(storeFilter.trim() ? { store: storeFilter.trim() } : {}),
        ...(selectedCampaignId.trim() ? { campaignId: selectedCampaignId.trim() } : {}),
      })
      if (!res.success) {
        setRows([])
        setTotals({ orderCount: 0, discountAmount: 0, campaignCount: 0 })
        setError(res.message || t("marketingCollabUsageLoadError"))
        setSourceNote(null)
        return
      }
      const nextRows = Array.isArray(res.rows) ? res.rows : []
      setRows(nextRows)
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
      setCampaignPickerOpen(false)
    }
  }, [campaignSearchDraft, periodFrom, periodTo, selectedCampaignId, storeFilter, t])

  const clearCampaignSelection = React.useCallback(() => {
    setSelectedCampaignId("")
    setCampaignSearchDraft("")
    setCampaignPickerOpen(false)
  }, [])

  const handleDownload = () => {
    const lines = [
      t("marketingCollabUsageCsvTitle")
        .replace("{from}", periodFrom)
        .replace("{to}", periodTo),
      "",
      t("marketingCollabUsageCsvHeader"),
      ...displayRows.map((r) => {
        const no = (r.campaignNo || "").replace(/"/g, '""')
        const topic = (r.topic || "").replace(/"/g, '""')
        return `"${no}","${topic}",${r.orderCount},${r.discountAmount},${r.storeCount}`
      }),
      "",
      `${t("marketingCollabUsageCsvTotalOrders")},${displayTotals.orderCount}`,
      `${t("marketingCollabUsageCsvTotalDiscount")},${displayTotals.discountAmount}`,
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
      <p className="text-[11px] leading-relaxed text-muted-foreground">{t("marketingCollabUsageSearchHint")}</p>

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
              <Search className="h-3.5 w-3.5" />
              {loading ? t("marketingSavingShort") : t("marketingMonthlyBtnLoad")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1"
              onClick={handleDownload}
              disabled={displayRows.length === 0}
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
          {t("marketingCollabUsageNeedQuery")}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[10px] text-muted-foreground">{t("marketingCollabUsageStatCampaigns")}</div>
              <div className="text-lg font-semibold tabular-nums">{displayTotals.campaignCount}</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[10px] text-muted-foreground">{t("marketingCollabUsageStatOrders")}</div>
              <div className="text-lg font-semibold tabular-nums">{displayTotals.orderCount.toLocaleString()}</div>
            </div>
            <div className="col-span-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 sm:col-span-1">
              <div className="text-[10px] text-muted-foreground">{t("marketingCollabUsageStatDiscount")}</div>
              <div className="text-lg font-semibold tabular-nums">฿{displayTotals.discountAmount.toLocaleString()}</div>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : displayRows.length === 0 ? (
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
                  {displayRows.map((r) => (
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
        </>
      )}
    </div>
  )
}
