"use client"


import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Calendar } from "lucide-react"
import { AdminLeaveApproval } from "@/components/admin/admin-leave-approval"
import { AdminLeaveStats } from "@/components/admin/admin-leave-stats"
import {
  adminTabsBarCn,
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
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
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Calendar className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{t("adminLeave")}</h1>
            <p className="text-xs text-muted-foreground">{t("adminLeaveApproval")}</p>
          </div>
        </div>
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
      </div>
    </div>
  )
}

export default function AdminLeavePage() {
  const { lang } = useLang()
  const t = useT(lang)
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">{t("loading")}</div>
      }
    >
      <AdminLeavePageInner />
    </Suspense>
  )
}
