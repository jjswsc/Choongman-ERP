"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
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
}: {
  ads: MetaAdInsightRow[]
  campaignId: string
  campaignName: string
  t: (k: string) => string
  onChange: (next: { id: string; name: string }) => void
}) {
  const bangkokYear = Number(bangkokTodayYmd().slice(0, 4))
  const [query, setQuery] = React.useState("")
  const [year, setYear] = React.useState<YearFilter>("all")
  const [includePosts, setIncludePosts] = React.useState(false)
  const [custom, setCustom] = React.useState(false)
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
    for (const o of all) if (o.year != null) set.add(o.year)
    return [...set].sort((a, b) => b - a)
  }, [all])
  const postCount = React.useMemo(() => all.filter((o) => o.organicPost).length, [all])
  const shown = React.useMemo(
    () => filterMetaCampaignOptions(all, { query, year, includeOrganicPosts: includePosts }),
    [all, query, year, includePosts]
  )

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

  if (!all.length) {
    return <p className="mt-1 text-[11px] text-muted-foreground">{t("marketingMetaMapSyncFirst")}</p>
  }

  const pick = (o: MetaAdsCampaignOption) => {
    setCustom(false)
    onChange({ id: o.id, name: o.name })
  }

  return (
    <div className="mt-1 space-y-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("marketingMetaMapSearchPh")}
        aria-label={t("marketingMetaMapSearchPh")}
      />
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
