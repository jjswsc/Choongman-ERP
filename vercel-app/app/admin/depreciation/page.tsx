"use client"

import { DepreciationTab } from "@/components/tabs/depreciation-tab"
import { AccountingPageShell } from "@/components/erp/accounting-page-shell"
import { AccountingWorkflowLinks } from "@/components/erp/accounting-workflow-links"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { Calculator } from "lucide-react"

export default function DepreciationPage() {
  const t = useT(useLang().lang)
  return (
    <AccountingPageShell
      icon={Calculator}
      title={t("adminDepreciation")}
      subtitle={t("adminDepreciationSub")}
    >
      <AccountingWorkflowLinks context="depreciation" />
      <DepreciationTab />
    </AccountingPageShell>
  )
}
