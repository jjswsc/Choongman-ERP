"use client"

import { appAlert } from "@/lib/app-message"
import { MemberStampCardAdminPanel } from "@/components/admin/member-stamp-card-admin-panel"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { canEditMemberPortalAdmin } from "@/lib/permissions"

export function CrmCouponStampPanel() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const canEdit = canEditMemberPortalAdmin(auth?.role || "", auth?.store)

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("mpAdmin_stampCardDesc")}</p>
      <MemberStampCardAdminPanel
        canEdit={canEdit}
        onNotice={(msg) => {
          void appAlert(msg)
        }}
        onError={(msg) => {
          void appAlert(msg)
        }}
      />
    </div>
  )
}
