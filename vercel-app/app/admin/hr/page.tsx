"use client"

import { LayoutDashboard } from "lucide-react"
import { AdminHrHub } from "@/components/hr/admin-hr-hub"
import { HrPageShell } from "@/components/hr/hr-page-shell"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export default function AdminHrPage() {
  const t = useT(useLang().lang)
  return (
    <HrPageShell icon={LayoutDashboard} title={t("adminHrHome")} subtitle={t("adminHrHomeSub")} showSubnav={false}>
      <AdminHrHub />
    </HrPageShell>
  )
}
