"use client"

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
        <div className="mb-6">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {t("adminNotices")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("adminNoticesSub")}
          </p>
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
