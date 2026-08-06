"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { ExpenseAccrualPlanItem } from "@/lib/api-client"
import { isExpensePlanSettled } from "@/lib/expense-plan-row-tone"
import { cn } from "@/lib/utils"
import { MoreHorizontal, Pencil, Trash2, X } from "lucide-react"

type Tt = (key: string, fallback: string) => string

export type ExpensePlanRowActionsProps = {
  row: ExpenseAccrualPlanItem
  tt: Tt
  planRowEditable: (r: ExpenseAccrualPlanItem) => boolean
  canApproveByPolicy: (r: ExpenseAccrualPlanItem) => boolean
  canDeleteByPolicy: (r: ExpenseAccrualPlanItem) => boolean
  payingId: number | null
  deletingPlanId: number | null
  approvalEditById: Record<number, boolean>
  onEdit: (r: ExpenseAccrualPlanItem) => void
  onPay: (r: ExpenseAccrualPlanItem) => void
  onDelete: (r: ExpenseAccrualPlanItem) => void
  onApprove: (r: ExpenseAccrualPlanItem, action: "approve" | "reject") => void
  onApprovalEdit: (id: number) => void
  compact?: boolean
}

const ACTION_H = "h-7"
const ACTION_BTN =
  "inline-flex h-7 items-center justify-center rounded-md border text-[11px] font-semibold leading-none shadow-xs transition-colors"

export function ExpensePlanRowActions({
  row: r,
  tt,
  planRowEditable,
  canApproveByPolicy,
  canDeleteByPolicy,
  payingId,
  deletingPlanId,
  approvalEditById,
  onEdit,
  onPay,
  onDelete,
  onApprove,
  onApprovalEdit,
  compact,
}: ExpensePlanRowActionsProps) {
  const busy = payingId === r.id || deletingPlanId === r.id
  const showApprove =
    canApproveByPolicy(r) &&
    (r.status === "planned" || approvalEditById[r.id]) &&
    r.status !== "paid"
  const canPay = r.status === "approved" && (r.remainingAmount || 0) > 0
  const settled = isExpensePlanSettled(r.status, r.remainingAmount)
  const showNoStoreDelete = !String(r.storeName || "").trim() && canDeleteByPolicy(r)
  const hasMenu =
    showApprove ||
    planRowEditable(r) ||
    (canApproveByPolicy(r) &&
      (r.status === "approved" || r.status === "rejected") &&
      !approvalEditById[r.id]) ||
    canDeleteByPolicy(r) ||
    showNoStoreDelete

  return (
    <div className={cn("flex items-center gap-1", compact ? "justify-end" : "justify-center")}>
      {showApprove ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            ACTION_BTN,
            "min-w-[2.75rem] border-sky-300 bg-sky-50 px-2 text-sky-800 hover:bg-sky-100 hover:text-sky-900 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200 dark:hover:bg-sky-900/50"
          )}
          onClick={() => onApprove(r, "approve")}
          disabled={busy}
          title={tt("att_approve", "Approve")}
        >
          {tt("att_approve", "Approve")}
        </Button>
      ) : canPay ? (
        <Button
          type="button"
          size="sm"
          className={cn(
            ACTION_H,
            "min-w-[2.75rem] rounded-md px-2 text-[11px] font-semibold leading-none shadow-xs"
          )}
          onClick={() => onPay(r)}
          disabled={busy}
          title={tt("payBtn", "Pay")}
        >
          {tt("payBtn", "Pay")}
        </Button>
      ) : settled ? (
        <span
          className={cn(
            ACTION_BTN,
            "min-w-[2.75rem] cursor-default border-emerald-300 bg-emerald-50 px-2 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
          )}
          title={tt("expensePlanStatusPaid", "Paid")}
        >
          {tt("expensePlanDoneShort", "Done")}
        </span>
      ) : r.status === "rejected" ? (
        <span
          className={cn(
            ACTION_BTN,
            "min-w-[2.75rem] cursor-default border-rose-300 bg-rose-50 px-2 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
          )}
          title={tt("att_reject", "Reject")}
        >
          {tt("att_reject", "Reject")}
        </span>
      ) : r.status === "planned" && !canApproveByPolicy(r) ? (
        <span
          className={cn(
            ACTION_BTN,
            "max-w-[3.25rem] cursor-default truncate border-amber-200 bg-amber-50 px-1.5 text-[10px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          )}
        >
          {tt("expensePayAwaitApprovalShort", "Pending")}
        </span>
      ) : null}

      {hasMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className={cn(
                ACTION_H,
                "w-7 shrink-0 border-border bg-background p-0 text-muted-foreground shadow-xs hover:bg-muted hover:text-foreground"
              )}
              disabled={busy}
              title={tt("pay_actions", "Action")}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {showApprove ? (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onApprove(r, "reject")}
              >
                <X className="mr-2 h-3.5 w-3.5" />
                {tt("att_reject", "Reject")}
              </DropdownMenuItem>
            ) : null}
            {planRowEditable(r) ? (
              <DropdownMenuItem onClick={() => onEdit(r)}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                {tt("btnEdit", "Edit")}
              </DropdownMenuItem>
            ) : null}
            {canApproveByPolicy(r) &&
            (r.status === "approved" || r.status === "rejected") &&
            !approvalEditById[r.id] ? (
              <DropdownMenuItem onClick={() => onApprovalEdit(r.id)}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                {tt("btnEdit", "Edit")} ({tt("att_approval", "Approval")})
              </DropdownMenuItem>
            ) : null}
            {(canDeleteByPolicy(r) || showNoStoreDelete) && (
              <>
                {(showApprove || planRowEditable(r)) && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(r)}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  {tt("delete", "Delete")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}
