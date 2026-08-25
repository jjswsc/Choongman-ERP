"use client"

import * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EXPENSE_WHT_RATE_OPTIONS } from "@/lib/expense-accrual-net"
import {
  EXPENSE_WHT_INCOME_OPTIONS,
  defaultRateForWhtIncomeType,
  sumExpenseWhtBase,
  sumExpenseWhtTax,
  taxAmountFromWhtBase,
  type ExpenseWhtItem,
} from "@/lib/expense-wht-items"
import { moneyInputStringFromAmount, normalizeMoneyInputString, parseMoneyAmount } from "@/lib/money-amount"
import { ExpenseRegisterField } from "@/components/erp/expense-register-form-field"

export type ExpenseWhtItemDraft = {
  key: string
  incomeType: string
  rate: number | null
  baseAmount: string
  taxAmount: string
}

function newKey(): string {
  return `wht-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function draftsFromExpenseWhtItems(items: ExpenseWhtItem[]): ExpenseWhtItemDraft[] {
  return items.map((it) => ({
    key: newKey(),
    incomeType: it.incomeType || "ค่าบริการ",
    rate: it.rate > 0 ? it.rate : null,
    baseAmount: it.baseAmount > 0 ? moneyInputStringFromAmount(it.baseAmount) : "",
    taxAmount: it.taxAmount > 0 ? moneyInputStringFromAmount(it.taxAmount) : "",
  }))
}

export function expenseWhtItemsFromDrafts(drafts: ExpenseWhtItemDraft[]): ExpenseWhtItem[] {
  return drafts
    .map((d) => {
      const baseAmount = Math.max(0, parseMoneyAmount(d.baseAmount))
      const taxAmount = Math.max(0, parseMoneyAmount(d.taxAmount))
      const rate = d.rate != null && d.rate > 0 ? d.rate : 0
      if (taxAmount <= 0 && baseAmount <= 0) return null
      return {
        incomeType: String(d.incomeType || "").trim() || "ค่าบริการ",
        rate,
        baseAmount,
        taxAmount: taxAmount > 0 ? taxAmount : taxAmountFromWhtBase(baseAmount, rate),
      }
    })
    .filter((x): x is ExpenseWhtItem => x != null)
}

export function ExpenseWhtItemsEditor(props: {
  items: ExpenseWhtItemDraft[]
  onChange: (next: ExpenseWhtItemDraft[]) => void
  remainingBase: number
  disabled?: boolean
  tt: (key: string, fallback: string) => string
}) {
  const { items, onChange, remainingBase, disabled, tt } = props

  const patch = (key: string, partial: Partial<ExpenseWhtItemDraft>) => {
    onChange(items.map((it) => (it.key === key ? { ...it, ...partial } : it)))
  }

  const addRow = () => {
    const used = sumExpenseWhtBase(expenseWhtItemsFromDrafts(items))
    const leftover = Math.max(0, Math.round((remainingBase - used) * 100) / 100)
    const incomeType = items.length === 0 ? "ค่าบริการ" : "ค่าเช่า"
    const rate = defaultRateForWhtIncomeType(incomeType)
    const tax = leftover > 0 ? taxAmountFromWhtBase(leftover, rate) : 0
    onChange([
      ...items,
      {
        key: newKey(),
        incomeType,
        rate,
        baseAmount: leftover > 0 ? moneyInputStringFromAmount(leftover) : "",
        taxAmount: tax > 0 ? moneyInputStringFromAmount(tax) : "",
      },
    ])
  }

  const totals = expenseWhtItemsFromDrafts(items)
  const taxTotal = sumExpenseWhtTax(totals)

  return (
    <div className="space-y-2">
      <ExpenseRegisterField
        label={tt("expenseAccrualWhtItems", "Withholding tax")}
        hint={tt(
          "expenseAccrualWhtItemsHint",
          "Add rent 5% and service 3% on the same payment. The 50 ทวิ shows both lines."
        )}
      >
        <div className="space-y-2">
          {items.length > 0 ? (
            <div className="hidden sm:grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_5.5rem_minmax(0,1fr)_2rem] gap-2 text-[11px] text-muted-foreground px-0.5">
              <span>{tt("expenseAccrualWhtIncomeType", "Income type")}</span>
              <span>{tt("expenseAccrualWhtBase", "Amount paid")}</span>
              <span>{tt("expenseAccrualWhtRate", "WHT rate")}</span>
              <span>{tt("expenseAccrualWithholding", "Withholding Tax")}</span>
              <span />
            </div>
          ) : null}
          {items.map((it) => (
            <div
              key={it.key}
              className="grid grid-cols-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_5.5rem_minmax(0,1fr)_2rem] gap-2 items-center"
            >
              <Select
                value={it.incomeType || "ค่าบริการ"}
                onValueChange={(v) => {
                  const nextRate = defaultRateForWhtIncomeType(v)
                  const base = parseMoneyAmount(it.baseAmount)
                  const tax = taxAmountFromWhtBase(base, nextRate)
                  patch(it.key, {
                    incomeType: v,
                    rate: nextRate,
                    taxAmount: tax > 0 ? moneyInputStringFromAmount(tax) : it.taxAmount,
                  })
                }}
                disabled={disabled}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_WHT_INCOME_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.value} ({opt.defaultRate}%)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={it.baseAmount}
                onChange={(e) => {
                  const next = normalizeMoneyInputString(e.target.value)
                  const base = parseMoneyAmount(next)
                  const tax = it.rate != null && it.rate > 0 ? taxAmountFromWhtBase(base, it.rate) : 0
                  patch(it.key, {
                    baseAmount: next,
                    taxAmount: tax > 0 ? moneyInputStringFromAmount(tax) : "",
                  })
                }}
                type="text"
                inputMode="decimal"
                placeholder="0"
                className={`h-9 w-full ${disabled ? "bg-muted/50 cursor-default" : ""}`}
                readOnly={disabled}
              />
              <Select
                value={it.rate == null ? "__none__" : String(it.rate)}
                onValueChange={(v) => {
                  if (!v || v === "__none__") {
                    patch(it.key, { rate: null })
                    return
                  }
                  const n = Number(v)
                  const rate = Number.isFinite(n) && n > 0 ? n : null
                  const base = parseMoneyAmount(it.baseAmount)
                  const tax = rate != null ? taxAmountFromWhtBase(base, rate) : 0
                  patch(it.key, {
                    rate,
                    taxAmount: tax > 0 ? moneyInputStringFromAmount(tax) : "",
                  })
                }}
                disabled={disabled}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder={tt("expenseAccrualWhtRateNone", "Select")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{tt("expenseAccrualWhtRateNone", "Select")}</SelectItem>
                  {EXPENSE_WHT_RATE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={String(r)}>
                      {r}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={it.taxAmount}
                onChange={(e) =>
                  patch(it.key, { taxAmount: normalizeMoneyInputString(e.target.value) })
                }
                type="text"
                inputMode="decimal"
                placeholder="0"
                className={`h-9 w-full ${disabled ? "bg-muted/50 cursor-default" : ""}`}
                readOnly={disabled}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-8 shrink-0 text-muted-foreground"
                disabled={disabled}
                onClick={() => onChange(items.filter((x) => x.key !== it.key))}
                aria-label={tt("expenseAccrualWhtRemove", "Remove")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={disabled || items.length >= 8}
            onClick={addRow}
          >
            <Plus className="h-4 w-4 mr-1" />
            {tt("expenseAccrualWhtAdd", "Add WHT item")}
          </Button>
          {items.length > 1 && taxTotal > 0 ? (
            <p className="text-xs text-muted-foreground tabular-nums">
              {tt("expenseAccrualWhtTotal", "Total WHT")} ฿{taxTotal.toLocaleString()}
            </p>
          ) : null}
        </div>
      </ExpenseRegisterField>
    </div>
  )
}
