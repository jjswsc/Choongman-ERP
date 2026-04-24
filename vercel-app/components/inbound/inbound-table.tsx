"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight, PenLine, Trash2, Printer, FileSpreadsheet, FileCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

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
  isOffice: boolean
  rows: InboundTableRow[]
  loading?: boolean
  /** 비본사용: 단순 { date, vendor, item, qty, amount } */
  storeRows?: { date: string; vendor: string; item: string; qty: number; amount: number; vatAmount: number }[]
  onEdit?: (row: InboundTableRow) => void
  onDelete?: (row: InboundTableRow) => void
  onInvoiceReceivedToggle?: (row: InboundTableRow) => void
  onPrint?: (row: InboundTableRow) => void
  onExcel?: (row: InboundTableRow) => void
  updatingInvoiceId?: number | null
}

type OfficeSortKey = "poDate" | "inboundDate" | "vendor" | "item" | "qty" | "amount" | "vat" | "total" | "poInvoice"

export function InboundTable({
  isOffice,
  rows,
  loading = false,
  storeRows = [],
  onEdit,
  onDelete,
  onInvoiceReceivedToggle,
  onPrint,
  onExcel,
  updatingInvoiceId = null,
}: InboundTableProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [sortKey, setSortKey] = useState<OfficeSortKey>("inboundDate")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

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
          diff = compareString(`${a.poNo || ""} / ${a.invoiceNo || ""}`, `${b.poNo || ""} / ${b.invoiceNo || ""}`)
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

  if (!isOffice) {
    return (
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#1E293B] text-white">
              <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("stockColDate")}</th>
              <th className="px-3 py-2.5 text-center font-semibold">{t("inVendor")}</th>
              <th className="px-3 py-2.5 text-center font-semibold">{t("outColItem")}</th>
              <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("outColQty")}</th>
              <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{supplyLabel}</th>
              <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{vatLabel}</th>
              <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{totalLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center">{t("loading")}</td>
              </tr>
            ) : storeRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-muted-foreground">{t("inNoData")}</td>
              </tr>
            ) : (
              storeRows.map((r, idx) => (
                <tr key={idx} className="hover:bg-primary/5 transition-colors">
                  <td className="px-3 py-2.5 text-center text-card-foreground whitespace-nowrap">{r.date}</td>
                  <td className="px-3 py-2.5 text-center text-card-foreground">{r.vendor}</td>
                  <td className="px-3 py-2.5 text-center text-card-foreground">{r.item}</td>
                  <td className="px-3 py-2.5 text-center text-card-foreground font-medium tabular-nums">{r.qty.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-primary tabular-nums">{(r.amount || 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right text-card-foreground tabular-nums">{(r.vatAmount || 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right text-card-foreground tabular-nums">{((r.amount || 0) + (r.vatAmount || 0)).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    )
  }

  const colCount = onEdit || onDelete || onInvoiceReceivedToggle || onPrint || onExcel ? 10 : 9

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[#1E293B] text-white">
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
            {(onEdit || onDelete || onInvoiceReceivedToggle || onPrint || onExcel) && <th className="px-2 py-2.5 text-center font-semibold min-w-[10rem] whitespace-nowrap">{t("actions")}</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {loading ? (
            <tr>
              <td colSpan={colCount} className="py-12 text-center">{t("loading")}</td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="py-12 text-center text-muted-foreground">{t("inNoData")}</td>
            </tr>
          ) : (
            sortedOfficeRows.map((row) => (
              <TableRow
                key={row.id}
                row={row}
                colCount={colCount}
                isExpanded={expandedRows.has(row.id)}
                onToggleExpand={() => toggleExpand(row.id)}
                onEdit={onEdit}
                onDelete={onDelete}
                onInvoiceReceivedToggle={onInvoiceReceivedToggle}
                onPrint={onPrint}
                onExcel={onExcel}
                updatingInvoiceId={updatingInvoiceId}
                t={t}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function TableRow({
  row,
  colCount,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onInvoiceReceivedToggle,
  onPrint,
  onExcel,
  updatingInvoiceId,
  t,
}: {
  row: InboundTableRow
  colCount: number
  isExpanded: boolean
  onToggleExpand: () => void
  onEdit?: (row: InboundTableRow) => void
  onDelete?: (row: InboundTableRow) => void
  onInvoiceReceivedToggle?: (row: InboundTableRow) => void
  onPrint?: (row: InboundTableRow) => void
  onExcel?: (row: InboundTableRow) => void
  updatingInvoiceId?: number | null
  t: (k: string) => string
}) {
  const hasDetails = row.items.length > 1
  const canEdit = row.inboundBatchId != null && onEdit
  const canDelete = row.inboundBatchId != null && onDelete
  const canInvoiceToggle = row.inboundBatchId != null && onInvoiceReceivedToggle
  const canPrint = row.inboundBatchId != null && onPrint
  const canExcel = row.inboundBatchId != null && onExcel
  const supplyLabel = t("salesSupplyAmount") || t("posSystemSubtotal") || "Supply"
  const vatLabel = t("posVatLabel") || "VAT"
  const totalLabel = t("inv_total") || t("total") || "Total"

  return (
    <>
      <tr className={cn("transition-colors hover:bg-primary/5")}>
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
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            {!hasDetails && <span className="inline-block w-[18px]" />}
            <span className="truncate max-w-[400px]" title={row.itemsSummary}>
              {row.itemsSummary}
            </span>
          </div>
        </td>
        <td className="px-3 py-2.5 text-center text-card-foreground font-medium tabular-nums">{row.totalQty.toLocaleString()}</td>
        <td className="px-3 py-2.5 text-right font-bold text-primary tabular-nums">
          {row.totalAmt.toLocaleString()}
        </td>
        <td className="px-3 py-2.5 text-right text-card-foreground tabular-nums">
          {row.totalVat.toLocaleString()}
        </td>
        <td className="px-3 py-2.5 text-right text-card-foreground tabular-nums">
          {(row.totalAmt + row.totalVat).toLocaleString()}
        </td>
        <td className="px-2 py-2.5 text-center text-muted-foreground text-xs">
          {row.invoiceNo ? (
            <span className="text-card-foreground" title={row.invoiceNo}>{row.invoiceNo}</span>
          ) : (
            "—"
          )}
        </td>
        {(canEdit || canDelete || canInvoiceToggle || canPrint || canExcel) && (
          <td className="px-2 py-2.5 min-w-[10rem]">
            <div className="flex items-center justify-center gap-1 flex-nowrap">
              {canInvoiceToggle && (
                <button
                  type="button"
                  onClick={() => onInvoiceReceivedToggle(row)}
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
                  onClick={() => onEdit(row)}
                  className="rounded p-1.5 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  title={t("edit")}
                >
                  <PenLine className="h-3.5 w-3.5" />
                </button>
              )}
              {canPrint && (
                <button
                  type="button"
                  onClick={() => onPrint(row)}
                  className="rounded p-1.5 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  title={t("purchaseOrderPrint")}
                >
                  <Printer className="h-3.5 w-3.5" />
                </button>
              )}
              {canExcel && (
                <button
                  type="button"
                  onClick={() => onExcel(row)}
                  className="rounded p-1.5 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  title={t("purchaseOrderExcel")}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(row)}
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
