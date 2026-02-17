"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { useStoreList, getAppData, processOrder, type AppItem } from "@/lib/api-client"
import { isManagerRole } from "@/lib/permissions"
import { Minus, Plus, ShoppingCart, Trash2, Package } from "lucide-react"

function hasValidImage(url: string | undefined): boolean {
  if (!url || typeof url !== "string") return false
  const s = url.trim()
  return s.length > 10 && (s.startsWith("http") || s.startsWith("data:image"))
}

function toImageUrl(url: string): string {
  const s = String(url || "").trim()
  if (!s) return s
  if (s.startsWith("data:image")) return s
  if (s.startsWith("http")) {
    const proxyPath = `/api/imageProxy?url=${encodeURIComponent(s)}`
    if (typeof window !== "undefined") {
      return `${window.location.origin}${proxyPath}`
    }
    return proxyPath
  }
  return s
}

/** 배송일 기준 카테고리 그룹 - 같은 색 = 같은 배송일 */
const DELIVERY_GROUP_STYLES = [
  { categories: ['Chicken', 'Chicken Sauce & ETC.'], triggerClass: 'bg-amber-50 dark:bg-amber-950/30 border-l-4 border-l-amber-500' },
  { categories: ['Packaging', 'Korean Food Sauce', 'Cleaning', 'Uniform', 'Unifrom', 'Kitchen Equipment', 'Container'], triggerClass: 'bg-blue-50 dark:bg-blue-950/30 border-l-4 border-l-blue-500' },
  { categories: ['Jidubang'], triggerClass: 'bg-emerald-50 dark:bg-emerald-950/30 border-l-4 border-l-emerald-500' },
] as const

function getDeliveryGroupClass(category: string): string {
  const c = String(category || '').trim()
  if (!c) return ''
  const lower = c.toLowerCase()
  for (const g of DELIVERY_GROUP_STYLES) {
    if (g.categories.some((cat) => cat.toLowerCase() === lower)) return g.triggerClass
  }
  return ''
}

interface CartItem {
  code: string
  name: string
  price: number
  qty: number
}

