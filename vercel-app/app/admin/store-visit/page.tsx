"use client"

import { useState } from "react"
import { MapPin } from "lucide-react"
import {
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootScrollableCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { cn } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { StorePageShell } from "@/components/erp/store-page-shell"
import { VisitStatsContent } from "@/components/visit-stats/visit-stats-content"
import { VisitListTab } from "@/components/visit-stats/visit-list-tab"
import { VisitTodayTab } from "@/components/visit-stats/visit-today-tab"

export default function Page() {
  const { lang } = useLang()
  const t = useT(lang)
  /** 제어 탭: 당일 탭 활성 여부를 ErpTabActive에 전달 → 숨은 탭에서 Recharts 0폭 측정 방지 */
  const [tab, setTab] = useState("list")

  return (
    <StorePageShell icon={MapPin} title={t("adminStoreVisit")} subtitle={t("visit_page_title")}>
      <Tabs value={tab} onValueChange={setTab} className={adminTabsRootScrollableCn}>
        <AdminTabsBarWithHelp>
          <TabsList className={adminTabsListRowCn}>
            <TabsTrigger value="list" className={adminTabsTriggerCn}>
              {t("tab_visit_list")}
            </TabsTrigger>
            <TabsTrigger value="today" className={adminTabsTriggerCn}>
              {t("tab_visit_today")}
            </TabsTrigger>
            <TabsTrigger value="stats" className={adminTabsTriggerCn}>
              {t("tab_visit_stats")}
            </TabsTrigger>
          </TabsList>
        </AdminTabsBarWithHelp>
        <TabsContent value="list" className={cn(adminTabsContentCn, "space-y-4")}>
          <VisitListTab />
        </TabsContent>
        <TabsContent value="today" className={cn(adminTabsContentCn, "space-y-4")}>
          <VisitTodayTab />
        </TabsContent>
        <TabsContent value="stats" className={cn(adminTabsContentCn, "space-y-4")}>
          <VisitStatsContent />
        </TabsContent>
      </Tabs>
    </StorePageShell>
  )
}
