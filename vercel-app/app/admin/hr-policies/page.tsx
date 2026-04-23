"use client"

import { FileText } from "lucide-react"
import { HrPolicyAdminWorkspace } from "@/components/erp/hr-policy-admin-workspace"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export default function AdminHrPoliciesPage() {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("adminHrPolicies")}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("adminHrPoliciesSub")}</p>
          </div>
        </div>

        <HrPolicyAdminWorkspace />
      </div>
    </div>
  )
}
