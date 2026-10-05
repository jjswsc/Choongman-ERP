"use client"

import * as React from "react"
import Link from "next/link"
import { Facebook, Instagram, Loader2, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { bangkokTodayYmd } from "@/lib/bangkok-date"
import { addBangkokCalendarDays } from "@/lib/bangkok-time"
import {
  getMetaConnectionStatus,
  syncMetaAds,
  type MetaConnectionStatus,
  type MetaSyncPayload,
} from "@/lib/api-client/marketing-meta"
import { filterAdsForCampaign } from "@/lib/marketing-meta-match"
import { cn } from "@/lib/utils"
import { appAlert } from "@/lib/app-message"

type RangePreset = "last_7d" | "last_28d" | "last_90d" | "this_year" | "custom"

function rangeForPreset(preset: Exclude<RangePreset, "custom">): { since: string; until: string } {
  const until = bangkokTodayYmd()
  if (preset === "last_7d") return { since: addBangkokCalendarDays(until, -6), until }
  if (preset === "last_90d") return { since: addBangkokCalendarDays(until, -89), until }
  if (preset === "this_year") return { since: `${until.slice(0, 4)}-01-01`, until }
  return { since: addBangkokCalendarDays(until, -27), until }
}

function diagnoseLabel(code: string, t: (k: string) => string): string {
  if (code === "not_connected") return t("marketingMetaDiagNotConnected")
  if (code === "table_missing") return t("marketingMetaDiagTableMissing")
  if (code.startsWith("missing_scope:")) return t("marketingMetaDiagMissingScope") + " " + code.slice("missing_scope:".length)
  if (code === "page_insights_need_page_token") return t("marketingMetaDiagNeedPageToken")
  if (code === "no_ad_account_id") return t("marketingMetaDiagNoAdAccount")
  if (code === "page_insights_all_zero" || code === "ads_insights_all_zero") return t("marketingMetaDiagZero")
  if (code === "ads_insights_empty_campaigns_listed") return t("marketingMetaDiagNoSpendCampaigns")
  if (code === "ads_campaigns_empty") return t("marketingMetaDiagNoCampaigns")
  if (code.startsWith("ads_campaigns_listed:")) return t("marketingMetaDiagCampaignsListed")
  if (code === "instagram_not_linked") return t("marketingMetaDiagIgNotLinked")
  if (code === "meta_not_mapped") return t("marketingMetaDiagNotMapped")
  if (code.startsWith("ads_insights:") || code.startsWith("page_insights:") || code.startsWith("instagram_link:")) return code
  if (code.startsWith("ads_insights_fallback:") || code.startsWith("ads_campaigns:")) return code
  return code
}

export function MarketingMetaInsightsPanel({
  compact,
  since: sinceProp,
  until: untilProp,
  matchTopic,
  metaCampaignId,
  metaCampaignName,
}: {
  compact?: boolean
  since?: string
  until?: string
  matchTopic?: string
  metaCampaignId?: string
  metaCampaignName?: string
}) {
  const { lang } = useLang()
  const t = useT(lang)
  const [status, setStatus] = React.useState<MetaConnectionStatus | null>(null)
  const [payload, setPayload] = React.useState<MetaSyncPayload | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [syncing, setSyncing] = React.useState(false)
  const initial = rangeForPreset("last_28d")
  const [preset, setPreset] = React.useState<RangePreset>(
    sinceProp && untilProp ? "custom" : "last_28d"
  )
  const [rangeSince, setRangeSince] = React.useState(sinceProp || initial.since)
  const [rangeUntil, setRangeUntil] = React.useState(untilProp || initial.until)

  React.useEffect(() => {
    if (!sinceProp || !untilProp) return
    setPreset("custom")
    setRangeSince(sinceProp.slice(0, 10))
    setRangeUntil(untilProp.slice(0, 10))
  }, [sinceProp, untilProp])

  const applyPreset = (next: Exclude<RangePreset, "custom">) => {
    const r = rangeForPreset(next)
    setPreset(next)
    setRangeSince(r.since)
    setRangeUntil(r.until)
  }

  const applyStatus = React.useCallback((s: MetaConnectionStatus) => {
    setStatus(s)
    const last = s.lastSync
    if (last && Array.isArray(last.ads)) {
      setPayload(last as MetaSyncPayload)
    }
  }, [])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const s = await getMetaConnectionStatus()
      applyStatus(s)
    } catch {
      setStatus({ connected: false, source: "none", diagnostics: ["load_failed"] })
    } finally {
      setLoading(false)
    }
  }, [applyStatus])

  React.useEffect(() => {
    void load()
  }, [load])

  const sync = async () => {
    const since = rangeSince.trim()
    const until = rangeUntil.trim()
    if (!since || !until) {
      await appAlert(t("marketingMetaRangeNeedBoth"))
      return
    }
    if (since > until) {
      await appAlert(t("marketingMetaRangeInvalid"))
      return
    }
    setSyncing(true)
    try {
      const r = await syncMetaAds({ since, until })
      if (!r.success) {
        await appAlert(r.message || t("marketingMetaMapSyncFail"))
        return
      }
      if (r.payload) setPayload(r.payload)
      await load()
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : t("marketingMetaMapSyncFail"))
    } finally {
      setSyncing(false)
    }
  }

  const ig = payload?.instagram || status?.instagram || status?.lastSync?.instagram
  const allAds = payload?.ads || []
  const campaignFilterOn = Boolean(matchTopic || metaCampaignId || metaCampaignName)
  const matched = campaignFilterOn
    ? filterAdsForCampaign(allAds, {
        topic: matchTopic,
        metaCampaignId,
        metaCampaignName,
      })
    : allAds
  const hasDelivery = (a: (typeof matched)[number]) =>
    Boolean(a.adId) || a.impressions > 0 || a.spend > 0 || a.reach > 0 || a.clicks > 0
  const ads = matched
    .filter(hasDelivery)
    .slice()
    .sort((a, b) => (b.spend || 0) - (a.spend || 0) || (b.impressions || 0) - (a.impressions || 0))
  const catalogOnly = matched.length - ads.length
  const totals = campaignFilterOn
    ? ads.reduce(
        (acc, a) => {
          acc.ads += 1
          acc.impressions += a.impressions
          acc.reach += a.reach
          acc.spend += a.spend
          return acc
        },
        { ads: 0, impressions: 0, reach: 0, spend: 0 }
      )
    : payload?.adsTotals
  const dateRangeLabel = (() => {
    const dr = payload?.dateRange || status?.lastSync?.dateRange
    if (!dr) return ""
    if (dr.since && dr.until) return `${dr.since} ~ ${dr.until}`
    if (dr.preset === "last_90d") return t("marketingMetaRangeLast90")
    if (dr.preset === "last_28d") return t("marketingMetaRangeLast28")
    return dr.preset || ""
  })()
  const diagnostics = [
    ...(payload?.diagnostics?.length ? payload.diagnostics : status?.diagnostics || []),
    ...(campaignFilterOn && allAds.length > 0 && matched.length === 0 ? ["meta_not_mapped"] : []),
  ]
  const plat = payload?.platformSpend
  const tableLimit = 80

  const presetChips: { key: Exclude<RangePreset, "custom">; label: string }[] = [
    { key: "last_7d", label: t("marketingMetaRangeLast7") },
    { key: "last_28d", label: t("marketingMetaRangeLast28") },
    { key: "last_90d", label: t("marketingMetaRangeLast90") },
    { key: "this_year", label: t("marketingMetaRangeThisYear") },
  ]

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center -space-x-1">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border bg-background">
              <Facebook className="h-3.5 w-3.5 text-[#1877F2]" />
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-full border bg-background">
              <Instagram className="h-3.5 w-3.5 text-[#E4405F]" />
            </span>
          </div>
          <div>
            <h3 className="text-sm font-semibold">{t("marketingMetaAdsTitle")}</h3>
            <p className="text-[11px] text-muted-foreground">{t("marketingMetaAdsSubtitle")}</p>
            {dateRangeLabel ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {t("marketingMetaSyncedRange")}: {dateRangeLabel}
              </p>
            ) : null}
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t("marketingMetaOneConnectHint")}</p>
          </div>
        </div>
        <Badge variant={status?.connected ? "default" : "secondary"}>
          {status?.connected ? t("marketingMetaConnected") : t("marketingMetaDisconnected")}
        </Badge>
      </div>

      {status?.pageName || status?.pageId ? (
        <p className="mb-2 text-xs text-muted-foreground">
          Facebook: {status.pageName || "—"} · {status.pageId}
          {status.adAccountId ? ` · ${t("marketingMetaAdAccountLabel")} ${String(status.adAccountId).replace(/^act_/i, "")}` : ""}
          {status.lastSyncedAt ? ` · ${String(status.lastSyncedAt).slice(0, 16).replace("T", " ")}` : ""}
        </p>
      ) : null}
      {ig?.id ? (
        <p className="mb-3 flex items-center gap-1 text-xs text-muted-foreground">
          <Instagram className="h-3.5 w-3.5" />
          Instagram: {ig.username ? `@${ig.username}` : ig.id}
        </p>
      ) : status?.connected ? (
        <p className="mb-3 text-xs text-amber-800 dark:text-amber-200">{t("marketingMetaDiagIgNotLinked")}</p>
      ) : null}

      {status?.connected ? (
        <div className="mb-3 space-y-2 rounded-lg border bg-muted/20 p-3">
          <p className="text-xs font-medium">{t("marketingMetaRangePickTitle")}</p>
          <p className="text-[11px] text-muted-foreground">{t("marketingMetaRangePickHint")}</p>
          <div className="flex flex-wrap gap-1.5">
            {presetChips.map((p) => (
              <button
                key={p.key}
                type="button"
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px]",
                  preset === p.key
                    ? "border-foreground bg-foreground text-background"
                    : "border-input text-muted-foreground hover:bg-muted"
                )}
                onClick={() => applyPreset(p.key)}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px]",
                preset === "custom"
                  ? "border-foreground bg-foreground text-background"
                  : "border-input text-muted-foreground hover:bg-muted"
              )}
              onClick={() => setPreset("custom")}
            >
              {t("marketingMetaRangeCustom")}
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-[10px] text-muted-foreground">{t("marketingMetaRangeFrom")}</label>
              <Input
                type="date"
                className="h-9 w-[10.5rem]"
                value={rangeSince}
                onChange={(e) => {
                  setPreset("custom")
                  setRangeSince(e.target.value)
                }}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] text-muted-foreground">{t("marketingMetaRangeTo")}</label>
              <Input
                type="date"
                className="h-9 w-[10.5rem]"
                value={rangeUntil}
                onChange={(e) => {
                  setPreset("custom")
                  setRangeUntil(e.target.value)
                }}
              />
            </div>
            <Button size="sm" className="h-9" onClick={() => void sync()} disabled={syncing || loading}>
              {syncing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCw className="mr-1 h-3.5 w-3.5" />}
              {t("marketingMetaSync")}
            </Button>
          </div>
        </div>
      ) : null}

      {plat && (plat.facebook > 0 || plat.instagram > 0 || plat.other > 0) ? (
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Facebook className="h-3 w-3 text-[#1877F2]" />
              Facebook
            </div>
            <div className="font-semibold tabular-nums">฿{plat.facebook.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Instagram className="h-3 w-3 text-[#E4405F]" />
              Instagram
            </div>
            <div className="font-semibold tabular-nums">฿{plat.instagram.toLocaleString()}</div>
          </div>
          {plat.other > 0 ? (
            <div className="rounded-lg border bg-muted/20 px-3 py-2">
              <div className="text-[10px] text-muted-foreground">{t("marketingMetaStatOtherPlat")}</div>
              <div className="font-semibold tabular-nums">฿{plat.other.toLocaleString()}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {!status?.connected ? (
        <p className="text-sm text-muted-foreground">
          {t("marketingMetaConnectHint")}{" "}
          <Link className="text-primary underline" href="/admin/marketing/integrations">
            {t("adminMarketingIntegrations")}
          </Link>
        </p>
      ) : (
        <>
          <div className="mb-3 grid gap-2 sm:grid-cols-4">
            {[
              { label: t("marketingMetaStatAds"), value: totals?.ads ?? 0 },
              { label: t("marketingMetaStatImpr"), value: (totals?.impressions ?? 0).toLocaleString() },
              { label: t("marketingMetaStatReach"), value: (totals?.reach ?? 0).toLocaleString() },
              { label: t("marketingMetaStatSpend"), value: `฿${(totals?.spend ?? 0).toLocaleString()}` },
            ].map((c) => (
              <div key={c.label} className="rounded-lg border bg-muted/20 px-3 py-2">
                <div className="text-[10px] text-muted-foreground">{c.label}</div>
                <div className="text-lg font-semibold tabular-nums">{c.value}</div>
              </div>
            ))}
          </div>
          {!compact && ads.length > 0 ? (
            <div className="overflow-x-auto">
              <p className="mb-2 text-[11px] text-muted-foreground">{t("marketingMetaTableHint")}</p>
              {catalogOnly > 0 ? (
                <p className="mb-2 text-[11px] text-muted-foreground">
                  {t("marketingMetaCatalogHidden").replace("{n}", String(catalogOnly))}
                </p>
              ) : null}
              <table className="w-full text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-2 font-medium">{t("marketingMetaColAd")}</th>
                    <th className="py-1 pr-2 font-medium">{t("marketingMetaColCampaign")}</th>
                    <th className="py-1 pr-2 font-medium">{t("marketingMetaStatImpr")}</th>
                    <th className="py-1 pr-2 font-medium">{t("marketingMetaStatReach")}</th>
                    <th className="py-1 pr-2 font-medium">CTR</th>
                    <th className="py-1 font-medium">{t("marketingMetaStatSpend")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ads.slice(0, tableLimit).map((a, i) => (
                    <tr key={`${a.adId || a.campaignId || a.adName}-${i}`} className="border-t">
                      <td className="py-1.5 pr-2">{a.adName || a.adId || "—"}</td>
                      <td className="py-1.5 pr-2 text-muted-foreground">{a.campaignName}</td>
                      <td className="py-1.5 pr-2 tabular-nums">{a.impressions.toLocaleString()}</td>
                      <td className="py-1.5 pr-2 tabular-nums">{a.reach.toLocaleString()}</td>
                      <td className="py-1.5 pr-2 tabular-nums">{a.ctr.toFixed(2)}%</td>
                      <td className="py-1.5 tabular-nums">฿{a.spend.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ads.length > tableLimit ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {t("marketingMetaTableTruncated")
                    .replace("{shown}", String(tableLimit))
                    .replace("{total}", String(ads.length))}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {diagnostics.length > 0 ? (
        <ul className="mt-3 space-y-1 rounded-md border border-amber-400/40 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-950 dark:bg-amber-950/30 dark:text-amber-50">
          {diagnostics.map((d) => (
            <li key={d}>{diagnoseLabel(d, t)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
