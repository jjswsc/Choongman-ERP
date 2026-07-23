"use client"

import * as React from "react"
import { Gift, KeyRound, Megaphone, Stamp, Ticket } from "lucide-react"
import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  adminTabsContentCn,
  adminTabsIconCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { CrmSubnav } from "@/components/erp/crm-subnav"
import { CrmCouponDefinitionPanel } from "@/components/admin/crm-coupon-definition-panel"
import { CrmCouponIssuePanel } from "@/components/admin/crm-coupon-issue-panel"
import { CrmCouponHistoryPanel } from "@/components/admin/crm-coupon-history-panel"
import { CrmCouponCampaignPanel } from "@/components/admin/crm-coupon-campaign-panel"
import { CrmCouponStampPanel } from "@/components/admin/crm-coupon-stamp-panel"
import { CrmCouponPromoCodePanel } from "@/components/admin/crm-coupon-promo-code-panel"
import { CrmCouponKpiStrip } from "@/components/crm/crm-coupon-kpi-strip"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { parseCrmCouponAdminTab, type CrmCouponAdminTab, type CrmPromoCodePrefill } from "@/lib/crm-coupon-admin"

type CrmCouponAdminPanelProps = {
  initialTab?: string
  onTabChange?: (tab: CrmCouponAdminTab) => void
}

export function CrmCouponAdminPanel({ initialTab, onTabChange }: CrmCouponAdminPanelProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [tab, setTab] = React.useState<CrmCouponAdminTab>(parseCrmCouponAdminTab(initialTab))
  const [promoPrefill, setPromoPrefill] = React.useState<CrmPromoCodePrefill | null>(null)

  React.useEffect(() => {
    setTab(parseCrmCouponAdminTab(initialTab))
  }, [initialTab])

  const handleTab = (next: string) => {
    const parsed = parseCrmCouponAdminTab(next)
    setTab(parsed)
    onTabChange?.(parsed)
  }

  const offerSecretPromo = (prefill: CrmPromoCodePrefill) => {
    setPromoPrefill(prefill)
    handleTab("promo")
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <CrmSubnav />
        <div className="rounded-2xl border border-indigo-200/60 bg-gradient-to-r from-indigo-50 to-violet-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-indigo-500/10 p-2 text-indigo-600">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">{t("crmCouponHubTitle") || "쿠폰 관리"}</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {t("crmCouponHubSub") ||
                  "쿠폰 정의·지급·캠페인·시크릿 코드·스탬프 카드·POS·회원앱 연동을 한 곳에서 관리합니다."}
              </p>
            </div>
          </div>
        </div>

        <CrmCouponKpiStrip />

        <Tabs value={tab} onValueChange={handleTab} className={adminTabsRootCn}>
          <AdminTabsBarWithHelp>
            <TabsList className={adminTabsListRowCn}>
              <TabsTrigger value="definitions" className={adminTabsTriggerCn}>
                <Ticket className={adminTabsIconCn} aria-hidden />
                {t("crmCouponTabDefinitions") || "쿠폰 정의"}
              </TabsTrigger>
              <TabsTrigger value="issue" className={adminTabsTriggerCn}>
                <Gift className={adminTabsIconCn} aria-hidden />
                {t("crmCouponTabIssue") || "회원 지급"}
              </TabsTrigger>
              <TabsTrigger value="history" className={adminTabsTriggerCn}>
                {t("crmCouponTabHistory") || "발급·이력"}
              </TabsTrigger>
              <TabsTrigger value="campaigns" className={adminTabsTriggerCn}>
                <Megaphone className={adminTabsIconCn} aria-hidden />
                {t("crmCouponTabCampaigns") || t("adminCrmCampaigns") || "쿠폰 캠페인"}
              </TabsTrigger>
              <TabsTrigger value="promo" className={adminTabsTriggerCn}>
                <KeyRound className={adminTabsIconCn} aria-hidden />
                {t("crmCouponTabPromo") || "프로모 코드"}
              </TabsTrigger>
              <TabsTrigger value="stamp" className={adminTabsTriggerCn}>
                <Stamp className={adminTabsIconCn} aria-hidden />
                {t("crmCouponTabStamp") || "스탬프 카드"}
              </TabsTrigger>
            </TabsList>
          </AdminTabsBarWithHelp>

          <TabsContent value="definitions" className={adminTabsContentCn}>
            <CrmCouponDefinitionPanel onOfferSecretPromo={offerSecretPromo} />
          </TabsContent>
          <TabsContent value="issue" className={adminTabsContentCn}>
            <CrmCouponIssuePanel />
          </TabsContent>
          <TabsContent value="history" className={adminTabsContentCn}>
            <CrmCouponHistoryPanel />
          </TabsContent>
          <TabsContent value="campaigns" className={adminTabsContentCn}>
            <CrmCouponCampaignPanel />
          </TabsContent>
          <TabsContent value="promo" className={adminTabsContentCn}>
            <CrmCouponPromoCodePanel
              prefill={promoPrefill}
              onPrefillConsumed={() => setPromoPrefill(null)}
            />
          </TabsContent>
          <TabsContent value="stamp" className={adminTabsContentCn}>
            <CrmCouponStampPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
