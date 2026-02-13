"use client"

import * as React from "react"
import {
  Search,
  CalendarIcon,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Pause,
  Package,
  Truck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getAdminOrders, getAppData, type AdminOrderItem } from "@/lib/api-client"

type OrderStatus = "Pending" | "Approved" | "Rejected" | "Hold"

interface OrderItem {
  name: string
  spec: string
  unitPrice: number
  qty: number
  stock: number
  total: number
  checked: boolean
  code?: string
}

interface Order {
  id: string
  orderId: number
  orderDate: string
  deliveryDate: string
  store: string
  summary: string
  totalAmount: number
  status: OrderStatus
  items: OrderItem[]
}

const statusConfig: Record<OrderStatus, { label: string; bg: string; text: string }> = {
  Pending: { label: "Pending", bg: "bg-warning/10", text: "text-warning" },
  Approved: { label: "Approved", bg: "bg-success/10", text: "text-success" },
  Rejected: { label: "Rejected", bg: "bg-destructive/10", text: "text-destructive" },
  Hold: { label: "Hold", bg: "bg-muted", text: "text-muted-foreground" },
}

function mapApiToOrder(api: AdminOrderItem, stockByCode: Record<string, number>): Order {
  const items: OrderItem[] = (api.items || []).map((it) => {
    const price = Number(it.price) || 0
    const qty = Number(it.qty) || 0
    const stock = it.code ? (stockByCode[it.code] ?? 0) : 0
    return {
      name: it.name || "-",
      spec: it.spec || "",
      unitPrice: price,
      qty,
      stock,
      total: price * qty,
      checked: true,
      code: it.code,
    }
  })
  const status = (api.status || "Pending") as OrderStatus
  return {
    id: String(api.orderId),
    orderId: api.orderId,
    orderDate: api.date,
    deliveryDate: api.deliveryDate || "-",
    store: api.store,
    summary: api.summary,
    totalAmount: api.total,
    status: status in statusConfig ? status : "Pending",
    items,
  }
}

