"use client"

import Link from "next/link"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export type AccountingWorkflowContext =
  | "receivable"
  | "bank"
  | "expense"
  | "petty"
  | "financial"
  | "tax"
  | "coa"
  | "depreciation"
  | "po"

type LinkItem = { href: string; labelKey: string }

const LINKS_BY_CONTEXT: Record<AccountingWorkflowContext, LinkItem[]> = {
  receivable: [
    { href: "/admin/bank-transactions", labelKey: "acct_link_bank" },
    { href: "/admin/expense-management", labelKey: "acct_link_expense" },
    { href: "/admin/financial-statements?tab=reconcile", labelKey: "acct_link_reconcile" },
    { href: "/admin/accounting/purchase-order", labelKey: "acct_link_po" },
  ],
  bank: [
    { href: "/admin/receivable-payable", labelKey: "acct_link_receivable" },
    { href: "/admin/expense-management", labelKey: "acct_link_expense" },
    { href: "/admin/petty-cash", labelKey: "acct_link_petty" },
    { href: "/admin/chart-of-accounts", labelKey: "acct_link_coa" },
  ],
  expense: [
    { href: "/admin/bank-transactions", labelKey: "acct_link_bank" },
    { href: "/admin/petty-cash", labelKey: "acct_link_petty" },
    { href: "/admin/receivable-payable", labelKey: "acct_link_receivable" },
    { href: "/admin/financial-statements?tab=income", labelKey: "acct_link_financial" },
  ],
  petty: [
    { href: "/admin/bank-transactions", labelKey: "acct_link_bank" },
    { href: "/admin/expense-management", labelKey: "acct_link_expense" },
    { href: "/admin/chart-of-accounts", labelKey: "acct_link_coa" },
    { href: "/admin/tax-filing", labelKey: "acct_link_tax" },
  ],
  financial: [
    { href: "/admin/receivable-payable", labelKey: "acct_link_receivable" },
    { href: "/admin/bank-transactions", labelKey: "acct_link_bank" },
    { href: "/admin/tax-filing", labelKey: "acct_link_tax" },
    { href: "/admin/chart-of-accounts", labelKey: "acct_link_coa" },
  ],
  tax: [
    { href: "/admin/financial-statements", labelKey: "acct_link_financial" },
    { href: "/admin/petty-cash", labelKey: "acct_link_petty" },
    { href: "/admin/receivable-payable", labelKey: "acct_link_receivable" },
    { href: "/admin/chart-of-accounts", labelKey: "acct_link_coa" },
  ],
  coa: [
    { href: "/admin/bank-transactions", labelKey: "acct_link_bank" },
    { href: "/admin/petty-cash", labelKey: "acct_link_petty" },
    { href: "/admin/expense-management", labelKey: "acct_link_expense" },
  ],
  depreciation: [
    { href: "/admin/chart-of-accounts", labelKey: "acct_link_coa" },
    { href: "/admin/financial-statements?tab=balance", labelKey: "acct_link_financial" },
    { href: "/admin/expense-management", labelKey: "acct_link_expense" },
  ],
  po: [
    { href: "/admin/receivable-payable", labelKey: "acct_link_receivable" },
    { href: "/admin/inbound", labelKey: "adminInbound" },
    { href: "/admin/bank-transactions", labelKey: "acct_link_bank" },
  ],
}

export function AccountingWorkflowLinks({
  context,
  className,
}: {
  context: AccountingWorkflowContext
  className?: string
}) {
  const t = useT(useLang().lang)
  const items = LINKS_BY_CONTEXT[context]

  return (
    <nav
      className={cn(
        "mb-4 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground",
        className
      )}
      aria-label={t("acct_workflow_links_aria")}
    >
      <span className="font-medium text-foreground/80">{t("acct_workflow_links_aria")}: </span>
      {items.map((item, i) => (
        <span key={item.href}>
          {i > 0 ? <span className="mx-1.5 text-border">·</span> : null}
          <Link
            href={item.href}
            className="text-primary underline-offset-2 hover:underline font-medium"
          >
            {t(item.labelKey)}
          </Link>
        </span>
      ))}
    </nav>
  )
}
