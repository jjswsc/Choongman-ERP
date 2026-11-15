"use client"

import { Gift } from "lucide-react"
import { HrPageShell } from "@/components/hr/hr-page-shell"
import { HrSalesBonusContent } from "@/components/hr/hr-sales-bonus-content"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { canAccessAdminPayroll } from "@/lib/permissions"
import { useAppBrandConfig } from "@/components/app-brand-provider"

export default function AdminHrSalesBonusPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const brand = useAppBrandConfig()
  const allowed = canAccessAdminPayroll(auth?.role || "", brand.key, {
    canViewStorePayroll: auth?.canViewStorePayroll === true,
  })

  if (!allowed) {
    return (
      <HrPageShell icon={Gift} title={t("adminHrSalesBonus")} subtitle={t("adminHrSalesBonusSub")}>
        <p className="text-sm text-muted-foreground">{t("hrSalesBonus_no_access")}</p>
      </HrPageShell>
    )
  }

  return (
    <HrPageShell icon={Gift} title={t("adminHrSalesBonus")} subtitle={t("adminHrSalesBonusSub")}>
      <HrSalesBonusContent />
    </HrPageShell>
  )
}
