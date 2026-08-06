"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { BankAccount, ExpenseAccrualPlanItem } from "@/lib/api-client"
import { Link2, Wallet } from "lucide-react"

type Tt = (key: string, fallback: string) => string

function todayStrBkk() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}

export type ExpensePlanPaySheetProps = {
  open: boolean
  row: ExpenseAccrualPlanItem | null
  tt: Tt
  stores: string[]
  bankAccounts: BankAccount[]
  payingId: number | null
  payMethod: "bank" | "petty"
  payBankId: string
  payStore: string
  payAmount: string
  payDate: string
  payMemo: string
  onPayMethodChange: (v: "bank" | "petty") => void
  onPayBankChange: (v: string) => void
  onPayStoreChange: (v: string) => void
  onPayAmountChange: (v: string) => void
  onPayDateChange: (v: string) => void
  onPayMemoChange: (v: string) => void
  onClose: () => void
  onSubmit: (r: ExpenseAccrualPlanItem) => void
  onLinkBank: (r: ExpenseAccrualPlanItem) => void
}

export function ExpensePlanPaySheet({
  open,
  row,
  tt,
  stores,
  bankAccounts,
  payingId,
  payMethod,
  payBankId,
  payStore,
  payAmount,
  payDate,
  payMemo,
  onPayMethodChange,
  onPayBankChange,
  onPayStoreChange,
  onPayAmountChange,
  onPayDateChange,
  onPayMemoChange,
  onClose,
  onSubmit,
  onLinkBank,
}: ExpensePlanPaySheetProps) {
  React.useEffect(() => {
    if (!open || !row) return
    onPayAmountChange(String(row.remainingAmount || 0))
    onPayDateChange(todayStrBkk())
    // row.id / remainingAmount 변경 시마다 리셋
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional reset on open/row change
  }, [open, row?.id, row?.remainingAmount])

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{tt("payBtn", "Pay")}</SheetTitle>
        </SheetHeader>
        {row ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm">
              <p className="font-medium">{row.payeeName || "—"}</p>
              <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                {row.documentNo || `#${row.id}`} · ฿{(row.remainingAmount || 0).toLocaleString()}
              </p>
              {(row.payeeBankName || row.payeeBankAccountNo) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {[row.payeeBankName, row.payeeBankAccountNo].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{tt("bankTitle", "Bank")}</label>
              <Select value={payMethod} onValueChange={(v) => onPayMethodChange(v as "bank" | "petty")}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">{tt("bankTitle", "Bank")}</SelectItem>
                  <SelectItem value="petty">{tt("adminPettyCash", "Petty Cash")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {payMethod === "bank" ? (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{tt("bankAccount", "Account")}</label>
                <Select value={payBankId} onValueChange={onPayBankChange}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={tt("bankAccount", "Account")} />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.bankName ? `[${a.bankName}] ` : ""}
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{tt("store", "Store")}</label>
                <Select value={payStore} onValueChange={onPayStoreChange}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={tt("recFilterStoreSelect", "Select Store")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(stores || []).map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{tt("amount", "Amount")}</label>
                <Input
                  value={payAmount}
                  onChange={(e) => onPayAmountChange(e.target.value)}
                  className="h-9 text-right"
                  type="number"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{tt("date", "Date")}</label>
                <Input
                  type="date"
                  value={payDate || todayStrBkk()}
                  onChange={(e) => onPayDateChange(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{tt("memo", "Memo")}</label>
              <Input
                value={payMemo}
                onChange={(e) => onPayMemoChange(e.target.value)}
                className="h-9"
                placeholder={tt("memo", "Memo")}
              />
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <Button
                onClick={() => onSubmit(row)}
                disabled={payingId === row.id}
                className="h-10"
              >
                <Wallet className="mr-1.5 h-4 w-4" />
                {tt("addPayment", "Add Payment")}
              </Button>
              {payMethod === "bank" && payBankId ? (
                <Button
                  variant="outline"
                  onClick={() => onLinkBank(row)}
                  disabled={payingId === row.id}
                  className="h-10"
                >
                  <Link2 className="mr-1.5 h-4 w-4" />
                  {tt("expenseLinkBank", "Link with Bank Transaction")}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
