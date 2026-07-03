"use client"

import type { ExpenseSearchOverviewRow } from "@/lib/api-client"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export function ExpenseSearchTimelineCell({ row }: { row: ExpenseSearchOverviewRow }) {
  const { lang } = useLang()
  const t = useT(lang)
  const tt = (key: string, fallback: string) => {
    const v = t(key)
    return !v || v === key ? fallback : v
  }

  const hasPlan = !!row.accrualId
  const hasBank = !!row.bankTransactionId

  const steps = [
    {
      key: "plan",
      done: hasPlan,
      active: hasPlan && !hasBank && row.relation !== "rejected",
      label: tt("expenseSearchTimelinePlan", "발생"),
      sub: hasPlan ? `#${row.accrualId}` : "—",
    },
    {
      key: "approve",
      done: row.planStatus === "approved" || row.planStatus === "paid" || hasBank,
      active: row.relation === "approved_unpaid",
      label: tt("expenseSearchTimelineApprove", "승인"),
      sub: row.planStatus === "rejected" ? tt("att_rejected", "Rejected") : row.planStatus || "—",
    },
    {
      key: "pay",
      done: hasBank || row.relation === "paid_petty",
      active: row.relation === "approved_unpaid",
      label: tt("expenseSearchTimelinePay", "지급"),
      sub: hasBank ? `#${row.bankTransactionId}` : row.relation === "bank_only" ? tt("expenseSearchRelationBankOnly", "Bank Only") : "—",
    },
  ]

  return (
    <div className="flex items-center gap-0.5 min-w-[168px]">
      {steps.map((step, i) => (
        <div key={step.key} className="flex items-center gap-0.5 flex-1 min-w-0">
          <div
            className={`flex-1 min-w-0 rounded px-1 py-0.5 text-center text-[10px] leading-tight border ${
              step.done
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : step.active
                  ? "bg-sky-50 border-sky-200 text-sky-800"
                  : "bg-muted/40 border-border/50 text-muted-foreground"
            }`}
          >
            <div className="font-medium truncate">{step.label}</div>
            <div className="truncate opacity-80">{step.sub}</div>
          </div>
          {i < steps.length - 1 ? <span className="text-muted-foreground text-[10px]">›</span> : null}
        </div>
      ))}
    </div>
  )
}
