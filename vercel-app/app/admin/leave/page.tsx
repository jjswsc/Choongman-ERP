"use client"

import { AdminLeaveApproval } from "@/components/admin/admin-leave-approval"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export default function AdminLeavePage() {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold tracking-tight text-foreground">{t("adminLeave")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("adminLeaveApproval")}</p>
        </div>
        <AdminLeaveApproval />
      </div>
    </div>
  )
}
