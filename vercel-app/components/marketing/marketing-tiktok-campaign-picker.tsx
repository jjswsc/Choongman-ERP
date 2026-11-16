"use client"

import * as React from "react"
import { Loader2, RotateCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { appAlert } from "@/lib/app-message"
import { syncTikTokAds } from "@/lib/api-client/marketing-tiktok"
import type { TikTokAdInsightRow } from "@/lib/tiktok-ads"
import {
  countTikTokCampaignsByYear,
  filterTikTokCampaignOptions,
  parseTikTokCampaignLinks,
  serializeTikTokCampaignLinks,
  uniqueTikTokAdsCampaigns,
  type TikTokAdsCampaignOption,
  type TikTokCampaignLink,
} from "@/lib/marketing-tiktok-match"
import { cn } from "@/lib/utils"

type YearFilter = number | "all" | "none"

export function MarketingTikTokCampaignPicker({
  ads,
  campaignId,
  campaignName,
  t,
  onChange,
  onAdsRefresh,
}: {
  ads: TikTokAdInsightRow[]
  campaignId: string
  campaignName: string
  t: (k: string) => string
  onChange: (next: { id: string; name: string }) => void
  onAdsRefresh?: (ads: TikTokAdInsightRow[]) => void
}) {
  const [query, setQuery] = React.useState("")
  const [year, setYear] = React.useState<YearFilter>("all")
  const [custom, setCustom] = React.useState(false)
  const [syncing, setSyncing] = React.useState(false)
  const [syncNote, setSyncNote] = React.useState("")

  const selected = React.useMemo(
    () => parseTikTokCampaignLinks(campaignId, campaignName),
    [campaignId, campaignName]
  )
  const selectedIds = React.useMemo(
    () => new Set(selected.map((l) => l.id).filter(Boolean)),
    [selected]
  )

  const all = React.useMemo(() => uniqueTikTokAdsCampaigns(ads), [ads])
  const years = React.useMemo(() => {
    const set = new Set<number>()
    for (const o of all) for (const y of o.years?.length ? o.years : o.year != null ? [o.year] : []) set.add(y)
    return [...set].sort((a, b) => b - a)
  }, [all])
  const yearCounts = React.useMemo(() => countTikTokCampaignsByYear(all), [all])
  const shown = React.useMemo(
    () => filterTikTokCampaignOptions(all, { query, year }),
    [all, query, year]
  )

  React.useEffect(() => {
    if (campaignName && !campaignId) setCustom(true)
  }, [campaignName, campaignId])

  const emit = (links: TikTokCampaignLink[]) => {
    onChange(serializeTikTokCampaignLinks(links))
  }

  const toggle = (o: TikTokAdsCampaignOption) => {
    setCustom(false)
    if (selectedIds.has(o.id)) {
      emit(selected.filter((l) => l.id !== o.id))
      return
    }
    emit([...selected.filter((l) => l.id !== o.id), { id: o.id, name: o.name }])
  }

  const removeLink = (link: TikTokCampaignLink) => {
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
      const r = await syncTikTokAds()
      if (!r.success || !r.payload) {
        await appAlert(r.message || t("marketingTikTokMapSyncFail"))
        return
      }
      onAdsRefresh(r.payload.ads || [])
      const diag = r.payload.diagnostics || []
      if (diag.includes("ads_campaigns_empty")) {
        setSyncNote(t("marketingTikTokMapEmptyCatalog"))
      } else if (diag.includes("not_connected") || diag.includes("need_advertiser_pick")) {
        setSyncNote(t("marketingTikTokMapSyncFirst"))
      } else if (diag.some((d) => d.startsWith("ads_campaigns:"))) {
        setSyncNote(t("marketingTikTokMapSyncFail"))
      }
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : t("marketingTikTokMapSyncFail"))
    } finally {
      setSyncing(false)
    }
  }

  if (!all.length) {
    return (
      <div className="mt-1 space-y-2">
        <p className="text-[11px] text-muted-foreground">{t("marketingTikTokMapSyncFirst")}</p>
        {onAdsRefresh ? (
          <Button type="button" size="sm" variant="outline" disabled={syncing} onClick={() => void syncNow()}>
            {syncing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCw className="mr-1 h-3.5 w-3.5" />}
            {t("marketingTikTokSync")}
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mt-1 space-y-2">
      <p className="text-[11px] text-muted-foreground">{t("marketingTikTokMapMultiHint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="min-w-[12rem] flex-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("marketingTikTokMapSearchPh")}
          aria-label={t("marketingTikTokMapSearchPh")}
        />
        {onAdsRefresh ? (
          <Button type="button" size="sm" variant="outline" disabled={syncing} onClick={() => void syncNow()}>
            {syncing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCw className="mr-1 h-3.5 w-3.5" />}
            {t("marketingTikTokSync")}
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
      <p className="text-[11px] text-muted-foreground">
        {t("marketingMetaMapCount")
          .replace("{shown}", String(shown.length))
          .replace("{total}", String(all.length))}
      </p>
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
          <p className="px-2 py-3 text-[11px] text-muted-foreground">{t("marketingTikTokMapEmpty")}</p>
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
          placeholder={t("marketingTikTokMapPh")}
        />
      ) : null}
      <p className="text-[11px] text-muted-foreground">{t("marketingTikTokMapHint")}</p>
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
