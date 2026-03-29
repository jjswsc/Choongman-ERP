"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { MarketingCampaign } from "@/lib/api-client"
import { normalizeMarketingCollabDetail, type MarketingCollabDetail } from "@/lib/marketing-collab-detail"
import { campaignMatchesPeriodFilter } from "@/lib/marketing-campaign-filters"
import { getBangkokCurrentMonthRangeYmd } from "@/lib/collab-overview-period"

type TFn = (key: string) => string

function collabDetailOf(c: MarketingCampaign): MarketingCollabDetail {
  return normalizeMarketingCollabDetail(c.collabDetail ?? {})
}

function partnerKey(d: MarketingCollabDetail): string {
  const name = (d.partnerName ?? "").trim().toLowerCase()
  const pt = (d.partnerType ?? "").trim()
  const po = (d.partnerTypeOther ?? "").trim().toLowerCase()
  if (!name && !pt && !po) return "_unset"
  return `${name}\t${pt}\t${po}`
}

function partnerLine(d: MarketingCollabDetail, t: TFn): string {
  const name = (d.partnerName ?? "").trim()
  let type = ""
  switch (d.partnerType) {
    case "enterprise":
      type = t("marketingCollabDetailPartnerTypeEnterprise")
      break
    case "school":
      type = t("marketingCollabDetailPartnerTypeSchool")
      break
    case "public":
      type = t("marketingCollabDetailPartnerTypePublic")
      break
    case "other":
      type = (d.partnerTypeOther ?? "").trim() || t("marketingCollabDetailPartnerTypeOther")
      break
    default:
      type = ""
  }
  if (!name && !type) return "—"
  if (!name) return type
  if (!type) return name
  return `${name} · ${type}`
}

function partnerDisplayName(d: MarketingCollabDetail, t: TFn): string {
  const name = (d.partnerName ?? "").trim()
  if (name) return name
  return t("marketingCollabPartnersUnset")
}

function partnerTypeOnly(d: MarketingCollabDetail, t: TFn): string {
  switch (d.partnerType) {
    case "enterprise":
      return t("marketingCollabDetailPartnerTypeEnterprise")
    case "school":
      return t("marketingCollabDetailPartnerTypeSchool")
    case "public":
      return t("marketingCollabDetailPartnerTypePublic")
    case "other":
      return (d.partnerTypeOther ?? "").trim() || t("marketingCollabDetailPartnerTypeOther")
    default:
      return "—"
  }
}

function statusLabelFn(status: string, t: TFn): string {
  switch (status) {
    case "draft":
      return t("marketingAdsStatusDraft")
    case "ongoing":
      return t("marketingAdsStatusOngoing")
    case "finish":
      return t("marketingAdsStatusFinish")
    default:
      return status
  }
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "ongoing":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/35 dark:text-emerald-200"
    case "finish":
      return "bg-muted text-muted-foreground"
    case "draft":
      return "bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100"
    default:
      return "bg-border text-foreground"
  }
}

type PartnerAgg = {
  key: string
  detail: MarketingCollabDetail
  campaignIds: string[]
  contacts: Set<string>
}

