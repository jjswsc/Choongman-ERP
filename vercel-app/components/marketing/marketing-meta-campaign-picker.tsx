"use client"

import * as React from "react"
import { Loader2, RotateCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { appAlert } from "@/lib/app-message"
import { syncMetaAds } from "@/lib/api-client/marketing-meta"
import { bangkokTodayYmd } from "@/lib/bangkok-date"
import type { MetaAdInsightRow } from "@/lib/meta-graph"
import {
  countMetaCampaignsByYear,
  filterMetaCampaignOptions,
  metaCampaignPickerInitialView,
  parseMetaCampaignLinks,
  serializeMetaCampaignLinks,
  uniqueMetaAdsCampaigns,
  type MetaAdsCampaignOption,
  type MetaCampaignLink,
} from "@/lib/marketing-meta-match"
import { cn } from "@/lib/utils"

type YearFilter = number | "all" | "none"

export function MarketingMetaCampaignPicker({
  ads,
  campaignId,
  campaignName,
  t,
  onChange,
  onAdsRefresh,
}: {
  ads: MetaAdInsightRow[]
  campaignId: string
  campaignName: string
  t: (k: string) => string
  onChange: (next: { id: string; name: string }) => void
  onAdsRefresh?: (ads: MetaAdInsightRow[]) => void
}) {
  const bangkokYear = Number(bangkokTodayYmd().slice(0, 4))
  const [query, setQuery] = React.useState("")
  const [year, setYear] = React.useState<YearFilter>("all")
  const [includePosts, setIncludePosts] = React.useState(false)
  const [custom, setCustom] = React.useState(false)
  const [syncing, setSyncing] = React.useState(false)
  const [syncNote, setSyncNote] = React.useState("")
  const yearInit = React.useRef(false)

  const selected = React.useMemo(
    () => parseMetaCampaignLinks(campaignId, campaignName),
    [campaignId, campaignName]
  )
  const selectedIds = React.useMemo(
    () => new Set(selected.map((l) => l.id).filter(Boolean)),
    [selected]
  )

  const all = React.useMemo(
    () => uniqueMetaAdsCampaigns(ads, { includeOrganicPosts: true }),
    [ads]
  )
  const pool = React.useMemo(
    () => all.filter((o) => includePosts || !o.organicPost),
    [all, includePosts]
  )
  const years = React.useMemo(() => {
    const set = new Set<number>()
    for (const o of all) for (const y of o.years?.length ? o.years : o.year != null ? [o.year] : []) set.add(y)
    return [...set].sort((a, b) => b - a)
  }, [all])
  const postCount = React.useMemo(() => all.filter((o) => o.organicPost).length, [all])
  const yearCounts = React.useMemo(() => countMetaCampaignsByYear(all, includePosts), [all, includePosts])
  const shown = React.useMemo(
    () => filterMetaCampaignOptions(all, { query, year, includeOrganicPosts: includePosts }),
    [all, query, year, includePosts]
  )
  const yearOnlyPosts =
    typeof year === "number" &&
    shown.length > 0 &&
    shown.every((o) => o.organicPost)
  const namedInYear =
    typeof year === "number"
      ? shown.filter((o) => !o.organicPost).length
      : pool.filter((o) => !o.organicPost).length

  React.useEffect(() => {
    if (yearInit.current || !all.length) return
    yearInit.current = true
    const view = metaCampaignPickerInitialView(all, bangkokYear)
    setYear(view.year)
    setIncludePosts(view.includeOrganicPosts)
  }, [all, bangkokYear])

  React.useEffect(() => {
    if (campaignName && !campaignId) setCustom(true)
  }, [campaignName, campaignId])

  const emit = (links: MetaCampaignLink[]) => {
    onChange(serializeMetaCampaignLinks(links))
  }

  const toggle = (o: MetaAdsCampaignOption) => {
    setCustom(false)
    const exists = selectedIds.has(o.id)
    if (exists) {
      emit(selected.filter((l) => l.id !== o.id))
      return
    }
    emit([...selected.filter((l) => l.id !== o.id), { id: o.id, name: o.name }])
  }

  const removeLink = (link: MetaCampaignLink) => {
    emit(
      selected.filter((l) =>
        link.id ? l.id !== link.id : !(l.name === link.name && !l.id)
      )
    )
  }

  const syncNow = async () => {
    if (!onAdsRefresh) return
    setSyncing(true)
    setSyncNote("")
    try {
      const r = await syncMetaAds()
      if (!r.success || !r.payload) {
        await appAlert(r.message || t("marketingMetaMapSyncFail"))
        return
      }
      onAdsRefresh(r.payload.ads || [])
      yearInit.current = false
      const diag = r.payload.diagnostics || []
      if (diag.some((d) => d.includes("_truncated"))) {
        setSyncNote(t("marketingMetaMapSyncTruncated"))
      } else if (diag.includes("no_ad_account_id")) {
        setSyncNote(t("marketingMetaDiagNoAdAccount"))
      }
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : t("marketingMetaMapSyncFail"))
    } finally {
      setSyncing(false)
    }
  }

  if (!all.length) {
    return (
      <div className="mt-1 space-y-2">
        <p className="text-[11px] text-muted-foreground">{t("marketingMetaMapSyncFirst")}</p>
        {onAdsRefresh ? (
          <Button type="button" size="sm" variant="outline" disabled={syncing} onClick={() => void syncNow()}>
            {syncing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCw className="mr-1 h-3.5 w-3.5" />}
            {t("marketingMetaSync")}
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mt-1 space-y-2">
      <p className="text-[11px] text-muted-foreground">{t("marketingMetaMapMultiHint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="min-w-[12rem] flex-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("marketingMetaMapSearchPh")}
          aria-label={t("marketingMetaMapSearchPh")}
        />
        {onAdsRefresh ? (
          <Button type="button" size="sm" variant="outline" disabled={syncing} onClick={() => void syncNow()}>
            {syncing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCw className="mr-1 h-3.5 w-3.5" />}
            {t("marketingMetaSync")}
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1">
        <YearChip active={year === "all"} onClick={() => setYear("all")}>
          {t("marketingMetaMapYearAll")}
        </YearChip>
        {years.map((y) => (
          <YearChip key={y} active={year === y} onClick={() => setYear(y)}>
            {`${y} (${yearCounts.get(y) || 0})`}
          </YearChip>
        ))}
        <YearChip active={year === "none"} onClick={() => setYear("none")}>
          {`${t("marketingMetaMapYearNone")} (${yearCounts.get("none") || 0})`}
        </YearChip>
      </div>
      <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <input
          type="checkbox"
          checked={includePosts}
          onChange={(e) => setIncludePosts(e.target.checked)}
        />
        {t("marketingMetaMapIncludePosts")} ({postCount})
      </label>
      <p className="text-[11px] text-muted-foreground">
        {t("marketingMetaMapCount")
          .replace("{shown}", String(shown.length))
          .replace("{total}", String(pool.length))}
      </p>
      {yearOnlyPosts || (typeof year === "number" && namedInYear === 0) ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">{t("marketingMetaMapOnlyPostsHint")}</p>
      ) : null}
      {syncNote ? <p className="text-[11px] text-amber-700 dark:text-amber-400">{syncNote}</p> : null}
      {selected.length ? (
        <div className="space-y-1">
          <p className="text-[11px] text-foreground">
            {t("marketingMetaMapSelected")}: {selected.length}
            {t("marketingMetaMapSelectedCountSuffix")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {selected.map((link) => (
              <span
                key={link.id || link.name}
                className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px]"
              >
                <span className="min-w-0 truncate">{link.name || link.id}</span>
                <button
                  type="button"
                  className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={t("marketingMetaMapRemoveOne")}
                  onClick={() => removeLink(link)}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <div className="max-h-60 overflow-y-auto rounded-md border border-input">
        {shown.length === 0 ? (
          <p className="px-2 py-3 text-[11px] text-muted-foreground">{t("marketingMetaMapEmpty")}</p>
        ) : (
          shown.map((o) => {
            const active = selectedIds.has(o.id)
            return (
              <button
                key={o.id}
                type="button"
                className={cn(
                  "flex w-full items-start gap-2 border-b border-input px-2 py-1.5 text-left text-xs last:border-b-0 hover:bg-muted",
                  active && "bg-muted font-medium"
                )}
                onClick={() => toggle(o)}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[9px]",
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-muted-foreground/40"
                  )}
                  aria-hidden
                >
                  {active ? "✓" : ""}
                </span>
                <span className="min-w-0 flex-1 break-words">{o.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{o.year ?? "—"}</span>
              </button>
            )
          })
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="text-[11px] text-muted-foreground underline"
          onClick={() => {
            setCustom(false)
            emit([])
          }}
        >
          {t("marketingMetaMapNone")}
        </button>
        <button
          type="button"
          className="text-[11px] text-muted-foreground underline"
          onClick={() => {
            setCustom(true)
            if (!selected.length) emit([{ id: "", name: campaignName || "" }])
          }}
        >
          {t("marketingMetaMapCustom")}
        </button>
      </div>
      {custom || (campaignName && !campaignId) ? (
        <Input
          value={selected.length === 1 && !selected[0].id ? selected[0].name : campaignName}
          onChange={(e) => emit([{ id: "", name: e.target.value }])}
          placeholder={t("marketingMetaMapPh")}
        />
      ) : null}
      <p className="text-[11px] text-muted-foreground">{t("marketingMetaMapHint")}</p>
    </div>
  )
}

function YearChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px]",
        active ? "border-foreground bg-foreground text-background" : "border-input text-muted-foreground"
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
