"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ExpensePlanStatusBadge } from "@/components/erp/expense-plan-status-badge"
import { AdminMobileOnly } from "@/components/erp/admin-responsive-list"
import type { ExpenseAccrualPlanItem } from "@/lib/api-client"
import { expensePayeeVendorManageHref } from "@/lib/expense-payee-vendor-href"
import { expensePlanRowAccentClass, expensePlanRowToneClass } from "@/lib/expense-plan-row-tone"
import { cn } from "@/lib/utils"
import { Pencil, Trash2 } from "lucide-react"

type Tt = (key: string, fallback: string) => string

export type ExpensePlanMobileListProps = {
  plansByStore: [string, ExpenseAccrualPlanItem[]][]
  title?: string
  emptyLabel?: string
  tt: Tt
  getPayeeLine: (name: string, codeLabel: string) => string
  getMemo: (memo: string | undefined) => string
  renderWithdrawalType: (category?: string) => ReactNode
  accountSubjectLabel: (id?: number | null) => string
  renderPayAmount: (r: ExpenseAccrualPlanItem) => ReactNode
  planRowEditable: (r: ExpenseAccrualPlanItem) => boolean
  canApproveByPolicy: (r: ExpenseAccrualPlanItem) => boolean
  canDeleteByPolicy: (r: ExpenseAccrualPlanItem) => boolean
  payingId: number | null
  deletingPlanId: number | null
  approvalEditById: Record<number, boolean>
  updatingInvoiceAccrualId?: number | null
  onPlanDetail: (r: ExpenseAccrualPlanItem) => void
  onEdit: (r: ExpenseAccrualPlanItem) => void
  onPay: (r: ExpenseAccrualPlanItem) => void
  onDelete: (r: ExpenseAccrualPlanItem) => void
  onApprove: (r: ExpenseAccrualPlanItem, action: "approve" | "reject") => void
  onApprovalEdit: (id: number) => void
  onInvoiceToggle?: (r: ExpenseAccrualPlanItem, checked: boolean) => void
  renderAttachmentButton: (r: ExpenseAccrualPlanItem) => ReactNode
}

