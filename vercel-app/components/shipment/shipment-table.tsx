"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, MessageSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

type StatusBadgeKey = "outTypeOrder" | "statusPartialDelivered" | "statusInTransit" | "statusDelivered" | "outTypeForce"

const statusStyles: Record<StatusBadgeKey, string> = {
  outTypeOrder: "bg-success text-success-foreground",
  statusPartialDelivered: "bg-warning text-warning-foreground",
  statusInTransit: "bg-success text-success-foreground",
  statusDelivered: "bg-info text-info-foreground",
  outTypeForce: "bg-warning/80 text-warning-foreground",
}

export interface ShipmentTableRow {
  id: string
  orderDate: string
  deliveryDate: string
  invoiceNo: string
  target: string
  type: string
  deliveryStatus?: string
  items: { name: string; spec: string; qty: number; amount: number }[]
  itemsSummary: string
  totalQty: number
  totalAmt: number
  receiveImageUrl?: string
}

interface ShipmentTableProps {
  /** 본사: 출고 그룹 테이블 / 비본사: 사용 내역 테이블 */
  isOffice: boolean
  rows: ShipmentTableRow[]
  loading?: boolean
  selectedIndices: Set<number>
  onToggleSelect: (idx: number) => void
  onToggleSelectAll: () => void
  onPhotoClick?: (url: string) => void
  /** 비본사용: 단순 { date, item, qty, amount } */
  usageRows?: { date: string; item: string; qty: number; amount: number }[]
}

