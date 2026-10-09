"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useErpTabActive } from "@/lib/erp-page-visibility"
import { sliceUnallocatedBankDepositsForPreview } from "@/lib/receivable-unallocated-bank"
import type { ReceivablePayableItem } from "@/lib/api-client"
import type { PayableLedgerDatePair, ReceivableLedgerDatePair } from "@/lib/receivable-payable-period-totals"

export function renderReceivableLedgerDateCell(
  row: { ref_type?: string; trans_date?: string; amount?: number },
  pair: ReceivableLedgerDatePair | undefined,
  labels: { sales: string; receive: string }
) {
  const fallback = String(row.trans_date || "").trim().slice(0, 10)
  const salesDate = pair?.salesDate || fallback
  const receiveDate = pair?.receiveDate
  if (salesDate && receiveDate && salesDate !== receiveDate) {
    return (
      <div className="flex flex-col items-start gap-0.5 leading-tight">
        <span className="tabular-nums text-sm whitespace-nowrap">
          <span className="text-muted-foreground">{labels.sales}</span> {salesDate}
        </span>
        <span className="tabular-nums text-sm whitespace-nowrap">
          <span className="text-muted-foreground">{labels.receive}</span> {receiveDate}
        </span>
      </div>
    )
  }
  return <span className="tabular-nums">{salesDate || receiveDate || fallback || "-"}</span>
}

export function renderPayableLedgerDateCell(
  row: { ref_type?: string; trans_date?: string; amount?: number },
  pair: PayableLedgerDatePair | undefined,
  labels: { purchase: string; payment: string }
) {
  const fallback = String(row.trans_date || "").trim().slice(0, 10)
  const purchaseDate = pair?.purchaseDate || fallback
  const paymentDate = pair?.paymentDate
  if (purchaseDate && paymentDate && purchaseDate !== paymentDate) {
    return (
      <div className="flex flex-col items-start gap-0.5 leading-tight">
        <span className="tabular-nums text-sm whitespace-nowrap">
          <span className="text-muted-foreground">{labels.purchase}</span> {purchaseDate}
        </span>
        <span className="tabular-nums text-sm whitespace-nowrap">
          <span className="text-muted-foreground">{labels.payment}</span> {paymentDate}
        </span>
      </div>
    )
  }
  return <span className="tabular-nums">{purchaseDate || paymentDate || fallback || "-"}</span>
}

/** forceMount 탭에서 비활성 패널·전환 중 무거운 원장 목록 렌더를 건너뜀 (INP) */
export function TabPanelHeavyContent({
  ready,
  pendingLabel,
  children,
}: {
  ready: boolean
  pendingLabel: string
  children: React.ReactNode
}) {
  const tabActive = useErpTabActive()
  if (!tabActive) return null
  if (!ready) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{pendingLabel}</p>
  }
  return <>{children}</>
}

export function UnallocatedBankDepositChips({
  deposits,
  tt,
  onOpen,
}: {
  deposits: NonNullable<ReceivablePayableItem["unallocatedBankDeposits"]>
  tt: (key: string, fallback: string) => string
  onOpen: (bankTransactionId: number, transDate?: string, accountId?: number | string | null) => void
}) {
  const [expanded, setExpanded] = React.useState(false)
  const { visible, hiddenCount, canToggle } = sliceUnallocatedBankDepositsForPreview(deposits, expanded)
  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          "flex flex-wrap gap-2",
          expanded && canToggle && "max-h-48 overflow-y-auto pr-1"
        )}
      >
        {visible.map((dep) => {
          const accountLabel =
            String(dep.bankAccountName || "").trim() || String(dep.bankAccountStore || "").trim()
          return (
            <Button
              key={dep.bankTransactionId}
              type="button"
              size="sm"
              variant="outline"
              className="h-auto min-h-7 py-1 text-[11px] tabular-nums whitespace-normal text-left"
              title={tt("recUnallocatedBankOpenHint", "이 입금이 들어 있는 통장으로 이동합니다")}
              onClick={() =>
                onOpen(dep.bankTransactionId, dep.transDate, dep.bankAccountId)
              }
            >
              {dep.transDate} · ฿{dep.amountAbs.toLocaleString()}
              {accountLabel ? ` · ${accountLabel}` : ""} · #{dep.bankTransactionId}
            </Button>
          )
        })}
      </div>
      {canToggle ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px] font-medium text-amber-900 hover:text-amber-950 dark:text-amber-100 dark:hover:text-amber-50"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded
            ? tt("recUnallocatedBankShowLess", "접기")
            : tt("recUnallocatedBankShowMore", "이전 내역 {n}건 더 보기").replace(
                "{n}",
                String(hiddenCount)
              )}
        </Button>
      ) : null}
    </div>
  )
}
