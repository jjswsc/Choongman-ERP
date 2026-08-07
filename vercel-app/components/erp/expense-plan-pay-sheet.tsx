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
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { BankAccount, ExpenseAccrualPlanItem } from "@/lib/api-client"
import { formatBankAccountLabel } from "@/lib/bank-account-display"
import { Link2, Wallet } from "lucide-react"

type Tt = (key: string, fallback: string) => string

function todayStrBkk() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[11px] font-medium text-muted-foreground">{children}</label>
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

  const storeLabel = String(row?.storeName || "").trim()
  const paying = row != null && payingId === row.id

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-border/60 px-5 py-4 pr-12 text-left">
          <SheetTitle>{tt("payBtn", "Pay")}</SheetTitle>
        </SheetHeader>
        {row ? (
          <div className="flex min-h-0 flex-1 flex-col gap-5 px-5 py-5">
            <div className="rounded-xl border border-border/70 bg-muted/25 px-4 py-3.5 shadow-sm">
              <p className="text-sm font-semibold leading-snug tracking-tight">{row.payeeName || "—"}</p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {row.documentNo || `#${row.id}`}
                <span className="mx-1.5 text-border">·</span>
                <span className="font-medium text-foreground">
                  ฿{(row.remainingAmount || 0).toLocaleString()}
                </span>
              </p>
              {storeLabel ? (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {tt("store", "Store")}
                  <span className="mx-1 text-border">·</span>
                  <span className="font-medium text-foreground/80">{storeLabel}</span>
                </p>
              ) : null}
              {(row.payeeBankName || row.payeeBankAccountNo) && (
                <p className="mt-2 border-t border-border/50 pt-2 text-[11px] leading-relaxed text-muted-foreground">
                  {[row.payeeBankName, row.payeeBankAccountNo].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <FieldLabel>{tt("bankTitle", "Bank")}</FieldLabel>
                <Select value={payMethod} onValueChange={(v) => onPayMethodChange(v as "bank" | "petty")}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">{tt("bankTitle", "Bank")}</SelectItem>
                    <SelectItem value="petty">{tt("adminPettyCash", "Petty Cash")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {payMethod === "bank" ? (
                <div className="space-y-1.5">
                  <FieldLabel>{tt("bankAccount", "Account")}</FieldLabel>
                  <Select value={payBankId || undefined} onValueChange={onPayBankChange}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder={tt("bankAccount", "Account")} />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {formatBankAccountLabel(a)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <FieldLabel>{tt("store", "Store")}</FieldLabel>
                  <Select value={payStore || undefined} onValueChange={onPayStoreChange}>
                    <SelectTrigger className="h-10">
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

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <FieldLabel>{tt("amount", "Amount")}</FieldLabel>
                  <Input
                    value={payAmount}
                    onChange={(e) => onPayAmountChange(e.target.value)}
                    className="h-10 text-right tabular-nums"
                    type="number"
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel>{tt("date", "Date")}</FieldLabel>
                  <Input
                    type="date"
                    value={payDate || todayStrBkk()}
                    onChange={(e) => onPayDateChange(e.target.value)}
                    className="h-10"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <FieldLabel>{tt("memo", "Memo")}</FieldLabel>
                <Input
                  value={payMemo}
                  onChange={(e) => onPayMemoChange(e.target.value)}
                  className="h-10"
                  placeholder={tt("memo", "Memo")}
                />
              </div>
            </div>

            <SheetFooter className="gap-2 border-t border-border/60 pt-4">
              <Button onClick={() => onSubmit(row)} disabled={paying} className="h-11 w-full">
                <Wallet className="mr-1.5 h-4 w-4" />
                {tt("addPayment", "Add Payment")}
              </Button>
              {payMethod === "bank" && payBankId ? (
                <Button
                  variant="outline"
                  onClick={() => onLinkBank(row)}
                  disabled={paying}
                  className="h-10 w-full"
                >
                  <Link2 className="mr-1.5 h-4 w-4" />
                  {tt("expenseLinkBank", "Link with Bank Transaction")}
                </Button>
              ) : null}
            </SheetFooter>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
