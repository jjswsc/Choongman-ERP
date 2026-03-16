"use client"

import { ExpenseManagementTab } from "@/components/tabs/expense-management-tab"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { Wallet } from "lucide-react"

export default function ExpenseManagementPage() {
  const t = useT(useLang().lang)
  const enabled = process.env.NEXT_PUBLIC_ENABLE_EXPENSE_MANAGEMENT !== "false"
  if (!enabled) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <p className="text-sm text-muted-foreground">{t("msg_no_permission") || "접근 권한이 없습니다."}</p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">
            {t("expenseManagementTitle") || "지출 관리"}
          </h1>
        </div>
        <ExpenseManagementTab />
      </div>
    </div>
  )
}
