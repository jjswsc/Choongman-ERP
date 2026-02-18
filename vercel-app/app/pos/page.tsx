"use client"

import * as React from "react"
import Image from "next/image"
import {
  getPosMenus,
  getPosMenuCategories,
  getPosMenuOptions,
  getPosOrders,
  getPosTodaySales,
  getPosTableLayout,
  savePosOrder,
  useStoreList,
  type PosMenu,
  type PosMenuOption,
  type PosOrder,
} from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Minus, Plus, Printer, RotateCcw, ShoppingCart, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type OrderType = "dine_in" | "takeout" | "delivery"

interface CartItem {
  id: string
  name: string
  price: number
  qty: number
  optionId?: string
  optionName?: string
}

export default function PosPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()
  const [menus, setMenus] = React.useState<PosMenu[]>([])
  const [categories, setCategories] = React.useState<string[]>([])
  const [allOptions, setAllOptions] = React.useState<PosMenuOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [optionPickerMenu, setOptionPickerMenu] = React.useState<PosMenu | null>(null)
  const [selectedCategory, setSelectedCategory] = React.useState<string>("")
  const [cart, setCart] = React.useState<CartItem[]>([])
  const [orderType, setOrderType] = React.useState<OrderType>("dine_in")
  const [storeCode, setStoreCode] = React.useState("")
  const [tableName, setTableName] = React.useState("")
  const [tableOptions, setTableOptions] = React.useState<{ id: string; name: string }[]>([])
  const [discountType, setDiscountType] = React.useState<"pct" | "amt">("amt")
  const [discountValue, setDiscountValue] = React.useState("")
  const [discountReason, setDiscountReason] = React.useState("")
  const [memo, setMemo] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [recentOrders, setRecentOrders] = React.useState<PosOrder[]>([])
  const [recentLoading, setRecentLoading] = React.useState(false)
  const [todaySales, setTodaySales] = React.useState<{
    completedCount: number
    completedTotal: number
    pendingCount: number
  } | null>(null)
  const [receiptData, setReceiptData] = React.useState<{
    orderNo: string
    items: CartItem[]
    subtotal: number
    discountAmt: number
    total: number
    storeCode: string
    orderType: string
    tableName: string
    memo: string
    discountReason: string
  } | null>(null)
  const receiptRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const def = auth?.store || stores[0] || "ST01"
    if (!storeCode && def) setStoreCode(def)
  }, [auth?.store, stores, storeCode])

  const loadTodaySales = React.useCallback(() => {
    if (!storeCode) return
    getPosTodaySales({ storeCode })
      .then(setTodaySales)
      .catch(() => setTodaySales(null))
  }, [storeCode])

  React.useEffect(() => {
    loadTodaySales()
  }, [loadTodaySales])

  const loadTableLayout = React.useCallback(() => {
    if (!storeCode) return
    getPosTableLayout({ storeCode })
      .then(({ layout }) =>
        setTableOptions(
          (layout || []).map((t) => ({ id: t.id, name: t.name }))
        )
      )
      .catch(() => setTableOptions([]))
  }, [storeCode])

  React.useEffect(() => {
    loadTableLayout()
  }, [loadTableLayout])

  React.useEffect(() => {
    Promise.all([getPosMenus(), getPosMenuCategories(), getPosMenuOptions()])
      .then(([list, { categories: cats }, opts]) => {
        setMenus(list || [])
        setCategories(cats || [])
        setAllOptions(opts || [])
        if (cats?.length) setSelectedCategory(cats[0])
      })
      .catch(() => {
        setMenus([])
        setCategories([])
        setAllOptions([])
      })
      .finally(() => setLoading(false))
  }, [])

  const optionsByMenuId = React.useMemo(() => {
    const m: Record<string, PosMenuOption[]> = {}
    for (const o of allOptions) {
      const mid = o.menuId
      if (!m[mid]) m[mid] = []
      m[mid].push(o)
    }
    return m
  }, [allOptions])

  const todayStr = new Date().toISOString().slice(0, 10)
  const filteredMenus = React.useMemo(() => {
    const active = menus.filter((m) => m.isActive)
    const notSoldOut = active.filter((m) => !m.soldOutDate || m.soldOutDate !== todayStr)
    if (!selectedCategory) return notSoldOut
    return notSoldOut.filter((m) => m.category === selectedCategory)
  }, [menus, selectedCategory, todayStr])

  const addToCartWithOption = (menu: PosMenu, opt: PosMenuOption | null) => {
    const cartId = opt ? `${menu.id}-${opt.id}` : menu.id
    const name = opt ? `${menu.name} (${opt.name})` : menu.name
    const price = menu.price + (opt?.priceModifier ?? 0)
    setCart((prev) => {
      const i = prev.findIndex((x) => x.id === cartId)
      if (i >= 0) {
        const n = [...prev]
        n[i] = { ...n[i], qty: n[i].qty + 1 }
        return n
      }
      return [...prev, {
        id: cartId,
        name,
        price,
        qty: 1,
        optionId: opt?.id,
        optionName: opt?.name,
      }]
    })
    setOptionPickerMenu(null)
  }

  const addToCart = (menu: PosMenu) => {
    const opts = optionsByMenuId[menu.id]
    if (opts && opts.length > 0) {
      setOptionPickerMenu(menu)
      return
    }
    addToCartWithOption(menu, null)
  }

  const updateQty = (id: string, delta: number) => {
    setCart((prev) => {
      const i = prev.findIndex((x) => x.id === id)
      if (i < 0) return prev
      const n = [...prev]
      const nextQty = n[i].qty + delta
      if (nextQty <= 0) {
        return prev.filter((x) => x.id !== id)
      }
      n[i] = { ...n[i], qty: nextQty }
      return n
    })
  }

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((x) => x.id !== id))
  }

  const clearCart = () => setCart([])

  const loadRecentOrders = React.useCallback(() => {
    const today = new Date().toISOString().slice(0, 10)
    setRecentLoading(true)
    getPosOrders({
      startStr: today,
      endStr: today,
      storeCode: storeCode || undefined,
    })
      .then((list) => setRecentOrders((list || []).slice(0, 10)))
      .catch(() => setRecentOrders([]))
      .finally(() => setRecentLoading(false))
  }, [storeCode])

  const reorderFrom = (order: PosOrder) => {
    if (!order.items?.length) return
    setCart((prev) => {
      const next = [...prev]
      for (const it of order.items as { id?: string; name?: string; price?: number; qty?: number }[]) {
        const id = String(it.id ?? "")
        const name = String(it.name ?? "")
        const price = Number(it.price ?? 0)
        const qty = Number(it.qty ?? 1)
        if (!id) continue
        const i = next.findIndex((x) => x.id === id)
        if (i >= 0) {
          next[i] = { ...next[i], qty: next[i].qty + qty }
        } else {
          next.push({ id, name, price, qty })
        }
      }
      return next
    })
  }

  const subtotal = cart.reduce((s, it) => s + it.price * it.qty, 0)
  const discountAmt =
    discountType === "pct"
      ? Math.round(subtotal * (Number(discountValue) || 0) / 100)
      : Math.min(subtotal, Math.max(0, Number(discountValue) || 0))
  const total = Math.max(0, subtotal - discountAmt)

  const handleCheckout = async () => {
    if (cart.length === 0) {
      alert(t("posCartEmpty") || "장바구니가 비어 있습니다.")
      return
    }
    setSubmitting(true)
    try {
      const res = await savePosOrder({
        storeCode: storeCode || "ST01",
        orderType,
        tableName: orderType === "dine_in" ? tableName : "",
        memo: memo.trim() || undefined,
        discountAmt: discountAmt || undefined,
        discountReason: discountReason.trim() || undefined,
        items: cart.map((it) => ({ id: it.id, name: it.name, price: it.price, qty: it.qty })),
      })
      if (res.success) {
        setReceiptData({
          orderNo: res.orderNo ?? "",
          items: [...cart],
          subtotal,
          discountAmt,
          total,
          storeCode: storeCode || "ST01",
          orderType,
          tableName: orderType === "dine_in" ? tableName : "",
          memo: memo.trim(),
          discountReason: discountReason.trim(),
        })
        clearCart()
        setMemo("")
        setDiscountValue("")
        setDiscountReason("")
        loadTodaySales()
      } else {
        alert(res.message || "저장 실패")
      }
    } catch (e) {
      alert(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const handlePrintReceipt = () => {
    if (!receiptRef.current) return
    const printContent = receiptRef.current.innerHTML
    const printWindow = window.open("", "_blank")
    if (!printWindow) {
      alert(t("posPrintBlocked") || "팝업이 차단되었습니다. 인쇄를 허용해 주세요.")
      return
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${t("posReceipt") || "영수증"}</title>
          <style>
            body { font-family: 'Courier New', monospace; font-size: 12px; padding: 16px; max-width: 280px; }
            .receipt-content { }
            .receipt-header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
            .receipt-row { display: flex; justify-content: space-between; margin: 4px 0; }
            .receipt-total { border-top: 1px dashed #000; margin-top: 8px; padding-top: 8px; font-weight: bold; }
            .space-y-2 > * + * { margin-top: 8px; }
            .space-y-1 > * + * { margin-top: 4px; }
          </style>
        </head>
        <body>${printContent}</body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 250)
  }

  const orderTypeLabels: Record<OrderType, string> = {
    dine_in: t("posOrderTypeDineIn") ?? "매장",
    takeout: t("posOrderTypeTakeout") ?? "포장",
    delivery: t("posOrderTypeDelivery") ?? "배달",
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {todaySales != null && (
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-800/50 px-4 py-2 text-xs">
          <span className="text-slate-400">
            {t("posTodayCompleted") || "오늘 완료"}:{" "}
            <span className="font-bold text-amber-400">{todaySales.completedCount}</span>
            {t("posCount") || "건"}
          </span>
          <span className="font-bold tabular-nums text-white">
            {todaySales.completedTotal.toLocaleString()} ฿
          </span>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
      {/* 메뉴 영역 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-slate-800 bg-slate-900/50 px-3 py-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setSelectedCategory(c)}
              className={cn(
                "shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition",
                selectedCategory === c
                  ? "bg-amber-500 text-slate-900"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filteredMenus.map((m) => (
              <button
                key={m.id}
                onClick={() => addToCart(m)}
                className="flex flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-800/80 p-2 text-left transition hover:border-amber-500/50 hover:bg-slate-700/80 active:scale-[0.98]"
              >
                <div className="relative aspect-square shrink-0 overflow-hidden rounded-lg bg-slate-700">
                  {m.imageUrl ? (
                    <Image
                      src={m.imageUrl}
                      alt={m.name}
                      fill
                      className="object-cover"
                      unoptimized
                      onError={(e) => {
                        const t = e.target as HTMLImageElement
                        if (t) t.style.display = "none"
                      }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-3xl text-slate-500">
                      🍗
                    </div>
                  )}
                </div>
                <div className="mt-2 truncate text-sm font-medium text-white">{m.name}</div>
                <div className="text-xs font-bold text-amber-400">
                  {m.price > 0 ? `${m.price.toLocaleString()} ฿` : "-"}
                </div>
              </button>
            ))}
          </div>
          {filteredMenus.length === 0 && (
            <div className="py-12 text-center text-slate-400">
              {t("posNoMenus") || "등록된 메뉴가 없습니다."}
            </div>
          )}
        </div>
      </div>

      {/* 장바구니 */}
      <div className="flex w-80 shrink-0 flex-col border-l border-slate-800 bg-slate-900">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <ShoppingCart className="h-4 w-4" />
            {t("posCart") || "장바구니"}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-slate-400 hover:text-white"
            onClick={clearCart}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            {t("posClear") || "비우기"}
          </Button>
        </div>
        <div className="flex shrink-0 flex-col gap-2 border-b border-slate-800 px-4 py-3">
          {stores.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs text-slate-400 w-12">
                {t("store") || "매장"}
              </span>
              <Select value={storeCode || stores[0]} onValueChange={setStoreCode}>
                <SelectTrigger className="h-8 flex-1 border-slate-600 bg-slate-800 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {orderType === "dine_in" && (
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs text-slate-400 w-12">
                {t("posTable") || "테이블"}
              </span>
              {tableOptions.length > 0 ? (
                <>
                  <Select
                    value={tableOptions.some((x) => x.name === tableName) ? tableName : "_"}
                    onValueChange={(v) => setTableName(v === "_" ? "" : v)}
                  >
                    <SelectTrigger className="h-8 min-w-[80px] border-slate-600 bg-slate-800 text-sm">
                      <SelectValue placeholder={t("posTablePh") || "1번"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_">
                        {t("posTableOther") || "직접 입력"}
                      </SelectItem>
                      {tableOptions.map((t) => (
                        <SelectItem key={t.id} value={t.name}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(!tableName || !tableOptions.some((x) => x.name === tableName)) && (
                    <Input
                      placeholder={t("posTableCustomPh") || "테이블명"}
                      value={tableName}
                      onChange={(e) => setTableName(e.target.value)}
                      className="h-8 flex-1 border-slate-600 bg-slate-800 text-sm"
                    />
                  )}
                </>
              ) : (
                <Input
                  placeholder={t("posTablePh") || "1번"}
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  className="h-8 flex-1 border-slate-600 bg-slate-800 text-sm"
                />
              )}
            </div>
          )}
          <div className="flex gap-2">
            {(["dine_in", "takeout", "delivery"] as OrderType[]).map((typ) => (
              <button
                key={typ}
                onClick={() => setOrderType(typ)}
                className={cn(
                  "flex-1 rounded-lg py-2 text-xs font-medium",
                  orderType === typ ? "bg-amber-500 text-slate-900" : "bg-slate-800 text-slate-400"
                )}
              >
                {orderTypeLabels[typ]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 flex-1 border-slate-600 bg-slate-800 text-xs text-slate-300 hover:bg-slate-700"
              onClick={loadRecentOrders}
              disabled={recentLoading}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              {recentLoading ? "..." : t("posReorder") || "재주문"}
            </Button>
          </div>
        </div>
        {recentOrders.length > 0 && (
          <div className="shrink-0 overflow-x-auto border-b border-slate-800 px-3 py-2">
            <div className="flex gap-2">
              {recentOrders.map((o) => (
                <button
                  key={o.id}
                  onClick={() => reorderFrom(o)}
                  className="shrink-0 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-left transition hover:border-amber-500/50"
                >
                  <div className="text-[10px] font-bold text-amber-400">{o.orderNo}</div>
                  <div className="text-[11px] text-slate-300">
                    {o.total?.toLocaleString()} ฿
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {cart.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              {t("posCartEmpty") || "장바구니가 비어 있습니다."}
            </p>
          ) : (
            <div className="space-y-2">
              {cart.map((it) => (
                <div
                  key={it.id}
                  className="flex items-center gap-2 rounded-lg bg-slate-800/60 px-3 py-2"
                >
                  <div className="flex-1 truncate text-sm text-white">{it.name}</div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateQty(it.id, -1)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm font-medium tabular-nums text-white">
                      {it.qty}
                    </span>
                    <button
                      onClick={() => updateQty(it.id, 1)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="w-16 text-right text-xs font-bold text-amber-400 tabular-nums">
                    {(it.price * it.qty).toLocaleString()} ฿
                  </span>
                  <button
                    onClick={() => removeFromCart(it.id)}
                    className="rounded p-1 text-slate-500 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 border-t border-slate-800 p-4 space-y-3">
          <div>
            <label className="text-xs text-slate-400">{t("posCustomerMemo") || "손님 메모"}</label>
            <Input
              placeholder={t("posCustomerMemoPh") || "알레르기, 맵기 조절 등"}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="mt-1 h-9 border-slate-600 bg-slate-800 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">{t("posDiscount") || "할인"}</label>
            <div className="mt-1 flex gap-2">
              <div className="flex rounded-lg border border-slate-600 bg-slate-800 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setDiscountType("amt")}
                  className={cn(
                    "px-2 py-1.5 text-xs",
                    discountType === "amt" ? "bg-amber-500/30 text-amber-400" : "text-slate-500"
                  )}
                >
                  ฿
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountType("pct")}
                  className={cn(
                    "px-2 py-1.5 text-xs",
                    discountType === "pct" ? "bg-amber-500/30 text-amber-400" : "text-slate-500"
                  )}
                >
                  %
                </button>
              </div>
              <Input
                type="number"
                min={0}
                placeholder={discountType === "pct" ? "10" : "0"}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                className="h-9 w-20 border-slate-600 bg-slate-800 text-sm text-right"
              />
              <Input
                placeholder={t("posDiscountReasonPh") || "사유"}
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                className="h-9 flex-1 border-slate-600 bg-slate-800 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-sm text-slate-400">
              <span>{t("posSubtotal") || "소계"}</span>
              <span className="tabular-nums text-white">{subtotal.toLocaleString()} ฿</span>
            </div>
            {discountAmt > 0 && (
              <div className="flex justify-between text-sm text-green-400">
                <span>{t("posDiscount") || "할인"}</span>
                <span className="tabular-nums">-{discountAmt.toLocaleString()} ฿</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold text-white border-t border-slate-700 pt-2">
              <span>{t("posInputTotal") || "합계"}</span>
              <span className="tabular-nums">{total.toLocaleString()} ฿</span>
            </div>
          </div>
          <Button
            className="w-full bg-amber-500 font-bold text-slate-900 hover:bg-amber-400"
            disabled={cart.length === 0 || submitting}
            onClick={handleCheckout}
          >
            {submitting ? "..." : t("posCheckout") || "결제"}
          </Button>
        </div>
      </div>
      </div>

      {/* 옵션 선택 모달 */}
      <Dialog open={!!optionPickerMenu} onOpenChange={(open) => !open && setOptionPickerMenu(null)}>
        <DialogContent className="max-w-xs sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {optionPickerMenu?.name} — {t("posSelectOption") || "옵션 선택"}
            </DialogTitle>
          </DialogHeader>
          {optionPickerMenu && (
            <div className="flex flex-col gap-2 py-2">
              {optionsByMenuId[optionPickerMenu.id]?.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => addToCartWithOption(optionPickerMenu, opt)}
                  className="flex justify-between rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-left transition hover:border-amber-500/50 hover:bg-slate-700"
                >
                  <span>{opt.name}</span>
                  <span className="font-bold text-amber-400">
                    {(optionPickerMenu.price + (opt.priceModifier || 0)).toLocaleString()} ฿
                  </span>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!receiptData} onOpenChange={(open) => !open && setReceiptData(null)}>
        <DialogContent className="max-w-xs sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">
              {t("posOrderSuccess") || "주문 완료"}
            </DialogTitle>
          </DialogHeader>
          {receiptData && (
            <>
              <div
                ref={receiptRef}
                className="receipt-content space-y-2 rounded border p-4 text-sm"
              >
                <div className="receipt-header">
                  <div className="font-bold">CHOONGMAN</div>
                  <div className="text-xs text-muted-foreground">
                    {receiptData.orderNo}
                  </div>
                  <div className="text-xs">
                    {receiptData.storeCode} · {orderTypeLabels[receiptData.orderType as OrderType] || receiptData.orderType}
                    {receiptData.tableName && ` · ${t("posTable") || "테이블"}: ${receiptData.tableName}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date().toLocaleString("ko-KR")}
                  </div>
                </div>
                <div className="space-y-1">
                  {receiptData.items.map((it) => (
                    <div key={it.id} className="receipt-row flex justify-between">
                      <span>
                        {it.name} × {it.qty}
                      </span>
                      <span className="tabular-nums">
                        {(it.price * it.qty).toLocaleString()} ฿
                      </span>
                    </div>
                  ))}
                </div>
                <div className="receipt-row flex justify-between text-xs border-t pt-2 mt-2">
                  <span>{t("posSubtotal") || "소계"}</span>
                  <span className="tabular-nums">{receiptData.subtotal.toLocaleString()} ฿</span>
                </div>
                {receiptData.discountAmt > 0 && (
                  <div className="receipt-row flex justify-between text-xs text-green-600">
                    <span>{t("posDiscount") || "할인"}{receiptData.discountReason ? ` (${receiptData.discountReason})` : ""}</span>
                    <span className="tabular-nums">-{receiptData.discountAmt.toLocaleString()} ฿</span>
                  </div>
                )}
                {receiptData.memo && (
                  <div className="text-xs text-muted-foreground">
                    {t("posCustomerMemo") || "메모"}: {receiptData.memo}
                  </div>
                )}
                <div className="receipt-total flex justify-between">
                  <span>{t("posInputTotal") || "합계"}</span>
                  <span className="tabular-nums">{receiptData.total.toLocaleString()} ฿</span>
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handlePrintReceipt}
                >
                  <Printer className="h-4 w-4" />
                  {t("posPrint") || "인쇄"}
                </Button>
                <Button size="sm" onClick={() => setReceiptData(null)}>
                  {t("close") || "닫기"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
