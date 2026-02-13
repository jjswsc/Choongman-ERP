"use client"

import { Megaphone } from "lucide-react"
import { AdminNoticeCompose } from "@/components/erp/admin-notice-compose"
import { AdminNoticeHistory } from "@/components/erp/admin-notice-history"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export default function AdminNoticesPage() {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Page Title */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Megaphone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t("adminNotices")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("adminNoticesSub")}
            </p>
          </div>
        </div>

        {/* Two column layout */}
        <div className="grid gap-6 lg:grid-cols-2">
          <AdminNoticeCompose />
          <AdminNoticeHistory />
        </div>
      </div>
    </div>
  )
}
