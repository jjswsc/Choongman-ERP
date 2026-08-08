"use client"


import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import * as React from "react"
import { useSearchParams } from "next/navigation"
import { FileText } from "lucide-react"
import {
  adminTabsBarCn,
  adminTabsContentFlushCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MarketingMonthlyReportPanel } from "@/components/marketing/marketing-monthly-report-panel"
import { MarketingPerformanceDashboardPanel } from "@/components/marketing/marketing-performance-dashboard-panel"
import { MarketingCostsHubPanel } from "@/components/marketing/marketing-costs-hub-panel"
import { MarketingIntegratedCalendarPanel } from "@/components/marketing/marketing-integrated-calendar-panel"
import { MarketingPageHero } from "@/components/marketing/marketing-page-hero"
import { MarketingPageShell } from "@/components/marketing/marketing-page-shell"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAdminUrlTab } from "@/lib/use-admin-url-tab"

const TAB_IDS = ["monthly", "performance", "calendar", "costs"] as const
type ReportTab = (typeof TAB_IDS)[number]

function normalizeTab(raw: string | null): ReportTab {
  const t = (raw ?? "").trim()
  return t === "performance" || t === "costs" || t === "calendar" ? t : "monthly"
}

export default function MarketingReportHubPage() {
  const searchParams = useSearchParams()
  const { lang } = useLang()
  const t = useT(lang)
  const campaignIdFromQuery = searchParams.get("campaignId")?.trim() || ""
  const [activeTab, setTab] = useAdminUrlTab("tab", TAB_IDS, "monthly")

  const wide = activeTab !== "monthly"

  return (
    <MarketingPageShell maxWidthClass={wide ? "max-w-7xl" : "max-w-4xl"}>
        <MarketingPageHero icon={FileText} title={t("adminMarketingReportHubTitle")} description={t("marketingHeroDescReport")} />

        <Tabs value={activeTab} onValueChange={(v) => setTab(normalizeTab(v))} className={adminTabsRootCn}>
          <AdminTabsBarWithHelp>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="monthly" className={adminTabsTriggerCn}>
                  {t("marketingReportTabMonthly")}
                </TabsTrigger>
                <TabsTrigger value="performance" className={adminTabsTriggerCn}>
                  {t("marketingReportTabPerformance")}
                </TabsTrigger>
                <TabsTrigger value="calendar" className={adminTabsTriggerCn}>
                  {t("marketingReportTabCalendar")}
                </TabsTrigger>
                <TabsTrigger value="costs" className={adminTabsTriggerCn}>
                  {t("marketingReportTabCosts")}
                </TabsTrigger>
              </TabsList>
          </AdminTabsBarWithHelp>
          <TabsContent value="monthly" className={adminTabsContentFlushCn}>
            <MarketingMonthlyReportPanel campaignIdFromQuery={campaignIdFromQuery} />
          </TabsContent>
          <TabsContent value="performance" className="mt-0 focus-visible:outline-none">
            <MarketingPerformanceDashboardPanel campaignIdFromQuery={campaignIdFromQuery} />
          </TabsContent>
          <TabsContent value="calendar" className="mt-0 focus-visible:outline-none">
            <MarketingIntegratedCalendarPanel campaignIdFromQuery={campaignIdFromQuery} compactHeader />
          </TabsContent>
          <TabsContent value="costs" className={adminTabsContentFlushCn}>
            <MarketingCostsHubPanel campaignIdFromQuery={campaignIdFromQuery} />
          </TabsContent>
        </Tabs>
    </MarketingPageShell>
  )
}
