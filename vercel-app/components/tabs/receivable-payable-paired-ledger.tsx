"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { agingDaysBetween } from "@/lib/receivable-aging"
import {
  type LedgerPairGroup,
  type LedgerPairStatus,
} from "@/lib/receivable-payable-period-totals"
import {
  getLedgerPairCardClass,
  ledgerPairGroupBadge,
} from "@/lib/receivable-payable-ledger-pair-styles"

type LedgerRow = {
  id?: number
  ref_type?: string
  ref_id?: number
  amount?: number
  trans_date?: string
  memo?: string
  invoice_no?: string
  invoice_received?: boolean
  attributed_store?: string
}

function pairStatusBadgeClass(status: LedgerPairStatus): string {
  if (status === "settled") {
    return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
  }
  if (status === "partial") {
    return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
  }
  if (status === "open") {
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
  }
  return "bg-muted text-muted-foreground"
}

function PairStatusBadge({
  status,
  label,
}: {
  status: LedgerPairStatus
  label: string
}) {
  return (
    <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0", pairStatusBadgeClass(status))}>
      {label}
    </span>
  )
}

function PairGroupNumber({ groupId }: { groupId: number }) {
  return (
    <span
      className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-muted px-1 text-[10px] font-bold tabular-nums text-muted-foreground shrink-0"
      title={`#${groupId}`}
    >
      {ledgerPairGroupBadge(groupId)}
    </span>
  )
}

function daysBetweenLabel(
  from: string | undefined,
  to: string | undefined,
  daysLabel: string
): string | null {
  const a = String(from || "").slice(0, 10)
  const b = String(to || "").slice(0, 10)
  if (!a || !b || a === b) return null
  const days = agingDaysBetween(b, a)
  if (days <= 0) return null
  return daysLabel.replace("{n}", String(days))
}

