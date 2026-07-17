"use client"

import * as React from "react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { LogisticsEmptyState } from "@/components/erp/logistics-ui"
import { ADMIN_NUMERIC_CN, ADMIN_TABLE_SCROLL_PANEL_CN } from "@/lib/admin-ui-standards"
import { formatErpNum } from "@/lib/utils"
import { BarChart3 } from "lucide-react"

type VendorSummaryRow = { vendor: string; qty: number; amount: number }
type ItemSummaryRow = { code: string; name: string; spec: string; qty: number; amount: number }

type InboundSummaryTablesProps = {
  vendorRows: VendorSummaryRow[]
  itemRows: ItemSummaryRow[]
  vendorTotals: { qty: number; amount: number }
  itemTotals: { qty: number; amount: number }
  vendorSortBy: "qty" | "amount"
  vendorSortDir: "asc" | "desc"
  itemSortBy: "qty" | "amount"
  itemSortDir: "asc" | "desc"
  onToggleVendorSort: (field: "qty" | "amount") => void
  onToggleItemSort: (field: "qty" | "amount") => void
  formatLineName: (name: string) => string
}

function sortMark(active: boolean, dir: "asc" | "desc") {
  if (!active) return ""
  return dir === "desc" ? " ▼" : " ▲"
}

export function InboundSummaryTables({
  vendorRows,
  itemRows,
  vendorTotals,
  itemTotals,
  vendorSortBy,
  vendorSortDir,
  itemSortBy,
  itemSortDir,
  onToggleVendorSort,
  onToggleItemSort,
  formatLineName,
}: InboundSummaryTablesProps) {
  const t = useT(useLang().lang)

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <SummaryCard title={t("inSummaryByVendor")}>
        <SummaryTable
          empty={vendorRows.length === 0}
          emptyLabel={t("inNoData")}
          headers={[
            { key: "vendor", label: t("vendor"), align: "left" },
            {
              key: "qty",
              label: t("outColQty"),
              align: "right",
              sortable: true,
              sortMark: sortMark(vendorSortBy === "qty", vendorSortDir),
              onSort: () => onToggleVendorSort("qty"),
            },
            {
              key: "amount",
              label: t("inColAmount"),
              align: "right",
              sortable: true,
              sortMark: sortMark(vendorSortBy === "amount", vendorSortDir),
              onSort: () => onToggleVendorSort("amount"),
            },
          ]}
          rows={vendorRows.map((row) => ({
            key: row.vendor,
            cells: [
              row.vendor,
              row.qty.toLocaleString(),
              formatErpNum(row.amount),
            ],
          }))}
          totalLabel={t("inv_total")}
          totalCells={[vendorTotals.qty.toLocaleString(), formatErpNum(vendorTotals.amount)]}
        />
      </SummaryCard>

      <SummaryCard title={t("inSummaryByItem")}>
        <SummaryTable
          empty={itemRows.length === 0}
          emptyLabel={t("inNoData")}
          headers={[
            { key: "item", label: t("inSummaryItemCol"), align: "left" },
            {
              key: "qty",
              label: t("outColQty"),
              align: "right",
              sortable: true,
              sortMark: sortMark(itemSortBy === "qty", itemSortDir),
              onSort: () => onToggleItemSort("qty"),
            },
            {
              key: "amount",
              label: t("inColAmount"),
              align: "right",
              sortable: true,
              sortMark: sortMark(itemSortBy === "amount", itemSortDir),
              onSort: () => onToggleItemSort("amount"),
            },
          ]}
          rows={itemRows.map((row) => ({
            key: `${row.code}-${row.name}-${row.spec}`,
            cells: [
              `${row.code ? `[${row.code}] ` : ""}${formatLineName(row.name)}${row.spec ? ` (${row.spec})` : ""}`,
              row.qty.toLocaleString(),
              formatErpNum(row.amount),
            ],
          }))}
          totalLabel={t("inv_total")}
          totalCells={[itemTotals.qty.toLocaleString(), formatErpNum(itemTotals.amount)]}
        />
      </SummaryCard>
    </div>
  )
}

function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="border-b px-5 py-3">
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      {children}
    </div>
  )
}

type HeaderCol = {
  key: string
  label: string
  align: "left" | "right"
  sortable?: boolean
  sortMark?: string
  onSort?: () => void
}

function SummaryTable({
  headers,
  rows,
  empty,
  emptyLabel,
  totalLabel,
  totalCells,
}: {
  headers: HeaderCol[]
  rows: { key: string; cells: string[] }[]
  empty: boolean
  emptyLabel: string
  totalLabel: string
  totalCells: string[]
}) {
  return (
    <div className={ADMIN_TABLE_SCROLL_PANEL_CN}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
          <tr className="border-b">
            {headers.map((h) => (
              <th
                key={h.key}
                className={`px-4 py-2.5 text-[11px] font-bold text-muted-foreground ${
                  h.align === "right" ? "text-right" : "text-left"
                }`}
              >
                {h.sortable ? (
                  <button
                    type="button"
                    className="font-bold hover:text-primary"
                    onClick={h.onSort}
                  >
                    {h.label}
                    {h.sortMark}
                  </button>
                ) : (
                  h.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {empty ? (
            <tr>
              <td colSpan={headers.length} className="p-0">
                <LogisticsEmptyState
                  icon={BarChart3}
                  title={emptyLabel}
                  className="border-0 bg-transparent py-10"
                />
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.key} className="border-b last:border-b-0 hover:bg-muted/20">
                <td className="px-4 py-2.5">{row.cells[0]}</td>
                <td className={`px-4 py-2.5 text-right ${ADMIN_NUMERIC_CN}`}>{row.cells[1]}</td>
                <td className={`px-4 py-2.5 text-right ${ADMIN_NUMERIC_CN}`}>{row.cells[2]}</td>
              </tr>
            ))
          )}
          {!empty && (
            <tr className="sticky bottom-0 border-t-2 bg-muted/90">
              <td className="px-4 py-2.5 font-semibold">{totalLabel}</td>
              <td className={`px-4 py-2.5 text-right font-semibold ${ADMIN_NUMERIC_CN}`}>
                {totalCells[0]}
              </td>
              <td className={`px-4 py-2.5 text-right font-semibold ${ADMIN_NUMERIC_CN}`}>
                {totalCells[1]}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