export function OrderApproval() {
  const { lang } = useLang()
  const t = useT(lang)
  const [orders, setOrders] = React.useState<Order[]>([])
  const [stores, setStores] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(true)
  const [expandedId, setExpandedId] = React.useState<string | null>(null)
  const [checkedOrders, setCheckedOrders] = React.useState<Set<string>>(new Set())
  const [allChecked, setAllChecked] = React.useState(false)
  const [storeFilter, setStoreFilter] = React.useState("all")
  const [startDate, setStartDate] = React.useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().slice(0, 10)
  })
  const [endDate, setEndDate] = React.useState(() => {
    const d = new Date()
    return d.toISOString().slice(0, 10)
  })
  const [statusFilter, setStatusFilter] = React.useState("pending")
  const [searchTerm, setSearchTerm] = React.useState("")

  const fetchOrders = React.useCallback(async () => {
    setLoading(true)
    try {
      const { list, stores: s } = await getAdminOrders({
        startStr: startDate,
        endStr: endDate,
        store: storeFilter === "all" ? undefined : storeFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
      })
      setStores(s || [])

      const storesInList = [...new Set(list.map((o) => o.store).filter(Boolean))]
      const stockMap: Record<string, Record<string, number>> = {}
      await Promise.all(
        storesInList.map(async (store) => {
          const { stock } = await getAppData(store)
          stockMap[store] = stock || {}
        })
      )

      const mapped: Order[] = list.map((o) => {
        const stockByCode = stockMap[o.store] || {}
        return mapApiToOrder(o, stockByCode)
      })
      setOrders(mapped)
      setCheckedOrders(new Set(mapped.map((o) => o.id)))
      setAllChecked(mapped.length > 0)
    } catch {
      setOrders([])
      setStores([])
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, storeFilter, statusFilter])

  React.useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const toggleAll = () => {
    if (allChecked) {
      setCheckedOrders(new Set())
    } else {
      setCheckedOrders(new Set(orders.map((o) => o.id)))
    }
    setAllChecked(!allChecked)
  }

  const toggleOrder = (id: string) => {
    const next = new Set(checkedOrders)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setCheckedOrders(next)
    setAllChecked(next.size === orders.length)
  }

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  const filteredOrders = React.useMemo(() => {
    if (!searchTerm.trim()) return orders
    const q = searchTerm.toLowerCase()
    return orders.filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        o.store.toLowerCase().includes(q) ||
        o.summary.toLowerCase().includes(q)
    )
  }, [orders, searchTerm])

  return (
    <div className="flex flex-col gap-6">
      {/* Filter bar */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Package className="h-3.5 w-3.5 text-primary" />
              {t("orderFilterStore") || "매장"}
            </label>
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger className="h-9 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("orderFilterStoreAll") || "전체 매장"}</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
              {t("orderFilterPeriod") || "기간"}
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 w-40 text-xs"
              />
              <span className="text-xs font-medium text-muted-foreground">~</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 w-40 text-xs"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">
              {t("orderFilterStatus") || "상태"}
            </label>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{t("orderStatusPending") || "대기"}</SelectItem>
                  <SelectItem value="approved">{t("orderStatusApproved") || "승인"}</SelectItem>
                  <SelectItem value="rejected">{t("orderStatusRejected") || "거절"}</SelectItem>
                  <SelectItem value="hold">{t("orderStatusHold") || "보류"}</SelectItem>
                  <SelectItem value="all">{t("orderStatusAll") || "전체"}</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder={t("search") || "검색"}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 w-28 text-xs"
              />
            </div>
          </div>

          <Button size="sm" className="h-9 px-5 text-xs font-bold" onClick={fetchOrders}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {t("orderBtnSearch") || "조회"}
          </Button>
        </div>
      </div>

      {/* Order table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="grid grid-cols-[40px_36px_1fr_120px_100px_1fr_130px_100px] items-center gap-0 border-b bg-muted/40 px-4 py-3">
          <div className="flex items-center justify-center">
            <Checkbox checked={allChecked} onCheckedChange={toggleAll} className="h-4 w-4" />
          </div>
          <div />
          <span className="text-[11px] font-bold text-muted-foreground">
            {t("orderColDate") || "주문 일자"}
          </span>
          <span className="text-[11px] font-bold text-muted-foreground">
            {t("orderColDeliveryDate") || "배송 일자"}
          </span>
          <span className="text-[11px] font-bold text-muted-foreground">
            {t("orderColStore") || "매장"}
          </span>
          <span className="text-[11px] font-bold text-muted-foreground">
            {t("orderColSummary") || "요약"}
          </span>
          <span className="text-[11px] font-bold text-muted-foreground text-right">
            {t("orderColTotal") || "총액"}
          </span>
          <span className="text-[11px] font-bold text-muted-foreground text-center">
            {t("orderColStatus") || "상태"}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        ) : (
          <div className="flex flex-col">
            {filteredOrders.map((order) => {
              const isExpanded = expandedId === order.id
              const sCfg = statusConfig[order.status]

              return (
                <div
                  key={order.id}
                  className={cn(
                    "transition-colors",
                    isExpanded ? "bg-primary/[0.02]" : "hover:bg-muted/20"
                  )}
                >
                  <div
                    className={cn(
                      "grid grid-cols-[40px_36px_1fr_120px_100px_1fr_130px_100px] items-center gap-0 px-4 py-3 cursor-pointer",
                      "border-b",
                      isExpanded && "border-b-0"
                    )}
                    onClick={() => toggleExpand(order.id)}
                  >
                    <div
                      className="flex items-center justify-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={checkedOrders.has(order.id)}
                        onCheckedChange={() => toggleOrder(order.id)}
                        className="h-4 w-4"
                      />
                    </div>
                    <div className="flex items-center justify-center">
                      <div
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-md transition-all",
                          isExpanded
                            ? "bg-primary/10 text-primary rotate-0"
                            : "text-muted-foreground"
                        )}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </div>
                    <span className="text-xs tabular-nums text-foreground">
                      {order.orderDate}
                    </span>
                    <span className="text-xs text-muted-foreground">{order.deliveryDate}</span>
                    <span className="text-xs font-semibold text-foreground">{order.store}</span>
                    <span className="text-xs text-muted-foreground truncate">{order.summary}</span>
                    <span className="text-sm font-bold tabular-nums text-primary text-right">
                      {order.totalAmount.toLocaleString()} ฿
                    </span>
                    <div className="flex justify-center">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md px-2.5 py-1 text-[10px] font-bold",
                          sCfg.bg,
                          sCfg.text
                        )}
                      >
                        {sCfg.label}
                      </span>
                    </div>
                  </div>

                  <div
                    className={cn(
                      "grid transition-all duration-300 ease-in-out overflow-hidden",
                      isExpanded
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0"
                    )}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div className="border-b">
                        <div className="ml-[58px] mr-4">
                          <div className="flex items-center gap-2 pb-3 pt-1">
                            <Package className="h-3.5 w-3.5 text-primary" />
                            <span className="text-xs font-bold text-foreground">
                              {t("orderDetailTitle") || "주문 상세 (부가세 포함)"}
                            </span>
                            <span className="ml-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary">
                              {order.items.length}{t("orderDetailCount") || "건"}
                            </span>
                          </div>

                          {order.items.length > 0 && (
                            <div className="overflow-x-auto rounded-lg border bg-card mb-4">
                              <table className="w-full text-left text-sm">
                                <thead>
                                  <tr className="border-b bg-muted/30">
                                    <th className="px-3 py-2.5 text-[10px] font-bold text-muted-foreground w-10 text-center">V</th>
                                    <th className="px-3 py-2.5 text-[10px] font-bold text-muted-foreground">
                                      {t("orderItemName") || "품목명"}
                                    </th>
                                    <th className="px-3 py-2.5 text-[10px] font-bold text-muted-foreground w-24">
                                      {t("orderItemSpec") || "규격"}
                                    </th>
                                    <th className="px-3 py-2.5 text-[10px] font-bold text-muted-foreground w-24 text-right">
                                      {t("orderItemUnitPrice") || "단가(세전)"}
                                    </th>
                                    <th className="px-3 py-2.5 text-[10px] font-bold text-muted-foreground w-16 text-center">
                                      {t("orderItemQty") || "수량"}
                                    </th>
                                    <th className="px-3 py-2.5 text-[10px] font-bold text-muted-foreground w-24 text-right">
                                      {order.store} {t("orderItemStock") || "재고"}
                                    </th>
                                    <th className="px-3 py-2.5 text-[10px] font-bold text-muted-foreground w-28 text-right">
                                      {t("orderItemTotal") || "합계(세후)"}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {order.items.map((item, idx) => (
                                    <tr
                                      key={idx}
                                      className={cn(
                                        "border-b last:border-b-0 transition-colors",
                                        idx % 2 === 1 && "bg-muted/5"
                                      )}
                                    >
                                      <td className="px-3 py-2.5 text-center">
                                        <Checkbox
                                          defaultChecked={item.checked}
                                          className="h-3.5 w-3.5"
                                        />
                                      </td>
                                      <td className="px-3 py-2.5 text-xs font-medium text-foreground">
                                        {item.name}
                                      </td>
                                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                                        {item.spec}
                                      </td>
                                      <td className="px-3 py-2.5 text-xs font-semibold tabular-nums text-foreground text-right">
                                        {item.unitPrice > 0
                                          ? item.unitPrice.toLocaleString()
                                          : "0"}
                                      </td>
                                      <td className="px-3 py-2.5 text-xs font-bold tabular-nums text-foreground text-center">
                                        {item.qty}
                                      </td>
                                      <td className="px-3 py-2.5 text-right">
                                        <span
                                          className={cn(
                                            "text-xs font-bold tabular-nums",
                                            item.stock < 0
                                              ? "text-destructive"
                                              : item.stock === 0
                                              ? "text-muted-foreground"
                                              : "text-foreground"
                                          )}
                                        >
                                          {item.stock === 0
                                            ? "-"
                                            : item.stock.toLocaleString()}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2.5 text-right">
                                        <span className="text-xs font-bold tabular-nums text-foreground">
                                          {item.total > 0
                                            ? item.total.toLocaleString()
                                            : "0"}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          <div className="flex items-center gap-3 pb-4">
                            <div className="flex items-center gap-2">
                              <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs font-semibold text-foreground">
                                {t("orderDeliveryDate") || "배송 일자"}
                              </span>
                            </div>
                            <Input
                              type="date"
                              className="h-8 w-40 text-xs"
                              placeholder="년-월-일"
                            />
                            <div className="ml-auto flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-4 text-[11px] font-semibold"
                              >
                                <Pause className="mr-1.5 h-3.5 w-3.5" />
                                {t("orderBtnHold") || "보류"}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-4 text-[11px] font-bold text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                              >
                                <XCircle className="mr-1.5 h-3.5 w-3.5" />
                                {t("orderBtnReject") || "거절"}
                              </Button>
                              <Button
                                size="sm"
                                className="h-8 px-5 text-[11px] font-bold bg-success text-success-foreground hover:bg-success/90"
                              >
                                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                {t("orderBtnApprove") || "승인"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!loading && filteredOrders.length === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {t("orderNoData") || "조회된 주문이 없습니다."}
          </div>
        )}
      </div>
    </div>
  )
}
