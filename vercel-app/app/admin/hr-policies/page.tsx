"use client"

import { FileText } from "lucide-react"
import { HrPolicyAdminWorkspace } from "@/components/erp/hr-policy-admin-workspace"
import { HrPageShell } from "@/components/hr/hr-page-shell"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export default function AdminHrPoliciesPage() {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <HrPageShell icon={FileText} title={t("adminHrPolicies")} subtitle={t("adminHrPoliciesSub")}>
      <HrPolicyAdminWorkspace />
    </HrPageShell>
  )
}
