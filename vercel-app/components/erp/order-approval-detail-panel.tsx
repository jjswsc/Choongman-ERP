"use client"

import * as React from "react"
import { Package, Truck, Pause, XCircle, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"

export interface OrderItem {
  name: string
  spec: string
  unitPrice: number
  qty: number
  originalQty: number
  hqStock: number
  storeStock: number
  hqSafeQty: number
  storeSafeQty: number
  total: number
  checked: boolean
  code?: string
  outboundLocation?: string
}

export type OrderStatus = "Pending" | "Approved" | "Rejected" | "Hold"

export interface Order {
  id: string
  orderId: number
  orderDate: string
  deliveryDate: string
  store: string
  userName?: string
  summary: string
  totalAmount: number
  status: OrderStatus
  items: OrderItem[]
  rejectReason?: string
}

interface OrderApprovalDetailPanelProps {
  order: Order
  isExpanded: boolean
  displayItems: OrderItem[]
  detailSortByCode: "asc" | "desc" | null
  isManager: boolean
  submittingId: string | null
  deliveryDatesByOutboundByOrder: Record<string, Record<string, string>>
  rejectReasonByOrderId: Record<string, string>
  onCycleCodeSort: () => void
  onUpdateOrderItem: (orderId: string, itemRef: { code: string; name: string }, updates: Partial<Pick<OrderItem, "checked" | "qty">>) => void
  onSetDeliveryDatesByOutbound: React.Dispatch<React.SetStateAction<Record<string, Record<string, string>>>>
  onSetRejectReason: React.Dispatch<React.SetStateAction<Record<string, string>>>
  onHandleDecision: (orderId: number, decision: "Approved" | "Rejected" | "Hold", order: Order) => void | Promise<void>
}

export function OrderApprovalDetailPanel({
  order,
  isExpanded,
  displayItems,
  detailSortByCode,
  isManager,
  submittingId,
  deliveryDatesByOutboundByOrder,
  rejectReasonByOrderId,
  onCycleCodeSort,
  onUpdateOrderItem,
  onSetDeliveryDatesByOutbound,
  onSetRejectReason,
  onHandleDecision,
}: OrderApprovalDetailPanelProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const canEdit = order.status === "Pending" && !isManager

  const byOutbound = React.useMemo(() => {
    const m = new Map<string, OrderItem[]>()
    for (const it of displayItems) {
      const loc = it.outboundLocation || "(미지정)"
      if (!m.has(loc)) m.set(loc, [])
      m.get(loc)!.push(it)
    }
    return Array.from(m.keys()).sort()
  }, [displayItems])

  return (
    <div
      className={cn(
        "grid transition-all duration-300 ease-in-out overflow-hidden",
        isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="border-b">
          <div className="ml-[58px] mr-4">
            <div className="flex items-center gap-2 pb-3 pt-1">
              <Package className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-bold text-foreground">
                {t("orderDetailTitle")}
              </span>
              <span className="ml-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary">
                {order.items.length}{t("orderDetailCount")}
              </span>
            </div>

            {order.items.length > 0 && (
              <div className="overflow-x-auto rounded-lg border bg-card mb-4">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-3 py-2.5 text-[10px] font-bold text-muted-foreground w-10 text-center">V</th>
                      <th
                        className="px-3 py-2.5 text-[10px] font-bold text-muted-foreground w-20 cursor-pointer hover:bg-muted/50 select-none"
                        onClick={(e) => { e.stopPropagation(); onCycleCodeSort() }}
                        title={t("orderColCode") || "코드 (클릭 시 정렬)"}
                      >
                        {t("orderColCode") || "코드"}
                        {detailSortByCode === "asc" && " ↑"}
                        {detailSortByCode === "desc" && " ↓"}
                      </th>
                      <th className="px-3 py-2.5 text-[10px] font-bold text-muted-foreground min-w-[120px]">
                        {t("orderItemName")}
                      </th>
                      <th className="px-3 py-2.5 text-[10px] font-bold text-muted-foreground w-36 min-w-[80px] whitespace-nowrap">
                        {t("orderItemSpec")}
                      </th>
                      <th className="px-3 py-2.5 text-[10px] font-bold text-muted-foreground w-20 text-right">
                        {t("orderItemUnitPrice")}
                      </th>
                      <th className="px-3 py-2.5 text-[10px] font-bold text-muted-foreground w-14 text-center">
                        {t("orderItemQty")}
                      </th>
                      <th className="px-3 py-2.5 text-[10px] font-bold text-muted-foreground w-20 text-right">
                        {t("orderStockHq")}
                      </th>
                      <th className="px-3 py-2.5 text-[10px] font-bold text-muted-foreground w-20 text-right">
                        {order.store} {t("orderItemStock")}
                      </th>
                      <th className="px-3 py-2.5 text-[10px] font-bold text-muted-foreground w-24 text-right">
                        {t("orderItemTotal")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayItems.map((item, idx) => (
                      <tr
                        key={idx}
                        className={cn(
                          "border-b last:border-b-0 transition-colors",
                          idx % 2 === 1 && "bg-muted/5",
                          !item.checked && canEdit && "opacity-60"
                        )}
                      >
                        <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={item.checked}
                            onCheckedChange={(v) =>
                              canEdit && onUpdateOrderItem(order.id, { code: item.code || "", name: item.name || "" }, { checked: !!v })
                            }
                            disabled={!canEdit}
                            className="h-3.5 w-3.5"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground w-20">
                          {item.code || "-"}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-medium min-w-[120px]">
                          <span className={item.qty !== item.originalQty ? "text-destructive" : "text-foreground"}>
                            {item.name}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs w-36 min-w-[80px] whitespace-nowrap">
                          <span className={item.qty !== item.originalQty ? "text-destructive" : "text-muted-foreground"}>
                            {item.spec || "-"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={cn(
                            "text-xs font-semibold tabular-nums",
                            item.qty !== item.originalQty ? "text-destructive" : "text-foreground"
                          )}>
                            {item.unitPrice > 0 ? item.unitPrice.toLocaleString() : "0"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          {canEdit ? (
                            <Input
                              type="number"
                              min={0}
                              className={cn(
                                "h-7 w-14 text-center text-xs tabular-nums",
                                item.qty !== item.originalQty && "text-destructive"
                              )}
                              value={item.qty}
                              onChange={(e) => {
                                const v = parseInt(e.target.value, 10)
                                onUpdateOrderItem(order.id, { code: item.code || "", name: item.name || "" }, { qty: isNaN(v) || v < 0 ? 0 : v })
                              }}
                            />
                          ) : (
                            <span className={cn(
                              "text-xs font-bold tabular-nums",
                              item.qty !== item.originalQty ? "text-destructive" : "text-foreground"
                            )}>
                              {item.qty}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span
                            className={cn(
                              "text-xs font-bold tabular-nums",
                              item.hqSafeQty > 0
                                ? item.hqStock >= item.hqSafeQty
                                  ? "text-primary"
                                  : "text-destructive"
                                : item.hqStock < 0
                                ? "text-destructive"
                                : "text-foreground"
                            )}
                          >
                            {item.hqStock === 0 ? "-" : item.hqStock.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span
                            className={cn(
                              "text-xs font-bold tabular-nums",
                              item.storeSafeQty > 0
                                ? item.storeStock >= item.storeSafeQty
                                  ? "text-primary"
                                  : "text-destructive"
                                : item.storeStock < 0
                                ? "text-destructive"
                                : "text-foreground"
                            )}
                          >
                            {item.storeStock === 0 ? "-" : item.storeStock.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={cn(
                            "text-xs font-bold tabular-nums",
                            item.qty !== item.originalQty ? "text-destructive" : "text-foreground"
                          )}>
                            {item.unitPrice * item.qty > 0
                              ? (item.unitPrice * item.qty).toLocaleString()
                              : "0"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="space-y-3 pb-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                {t("orderDeliveryDateByOutbound") || "출고지별 배송일"}
              </div>
              <div className="flex flex-wrap gap-3">
                {byOutbound.map((loc) => {
                  const dates = deliveryDatesByOutboundByOrder[order.id] || {}
                  const value = dates[loc] || ""
                  return (
                    <div key={loc} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                      <span className="text-xs font-medium shrink-0">{(t("outWhWarehouseCol") || "출고지")}: {loc}</span>
                      <Input
                        type="date"
                        className="h-8 w-36 text-xs"
                        placeholder={t("orderDeliveryDatePh")}
                        value={value}
                        onChange={(e) => {
                          const v = e.target.value
                          onSetDeliveryDatesByOutbound((prev) => ({
                            ...prev,
                            [order.id]: { ...(prev[order.id] || {}), [loc]: v },
                          }))
                        }}
                        readOnly={isManager}
                      />
                    </div>
                  )
                })}
              </div>
            </div>

            {!isManager && (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {order.status === "Pending" && (
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <span className="text-xs font-semibold text-muted-foreground">{t("reasonPh") || "사유"}</span>
                    <Input
                      type="text"
                      className="h-9 w-48 min-w-0 text-sm"
                      placeholder={t("orderRejectReasonPh") || "거절 사유 입력 (필수)"}
                      value={rejectReasonByOrderId[order.id] || ""}
                      onChange={(e) =>
                        onSetRejectReason((prev) => ({ ...prev, [order.id]: e.target.value }))
                      }
                    />
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-4 text-[11px] font-semibold"
                  disabled={submittingId !== null || order.status !== "Pending"}
                  onClick={(e) => { e.stopPropagation(); onHandleDecision(order.orderId, "Hold", order) }}
                >
                  <Pause className="mr-1.5 h-3.5 w-3.5" />
                  {t("orderBtnHold")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-4 text-[11px] font-bold text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                  disabled={submittingId !== null || order.status !== "Pending"}
                  onClick={(e) => { e.stopPropagation(); onHandleDecision(order.orderId, "Rejected", order) }}
                >
                  <XCircle className="mr-1.5 h-3.5 w-3.5" />
                  {t("orderBtnReject")}
                </Button>
                <Button
                  size="sm"
                  className="h-8 px-5 text-[11px] font-bold bg-success text-success-foreground hover:bg-success/90"
                  disabled={submittingId !== null || order.status !== "Pending"}
                  onClick={(e) => { e.stopPropagation(); onHandleDecision(order.orderId, "Approved", order) }}
                >
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  {t("orderBtnApprove")}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
