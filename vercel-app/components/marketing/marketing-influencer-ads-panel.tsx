"use client"

import * as React from "react"
import Link from "next/link"
import { Megaphone, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getMarketingAds,
  getMarketingInfluencers,
  getMarketingCampaigns,
  getMetaConnectionStatus,
  type MarketingAd,
  type MarketingInfluencer,
  type MarketingCampaign,
} from "@/lib/api-client"
import { filterAdsForCampaign } from "@/lib/marketing-meta-match"
import { cn } from "@/lib/utils"

function fmt(n: number) {
  return Number.isFinite(n) ? Math.round(n).toLocaleString() : "—"
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""))
  return Number.isFinite(n) ? n : 0
}

/** 선택한 ERP 캠페인 기준: 유료 Ads 실비 + 인플루언서 비용 + Meta 매핑 요약 */
export function MarketingInfluencerAdsPanel({
  campaignId,
  className,
}: {
  campaignId: string
  className?: string
}) {
  const { lang } = useLang()
  const t = useT(lang)
  const cid = String(campaignId || "").trim()
  const [loading, setLoading] = React.useState(false)
  const [campaign, setCampaign] = React.useState<MarketingCampaign | null>(null)
  const [ads, setAds] = React.useState<MarketingAd[]>([])
  const [influencers, setInfluencers] = React.useState<MarketingInfluencer[]>([])
  const [metaSpend, setMetaSpend] = React.useState(0)

  React.useEffect(() => {
    if (!cid) {
      setCampaign(null)
      setAds([])
      setInfluencers([])
      setMetaSpend(0)
      return
    }
    let cancelled = false
    setLoading(true)
    void Promise.all([
      getMarketingCampaigns().catch(() => [] as MarketingCampaign[]),
      getMarketingAds({ campaignId: cid }).catch(() => [] as MarketingAd[]),
      getMarketingInfluencers({ campaignId: cid }).catch(() => [] as MarketingInfluencer[]),
      getMetaConnectionStatus().catch(() => null),
    ])
      .then(([camps, adRows, inflRows, meta]) => {
        if (cancelled) return
        const c = (camps || []).find((x) => String(x.id) === cid) || null
        setCampaign(c)
        setAds(adRows || [])
        setInfluencers(inflRows || [])
        const insights = meta?.lastSync?.ads || []
        const spend = filterAdsForCampaign(insights, {
          metaCampaignId: c?.metaCampaignId,
          metaCampaignName: c?.metaCampaignName,
          topic: c?.topic,
        }).reduce((s, a) => s + num(a.spend), 0)
        setMetaSpend(spend)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [cid])

  if (!cid) return null

  const adsSpend = ads.reduce((s, a) => s + num(a.actualSpent), 0)
  const adsBudget = ads.reduce((s, a) => s + num(a.boostBudget), 0)
  const inflCost = influencers.reduce((s, i) => s + (num(i.actualCost) || num(i.budget)), 0)
  const inflBudget = influencers.reduce((s, i) => s + num(i.budget), 0)
  const campaignBudget = num(campaign?.budgetTotal)
  const combined = adsSpend + metaSpend + inflCost
  const ratio = campaignBudget > 0 ? combined / campaignBudget : 0

  return (
    <div className={cn("rounded-xl border bg-card p-4 shadow-sm", className)}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">{t("marketingInfluencerAdsTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("marketingInfluencerAdsSub")}</p>
        </div>
        {ratio >= 0.8 ? (
          <Badge variant="destructive">{t("marketingInfluencerAdsOverBudget")}</Badge>
        ) : loading ? (
          <Badge variant="secondary">…</Badge>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-muted/20 p-3 text-sm">
          <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Megaphone className="h-3.5 w-3.5" />
            {t("marketingInfluencerAdsPaid")}
          </div>
          <div className="font-semibold">{fmt(adsSpend + metaSpend)}</div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            ERP Ads {fmt(adsSpend)} · Meta {fmt(metaSpend)} · {t("marketingInfluencerAdsBudget")} {fmt(adsBudget)}
          </p>
          {campaign?.metaCampaignName || campaign?.metaCampaignId ? (
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              Meta: {campaign.metaCampaignName || campaign.metaCampaignId}
            </p>
          ) : (
            <p className="mt-1 text-[11px]">
              <Link href="/admin/marketing/integrations" className="underline">
                {t("marketingMetaAutoMap")}
              </Link>
            </p>
          )}
        </div>

        <div className="rounded-lg border bg-muted/20 p-3 text-sm">
          <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {t("marketingInfluencerAdsInfl")}
          </div>
          <div className="font-semibold">{fmt(inflCost)}</div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {influencers.length} · {t("marketingInfluencerAdsBudget")} {fmt(inflBudget)}
          </p>
        </div>

        <div className="rounded-lg border bg-muted/20 p-3 text-sm">
          <div className="mb-1 text-xs text-muted-foreground">{t("marketingInfluencerAdsCombined")}</div>
          <div className="font-semibold">{fmt(combined)}</div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t("marketingInfluencerAdsCampaignBudget")} {campaignBudget > 0 ? fmt(campaignBudget) : "—"}
            {campaignBudget > 0 ? ` · ${Math.round(ratio * 100)}%` : ""}
          </p>
        </div>
      </div>
    </div>
  )
}
