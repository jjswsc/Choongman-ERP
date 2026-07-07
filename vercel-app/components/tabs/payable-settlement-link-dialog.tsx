"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import {
  isPayableLinkableAccrualRow,
  isPayableLinkablePaymentRow,
  linkedPayableTransactionIds,
  payableLinkComponentIds,
  sumPayableLinkSelectionAmount,
  payableLinkTotalsMatch,
  type PayableSettlementLinkRow,
} from "@/lib/payable-settlement-link"
import { linkPayableSettlement, unlinkPayableSettlement } from "@/lib/api-client"
import { appAlert, appConfirm } from "@/lib/app-message"
import { translateApiMessage } from "@/lib/translate-api-message"
import type { ReceivablePayableItem } from "@/lib/api-client"

type PayableRow = ReceivablePayableItem["items"][number]

function toLinkRows(
  links: { paymentId: number; accrualId: number }[] | undefined
): PayableSettlementLinkRow[] {
  return (links ?? []).map((l) => ({ payment_id: l.paymentId, accrual_id: l.accrualId }))
}

function formatRefType(refType: string | undefined, tt: (k: string, f: string) => string): string {
  const rt = String(refType || "")
  if (rt === "Inbound") return tt("payRefInbound", "매입 인보이스")
  if (rt === "PO") return tt("payRefPo", "발주")
  if (rt === "Opening") return tt("payRefOpening", "기초이월")
  if (rt === "Payment") return tt("payRefPayment", "지급")
  return rt || "-"
}

