"use client"

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { ExpensePlanStatusBadge } from "@/components/erp/expense-plan-status-badge"
import { ExpensePlanRowActions } from "@/components/erp/expense-plan-row-actions"
import { ExpensePayeeBankMissingLink } from "@/components/erp/expense-payee-bank-missing-link"
import type { ExpenseAccrualPlanItem } from "@/lib/api-client"
import {
  expensePlanRowAccentClass,
  expensePlanRowToneClass,
  expensePlanStickyCellClass,
} from "@/lib/expense-plan-row-tone"
import { cn } from "@/lib/utils"
import { Paperclip } from "lucide-react"

type Tt = (key: string, fallback: string) => string

export type ExpensePlanDesktopListProps = {
  title: string
  plansByStore: [string, ExpenseAccrualPlanItem[]][]
  emptyLabel: string
  tt: Tt
  getPayeeLine: (name: string, codeLabel: string) => string
  getMemo: (memo: string | undefined) => string
  renderWithdrawalType: (category?: string) => ReactNode
  accountSubjectLabel?: (id?: number | null) => string
  renderPayAmount: (r: ExpenseAccrualPlanItem) => ReactNode
  planRowEditable: (r: ExpenseAccrualPlanItem) => boolean
  canApproveByPolicy: (r: ExpenseAccrualPlanItem) => boolean
  canDeleteByPolicy: (r: ExpenseAccrualPlanItem) => boolean
  payingId: number | null
  deletingPlanId: number | null
  approvalEditById: Record<number, boolean>
  updatingInvoiceAccrualId: number | null
  onPlanDetail: (r: ExpenseAccrualPlanItem) => void
  onEdit: (r: ExpenseAccrualPlanItem) => void
  onPay: (r: ExpenseAccrualPlanItem) => void
  onDelete: (r: ExpenseAccrualPlanItem) => void
  onApprove: (r: ExpenseAccrualPlanItem, action: "approve" | "reject") => void
  onApprovalEdit: (id: number) => void
  onAttachment: (r: ExpenseAccrualPlanItem) => void
  onInvoiceToggle: (r: ExpenseAccrualPlanItem, checked: boolean) => void
}

