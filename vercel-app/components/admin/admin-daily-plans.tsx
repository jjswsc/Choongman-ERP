"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { CalendarRange } from "lucide-react"
import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { StorePageShell } from "@/components/erp/store-page-shell"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { DailyPlanBoard } from "@/components/admin/daily-plan-board"
import { DailyPlanAssign, type DailyPlanAssignPreset } from "@/components/admin/daily-plan-assign"
import { DailyPlanTemplates } from "@/components/admin/daily-plan-templates"
import { DailyPlanTime } from "@/components/admin/daily-plan-time"
import { DailyPlanWeek } from "@/components/admin/daily-plan-week"

type TabKey = "board" | "week" | "assign" | "templates" | "time"
const TAB_KEYS: TabKey[] = ["board", "week", "assign", "templates", "time"]

export function AdminDailyPlans() {
  const searchParams = useSearchParams()
  const { lang } = useLang()
  const t = useT(lang)
  const [tab, setTab] = useState<TabKey>("board")
  const [preset, setPreset] = useState<DailyPlanAssignPreset | null>(null)

  useEffect(() => {
    const p = searchParams.get("tab")
    if (p && (TAB_KEYS as string[]).includes(p)) setTab(p as TabKey)
  }, [searchParams])

  return (
    <StorePageShell icon={CalendarRange} title={t("adminDailyPlans")} subtitle={t("dp_page_sub")}>
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className={adminTabsRootCn}>
        <AdminTabsBarWithHelp>
          <TabsList className={adminTabsListRowCn}>
            <TabsTrigger value="board" className={adminTabsTriggerCn}>
              {t("dp_tab_board")}
            </TabsTrigger>
            <TabsTrigger value="week" className={adminTabsTriggerCn}>
              {t("dp_tab_week")}
            </TabsTrigger>
            <TabsTrigger value="assign" className={adminTabsTriggerCn}>
              {t("dp_tab_assign")}
            </TabsTrigger>
            <TabsTrigger value="templates" className={adminTabsTriggerCn}>
              {t("dp_tab_templates")}
            </TabsTrigger>
            <TabsTrigger value="time" className={adminTabsTriggerCn}>
              {t("dp_tab_time")}
            </TabsTrigger>
          </TabsList>
        </AdminTabsBarWithHelp>
        <TabsContent value="board" className={cn(adminTabsContentCn, "space-y-3")}>
          {tab === "board" ? <DailyPlanBoard t={t} /> : null}
        </TabsContent>
        <TabsContent value="week" className={cn(adminTabsContentCn, "space-y-3")}>
          {tab === "week" ? (
            <DailyPlanWeek
              t={t}
              onAssign={(date, employeeId) => {
                setPreset({ date, employeeId, nonce: Date.now() })
                setTab("assign")
              }}
            />
          ) : null}
        </TabsContent>
        <TabsContent value="assign" className={cn(adminTabsContentCn, "space-y-3")}>
          {tab === "assign" ? <DailyPlanAssign t={t} preset={preset} /> : null}
        </TabsContent>
        <TabsContent value="templates" className={cn(adminTabsContentCn, "space-y-3")}>
          {tab === "templates" ? <DailyPlanTemplates t={t} /> : null}
        </TabsContent>
        <TabsContent value="time" className={cn(adminTabsContentCn, "space-y-3")}>
          {tab === "time" ? <DailyPlanTime t={t} /> : null}
        </TabsContent>
      </Tabs>
    </StorePageShell>
  )
}
