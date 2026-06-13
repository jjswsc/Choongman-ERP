"use client"

import { BankTransactionsTab } from "@/components/tabs/bank-transactions-tab"
import { AccountingPageShell } from "@/components/erp/accounting-page-shell"
import { AccountingWorkflowLinks } from "@/components/erp/accounting-workflow-links"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { Landmark } from "lucide-react"

export default function BankTransactionsPage() {
  const t = useT(useLang().lang)
  return (
    <AccountingPageShell icon={Landmark} title={t("bankTitle")} subtitle={t("bankTransactionsSub")}>
      <AccountingWorkflowLinks context="bank" />
      <BankTransactionsTab />
    </AccountingPageShell>
  )
}
