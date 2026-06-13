"use client"

import { Suspense } from "react"
import { NoticeAdminPageHeader, NoticeAdminWorkspace } from "@/components/erp/notice-admin-workspace"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

function AdminNoticesPageInner() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <NoticeAdminPageHeader />
        <NoticeAdminWorkspace />
      </div>
    </div>
  )
}

export default function AdminNoticesPage() {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          {t("loading")}
        </div>
      }
    >
      <AdminNoticesPageInner />
    </Suspense>
  )
}