export function ReceivablePairedLedgerList({
  groups,
  labels,
  fmtBahtSigned,
  getMemo,
  formatRefType,
  formatOrderNo,
  formatTaxInvoiceDocNo,
}: {
  groups: LedgerPairGroup<LedgerRow>[]
  labels: {
    statusSettled: string
    statusOpen: string
    statusPartial: string
    statusStandalone: string
    salesDate: string
    receiveDate: string
    settlementPrefix: string
    noSettlement: string
    daysBetween: string
    openRemain: string
  }
  fmtBahtSigned: (n: number | null | undefined) => string
  getMemo: (memo?: string) => string
  formatRefType: (refType?: string) => string
  formatOrderNo: (row: LedgerRow) => string
  formatTaxInvoiceDocNo?: (row: LedgerRow) => string
}) {
  if (groups.length === 0) {
    return null
  }
  return (
    <div className="space-y-2 py-1">
      {groups.map((group) => {
        const statusLabel =
          group.status === "settled"
            ? labels.statusSettled
            : group.status === "open"
              ? labels.statusOpen
              : group.status === "partial"
                ? labels.statusPartial
                : labels.statusStandalone
        const accrual = group.accrual
        const primarySettlement = group.settlements[0]
        const daysHint =
          accrual && primarySettlement
            ? daysBetweenLabel(accrual.trans_date, primarySettlement.trans_date, labels.daysBetween)
            : null
        return (
          <div key={group.groupId} className={cn(getLedgerPairCardClass(group.groupId), "px-3 py-2 text-sm")}>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <PairGroupNumber groupId={group.groupId} />
              <PairStatusBadge status={group.status} label={statusLabel} />
              {group.status === "open" || group.status === "partial" ? (
                <span className="text-sm text-amber-800 dark:text-amber-200 tabular-nums">
                  {labels.openRemain}: {fmtBahtSigned(group.openAmount)}
                </span>
              ) : null}
              {daysHint ? (
                <span className="text-[10px] text-muted-foreground">{daysHint}</span>
              ) : null}
            </div>
            {accrual ? (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 pl-1">
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {labels.salesDate} {String(accrual.trans_date || "").slice(0, 10)}
                </span>
                <span className="text-sm font-medium">{formatRefType(accrual.ref_type)}</span>
                <span className="text-sm text-muted-foreground truncate max-w-[200px]">{formatOrderNo(accrual)}</span>
                {formatTaxInvoiceDocNo ? (
                  <span className="text-[11px] font-mono text-muted-foreground truncate max-w-[180px]">
                    {formatTaxInvoiceDocNo(accrual) || "—"}
                  </span>
                ) : null}
                <span className="text-sm font-semibold tabular-nums ml-auto">{fmtBahtSigned(accrual.amount)}</span>
              </div>
            ) : null}
            {group.settlements.length > 0 ? (
              group.settlements.map((row) => (
                <div
                  key={row.id ?? `${group.groupId}-settlement`}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 pl-4 mt-1 border-l-2 border-border/60 ml-0.5"
                >
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {labels.settlementPrefix} {labels.receiveDate}{" "}
                    {String(row.trans_date || "").slice(0, 10)}
                  </span>
                  <span className="text-sm font-medium tabular-nums ml-auto">{fmtBahtSigned(row.amount)}</span>
                  {row.memo ? (
                    <span className="w-full text-[11px] text-muted-foreground truncate">{getMemo(row.memo)}</span>
                  ) : null}
                </div>
              ))
            ) : accrual ? (
              <p className="text-[11px] text-muted-foreground pl-4 mt-1">{labels.noSettlement}</p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function PayablePairedLedgerList({
  groups,
  labels,
  fmtBahtSigned,
  getMemo,
  formatRefType,
  formatInvoiceCell,
  formatStore,
}: {
  groups: LedgerPairGroup<LedgerRow>[]
  labels: {
    statusSettled: string
    statusOpen: string
    statusPartial: string
    statusStandalone: string
    purchaseDate: string
    paymentDate: string
    settlementPrefix: string
    noSettlement: string
    daysBetween: string
    openRemain: string
  }
  fmtBahtSigned: (n: number | null | undefined) => string
  getMemo: (memo?: string) => string
  formatRefType: (refType?: string) => string
  formatInvoiceCell: (row: LedgerRow) => React.ReactNode
  formatStore: (store?: string) => string
}) {
  if (groups.length === 0) {
    return null
  }
  return (
    <div className="space-y-2 py-1">
      {groups.map((group) => {
        const statusLabel =
          group.status === "settled"
            ? labels.statusSettled
            : group.status === "open"
              ? labels.statusOpen
              : group.status === "partial"
                ? labels.statusPartial
                : labels.statusStandalone
        const accrual = group.accrual
        const accrualRows = group.accruals?.length ? group.accruals : accrual ? [accrual] : []
        const primarySettlement = group.settlements[0]
        const daysHint =
          accrualRows[0] && primarySettlement
            ? daysBetweenLabel(accrualRows[0].trans_date, primarySettlement.trans_date, labels.daysBetween)
            : null
        return (
          <div key={group.groupId} className={cn(getLedgerPairCardClass(group.groupId), "px-3 py-2 text-sm")}>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <PairGroupNumber groupId={group.groupId} />
              <PairStatusBadge status={group.status} label={statusLabel} />
              {group.status === "open" || group.status === "partial" ? (
                <span className="text-sm text-amber-800 dark:text-amber-200 tabular-nums">
                  {labels.openRemain}: {fmtBahtSigned(group.openAmount)}
                </span>
              ) : null}
              {daysHint ? <span className="text-[10px] text-muted-foreground">{daysHint}</span> : null}
            </div>
            {accrualRows.length > 0 ? (
              accrualRows.map((accRow) => (
                <div key={accRow.id ?? `${group.groupId}-accrual`} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 pl-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {labels.purchaseDate} {String(accRow.trans_date || "").slice(0, 10)}
                    </span>
                    <span className="text-sm font-medium">{formatRefType(accRow.ref_type)}</span>
                    <span className="text-sm">{formatInvoiceCell(accRow)}</span>
                    <span className="text-[11px] text-muted-foreground">{formatStore(accRow.attributed_store)}</span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-right">{fmtBahtSigned(accRow.amount)}</span>
                  {accRow.memo ? (
                    <span className="col-span-2 text-[11px] text-muted-foreground truncate">{getMemo(accRow.memo)}</span>
                  ) : null}
                </div>
              ))
            ) : null}
            {group.settlements.length > 0 ? (
              group.settlements.map((row) => (
                <div
                  key={row.id ?? `${group.groupId}-payment`}
                  className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 pl-4 mt-1 border-l-2 border-border/60 ml-0.5"
                >
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {labels.settlementPrefix} {labels.paymentDate} {String(row.trans_date || "").slice(0, 10)}
                  </span>
                  <span className="text-sm font-medium tabular-nums text-right">{fmtBahtSigned(row.amount)}</span>
                  {row.memo ? (
                    <span className="col-span-2 text-[11px] text-muted-foreground truncate">{getMemo(row.memo)}</span>
                  ) : null}
                </div>
              ))
            ) : accrualRows.length > 0 ? (
              <p className="text-[11px] text-muted-foreground pl-4 mt-1">{labels.noSettlement}</p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function LedgerPairRowBadge({
  meta,
}: {
  meta: { groupId: number; role: "accrual" | "settlement" | "standalone" } | undefined
}) {
  if (!meta) return null
  return (
    <span
      className={cn(
        "inline-flex h-4 min-w-[1rem] items-center justify-center rounded px-0.5 text-[9px] font-bold tabular-nums",
        meta.role === "settlement" ? "text-muted-foreground" : "text-primary"
      )}
      title={`#${meta.groupId}`}
    >
      {meta.role === "settlement" ? "↳" : ledgerPairGroupBadge(meta.groupId)}
    </span>
  )
}
