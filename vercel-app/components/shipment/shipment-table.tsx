"use client"

import { useState, useMemo, useEffect } from "react"
import { ChevronDown, ChevronRight, Image as ImageIcon, MessageSquare, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { patchStockLogInvoiceUnitPrice } from "@/lib/api-client"
import { appAlert } from "@/lib/app-message"
import { translateApiMessage } from "@/lib/translate-api-message"

type StatusBadgeKey = "outTypeOrder" | "statusPartialDelivered" | "statusInTransit" | "statusDelivered" | "outTypeForce"

/** 주문 유형 = 중립, 배송중 = 스카이, 배송완료 = 초록 — 관리자·모바일 동일 의미 */
const statusStyles: Record<StatusBadgeKey, string> = {
  outTypeOrder:
    "border border-border bg-muted text-foreground shadow-none dark:border-border dark:bg-muted/80",
  statusPartialDelivered: "bg-amber-500 text-white dark:bg-amber-600",
  statusInTransit: "bg-sky-600 text-white dark:bg-sky-600",
  statusDelivered: "bg-emerald-600 text-white dark:bg-emerald-600",
  outTypeForce: "bg-amber-500 text-white dark:bg-amber-600",
}

/** 미수령 품목 배지 스타일 */
const unrecvBadgeStyle = "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"

function parseDecimalInput(s: string): number {
  const raw = String(s ?? "")
    .trim()
    .replace(/,/g, "")
  if (raw === "") return NaN
  return Number(raw)
}

export interface ShipmentTableRow {
  id: string
  orderDate: string
  deliveryDate: string
  invoiceNo: string
  target: string
  type: string
  deliveryStatus?: string
  /** 주문 출고 행일 때 수령 사진 온디맨드 로드용 */
  orderRowId?: string
  items: {
    name: string
    code?: string
    spec: string
    qty: number
    amount: number
    originalOrderQty?: number
    qtyStages?: number[]
    outboundLocation?: string
    deliveryDate?: string
    isUnreceived?: boolean
    stockLogId?: number
  }[]
  itemsSummary: string
  totalQty: number
  totalAmt: number
  receiveImageUrl?: string
  receiveImageUrls?: string[]
}

interface ShipmentTableProps {
  /** 본사: 출고 그룹 테이블 / 비본사: 사용 내역 테이블 */
  isOffice: boolean
  /**
   * 출고 로그 단가 수정 허용 — 미지정 시 기존처럼 isOffice(매장명)·onReloadHistory 조합으로 판단.
   * API는 역할(Officer/Director) 기준이므로, 본사 권한은 이 값으로 넘기는 것을 권장.
   */
  canEditLogUnitPrice?: boolean
  rows: ShipmentTableRow[]
  loading?: boolean
  selectedIndices: Set<number>
  onToggleSelect: (idx: number) => void
  onToggleSelectAll: () => void
  /** orderRowId로 수령 사진 온디맨드 조회 후 모달 표시 */
  onPhotoClick?: (orderId: string) => void
  /** 비본사용: 단순 { date, item, qty, amount } */
  usageRows?: { date: string; item: string; qty: number; amount: number }[]
  /** 매장명 목록 - 수령처 유형(매장/판매처) 배지 표시용 */
  storeTargets?: string[]
  /** 강제출고 수령 완료 콜백 */
  onForceReceived?: (date: string, target: string) => void | Promise<void>
  /** 본사: 출고 로그 단가 저장 후 목록 새로고침 */
  onReloadHistory?: () => void
}

export function ShipmentTable({
  isOffice,
  canEditLogUnitPrice: canEditLogUnitPriceProp,
  rows,
  loading = false,
  selectedIndices,
  onToggleSelect,
  onToggleSelectAll,
  onPhotoClick,
  usageRows = [],
  storeTargets = [],
  onForceReceived,
  onReloadHistory,
}: ShipmentTableProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [lineEdit, setLineEdit] = useState<{
    stockLogId: number
    qty: number
    amount: number
  } | null>(null)
  const [qtyStr, setQtyStr] = useState("")
  const [unitStr, setUnitStr] = useState("")
  const [amtStr, setAmtStr] = useState("")
  const [lineEditSaving, setLineEditSaving] = useState(false)

  useEffect(() => {
    if (!lineEdit) return
    const q = Math.abs(Number(lineEdit.qty) || 0)
    const a = Number(lineEdit.amount) || 0
    const u = q > 0 ? a / q : 0
    setQtyStr(q > 0 ? String(q) : "0")
    setUnitStr(Number.isFinite(u) ? String(u) : "0")
    setAmtStr(Number.isFinite(a) ? String(a) : "0")
  }, [lineEdit])

  const allowPriceEdit =
    canEditLogUnitPriceProp !== undefined
      ? canEditLogUnitPriceProp
      : Boolean(isOffice && onReloadHistory)

  const toggleExpand = (idx: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const getOrderTypeBadge = (type: string): StatusBadgeKey | null => {
    if (type === "Force" || type === "ForceOutbound") return "outTypeForce"
    return "outTypeOrder"
  }
  const getOutboundTypeBadge = (deliveryStatus?: string): StatusBadgeKey | null => {
    if (!deliveryStatus) return null
    const s = String(deliveryStatus)
    if (s.includes("일부") || s.includes("Partial")) return "statusPartialDelivered"
    if (s.includes("배송중") || s.includes("Transit")) return "statusInTransit"
    if (s.includes("배송완료") || s.includes("Delivered") || s.includes("수령완료") || s.includes("수령")) return "statusDelivered"
    return null
  }

  /* 매장: 출고 행이 있으면 출고 테이블(인보이스 인쇄) 표시, 없으면 사용 내역 테이블 표시 */
  if (!isOffice && rows.length === 0) {
    return (
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#1E293B] text-white">
              <th className="px-3 py-3 text-center text-xs font-semibold tracking-wide whitespace-nowrap">{t("stockColDate")}</th>
              <th className="px-3 py-3 text-left text-xs font-semibold tracking-wide">{t("outColItem")}</th>
              <th className="px-3 py-3 text-center text-xs font-semibold tracking-wide whitespace-nowrap">{t("outColQty")}</th>
              <th className="px-3 py-3 text-right text-xs font-semibold tracking-wide whitespace-nowrap">{t("inColAmount")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={4} className="py-12 text-center">{t("loading")}</td>
              </tr>
            ) : usageRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-muted-foreground">{t("outNoData")}</td>
              </tr>
            ) : (
              usageRows.map((u, idx) => (
                <tr key={idx} className="transition-colors odd:bg-muted/20 hover:bg-primary/5">
                  <td className="px-3 py-3 text-center text-card-foreground whitespace-nowrap tabular-nums">{u.date}</td>
                  <td className="px-3 py-3 text-left leading-snug text-card-foreground">{u.item}</td>
                  <td className="px-3 py-3 text-center font-medium tabular-nums text-card-foreground">{u.qty.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right text-base font-semibold tabular-nums text-primary">{(u.amount || 0).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    )
  }

  const colCount = 11

  const handleQtyStrChange = (s: string) => {
    setQtyStr(s)
    const q = Math.abs(parseDecimalInput(s))
    const u = parseDecimalInput(unitStr)
    if (q > 0 && Number.isFinite(u) && u >= 0) {
      setAmtStr(String(q * u))
    }
  }

  const handleUnitStrChange = (s: string) => {
    setUnitStr(s)
    const q = Math.abs(parseDecimalInput(qtyStr))
    const u = parseDecimalInput(s)
    if (q > 0 && Number.isFinite(u) && u >= 0) {
      setAmtStr(String(q * u))
    }
  }

  const handleAmtStrChange = (s: string) => {
    setAmtStr(s)
    const q = Math.abs(parseDecimalInput(qtyStr))
    const a = parseDecimalInput(s)
    if (q > 0 && Number.isFinite(a) && a >= 0) {
      setUnitStr(String(a / q))
    }
  }

  const handleSaveLineEdit = async () => {
    if (!lineEdit || !onReloadHistory) return
    const q = Math.abs(parseDecimalInput(qtyStr))
    const a = parseDecimalInput(amtStr)
    if (!Number.isFinite(q) || q <= 0) {
      await appAlert(t("outLineEditInvalid"))
      return
    }
    if (!Number.isFinite(a) || a < 0) {
      await appAlert(t("outLineEditInvalid"))
      return
    }
    const u = a / q
    if (!Number.isFinite(u) || u > 1e12) {
      await appAlert(t("outLineEditInvalid"))
      return
    }
    setLineEditSaving(true)
    try {
      const res = await patchStockLogInvoiceUnitPrice({
        stockLogId: lineEdit.stockLogId,
        invoiceUnitPrice: u,
        qtyAbs: q,
      })
      if (res.success) {
        let msg = translateApiMessage(res.message, t) || res.message || "OK"
        const rs = res.receivableSync
        if (rs?.ran && rs.ok === false && rs.message) {
          msg += "\n\n" + (translateApiMessage(rs.message, t) || rs.message)
        }
        await appAlert(msg)
        setLineEdit(null)
        onReloadHistory()
      } else {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("outLineEditInvalid"))
      }
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : String(e))
    } finally {
      setLineEditSaving(false)
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full table-fixed border-collapse text-xs sm:text-[13px]">
        <colgroup>
          <col style={{ width: "3%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "7%" }} />
          <col style={{ width: "7%" }} />
          <col style={{ width: "5%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "25%" }} />
          <col style={{ width: "7%" }} />
          <col style={{ width: "10%" }} />
        </colgroup>
        <thead>
          <tr className="bg-[#1E293B] text-white">
            <th className="px-2 py-2.5 text-center sm:px-2.5 sm:py-3">
              <input
                type="checkbox"
                checked={rows.length > 0 && selectedIndices.size === rows.length}
                onChange={onToggleSelectAll}
                className="h-3.5 w-3.5 rounded border-[#1E293B] accent-[#3B82F6] cursor-pointer"
              />
            </th>
            <th className="px-2 py-2.5 text-center text-[11px] font-semibold leading-snug tracking-wide whitespace-nowrap sm:px-2.5 sm:py-3 sm:text-xs">
              {t("orderColDate")}
            </th>
            <th className="px-2 py-2.5 text-center text-[11px] font-semibold leading-snug tracking-wide whitespace-nowrap sm:px-2.5 sm:py-3 sm:text-xs">
              {t("orderColDeliveryDate")}
            </th>
            <th className="px-2 py-2.5 text-center text-[11px] font-semibold leading-snug tracking-wide whitespace-nowrap sm:px-2.5 sm:py-3 sm:text-xs">
              {t("outColInvNo")}
            </th>
            <th className="px-2 py-2.5 text-center text-[11px] font-semibold leading-snug tracking-wide whitespace-nowrap sm:px-2.5 sm:py-3 sm:text-xs">
              {t("outColOrderType")}
            </th>
            <th className="px-2 py-2.5 text-center text-[11px] font-semibold leading-snug tracking-wide whitespace-nowrap sm:px-2.5 sm:py-3 sm:text-xs">
              {t("outColOutboundType")}
            </th>
            <th className="px-2 py-2.5 text-center text-[11px] font-semibold leading-snug tracking-wide whitespace-nowrap sm:px-2.5 sm:py-3 sm:text-xs">
              {t("outColPhoto")}
            </th>
            <th className="px-2 py-2.5 text-center text-[11px] font-semibold leading-snug tracking-wide whitespace-nowrap sm:px-2.5 sm:py-3 sm:text-xs">
              {t("outColStore")}
            </th>
            <th className="px-2 py-2.5 text-center text-[11px] font-semibold leading-snug tracking-wide sm:px-2.5 sm:py-3 sm:text-xs">{t("outColItem")}</th>
            <th className="px-2 py-2.5 text-center text-[11px] font-semibold leading-snug tracking-wide whitespace-nowrap sm:px-2.5 sm:py-3 sm:text-xs">
              {t("outColQty")}
            </th>
            <th className="px-2 py-2.5 text-center text-[11px] font-semibold leading-snug tracking-wide whitespace-nowrap sm:px-2.5 sm:py-3 sm:text-xs">
              {t("inColAmount")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {loading ? (
            <tr>
              <td colSpan={colCount} className="py-12 text-center">{t("loading")}</td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="py-12 text-center text-muted-foreground">{t("outNoData")}</td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <TableRow
                key={row.id}
                row={row}
                isExpanded={expandedRows.has(idx)}
                isSelected={selectedIndices.has(idx)}
                onToggleExpand={() => toggleExpand(idx)}
                onToggleSelect={() => onToggleSelect(idx)}
                onPhotoClick={onPhotoClick}
                onForceReceived={onForceReceived}
                storeTargetsSet={new Set(storeTargets)}
                getOrderTypeBadge={getOrderTypeBadge}
                getOutboundTypeBadge={getOutboundTypeBadge}
                t={t}
                allowPriceEdit={allowPriceEdit}
                onOpenLineEdit={(p) => setLineEdit(p)}
              />
            ))
          )}
        </tbody>
      </table>

      <Dialog open={lineEdit != null} onOpenChange={(o) => !o && setLineEdit(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("outEditOutboundLineTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{t("outInvoiceLineEditNote")}</p>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">{t("outColQty")}</label>
              <Input
                type="text"
                inputMode="decimal"
                value={qtyStr}
                onChange={(e) => handleQtyStrChange(e.target.value)}
                className="h-9"
                disabled={lineEditSaving}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t("outInvoiceUnitPriceLabel")}</label>
              <Input
                type="text"
                inputMode="decimal"
                value={unitStr}
                onChange={(e) => handleUnitStrChange(e.target.value)}
                className="h-9"
                disabled={lineEditSaving}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t("inColAmount")}</label>
              <Input
                type="text"
                inputMode="decimal"
                value={amtStr}
                onChange={(e) => handleAmtStrChange(e.target.value)}
                className="h-9"
                disabled={lineEditSaving}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setLineEdit(null)} disabled={lineEditSaving}>
              {t("cancel") || "Cancel"}
            </Button>
            <Button type="button" onClick={() => void handleSaveLineEdit()} disabled={lineEditSaving}>
              {lineEditSaving ? t("loading") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TableRow({
  row,
  isExpanded,
  isSelected,
  onToggleExpand,
  onToggleSelect,
  onPhotoClick,
  onForceReceived,
  storeTargetsSet,
  getOrderTypeBadge,
  getOutboundTypeBadge,
  t,
  allowPriceEdit,
  onOpenLineEdit,
}: {
  row: ShipmentTableRow
  isExpanded: boolean
  isSelected: boolean
  onToggleExpand: () => void
  onToggleSelect: () => void
  onPhotoClick?: (orderId: string) => void
  onForceReceived?: (date: string, target: string) => void | Promise<void>
  storeTargetsSet: Set<string>
  getOrderTypeBadge: (type: string) => StatusBadgeKey | null
  getOutboundTypeBadge: (deliveryStatus?: string) => StatusBadgeKey | null
  t: (k: string) => string
  allowPriceEdit: boolean
  onOpenLineEdit: (p: { stockLogId: number; qty: number; amount: number }) => void
}) {
  const hasDetails = row.items.length >= 1
  const orderBadge = getOrderTypeBadge(row.type)
  const outboundBadge = getOutboundTypeBadge(row.deliveryStatus)
  const [codeSort, setCodeSort] = useState<"asc" | "desc" | null>(null)
  const sortedItems = useMemo(() => {
    if (!codeSort || row.items.length === 0) return row.items
    return [...row.items].sort((a, b) => {
      const ca = (a.code || "").toLowerCase()
      const cb = (b.code || "").toLowerCase()
      const cmp = ca.localeCompare(cb)
      return codeSort === "asc" ? cmp : -cmp
    })
  }, [row.items, codeSort])
  const toggleCodeSort = () => {
    setCodeSort((prev) => (prev === null ? "asc" : prev === "asc" ? "desc" : null))
  }

  return (
    <>
      <tr
        className={cn(
          "transition-colors hover:bg-primary/5",
          isSelected && "bg-primary/5"
        )}
      >
        <td className="px-2 py-2.5 text-center align-middle sm:px-2.5 sm:py-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="h-3.5 w-3.5 rounded border-gray-300 accent-[#3B82F6] cursor-pointer"
          />
        </td>
        <td className="px-2 py-2.5 text-center text-[11px] leading-snug text-card-foreground whitespace-nowrap tabular-nums sm:px-2.5 sm:py-3 sm:text-xs">
          {row.orderDate}
        </td>
        <td className="px-2 py-2.5 text-center text-[11px] leading-snug text-card-foreground whitespace-nowrap tabular-nums sm:px-2.5 sm:py-3 sm:text-xs">
          {row.deliveryDate || "-"}
        </td>
        <td className="px-2 py-2.5 text-center font-mono text-[11px] leading-snug text-card-foreground whitespace-nowrap sm:px-2.5 sm:py-3 sm:text-xs">
          {row.invoiceNo}
        </td>
        <td className="px-2 py-2.5 text-center align-middle sm:px-2.5 sm:py-3">
          {orderBadge ? (
            <span
              className={cn(
                "inline-flex max-w-full items-center justify-center rounded-md px-1.5 py-1 text-[10px] font-semibold leading-tight whitespace-nowrap sm:text-[11px]",
                statusStyles[orderBadge]
              )}
            >
              {t(orderBadge)}
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </td>
        <td className="px-2 py-2.5 text-center align-middle sm:px-2.5 sm:py-3">
          {outboundBadge ? (
            <span
              className={cn(
                "inline-flex max-w-full items-center justify-center rounded-md px-1.5 py-1 text-[10px] font-semibold leading-tight whitespace-nowrap sm:text-[11px]",
                statusStyles[outboundBadge]
              )}
            >
              {t(outboundBadge)}
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </td>
        <td className="px-2 py-2.5 text-center align-middle sm:px-2.5 sm:py-3">
          <div className="flex items-center justify-center gap-1">
            {row.orderRowId && row.type === "Outbound" ? (
              <button
                type="button"
                onClick={() => onPhotoClick?.(row.orderRowId!)}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded border border-border hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary sm:size-9"
                title={t("outPhotoView")}
              >
                <ImageIcon className="h-3.5 w-3.5 text-primary sm:h-4 sm:w-4" aria-hidden />
              </button>
            ) : (
              <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
          </div>
        </td>
        <td className="max-w-0 px-2 py-2.5 text-center text-[11px] font-medium leading-snug text-card-foreground sm:px-2.5 sm:py-3 sm:text-xs">
          <div className="flex flex-col items-center gap-1.5">
            <span className="line-clamp-2 max-w-full" title={row.target}>
              {row.target}
            </span>
            {storeTargetsSet.size > 0 && (
              <span
                className={cn(
                  "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium leading-none",
                  storeTargetsSet.has(row.target)
                    ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                )}
              >
                {storeTargetsSet.has(row.target) ? t("outTargetTypeStore") : t("outTargetTypeSales")}
              </span>
            )}
            {row.type === "Force" &&
              onForceReceived &&
              !String(row.deliveryStatus || "").includes("수령") &&
              !String(row.deliveryStatus || "").includes("배송완료") &&
              !String(row.deliveryStatus || "").includes("Delivered") && (
                <button
                  type="button"
                  onClick={() => onForceReceived(row.orderDate, row.target)}
                  className="mt-0.5 inline-flex items-center rounded-md border border-primary bg-primary/10 px-2.5 py-1.5 text-[10px] font-medium leading-none text-primary hover:bg-primary/20"
                >
                  {t("outForceReceived")}
                </button>
              )}
          </div>
        </td>
        <td className="max-w-0 px-2 py-2.5 sm:px-2.5 sm:py-3">
          <div className="flex min-w-0 items-start gap-1.5">
            {hasDetails && (
              <button
                type="button"
                onClick={onToggleExpand}
                className="mt-0.5 shrink-0 rounded-md p-0.5 text-primary transition-colors hover:bg-accent"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            )}
            {!hasDetails && <span className="inline-block w-5 shrink-0" />}
            <span className="min-w-0 text-left text-[11px] leading-snug text-card-foreground sm:text-xs" title={row.itemsSummary}>
              {row.itemsSummary}
            </span>
          </div>
        </td>
        <td className="px-2 py-2.5 text-center text-[11px] font-medium tabular-nums text-card-foreground sm:px-2.5 sm:py-3 sm:text-xs">
          {row.totalQty.toLocaleString()}
        </td>
        <td className="px-2 py-2.5 text-right text-[11px] font-semibold tabular-nums text-primary sm:px-2.5 sm:py-3 sm:text-sm">
          {row.totalAmt.toLocaleString()}
        </td>
      </tr>
      {isExpanded && hasDetails && (
        <tr>
          <td colSpan={11} className="px-0 py-0">
            <div className="mx-3 my-3 overflow-x-auto rounded-lg border border-border/80 bg-muted/40 shadow-sm">
              <table
                className={cn(
                  "max-w-full table-fixed border-collapse text-xs leading-normal sm:text-[13px] sm:leading-normal",
                  allowPriceEdit ? "w-[96%]" : "w-[97%]"
                )}
              >
                <colgroup>
                  {allowPriceEdit ? (
                    <>
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "26%" }} />
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "10%" }} />
                      <col style={{ width: "11%" }} />
                      <col style={{ width: "9%" }} />
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "8%" }} />
                    </>
                  ) : (
                    <>
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "32%" }} />
                      <col style={{ width: "9%" }} />
                      <col style={{ width: "11%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "10%" }} />
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "7%" }} />
                    </>
                  )}
                </colgroup>
                <thead>
                  <tr className="border-b border-border bg-muted/70">
                    <th
                      className="px-2.5 py-3.5 text-left text-xs font-semibold tracking-wide text-card-foreground cursor-pointer hover:bg-muted/90 select-none sm:py-4 sm:text-[13px]"
                      onClick={toggleCodeSort}
                      title={t("outColCode") || "코드 (클릭 시 정렬)"}
                    >
                      {t("outColCode") || "코드"}
                      {codeSort === "asc" && "↑"}
                      {codeSort === "desc" && "↓"}
                    </th>
                    <th className="px-2.5 py-3.5 text-left text-xs font-semibold tracking-wide text-card-foreground sm:py-4 sm:text-[13px]">{t("outColItem")}</th>
                    <th className="px-2 py-3.5 text-center text-xs font-semibold tracking-wide text-card-foreground sm:py-4 sm:text-[13px]">{t("outColStatus") || "상태"}</th>
                    <th className="px-2.5 py-3.5 text-left text-xs font-semibold tracking-wide text-muted-foreground sm:py-4 sm:text-[13px]">{t("spec")}</th>
                    <th className="px-2.5 py-3.5 text-left text-xs font-semibold tracking-wide text-muted-foreground sm:py-4 sm:text-[13px]">{t("outWhWarehouseCol") || "출고지"}</th>
                    <th className="px-2 py-3.5 text-center text-xs font-semibold tracking-wide text-muted-foreground sm:py-4 sm:text-[13px]">{t("orderColDeliveryDate") || "배송일자"}</th>
                    <th className="px-2 py-3.5 text-center text-xs font-semibold tracking-wide text-card-foreground sm:py-4 sm:text-[13px]">{t("outColQty")}</th>
                    <th className="px-2 py-3.5 text-right text-xs font-semibold tracking-wide text-card-foreground sm:py-4 sm:text-[13px]">{t("inColAmount")}</th>
                    {allowPriceEdit ? (
                      <th
                        className={cn(
                          "sticky right-0 z-[2] min-w-[40px] border-l border-border/60 bg-muted px-1 py-3.5 text-center text-xs font-semibold text-card-foreground shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.1)] backdrop-blur-[1px] sm:py-4 sm:text-[13px]"
                        )}
                      >
                        {t("outColEdit")}
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/80">
                  {sortedItems.map((d, i) => (
                    <tr
                      key={i}
                      className={cn(
                        "group transition-colors odd:bg-background/40 even:bg-muted/25 hover:bg-primary/[0.06]",
                        d.isUnreceived && "bg-red-50 odd:bg-red-50 even:bg-red-50/90 dark:bg-red-950/20 dark:odd:bg-red-950/25 dark:even:bg-red-950/15"
                      )}
                    >
                      <td className="max-w-0 px-2.5 py-3.5 text-left align-middle font-mono text-xs text-muted-foreground sm:py-4 sm:text-[13px]">
                        <span className="block truncate" title={d.code || ""}>
                          {d.code || "-"}
                        </span>
                      </td>
                      <td className="max-w-0 px-2.5 py-3.5 text-left align-middle text-sm font-medium leading-normal text-card-foreground sm:py-4">
                        <span className="line-clamp-2" title={d.name}>
                          {d.name}
                        </span>
                      </td>
                      <td className="px-2 py-3.5 text-center align-middle sm:py-4">
                        {d.isUnreceived ? (
                          <span
                            className={cn(
                              "inline-flex max-w-full items-center justify-center rounded-md px-1.5 py-1 text-[10px] font-semibold leading-tight sm:text-xs",
                              unrecvBadgeStyle
                            )}
                          >
                            <span className="truncate" title={t("outItemUnreceived") || ""}>
                              {t("outItemUnreceived") || "미수령"}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="max-w-0 px-2.5 py-3.5 text-left align-middle text-xs text-muted-foreground sm:py-4 sm:text-[13px]">
                        <span className="line-clamp-2" title={d.spec}>
                          {d.spec}
                        </span>
                      </td>
                      <td className="max-w-0 px-2.5 py-3.5 text-left align-middle text-xs text-muted-foreground sm:py-4 sm:text-[13px]">
                        <span className="line-clamp-2" title={d.outboundLocation}>
                          {d.outboundLocation || "-"}
                        </span>
                      </td>
                      <td className="px-2 py-3.5 text-center align-middle text-xs tabular-nums text-muted-foreground sm:py-4 sm:text-[13px]">
                        {(d.deliveryDate || "-").slice(0, 10)}
                      </td>
                      <td className="px-2 py-3.5 text-center align-middle text-sm font-medium tabular-nums text-card-foreground sm:py-4">
                        {d.qtyStages && d.qtyStages.length >= 2 ? (
                          <span className="text-card-foreground">
                            {d.qtyStages.map((stage, j) => (
                              <span key={j}>
                                {j > 0 && <span className="text-muted-foreground">→</span>}
                                <span className={j < d.qtyStages!.length - 1 ? "text-destructive line-through" : ""}>
                                  {stage.toLocaleString()}
                                </span>
                              </span>
                            ))}
                          </span>
                        ) : d.originalOrderQty != null && d.originalOrderQty !== d.qty ? (
                          <>
                            <span className="text-destructive line-through">{d.originalOrderQty.toLocaleString()}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="text-card-foreground">{d.qty.toLocaleString()}</span>
                          </>
                        ) : (
                          <span className="text-card-foreground">{d.qty.toLocaleString()}</span>
                        )}
                      </td>
                      <td className="px-2 py-3.5 text-right align-middle text-sm font-semibold tabular-nums text-card-foreground sm:py-4">{d.amount.toLocaleString()}</td>
                      {allowPriceEdit ? (
                        <td
                          className={cn(
                            "sticky right-0 z-[1] min-w-[40px] border-l border-border/60 bg-muted/90 px-1 py-3.5 text-center align-middle shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.08)] group-hover:bg-muted sm:py-4"
                          )}
                        >
                          {d.stockLogId != null && d.stockLogId > 0 ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-xs"
                              className="mx-auto shrink-0"
                              title={t("edit")}
                              aria-label={t("edit")}
                              onClick={() =>
                                onOpenLineEdit({
                                  stockLogId: d.stockLogId!,
                                  qty: d.qty,
                                  amount: d.amount,
                                })
                              }
                            >
                              <Pencil className="h-3 w-3" aria-hidden />
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