export function PayableSettlementLinkDialog({
  open,
  onOpenChange,
  vendorCode,
  vendorLabel,
  items,
  settlementLinks,
  anchorRow,
  t,
  tt,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  vendorCode: string
  vendorLabel: string
  items: PayableRow[]
  settlementLinks?: { paymentId: number; accrualId: number }[]
  anchorRow: PayableRow | null
  t: (key: string) => string
  tt: (key: string, fallback: string) => string
  onSaved: () => void
}) {
  const linkRows = React.useMemo(() => toLinkRows(settlementLinks), [settlementLinks])
  const linkedIds = React.useMemo(() => linkedPayableTransactionIds(linkRows), [linkRows])

  const anchorLinked = anchorRow?.id != null && linkedIds.has(anchorRow.id)
  const anchorComponentIds = React.useMemo(() => {
    if (!anchorRow?.id || !anchorLinked) return new Set<number>()
    return payableLinkComponentIds(anchorRow.id, linkRows)
  }, [anchorRow?.id, anchorLinked, linkRows])

  const [selectedAccrualIds, setSelectedAccrualIds] = React.useState<Set<number>>(new Set())
  const [selectedPaymentIds, setSelectedPaymentIds] = React.useState<Set<number>>(new Set())
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    const nextAccruals = new Set<number>()
    const nextPayments = new Set<number>()
    if (anchorRow?.id) {
      if (isPayableLinkableAccrualRow(anchorRow)) nextAccruals.add(anchorRow.id)
      if (isPayableLinkablePaymentRow(anchorRow)) nextPayments.add(anchorRow.id)
      if (anchorLinked) {
        for (const id of anchorComponentIds) {
          const row = items.find((r) => r.id === id)
          if (!row) continue
          if (isPayableLinkableAccrualRow(row)) nextAccruals.add(id)
          if (isPayableLinkablePaymentRow(row)) nextPayments.add(id)
        }
      }
    }
    setSelectedAccrualIds(nextAccruals)
    setSelectedPaymentIds(nextPayments)
  }, [open, anchorRow, anchorLinked, anchorComponentIds, items])

  const accrualCandidates = React.useMemo(
    () =>
      items.filter(
        (r) => isPayableLinkableAccrualRow(r) && (anchorLinked ? anchorComponentIds.has(Number(r.id)) : !linkedIds.has(Number(r.id)))
      ),
    [items, linkedIds, anchorLinked, anchorComponentIds]
  )

  const paymentCandidates = React.useMemo(
    () =>
      items.filter(
        (r) => isPayableLinkablePaymentRow(r) && (anchorLinked ? anchorComponentIds.has(Number(r.id)) : !linkedIds.has(Number(r.id)))
      ),
    [items, linkedIds, anchorLinked, anchorComponentIds]
  )

  const selectedAccrualRows = items.filter((r) => r.id != null && selectedAccrualIds.has(r.id))
  const selectedPaymentRows = items.filter((r) => r.id != null && selectedPaymentIds.has(r.id))
  const accrualTotal = sumPayableLinkSelectionAmount(selectedAccrualRows)
  const paymentTotal = sumPayableLinkSelectionAmount(selectedPaymentRows)
  const totalsOk = payableLinkTotalsMatch(accrualTotal, paymentTotal)
  const canSave =
    !anchorLinked &&
    selectedAccrualIds.size > 0 &&
    selectedPaymentIds.size > 0 &&
    totalsOk &&
    !(
      selectedAccrualIds.size > 1 &&
      selectedPaymentIds.size > 1
    )

  const toggleAccrual = (id: number, checked: boolean) => {
    setSelectedAccrualIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const togglePayment = (id: number, checked: boolean) => {
    setSelectedPaymentIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const res = await linkPayableSettlement({
        vendorCode,
        accrualIds: [...selectedAccrualIds],
        paymentIds: [...selectedPaymentIds],
      })
      if (res.success) {
        onOpenChange(false)
        onSaved()
      } else {
        await appAlert(translateApiMessage(res.message, t) || res.message || tt("processFail", "처리 실패"))
      }
    } catch (e) {
      await appAlert(tt("processFail", "처리 실패") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  const handleUnlink = async () => {
    if (!anchorRow?.id) return
    const ok = await appConfirm(
      tt(
        "paySettlementUnlinkConfirm",
        "이 입고·지급 연결을 해제하시겠습니까? 짝짓기 표시만 바뀌며 잔액 숫자는 변하지 않습니다."
      )
    )
    if (!ok) return
    setSaving(true)
    try {
      const res = await unlinkPayableSettlement({ transactionId: anchorRow.id })
      if (res.success) {
        onOpenChange(false)
        onSaved()
      } else {
        await appAlert(translateApiMessage(res.message, t) || res.message || tt("processFail", "처리 실패"))
      }
    } catch (e) {
      await appAlert(tt("processFail", "처리 실패") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  const fmtSigned = (n: number) => {
    const v = Number(n || 0)
    return `${v >= 0 ? "+" : ""}฿${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v) }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tt("paySettlementLinkTitle", "매입·지급 연결")}</DialogTitle>
          <DialogDescription>
            {tt(
              "paySettlementLinkDesc",
              "입고를 나눴거나 지급을 나눈 경우, 합계가 맞는 매입·지급을 선택해 짝짓기 표시를 맞출 수 있습니다. (잔액 합계는 그대로입니다.)"
            )}
            <span className="block mt-1 font-medium text-foreground">{vendorLabel}</span>
          </DialogDescription>
        </DialogHeader>

        {anchorLinked ? (
          <div className="rounded-md border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900 px-3 py-2 text-sm text-green-900 dark:text-green-100">
            {tt("paySettlementAlreadyLinked", "이미 연결된 묶음입니다. 해제 후 다시 연결할 수 있습니다.")}
          </div>
        ) : null}

        {!anchorLinked ? (
          <div className="space-y-4">
            <section>
              <h4 className="text-sm font-semibold mb-2">{tt("paySettlementAccrualSection", "매입(입고) — 미연결")}</h4>
              {accrualCandidates.length === 0 ? (
                <p className="text-xs text-muted-foreground">{tt("paySettlementNoAccrual", "선택 가능한 입고가 없습니다.")}</p>
              ) : (
                <ul className="space-y-1 max-h-40 overflow-y-auto border rounded-md p-2">
                  {accrualCandidates.map((row) => (
                    <li key={row.id} className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={row.id != null && selectedAccrualIds.has(row.id)}
                        onCheckedChange={(v) => row.id != null && toggleAccrual(row.id, !!v)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                          <span className="tabular-nums">{String(row.trans_date || "").slice(0, 10)}</span>
                          <span>{formatRefType(row.ref_type, tt)}</span>
                          <span className="font-medium tabular-nums ml-auto">{fmtSigned(Number(row.amount ?? 0))}</span>
                        </div>
                        {row.memo ? <p className="text-[11px] text-muted-foreground truncate">{row.memo}</p> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h4 className="text-sm font-semibold mb-2">{tt("paySettlementPaymentSection", "지급 — 미연결")}</h4>
              {paymentCandidates.length === 0 ? (
                <p className="text-xs text-muted-foreground">{tt("paySettlementNoPayment", "선택 가능한 지급이 없습니다.")}</p>
              ) : (
                <ul className="space-y-1 max-h-40 overflow-y-auto border rounded-md p-2">
                  {paymentCandidates.map((row) => (
                    <li key={row.id} className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={row.id != null && selectedPaymentIds.has(row.id)}
                        onCheckedChange={(v) => row.id != null && togglePayment(row.id, !!v)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                          <span className="tabular-nums">{String(row.trans_date || "").slice(0, 10)}</span>
                          <span>{formatRefType(row.ref_type, tt)}</span>
                          <span className="font-medium tabular-nums ml-auto">{fmtSigned(Number(row.amount ?? 0))}</span>
                        </div>
                        {row.memo ? <p className="text-[11px] text-muted-foreground truncate">{row.memo}</p> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div
              className={cn(
                "rounded-md px-3 py-2 text-sm tabular-nums",
                totalsOk && selectedAccrualIds.size > 0 && selectedPaymentIds.size > 0
                  ? "bg-green-50 text-green-900 dark:bg-green-950/20 dark:text-green-100"
                  : "bg-muted/50 text-muted-foreground"
              )}
            >
              {tt("paySettlementTotalCompare", "매입 합계")}: ฿{accrualTotal.toLocaleString()} ·{" "}
              {tt("paySettlementPaymentTotal", "지급 합계")}: ฿{paymentTotal.toLocaleString()}
              {selectedAccrualIds.size > 1 && selectedPaymentIds.size > 1 ? (
                <p className="text-xs mt-1 text-amber-800 dark:text-amber-200">
                  {tt(
                    "paySettlementNmHint",
                    "여러 입고와 여러 지급을 동시에 선택할 수 없습니다. 한쪽만 여러 건 선택해 주세요."
                  )}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            {t("btnCancel") || tt("btnCancel", "취소")}
          </Button>
          {anchorLinked ? (
            <Button type="button" variant="destructive" disabled={saving} onClick={() => void handleUnlink()}>
              {tt("paySettlementUnlink", "연결 해제")}
            </Button>
          ) : (
            <Button type="button" disabled={saving || !canSave} onClick={() => void handleSave()}>
              {saving ? t("loading") : tt("paySettlementSave", "연결 저장")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
