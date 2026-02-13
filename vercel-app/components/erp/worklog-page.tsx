"use client"

import * as React from "react"
import { ClipboardList, User, ShieldCheck, BarChart3 } from "lucide-react"
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
      <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-4">
        <TabsList className="grid w-full max-w-md grid-cols-3 rounded-xl bg-muted/50 p-1">
          <TabsTrigger
            value="my"
            className="flex items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <User className="h-4 w-4" />
            <span className="text-sm font-semibold">{t("workLogTabMy")}</span>
          </TabsTrigger>
          <TabsTrigger
            value="approval"
            className="flex items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <ShieldCheck className="h-4 w-4" />
            <span className="text-sm font-semibold">{t("workLogTabApproval")}</span>
          </TabsTrigger>
          <TabsTrigger
            value="weekly"
            className="flex items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <BarChart3 className="h-4 w-4" />
            <span className="text-sm font-semibold">{t("workLogTabWeekly")}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="my" className="mt-0">
          {auth?.user ? (
            <WorklogMy userName={auth.user} />
          ) : (
            <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
              {t("workLogLoginRequired")}
            </div>
          )}
        </TabsContent>
        <TabsContent value="approval" className="mt-0">
          <WorklogApproval />
        </TabsContent>
        <TabsContent value="weekly" className="mt-0">
          <WorklogWeekly />
        </TabsContent>
      </Tabs>
    </div>
  )
}
