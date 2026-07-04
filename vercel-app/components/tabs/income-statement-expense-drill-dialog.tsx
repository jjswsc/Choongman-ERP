"use client"

import * as React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import Link from "next/link"
import { ExternalLink, Loader2 } from "lucide-react"
import { type IncomeStatementExpenseDrillDown } from "@/lib/api-client"
import { formatBahtInteger as formatBath } from "@/lib/financial-amount-format"
import {
  buildExpenseDrillAdminHref,
  expenseDrillNavContextFromDrill,
} from "@/lib/income-statement-purchase-drill-nav"

export function IncomeExpenseDrillDialog({
  open,
  onOpenChange,
  expenseDrillTitle,
  expenseDrillLoading,
  expenseDrillData,
  t,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  expenseDrillTitle: string
  expenseDrillLoading: boolean
  expenseDrillData: IncomeStatementExpenseDrillDown | null
  t: (k: string) => string
}) {
  const drillNavCtx =
    expenseDrillData && !expenseDrillData.error
      ? expenseDrillNavContextFromDrill(expenseDrillData)
      : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("pL_expenseDrillTitle")} — {expenseDrillTitle}
          </DialogTitle>
          {expenseDrillData && (
            <p className="text-xs text-muted-foreground font-normal">
              {expenseDrillData.startStr} ~ {expenseDrillData.endStr}
              {expenseDrillData.storeFilter && expenseDrillData.storeFilter !== "All"
                ? ` · ${expenseDrillData.storeFilter}`
                : ""}
            </p>
          )}
        </DialogHeader>
        {expenseDrillLoading && (
          <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            {t("pL_expenseDrillLoading")}
          </div>
        )}
        {!expenseDrillLoading && expenseDrillData?.error && (
          <p className="text-sm text-destructive py-2">{expenseDrillData.error}</p>
        )}
        {!expenseDrillLoading && expenseDrillData && !expenseDrillData.error && (
          <div className="space-y-4 text-sm">
            {(expenseDrillData.truncated.petty ||
              expenseDrillData.truncated.bank ||
              expenseDrillData.truncated.fixed) && (
              <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 rounded-md px-2 py-1.5">
                {t("pL_expenseDrillTruncated")}
              </p>
            )}
            <div className="flex flex-wrap gap-3 text-xs">
              <Link
                href={
                  drillNavCtx
                    ? buildExpenseDrillAdminHref("/admin/bank-transactions", drillNavCtx, "bank")
                    : "/admin/bank-transactions"
                }
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t("pL_expenseDrillLinkBank")}
              </Link>
              <Link
                href={
                  drillNavCtx
                    ? buildExpenseDrillAdminHref("/admin/petty-cash", drillNavCtx, "petty")
                    : "/admin/petty-cash"
                }
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t("pL_expenseDrillLinkPetty")}
              </Link>
            </div>

            {expenseDrillData.petty.length > 0 && (
              <div>
                <p className="font-medium mb-1">{t("pL_expenseDrillPetty")}</p>
                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left p-2">{t("pL_purchaseDrillColId")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColDate")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColStore")}</th>
                        <th className="text-right p-2">{t("amount")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColMemo")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenseDrillData.petty.map((r) => (
                        <tr key={r.id} className="border-b border-border/60">
                          <td className="p-2 font-mono">{r.id}</td>
                          <td className="p-2 whitespace-nowrap">{r.transDate}</td>
                          <td className="p-2 max-w-[120px] truncate">{r.store || "—"}</td>
                          <td className="p-2 text-right font-mono">{formatBath(r.amount)}</td>
                          <td className="p-2 max-w-[220px] truncate" title={r.memo || ""}>
                            {r.memo || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {expenseDrillData.bankWithdrawals.length > 0 && (
              <div>
                <p className="font-medium mb-1">{t("pL_expenseDrillBank")}</p>
                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left p-2">{t("pL_purchaseDrillColId")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColDate")}</th>
                        <th className="text-left p-2">{t("pL_expenseDrillColCategory")}</th>
                        <th className="text-right p-2">{t("amount")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColMemo")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenseDrillData.bankWithdrawals.map((r) => (
                        <tr key={r.id} className="border-b border-border/60">
                          <td className="p-2 font-mono">{r.id}</td>
                          <td className="p-2 whitespace-nowrap">{r.expenseDate || r.transDate}</td>
                          <td className="p-2">{r.category || "—"}</td>
                          <td className="p-2 text-right font-mono">{formatBath(r.amount)}</td>
                          <td className="p-2 max-w-[220px] truncate" title={r.memo || ""}>
                            {r.memo || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {expenseDrillData.fixedExpenses.length > 0 && (
              <div>
                <p className="font-medium mb-1">{t("pL_expenseDrillFixed")}</p>
                <p className="text-xs text-muted-foreground mb-2">{t("pL_expenseDrillFixedNote")}</p>
                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left p-2">{t("pL_expenseDrillColName")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColStore")}</th>
                        <th className="text-right p-2">{t("amount")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColMemo")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenseDrillData.fixedExpenses.map((r) => (
                        <tr key={r.id} className="border-b border-border/60">
                          <td className="p-2">{r.name}</td>
                          <td className="p-2">{r.store}</td>
                          <td className="p-2 text-right font-mono">{formatBath(r.monthlyAmount)}</td>
                          <td className="p-2 max-w-[200px] truncate">{r.memo || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!(
              expenseDrillData.petty.length > 0 ||
              expenseDrillData.bankWithdrawals.length > 0 ||
              expenseDrillData.fixedExpenses.length > 0
            ) && (
              <p className="text-sm text-muted-foreground py-4">{t("pL_purchaseDrillEmpty")}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