export function AdminOrderCreate() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const isManager = isManagerRole(auth?.role || "")
  const isHQ = auth?.role === "director" || auth?.role === "officer"

  const [stores, setStores] = React.useState<string[]>([])
  const [storeSelect, setStoreSelect] = React.useState("")
  const [items, setItems] = React.useState<AppItem[]>([])
  const [stock, setStock] = React.useState<Record<string, number>>({})
  const [loading, setLoading] = React.useState(false)
  const [quantity, setQuantity] = React.useState(1)
  const [selectedItem, setSelectedItem] = React.useState<AppItem | null>(null)
  const [cart, setCart] = React.useState<CartItem[]>([])
  const [submitting, setSubmitting] = React.useState(false)
  const [imageModal, setImageModal] = React.useState<{ url: string; name: string } | null>(null)
  const [imageLoadError, setImageLoadError] = React.useState(false)

  const categories = React.useMemo(() => {
    const cats = new Map<string, AppItem[]>()
    for (const item of items) {
      const cat = item.category || t("all")
      if (!cats.has(cat)) cats.set(cat, [])
      cats.get(cat)!.push(item)
    }
    return Array.from(cats.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [items, t])

  const { subtotal, vat, total } = React.useMemo(() => {
    let sub = 0
    for (const c of cart) sub += c.price * c.qty
    const v = Math.round(sub * 0.07)
    return { subtotal: sub, vat: v, total: sub + v }
  }, [cart])

  const { stores: storeList } = useStoreList()
  React.useEffect(() => {
    if (!auth?.store) return
    if (isManager) {
      setStores([auth.store])
      setStoreSelect(auth.store)
    } else if (storeList.length > 0) {
      setStores(storeList)
      setStoreSelect((prev) => prev || storeList[0])
    }
  }, [auth?.store, auth?.role, isManager, storeList])

  React.useEffect(() => {
    if (!storeSelect) {
      setItems([])
      setStock({})
      return
    }
    setLoading(true)
    getAppData(storeSelect)
      .then((r) => {
        setItems(r.items)
        setStock(r.stock || {})
        setCart([])
        setSelectedItem(null)
      })
      .catch(() => {
        setItems([])
        setStock({})
      })
      .finally(() => setLoading(false))
  }, [storeSelect])

  const addToCart = () => {
    if (!selectedItem) return
    setCart((prev) => {
      const existing = prev.find((x) => x.code === selectedItem.code)
      if (existing) {
        return prev.map((x) =>
          x.code === selectedItem.code ? { ...x, qty: x.qty + quantity } : x
        )
      }
      return [
        ...prev,
        {
          code: selectedItem.code,
          name: selectedItem.name,
          price: selectedItem.price,
          qty: quantity,
        },
      ]
    })
    setSelectedItem(null)
    setQuantity(1)
  }

  const removeFromCart = (code: string) => {
    setCart((prev) => prev.filter((x) => x.code !== code))
  }

  const handlePlaceOrder = async () => {
    if (!storeSelect || !auth?.user || cart.length === 0) return
    setSubmitting(true)
    try {
      const res = await processOrder({
        storeName: storeSelect,
        userName: auth.user,
        cart: cart.map((c) => ({ code: c.code, name: c.name, price: c.price, qty: c.qty })),
      })
      if (res.success) {
        alert(t("orderSuccess"))
        setCart([])
      } else {
        alert(t("orderFail") + (res.message ? ": " + translateApiMessage(res.message, t) : ""))
      }
    } catch (e) {
      alert(t("orderFail") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 매장 선택 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{t("adminOrderCreateStore")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={storeSelect} onValueChange={setStoreSelect}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t("store")} />
            </SelectTrigger>
            <SelectContent>
              {stores.map((st) => (
                <SelectItem key={st} value={st}>
                  {st}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* 품목 목록 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{t("ordNew")}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("adminOrderCreateHint")}</p>
        </CardHeader>
        <CardContent className="p-0">
          {!storeSelect ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{t("adminOrderCreateSelectStore")}</div>
          ) : loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{t("loadingItems")}</div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{t("noItems")}</div>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {categories.map(([catName, catItems]) => (
                <AccordionItem key={catName} value={catName} className="border-b border-border/60 last:border-0">
                  <AccordionTrigger className={`px-4 py-3.5 text-sm font-semibold hover:no-underline ${getDeliveryGroupClass(catName)}`}>
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-primary" />
                      {catName}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-3">
                    <div className="flex flex-col gap-1.5">
                      {catItems.map((item) => {
                        const qty = stock[item.code] ?? 0
                        const isLow = item.safeQty != null && qty <= item.safeQty
                        const hasImg = hasValidImage(item.image)
                        return (
                          <div
                            key={item.code}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedItem(item)}
                            onKeyDown={(e) => e.key === "Enter" && setSelectedItem(item)}
                            className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                              selectedItem?.code === item.code
                                ? "bg-primary/10 font-medium text-primary"
                                : "text-foreground hover:bg-muted"
                            }`}
                          >
                            <span
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-muted/50 text-base hover:bg-muted"
                              title={hasImg ? t("photo") : t("noImage")}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (hasImg) {
                                  setImageLoadError(false)
                                  setImageModal({ url: toImageUrl(item.image!), name: item.name })
                                }
                              }}
                              role="button"
                              tabIndex={hasImg ? 0 : -1}
                              aria-disabled={!hasImg}
                            >
                              📷
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold">{item.name}</span>
                                <span className="text-xs text-muted-foreground">({item.spec || "-"})</span>
                                <span
                                  className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold text-white ${
                                    isLow ? "bg-destructive" : "bg-[#16a34a]"
                                  }`}
                                >
                                  {isLow ? t("stockLow") + ":" + qty : t("stock") + ":" + qty}
                                </span>
                              </div>
                            </div>
                            <span className="shrink-0 text-xs font-semibold text-destructive">{item.price}</span>
                          </div>
                        )
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* 수량 + 담기 */}
      {storeSelect && items.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-xl border border-border bg-card">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-l-xl text-primary"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-10 text-center text-sm font-semibold text-foreground">{quantity}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-r-xl text-primary"
              onClick={() => setQuantity((q) => q + 1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <Button className="h-10 flex-1 font-semibold" onClick={addToCart} disabled={!selectedItem}>
            <ShoppingCart className="mr-2 h-4 w-4" />
            {t("addCart")}
          </Button>
        </div>
      )}

      {/* 장바구니 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-semibold">{t("ordCartItems")}</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {cart.length}
            {t("countUnit")}
          </Badge>
        </CardHeader>
        <CardContent>
          {cart.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("noCartItems")}</p>
          ) : (
            <div className="space-y-2">
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium">{t("item")}</th>
                      <th className="px-3 py-2 text-right font-medium">{t("price")}</th>
                      <th className="px-3 py-2 text-right font-medium">{t("qty")}</th>
                      <th className="px-3 py-2 text-right font-medium">{t("sub")}</th>
                      <th className="w-9 px-1 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((c) => (
                      <tr key={c.code} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2 font-medium">{c.name}</td>
                        <td className="px-3 py-2 text-right">{c.price}</td>
                        <td className="px-3 py-2 text-right">{c.qty}</td>
                        <td className="px-3 py-2 text-right font-semibold text-primary">{c.price * c.qty}</td>
                        <td className="px-1 py-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            onClick={() => removeFromCart(c.code)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>{t("subtotal")}</span>
                  <span>{subtotal}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t("vat")}</span>
                  <span>{vat}</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-semibold text-foreground">
                  <span>{t("total")}</span>
                  <span>{total}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 주문하기 버튼 */}
      <Button
        className="h-12 w-full text-base font-bold"
        onClick={handlePlaceOrder}
        disabled={cart.length === 0 || submitting}
      >
        {submitting ? t("loading") : t("placeOrder")}
      </Button>

      {/* 이미지 모달 */}
      {imageModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => {
            setImageModal(null)
            setImageLoadError(false)
          }}
        >
          <div className="relative max-h-[90vh] max-w-[90vw] rounded-xl bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">{imageModal.name}</p>
            {imageLoadError ? (
              <div className="flex min-h-[120px] items-center justify-center rounded-lg bg-muted/80 px-6 py-8">
                <p className="text-center text-sm text-muted-foreground">{t("imageLoadError")}</p>
              </div>
            ) : (
              <img
                src={imageModal.url}
                alt={imageModal.name}
                className="max-h-[70vh] max-w-full rounded-lg object-contain"
                referrerPolicy="no-referrer"
                onError={() => setImageLoadError(true)}
                onLoad={() => setImageLoadError(false)}
              />
            )}
            <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setImageModal(null)}>
              {t("itemsBtnClose")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
