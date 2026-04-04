"use client"

import * as React from "react"
import { Search, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { MarketingInfluencer, MarketingCampaign } from "@/lib/api-client"
import {
  getBangkokCurrentMonthRangeYmd,
  getBangkokRolling30DayRangeYmd,
} from "@/lib/collab-overview-period"

type TFn = (key: string) => string

type InquiryStatusFilter = "all" | "draft" | "ongoing" | "finish" | "unlinked"

const overviewSelectClass =
  "h-8 w-full min-w-[6rem] max-w-[9rem] shrink-0 rounded-md border border-input bg-background px-1.5 text-[11px] disabled:opacity-60 cursor-pointer appearance-none"

function parseFollowers(s: string): number {
  const x = String(s || "").trim().toUpperCase()
  if (!x) return 0
  const m = x.match(/^([\d.]+)\s*([KM])?$/i)
  if (!m) return 0
  let n = parseFloat(m[1])
  if (m[2] === "K") n *= 1000
  else if (m[2] === "M") n *= 1000000
  return Math.floor(n)
}

function getCpf(budget: number, followersStr: string): number | null {
  const f = parseFollowers(followersStr)
  if (f <= 0 || budget <= 0) return null
  return budget / f
}

function infOverlapsInquiryPeriod(
  shooting: string | null | undefined,
  publish: string | null | undefined,
  from: string,
  to: string
): boolean {
  const pf = from.trim()
  const pt = to.trim()
  if (!pf && !pt) return true
  const s = (shooting || "").trim()
  const p = (publish || "").trim()
  const e = p || s
  const start = s || e
  const end = p || s
  if (pf && end < pf) return false
  if (pt && start > pt) return false
  return true
}

export function MarketingInfluencersOverviewTab(props: {
  influencers: MarketingInfluencer[]
  campaigns: MarketingCampaign[]
  loading: boolean
  t: TFn
  formatInfPeriodLine: (shooting?: string | null, publish?: string | null) => string
  campaignLabel: (id: string | null | undefined) => string
  campaignStatusLabel: (status: string) => string
  campaignStatusBadgeClass: (status: string) => string
  onOpenComposeGoTo: (i: MarketingInfluencer) => void
  onComposeQuickEdit: (i: MarketingInfluencer) => void
  onDelete: (i: MarketingInfluencer) => void
  /** 인플 풀 등에서 전체 조회로 넘어올 때 검색어 자동 반영 */
  applySearchRequest?: { token: number; query: string } | null
}) {
  const {
    influencers,
    campaigns,
    loading,
    t,
    formatInfPeriodLine,
    campaignLabel,
    campaignStatusLabel,
    campaignStatusBadgeClass,
    onOpenComposeGoTo,
    onComposeQuickEdit,
    onDelete,
    applySearchRequest,
  } = props

  const [periodFrom, setPeriodFrom] = React.useState(() => getBangkokRolling30DayRangeYmd().from)
  const [periodTo, setPeriodTo] = React.useState(() => getBangkokRolling30DayRangeYmd().to)
  const [searchDraft, setSearchDraft] = React.useState("")
  const [searchQuery, setSearchQuery] = React.useState("")
  const [inquiryStatusFilter, setInquiryStatusFilter] = React.useState<InquiryStatusFilter>("all")
  const lastApplySearchToken = React.useRef(0)

  React.useEffect(() => {
    if (!applySearchRequest) return
    const { token, query } = applySearchRequest
    if (token <= 0 || token <= lastApplySearchToken.current) return
    lastApplySearchToken.current = token
    const q = query.trim()
    setSearchDraft(q)
    setSearchQuery(q)
  }, [applySearchRequest])

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

  const filteredRows = React.useMemo(() => {
    let rows = influencers.filter((i) => infOverlapsInquiryPeriod(i.shootingDate, i.publishDate, periodFrom, periodTo))
    if (inquiryStatusFilter !== "all") {
      rows = rows.filter((i) => {
        const cid = i.campaignId ? String(i.campaignId) : ""
        const camp = cid ? campaignById.get(cid) : undefined
        if (inquiryStatusFilter === "unlinked") {
          return !cid || !camp
        }
        if (!camp) return false
        return camp.status === inquiryStatusFilter
      })
    }
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      rows = rows.filter((i) => {
        const camp = i.campaignId ? campaignById.get(String(i.campaignId)) : undefined
        const links = i.platformLinks || {}
        const linkStr = Object.values(links)
          .map((x) => String(x || "").trim())
          .filter(Boolean)
          .join(" ")
        const menuStr = (i.providedMenus ?? [])
          .map((m) => {
            const q = Math.max(1, Math.floor(Number(m.quantity) || 1))
            return `${q}×${m.name} ${m.code}`
          })
          .join(" ")
        const blob = [
          i.name,
          i.contactName,
          i.contactPhone,
          menuStr,
          i.followers,
          i.contentTopic,
          i.contentFormat,
          i.branchReview,
          i.note,
          i.campaignNo,
          i.hireType,
          linkStr,
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
  }, [influencers, periodFrom, periodTo, inquiryStatusFilter, searchQuery, campaignById])

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/70 bg-muted/10 px-2 py-2 sm:px-3">
        <div className="flex flex-wrap items-end gap-x-2 gap-y-2">
          <div className="flex flex-col gap-0.5">
            <Label className="whitespace-nowrap text-[9px] leading-tight text-muted-foreground">
              {t("marketingCollabOverviewPeriodFrom")}
            </Label>
            <Input
              type="date"
              className="h-8 w-[8.5rem] px-2 py-0 text-[11px] leading-tight"
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <Label className="whitespace-nowrap text-[9px] leading-tight text-muted-foreground">
              {t("marketingCollabOverviewPeriodTo")}
            </Label>
            <Input
              type="date"
              className="h-8 w-[8.5rem] px-2 py-0 text-[11px] leading-tight"
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 px-2 text-[11px]"
            onClick={resetPeriodToThisMonth}
          >
            {t("marketingCollabOverviewPeriodResetMonth")}
          </Button>
          <div className="flex flex-col gap-0.5">
            <Label className="whitespace-nowrap text-[9px] leading-tight text-muted-foreground">
              {t("marketingAdsFilterStatus")}
            </Label>
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
          <div className="flex min-w-[min(100%,10rem)] flex-1 flex-col gap-0.5 basis-[14rem] sm:min-w-[12rem] sm:basis-0">
            <Label className="inline-flex items-center gap-1 text-[9px] leading-tight text-muted-foreground">
              <Search className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
              {t("search")}
            </Label>
            <div className="flex gap-1.5">
              <Input
                className="h-8 min-w-0 flex-1 px-2 py-0 text-[11px] leading-tight"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    runSearch()
                  }
                }}
                placeholder={t("marketingInfluencersSearchPlaceholder")}
                disabled={loading}
                aria-label={t("search")}
              />
              <Button
                type="button"
                variant="default"
                size="sm"
                className="h-8 shrink-0 px-2.5 text-[11px] sm:px-3"
                onClick={runSearch}
                disabled={loading}
              >
                {t("btn_query")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : filteredRows.length === 0 ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          {t("marketingInfluencersInquiryEmpty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/80">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                <th className="min-w-[120px] px-3 py-2.5">{t("marketingInfluencersInquiryColName")}</th>
                <th className="whitespace-nowrap px-3 py-2.5">{t("marketingInfluencersInquiryColPeriod")}</th>
                <th className="min-w-[140px] px-3 py-2.5">{t("marketingInfluencersInquiryColSummary")}</th>
                <th className="min-w-[160px] px-3 py-2.5">{t("marketingAdsInquiryColCampaign")}</th>
                <th className="whitespace-nowrap px-3 py-2.5">{t("marketingAdsInquiryColCampStatus")}</th>
                <th className="min-w-[120px] whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                  {t("marketingInfluencersInquiryColCost")}
                </th>
                <th className="min-w-[200px] whitespace-nowrap px-3 py-2.5 text-right">{t("marketingAdsInquiryColAction")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((i) => {
                const cid = i.campaignId ? String(i.campaignId) : ""
                const camp = cid ? campaignById.get(cid) : undefined
                const st = camp?.status ?? ""
                const unlinked = !cid || !camp
                const statusText = unlinked ? t("marketingAdsStatusUnlinked") : campaignStatusLabel(st)
                const periodLine = formatInfPeriodLine(i.shootingDate, i.publishDate) || "—"
                const cpf = getCpf(i.budget ?? 0, i.followers ?? "")
                return (
                  <tr key={i.id} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2.5 align-top">
                      <div className="font-semibold leading-snug">
                        {(i.contactName || "").trim() || i.name || "—"}
                      </div>
                      {(i.contactName || "").trim() && (i.name || "").trim() ? (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">@{i.name.trim()}</div>
                      ) : null}
                      {(i.contactPhone ?? "").trim() ? (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{(i.contactPhone ?? "").trim()}</div>
                      ) : null}
                      {i.followers ? (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{i.followers}</div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 align-top text-xs text-muted-foreground">{periodLine}</td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="space-y-0.5 text-xs">
                        {i.contentTopic ? <p className="font-medium text-foreground">{i.contentTopic}</p> : null}
                        {i.contentFormat ? <p className="text-muted-foreground">{i.contentFormat}</p> : null}
                        {i.branchReview ? <p className="line-clamp-2 text-[11px] text-muted-foreground">{i.branchReview}</p> : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      {cid ? (
                        <div className="space-y-0.5">
                          {i.campaignNo?.trim() ? (
                            <span className="font-mono text-[11px] text-muted-foreground">{i.campaignNo.trim()}</span>
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
                      {i.budget > 0 || (i.actualCost ?? 0) > 0 ? (
                        <div className="space-y-0.5">
                          <div>
                            ฿{(i.budget || 0).toLocaleString()}
                            <span className="text-muted-foreground"> · </span>
                            ฿{(i.actualCost ?? 0).toLocaleString()}
                          </div>
                          {cpf != null ? (
                            <div className="text-[11px] font-medium text-primary">CPF ฿{cpf.toFixed(2)}</div>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={() => onOpenComposeGoTo(i)}>
                          {t("marketingAdsOpenComposeTab")}
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => onComposeQuickEdit(i)}>
                          {t("posEdit")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => onDelete(i)}
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
