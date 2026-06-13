"use client"

import { ReceivablePayableTab } from "@/components/tabs/receivable-payable-tab"
import { AccountingPageShell } from "@/components/erp/accounting-page-shell"
import { AccountingWorkflowLinks } from "@/components/erp/accounting-workflow-links"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { ArrowLeftRight } from "lucide-react"

export default function Page() {
  const t = useT(useLang().lang)
  return (
    <AccountingPageShell
      icon={ArrowLeftRight}
      title={t("receivablePayableTitle")}
      subtitle={t("receivablePayableSub")}
    >
      <AccountingWorkflowLinks context="receivable" />
      <ReceivablePayableTab />
    </AccountingPageShell>
  )
}
