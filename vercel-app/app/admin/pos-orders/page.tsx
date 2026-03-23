"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { Receipt, Search, ChevronDown, Pencil, Plus, Trash2, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getPosOrders,
  getPosMenus,
  getPosPrinterSettings,
  getPosDeliveryApps,
  updatePosOrder,
  updatePosOrderStatus,
  useStoreList,
  type PosOrder,
  type PosMenu,
  type PosDeliveryApp,
} from "@/lib/api-client"
import {
  getPosDeliveryPlatformName,
  formatPosOrderTypeChannelSuffix,
  getPosChannelOrderNoDisplay,
} from "@/lib/pos-delivery-platform"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole } from "@/lib/permissions"
import { cn } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type CookCompareKey = "unset" | "ok" | "warn" | "late"

const COOK_VERDICT_I18N: Record<CookCompareKey, string> = {
  unset: "posCookAnalysisUnset",
  ok: "posCookAnalysisOnTime",
  warn: "posCookAnalysisWarn",
  late: "posCookAnalysisLate",
}

function bangkokDisplayLocale(lang: string): string {
  const m: Record<string, string> = {
    ko: "ko-KR",
    en: "en-GB",
    th: "th-TH",
    mm: "my-MM",
    la: "lo-LA",
    kh: "km-KH",
    vi: "vi-VN",
    ms: "ms-MY",
  }
  return m[lang] || "en-GB"
}

function formatPosOrderGuestCount(o: PosOrder): string {
  if (o.orderType !== "dine_in") return "—"
  const n = Math.max(0, Math.trunc(Number(o.guestCount) || 0))
  return String(n)
}

function formatBangkokDateTime(value: string | null | undefined, locale = "en-GB") {
  if (!value) return "-"
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return "-"
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(dt)
}

function getTargetCookingTimeMin(
  item: { id?: string; name?: string },
  menuById: Map<string, PosMenu>,
  menuByName: Map<string, PosMenu>
): number | null {
  const rawId = String(item.id || "").trim()
  const rawName = String(item.name || "").trim()
  const menuIds = Array.from(menuById.keys()).sort((a, b) => b.length - a.length)

  const fromMenu = (m?: PosMenu) =>
    m && m.cookingTimeMin != null && Number(m.cookingTimeMin) > 0
      ? Number(m.cookingTimeMin)
      : null

  const resolveByIdPrefix = (id: string): number | null => {
    if (!id) return null
    const exact = fromMenu(menuById.get(id))
    if (exact != null) return exact
    for (const menuId of menuIds) {
      if (id.startsWith(`${menuId}-`)) {
        const v = fromMenu(menuById.get(menuId))
        if (v != null) return v
      }
    }
    return null
  }

  let target = resolveByIdPrefix(rawId)
  if (target != null) return target

  if (rawId.startsWith("cart-existing-")) {
    const stripped = rawId.replace(/^cart-existing-\d+-/, "")
    target = resolveByIdPrefix(stripped)
    if (target != null) return target
  }

  if (rawId.startsWith("promo-")) {
    const promoId = rawId.slice("promo-".length)
    target = fromMenu(menuById.get(promoId))
    if (target != null) return target
  }

  if (rawId.startsWith("banban-")) {
    const m = rawName.match(/\((.+?)\s*\/\s*(.+?)\)/)
    if (m) {
      const left = fromMenu(menuByName.get(m[1].trim())) ?? 0
      const right = fromMenu(menuByName.get(m[2].trim())) ?? 0
      const v = Math.max(left, right)
      if (v > 0) return v
    }
  }

  const mainName = rawName.replace(/\s*\(.+\)\s*$/, "").trim()
  target = fromMenu(menuByName.get(mainName))
  if (target != null) return target

  return null
}

