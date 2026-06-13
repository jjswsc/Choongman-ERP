"use client"

import { AdminChartOfAccounts } from "@/components/admin/admin-chart-of-accounts"
import { AccountingPageShell } from "@/components/erp/accounting-page-shell"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { GitBranch } from "lucide-react"

export default function ChartOfAccountsPage() {
  const t = useT(useLang().lang)
  return (
    <AccountingPageShell
      icon={GitBranch}
      title={t("adminChartOfAccounts")}
      subtitle={t("adminChartOfAccountsSub")}
      maxWidthClass="max-w-5xl"
    >
      <AdminChartOfAccounts />
    </AccountingPageShell>
  )
}
