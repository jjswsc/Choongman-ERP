"use client"

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { ExpensePlanStatusBadge } from "@/components/erp/expense-plan-status-badge"
import { AdminMobileOnly } from "@/components/erp/admin-responsive-list"
import type { ExpenseAccrualPlanItem } from "@/lib/api-client"
import { Check, Pencil, Trash2, X } from "lucide-react"

type Tt = (key: string, fallback: string) => string

export type ExpensePlanMobileListProps = {
  plansByStore: [string, ExpenseAccrualPlanItem[]][]
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
  payEditorOpenById: Record<number, boolean>
  approvalEditById: Record<number, boolean>
  onPlanDetail: (r: ExpenseAccrualPlanItem) => void
  onEdit: (r: ExpenseAccrualPlanItem) => void
  onTogglePay: (id: number) => void
  onDelete: (r: ExpenseAccrualPlanItem) => void
  onApprove: (r: ExpenseAccrualPlanItem, action: "approve" | "reject") => void
  onApprovalEdit: (id: number) => void
  renderPayEditor: (r: ExpenseAccrualPlanItem) => ReactNode
  renderAttachmentButton: (r: ExpenseAccrualPlanItem) => ReactNode
}

export function ExpensePlanMobileList({
  plansByStore,
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
  payEditorOpenById,
  approvalEditById,
  onPlanDetail,
  onEdit,
  onTogglePay,
  onDelete,
  onApprove,
  onApprovalEdit,
  renderPayEditor,
  renderAttachmentButton,
}: ExpensePlanMobileListProps) {
  return (
    <AdminMobileOnly className="space-y-3">
      {plansByStore.map(([storeLabel, rows]) => (
        <div key={storeLabel}>
          <p className="mb-1.5 px-0.5 text-xs font-semibold text-foreground">
            {tt("store", "Store")}: {storeLabel}
          </p>
          <div className="rounded-lg border border-border/60">
            {rows.map((r) => {
              const codeLabel =
                r.payeeCode && !r.payeeCode.startsWith("auto_") ? ` (${r.payeeCode})` : ""
              return (
                <div
                  key={r.id}
                  className="space-y-2 border-b border-border/60 px-3 py-3 last:border-b-0"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-semibold leading-snug text-foreground">
                        {getPayeeLine(r.payeeName || "", codeLabel)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {renderWithdrawalType(r.withdrawalCategory)}
                        {" · "}
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
                  {r.memo ? (
                    <button
                      type="button"
                      className="w-full text-left text-[11px] leading-relaxed text-muted-foreground"
                      onClick={() => onPlanDetail(r)}
                    >
                      {getMemo(r.memo)}
                    </button>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    {renderAttachmentButton(r)}
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
                    {r.status === "approved" && r.remainingAmount > 0 ? (
                      <Button
                        size="sm"
                        variant={payEditorOpenById[r.id] ? "outline" : "default"}
                        className="h-9 flex-1 text-xs sm:flex-none"
                        onClick={() => onTogglePay(r.id)}
                        disabled={payingId === r.id}
                      >
                        {payEditorOpenById[r.id] ? tt("btnClose", "Close") : tt("payBtn", "Pay")}
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
                    {canApproveByPolicy(r) &&
                    (r.status === "planned" || approvalEditById[r.id]) &&
                    r.status !== "paid" ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 flex-1 border-primary/40 text-primary sm:flex-none"
                          onClick={() => onApprove(r, "approve")}
                          disabled={payingId === r.id}
                        >
                          <Check className="mr-1 h-3.5 w-3.5" />
                          {tt("att_approve", "Approve")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 flex-1 border-destructive/40 text-destructive sm:flex-none"
                          onClick={() => onApprove(r, "reject")}
                          disabled={payingId === r.id}
                        >
                          <X className="mr-1 h-3.5 w-3.5" />
                          {tt("att_reject", "Reject")}
                        </Button>
                        {canDeleteByPolicy(r) ? (
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
                      </>
                    ) : r.status === "approved" || r.status === "rejected" ? (
                      <>
                        <span
                          className={
                            r.status === "approved"
                              ? "text-[11px] text-primary"
                              : "text-[11px] text-destructive"
                          }
                        >
                          {r.status === "approved"
                            ? tt("att_approved", "Approved")
                            : tt("att_rejected", "Rejected")}
                        </span>
                        {canApproveByPolicy(r) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-[10px]"
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
                            className="h-9 border-destructive/40 text-destructive"
                            onClick={() => onDelete(r)}
                            disabled={payingId === r.id || deletingPlanId === r.id}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </>
                    ) : r.status === "planned" && !canApproveByPolicy(r) ? (
                      <span className="text-[10px] text-muted-foreground">
                        {tt("expensePayAwaitApprovalShort", "Pending")}
                      </span>
                    ) : null}
                  </div>
                  {r.remainingAmount > 0 &&
                  r.status === "approved" &&
                  payEditorOpenById[r.id]
                    ? renderPayEditor(r)
                    : null}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </AdminMobileOnly>
  )
}