export default function PosOrdersPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()
  const [orders, setOrders] = React.useState<PosOrder[]>([])
  const [loading, setLoading] = React.useState(false)
  const [startStr, setStartStr] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [endStr, setEndStr] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [storeFilter, setStoreFilter] = React.useState("All")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [expandedId, setExpandedId] = React.useState<number | null>(null)
  const [activeTab, setActiveTab] = React.useState<"orders" | "cookTime">("orders")
  const [updatingId, setUpdatingId] = React.useState<number | null>(null)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [editOrder, setEditOrder] = React.useState<PosOrder | null>(null)
  const [editItems, setEditItems] = React.useState<{ id: string; name: string; price: number; qty: number }[]>([])
  const [editTableName, setEditTableName] = React.useState("")
  const [editMemo, setEditMemo] = React.useState("")
  const [editDiscountAmt, setEditDiscountAmt] = React.useState("")
  const [editDiscountReason, setEditDiscountReason] = React.useState("")
  const [menus, setMenus] = React.useState<PosMenu[]>([])
  const [addMenuId, setAddMenuId] = React.useState("")
  const [deliveryAppsByStore, setDeliveryAppsByStore] = React.useState<
    Record<string, PosDeliveryApp[]>
  >({})

  const canSearchAll = isOfficeRole(auth?.role || "")

  const orderTypeLabels = React.useMemo(
    () => ({
      dine_in: t("posOrderTypeDineIn"),
      takeout: t("posOrderTypeTakeout"),
      delivery: t("posOrderTypeDelivery"),
    }),
    [t]
  )

  const statusLabels = React.useMemo(
    () => ({
      pending: t("posAdminStatusPending"),
      paid: t("posAdminStatusPaid"),
      cooking: t("posOrderStatusPreparing"),
      ready: t("posOrderStatusReady"),
      completed: t("posOrderStatusCompleted"),
      cancelled: t("posCancel"),
    }),
    [t]
  )

  const formatListOrderType = React.useCallback(
    (o: PosOrder) => {
      const base = orderTypeLabels[o.orderType as keyof typeof orderTypeLabels] || o.orderType
      const channelSuffix =
        o.orderType === "delivery" || o.orderType === "takeout"
          ? formatPosOrderTypeChannelSuffix(o)
          : ""
      if (o.orderType !== "delivery") return `${base}${channelSuffix}`
      const s = String(o.storeCode || "").trim()
      const apps =
        (s && deliveryAppsByStore[s]?.length ? deliveryAppsByStore[s] : null) ||
        deliveryAppsByStore.__default__ ||
        []
      const platform = getPosDeliveryPlatformName(o, apps)
      const mid = platform ? `${base} · ${platform}` : base
      return `${mid}${channelSuffix}`
    },
    [deliveryAppsByStore, orderTypeLabels]
  )

  const filteredOrders = React.useMemo(() => {
    if (!searchTerm.trim()) return orders
    const term = searchTerm.trim().toLowerCase()
    return orders.filter(
      (o) =>
        o.orderNo.toLowerCase().includes(term) ||
        (o.tableName && o.tableName.toLowerCase().includes(term)) ||
        (o.memo && o.memo.toLowerCase().includes(term)) ||
        o.items.some(
          (it: { name?: string }) =>
            it.name && String(it.name).toLowerCase().includes(term)
        )
    )
  }, [orders, searchTerm])

  const copyOrderNo = (orderNo: string, e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(orderNo).then(
      () => {
        void appAlert(t("posOrderNoCopied") || "주문번호가 복사되었습니다.")
      },
      () => {}
    )
  }

  const EDITABLE_STATUSES = ["pending", "paid"]

  const handleOpenEdit = (o: PosOrder) => {
    if (!EDITABLE_STATUSES.includes(o.status)) return
    setEditOrder(o)
    setEditItems(
      (o.items || []).map((it: { id?: string; name?: string; price?: number; qty?: number }) => ({
        id: String(it.id ?? ""),
        name: String(it.name ?? ""),
        price: Number(it.price ?? 0),
        qty: Number(it.qty ?? 1),
      }))
    )
    setEditTableName(o.tableName ?? "")
    setEditMemo(o.memo ?? "")
    setEditDiscountAmt(String(o.discountAmt ?? 0))
    setEditDiscountReason(o.discountReason ?? "")
    setAddMenuId("")
    getPosMenus().then(setMenus).catch(() => setMenus([]))
  }

  const handleSaveEdit = async () => {
    if (!editOrder) return
    if (editItems.length === 0) {
      await appAlert(t("posEditItemsRequired") || "항목이 하나 이상 필요합니다.")
      return
    }
    setUpdatingId(editOrder.id)
    try {
      const res = await updatePosOrder({
        id: editOrder.id,
        items: editItems,
        tableName: editOrder.orderType === "dine_in" ? editTableName : "",
        memo: editMemo || undefined,
        discountAmt: Number(editDiscountAmt) || 0,
        discountReason: editDiscountReason || undefined,
      })
      if (res.success) {
        setOrders((prev) =>
          prev.map((order) => {
            if (order.id !== editOrder.id) return order
            const subtotal = editItems.reduce((s, it) => s + it.price * it.qty, 0)
            const discount = Number(editDiscountAmt) || 0
            const total = Math.max(0, subtotal - discount)
            return {
              ...order,
              items: editItems,
              tableName: editTableName,
              memo: editMemo,
              discountAmt: discount,
              discountReason: editDiscountReason,
              subtotal,
              total,
            }
          })
        )
        setEditOrder(null)
      } else {
        await appAlert(res.message || t("msg_save_fail_detail"))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setUpdatingId(null)
    }
  }

  const handleEditItemQty = (idx: number, delta: number) => {
    setEditItems((prev) => {
      const n = [...prev]
      const q = (n[idx].qty || 1) + delta
      if (q <= 0) return prev.filter((_, i) => i !== idx)
      n[idx] = { ...n[idx], qty: q }
      return n
    })
  }

  const handleRemoveEditItem = (idx: number) => {
    setEditItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleAddEditItem = () => {
    const m = menus.find((x) => x.id === addMenuId)
    if (!m) return
    setEditItems((prev) => [...prev, { id: m.id, name: m.name, price: m.price, qty: 1 }])
    setAddMenuId("")
  }

  const handleStatusChange = async (orderId: number, newStatus: string) => {
    if (newStatus === "cancelled") {
      if (!await appConfirm(t("posCancelConfirm") || "이 주문을 취소하시겠습니까?")) return
    }
    setUpdatingId(orderId)
    try {
      const res = await updatePosOrderStatus({ id: orderId, status: newStatus })
      if (res.success) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
        )
      } else {
        await appAlert(res.message || t("msg_save_fail_detail"))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setUpdatingId(null)
    }
  }

  const handlePrintKitchenSlip = async (o: PosOrder) => {
    const storeCode = (o.storeCode ?? "").trim()
    if (!storeCode || !o.items?.length) {
      await appAlert(t("posPrintUnavailable") || "인쇄할 수 없습니다.")
      return
    }
    const win = window.open("", "_blank")
    if (!win) {
      await appAlert(t("posPrintBlocked") || "팝업이 차단되었습니다. 인쇄를 허용해 주세요.")
      return
    }
    try {
      const settings = await getPosPrinterSettings({ storeCode })
      const categoryByMenuId = Object.fromEntries(menus.map((m) => [String(m.id), m.category]))
      const kitchen1 = settings.kitchen1Categories || []
      const kitchen2 = settings.kitchen2Categories || []
      const mode = settings.kitchenMode || 1
      const items = o.items as { id?: string; name?: string; price?: number; qty?: number }[]

      const toSlips = (): { label: string; items: typeof items }[] => {
        if (mode === 1) return [{ label: t("posKitchenOrder") || "주방 주문서", items }]
        const slip1: typeof items = []
        const slip2: typeof items = []
        for (const it of items) {
          const menuId = String(it.id ?? "").split("-")[0]
          const cat = categoryByMenuId[menuId] ?? ""
          if (kitchen2.includes(cat)) slip2.push(it)
          else slip1.push(it)
        }
        const result: { label: string; items: typeof items }[] = []
        if (slip1.length) result.push({ label: t("posKitchen1") || "주방 1", items: slip1 })
        if (slip2.length) result.push({ label: t("posKitchen2") || "주방 2", items: slip2 })
        return result.length ? result : [{ label: t("posKitchenOrder") || "주방 주문서", items }]
      }
      const slips = toSlips()
      const printOne = (idx: number) => {
        if (idx >= slips.length) return
        const slip = slips[idx]
        const w = idx === 0 ? win : window.open("", "_blank")
        if (!w) return
        const html = `
          <!DOCTYPE html>
          <html><head><title>${slip.label}</title>
          <style>
            body { font-family: sans-serif; font-size: 18px; padding: 20px; max-width: 320px; }
            .k-header { text-align: center; font-size: 22px; font-weight: bold; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px; }
            .k-row { margin: 6px 0; font-size: 18px; }
            .k-memo { margin-top: 8px; padding: 8px; background: #f0f0f0; font-size: 16px; }
          </style></head><body>
          <div class="k-header">${slip.label}</div>
          <div class="k-row"><strong>${o.orderNo}</strong></div>
          <div class="k-row">${storeCode} · ${formatListOrderType(o)}${o.tableName && o.orderType !== "delivery" ? ` · ${t("posTable") || "테이블"}: ${o.tableName}` : ""}</div>
          <div class="k-row">${o.createdAt ? formatBangkokDateTime(o.createdAt, bangkokDisplayLocale(lang)) : "-"}</div>
          <hr style="margin: 10px 0;" />
          ${slip.items.map((it) => `<div class="k-row">${it.name ?? "-"} × ${it.qty ?? 1}</div>`).join("")}
          ${o.memo ? `<div class="k-memo">${t("posCustomerMemo") || "메모"}: ${o.memo}</div>` : ""}
          </body></html>`
        w.document.write(html)
        w.document.close()
        w.focus()
        let done = false
        const afterPrint = () => {
          if (done) return
          done = true
          w.close()
          if (idx + 1 < slips.length) setTimeout(() => printOne(idx + 1), 400)
        }
        w.onafterprint = afterPrint
        setTimeout(() => w.print(), 250)
        setTimeout(afterPrint, 30000)
      }
      printOne(0)
    } catch (e) {
      win.close()
      await appAlert(String(e))
    }
  }

  const loadOrders = React.useCallback(() => {
    setLoading(true)
    getPosOrders({
      startStr,
      endStr,
      storeCode: canSearchAll && storeFilter && storeFilter !== "All" ? storeFilter : undefined,
      status: statusFilter,
    })
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false))
  }, [startStr, endStr, storeFilter, statusFilter, canSearchAll])

  React.useEffect(() => {
    loadOrders()
  }, [loadOrders])

  React.useEffect(() => {
    getPosMenus().then(setMenus).catch(() => setMenus([]))
  }, [])

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const globalApps = await getPosDeliveryApps({ includeDisabled: true })
        if (cancelled) return
        const stores = [
          ...new Set(
            orders
              .map((o) => String(o.storeCode || "").trim())
              .filter(Boolean)
          ),
        ]
        const storeLists = await Promise.all(
          stores.map((s) =>
            getPosDeliveryApps({ storeCode: s, includeDisabled: true })
          )
        )
        if (cancelled) return
        const next: Record<string, PosDeliveryApp[]> = {
          __default__: globalApps,
        }
        stores.forEach((s, i) => {
          next[s] = storeLists[i]
        })
        setDeliveryAppsByStore(next)
      } catch {
        if (!cancelled) setDeliveryAppsByStore({ __default__: [] })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orders])

  const todayStr = new Date().toISOString().slice(0, 10)
  const isToday = startStr === todayStr && endStr === todayStr && statusFilter === "all"
  const todaySummary = React.useMemo(() => {
    if (!isToday || orders.length === 0) return null
    const completed = orders.filter((o) =>
      ['completed', 'paid', 'ready'].includes(o.status)
    )
    const pending = orders.filter((o) =>
      ['pending', 'cooking'].includes(o.status)
    )
    return {
      completedCount: completed.length,
      completedTotal: completed.reduce((s, o) => s + (o.total ?? 0), 0),
      pendingCount: pending.length,
    }
  }, [isToday, orders, statusFilter])

  const cookingRows = React.useMemo(() => {
    const menuById = new Map(menus.map((m) => [String(m.id), m]))
    const menuByName = new Map(menus.map((m) => [String(m.name).trim(), m]))
    const rows: Array<{
      orderId: number
      orderNo: string
      storeCode: string
      tableName: string
      orderCreatedAt: string
      itemId: string
      itemName: string
      qty: number
      servedAt: string
      elapsedMin: number
      targetMin: number | null
      diffMin: number | null
      compareKey: CookCompareKey
    }> = []

    for (const o of filteredOrders) {
      const orderTs = new Date(o.createdAt || "")
      if (Number.isNaN(orderTs.getTime())) continue
      for (const it of o.items || []) {
        const servedAt = String((it as { servedAt?: string | null })?.servedAt || "").trim()
        if (!servedAt) continue
        const servedTs = new Date(servedAt)
        if (Number.isNaN(servedTs.getTime())) continue
        const elapsedMin = Math.max(0, Math.round((servedTs.getTime() - orderTs.getTime()) / 60000))
        const itemId = String((it as { id?: string })?.id || "")
        const itemName = String((it as { name?: string })?.name || "-")
        const targetMin = getTargetCookingTimeMin(
          { id: itemId, name: itemName },
          menuById,
          menuByName
        )
        const diffMin = targetMin != null ? elapsedMin - targetMin : null
        const compareKey: CookCompareKey =
          targetMin == null
            ? "unset"
            : (elapsedMin - targetMin) <= 0
              ? "ok"
              : (elapsedMin - targetMin) <= 5
                ? "warn"
                : "late"
        rows.push({
          orderId: o.id,
          orderNo: o.orderNo,
          storeCode: o.storeCode,
          tableName: o.tableName || "-",
          orderCreatedAt: o.createdAt,
          itemId,
          itemName,
          qty: Number((it as { qty?: number })?.qty ?? 1) || 1,
          servedAt,
          elapsedMin,
          targetMin,
          diffMin,
          compareKey,
        })
      }
    }

    rows.sort((a, b) => b.servedAt.localeCompare(a.servedAt))
    return rows
  }, [filteredOrders, menus])

  const cookSummary = React.useMemo(() => {
    if (cookingRows.length === 0) return { avgMin: 0, maxMin: 0, minMin: 0 }
    const mins = cookingRows.map((r) => r.elapsedMin)
    const sum = mins.reduce((s, n) => s + n, 0)
    return {
      avgMin: Math.round(sum / mins.length),
      maxMin: Math.max(...mins),
      minMin: Math.min(...mins),
    }
  }, [cookingRows])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Receipt className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t("posOrderList") || "POS 주문 내역"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("posOrderListSub") || "매장 POS 주문을 조회합니다."}
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={startStr}
              onChange={(e) => setStartStr(e.target.value)}
              className="h-9 w-40 text-sm"
            />
            <span className="text-muted-foreground">~</span>
            <Input
              type="date"
              value={endStr}
              onChange={(e) => setEndStr(e.target.value)}
              className="h-9 w-40 text-sm"
            />
            <Button
              variant={isToday ? "secondary" : "outline"}
              size="sm"
              className="h-9 px-3 text-xs"
              onClick={() => {
                const d = new Date().toISOString().slice(0, 10)
                setStartStr(d)
                setEndStr(d)
              }}
            >
              {t("posToday") || "오늘"}
            </Button>
          </div>
          {canSearchAll && (
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger className="h-9 w-28 text-sm">
                <SelectValue placeholder={t("store") || "매장"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">{t("posStatusAll") || "전체"}</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-32 text-sm">
              <SelectValue placeholder={t("posStatus") || "상태"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("posStatusAll") || "전체"}</SelectItem>
              {Object.entries(statusLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-9 gap-1.5 px-4" onClick={loadOrders}>
            <Search className="h-4 w-4" />
            {t("itemsBtnSearch") || "조회"}
          </Button>
          <Input
            placeholder={t("posSearchPh") || "주문번호, 테이블, 메뉴 검색"}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-9 flex-1 min-w-[160px] text-sm"
          />
        </div>

        {loading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}

        {todaySummary && (
          <div className="mb-4 flex gap-4 rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {t("posTodayCompleted") || "오늘 완료"}:
              </span>
              <span className="font-bold text-amber-600">
                {todaySummary.completedCount}
                {t("posCount") || "건"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {t("posInputTotal") || "합계"}:
              </span>
              <span className="font-bold tabular-nums">
                {todaySummary.completedTotal.toLocaleString()} ฿
              </span>
            </div>
            {todaySummary.pendingCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {t("posPending") || "대기"}: {todaySummary.pendingCount}
                {t("posCount") || "건"}
              </div>
            )}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "orders" | "cookTime")} className="space-y-4">
          <TabsList>
            <TabsTrigger value="orders">{t("posOrderList") || "POS 주문 내역"}</TabsTrigger>
            <TabsTrigger value="cookTime">{t("posCookTimeAnalysisTab")}</TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="mt-0">
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-5 py-3 text-[11px] font-bold text-center w-20">
                        {t("posOrderNo") || "주문번호"}
                      </th>
                      <th className="px-5 py-3 text-[11px] font-bold text-center w-20">
                        {t("store")}
                      </th>
                      <th className="px-5 py-3 text-[11px] font-bold text-center w-20">
                        {t("posOrderType") || "유형"}
                      </th>
                      <th className="px-5 py-3 text-[11px] font-bold text-center w-16">
                        {t("posTable") || "테이블"}
                      </th>
                      <th className="px-5 py-3 text-[11px] font-bold text-center w-14">
                        {t("posOrderGuestCount") || "손님 수"}
                      </th>
                      <th className="px-5 py-3 text-[11px] font-bold text-center w-24">
                        {t("posInputTotal")}
                      </th>
                      <th className="px-5 py-3 text-[11px] font-bold text-center w-24">
                        {t("posStatus") || "상태"}
                      </th>
                      <th className="px-5 py-3 text-[11px] font-bold text-center w-36">
                        {t("posOrderOrderedAt")}
                      </th>
                      <th className="px-5 py-3 text-[11px] font-bold text-center w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-5 py-12 text-center text-muted-foreground"
                        >
                          {t("itemsNoResults") || "조회된 내역이 없습니다."}
                        </td>
                      </tr>
                    ) : (
                      filteredOrders.map((o) => (
                        <React.Fragment key={o.id}>
                          <tr
                            className={cn(
                              "border-b cursor-pointer hover:bg-muted/20",
                              expandedId === o.id && "bg-muted/20"
                            )}
                            onClick={() =>
                              setExpandedId((prev) => (prev === o.id ? null : o.id))
                            }
                          >
                            <td className="px-5 py-3">
                              <button
                                type="button"
                                onClick={(e) => copyOrderNo(o.orderNo, e)}
                                className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary hover:bg-primary/20 transition"
                                title={t("posCopyOrderNo") || "복사"}
                              >
                                {o.orderNo}
                              </button>
                            </td>
                            <td className="px-5 py-3 text-center">{o.storeCode || "-"}</td>
                            <td className="px-5 py-3 text-center whitespace-nowrap">
                              {formatListOrderType(o)}
                            </td>
                            <td className="px-5 py-3 text-center text-muted-foreground">
                              {o.orderType === "dine_in" && o.tableName ? (
                                o.tableName
                              ) : o.orderType === "delivery" || o.orderType === "takeout" ? (
                                (() => {
                                  const { text, usedHash } = getPosChannelOrderNoDisplay(o)
                                  if (!text) return "-"
                                  return usedHash ? `#${text}` : text
                                })()
                              ) : (
                                "-"
                              )}
                            </td>
                            <td className="px-5 py-3 text-center tabular-nums text-muted-foreground">
                              {formatPosOrderGuestCount(o)}
                            </td>
                            <td className="px-5 py-3 text-right font-bold tabular-nums">
                              {o.total?.toLocaleString()} ฿
                            </td>
                            <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                              <Select
                                value={o.status}
                                onValueChange={(v) => handleStatusChange(o.id, v)}
                                disabled={updatingId === o.id}
                              >
                                <SelectTrigger
                                  className={cn(
                                    "h-8 w-full max-w-[110px] border-0 shadow-none focus:ring-0",
                                    o.status === "completed" && "text-green-600",
                                    o.status === "cancelled" && "text-muted-foreground"
                                  )}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(statusLabels).map(([k, v]) => (
                                    <SelectItem key={k} value={k}>
                                      {v}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-5 py-3 text-center text-muted-foreground">
                              {o.createdAt
                                ? formatBangkokDateTime(o.createdAt, bangkokDisplayLocale(lang))
                                : "-"}
                            </td>
                            <td className="px-5 py-3">
                              <ChevronDown
                                className={cn(
                                  "h-4 w-4 transition",
                                  expandedId === o.id && "rotate-180"
                                )}
                              />
                            </td>
                          </tr>
                          {expandedId === o.id && (
                            <tr className="border-b bg-muted/10">
                              <td colSpan={9} className="px-5 py-4">
                                <div className="space-y-2 text-xs">
                                  {(o.tableName ||
                                    o.orderType === "dine_in" ||
                                    o.memo ||
                                    (o.discountAmt && o.discountAmt > 0) ||
                                    (o.deliveryFee ?? 0) > 0 ||
                                    (o.packagingFee ?? 0) > 0 ||
                                    (o.paymentCash ?? 0) + (o.paymentCard ?? 0) + (o.paymentQr ?? 0) + (o.paymentOther ?? 0) >
                                      0) && (
                                    <div className="mb-2 pb-2 border-b">
                                      {o.tableName && o.orderType !== "delivery" && (
                                        <div className="text-muted-foreground">
                                          {t("posTable") || "테이블"}: {o.tableName}
                                        </div>
                                      )}
                                      {o.orderType === "dine_in" && (
                                        <div className="text-muted-foreground mt-0.5">
                                          {t("posOrderGuestCount") || "손님 수"}:{" "}
                                          {formatPosOrderGuestCount(o)}
                                        </div>
                                      )}
                                      {o.memo && (
                                        <div className="text-muted-foreground mt-0.5">
                                          {t("posCustomerMemo") || "메모"}: {o.memo}
                                        </div>
                                      )}
                                      {o.discountAmt && o.discountAmt > 0 && (
                                        <div className="text-green-600 mt-0.5">
                                          {t("posDiscount") || "할인"}: -{o.discountAmt.toLocaleString()} ฿
                                          {o.discountReason && ` (${o.discountReason})`}
                                        </div>
                                      )}
                                      {(o.deliveryFee ?? 0) > 0 && (
                                        <div className="text-muted-foreground mt-0.5">
                                          {t("posDeliveryFee") || "배달 수수료"}: +{(o.deliveryFee ?? 0).toLocaleString()} ฿
                                        </div>
                                      )}
                                      {(o.packagingFee ?? 0) > 0 && (
                                        <div className="text-muted-foreground mt-0.5">
                                          {t("posPackagingFee") || "포장 수수료"}: +{(o.packagingFee ?? 0).toLocaleString()} ฿
                                        </div>
                                      )}
                                      {((o.paymentCash ?? 0) + (o.paymentCard ?? 0) + (o.paymentQr ?? 0) + (o.paymentOther ?? 0)) > 0 && (
                                        <div className="mt-1 pt-1 border-t border-dashed text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                                          {(o.paymentCash ?? 0) > 0 && <span>{t("posPaymentCash") || "현금"}: {(o.paymentCash ?? 0).toLocaleString()} ฿</span>}
                                          {(o.paymentCard ?? 0) > 0 && <span>{t("posPaymentCard") || "카드"}: {(o.paymentCard ?? 0).toLocaleString()} ฿</span>}
                                          {(o.paymentQr ?? 0) > 0 && <span>{t("posPaymentQr") || "QR"}: {(o.paymentQr ?? 0).toLocaleString()} ฿</span>}
                                          {(o.paymentOther ?? 0) > 0 && <span>{t("posPaymentOther") || "기타"}: {(o.paymentOther ?? 0).toLocaleString()} ฿</span>}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {o.items?.length ? (
                                    <>
                                      <div className="mb-1 text-[11px] text-muted-foreground">
                                        {(() => {
                                          const servedCount = o.items.filter((it: { servedAt?: string | null }) => Boolean(it.servedAt)).length
                                          return `${t("posTableStatusServed") || "서빙 완료"}: ${servedCount}/${o.items.length}`
                                        })()}
                                      </div>
                                      {o.items.map((it: { name?: string; price?: number; qty?: number; servedAt?: string | null }, idx: number) => (
                                        <div
                                          key={idx}
                                          className="flex items-center justify-between gap-2 text-muted-foreground"
                                        >
                                          <span className="min-w-0 truncate">
                                            {it.name} × {it.qty ?? 1}
                                          </span>
                                          <div className="flex items-center gap-2 shrink-0">
                                            {it.servedAt ? (
                                              <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">
                                                {t("posTableStatusServed")}{" "}
                                                {formatBangkokDateTime(it.servedAt, bangkokDisplayLocale(lang))}
                                              </span>
                                            ) : (
                                              <span className="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                                {t("posItemNotServed")}
                                              </span>
                                            )}
                                            <span className="tabular-nums">
                                              {((it.price ?? 0) * (it.qty ?? 1)).toLocaleString()}{" "}
                                              ฿
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                  <div className="pt-2 flex flex-wrap gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 gap-1 px-2 text-xs"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handlePrintKitchenSlip(o)
                                      }}
                                    >
                                      <Printer className="h-3 w-3" />
                                      {t("posKitchenSlip") || "주방 주문서"}
                                    </Button>
                                    {EDITABLE_STATUSES.includes(o.status) && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 gap-1 px-2 text-xs"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleOpenEdit(o)
                                        }}
                                      >
                                        <Pencil className="h-3 w-3" />
                                        {t("posOrderEdit") || "수정"}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="cookTime" className="mt-0">
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded bg-muted px-2 py-1">
                {t("posCookTimeStatCompletedLines")}: {cookingRows.length}
                {t("posCount")}
              </span>
              <span className="rounded bg-muted px-2 py-1">
                {t("posCookTimeStatAvgElapsed")}: {cookSummary.avgMin}
                {t("posTimeMinUnit")}
              </span>
              <span className="rounded bg-muted px-2 py-1">
                {t("posCookTimeStatMin")}: {cookSummary.minMin}
                {t("posTimeMinUnit")}
              </span>
              <span className="rounded bg-muted px-2 py-1">
                {t("posCookTimeStatMax")}: {cookSummary.maxMin}
                {t("posTimeMinUnit")}
              </span>
              <span className="rounded bg-muted px-2 py-1">
                {t("posCookTimeStatNoBaseline")}: {cookingRows.filter((r) => r.targetMin == null).length}
                {t("posCount")}
              </span>
            </div>
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-24">{t("posServedAtTime")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-20">{t("store")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-20">{t("posOrderNo") || "주문번호"}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-16">{t("posTable") || "테이블"}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-left min-w-[220px]">{t("posMenuName")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-12">{t("qty") || "수량"}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-24">{t("posCookTimeActualElapsed")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-24">{t("posCookTimeTargetBaseline")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-20">{t("posCookTimeDiff")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-16">{t("posCookTimeVerdict")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cookingRows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-5 py-12 text-center text-muted-foreground">
                          {t("posCookTimeNoServedRows")}
                        </td>
                      </tr>
                    ) : (
                      cookingRows.map((r) => (
                        <tr key={`${r.orderId}-${r.itemId}-${r.itemName}-${r.servedAt}`} className="border-b">
                          <td className="px-4 py-3 text-center text-muted-foreground">
                            {formatBangkokDateTime(r.servedAt, bangkokDisplayLocale(lang))}
                          </td>
                          <td className="px-4 py-3 text-center">{r.storeCode || "-"}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={(e) => copyOrderNo(r.orderNo, e)}
                              className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary hover:bg-primary/20 transition"
                              title={t("posCopyOrderNo") || "복사"}
                            >
                              {r.orderNo}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-center text-muted-foreground">{r.tableName || "-"}</td>
                          <td className="px-4 py-3">{r.itemName}</td>
                          <td className="px-4 py-3 text-center tabular-nums">{r.qty}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                              {r.elapsedMin}
                              {t("posTimeMinUnit")}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center tabular-nums">
                            {r.targetMin != null ? `${r.targetMin}${t("posTimeMinUnit")}` : "-"}
                          </td>
                          <td className="px-4 py-3 text-center tabular-nums">
                            {r.diffMin != null
                              ? `${r.diffMin > 0 ? "+" : ""}${r.diffMin}${t("posTimeMinUnit")}`
                              : "-"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={cn(
                                "rounded px-2 py-0.5 text-xs",
                                r.compareKey === "ok" && "bg-emerald-50 text-emerald-700",
                                r.compareKey === "warn" && "bg-amber-50 text-amber-700",
                                r.compareKey === "late" && "bg-rose-50 text-rose-700",
                                r.compareKey === "unset" && "bg-muted text-muted-foreground"
                              )}
                            >
                              {t(COOK_VERDICT_I18N[r.compareKey])}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* 주문 수정 모달 */}
      <Dialog open={!!editOrder} onOpenChange={(open) => !open && setEditOrder(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t("posOrderEdit") || "주문 수정"} — {editOrder?.orderNo}
            </DialogTitle>
          </DialogHeader>
          {editOrder && (
            <div className="space-y-4 py-2">
              {editOrder.orderType === "dine_in" && (
                <div>
                  <label className="text-xs font-medium">{t("posTable") || "테이블"}</label>
                  <Input
                    value={editTableName}
                    onChange={(e) => setEditTableName(e.target.value)}
                    className="mt-1 h-9"
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-medium">{t("posCustomerMemo") || "메모"}</label>
                <Input
                  value={editMemo}
                  onChange={(e) => setEditMemo(e.target.value)}
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <label className="text-xs font-medium">{t("itemsList") || "항목"}</label>
                <div className="mt-1 space-y-1.5 max-h-40 overflow-y-auto">
                  {editItems.map((it, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 rounded border px-2 py-1.5 text-sm"
                    >
                      <span className="flex-1 truncate">{it.name}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleEditItemQty(idx, -1)}
                          className="rounded p-0.5 hover:bg-muted"
                        >
                          -
                        </button>
                        <span className="w-6 text-center tabular-nums">{it.qty}</span>
                        <button
                          type="button"
                          onClick={() => handleEditItemQty(idx, 1)}
                          className="rounded p-0.5 hover:bg-muted"
                        >
                          +
                        </button>
                      </div>
                      <span className="w-16 text-right tabular-nums">
                        {(it.price * it.qty).toLocaleString()} ฿
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-destructive"
                        onClick={() => handleRemoveEditItem(idx)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <Select value={addMenuId} onValueChange={setAddMenuId}>
                    <SelectTrigger className="h-9 flex-1">
                      <SelectValue placeholder={t("posAddItem") || "항목 추가"} />
                    </SelectTrigger>
                    <SelectContent>
                      {menus
                        .filter((m) => m.isActive)
                        .map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name} — {m.price.toLocaleString()} ฿
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={handleAddEditItem} disabled={!addMenuId}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium">{t("posDiscount") || "할인 (฿)"}</label>
                  <Input
                    type="number"
                    min={0}
                    value={editDiscountAmt}
                    onChange={(e) => setEditDiscountAmt(e.target.value)}
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">{t("posDiscountReasonPh") || "사유"}</label>
                  <Input
                    value={editDiscountReason}
                    onChange={(e) => setEditDiscountReason(e.target.value)}
                    className="mt-1 h-9"
                  />
                </div>
              </div>
              <div className="flex justify-end border-t pt-3">
                <span className="text-sm font-bold">
                  {t("posInputTotal") || "합계"}:{" "}
                  {Math.max(
                    0,
                    editItems.reduce((s, it) => s + it.price * it.qty, 0) - (Number(editDiscountAmt) || 0)
                  ).toLocaleString()}{" "}
                  ฿
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOrder(null)}>
              {t("close") || "닫기"}
            </Button>
            <Button onClick={handleSaveEdit} disabled={updatingId === editOrder?.id}>
              {updatingId === editOrder?.id ? "..." : t("itemsBtnSave") || "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
