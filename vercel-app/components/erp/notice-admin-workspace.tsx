"use client"

import * as React from "react"
import { Megaphone } from "lucide-react"
import { AdminNoticeCompose } from "@/components/erp/admin-notice-compose"
import { AdminNoticeHistory } from "@/components/erp/admin-notice-history"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export function NoticeAdminWorkspace() {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <Tabs defaultValue="compose" className="flex flex-col gap-4">
      <TabsList className="w-full sm:w-auto h-10">
        <TabsTrigger value="compose" className="text-xs sm:text-sm">
          {t("noticeNewTitle")}
        </TabsTrigger>
        <TabsTrigger value="history" className="text-xs sm:text-sm">
          {t("noticeHistoryTitle")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="compose" className="mt-0">
        <React.Suspense fallback={null}>
          <AdminNoticeCompose />
        </React.Suspense>
      </TabsContent>
      <TabsContent value="history" className="mt-0">
        <AdminNoticeHistory />
      </TabsContent>
    </Tabs>
  )
}

export function NoticeAdminPageHeader() {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <div className="mb-6 flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
        <Megaphone className="h-5 w-5 text-primary" />
      </div>
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">{t("adminNotices")}</h1>
        <p className="text-xs text-muted-foreground">{t("adminNoticesSubEnhanced")}</p>
      </div>
    </div>
  )
}
