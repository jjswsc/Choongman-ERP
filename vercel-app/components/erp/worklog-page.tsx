"use client"

import * as React from "react"
import { ClipboardList, User, ShieldCheck, BarChart3 } from "lucide-react"
import {
  adminTabsBarCn,
  adminTabsContentFlushCn,
  adminTabsIconCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { WorklogMy } from "./worklog-my"
import { WorklogApproval } from "./worklog-approval"
import { WorklogWeekly } from "./worklog-weekly"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export function WorklogPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [tab, setTab] = React.useState("my")

  return (
    <div className="flex flex-col gap-6">
      {/* Page Title */}
      <div className="mb-2 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <ClipboardList className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {t("adminWorkLog")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("workLogSubtitle")}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className={adminTabsRootCn}>
        <div className={adminTabsBarCn}>
          <div className={adminTabsScrollCn}>
            <TabsList className={adminTabsListRowCn}>
              <TabsTrigger value="my" className={adminTabsTriggerCn}>
                <User className={adminTabsIconCn} aria-hidden />
                {t("workLogTabMy")}
              </TabsTrigger>
              <TabsTrigger value="approval" className={adminTabsTriggerCn}>
                <ShieldCheck className={adminTabsIconCn} aria-hidden />
                {t("workLogTabApproval")}
              </TabsTrigger>
              <TabsTrigger value="weekly" className={adminTabsTriggerCn}>
                <BarChart3 className={adminTabsIconCn} aria-hidden />
                {t("workLogTabWeekly")}
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="my" className={adminTabsContentFlushCn}>
          {auth?.user ? (
            <WorklogMy userName={auth.user} />
          ) : (
            <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
              {t("workLogLoginRequired")}
            </div>
          )}
        </TabsContent>
        <TabsContent value="approval" className={adminTabsContentFlushCn}>
          <WorklogApproval />
        </TabsContent>
        <TabsContent value="weekly" className={adminTabsContentFlushCn}>
          <WorklogWeekly />
        </TabsContent>
      </Tabs>
    </div>
  )
}
