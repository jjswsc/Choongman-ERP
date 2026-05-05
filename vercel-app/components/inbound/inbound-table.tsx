"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, ChevronRight, PenLine, Trash2, Printer, FileSpreadsheet, FileCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
export interface InboundTableRow {
  id: string
  date: string
  poDate?: string | null
  vendor: string
  inboundBatchId?: number
  poNo?: string
  invoiceNo?: string
  invoiceReceived?: boolean
  items: { name: string; spec: string; qty: number; amount: number; vatAmount: number }[]
  itemsSummary: string
  totalQty: number
  totalAmt: number
  totalVat: number
}

interface InboundTableProps {
  rows: InboundTableRow[]
  loading?: boolean
  onEdit?: (row: InboundTableRow) => void
  onDelete?: (row: InboundTableRow) => void
  onInvoiceReceivedToggle?: (row: InboundTableRow) => void
  onPrint?: (row: InboundTableRow) => void
  onExcel?: (row: InboundTableRow) => void
  /** 선택한 여러 입고 건을 한 번에 인쇄 */
  onBulkPrint?: (rows: InboundTableRow[]) => void
  /** 선택한 여러 입고 건을 한 파일로 엑셀 저장 */
  onBulkExcel?: (rows: InboundTableRow[]) => void
  updatingInvoiceId?: number | null
  /** 가맹점: Tax Invoice 화면 미리보기 전용(인쇄·파일 없음) */
  franchiseTaxInvoicePreview?: (row: InboundTableRow) => void
}

type OfficeSortKey = "poDate" | "inboundDate" | "vendor" | "item" | "qty" | "amount" | "vat" | "total" | "poInvoice"

function formatPoInvoiceDisplay(row: InboundTableRow): string {
  const po = String(row.poNo || "").trim()
  const inv = String(row.invoiceNo || "").trim()
  if (po && inv) return `${po} / ${inv}`
  if (po) return po
  if (inv) return inv
  return ""
}

