"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  BarChart2,
  ClipboardList,
  Handshake,
  LayoutGrid,
  Megaphone,
  Tag,
} from "lucide-react"
import { MarketingPageHero } from "@/components/marketing/marketing-page-hero"
import { MarketingPageShell } from "@/components/marketing/marketing-page-shell"
import { MarketingCampaignOverviewPanel } from "@/components/marketing/marketing-campaign-overview-panel"
import { MarketingCampaignPromosPanel } from "@/components/marketing/marketing-campaign-promos-panel"
import { MarketingCampaignCollabPanel } from "@/components/marketing/marketing-campaign-collab-panel"
import { MarketingCampaignTasksPanel } from "@/components/marketing/marketing-campaign-tasks-panel"
import { MarketingCampaignResultsPanel } from "@/components/marketing/marketing-campaign-results-panel"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  adminTabsBarCn,
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import {
  MARKETING_CAMPAIGN_WORKSPACE_TABS,
  parseMarketingCampaignWorkspaceTab,
  type MarketingCampaignWorkspaceTab,
} from "@/lib/marketing-campaign-create-ui"
import { useAdminUrlTab } from "@/lib/use-admin-url-tab"

export function MarketingCampaignWorkspace({ campaignId }: { campaignId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { lang } = useLang()
  const t = useT(lang)
  const [tab, setTab] = useAdminUrlTab(
    "tab",
    MARKETING_CAMPAIGN_WORKSPACE_TABS,
    "overview"
  )

  React.useEffect(() => {
    const parsed = parseMarketingCampaignWorkspaceTab(searchParams.get("tab") || tab)
    if (parsed !== tab) setTab(parsed)
  }, [searchParams, tab, setTab])

  const items: { id: MarketingCampaignWorkspaceTab; icon: typeof LayoutGrid; label: string }[] = [
    { id: "overview", icon: LayoutGrid, label: t("marketingWsTabOverview") },
    { id: "promos", icon: Tag, label: t("marketingWsTabPromos") },
    { id: "collab", icon: Handshake, label: t("marketingWsTabCollab") },
    { id: "tasks", icon: ClipboardList, label: t("marketingWsTabTasks") },
    { id: "results", icon: BarChart2, label: t("marketingWsTabResults") },
  ]

  return (
    <MarketingPageShell maxWidthClass="max-w-7xl">
      <MarketingPageHero
        icon={Megaphone}
        title={t("adminMarketingCampaigns")}
        description={t("marketingHeroDescCampaigns")}
      />
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(parseMarketingCampaignWorkspaceTab(v))}
        className={adminTabsRootCn}
      >
        <div className={cn(adminTabsBarCn, "px-2 py-2.5 sm:px-4")}>
          <div className={adminTabsScrollCn}>
            <TabsList className={adminTabsListRowCn}>
              {items.map((item) => (
                <TabsTrigger key={item.id} value={item.id} className={adminTabsTriggerCn}>
                  <item.icon className="mr-1.5 h-4 w-4 shrink-0" />
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>
        <TabsContent value="overview" className={adminTabsContentCn}>
          <MarketingCampaignOverviewPanel
            campaignId={campaignId}
            onDeleted={() => router.push("/admin/marketing/campaigns")}
          />
        </TabsContent>
        <TabsContent value="promos" className={adminTabsContentCn}>
          <MarketingCampaignPromosPanel campaignId={campaignId} />
        </TabsContent>
        <TabsContent value="collab" className={adminTabsContentCn}>
          <MarketingCampaignCollabPanel campaignId={campaignId} />
        </TabsContent>
        <TabsContent value="tasks" className={adminTabsContentCn}>
          <MarketingCampaignTasksPanel campaignId={campaignId} />
        </TabsContent>
        <TabsContent value="results" className={adminTabsContentCn}>
          <MarketingCampaignResultsPanel campaignId={campaignId} />
        </TabsContent>
      </Tabs>
    </MarketingPageShell>
  )
}
