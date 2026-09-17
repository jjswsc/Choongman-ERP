"use client"


import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { Suspense } from "react"
import { useAdminUrlTab } from "@/lib/use-admin-url-tab"
import { Calendar } from "lucide-react"
import { AdminLeaveApproval } from "@/components/admin/admin-leave-approval"
import { AdminLeaveApprovers } from "@/components/admin/admin-leave-approvers"
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
  const [tab, setTab] = useAdminUrlTab(
    "tab",
    ["approval", "stats", "approvers"] as const,
    "approval"
  )

  return (
    <HrPageShell icon={Calendar} title={t("adminLeave")} subtitle={t("adminLeaveSub")}>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "approval" | "stats" | "approvers")} className={adminTabsRootCn}>
          <AdminTabsBarWithHelp>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="approval" className={adminTabsTriggerCn}>
                  {t("adminLeaveApproval")}
                </TabsTrigger>
                <TabsTrigger value="stats" className={adminTabsTriggerCn}>
                  {t("leave_tab_stats")}
                </TabsTrigger>
                <TabsTrigger value="approvers" className={adminTabsTriggerCn}>
                  {t("leaveApproversTab") || "승인자"}
                </TabsTrigger>
              </TabsList>
          </AdminTabsBarWithHelp>
          <TabsContent value="approval" className={adminTabsContentCn}>
            <AdminLeaveApproval />
          </TabsContent>
          <TabsContent value="stats" className={adminTabsContentCn}>
            <AdminLeaveStats />
          </TabsContent>
          <TabsContent value="approvers" className={adminTabsContentCn}>
            <AdminLeaveApprovers />
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
