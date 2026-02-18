"use client"

import * as React from "react"
import Image from "next/image"
import {
  getPosMenus,
  getPosMenuCategories,
  savePosOrder,
  useStoreList,
  type PosMenu,
} from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"

type OrderType = "dine_in" | "takeout" | "delivery"

interface CartItem {
  id: string
  name: string
  price: number
  qty: number
}

export default function PosPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()
  const [menus, setMenus] = React.useState<PosMenu[]>([])
  const [categories, setCategories] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selectedCategory, setSelectedCategory] = React.useState<string>("")
  const [cart, setCart] = React.useState<CartItem[]>([])
  const [orderType, setOrderType] = React.useState<OrderType>("dine_in")
  const [storeCode, setStoreCode] = React.useState("")
  const [tableName, setTableName] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    const def = auth?.store || stores[0] || "ST01"
    if (!storeCode && def) setStoreCode(def)
  }, [auth?.store, stores, storeCode])

  React.useEffect(() => {
    Promise.all([getPosMenus(), getPosMenuCategories()])
      .then(([list, { categories: cats }]) => {
        setMenus(list || [])
        setCategories(cats || [])
        if (cats?.length) setSelectedCategory(cats[0])
      })
      .catch(() => {
        setMenus([])
        setCategories([])
      })
      .finally(() => setLoading(false))
  }, [])

  const filteredMenus = React.useMemo(() => {
    const active = menus.filter((m) => m.isActive)
    if (!selectedCategory) return active
    return active.filter((m) => m.category === selectedCategory)
  }, [menus, selectedCategory])

  const addToCart = (menu: PosMenu) => {
    setCart((prev) => {
      const i = prev.findIndex((x) => x.id === menu.id)
      if (i >= 0) {
        const n = [...prev]
        n[i] = { ...n[i], qty: n[i].qty + 1 }
        return n
      }
      return [...prev, { id: menu.id, name: menu.name, price: menu.price, qty: 1 }]
    })
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

  const subtotal = cart.reduce((s, it) => s + it.price * it.qty, 0)
  const total = subtotal

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
        items: cart.map((it) => ({ id: it.id, name: it.name, price: it.price, qty: it.qty })),
      })
      if (res.success) {
        alert(`${t("posOrderSuccess") || "주문 완료"}: ${res.orderNo}`)
        clearCart()
      } else {
        alert(res.message || "저장 실패")
      }
    } catch (e) {
      alert(String(e))
    } finally {
      setSubmitting(false)
    }
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
    <div className="flex h-full">
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
              <Input
                placeholder={t("posTablePh") || "1번"}
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                className="h-8 flex-1 border-slate-600 bg-slate-800 text-sm"
              />
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
        </div>
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
        <div className="shrink-0 border-t border-slate-800 p-4">
          <div className="mb-2 flex justify-between text-sm text-slate-400">
            <span>{t("posSubtotal") || "소계"}</span>
            <span className="font-bold tabular-nums text-white">{subtotal.toLocaleString()} ฿</span>
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
  )
}
