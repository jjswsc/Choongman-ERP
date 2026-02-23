"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, PenLine, Trash2, Printer, FileSpreadsheet, FileCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export interface InboundTableRow {
  id: string
  date: string
  vendor: string
  inboundBatchId?: number
  invoiceNo?: string
  invoiceReceived?: boolean
  items: { name: string; spec: string; qty: number; amount: number }[]
  itemsSummary: string
  totalQty: number
  totalAmt: number
}

interface InboundTableProps {
  isOffice: boolean
  rows: InboundTableRow[]
  loading?: boolean
  /** 비본사용: 단순 { date, vendor, item, qty, amount } */
  storeRows?: { date: string; vendor: string; item: string; qty: number; amount: number }[]
  onEdit?: (row: InboundTableRow) => void
  onDelete?: (row: InboundTableRow) => void
  onInvoiceReceivedToggle?: (row: InboundTableRow) => void
  onPrint?: (row: InboundTableRow) => void
  onExcel?: (row: InboundTableRow) => void
  updatingInvoiceId?: number | null
}

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
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  const toggleExpand = (idx: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

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
              <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("inColAmount")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-12 text-center">{t("loading")}</td>
              </tr>
            ) : storeRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-muted-foreground">{t("inNoData")}</td>
              </tr>
            ) : (
              storeRows.map((r, idx) => (
                <tr key={idx} className="hover:bg-primary/5 transition-colors">
                  <td className="px-3 py-2.5 text-center text-card-foreground whitespace-nowrap">{r.date}</td>
                  <td className="px-3 py-2.5 text-center text-card-foreground">{r.vendor}</td>
                  <td className="px-3 py-2.5 text-center text-card-foreground">{r.item}</td>
                  <td className="px-3 py-2.5 text-center text-card-foreground font-medium tabular-nums">{r.qty.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-primary tabular-nums">{(r.amount || 0).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    )
  }

  const colCount = onEdit || onDelete || onInvoiceReceivedToggle || onPrint || onExcel ? 7 : 5

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[#1E293B] text-white">
            <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("stockColDate")}</th>
            <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("inVendor")}</th>
            <th className="px-3 py-2.5 text-center font-semibold">{t("outColItem")}</th>
            <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("outColQty")}</th>
            <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("inColAmount")}</th>
            <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap min-w-[90px]">{t("poInvoiceNo") || "인보이스"}</th>
            {(onEdit || onDelete || onInvoiceReceivedToggle || onPrint || onExcel) && <th className="px-2 py-2.5 text-center font-semibold w-28">{t("actions") || "작업"}</th>}
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
            rows.map((row, idx) => (
              <TableRow
                key={row.id}
                row={row}
                idx={idx}
                colCount={colCount}
                isExpanded={expandedRows.has(idx)}
                onToggleExpand={() => toggleExpand(idx)}
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
  idx,
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
  idx: number
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

  return (
    <>
      <tr className={cn("transition-colors hover:bg-primary/5")}>
        <td className="px-3 py-2.5 text-center text-card-foreground whitespace-nowrap">{row.date}</td>
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
        <td className="px-2 py-2.5 text-center text-muted-foreground text-xs">
          {row.invoiceNo ? (
            <span className="text-card-foreground" title={row.invoiceNo}>{row.invoiceNo}</span>
          ) : (
            "—"
          )}
        </td>
        {(canEdit || canDelete || canInvoiceToggle || canPrint || canExcel) && (
          <td className="px-2 py-2.5">
            <div className="flex items-center justify-center gap-0.5 flex-wrap">
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
                  title={t("edit") || "수정"}
                >
                  <PenLine className="h-3.5 w-3.5" />
                </button>
              )}
              {canPrint && (
                <button
                  type="button"
                  onClick={() => onPrint(row)}
                  className="rounded p-1.5 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  title={t("purchaseOrderPrint") || t("printBtn") || "인쇄"}
                >
                  <Printer className="h-3.5 w-3.5" />
                </button>
              )}
              {canExcel && (
                <button
                  type="button"
                  onClick={() => onExcel(row)}
                  className="rounded p-1.5 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  title={t("purchaseOrderExcel") || "엑셀"}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(row)}
                  className="rounded p-1.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title={t("delete") || "삭제"}
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
                    <th className="px-4 py-2 text-center font-semibold text-card-foreground">{t("inColAmount")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {row.items.map((d, i) => (
                    <tr key={i} className="hover:bg-primary/5 transition-colors">
                      <td className="px-4 py-2 text-center text-card-foreground">{d.name}</td>
                      <td className="px-4 py-2 text-center text-muted-foreground">{d.spec}</td>
                      <td className="px-4 py-2 text-center text-card-foreground font-medium tabular-nums">{d.qty.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-card-foreground tabular-nums">{d.amount.toLocaleString()}</td>
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
