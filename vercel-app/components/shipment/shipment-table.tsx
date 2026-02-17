"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, MessageSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

type StatusBadgeKey = "outTypeOrder" | "statusPartialDelivered" | "statusInTransit" | "statusDelivered" | "outTypeForce"

const statusStyles: Record<StatusBadgeKey, string> = {
  outTypeOrder: "bg-[#22C55E] text-white",
  statusPartialDelivered: "bg-[#F59E0B] text-white",
  statusInTransit: "bg-[#22C55E] text-white",
  statusDelivered: "bg-[#22C55E] text-white",
  outTypeForce: "bg-[#F59E0B] text-white",
}

export interface ShipmentTableRow {
  id: string
  orderDate: string
  deliveryDate: string
  invoiceNo: string
  target: string
  type: string
  deliveryStatus?: string
  items: { name: string; spec: string; qty: number; amount: number; originalOrderQty?: number }[]
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

  const getOrderTypeBadge = (type: string): StatusBadgeKey | null => {
    if (type === "Force" || type === "ForceOutbound") return "outTypeForce"
    return "outTypeOrder"
  }
  const getOutboundTypeBadge = (deliveryStatus?: string): StatusBadgeKey | null => {
    if (!deliveryStatus) return null
    const s = String(deliveryStatus)
    if (s.includes("일부") || s.includes("Partial")) return "statusPartialDelivered"
    if (s.includes("배송중") || s.includes("Transit")) return "statusInTransit"
    if (s.includes("배송완료") || s.includes("Delivered")) return "statusDelivered"
    return null
  }

  if (!isOffice) {
    return (
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#1E293B] text-white">
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
                  <td className="px-3 py-2.5 text-center text-card-foreground whitespace-nowrap">{u.date}</td>
                  <td className="px-3 py-2.5 text-center text-card-foreground">{u.item}</td>
                  <td className="px-3 py-2.5 text-center text-card-foreground font-medium tabular-nums">{u.qty.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-primary tabular-nums">{(u.amount || 0).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    )
  }

  const colCount = 11

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[#1E293B] text-white">
            <th className="w-10 px-3 py-2.5 text-center">
              <input
                type="checkbox"
                checked={rows.length > 0 && selectedIndices.size === rows.length}
                onChange={onToggleSelectAll}
                className="h-3.5 w-3.5 rounded border-[#1E293B] accent-[#3B82F6] cursor-pointer"
              />
            </th>
            <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("orderColDate")}</th>
            <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("orderColDeliveryDate")}</th>
            <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("outColInvNo")}</th>
            <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("outColOrderType")}</th>
            <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("outColOutboundType")}</th>
            <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("outColPhoto")}</th>
            <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{t("outColStore")}</th>
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
              <td colSpan={colCount} className="py-12 text-center text-muted-foreground">{t("outNoData")}</td>
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
                getOrderTypeBadge={getOrderTypeBadge}
                getOutboundTypeBadge={getOutboundTypeBadge}
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
  getOrderTypeBadge,
  getOutboundTypeBadge,
  t,
}: {
  row: ShipmentTableRow
  idx: number
  isExpanded: boolean
  isSelected: boolean
  onToggleExpand: () => void
  onToggleSelect: () => void
  onPhotoClick?: (url: string) => void
  getOrderTypeBadge: (type: string) => StatusBadgeKey | null
  getOutboundTypeBadge: (deliveryStatus?: string) => StatusBadgeKey | null
  t: (k: string) => string
}) {
  const hasDetails = row.items.length > 1
  const orderBadge = getOrderTypeBadge(row.type)
  const outboundBadge = getOutboundTypeBadge(row.deliveryStatus)

  return (
    <>
      <tr
        className={cn(
          "transition-colors hover:bg-primary/5",
          isSelected && "bg-primary/5"
        )}
      >
        <td className="px-3 py-2.5 text-center">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="h-3.5 w-3.5 rounded border-gray-300 accent-[#3B82F6] cursor-pointer"
          />
        </td>
        <td className="px-3 py-2.5 text-center text-card-foreground whitespace-nowrap">{row.orderDate}</td>
        <td className="px-3 py-2.5 text-center text-card-foreground whitespace-nowrap">{row.deliveryDate || "-"}</td>
        <td className="px-3 py-2.5 text-center text-card-foreground whitespace-nowrap font-mono text-[11px]">{row.invoiceNo}</td>
        <td className="px-3 py-2.5 text-center">
          {orderBadge ? (
            <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap", statusStyles[orderBadge])}>
              {t(orderBadge)}
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-center">
          {outboundBadge ? (
            <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap", statusStyles[outboundBadge])}>
              {t(outboundBadge)}
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-center">
          <div className="flex items-center justify-center gap-1.5">
            {row.receiveImageUrl ? (
              <button
                type="button"
                onClick={() => onPhotoClick?.(row.receiveImageUrl!)}
                className="inline-block w-9 h-9 rounded overflow-hidden border border-border hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <img src={row.receiveImageUrl} alt={t("outPhotoView")} className="w-full h-full object-cover" />
              </button>
            ) : (
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            )}
          </div>
        </td>
        <td className="px-3 py-2.5 text-center text-card-foreground whitespace-nowrap font-medium">{row.target}</td>
        <td className="px-3 py-2.5 text-white">
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
            <span className="truncate max-w-[400px] text-card-foreground" title={row.itemsSummary}>
              {row.itemsSummary}
            </span>
          </div>
        </td>
        <td className="px-3 py-2.5 text-center text-card-foreground font-medium tabular-nums">{row.totalQty.toLocaleString()}</td>
        <td className="px-3 py-2.5 text-right font-bold text-primary tabular-nums">
          {row.totalAmt.toLocaleString()}
        </td>
      </tr>
      {isExpanded && hasDetails && (
        <tr>
          <td colSpan={11} className="px-0 py-0">
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
                      <td className="px-4 py-2 text-center font-medium tabular-nums">
                        {d.originalOrderQty != null && d.originalOrderQty !== d.qty ? (
                          <>
                            <span className="text-destructive line-through">{d.originalOrderQty.toLocaleString()}</span>
                            <span className="mx-1 text-muted-foreground">→</span>
                            <span className="text-card-foreground">{d.qty.toLocaleString()}</span>
                          </>
                        ) : (
                          <span className="text-card-foreground">{d.qty.toLocaleString()}</span>
                        )}
                      </td>
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
