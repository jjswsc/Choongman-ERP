"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export interface InboundTableRow {
  id: string
  date: string
  vendor: string
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
}

export function InboundTable({
  isOffice,
  rows,
  loading = false,
  storeRows = [],
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
            <tr className="bg-sidebar text-white">
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
                  <td className="px-3 py-2.5 text-card-foreground whitespace-nowrap">{r.date}</td>
                  <td className="px-3 py-2.5 text-card-foreground">{r.vendor}</td>
                  <td className="px-3 py-2.5 text-card-foreground">{r.item}</td>
                  <td className="px-3 py-2.5 text-right text-card-foreground font-medium tabular-nums">{r.qty.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-primary tabular-nums">{(r.amount || 0).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    )
  }

  const colCount = 5

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-sidebar text-white">
            <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("stockColDate")}</th>
            <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("inVendor")}</th>
            <th className="px-3 py-2.5 text-center font-semibold">{t("outColItem")}</th>
            <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("outColQty")}</th>
            <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("inColAmount")}</th>
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
                isExpanded={expandedRows.has(idx)}
                onToggleExpand={() => toggleExpand(idx)}
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
  isExpanded,
  onToggleExpand,
  t,
}: {
  row: InboundTableRow
  idx: number
  isExpanded: boolean
  onToggleExpand: () => void
  t: (k: string) => string
}) {
  const hasDetails = row.items.length > 1

  return (
    <>
      <tr className={cn("transition-colors hover:bg-primary/5")}>
        <td className="px-3 py-2.5 text-card-foreground whitespace-nowrap">{row.date}</td>
        <td className="px-3 py-2.5 text-card-foreground whitespace-nowrap font-medium">{row.vendor}</td>
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
        <td className="px-3 py-2.5 text-right text-card-foreground font-medium tabular-nums">{row.totalQty.toLocaleString()}</td>
        <td className="px-3 py-2.5 text-right font-bold text-primary tabular-nums">
          {row.totalAmt.toLocaleString()}
        </td>
      </tr>
      {isExpanded && hasDetails && (
        <tr>
          <td colSpan={5} className="px-0 py-0">
            <div className="mx-6 my-2 overflow-hidden rounded border border-border">
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
