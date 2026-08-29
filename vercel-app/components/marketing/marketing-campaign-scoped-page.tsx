"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ExternalLink, Megaphone, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MarketingEmptyState } from "@/components/marketing/marketing-empty-state"
import { MarketingHubCampaignContextStrip } from "@/components/marketing/marketing-hub-campaign-context-strip"
import { MarketingPageHero } from "@/components/marketing/marketing-page-hero"
import { MarketingPageShell } from "@/components/marketing/marketing-page-shell"
import { getMarketingCampaigns, type MarketingCampaign } from "@/lib/api-client"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { marketingCampaignWorkspaceHref } from "@/lib/marketing-campaign-create-ui"
import {
  readSelectedMarketingCampaignId,
  resolveInitialMarketingCampaignId,
  writeSelectedMarketingCampaignId,
} from "@/lib/marketing-selected-campaign"

/**
 * 사이드바 마케팅 하위 메뉴 공통 — 캠페인을 먼저 고르고 그 캠페인만 다룬다.
 * 고른 캠페인은 URL(`?campaignId=`)과 세션에 남아 메뉴를 옮겨도 유지된다.
 */
export function MarketingCampaignScopedPage({
  icon,
  title,
  description,
  emptyTitle,
  emptyDescription,
  workspaceTab,
  maxWidthClass = "max-w-7xl",
  children,
}: {
  icon: LucideIcon
  title: string
  description: string
  emptyTitle: string
  emptyDescription: string
  /** 「전체 워크스페이스 열기」가 향할 탭 */
  workspaceTab: string
  maxWidthClass?: string
  children: (campaignId: string) => React.ReactNode
}) {
  const { lang } = useLang()
  const t = useT(lang)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const queryCampaignId = searchParams.get("campaignId")

  const [campaigns, setCampaigns] = React.useState<MarketingCampaign[]>([])
  const [loading, setLoading] = React.useState(true)
  const [campaignId, setCampaignId] = React.useState("")

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const rows = await getMarketingCampaigns()
      setCampaigns(Array.isArray(rows) ? rows : [])
    } catch {
      setCampaigns([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  React.useEffect(() => {
    setCampaignId((prev) =>
      prev ||
      resolveInitialMarketingCampaignId({
        fromQuery: queryCampaignId,
        remembered: readSelectedMarketingCampaignId(),
      })
    )
  }, [queryCampaignId])

  const selectCampaign = React.useCallback(
    (next: string) => {
      setCampaignId(next)
      writeSelectedMarketingCampaignId(next)
      const params = new URLSearchParams(searchParams.toString())
      if (next) params.set("campaignId", next)
      else params.delete("campaignId")
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  React.useEffect(() => {
    if (loading || !campaignId || campaigns.length === 0) return
    if (!campaigns.some((c) => c.id === campaignId)) {
      setCampaignId("")
      writeSelectedMarketingCampaignId("")
    }
  }, [campaigns, campaignId, loading])

  const selected = campaigns.find((c) => c.id === campaignId)

  return (
    <MarketingPageShell maxWidthClass={maxWidthClass}>
      <MarketingPageHero icon={icon} title={title} description={description} />
      <MarketingHubCampaignContextStrip
        value={campaignId}
        onChange={selectCampaign}
        campaigns={campaigns}
        hideHubLinkFilter
        allowEmpty
        emptyOptionLabel={t("marketingScopedPickCampaign")}
        onRefresh={load}
        disabled={loading}
        aside={
          <>
            {campaignId ? (
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" asChild>
                <Link href={marketingCampaignWorkspaceHref(campaignId, workspaceTab)}>
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t("marketingScopedOpenWorkspace")}
                </Link>
              </Button>
            ) : null}
            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" asChild>
              <Link href="/admin/marketing/campaigns">
                <Megaphone className="h-3.5 w-3.5" />
                {t("adminMarketingCampaigns")}
              </Link>
            </Button>
          </>
        }
        summary={
          selected ? (
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-foreground">
              <span className="font-mono text-[11px] font-semibold tabular-nums text-primary">
                [{selected.campaignNo?.trim() || "—"}]
              </span>
              <span className="font-medium leading-snug">{selected.topic}</span>
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">{t("marketingScopedPickCampaignHint")}</p>
          )
        }
      />
      {campaignId ? (
        children(campaignId)
      ) : (
        <MarketingEmptyState icon={icon} title={emptyTitle} description={emptyDescription} />
      )}
    </MarketingPageShell>
  )
}
