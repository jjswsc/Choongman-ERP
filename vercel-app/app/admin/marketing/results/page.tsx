"use client"

import { BarChart2 } from "lucide-react"
import { MarketingCampaignScopedPage } from "@/components/marketing/marketing-campaign-scoped-page"
import { MarketingCampaignResultsPanel } from "@/components/marketing/marketing-campaign-results-panel"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export default function MarketingResultsPage() {
  const { lang } = useLang()
  const t = useT(lang)
  return (
    <MarketingCampaignScopedPage
      icon={BarChart2}
      title={t("adminMarketingResults")}
      description={t("marketingHeroDescResults")}
      emptyTitle={t("marketingScopedEmptyResults")}
      emptyDescription={t("marketingScopedPickCampaignHint")}
      workspaceTab="results"
    >
      {(campaignId) => <MarketingCampaignResultsPanel campaignId={campaignId} />}
    </MarketingCampaignScopedPage>
  )
}
