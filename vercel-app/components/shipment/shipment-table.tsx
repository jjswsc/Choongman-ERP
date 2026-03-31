"use client"

import { useState, useMemo } from "react"
import { ChevronDown, ChevronRight, Image as ImageIcon, MessageSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

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
  items: { name: string; code?: string; spec: string; qty: number; amount: number; originalOrderQty?: number; qtyStages?: number[]; outboundLocation?: string; deliveryDate?: string; isUnreceived?: boolean }[]
  itemsSummary: string
  totalQty: number
  totalAmt: number
  receiveImageUrl?: string
  receiveImageUrls?: string[]
}

interface ShipmentTableProps {
  /** 본사: 출고 그룹 테이블 / 비본사: 사용 내역 테이블 */
  isOffice: boolean
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
  storeTargets = [],
  onForceReceived,
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
    if (s.includes("배송완료") || s.includes("Delivered") || s.includes("수령완료") || s.includes("수령")) return "statusDelivered"
    return null
  }

  /* 매장: 출고 행이 있으면 출고 테이블(인보이스 인쇄) 표시, 없으면 사용 내역 테이블 표시 */
  if (!isOffice && rows.length === 0) {
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
            {row.orderRowId && row.type === "Outbound" ? (
              <button
                type="button"
                onClick={() => onPhotoClick?.(row.orderRowId!)}
                className="inline-flex items-center justify-center w-9 h-9 rounded border border-border hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary"
                title={t("outPhotoView")}
              >
                <ImageIcon className="h-4 w-4 text-primary" aria-hidden />
              </button>
            ) : (
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            )}
          </div>
        </td>
        <td className="px-3 py-2.5 text-center text-card-foreground whitespace-nowrap font-medium">
          <div className="flex flex-col items-center gap-1">
            <span>{row.target}</span>
            {storeTargetsSet.size > 0 && (
              <span
                className={cn(
                  "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
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
                  className="mt-1 inline-flex items-center rounded border border-primary bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/20"
                >
                  {t("outForceReceived")}
                </button>
              )}
          </div>
        </td>
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
                    <th
                      className="px-4 py-2 text-center font-semibold text-card-foreground cursor-pointer hover:bg-muted/70 select-none"
                      onClick={toggleCodeSort}
                      title={t("outColCode") || "코드 (클릭 시 정렬)"}
                    >
                      {t("outColCode") || "코드"}
                      {codeSort === "asc" && " ↑"}
                      {codeSort === "desc" && " ↓"}
                    </th>
                    <th className="px-4 py-2 text-center font-semibold text-card-foreground">{t("outColItem")}</th>
                    <th className="px-4 py-2 text-center font-semibold text-card-foreground w-20">{t("outColStatus") || "상태"}</th>
                    <th className="px-4 py-2 text-center font-semibold text-card-foreground">{t("spec")}</th>
                    <th className="px-4 py-2 text-center font-semibold text-card-foreground">{t("outWhWarehouseCol") || "출고지"}</th>
                    <th className="px-4 py-2 text-center font-semibold text-card-foreground">{t("orderColDeliveryDate") || "배송일자"}</th>
                    <th className="px-4 py-2 text-center font-semibold text-card-foreground">{t("outColQty")}</th>
                    <th className="px-4 py-2 text-center font-semibold text-card-foreground">{t("inColAmount")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedItems.map((d, i) => (
                    <tr key={i} className={cn("hover:bg-primary/5 transition-colors", d.isUnreceived && "bg-red-50 dark:bg-red-950/20")}>
                      <td className="px-4 py-2 text-center text-muted-foreground font-mono text-[11px]">{d.code || "-"}</td>
                      <td className="px-4 py-2 text-center text-card-foreground">{d.name}</td>
                      <td className="px-4 py-2 text-center">
                        {d.isUnreceived ? (
                          <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold", unrecvBadgeStyle)}>
                            {t("outItemUnreceived") || "미수령"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center text-muted-foreground">{d.spec}</td>
                      <td className="px-4 py-2 text-center text-muted-foreground">{d.outboundLocation || "-"}</td>
                      <td className="px-4 py-2 text-center text-muted-foreground whitespace-nowrap">{d.deliveryDate || "-"}</td>
                      <td className="px-4 py-2 text-center font-medium tabular-nums">
                        {d.qtyStages && d.qtyStages.length >= 2 ? (
                          <span className="text-card-foreground">
                            {d.qtyStages.map((stage, i) => (
                              <span key={i}>
                                {i > 0 && <span className="mx-1 text-muted-foreground">→</span>}
                                <span className={i < d.qtyStages!.length - 1 ? "text-destructive line-through" : ""}>
                                  {stage.toLocaleString()}
                                </span>
                              </span>
                            ))}
                          </span>
                        ) : d.originalOrderQty != null && d.originalOrderQty !== d.qty ? (
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
