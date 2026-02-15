"use client"

import { Calendar } from "lucide-react"
import { AdminLeaveApproval } from "@/components/admin/admin-leave-approval"
import { AdminLeaveStats } from "@/components/admin/admin-leave-stats"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export default function AdminLeavePage() {
  const { lang } = useLang()
  const t = useT(lang)

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
        <Tabs defaultValue="approval" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 mb-4">
            <TabsTrigger value="approval" className="text-sm font-medium">
              {t("adminLeaveApproval")}
            </TabsTrigger>
            <TabsTrigger value="stats" className="text-sm font-medium">
              {t("leave_tab_stats")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="approval">
            <AdminLeaveApproval />
          </TabsContent>
          <TabsContent value="stats">
            <AdminLeaveStats />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
