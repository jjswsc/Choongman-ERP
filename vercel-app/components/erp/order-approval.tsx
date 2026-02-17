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
import { translateApiMessage } from "@/lib/translate-api-message"
import { useAuth } from "@/lib/auth-context"
import { isManagerRole } from "@/lib/permissions"
import { getAdminOrders, getAppData, processOrderDecision, type AdminOrderItem } from "@/lib/api-client"

type OrderStatus = "Pending" | "Approved" | "Rejected" | "Hold"

const HQ_STORES = ["본사", "Office", "오피스", "본점"]

interface OrderItem {
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
}

interface Order {
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
}

const statusConfig: Record<OrderStatus, { labelKey: string; bg: string; text: string }> = {
  Pending: { labelKey: "orderStatusPending", bg: "bg-warning/10", text: "text-warning" },
  Approved: { labelKey: "orderStatusApproved", bg: "bg-success/10", text: "text-success" },
  Rejected: { labelKey: "orderStatusRejected", bg: "bg-destructive/10", text: "text-destructive" },
  Hold: { labelKey: "orderStatusHold", bg: "bg-muted", text: "text-muted-foreground" },
}

function mapApiToOrder(
  api: AdminOrderItem,
  hqStock: Record<string, number>,
  storeStock: Record<string, number>,
  hqItems: { code: string; safeQty: number }[],
  storeItems: { code: string; safeQty: number }[]
): Order {
  const hqSafeMap: Record<string, number> = {}
  for (const i of hqItems) hqSafeMap[i.code] = i.safeQty
  const storeSafeMap: Record<string, number> = {}
  for (const i of storeItems) storeSafeMap[i.code] = i.safeQty

  const items: OrderItem[] = (api.items || []).map((it) => {
    const price = Number(it.price) || 0
    const qty = Number(it.qty) || 0
    const origQty = typeof it.originalQty === 'number' ? it.originalQty : qty
    const code = it.code || ""
    return {
      name: it.name || "-",
      spec: it.spec || "",
      unitPrice: price,
      qty,
      originalQty: origQty,
      hqStock: code ? (hqStock[code] ?? 0) : 0,
      storeStock: code ? (storeStock[code] ?? 0) : 0,
      hqSafeQty: hqSafeMap[code] ?? 0,
      storeSafeQty: storeSafeMap[code] ?? 0,
      total: price * qty,
      checked: true,
      code,
    }
  })
  const status = (api.status || "Pending") as OrderStatus
  return {
    id: String(api.orderId),
    orderId: api.orderId,
    orderDate: api.date,
    deliveryDate: api.deliveryDate || "-",
    store: api.store,
    userName: api.userName,
    summary: api.summary,
    totalAmount: api.total,
    status: status in statusConfig ? status : "Pending",
    items,
  }
}

