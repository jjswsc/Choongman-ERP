"use client"

import { ExpenseManagementTab } from "@/components/tabs/expense-management-tab"
import { AccountingPageShell } from "@/components/erp/accounting-page-shell"
import { AccountingWorkflowLinks } from "@/components/erp/accounting-workflow-links"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { Receipt } from "lucide-react"

export default function ExpenseManagementPage() {
  const t = useT(useLang().lang)
  const enabled = process.env.NEXT_PUBLIC_ENABLE_EXPENSE_MANAGEMENT !== "false"
  if (!enabled) {
    return (
      <AccountingPageShell hideHeader>
        <p className="text-sm text-muted-foreground">{t("msg_no_permission")}</p>
      </AccountingPageShell>
    )
  }
  return (
    <AccountingPageShell
      icon={Receipt}
      title={t("expenseManagementTitle")}
      subtitle={t("expenseManagementSub")}
    >
      <AccountingWorkflowLinks context="expense" />
      <ExpenseManagementTab />
    </AccountingPageShell>
  )
}