export function ExpensePlanMobileList({
  plansByStore,
  title,
  emptyLabel,
  tt,
  getPayeeLine,
  getMemo,
  renderWithdrawalType,
  accountSubjectLabel,
  renderPayAmount,
  planRowEditable,
  canApproveByPolicy,
  canDeleteByPolicy,
  payingId,
  deletingPlanId,
  approvalEditById,
  updatingInvoiceAccrualId,
  onPlanDetail,
  onEdit,
  onPay,
  onDelete,
  onApprove,
  onApprovalEdit,
  onInvoiceToggle,
  renderAttachmentButton,
}: ExpensePlanMobileListProps) {
  const flatCount = plansByStore.reduce((s, [, rows]) => s + rows.length, 0)

  return (
    <AdminMobileOnly className="space-y-3">
      {title ? <div className="text-sm font-semibold px-0.5">{title}</div> : null}
      {flatCount === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {emptyLabel || tt("payableEmpty", "No payable items found.")}
        </p>
      ) : (
        plansByStore.map(([storeLabel, rows]) => (
          <div key={storeLabel}>
            <p className="mb-1.5 px-0.5 text-xs font-semibold text-foreground">
              {tt("store", "Store")}: {storeLabel}
              <span className="ml-1 font-normal text-muted-foreground">
                ({rows.length}
                {tt("receivPayCount", "items")})
              </span>
            </p>
            <div className="rounded-lg border border-border/60">
              {rows.map((r) => {
                const codeLabel =
                  r.payeeCode && !r.payeeCode.startsWith("auto_") ? ` (${r.payeeCode})` : ""
                const canPay = r.status === "approved" && (r.remainingAmount || 0) > 0
                const showApprove =
                  canApproveByPolicy(r) &&
                  (r.status === "planned" || approvalEditById[r.id]) &&
                  r.status !== "paid"
                const missingBank =
                  canPay && !String(r.payeeBankAccountNo || "").trim()
                return (
                  <div
                    key={r.id}
                    className={cn(
                      "space-y-2 border-b border-border/60 px-3 py-3 last:border-b-0",
                      expensePlanRowAccentClass(r.status),
                      expensePlanRowToneClass(r.status)
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm font-semibold leading-snug text-foreground">
                          {getPayeeLine(r.payeeName || "", codeLabel)}
                        </p>
                        <p className="text-[11px] tabular-nums text-muted-foreground">
                          {r.documentNo || `#${r.id}`}
                          {" · "}
                          {renderWithdrawalType(r.withdrawalCategory)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {accountSubjectLabel(r.accountSubjectId) || "-"}
                        </p>
                      </div>
                      <ExpensePlanStatusBadge status={r.status} />
                    </div>
                    <div className="flex items-start justify-between gap-2 text-xs">
                      <span className="tabular-nums text-muted-foreground">
                        {r.dueDate || r.expenseDate || "-"}
                      </span>
                      <span className="text-right font-semibold tabular-nums text-foreground">
                        {renderPayAmount(r)}
                      </span>
                    </div>
                    {(r.payeeBankName || r.payeeBankAccountNo || missingBank) &&
                      (missingBank ? (
                        <Link
                          href={expensePayeeVendorManageHref(r.payeeCode, r.payeeName)}
                          className="inline-flex text-[11px] font-medium text-amber-700 underline-offset-2 hover:underline dark:text-amber-400"
                          title={tt(
                            "expenseBankAccountMissingHint",
                            "Open Vendor Management to enter the bank account"
                          )}
                        >
                          {tt("expenseBankAccountMissing", "Account missing")}
                        </Link>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">
                          {[r.payeeBankName, r.payeeBankAccountNo].filter(Boolean).join(" · ")}
                        </p>
                      ))}
                    {r.memo ? (
                      <button
                        type="button"
                        className="w-full text-left text-[11px] leading-relaxed text-muted-foreground"
                        onClick={() => onPlanDetail(r)}
                      >
                        {getMemo(r.memo)}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="text-[11px] text-primary"
                        onClick={() => onPlanDetail(r)}
                      >
                        {tt("expensePlanDetailTitle", "Detail")}
                      </button>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {renderAttachmentButton(r)}
                      {onInvoiceToggle ? (
                        <label className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border/60 px-2 text-xs">
                          <Checkbox
                            checked={Boolean(r.invoiceReceived)}
                            disabled={updatingInvoiceAccrualId === r.id}
                            onCheckedChange={(v) => onInvoiceToggle(r, v === true)}
                          />
                          {tt("poInvoice", "Invoice")}
                        </label>
                      ) : null}
                      {planRowEditable(r) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 gap-1.5 text-xs"
                          title={tt("btnEdit", "Edit")}
                          onClick={() => onEdit(r)}
                          disabled={payingId === r.id || deletingPlanId === r.id}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {tt("btnEdit", "Edit")}
                        </Button>
                      ) : null}
                      {canPay ? (
                        <Button
                          size="sm"
                          className="h-9 flex-1 text-xs font-semibold shadow-xs sm:flex-none"
                          onClick={() => onPay(r)}
                          disabled={payingId === r.id}
                        >
                          {tt("payBtn", "Pay")}
                        </Button>
                      ) : null}
                      {!String(r.storeName || "").trim() && canDeleteByPolicy(r) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 border-destructive/40 text-destructive"
                          onClick={() => onDelete(r)}
                          disabled={payingId === r.id || deletingPlanId === r.id}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-2">
                      {showApprove ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 flex-1 border-sky-300 bg-sky-50 font-semibold text-sky-800 shadow-xs hover:bg-sky-100 sm:flex-none dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200"
                            onClick={() => onApprove(r, "approve")}
                            disabled={payingId === r.id}
                          >
                            {tt("att_approve", "Approve")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 flex-1 border-rose-300 bg-rose-50 font-semibold text-rose-800 shadow-xs hover:bg-rose-100 sm:flex-none dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
                            onClick={() => onApprove(r, "reject")}
                            disabled={payingId === r.id}
                          >
                            {tt("att_reject", "Reject")}
                          </Button>
                          {canDeleteByPolicy(r) ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-9 border-destructive/40 text-destructive shadow-xs"
                              onClick={() => onDelete(r)}
                              disabled={payingId === r.id || deletingPlanId === r.id}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </>
                      ) : canPay ? null : r.status === "paid" ||
                        (r.status === "partial" && (r.remainingAmount || 0) <= 0) ? (
                        <span className="inline-flex h-9 items-center rounded-md border border-emerald-300 bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-800 shadow-xs dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                          {tt("expensePlanDoneShort", "Done")}
                        </span>
                      ) : r.status === "approved" || r.status === "rejected" ? (
                        <>
                          <span
                            className={cn(
                              "inline-flex h-9 items-center rounded-md border px-2.5 text-[11px] font-semibold shadow-xs",
                              r.status === "approved"
                                ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200"
                                : "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
                            )}
                          >
                            {r.status === "approved"
                              ? tt("att_approve", "Approve")
                              : tt("att_reject", "Reject")}
                          </span>
                          {canApproveByPolicy(r) ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-9 text-[11px] font-semibold shadow-xs"
                              onClick={() => onApprovalEdit(r.id)}
                              disabled={payingId === r.id}
                            >
                              <Pencil className="mr-0.5 h-3 w-3" />
                              {tt("btnEdit", "Edit")}
                            </Button>
                          ) : null}
                          {canDeleteByPolicy(r) ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-9 border-destructive/40 text-destructive shadow-xs"
                              onClick={() => onDelete(r)}
                              disabled={payingId === r.id || deletingPlanId === r.id}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </>
                      ) : r.status === "planned" && !canApproveByPolicy(r) ? (
                        <span className="inline-flex h-9 items-center rounded-md border border-amber-200 bg-amber-50 px-2 text-[10px] font-semibold text-amber-800 shadow-xs dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                          {tt("expensePayAwaitApprovalShort", "Pending")}
                        </span>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </AdminMobileOnly>
  )
}