export function OrderApproval() {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const isManager = isManagerRole(auth?.role || "")
  const userStore = (auth?.store || "").trim()
  const [orders, setOrders] = React.useState<Order[]>([])
  const [stores, setStores] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(true)
  const [expandedId, setExpandedId] = React.useState<string | null>(null)
  const [checkedOrders, setCheckedOrders] = React.useState<Set<string>>(new Set())
  const [allChecked, setAllChecked] = React.useState(false)
  const [storeFilter, setStoreFilter] = React.useState(isManager && userStore ? userStore : "all")
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
  const [deliveryDateByOrder, setDeliveryDateByOrder] = React.useState<Record<string, string>>({})
  const [submittingId, setSubmittingId] = React.useState<string | null>(null)
  const [editedItemsByOrderId, setEditedItemsByOrderId] = React.useState<Record<string, OrderItem[]>>({})
  const [detailSortByCode, setDetailSortByCode] = React.useState<"asc" | "desc" | null>(null)

  const effectiveStore = isManager && userStore ? userStore : (storeFilter === "all" ? undefined : storeFilter)

  const fetchOrders = React.useCallback(async () => {
    setLoading(true)
    try {
      const { list, stores: s } = await getAdminOrders({
        startStr: startDate,
        endStr: endDate,
        store: effectiveStore,
        status: statusFilter === "all" ? undefined : statusFilter,
        userStore: isManager ? userStore : undefined,
        userRole: isManager ? auth?.role : undefined,
      })
      setStores(s || [])

      const storesInList = [...new Set(list.map((o) => o.store).filter(Boolean))]
      const hqStore = HQ_STORES[0]
      const [{ items: hqItemsArr, stock: hqStockData }] = await Promise.all([
        getAppData(hqStore),
      ])
      const hqStock = hqStockData || {}
      const hqSafeItems = (hqItemsArr || []).map((i) => ({ code: i.code, safeQty: i.safeQty ?? 0 }))

      const storeDataMap: Record<string, { stock: Record<string, number>; items: { code: string; safeQty: number }[] }> = {}
      await Promise.all(
        storesInList.map(async (store) => {
          const { items: itms, stock } = await getAppData(store)
          storeDataMap[store] = {
            stock: stock || {},
            items: (itms || []).map((i) => ({ code: i.code, safeQty: i.safeQty ?? 0 })),
          }
        })
      )

      const mapped: Order[] = list.map((o) => {
        const data = storeDataMap[o.store] || { stock: {}, items: [] }
        return mapApiToOrder(o, hqStock, data.stock, hqSafeItems, data.items)
      })
      setOrders(mapped)
      setCheckedOrders(new Set(mapped.map((o) => o.id)))
      setAllChecked(mapped.length > 0)
      setEditedItemsByOrderId({})
    } catch {
      setOrders([])
      setStores([])
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, effectiveStore, statusFilter, isManager, userStore])

  React.useEffect(() => {
    if (isManager && userStore) setStoreFilter(userStore)
  }, [isManager, userStore])

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

  const getDisplayItems = (order: Order): OrderItem[] => {
    const base = editedItemsByOrderId[order.id] ?? order.items
    if (!detailSortByCode) return base
    return [...base].sort((a, b) => {
      const ca = (a.code || "").toLowerCase()
      const cb = (b.code || "").toLowerCase()
      const cmp = ca.localeCompare(cb)
      return detailSortByCode === "asc" ? cmp : -cmp
    })
  }
  const cycleCodeSort = () => {
    setDetailSortByCode((prev) => (prev === null ? "asc" : prev === "asc" ? "desc" : null))
  }

  const updateOrderItem = (orderId: string, itemRef: { code: string; name: string }, updates: Partial<Pick<OrderItem, "checked" | "qty">>) => {
    setEditedItemsByOrderId((prev) => {
      const order = orders.find((o) => o.id === orderId)
      if (!order) return prev
      const base = prev[orderId] ?? order.items
      const realIndex = base.findIndex((it) => (it.code || "") === itemRef.code && (it.name || "") === itemRef.name)
      if (realIndex === -1) return prev
      const target = base[realIndex]
      const newQty = updates.qty ?? target?.qty
      const next = base.map((it, i) =>
        i === realIndex
          ? { ...it, ...updates, qty: newQty ?? it.qty, total: it.unitPrice * (newQty ?? it.qty) }
          : it
      )
      return { ...prev, [orderId]: next }
    })
  }

  const handleDecision = async (orderId: number, decision: "Approved" | "Rejected" | "Hold", order: Order) => {
    const idStr = String(orderId)
    const deliveryDate = deliveryDateByOrder[idStr] || ""
    if (decision === "Approved" && !deliveryDate.trim()) {
      alert(t("orderDeliveryDateRequired"))
      return
    }
    const displayItems = getDisplayItems(order)
    const selectedItems = decision === "Approved"
      ? displayItems.filter((it) => it.checked && it.qty > 0)
      : []
    if (decision === "Approved" && selectedItems.length === 0) {
      alert(t("orderApproveNeedItems") || "승인할 품목을 선택해 주세요.")
      return
    }
    const updatedCart = displayItems.map((it) => ({
      code: it.code,
      name: it.name,
      spec: it.spec,
      price: it.unitPrice,
      qty: it.qty,
      checked: it.checked,
      originalQty: it.originalQty,
    }))
    setSubmittingId(idStr)
    try {
      const res = await processOrderDecision({
        orderId,
        decision,
        deliveryDate: deliveryDate || undefined,
        userRole: auth?.role,
        updatedCart: decision === "Approved" ? updatedCart : undefined,
      })
      if (!res.success) {
        alert(translateApiMessage(res.message, t) || t("orderDecisionFailed"))
        return
      }
      alert(t("orderDecisionSuccess"))
      setOrders((prev) => {
        if (decision !== "Approved") {
          return prev.map((o) => (o.orderId === orderId ? { ...o, status: decision } : o))
        }
        const sub = selectedItems.reduce((s, it) => s + it.unitPrice * it.qty, 0)
        const vat = Math.round(sub * 0.07)
        const newTotal = sub + vat
        return prev.map((o) =>
          o.orderId === orderId ? { ...o, status: decision, totalAmount: newTotal } : o
        )
      })
      if (decision === "Approved") {
        setEditedItemsByOrderId((prev) => {
          const next = { ...prev }
          delete next[idStr]
          return next
        })
      }
    } finally {
      setSubmittingId(null)
    }
  }

  const filteredOrders = React.useMemo(() => {
    if (!searchTerm.trim()) return orders
    const q = searchTerm.toLowerCase()
    return orders.filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        o.store.toLowerCase().includes(q) ||
        (o.userName || '').toLowerCase().includes(q) ||
        o.summary.toLowerCase().includes(q)
    )
  }, [orders, searchTerm])

  return (
    <div className="flex flex-col gap-6">
      {/* Filter bar */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          {!isManager && (
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Package className="h-3.5 w-3.5 text-primary" />
                {t("orderFilterStore")}
              </label>
              <Select value={storeFilter} onValueChange={setStoreFilter}>
                <SelectTrigger className="h-9 w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("orderFilterStoreAll")}</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
              {t("orderFilterPeriod")}
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
              {t("orderFilterStatus")}
            </label>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{t("orderStatusPending")}</SelectItem>
                  <SelectItem value="approved">{t("orderStatusApproved")}</SelectItem>
                  <SelectItem value="rejected">{t("orderStatusRejected")}</SelectItem>
                  <SelectItem value="hold">{t("orderStatusHold")}</SelectItem>
                  <SelectItem value="all">{t("orderStatusAll")}</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder={t("search")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 w-28 text-xs"
              />
            </div>
          </div>

          <Button size="sm" className="h-9 px-5 text-xs font-bold" onClick={fetchOrders}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {t("orderBtnSearch")}
          </Button>
        </div>
      </div>

      {/* Order table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="grid grid-cols-[40px_36px_1fr_120px_100px_90px_1fr_130px_100px] items-center gap-0 border-b bg-muted/40 px-4 py-3">
          <div className="flex items-center justify-center">
            <Checkbox checked={allChecked} onCheckedChange={toggleAll} className="h-4 w-4" />
          </div>
          <div />
          <span className="text-[11px] font-bold text-muted-foreground">
            {t("orderColDate")}
          </span>
          <span className="text-[11px] font-bold text-muted-foreground">
            {t("orderColDeliveryDate")}
          </span>
          <span className="text-[11px] font-bold text-muted-foreground">
            {t("orderColStore")}
          </span>
          <span className="text-[11px] font-bold text-muted-foreground">
            {t("orderOrderedBy") || "발주자"}
          </span>
          <span className="text-[11px] font-bold text-muted-foreground">
            {t("orderColSummary")}
          </span>
          <span className="text-[11px] font-bold text-muted-foreground text-right">
            {t("orderColTotal")}
          </span>
          <span className="text-[11px] font-bold text-muted-foreground text-center">
            {t("orderColStatus")}
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
                      "grid grid-cols-[40px_36px_1fr_120px_100px_90px_1fr_130px_100px] items-center gap-0 px-4 py-3 cursor-pointer",
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
                    <span className="text-xs text-muted-foreground truncate">{order.userName || "-"}</span>
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
                        {t(sCfg.labelKey)}
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
                              {t("orderDetailTitle")}
                            </span>
                            <span className="ml-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary">
                              {order.items.length}{t("orderDetailCount")}
                            </span>
                          </div>

                          {order.items.length > 0 && (() => {
                            const displayItems = getDisplayItems(order)
                            const canEdit = order.status === "Pending" && !isManager
                            return (
                            <div className="overflow-x-auto rounded-lg border bg-card mb-4">
                              <table className="w-full text-left text-sm">
                                <thead>
                                  <tr className="border-b bg-muted/30">
                                    <th className="px-3 py-2.5 text-[10px] font-bold text-muted-foreground w-10 text-center">V</th>
                                    <th
                                      className="px-3 py-2.5 text-[10px] font-bold text-muted-foreground w-20 cursor-pointer hover:bg-muted/50 select-none"
                                      onClick={(e) => { e.stopPropagation(); cycleCodeSort() }}
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
                                            canEdit && updateOrderItem(order.id, { code: item.code || "", name: item.name || "" }, { checked: !!v })
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
                                              updateOrderItem(order.id, { code: item.code || "", name: item.name || "" }, { qty: isNaN(v) || v < 0 ? 0 : v })
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
                                          {(item.unitPrice * item.qty > 0
                                            ? (item.unitPrice * item.qty).toLocaleString()
                                            : "0")}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )})()}

                          <div className="flex items-center gap-3 pb-4">
                            <div className="flex items-center gap-2">
                              <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs font-semibold text-foreground">
                                {t("orderDeliveryDate")}
                              </span>
                            </div>
                            <Input
                              type="date"
                              className="h-8 w-40 text-xs"
                              placeholder={t("orderDeliveryDatePh")}
                              value={deliveryDateByOrder[order.id] || ""}
                              onChange={(e) =>
                                setDeliveryDateByOrder((prev) => ({ ...prev, [order.id]: e.target.value }))
                              }
                              readOnly={isManager}
                            />
                            {!isManager && (
                              <div className="ml-auto flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-4 text-[11px] font-semibold"
                                  disabled={submittingId !== null || order.status !== "Pending"}
                                  onClick={(e) => { e.stopPropagation(); handleDecision(order.orderId, "Hold", order) }}
                                >
                                  <Pause className="mr-1.5 h-3.5 w-3.5" />
                                  {t("orderBtnHold")}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-4 text-[11px] font-bold text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                                  disabled={submittingId !== null || order.status !== "Pending"}
                                  onClick={(e) => { e.stopPropagation(); handleDecision(order.orderId, "Rejected", order) }}
                                >
                                  <XCircle className="mr-1.5 h-3.5 w-3.5" />
                                  {t("orderBtnReject")}
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-8 px-5 text-[11px] font-bold bg-success text-success-foreground hover:bg-success/90"
                                  disabled={submittingId !== null || order.status !== "Pending"}
                                  onClick={(e) => { e.stopPropagation(); handleDecision(order.orderId, "Approved", order) }}
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
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!loading && filteredOrders.length === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {t("orderNoData")}
          </div>
        )}
      </div>
    </div>
  )
}
