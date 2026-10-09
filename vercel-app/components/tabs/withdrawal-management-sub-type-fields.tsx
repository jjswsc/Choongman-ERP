"use client"

import { ExpenseRegisterField } from "@/components/erp/expense-register-form-field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { AccountSubjectItem } from "@/lib/api-client"
import type * as React from "react"
import type { LangCode } from "@/lib/lang-context"

export type WithdrawalSubTypeFieldsProps = {
  accountSubjectId: string
  advanceInstallmentCurrent: string
  advanceInstallments: string
  categoryMain: "purchase" | "expense" | "loan"
  categorySub: string
  getSubjectLabel: (s: AccountSubjectItem) => string
  isAccrualAmountsLocked: boolean
  lang: LangCode
  purchaseSubjectOptions: AccountSubjectItem[]
  setAccountSubjectId: React.Dispatch<React.SetStateAction<string>>
  setAdvanceInstallmentCurrent: React.Dispatch<React.SetStateAction<string>>
  setAdvanceInstallments: React.Dispatch<React.SetStateAction<string>>
  setCardFeeDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  setCategorySub: React.Dispatch<React.SetStateAction<string>>
  setDeliveryFeeDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  showAdvanceInstallments: boolean
  tt: (key: string, fallback: string) => string
}

export function WithdrawalSubTypeFields({
  accountSubjectId,
  advanceInstallmentCurrent,
  advanceInstallments,
  categoryMain,
  categorySub,
  getSubjectLabel,
  isAccrualAmountsLocked,
  lang,
  purchaseSubjectOptions,
  setAccountSubjectId,
  setAdvanceInstallmentCurrent,
  setAdvanceInstallments,
  setCardFeeDialogOpen,
  setCategorySub,
  setDeliveryFeeDialogOpen,
  showAdvanceInstallments,
  tt,
}: WithdrawalSubTypeFieldsProps) {
  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-3 w-full">
      <ExpenseRegisterField label={tt("wm_subType", "Detail")} className="w-[140px]">
        <Select value={categorySub} onValueChange={setCategorySub}>
          <SelectTrigger className="w-full h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="normal">{tt("wm_normal", "Normal")}</SelectItem>
            <SelectItem value="advance">{tt("wm_advance", "Advance")}</SelectItem>
          </SelectContent>
        </Select>
      </ExpenseRegisterField>
      {categoryMain === "purchase" && (
        <ExpenseRegisterField
          label={tt("wm_accountSubject", "Account Subject")}
          className="min-w-[220px] max-w-[360px] flex-1"
        >
          <Select
            value={accountSubjectId || "__none__"}
            onValueChange={(v) => setAccountSubjectId(v === "__none__" ? "" : v)}
          >
            <SelectTrigger className="h-9 w-full">
              <SelectValue placeholder={tt("wm_accountSubjectPlaceholder", "Select Account Subject")} />
            </SelectTrigger>
            <SelectContent>
              {purchaseSubjectOptions.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.code}{" "}
                  {lang === "th" && s.nameTh
                    ? s.nameTh
                    : lang === "ko"
                      ? s.name
                      : getSubjectLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ExpenseRegisterField>
      )}
      {showAdvanceInstallments && (
        <>
          <ExpenseRegisterField label={tt("wm_advanceInstallments", "Installments")} className="w-[90px]">
            <Input type="number" min={1} value={advanceInstallments} onChange={(e) => setAdvanceInstallments(e.target.value)} className="w-full h-9" />
          </ExpenseRegisterField>
          <ExpenseRegisterField label={tt("wm_advanceInstallmentCurrent", "Current Installment")} className="w-[160px]">
            <div className="flex items-center gap-2">
              <Input type="number" min={1} value={advanceInstallmentCurrent} onChange={(e) => setAdvanceInstallmentCurrent(e.target.value)} className="w-[70px] h-9" />
              <span className="text-sm font-medium tabular-nums text-muted-foreground">({advanceInstallmentCurrent}/{advanceInstallments})</span>
            </div>
          </ExpenseRegisterField>
        </>
      )}
      {categoryMain === "expense" && (
        <div className="ml-auto flex flex-wrap gap-2 pb-0.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            disabled={isAccrualAmountsLocked}
            onClick={() => setDeliveryFeeDialogOpen(true)}
          >
            {tt("pL_expenseSourceDeliveryApps", "배달앱 수수료")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            disabled={isAccrualAmountsLocked}
            onClick={() => setCardFeeDialogOpen(true)}
          >
            {tt("pL_expenseSourceCardFees", "카드 수수료")}
          </Button>
        </div>
      )}
    </div>
  )
}