export function InboundTable({
  rows,
  loading = false,
  onEdit,
  onDelete,
  onInvoiceReceivedToggle,
  onPrint,
  onExcel,
  onBulkPrint,
  onBulkExcel,
  updatingInvoiceId = null,
  franchiseTaxInvoicePreview,
}: InboundTableProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [sortKey, setSortKey] = useState<OfficeSortKey>("inboundDate")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const selectAllRef = useRef<HTMLInputElement>(null)

  const showBulk = !!(onBulkPrint || onBulkExcel)

  const rowIdsKey = useMemo(() => rows.map((r) => r.id).join("\u0001"), [rows])

  useEffect(() => {
    setSelectedIds(new Set())
  }, [rowIdsKey])

  const toggleExpand = (rowId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  }

  const sortedOfficeRows = useMemo(() => {
    const compareString = (a: string, b: string) =>
      a.localeCompare(b, undefined, { sensitivity: "base", numeric: true })
    const compareDate = (a?: string | null, b?: string | null) => {
      const aTime = a ? new Date(a).getTime() : NaN
      const bTime = b ? new Date(b).getTime() : NaN
      const aValid = Number.isFinite(aTime)
      const bValid = Number.isFinite(bTime)
      if (!aValid && !bValid) return 0
      if (!aValid) return 1
      if (!bValid) return -1
      return aTime - bTime
    }

    const rowsToSort = [...rows]
    rowsToSort.sort((a, b) => {
      let diff = 0
      switch (sortKey) {
        case "poDate":
          diff = compareDate(a.poDate, b.poDate)
          break
        case "inboundDate":
          diff = compareDate(a.date, b.date)
          break
        case "vendor":
          diff = compareString(a.vendor || "", b.vendor || "")
          break
        case "item":
          diff = compareString(a.itemsSummary || "", b.itemsSummary || "")
          break
        case "qty":
          diff = a.totalQty - b.totalQty
          break
        case "amount":
          diff = a.totalAmt - b.totalAmt
          break
        case "vat":
          diff = a.totalVat - b.totalVat
          break
        case "total":
          diff = a.totalAmt + a.totalVat - (b.totalAmt + b.totalVat)
          break
        case "poInvoice":
          diff = compareString(formatPoInvoiceDisplay(a), formatPoInvoiceDisplay(b))
          break
        default:
          diff = 0
      }
      if (diff === 0) {
        diff = compareDate(a.date, b.date) || compareString(a.vendor || "", b.vendor || "")
      }
      return sortDir === "asc" ? diff : -diff
    })
    return rowsToSort
  }, [rows, sortKey, sortDir])

  useEffect(() => {
    const el = selectAllRef.current
    if (!el || !showBulk) return
    el.indeterminate = selectedIds.size > 0 && selectedIds.size < sortedOfficeRows.length
  }, [selectedIds, sortedOfficeRows.length, showBulk])

  const handleSort = (nextKey: OfficeSortKey) => {
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))
      return
    }
    setSortKey(nextKey)
    setSortDir("asc")
  }

  const sortMark = (key: OfficeSortKey) => {
    if (sortKey !== key) return ""
    return sortDir === "asc" ? " ▲" : " ▼"
  }
  const supplyLabel = t("salesSupplyAmount") || t("posSystemSubtotal") || "Supply"
  const vatLabel = t("posVatLabel") || "VAT"
  const totalLabel = t("inv_total") || t("total") || "Total"

  const checkboxCol = showBulk ? 1 : 0
  const actionsCol = onEdit || onDelete || onInvoiceReceivedToggle || onPrint || onExcel ? 1 : 0
  const colCount = checkboxCol + 9 + actionsCol

  const toggleRowSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === sortedOfficeRows.length) {
      setSelectedIds(new Set())
      return
    }
    setSelectedIds(new Set(sortedOfficeRows.map((r) => r.id)))
  }

  const selectedRowsOrdered = useMemo(
    () => sortedOfficeRows.filter((r) => selectedIds.has(r.id)),
    [sortedOfficeRows, selectedIds]
  )

  const clearSelection = () => setSelectedIds(new Set())

  return (
    <div className="rounded-lg border border-border bg-card">
      {showBulk && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {t("inHistSelectedCount").replace("{n}", String(selectedIds.size))}
          </span>
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={clearSelection} disabled={selectedIds.size === 0}>
            {t("inHistClearSelection")}
          </Button>
          {onBulkPrint && (
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={selectedIds.size === 0}
              onClick={() => onBulkPrint(selectedRowsOrdered)}
            >
              <Printer className="h-3.5 w-3.5" />
              {t("inHistBulkPrint")}
            </Button>
          )}
          {onBulkExcel && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 gap-1.5 text-xs"
              disabled={selectedIds.size === 0}
              onClick={() => onBulkExcel(selectedRowsOrdered)}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {t("inHistBulkExcel")}
            </Button>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#1E293B] text-white">
              {showBulk && (
                <th className="w-9 px-1 py-2.5 text-center">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className="h-3.5 w-3.5 cursor-pointer rounded border border-white/40 bg-transparent accent-primary disabled:opacity-50"
                    checked={sortedOfficeRows.length > 0 && selectedIds.size === sortedOfficeRows.length}
                    onChange={toggleSelectAll}
                    disabled={loading || sortedOfficeRows.length === 0}
                    title={t("inHistSelectAll")}
                    aria-label={t("inHistSelectAll")}
                  />
                </th>
              )}
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">
                <button type="button" className="hover:text-primary" onClick={() => handleSort("poDate")}>
                  {t("inPoDate")}{sortMark("poDate")}
                </button>
              </th>
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">
                <button type="button" className="hover:text-primary" onClick={() => handleSort("inboundDate")}>
                  {t("inInboundDate")}{sortMark("inboundDate")}
                </button>
              </th>
              <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">
                <button type="button" className="hover:text-primary" onClick={() => handleSort("vendor")}>
                  {t("inVendor")}{sortMark("vendor")}
                </button>
              </th>
              <th className="px-3 py-2.5 text-center font-semibold">
                <button type="button" className="hover:text-primary" onClick={() => handleSort("item")}>
                  {t("outColItem")}{sortMark("item")}
                </button>
              </th>
              <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">
                <button type="button" className="hover:text-primary" onClick={() => handleSort("qty")}>
                  {t("outColQty")}{sortMark("qty")}
                </button>
              </th>
              <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">
                <button type="button" className="hover:text-primary" onClick={() => handleSort("amount")}>
                  {supplyLabel}{sortMark("amount")}
                </button>
              </th>
              <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">
                <button type="button" className="hover:text-primary" onClick={() => handleSort("vat")}>
                  {vatLabel}{sortMark("vat")}
                </button>
              </th>
              <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">
                <button type="button" className="hover:text-primary" onClick={() => handleSort("total")}>
                  {totalLabel}{sortMark("total")}
                </button>
              </th>
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap min-w-[90px]">
                <button type="button" className="hover:text-primary" onClick={() => handleSort("poInvoice")}>
                  {t("poInvoiceNo")}{sortMark("poInvoice")}
                </button>
              </th>
              {(onEdit || onDelete || onInvoiceReceivedToggle || onPrint || onExcel) && (
                <th className="px-2 py-2.5 text-center font-semibold min-w-[10rem] whitespace-nowrap">{t("actions")}</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={colCount} className="py-12 text-center">
                  {t("loading")}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="py-12 text-center text-muted-foreground">
                  {t("inNoData")}
                </td>
              </tr>
            ) : (
              sortedOfficeRows.map((row) => (
                <TableRow
                  key={row.id}
                  row={row}
                  colCount={colCount}
                  showCheckboxCol={showBulk}
                  rowSelected={selectedIds.has(row.id)}
                  onToggleRowSelected={() => toggleRowSelected(row.id)}
                  isExpanded={expandedRows.has(row.id)}
                  onToggleExpand={() => toggleExpand(row.id)}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onInvoiceReceivedToggle={onInvoiceReceivedToggle}
                  onPrint={onPrint}
                  onExcel={onExcel}
                  updatingInvoiceId={updatingInvoiceId}
                  franchiseTaxInvoicePreview={franchiseTaxInvoicePreview}
                  t={t}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TableRow({
  row,
  colCount,
  showCheckboxCol,
  rowSelected,
  onToggleRowSelected,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onInvoiceReceivedToggle,
  onPrint,
  onExcel,
  updatingInvoiceId,
  franchiseTaxInvoicePreview,
  t,
}: {
  row: InboundTableRow
  colCount: number
  showCheckboxCol: boolean
  rowSelected: boolean
  onToggleRowSelected: () => void
  isExpanded: boolean
  onToggleExpand: () => void
  onEdit?: (row: InboundTableRow) => void
  onDelete?: (row: InboundTableRow) => void
  onInvoiceReceivedToggle?: (row: InboundTableRow) => void
  onPrint?: (row: InboundTableRow) => void
  onExcel?: (row: InboundTableRow) => void
  updatingInvoiceId?: number | null
  franchiseTaxInvoicePreview?: (row: InboundTableRow) => void
  t: (k: string) => string
}) {
  const hasDetails = row.items.length > 1
  const canEdit = row.inboundBatchId != null && onEdit
  const canDelete = row.inboundBatchId != null && onDelete
  const canInvoiceToggle = row.inboundBatchId != null && onInvoiceReceivedToggle
  const canPrint = !!onPrint
  const canExcel = !!onExcel
  const supplyLabel = t("salesSupplyAmount") || t("posSystemSubtotal") || "Supply"
  const vatLabel = t("posVatLabel") || "VAT"
  const totalLabel = t("inv_total") || t("total") || "Total"

  return (
    <>
      <tr className={cn("transition-colors hover:bg-primary/5", rowSelected && "bg-primary/5")}>
        {showCheckboxCol && (
          <td className="w-9 px-1 py-2.5 text-center align-middle" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center">
              <Checkbox checked={rowSelected} onCheckedChange={() => onToggleRowSelected()} aria-label={t("inHistRowCheckbox")} />
            </div>
          </td>
        )}
        <td className="px-2 py-2.5 text-center text-card-foreground whitespace-nowrap text-muted-foreground">{row.poDate ?? "—"}</td>
        <td className="px-2 py-2.5 text-center text-card-foreground whitespace-nowrap font-medium">{row.date}</td>
        <td className="px-3 py-2.5 text-center text-card-foreground whitespace-nowrap font-medium">{row.vendor}</td>
        <td className="px-3 py-2.5 text-card-foreground">
          <div className="flex items-center gap-1.5">
            {hasDetails && (
              <button
                type="button"
                onClick={onToggleExpand}
                className="flex-shrink-0 rounded p-0.5 hover:bg-accent transition-colors text-primary"
              >
                {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            )}
            {!hasDetails && <span className="inline-block w-[18px]" />}
            <span className="truncate max-w-[400px]" title={row.itemsSummary}>
              {row.itemsSummary}
            </span>
          </div>
        </td>
        <td className="px-3 py-2.5 text-center text-card-foreground font-medium tabular-nums">{row.totalQty.toLocaleString()}</td>
        <td className="px-3 py-2.5 text-right font-bold text-primary tabular-nums">{row.totalAmt.toLocaleString()}</td>
        <td className="px-3 py-2.5 text-right text-card-foreground tabular-nums">{row.totalVat.toLocaleString()}</td>
        <td className="px-3 py-2.5 text-right text-card-foreground tabular-nums">{(row.totalAmt + row.totalVat).toLocaleString()}</td>
        <td className="px-2 py-2.5 text-center text-muted-foreground text-xs max-w-[140px]" onClick={(e) => e.stopPropagation()}>
          {franchiseTaxInvoicePreview ? (
            <button
              type="button"
              onClick={() => franchiseTaxInvoicePreview(row)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-xs leading-none shadow-sm transition-colors hover:bg-accent"
              title={`${t("inTaxInvoicePreviewBtn")}${formatPoInvoiceDisplay(row) ? ` — ${formatPoInvoiceDisplay(row)}` : ""}`}
              aria-label={
                formatPoInvoiceDisplay(row)
                  ? `${t("posReceiptTaxInvoice")}: ${formatPoInvoiceDisplay(row)}`
                  : t("posReceiptTaxInvoice")
              }
            >
              <span aria-hidden className="inline-block scale-90 text-[13px] leading-none">
                🧾
              </span>
            </button>
          ) : (
            (() => {
              const s = formatPoInvoiceDisplay(row)
              return s ? (
                <span className="text-card-foreground truncate inline-block max-w-full align-middle" title={s}>
                  {s}
                </span>
              ) : (
                "—"
              )
            })()
          )}
        </td>
        {(canEdit || canDelete || canInvoiceToggle || canPrint || canExcel) && (
          <td className="px-2 py-2.5 min-w-[10rem]">
            <div className="flex items-center justify-center gap-1 flex-nowrap">
              {canInvoiceToggle && (
                <button
                  type="button"
                  onClick={() => onInvoiceReceivedToggle?.(row)}
                  disabled={updatingInvoiceId === row.inboundBatchId}
                  className={`rounded p-1.5 transition-colors ${row.invoiceReceived ? "text-green-600" : "text-muted-foreground hover:text-foreground"}`}
                  title={row.invoiceReceived ? t("poInvoiceReceived") + " ✓" : t("poInvoiceReceived")}
                >
                  <FileCheck className="h-3.5 w-3.5" />
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onEdit?.(row)}
                  className="rounded p-1.5 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  title={t("edit")}
                >
                  <PenLine className="h-3.5 w-3.5" />
                </button>
              )}
              {canPrint && (
                <button
                  type="button"
                  onClick={() => onPrint?.(row)}
                  className="rounded p-1.5 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  title={t("purchaseOrderPrint")}
                >
                  <Printer className="h-3.5 w-3.5" />
                </button>
              )}
              {canExcel && (
                <button
                  type="button"
                  onClick={() => onExcel?.(row)}
                  className="rounded p-1.5 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  title={t("purchaseOrderExcel")}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => onDelete?.(row)}
                  className="rounded p-1.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title={t("delete")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </td>
        )}
      </tr>
      {isExpanded && hasDetails && (
        <tr>
          <td colSpan={colCount} className="px-0 py-0">
            <div className="mx-6 my-2 overflow-hidden rounded border border-border bg-muted/30">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="px-4 py-2 text-center font-semibold text-card-foreground">{t("outColItem")}</th>
                    <th className="px-4 py-2 text-center font-semibold text-card-foreground">{t("spec")}</th>
                    <th className="px-4 py-2 text-center font-semibold text-card-foreground">{t("outColQty")}</th>
                    <th className="px-4 py-2 text-center font-semibold text-card-foreground">{supplyLabel}</th>
                    <th className="px-4 py-2 text-center font-semibold text-card-foreground">{vatLabel}</th>
                    <th className="px-4 py-2 text-center font-semibold text-card-foreground">{totalLabel}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {row.items.map((d, i) => (
                    <tr key={i} className="hover:bg-primary/5 transition-colors">
                      <td className="px-4 py-2 text-center text-card-foreground">{d.name}</td>
                      <td className="px-4 py-2 text-center text-muted-foreground">{d.spec}</td>
                      <td className="px-4 py-2 text-center text-card-foreground font-medium tabular-nums">{d.qty.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-card-foreground tabular-nums">{d.amount.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-card-foreground tabular-nums">{d.vatAmount.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-card-foreground tabular-nums">{(d.amount + d.vatAmount).toLocaleString()}</td>
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
