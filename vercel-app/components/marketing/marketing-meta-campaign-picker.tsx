"use client"

import * as React from "react"
import { Loader2, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { appAlert } from "@/lib/app-message"
import { syncMetaAds } from "@/lib/api-client/marketing-meta"
import { bangkokTodayYmd } from "@/lib/bangkok-date"
import type { MetaAdInsightRow } from "@/lib/meta-graph"
import {
  filterMetaCampaignOptions,
  metaCampaignPickerInitialView,
  uniqueMetaAdsCampaigns,
  type MetaAdsCampaignOption,
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
  const shown = React.useMemo(
    () => filterMetaCampaignOptions(all, { query, year, includeOrganicPosts: includePosts }),
    [all, query, year, includePosts]
  )
  const yearOnlyPosts =
    typeof year === "number" &&
    shown.length > 0 &&
    shown.every((o) => o.organicPost)

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

  const selected = pool.find((o) => o.id === campaignId) || all.find((o) => o.id === campaignId)

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

  const pick = (o: MetaAdsCampaignOption) => {
    setCustom(false)
    onChange({ id: o.id, name: o.name })
  }

  return (
    <div className="mt-1 space-y-2">
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
            {String(y)}
          </YearChip>
        ))}
        <YearChip active={year === "none"} onClick={() => setYear("none")}>
          {t("marketingMetaMapYearNone")}
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
      {yearOnlyPosts ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">{t("marketingMetaMapOnlyPostsHint")}</p>
      ) : null}
      {syncNote ? <p className="text-[11px] text-amber-700 dark:text-amber-400">{syncNote}</p> : null}
      {selected ? (
        <p className="truncate text-[11px] text-foreground">
          {t("marketingMetaMapSelected")}: {selected.name}
        </p>
      ) : null}
      <div className="max-h-60 overflow-y-auto rounded-md border border-input">
        {shown.length === 0 ? (
          <p className="px-2 py-3 text-[11px] text-muted-foreground">{t("marketingMetaMapEmpty")}</p>
        ) : (
          shown.map((o) => {
            const active = o.id === campaignId
            return (
              <button
                key={o.id}
                type="button"
                className={cn(
                  "flex w-full items-start gap-2 border-b border-input px-2 py-1.5 text-left text-xs last:border-b-0 hover:bg-muted",
                  active && "bg-muted font-medium"
                )}
                onClick={() => pick(o)}
              >
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
            onChange({ id: "", name: "" })
          }}
        >
          {t("marketingMetaMapNone")}
        </button>
        <button
          type="button"
          className="text-[11px] text-muted-foreground underline"
          onClick={() => {
            setCustom(true)
            onChange({ id: "", name: campaignName })
          }}
        >
          {t("marketingMetaMapCustom")}
        </button>
      </div>
      {custom || (campaignName && !campaignId) ? (
        <Input
          value={campaignName}
          onChange={(e) => onChange({ id: "", name: e.target.value })}
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