export function ShipmentTable({
  isOffice,
  rows,
  loading = false,
  selectedIndices,
  onToggleSelect,
  onToggleSelectAll,
  onPhotoClick,
  usageRows = [],
}: ShipmentTableProps) {
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

  const getStatusBadges = (type: string, deliveryStatus?: string): StatusBadgeKey[] => {
    const badges: StatusBadgeKey[] = []
    if (type === "Force" || type === "ForceOutbound") {
      badges.push("outTypeForce")
    } else {
      badges.push("outTypeOrder")
      if (deliveryStatus) {
        const s = String(deliveryStatus)
        if (s.includes("일부") || s.includes("Partial")) badges.push("statusPartialDelivered")
        else if (s.includes("배송중") || s.includes("Transit")) badges.push("statusInTransit")
        else if (s.includes("배송완료") || s.includes("Delivered")) badges.push("statusDelivered")
      }
    }
    return badges
  }

  if (!isOffice) {
    return (
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-sidebar text-white">
              <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("stockColDate")}</th>
              <th className="px-3 py-2.5 text-center font-semibold">{t("outColItem")}</th>
              <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("outColQty")}</th>
              <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("inColAmount")}</th>
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
                <tr key={idx} className="hover:bg-primary/5 transition-colors">
                  <td className="px-3 py-2.5 text-card-foreground whitespace-nowrap">{u.date}</td>
                  <td className="px-3 py-2.5 text-card-foreground">{u.item}</td>
                  <td className="px-3 py-2.5 text-right text-card-foreground font-medium tabular-nums">{u.qty.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-primary tabular-nums">{(u.amount || 0).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    )
  }

  const colCount = 10

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-700 bg-black">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-800 text-white">
            <th className="w-10 px-3 py-2.5 text-center">
              <input
                type="checkbox"
                checked={rows.length > 0 && selectedIndices.size === rows.length}
                onChange={onToggleSelectAll}
                className="h-3.5 w-3.5 rounded border-gray-500 accent-primary cursor-pointer"
              />
            </th>
            <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("orderColDate")}</th>
            <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("orderColDeliveryDate")}</th>
            <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("outColInvNo")}</th>
            <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("outFilterType")}</th>
            <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("outColPhoto")}</th>
            <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("outColStore")}</th>
            <th className="px-3 py-2.5 text-center font-semibold">{t("outColItem")}</th>
            <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("outColQty")}</th>
            <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("inColAmount")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700">
          {loading ? (
            <tr className="bg-black">
              <td colSpan={colCount} className="py-12 text-center text-white">{t("loading")}</td>
            </tr>
          ) : rows.length === 0 ? (
            <tr className="bg-black">
              <td colSpan={colCount} className="py-12 text-center text-gray-300">{t("outNoData")}</td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <TableRow
                key={row.id}
                row={row}
                idx={idx}
                isExpanded={expandedRows.has(idx)}
                isSelected={selectedIndices.has(idx)}
                onToggleExpand={() => toggleExpand(idx)}
                onToggleSelect={() => onToggleSelect(idx)}
                onPhotoClick={onPhotoClick}
                getStatusBadges={getStatusBadges}
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
  isSelected,
  onToggleExpand,
  onToggleSelect,
  onPhotoClick,
  getStatusBadges,
  t,
}: {
  row: ShipmentTableRow
  idx: number
  isExpanded: boolean
  isSelected: boolean
  onToggleExpand: () => void
  onToggleSelect: () => void
  onPhotoClick?: (url: string) => void
  getStatusBadges: (type: string, deliveryStatus?: string) => StatusBadgeKey[]
  t: (k: string) => string
}) {
  const hasDetails = row.items.length > 1
  const badges = getStatusBadges(row.type, row.deliveryStatus)

  return (
    <>
      <tr
        className={cn(
          "transition-colors bg-black hover:bg-gray-800",
          isSelected && "bg-gray-800"
        )}
      >
        <td className="px-3 py-2.5 text-center">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="h-3.5 w-3.5 rounded border-gray-500 accent-primary cursor-pointer"
          />
        </td>
        <td className="px-3 py-2.5 text-white whitespace-nowrap">{row.orderDate}</td>
        <td className="px-3 py-2.5 text-white whitespace-nowrap">{row.deliveryDate || "-"}</td>
        <td className="px-3 py-2.5 text-white whitespace-nowrap font-mono text-[11px]">{row.invoiceNo}</td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1 flex-wrap">
            {badges.map((key, i) => (
              <span
                key={i}
                className={cn(
                  "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap",
                  statusStyles[key]
                )}
              >
                {t(key)}
              </span>
            ))}
          </div>
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            {row.receiveImageUrl ? (
              <button
                type="button"
                onClick={() => onPhotoClick?.(row.receiveImageUrl!)}
                className="inline-block w-9 h-9 rounded overflow-hidden border border-border hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <img src={row.receiveImageUrl} alt={t("outPhotoView")} className="w-full h-full object-cover" />
              </button>
            ) : (
              <MessageSquare className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
            )}
          </div>
        </td>
        <td className="px-3 py-2.5 text-white whitespace-nowrap font-medium">{row.target}</td>
        <td className="px-3 py-2.5 text-white">
          <div className="flex items-center gap-1.5">
            {hasDetails && (
              <button
                type="button"
                onClick={onToggleExpand}
                className="flex-shrink-0 rounded p-0.5 hover:bg-gray-600 transition-colors text-yellow-400"
              >
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            {!hasDetails && <span className="inline-block w-[18px]" />}
            <span className="truncate max-w-[400px] text-white" title={row.itemsSummary}>
              {row.itemsSummary}
            </span>
          </div>
        </td>
        <td className="px-3 py-2.5 text-right text-white font-medium tabular-nums">{row.totalQty.toLocaleString()}</td>
        <td className="px-3 py-2.5 text-right font-bold text-yellow-400 tabular-nums">
          {row.totalAmt.toLocaleString()}
        </td>
      </tr>
      {isExpanded && hasDetails && (
        <tr className="bg-black">
          <td colSpan={10} className="px-0 py-0">
            <div className="mx-6 my-2 overflow-hidden rounded border border-gray-600 bg-gray-900">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-700 text-white">
                    <th className="px-4 py-2 text-center font-semibold">{t("outColItem")}</th>
                    <th className="px-4 py-2 text-center font-semibold">{t("spec")}</th>
                    <th className="px-4 py-2 text-center font-semibold">{t("outColQty")}</th>
                    <th className="px-4 py-2 text-center font-semibold">{t("inColAmount")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {row.items.map((d, i) => (
                    <tr key={i} className="bg-gray-900 hover:bg-gray-800 transition-colors">
                      <td className="px-4 py-2 text-center text-white">{d.name}</td>
                      <td className="px-4 py-2 text-center text-gray-300">{d.spec}</td>
                      <td className="px-4 py-2 text-center text-white font-medium tabular-nums">{d.qty.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-white tabular-nums">{d.amount.toLocaleString()}</td>
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
