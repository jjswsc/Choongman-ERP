"use client"

import * as React from "react"
import Link from "next/link"
import { Loader2, Music2, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getTikTokConnectionStatus,
  syncTikTokAds,
  type TikTokConnectionStatus,
  type TikTokSyncPayload,
} from "@/lib/api-client/marketing-tiktok"
import { filterTikTokAdsForCampaign } from "@/lib/marketing-tiktok-match"
import { cn } from "@/lib/utils"
import { appAlert } from "@/lib/app-message"

export function MarketingTikTokInsightsPanel({
  compact,
  matchTopic,
  tiktokCampaignId,
  tiktokCampaignName,
}: {
  compact?: boolean
  matchTopic?: string
  tiktokCampaignId?: string
  tiktokCampaignName?: string
}) {
  const { lang } = useLang()
  const t = useT(lang)
  const [status, setStatus] = React.useState<TikTokConnectionStatus | null>(null)
  const [payload, setPayload] = React.useState<TikTokSyncPayload | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [syncing, setSyncing] = React.useState(false)

  const applyStatus = React.useCallback((s: TikTokConnectionStatus) => {
    setStatus(s)
    const last = s.lastSync
    if (last && Array.isArray(last.ads)) {
      setPayload(last as TikTokSyncPayload)
    }
  }, [])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const s = await getTikTokConnectionStatus()
      applyStatus(s)
    } catch {
      setStatus({ connected: false, source: "none" })
      setPayload(null)
    } finally {
      setLoading(false)
    }
  }, [applyStatus])

  React.useEffect(() => {
    void load()
  }, [load])

  const syncNow = async () => {
    setSyncing(true)
    try {
      const r = await syncTikTokAds()
      if (!r.success || !r.payload) {
        await appAlert(r.message || t("marketingTikTokMapSyncFail"))
        return
      }
      setPayload(r.payload)
      await load()
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : t("marketingTikTokMapSyncFail"))
    } finally {
      setSyncing(false)
    }
  }

  const campaignFilterOn = Boolean(matchTopic || tiktokCampaignId || tiktokCampaignName)
  const ads = React.useMemo(() => {
    const rows = payload?.ads || []
    if (!campaignFilterOn) return rows.filter((a) => String(a.adId || "").trim())
    return filterTikTokAdsForCampaign(rows, {
      topic: matchTopic,
      tiktokCampaignId,
      tiktokCampaignName,
    }).filter((a) => String(a.adId || "").trim() || Number(a.spend) > 0)
  }, [payload?.ads, campaignFilterOn, matchTopic, tiktokCampaignId, tiktokCampaignName])

  const totals = ads.reduce(
    (acc, a) => {
      acc.spend += Number(a.spend) || 0
      acc.impressions += Number(a.impressions) || 0
      acc.reach += Number(a.reach) || 0
      return acc
    },
    { spend: 0, impressions: 0, reach: 0 }
  )

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("loading")}
      </p>
    )
  }

  if (!status?.connected) {
    return (
      <div className={cn("rounded-lg border p-3", compact && "text-sm")}>
        <p className="mb-2 text-xs text-muted-foreground">{t("marketingTikTokMapSyncFirst")}</p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/marketing/integrations">{t("marketingChannelDashConnectTikTok")}</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className={cn("rounded-lg border p-3 space-y-3", compact && "text-sm")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Music2 className="h-4 w-4" />
          <span className="text-sm font-semibold">{t("marketingTikTokAdsTitle")}</span>
          <Badge variant="secondary" className="text-[10px]">
            {status.advertiserName || status.advertiserId || t("marketingTikTokConnected")}
          </Badge>
        </div>
        <Button variant="outline" size="sm" disabled={syncing} onClick={() => void syncNow()}>
          {syncing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCw className="mr-1 h-3.5 w-3.5" />}
          {t("marketingTikTokSync")}
        </Button>
      </div>

      {campaignFilterOn && !tiktokCampaignId && !tiktokCampaignName ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">{t("marketingTikTokDiagNotMapped")}</p>
      ) : null}

      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="rounded bg-muted/50 px-2 py-1">
          <div className="text-[11px] text-muted-foreground">{t("marketingMetaStatSpend")}</div>
          <div className="font-semibold tabular-nums">฿{totals.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="rounded bg-muted/50 px-2 py-1">
          <div className="text-[11px] text-muted-foreground">{t("marketingMetaStatImpr")}</div>
          <div className="font-semibold tabular-nums">{totals.impressions.toLocaleString()}</div>
        </div>
        <div className="rounded bg-muted/50 px-2 py-1">
          <div className="text-[11px] text-muted-foreground">{t("marketingMetaStatReach")}</div>
          <div className="font-semibold tabular-nums">{totals.reach.toLocaleString()}</div>
        </div>
      </div>

      {ads.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">{t("marketingTikTokMapEmpty")}</p>
      ) : (
        <div className="max-h-48 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1 pr-2 font-medium">{t("marketingMetaColCampaign")}</th>
                <th className="py-1 pr-2 font-medium">{t("marketingMetaStatSpend")}</th>
                <th className="py-1 font-medium">{t("marketingMetaStatImpr")}</th>
              </tr>
            </thead>
            <tbody>
              {ads.slice(0, 40).map((a) => (
                <tr key={`${a.campaignId}|${a.adId}|${a.adName}`} className="border-t border-border/60">
                  <td className="py-1 pr-2 break-words">{a.campaignName || a.adName || a.campaignId || "—"}</td>
                  <td className="py-1 pr-2 tabular-nums">฿{(Number(a.spend) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="py-1 tabular-nums">{(Number(a.impressions) || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
