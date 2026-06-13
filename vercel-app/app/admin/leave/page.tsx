"use client"


import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Calendar } from "lucide-react"
import { AdminLeaveApproval } from "@/components/admin/admin-leave-approval"
import { AdminLeaveStats } from "@/components/admin/admin-leave-stats"
import { HrPageShell } from "@/components/hr/hr-page-shell"
import {
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

function AdminLeavePageInner() {
  const { lang } = useLang()
  const t = useT(lang)
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<"approval" | "stats">("approval")

  useEffect(() => {
    const p = searchParams.get("tab")
    if (p === "stats") setTab("stats")
    else if (p === "approval") setTab("approval")
  }, [searchParams])

  return (
    <HrPageShell icon={Calendar} title={t("adminLeave")} subtitle={t("adminLeaveSub")}>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "approval" | "stats")} className={adminTabsRootCn}>
          <AdminTabsBarWithHelp>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="approval" className={adminTabsTriggerCn}>
                  {t("adminLeaveApproval")}
                </TabsTrigger>
                <TabsTrigger value="stats" className={adminTabsTriggerCn}>
                  {t("leave_tab_stats")}
                </TabsTrigger>
              </TabsList>
          </AdminTabsBarWithHelp>
          <TabsContent value="approval" className={adminTabsContentCn}>
            <AdminLeaveApproval />
          </TabsContent>
          <TabsContent value="stats" className={adminTabsContentCn}>
            <AdminLeaveStats />
          </TabsContent>
        </Tabs>
    </HrPageShell>
  )
}

export default function AdminLeavePage() {
  const t = useT(useLang().lang)
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] flex-1 items-center justify-center text-sm text-muted-foreground">
          {t("loading")}
        </div>
      }
    >
      <AdminLeavePageInner />
    </Suspense>
  )
}