export function ExpensePlanDesktopList({
  title,
  plansByStore,
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
  onAttachment,
  onInvoiceToggle,
}: ExpensePlanDesktopListProps) {
  const flatCount = plansByStore.reduce((s, [, rows]) => s + rows.length, 0)
  if (flatCount === 0) {
    return (
      <div className="rounded-md border border-border/60 p-4">
        <div className="mb-2 text-sm font-semibold">{title}</div>
        <p className="py-4 text-sm text-muted-foreground">{emptyLabel}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold">{title}</div>
      {plansByStore.map(([storeLabel, rows]) => {
        const storeTotal = rows.reduce((s, r) => s + (r.remainingAmount || 0), 0)
        return (
          <div key={storeLabel} className="overflow-hidden rounded-md border border-border/60">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
              <span className="text-sm font-medium">
                {tt("store", "Store")}: {storeLabel}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {rows.length}
                {tt("receivPayCount", "items")} · ฿{storeTotal.toLocaleString()}
              </span>
            </div>
            <AdminTableScroll className="rounded-none border-0" hint={false}>
              <table className="w-full min-w-[960px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="w-[110px] px-2 py-2 text-center">{tt("expenseDocumentNo", "Doc No.")}</th>
                    <th className="w-[72px] px-2 py-2 text-center">{tt("bankCategoryLabel", "Category")}</th>
                    <th className="min-w-[120px] px-2 py-2 text-left">{tt("vendor", "Vendor")}</th>
                    <th className="min-w-[200px] w-[220px] px-2 py-2 text-left">{tt("expensePayeeBankName", "Bank")}</th>
                    <th className="w-[88px] px-2 py-2 text-center">{tt("date", "Date")}</th>
                    <th className="w-[58px] px-0.5 py-2 text-center">{tt("expensePlanStatusCol", "Status")}</th>
                    <th className="w-[100px] px-2 py-2 text-right">{tt("expensePlanPayAmount", "Pay Amount")}</th>
                    <th className="w-10 px-1 py-2 text-center">{tt("expenseAccrualAttachCol", "Attachment")}</th>
                    <th className="w-12 px-1 py-2 text-center">{tt("poInvoice", "Invoice")}</th>
                    <th className="sticky right-0 z-[2] w-[84px] bg-muted/95 px-0.5 py-2 text-center shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.12)] backdrop-blur-sm">
                      {tt("pay_actions", "Action")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const codeLabel =
                      r.payeeCode && !r.payeeCode.startsWith("auto_") ? ` (${r.payeeCode})` : ""
                    const urls = r.attachmentUrls || []
                    const missingBank = !String(r.payeeBankAccountNo || "").trim()
                    const bankLine = [r.payeeBankName, r.payeeBankAccountNo].filter(Boolean).join(" · ")
                    return (
                      <tr
                        key={r.id}
                        className={cn(
                          "h-12 border-b transition-colors",
                          expensePlanRowAccentClass(r.status),
                          expensePlanRowToneClass(r.status)
                        )}
                      >
                        <td className="px-2 py-2 text-center align-middle text-xs tabular-nums whitespace-nowrap">
                          {r.documentNo || "—"}
                        </td>
                        <td className="px-2 py-2 text-center align-middle">
                          <div>{renderWithdrawalType(r.withdrawalCategory)}</div>
                          {accountSubjectLabel?.(r.accountSubjectId) ? (
                            <div className="mt-0.5 truncate text-[11px] text-muted-foreground" title={accountSubjectLabel(r.accountSubjectId)}>
                              {accountSubjectLabel(r.accountSubjectId)}
                            </div>
                          ) : null}
                        </td>
                        <td className="max-w-[200px] px-2 py-2 align-middle">
                          <button
                            type="button"
                            className="block w-full truncate text-left text-sm hover:text-primary"
                            title={getPayeeLine(r.payeeName || "", codeLabel)}
                            onClick={() => onPlanDetail(r)}
                          >
                            {getPayeeLine(r.payeeName || "", codeLabel)}
                          </button>
                          {r.memo ? (
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={getMemo(r.memo)}>
                              {getMemo(r.memo)}
                            </p>
                          ) : null}
                        </td>
                        <td className="min-w-[200px] px-2 py-2 align-middle">
                          {missingBank ? (
                            <ExpensePayeeBankMissingLink
                              payeeCode={r.payeeCode}
                              payeeName={r.payeeName}
                              label={tt("expenseBankAccountMissing", "Account missing")}
                              title={tt(
                                "expenseBankAccountMissingHint",
                                "Open Vendor Management to enter the bank account"
                              )}
                            />
                          ) : r.payeeBankName || r.payeeBankAccountNo ? (
                            <div className="min-w-0 space-y-0.5" title={bankLine}>
                              {r.payeeBankName ? (
                                <div className="truncate text-[10px] font-normal text-muted-foreground">
                                  {r.payeeBankName}
                                </div>
                              ) : null}
                              {r.payeeBankAccountNo ? (
                                <div className="break-all text-sm font-bold tabular-nums tracking-wide text-foreground">
                                  {r.payeeBankAccountNo}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center align-middle whitespace-nowrap">
                          {r.dueDate || r.expenseDate || "-"}
                        </td>
                        <td className="px-0.5 py-2 text-center align-middle">
                          <ExpensePlanStatusBadge status={r.status} />
                        </td>
                        <td className="px-2 py-2 text-right align-middle tabular-nums whitespace-nowrap">
                          {renderPayAmount(r)}
                        </td>
                        <td className="px-1 py-2 text-center align-middle">
                          {urls.length > 0 ? (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-primary"
                              title={tt("expenseViewAttachment", "View Attachment")}
                              onClick={() => onAttachment(r)}
                            >
                              <Paperclip className="h-4 w-4" />
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-1 py-2 text-center align-middle">
                          <Checkbox
                            checked={Boolean(r.invoiceReceived)}
                            disabled={updatingInvoiceAccrualId === r.id}
                            onCheckedChange={(v) => onInvoiceToggle(r, v === true)}
                          />
                        </td>
                        <td className={expensePlanStickyCellClass(r.status)}>
                          <ExpensePlanRowActions
                            row={r}
                            tt={tt}
                            planRowEditable={planRowEditable}
                            canApproveByPolicy={canApproveByPolicy}
                            canDeleteByPolicy={canDeleteByPolicy}
                            payingId={payingId}
                            deletingPlanId={deletingPlanId}
                            approvalEditById={approvalEditById}
                            onEdit={onEdit}
                            onPay={onPay}
                            onDelete={onDelete}
                            onApprove={onApprove}
                            onApprovalEdit={onApprovalEdit}
                            compact
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </AdminTableScroll>
          </div>
        )
      })}
    </div>
  )
}
