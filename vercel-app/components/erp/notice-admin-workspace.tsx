"use client"

import * as React from "react"
import { Megaphone, Send, History, UserX, BellRing } from "lucide-react"
import { AdminNoticeCompose } from "@/components/erp/admin-notice-compose"
import { AdminNoticeHistory } from "@/components/erp/admin-notice-history"
import { AdminNoticeUnread } from "@/components/erp/admin-notice-unread"
import { AdminNoticeAuto } from "@/components/erp/admin-notice-auto"
import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import {
  adminTabsContentCn,
  adminTabsIconCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAdminUrlTab } from "@/lib/use-admin-url-tab"

const NOTICE_TABS = ["compose", "history", "unread", "auto"] as const

export function NoticeAdminWorkspace() {
  const { lang } = useLang()
  const t = useT(lang)
  const [tab, setTab] = useAdminUrlTab("tab", NOTICE_TABS, "compose")

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as (typeof NOTICE_TABS)[number])}
      className={adminTabsRootCn}
    >
      <AdminTabsBarWithHelp>
        <TabsList className={adminTabsListRowCn}>
          <TabsTrigger value="compose" className={adminTabsTriggerCn}>
            <Send className={adminTabsIconCn} aria-hidden />
            {t("noticeNewTitle")}
          </TabsTrigger>
          <TabsTrigger value="history" className={adminTabsTriggerCn}>
            <History className={adminTabsIconCn} aria-hidden />
            {t("noticeHistoryTitle")}
          </TabsTrigger>
          <TabsTrigger value="unread" className={adminTabsTriggerCn}>
            <UserX className={adminTabsIconCn} aria-hidden />
            {t("noticeUnreadTabTitle")}
          </TabsTrigger>
          <TabsTrigger value="auto" className={adminTabsTriggerCn}>
            <BellRing className={adminTabsIconCn} aria-hidden />
            {t("noticeAutoTabTitle")}
          </TabsTrigger>
        </TabsList>
      </AdminTabsBarWithHelp>
      <TabsContent value="compose" className={adminTabsContentCn}>
        <React.Suspense fallback={null}>
          <AdminNoticeCompose />
        </React.Suspense>
      </TabsContent>
      <TabsContent value="history" className={adminTabsContentCn}>
        <AdminNoticeHistory />
      </TabsContent>
      <TabsContent value="unread" className={adminTabsContentCn}>
        <AdminNoticeUnread />
      </TabsContent>
      <TabsContent value="auto" className={adminTabsContentCn}>
        <AdminNoticeAuto />
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
