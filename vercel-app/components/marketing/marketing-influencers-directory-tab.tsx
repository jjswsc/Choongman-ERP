"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import type { MarketingInfluencer, MarketingCampaign } from "@/lib/api-client"
import {
  getBangkokCurrentMonthRangeYmd,
  getBangkokRolling30DayRangeYmd,
} from "@/lib/collab-overview-period"

type TFn = (key: string) => string

const LINK_ORDER = ["instagram", "tiktok", "youtube", "facebook", "lemon8"] as const

function infOverlapsDirectoryPeriod(
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

function platformSignature(links: Record<string, string> | undefined): string {
  const parts: string[] = []
  for (const k of LINK_ORDER) {
    const u = String(links?.[k] ?? "")
      .trim()
      .toLowerCase()
    if (u) parts.push(`${k}:${u}`)
  }
  return parts.join("|") || "_nolink"
}

export function influencerDirectoryKey(i: MarketingInfluencer): string {
  const phone = (i.contactPhone ?? "").replace(/\D/g, "")
  const cn = (i.contactName ?? "").trim().toLowerCase()
  const sig = platformSignature(i.platformLinks)
  if (cn || phone) {
    const fallback = (i.name ?? "").trim().toLowerCase()
    return `${cn || fallback}\tphone:${phone}\t${sig}`
  }
  const n = (i.name ?? "").trim().toLowerCase()
  return `${n}\t${sig}`
}

function displayNameForGroup(members: MarketingInfluencer[]): string {
  const contacts = members.map((m) => (m.contactName || "").trim()).filter(Boolean)
  if (contacts.length) return [...contacts].sort((a, b) => b.length - a.length)[0]!
  const names = members.map((m) => (m.name || "").trim()).filter(Boolean)
  if (!names.length) return "—"
  return [...names].sort((a, b) => b.length - a.length)[0]!
}

function parseYmd(s: string | null | undefined): number {
  const t = (s || "").trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return 0
  return new Date(`${t}T12:00:00+07:00`).getTime()
}

function pickLatestMember(members: MarketingInfluencer[]): MarketingInfluencer {
  return [...members].sort((a, b) => {
    const pb = parseYmd(b.publishDate)
    const pa = parseYmd(a.publishDate)
    if (pb !== pa) return pb - pa
    const sb = parseYmd(b.shootingDate)
    const sa = parseYmd(a.shootingDate)
    return sb - sa
  })[0]!
}

function primaryLinksLine(i: MarketingInfluencer): string {
  const links = i.platformLinks || {}
  const bits: string[] = []
  for (const k of LINK_ORDER) {
    const u = String(links[k] ?? "").trim()
    if (u) bits.push(`${k}: ${u.length > 48 ? `${u.slice(0, 46)}…` : u}`)
  }
  return bits.slice(0, 2).join(" · ") || "—"
}

type InfDirectoryAgg = {
  key: string
  members: MarketingInfluencer[]
  campaignIds: string[]
}

export function MarketingInfluencersDirectoryTab(props: {
  influencers: MarketingInfluencer[]
  campaigns: MarketingCampaign[]
  stores: string[]
  storesLoading: boolean
  loading: boolean
  t: TFn
  campaignLabel: (id: string | null | undefined) => string
  onComposeQuickEdit: (i: MarketingInfluencer) => void
  onOpenInquiryWithSearch: (name: string) => void
}) {
  const {
    influencers,
    campaigns,
    stores,
    storesLoading,
    loading,
    t,
    campaignLabel,
    onComposeQuickEdit,
    onOpenInquiryWithSearch,
  } = props

  const [periodFrom, setPeriodFrom] = React.useState(() => getBangkokRolling30DayRangeYmd().from)
  const [periodTo, setPeriodTo] = React.useState(() => getBangkokRolling30DayRangeYmd().to)
  const [storeFilter, setStoreFilter] = React.useState("")
  const [search, setSearch] = React.useState("")

  const resetPeriodToThisMonth = React.useCallback(() => {
    const r = getBangkokCurrentMonthRangeYmd()
    setPeriodFrom(r.from)
    setPeriodTo(r.to)
  }, [])

  const clearPeriod = React.useCallback(() => {
    setPeriodFrom("")
    setPeriodTo("")
  }, [])

  const campaignById = React.useMemo(() => {
    const m = new Map<string, MarketingCampaign>()
    for (const c of campaigns) m.set(String(c.id), c)
    return m
  }, [campaigns])

  const baseFiltered = React.useMemo(() => {
    const store = storeFilter.trim()
    return influencers.filter((i) => {
      if (!infOverlapsDirectoryPeriod(i.shootingDate, i.publishDate, periodFrom, periodTo)) return false
      const cid = i.campaignId ? String(i.campaignId) : ""
      if (!store) return true
      const camp = cid ? campaignById.get(cid) : undefined
      const br = camp?.branches ?? []
      if (br.length > 0 && !br.includes(store)) return false
      return true
    })
  }, [influencers, periodFrom, periodTo, storeFilter, campaignById])

  const aggs = React.useMemo(() => {
    const map = new Map<string, InfDirectoryAgg>()
    for (const i of baseFiltered) {
      const k = influencerDirectoryKey(i)
      let g = map.get(k)
      if (!g) {
        g = { key: k, members: [], campaignIds: [] }
        map.set(k, g)
      }
      g.members.push(i)
      const cid = i.campaignId ? String(i.campaignId) : ""
      if (cid && !g.campaignIds.includes(cid)) g.campaignIds.push(cid)
    }
    const list = [...map.values()]
    const q = search.trim().toLowerCase()
    const filtered = !q
      ? list
      : list.filter((g) => {
          const name = displayNameForGroup(g.members).toLowerCase()
          const blob = g.members
            .map((m) => {
              const links = m.platformLinks || {}
              const menus = (m.providedMenus ?? [])
                .map((x) => {
                  const q = Math.max(1, Math.floor(Number(x.quantity) || 1))
                  return `${q}×${x.name} ${x.code}`
                })
                .join(" ")
              return [
                m.name,
                m.contactName,
                m.contactPhone,
                menus,
                m.followers,
                m.contentTopic,
                m.note,
                ...Object.values(links),
                m.campaignNo,
              ]
                .filter(Boolean)
                .join(" ")
            })
            .join(" ")
            .toLowerCase()
          const campBlob = g.campaignIds
            .map((id) => {
              const c = campaignById.get(id)
              return [c?.topic, c?.campaignNo, campaignLabel(id)].filter(Boolean).join(" ")
            })
            .join(" ")
            .toLowerCase()
          return name.includes(q) || blob.includes(q) || campBlob.includes(q)
        })
    return filtered.sort((a, b) =>
      displayNameForGroup(a.members).localeCompare(displayNameForGroup(b.members), "ko")
    )
  }, [baseFiltered, search, campaignById, campaignLabel])

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-muted-foreground">{t("marketingInfluencersDirectoryHint")}</p>

      <div className="space-y-3 rounded-lg border border-border/70 bg-muted/10 p-3 sm:px-4">
        <p className="text-[11px] font-medium text-muted-foreground">{t("marketingCollabOverviewPeriodHint")}</p>
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
            <Button type="button" variant="ghost" size="sm" className="h-9 text-xs" onClick={clearPeriod}>
              {t("marketingCollabOverviewPeriodClearAll")}
            </Button>
          </div>
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
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 flex-1 space-y-1 sm:min-w-[14rem]">
            <Label className="text-[10px] text-muted-foreground">{t("search")}</Label>
            <Input
              className="h-9 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("marketingInfluencersDirectorySearchPh")}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : aggs.length === 0 ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          {t("marketingInfluencersDirectoryEmpty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/80">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                <th className="min-w-[120px] px-3 py-2.5">{t("marketingInfluencersDirectoryColName")}</th>
                <th className="whitespace-nowrap px-3 py-2.5">{t("marketingInfluencersDirectoryColFollowers")}</th>
                <th className="min-w-[200px] px-3 py-2.5">{t("marketingInfluencersDirectoryColLinks")}</th>
                <th className="whitespace-nowrap px-3 py-2.5">{t("marketingInfluencersDirectoryColCampaignCount")}</th>
                <th className="min-w-[200px] px-3 py-2.5">{t("marketingInfluencersDirectoryColCampaigns")}</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">{t("marketingCollabOverviewColAction")}</th>
              </tr>
            </thead>
            <tbody>
              {aggs.map((g) => {
                const latest = pickLatestMember(g.members)
                const titles = g.campaignIds
                  .map((id) => campaignById.get(id)?.topic)
                  .filter(Boolean) as string[]
                const showHandle = (latest.contactName || "").trim() && (latest.name || "").trim()
                return (
                  <tr key={g.key} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2.5 align-top">
                      <div className="font-medium leading-snug">{displayNameForGroup(g.members)}</div>
                      {showHandle ? (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">@{latest.name.trim()}</div>
                      ) : null}
                      {(latest.contactPhone ?? "").trim() ? (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{(latest.contactPhone ?? "").trim()}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 align-top text-xs text-muted-foreground">
                      {(latest.followers || "").trim() || "—"}
                    </td>
                    <td className="max-w-[280px] px-3 py-2.5 align-top text-xs leading-snug text-muted-foreground break-words">
                      {primaryLinksLine(latest)}
                    </td>
                    <td className="px-3 py-2.5 align-top tabular-nums text-xs">{g.campaignIds.length}</td>
                    <td className="px-3 py-2.5 align-top text-xs leading-snug text-muted-foreground">
                      {titles.slice(0, 4).join(" · ")}
                      {titles.length > 4 ? ` … (+${titles.length - 4})` : ""}
                      {!titles.length ? "—" : ""}
                    </td>
                    <td className="px-3 py-2.5 align-top text-right">
                      <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => onComposeQuickEdit(latest)}
                        >
                          {t("marketingInfluencersDirectoryEditLatest")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => onOpenInquiryWithSearch(displayNameForGroup(g.members))}
                        >
                          {t("marketingInfluencersDirectoryOpenInquiry")}
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
