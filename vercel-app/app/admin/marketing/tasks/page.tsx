"use client"

import { ClipboardList } from "lucide-react"
import { MarketingCampaignScopedPage } from "@/components/marketing/marketing-campaign-scoped-page"
import { MarketingCampaignTasksPanel } from "@/components/marketing/marketing-campaign-tasks-panel"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export default function MarketingTasksPage() {
  const { lang } = useLang()
  const t = useT(lang)
  return (
    <MarketingCampaignScopedPage
      icon={ClipboardList}
      title={t("adminMarketingTasks")}
      description={t("marketingHeroDescTasks")}
      emptyTitle={t("marketingScopedEmptyTasks")}
      emptyDescription={t("marketingScopedPickCampaignHint")}
      workspaceTab="tasks"
    >
      {(campaignId) => <MarketingCampaignTasksPanel campaignId={campaignId} />}
    </MarketingCampaignScopedPage>
  )
}
