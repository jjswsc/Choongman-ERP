"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { parseMoneyAmount } from "@/lib/money-amount"
import { Button } from "@/components/ui/button"
import type { UnlinkedBankWithdrawalForCard } from "@/lib/api-client"
import type * as React from "react"

export type WithdrawalCardBillPickDialogProps = {
  amount: string
  cardBillPickLoading: boolean
  cardBillPickOpen: boolean
  cardBillPickQuery: string
  cardBillPickRangeText: string
  cardBillPickRows: UnlinkedBankWithdrawalForCard[]
  cardBillPickSavingId: number | null
  handlePickCardBillWithdrawal: (row: UnlinkedBankWithdrawalForCard) => Promise<void>
  setCardBillPickOpen: React.Dispatch<React.SetStateAction<boolean>>
  setCardBillPickQuery: React.Dispatch<React.SetStateAction<string>>
  t: (k: string) => string
  tt: (key: string, fallback: string) => string
}

export function WithdrawalCardBillPickDialog({
  amount,
  cardBillPickLoading,
  cardBillPickOpen,
  cardBillPickQuery,
  cardBillPickRangeText,
  cardBillPickRows,
  cardBillPickSavingId,
  handlePickCardBillWithdrawal,
  setCardBillPickOpen,
  setCardBillPickQuery,
  t,
  tt,
}: WithdrawalCardBillPickDialogProps) {
  return (
    <Dialog open={cardBillPickOpen} onOpenChange={setCardBillPickOpen}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tt("expenseRegisterCardBillPickTitle", "카드대금 연동할 통장 출금 선택")}</DialogTitle>
          <DialogDescription>
            {tt(
              "expenseRegisterCardBillPickHint",
              "미연결 출금 중 카드 월 대금으로 처리할 건을 선택하세요."
            )}
          </DialogDescription>
        </DialogHeader>
        {cardBillPickRangeText ? (
          <p className="text-xs text-muted-foreground">
            {tt("cardManagementPickRangeHint", "선택한 통장에서 전후 1개월 미연결 출금입니다. 적요로 찾을 수 있습니다.")}
            {" · "}
            {cardBillPickRangeText}
          </p>
        ) : null}
        <Input
          className="h-9"
          value={cardBillPickQuery}
          onChange={(e) => setCardBillPickQuery(e.target.value)}
          placeholder={tt("search", "Search")}
        />
        {cardBillPickLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("loading")}</p>
        ) : cardBillPickRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {tt("expenseRegisterCardBillPickEmpty", "연결할 통장 출금이 없습니다. 통장 계좌·기간을 확인하세요.")}
          </p>
        ) : (
          <div className="space-y-2">
            {cardBillPickRows
              .filter((row) => {
                const q = cardBillPickQuery.trim().toLowerCase()
                if (!q) return true
                return `${row.memo || ""} ${row.transDate} ${row.amount}`.toLowerCase().includes(q)
              })
              .map((row) => {
                const entered = parseMoneyAmount(amount)
                const amountMatch = entered > 0 && Math.abs(row.amount - entered) < 0.01
                return (
              <div key={row.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold tabular-nums">฿{row.amount.toLocaleString()}</p>
                  <p className="text-[11px] text-muted-foreground">{row.transDate}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{row.memo || "—"}</p>
                  {row.likelyCardBill ? (
                    <p className="text-[10px] text-amber-800 mt-1">
                      {tt("cardManagementLikelyCardBill", "카드대금 추정")}
                    </p>
                  ) : null}
                  {amountMatch ? (
                    <p className="text-[10px] text-green-700 mt-1">
                      {tt("expenseRegisterCardBillAmountMatch", "입력 금액과 같음")}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 shrink-0"
                  disabled={cardBillPickSavingId != null}
                  onClick={() => void handlePickCardBillWithdrawal(row)}
                >
                  {cardBillPickSavingId === row.id
                    ? "..."
                    : tt("expenseRegisterCardBillQueue", "통장 카드대금 연동")}
                </Button>
              </div>
                )
              })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
