"use client"

import {
  ExpenseRegisterField,
  ExpenseRegisterFieldRow,
  ExpenseRegisterSection,
} from "@/components/erp/expense-register-form-field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { type ExpenseWhtItemDraft, ExpenseWhtItemsEditor } from "@/components/erp/expense-wht-items-editor"
import type { ExpenseFeeVatMode } from "@/lib/expense-fee-vat"
import type { BankAccount } from "@/lib/api-client"
import type * as React from "react"

export type WithdrawalAmountFieldsProps = {
  accountId: string
  accrualNetPreview: number | null
  accrualVatAmount: string
  accrualWhtItems: ExpenseWhtItemDraft[]
  activeFeeVatMode: ExpenseFeeVatMode | null
  amount: string
  bankAccounts: BankAccount[]
  bankMemo: string
  categoryMain: string
  feeAmountFieldLabel: (mode: ExpenseFeeVatMode) => string
  feeAmountPreview: { gross: number; vat: number; net: number; invoiceReceived: boolean; } | null
  feeVatModeLabel: (mode: ExpenseFeeVatMode) => string
  handleMoneyInputChange: (raw: string, setter: (value: string) => void) => void
  isAccrualAmountsLocked: boolean
  isBankLinkMode: boolean
  isExistingBankTxMode: boolean
  isLaterPayment: boolean
  memo: string
  remainingWhtBase: number
  setAccountId: React.Dispatch<React.SetStateAction<string>>
  setAccrualVatAmount: React.Dispatch<React.SetStateAction<string>>
  setAccrualWhtItems: React.Dispatch<React.SetStateAction<ExpenseWhtItemDraft[]>>
  setAmount: React.Dispatch<React.SetStateAction<string>>
  setMemo: React.Dispatch<React.SetStateAction<string>>
  setTransDate: React.Dispatch<React.SetStateAction<string>>
  showBankAccountOutsideTransfer: boolean
  supportsExpenseDocs: boolean
  transDate: string
  tt: (key: string, fallback: string) => string
}

export function WithdrawalAmountFields({
  accountId,
  accrualNetPreview,
  accrualVatAmount,
  accrualWhtItems,
  activeFeeVatMode,
  amount,
  bankAccounts,
  bankMemo,
  categoryMain,
  feeAmountFieldLabel,
  feeAmountPreview,
  feeVatModeLabel,
  handleMoneyInputChange,
  isAccrualAmountsLocked,
  isBankLinkMode,
  isExistingBankTxMode,
  isLaterPayment,
  memo,
  remainingWhtBase,
  setAccountId,
  setAccrualVatAmount,
  setAccrualWhtItems,
  setAmount,
  setMemo,
  setTransDate,
  showBankAccountOutsideTransfer,
  supportsExpenseDocs,
  transDate,
  tt,
}: WithdrawalAmountFieldsProps) {
  return (
    <div className="border-t border-border/60 pt-5 space-y-4">
      <ExpenseRegisterFieldRow cols="auto" className="max-w-6xl">
        {!isLaterPayment && showBankAccountOutsideTransfer && (
          <ExpenseRegisterField label={tt("bankAccount", "Account")}>
            <Select
              value={accountId || "__none__"}
              onValueChange={(v) => setAccountId(v === "__none__" ? "" : v)}
              disabled={isExistingBankTxMode}
            >
              <SelectTrigger className="w-full h-9">
                <SelectValue placeholder={tt("bankAccount", "Select Account")} />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.bankName ? `[${a.bankName}] ` : ""}{a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ExpenseRegisterField>
        )}
        <ExpenseRegisterField
          label={
            activeFeeVatMode && categoryMain === "expense"
              ? feeAmountFieldLabel(activeFeeVatMode)
              : supportsExpenseDocs
                ? tt("expenseAccrualGrossTotal", "Total (incl. tax)")
                : tt("amount", "Amount")
          }
          hint={
            feeAmountPreview ? (
              <span className="tabular-nums">
                {tt("expenseFeeWithdrawPreview", "Withdrawal")} ฿{feeAmountPreview.gross.toLocaleString()}
                {feeAmountPreview.vat > 0
                  ? ` (${tt("expenseAccrualVat", "VAT")} ฿${feeAmountPreview.vat.toLocaleString()} · ${tt("expenseFeeNetLabel", "Net")} ฿${feeAmountPreview.net.toLocaleString()})`
                  : ""}
              </span>
            ) : activeFeeVatMode ? (
              feeVatModeLabel(activeFeeVatMode)
            ) : undefined
          }
        >
          <Input
            value={amount}
            onChange={(e) => handleMoneyInputChange(e.target.value, setAmount)}
            type="text"
            inputMode="decimal"
            placeholder="0"
            className={`w-full max-w-[160px] h-9 ${isBankLinkMode || isAccrualAmountsLocked ? "bg-muted/50 cursor-default" : ""}`}
            readOnly={isBankLinkMode || isAccrualAmountsLocked}
          />
        </ExpenseRegisterField>
        <ExpenseRegisterField label={tt("date", "Date")}>
          <Input
            type="date"
            value={transDate}
            onChange={(e) => setTransDate(e.target.value)}
            className={`w-full max-w-[180px] h-9 ${isBankLinkMode || isAccrualAmountsLocked ? "bg-muted/50 cursor-default" : ""}`}
            readOnly={isBankLinkMode || isAccrualAmountsLocked}
          />
        </ExpenseRegisterField>
        <ExpenseRegisterField label={tt("memo", "Memo")} className="sm:col-span-2 lg:col-span-1 xl:col-span-1">
          <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={tt("memo", "Memo")} className="h-9 w-full" />
        </ExpenseRegisterField>
        <ExpenseRegisterField label={tt("bankMemoLabel", "Bank Memo")} className="sm:col-span-2 lg:col-span-2">
          <Input
            value={bankMemo}
            readOnly
            title={bankMemo || undefined}
            placeholder={tt("bankMemoFromBank", "Memo from bank transaction")}
            className="h-9 w-full bg-muted/50 cursor-default"
          />
        </ExpenseRegisterField>
      </ExpenseRegisterFieldRow>
      {supportsExpenseDocs && (
        <ExpenseRegisterSection className="max-w-6xl bg-muted/15">
          <ExpenseRegisterFieldRow cols="dense">
          <ExpenseRegisterField label={tt("expenseAccrualVat", "VAT")}>
            <Input
              value={accrualVatAmount}
              onChange={(e) => handleMoneyInputChange(e.target.value, setAccrualVatAmount)}
              type="text"
              inputMode="decimal"
              placeholder="0"
              className={`h-9 w-full ${isAccrualAmountsLocked ? "bg-muted/50 cursor-default" : ""}`}
              readOnly={isAccrualAmountsLocked}
            />
          </ExpenseRegisterField>
          <ExpenseRegisterField label={tt("expenseAccrualNetPayableLabel", "Net Payable")}>
            <div className="flex h-9 items-center">
              <span className="text-sm font-semibold tabular-nums">
                ฿{(accrualNetPreview ?? 0).toLocaleString()}
              </span>
            </div>
          </ExpenseRegisterField>
          </ExpenseRegisterFieldRow>
          <ExpenseWhtItemsEditor
            items={accrualWhtItems}
            onChange={setAccrualWhtItems}
            remainingBase={remainingWhtBase}
            disabled={isAccrualAmountsLocked}
            tt={tt}
          />
        </ExpenseRegisterSection>
      )}
    </div>
  )
}
