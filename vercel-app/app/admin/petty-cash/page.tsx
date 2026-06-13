"use client"

import { PettyCashTab } from "@/components/tabs/petty-cash-tab"
import { AccountingPageShell } from "@/components/erp/accounting-page-shell"
import { AccountingWorkflowLinks } from "@/components/erp/accounting-workflow-links"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { HandCoins } from "lucide-react"

export default function Page() {
  const t = useT(useLang().lang)
  return (
    <AccountingPageShell icon={HandCoins} title={t("pettyCashTitle")} subtitle={t("pettyCashSub")}>
      <AccountingWorkflowLinks context="petty" />
      <PettyCashTab showAccountSubjectEmptyFilter adminEnhancedSearch />
    </AccountingPageShell>
  )
}