export function CollabManagementOverviewTab(props: {
  campaigns: MarketingCampaign[]
  stores: string[]
  storesLoading: boolean
  loading: boolean
  t: TFn
  allStoresLabel: string
  onGoToEdit: (campaignId: string) => void
}) {
  const { campaigns, stores, storesLoading, loading, t, allStoresLabel, onGoToEdit } = props
  const [subTab, setSubTab] = React.useState<"campaigns" | "partners">("campaigns")
  const [storeFilter, setStoreFilter] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [partnerKeyFilter, setPartnerKeyFilter] = React.useState("")
  const [periodFrom, setPeriodFrom] = React.useState(() => getBangkokCurrentMonthRangeYmd().from)
  const [periodTo, setPeriodTo] = React.useState(() => getBangkokCurrentMonthRangeYmd().to)

  const resetPeriodToThisMonth = React.useCallback(() => {
    const r = getBangkokCurrentMonthRangeYmd()
    setPeriodFrom(r.from)
    setPeriodTo(r.to)
  }, [])

  const clearPeriod = React.useCallback(() => {
    setPeriodFrom("")
    setPeriodTo("")
  }, [])

  const baseFiltered = React.useMemo(() => {
    const store = storeFilter.trim()
    return campaigns.filter((c) => {
      const br = c.branches ?? []
      if (store) {
        if (br.length > 0 && !br.includes(store)) return false
      }
      if (!campaignMatchesPeriodFilter(c, periodFrom, periodTo)) return false
      return true
    })
  }, [campaigns, storeFilter, periodFrom, periodTo])

  const rows = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = baseFiltered
    if (partnerKeyFilter) {
      list = list.filter((c) => partnerKey(collabDetailOf(c)) === partnerKeyFilter)
    }
    if (!q) {
      return [...list].sort((a, b) => {
        const sa = (a.branches?.length ? a.branches.join(", ") : allStoresLabel).localeCompare(
          (b.branches?.length ? b.branches.join(", ") : allStoresLabel),
          "ko"
        )
        if (sa !== 0) return sa
        return (a.topic || "").localeCompare(b.topic || "", "ko")
      })
    }
    return list
      .filter((c) => {
        const d = collabDetailOf(c)
        const br = (c.branches ?? []).join(" ").toLowerCase()
        const storeCol = (c.branches?.length ? c.branches.join(", ") : allStoresLabel).toLowerCase()
        const blob = [
          c.topic,
          c.campaignNo ?? "",
          partnerLine(d, t),
          br,
          storeCol,
          d.contactName,
          d.contactInfo,
        ]
          .join(" ")
          .toLowerCase()
        return blob.includes(q)
      })
      .sort((a, b) => {
        const sa = (a.branches?.length ? a.branches.join(", ") : allStoresLabel).localeCompare(
          (b.branches?.length ? b.branches.join(", ") : allStoresLabel),
          "ko"
        )
        if (sa !== 0) return sa
        return (a.topic || "").localeCompare(b.topic || "", "ko")
      })
  }, [baseFiltered, search, partnerKeyFilter, allStoresLabel, t])

  const partnerFilterLabel = React.useMemo(() => {
    if (!partnerKeyFilter) return ""
    const c = baseFiltered.find((x) => partnerKey(collabDetailOf(x)) === partnerKeyFilter)
    return c ? partnerDisplayName(collabDetailOf(c), t) : ""
  }, [partnerKeyFilter, baseFiltered, t])

  const partnerAggs = React.useMemo(() => {
    const map = new Map<string, PartnerAgg>()
    for (const c of baseFiltered) {
      const d = collabDetailOf(c)
      const k = partnerKey(d)
      let g = map.get(k)
      if (!g) {
        g = { key: k, detail: d, campaignIds: [], contacts: new Set() }
        map.set(k, g)
      }
      g.campaignIds.push(c.id)
      const cx = [d.contactName, d.contactInfo].map((x) => (x ?? "").trim()).filter(Boolean).join(" / ")
      if (cx) g.contacts.add(cx)
    }
    const list = [...map.values()]
    const pq = search.trim().toLowerCase()
    const filtered = !pq
      ? list
      : list.filter((g) => {
          const name = partnerDisplayName(g.detail, t).toLowerCase()
          const typ = partnerTypeOnly(g.detail, t).toLowerCase()
          const contacts = [...g.contacts].join(" ").toLowerCase()
          return name.includes(pq) || typ.includes(pq) || contacts.includes(pq)
        })
    return filtered.sort((a, b) =>
      partnerDisplayName(a.detail, t).localeCompare(partnerDisplayName(b.detail, t), "ko")
    )
  }, [baseFiltered, search, t])

  if (!loading && campaigns.length === 0) {
    return (
      <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
        {t("marketingCollabMenusEmptyNoCollabFlag")}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground leading-relaxed">{t("marketingCollabOverviewHint")}</p>

      <div className="flex flex-wrap gap-2 border-b border-border/60 pb-3">
        <button
          type="button"
          onClick={() => setSubTab("campaigns")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            subTab === "campaigns"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/80"
          )}
        >
          {t("marketingCollabOverviewSubTabCampaigns")}
        </button>
        <button
          type="button"
          onClick={() => setSubTab("partners")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            subTab === "partners"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/80"
          )}
        >
          {t("marketingCollabOverviewSubTabPartners")}
        </button>
      </div>

      {partnerKeyFilter ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
          <span className="text-muted-foreground">{t("marketingCollabPartnersFilterActive")}:</span>
          <span className="font-medium">{partnerFilterLabel || partnerKeyFilter}</span>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPartnerKeyFilter("")}>
            {t("marketingCollabPartnersClearFilter")}
          </Button>
        </div>
      ) : null}

      <div className="space-y-3 rounded-lg border border-border/70 bg-muted/10 p-3 sm:px-4">
        <p className="text-[11px] font-medium text-muted-foreground">{t("marketingCollabOverviewPeriodHint")}</p>
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
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
              placeholder={
                subTab === "partners"
                  ? t("marketingCollabOverviewSearchPhPartners")
                  : t("marketingCollabOverviewSearchPh")
              }
            />
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : subTab === "partners" ? (
        partnerAggs.length === 0 ? (
          <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            {t("marketingCollabPartnersEmpty")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/80">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                  <th className="px-3 py-2.5">{t("marketingCollabPartnersColName")}</th>
                  <th className="px-3 py-2.5">{t("marketingCollabPartnersColType")}</th>
                  <th className="whitespace-nowrap px-3 py-2.5">{t("marketingCollabPartnersColCount")}</th>
                  <th className="min-w-[160px] px-3 py-2.5">{t("marketingCollabPartnersColContacts")}</th>
                  <th className="min-w-[200px] px-3 py-2.5">{t("marketingCollabPartnersColCampaigns")}</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">{t("marketingCollabOverviewColAction")}</th>
                </tr>
              </thead>
              <tbody>
                {partnerAggs.map((g) => {
                  const titles = g.campaignIds
                    .map((id) => campaigns.find((c) => c.id === id)?.topic)
                    .filter(Boolean) as string[]
                  const contactStr = [...g.contacts].slice(0, 3).join(" · ")
                  const moreC = g.contacts.size > 3 ? ` (+${g.contacts.size - 3})` : ""
                  return (
                    <tr key={g.key} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-2.5 align-top font-medium">{partnerDisplayName(g.detail, t)}</td>
                      <td className="px-3 py-2.5 align-top text-xs text-muted-foreground">{partnerTypeOnly(g.detail, t)}</td>
                      <td className="px-3 py-2.5 align-top tabular-nums text-xs">{g.campaignIds.length}</td>
                      <td className="max-w-[220px] px-3 py-2.5 align-top text-xs text-muted-foreground break-words">
                        {contactStr ? `${contactStr}${moreC}` : "—"}
                      </td>
                      <td className="px-3 py-2.5 align-top text-xs leading-snug text-muted-foreground">
                        {titles.slice(0, 4).join(" · ")}
                        {titles.length > 4 ? ` … (+${titles.length - 4})` : ""}
                      </td>
                      <td className="px-3 py-2.5 align-top text-right">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => {
                            setPartnerKeyFilter(g.key)
                            setSubTab("campaigns")
                          }}
                        >
                          {t("marketingCollabPartnersShowCampaigns")}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          {t("marketingCollabOverviewEmpty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/80">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                <th className="whitespace-nowrap px-3 py-2.5">{t("marketingCollabOverviewColStores")}</th>
                <th className="min-w-[160px] px-3 py-2.5">{t("marketingCollabOverviewColCampaign")}</th>
                <th className="min-w-[140px] px-3 py-2.5">{t("marketingCollabOverviewColPartner")}</th>
                <th className="whitespace-nowrap px-3 py-2.5">{t("marketingCollabOverviewColPeriod")}</th>
                <th className="whitespace-nowrap px-3 py-2.5">{t("marketingCollabOverviewColDesign")}</th>
                <th className="whitespace-nowrap px-3 py-2.5">{t("marketingCollabOverviewColStatus")}</th>
                <th className="min-w-[120px] px-3 py-2.5">{t("marketingCollabOverviewColContact")}</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">{t("marketingCollabOverviewColAction")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const d = collabDetailOf(c)
                const storeCol = c.branches?.length ? c.branches.join(", ") : allStoresLabel
                const contact = [d.contactName, d.contactInfo].map((x) => (x ?? "").trim()).filter(Boolean).join(" / ")
                return (
                  <tr key={c.id} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2.5 align-top text-xs">{storeCol}</td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="space-y-0.5">
                        {c.campaignNo ? (
                          <span className="font-mono text-[11px] text-muted-foreground">{c.campaignNo}</span>
                        ) : null}
                        <p className="font-medium leading-snug">{c.topic}</p>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top text-xs leading-snug">{partnerLine(d, t)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 align-top text-xs text-muted-foreground">
                      {c.startDate || "—"} ~ {c.endDate || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 align-top text-xs text-muted-foreground">
                      {c.designStartDate || c.designEndDate ? (
                        <>
                          {c.designStartDate || "—"} ~ {c.designEndDate || "—"}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", statusBadgeClass(c.status))}>
                        {statusLabelFn(c.status, t)}
                      </span>
                    </td>
                    <td className="max-w-[200px] px-3 py-2.5 align-top text-xs text-muted-foreground break-words">
                      {contact || "—"}
                    </td>
                    <td className="px-3 py-2.5 align-top text-right">
                      <Button type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={() => onGoToEdit(c.id)}>
                        {t("marketingCollabOverviewGoEdit")}
                      </Button>
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
