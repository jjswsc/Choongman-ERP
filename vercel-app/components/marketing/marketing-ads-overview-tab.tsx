"use client"

import * as React from "react"
import { Link2, Search, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { MarketingAd, MarketingCampaign } from "@/lib/api-client"
import { getBangkokCurrentMonthRangeYmd } from "@/lib/collab-overview-period"

type TFn = (key: string) => string

type InquiryStatusFilter = "all" | "draft" | "ongoing" | "finish" | "unlinked"

const overviewSelectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-xs disabled:opacity-60 cursor-pointer appearance-none"

function adOverlapsInquiryPeriod(
  publish: string | null | undefined,
  periodEnd: string | null | undefined,
  from: string,
  to: string
): boolean {
  const pf = from.trim()
  const pt = to.trim()
  if (!pf && !pt) return true
  const s = (publish || "").trim()
  const eRaw = (periodEnd || "").trim()
  const e = eRaw || s
  const start = s || e
  const end = e || s
  if (pf && end < pf) return false
  if (pt && start > pt) return false
  return true
}

export function MarketingAdsOverviewTab(props: {
  ads: MarketingAd[]
  campaigns: MarketingCampaign[]
  loading: boolean
  t: TFn
  formatAdPeriodLine: (start?: string | null, end?: string | null) => string
  campaignLabel: (id: string | null | undefined) => string
  campaignStatusLabel: (status: string) => string
  campaignStatusBadgeClass: (status: string) => string
  platformBadgeClass: (platform: string) => string
  onOpenComposeGoTo: (a: MarketingAd) => void
  onComposeQuickEdit: (a: MarketingAd) => void
  onDelete: (a: MarketingAd) => void
}) {
  const {
    ads,
    campaigns,
    loading,
    t,
    formatAdPeriodLine,
    campaignLabel,
    campaignStatusLabel,
    campaignStatusBadgeClass,
    platformBadgeClass,
    onOpenComposeGoTo,
    onComposeQuickEdit,
    onDelete,
  } = props

  const [periodFrom, setPeriodFrom] = React.useState(() => getBangkokCurrentMonthRangeYmd().from)
  const [periodTo, setPeriodTo] = React.useState(() => getBangkokCurrentMonthRangeYmd().to)
  const [searchDraft, setSearchDraft] = React.useState("")
  const [searchQuery, setSearchQuery] = React.useState("")
  const [inquiryPlatformFilter, setInquiryPlatformFilter] = React.useState("")
  const [inquiryStatusFilter, setInquiryStatusFilter] = React.useState<InquiryStatusFilter>("all")

  const resetPeriodToThisMonth = React.useCallback(() => {
    const r = getBangkokCurrentMonthRangeYmd()
    setPeriodFrom(r.from)
    setPeriodTo(r.to)
  }, [])

  const runSearch = React.useCallback(() => {
    setSearchQuery(searchDraft.trim())
  }, [searchDraft])

  const campaignById = React.useMemo(() => {
    const m = new Map<string, MarketingCampaign>()
    for (const c of campaigns) m.set(String(c.id), c)
    return m
  }, [campaigns])

  const inquiryPlatformOptions = React.useMemo(() => {
    const s = new Set<string>()
    for (const a of ads) {
      const p = (a.platform || "").trim()
      if (p) s.add(p)
    }
    return [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
  }, [ads])

  const filteredRows = React.useMemo(() => {
    let rows = ads.filter((a) => adOverlapsInquiryPeriod(a.publishDate, a.periodEndDate, periodFrom, periodTo))
    const plat = inquiryPlatformFilter.trim().toLowerCase()
    if (plat) {
      rows = rows.filter((a) => (a.platform || "").trim().toLowerCase() === plat)
    }
    if (inquiryStatusFilter !== "all") {
      rows = rows.filter((a) => {
        const cid = a.campaignId ? String(a.campaignId) : ""
        const camp = cid ? campaignById.get(cid) : undefined
        if (inquiryStatusFilter === "unlinked") {
          return !cid || !camp
        }
        const st = camp?.status ?? ""
        if (!camp) return false
        return st === inquiryStatusFilter
      })
    }
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      rows = rows.filter((a) => {
        const camp = a.campaignId ? campaignById.get(String(a.campaignId)) : undefined
        const blob = [
          a.platform,
          a.contentTopic,
          (a.contentDetail || "").trim(),
          a.contentFormat,
          a.contentPillar,
          a.postLink,
          a.campaignNo,
          String(a.boostBudget ?? ""),
          String(a.actualSpent ?? ""),
          camp?.topic,
          camp?.campaignNo,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return blob.includes(q)
      })
    }
    return rows
  }, [ads, periodFrom, periodTo, inquiryPlatformFilter, inquiryStatusFilter, searchQuery, campaignById])

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border border-border/70 bg-muted/10 p-3 sm:px-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="flex flex-wrap gap-2">
            <div className="min-w-[9rem] space-y-1">
              <Label className="text-[10px] text-muted-foreground">{t("marketingCollabOverviewPeriodFrom")}</Label>
              <Input type="date" className="h-9" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
            </div>
            <div className="min-w-[9rem] space-y-1">
              <Label className="text-[10px] text-muted-foreground">{t("marketingCollabOverviewPeriodTo")}</Label>
              <Input type="date" className="h-9" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="h-9 text-xs" onClick={resetPeriodToThisMonth}>
              {t("marketingCollabOverviewPeriodResetMonth")}
            </Button>
          </div>
          <div className="min-w-[10rem] flex-1 space-y-1 lg:max-w-[11rem]">
            <Label className="text-[10px] text-muted-foreground">{t("marketingAdsFilterPlatformOptional")}</Label>
            <select
              value={inquiryPlatformFilter}
              onChange={(e) => setInquiryPlatformFilter(e.target.value)}
              className={overviewSelectClass}
              disabled={loading}
            >
              <option value="">{t("all")}</option>
              {inquiryPlatformOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[10rem] flex-1 space-y-1 lg:max-w-[11rem]">
            <Label className="text-[10px] text-muted-foreground">{t("marketingAdsFilterStatus")}</Label>
            <select
              value={inquiryStatusFilter}
              onChange={(e) => setInquiryStatusFilter(e.target.value as InquiryStatusFilter)}
              className={overviewSelectClass}
              disabled={loading}
            >
              <option value="all">{t("all")}</option>
              <option value="ongoing">{t("marketingAdsStatusOngoing")}</option>
              <option value="draft">{t("marketingAdsStatusDraft")}</option>
              <option value="finish">{t("marketingAdsStatusFinish")}</option>
              <option value="unlinked">{t("marketingAdsStatusUnlinked")}</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5 border-t border-border/50 pt-3">
          <Label className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            {t("search")}
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <Input
              className="h-10 flex-1 text-sm"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  runSearch()
                }
              }}
              placeholder={t("marketingAdsSearchPlaceholder")}
              disabled={loading}
              aria-label={t("search")}
            />
            <Button
              type="button"
              variant="default"
              className="h-10 shrink-0 px-6 sm:min-w-[5.5rem]"
              onClick={runSearch}
              disabled={loading}
            >
              {t("btn_query")}
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : filteredRows.length === 0 ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          {t("marketingAdsInquiryEmpty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/80">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                <th className="whitespace-nowrap px-3 py-2.5">{t("marketingAdsInquiryColPlatform")}</th>
                <th className="whitespace-nowrap px-3 py-2.5">{t("marketingAdsInquiryColPeriod")}</th>
                <th className="min-w-[180px] px-3 py-2.5">{t("marketingAdsInquiryColTopic")}</th>
                <th className="min-w-[160px] px-3 py-2.5">{t("marketingAdsInquiryColCampaign")}</th>
                <th className="whitespace-nowrap px-3 py-2.5">{t("marketingAdsInquiryColCampStatus")}</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{t("marketingAdsInquiryColSpend")}</th>
                <th className="w-10 whitespace-nowrap px-3 py-2.5 text-center">{t("marketingAdsInquiryColLink")}</th>
                <th className="min-w-[200px] whitespace-nowrap px-3 py-2.5 text-right">{t("marketingAdsInquiryColAction")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((a) => {
                const cid = a.campaignId ? String(a.campaignId) : ""
                const camp = cid ? campaignById.get(cid) : undefined
                const st = camp?.status ?? ""
                const unlinked = !cid || !camp
                const statusText = unlinked ? t("marketingAdsStatusUnlinked") : campaignStatusLabel(st)
                const periodLine = formatAdPeriodLine(a.publishDate, a.periodEndDate) || "—"
                return (
                  <tr key={a.id} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2.5 align-top">
                      <Badge
                        className={cn(
                          "px-2 py-0.5 text-[10px] font-semibold capitalize",
                          platformBadgeClass(a.platform || "")
                        )}
                      >
                        {a.platform || "—"}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 align-top text-xs text-muted-foreground">{periodLine}</td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="space-y-1">
                        {a.contentTopic ? <p className="font-medium leading-snug">{a.contentTopic}</p> : null}
                        {(a.contentFormat || a.contentPillar) && (
                          <p className="text-[11px] text-muted-foreground">
                            {[a.contentFormat, a.contentPillar].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        {(a.contentDetail || "").trim() ? (
                          <p className="line-clamp-2 text-[11px] text-muted-foreground">{(a.contentDetail || "").trim()}</p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      {cid ? (
                        <div className="space-y-0.5">
                          {a.campaignNo?.trim() ? (
                            <span className="font-mono text-[11px] text-muted-foreground">{a.campaignNo.trim()}</span>
                          ) : null}
                          <p className="text-xs leading-snug text-foreground">{campaignLabel(cid) || cid}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                          unlinked
                            ? "border border-dashed border-amber-500/60 text-amber-800 dark:text-amber-200"
                            : campaignStatusBadgeClass(st)
                        )}
                      >
                        {statusText}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 align-top text-right text-xs tabular-nums text-foreground">
                      {a.boostBudget > 0 || a.actualSpent > 0 ? (
                        <>
                          ฿{(a.boostBudget || 0).toLocaleString()}
                          <span className="text-muted-foreground"> · </span>
                          ฿{(a.actualSpent || 0).toLocaleString()}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-middle text-center">
                      {a.postLink ? (
                        <a
                          href={a.postLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex text-primary hover:underline"
                          title={a.postLink}
                        >
                          <Link2 className="h-4 w-4" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={() => onOpenComposeGoTo(a)}>
                          {t("marketingAdsOpenComposeTab")}
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => onComposeQuickEdit(a)}>
                          {t("posEdit")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => onDelete(a)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
