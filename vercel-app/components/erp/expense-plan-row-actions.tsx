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
  const showNoStoreDelete = !String(r.storeName || "").trim() && canDeleteByPolicy(r)

  return (
    <div className={`flex items-center ${compact ? "justify-end gap-0.5" : "justify-center gap-1"}`}>
      {showApprove ? (
        <Button
          size="sm"
          variant="outline"
          className="h-7 border-primary/40 px-2 text-[11px] font-medium text-primary"
          onClick={() => onApprove(r, "approve")}
          disabled={busy}
          title={tt("att_approve", "Approve")}
        >
          {tt("att_approve", "Approve")}
        </Button>
      ) : canPay ? (
        <Button
          size="sm"
          className="h-7 px-2 text-[11px] font-medium"
          onClick={() => onPay(r)}
          disabled={busy}
        >
          {tt("payBtn", "Pay")}
        </Button>
      ) : r.status === "planned" && !canApproveByPolicy(r) ? (
        <span className="max-w-[3.5rem] truncate text-[10px] text-muted-foreground">
          {tt("expensePayAwaitApprovalShort", "Pending")}
        </span>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0 text-muted-foreground"
            disabled={busy}
            title={tt("pay_actions", "Action")}
          >
            <MoreHorizontal className="h-4 w-4" />
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
    </div>
  )
}
