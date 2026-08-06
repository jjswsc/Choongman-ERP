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
import { Check, MoreHorizontal, Pencil, Trash2, Wallet, X } from "lucide-react"

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
    <div className={`flex items-center ${compact ? "justify-end gap-1" : "justify-center gap-1.5"}`}>
      {showApprove ? (
        <>
          <Button
            size={compact ? "sm" : "sm"}
            variant="outline"
            className="h-8 border-primary/40 px-2 text-xs text-primary"
            onClick={() => onApprove(r, "approve")}
            disabled={busy}
            title={tt("att_approve", "Approve")}
          >
            <Check className="mr-1 h-3.5 w-3.5" />
            {tt("att_approve", "Approve")}
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8 border-destructive/40 text-destructive"
            onClick={() => onApprove(r, "reject")}
            disabled={busy}
            title={tt("att_reject", "Reject")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      ) : canPay ? (
        <Button
          size="sm"
          className="h-8 px-2.5 text-xs"
          onClick={() => onPay(r)}
          disabled={busy}
        >
          <Wallet className="mr-1 h-3.5 w-3.5" />
          {tt("payBtn", "Pay")}
        </Button>
      ) : r.status === "planned" && !canApproveByPolicy(r) ? (
        <span className="text-[11px] text-muted-foreground">
          {tt("expensePayAwaitApprovalShort", "Pending")}
        </span>
      ) : r.status === "approved" ? (
        <span className="text-[11px] text-primary">{tt("att_approved", "Approved")}</span>
      ) : r.status === "rejected" ? (
        <span className="text-[11px] text-destructive">{tt("att_rejected", "Rejected")}</span>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground"
            disabled={busy}
            title={tt("pay_actions", "Action")}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
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
          {canPay ? (
            <DropdownMenuItem onClick={() => onPay(r)}>
              <Wallet className="mr-2 h-3.5 w-3.5" />
              {tt("payBtn", "Pay")}
            </DropdownMenuItem>
          ) : null}
          {(canDeleteByPolicy(r) || showNoStoreDelete) && (
            <>
              <DropdownMenuSeparator />
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
