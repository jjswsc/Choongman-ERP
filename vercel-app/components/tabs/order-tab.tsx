"use client"

import { useEffect, useState, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT, type I18nKeys } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { getAppData, processOrder, getMyOrderHistory, processOrderReceive, type AppItem, type OrderHistoryItem } from "@/lib/api-client"
import { compressImageForUpload } from "@/lib/utils"
import { Minus, Plus, ShoppingCart, Trash2, Package, ClipboardList } from "lucide-react"

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function daysAgoStr(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function hasValidImage(url: string | undefined): boolean {
  if (!url || typeof url !== "string") return false
  const s = url.trim()
  return s.length > 10 && (s.startsWith("http") || s.startsWith("data:image"))
}

function toImageUrl(url: string): string {
  const s = String(url || '').trim()
  if (!s) return s
  if (s.startsWith('data:image')) return s
  if (s.startsWith('http')) {
    const proxyPath = `/api/imageProxy?url=${encodeURIComponent(s)}`
    if (typeof window !== 'undefined') {
      return `${window.location.origin}${proxyPath}`
    }
    return proxyPath
  }
  return s
}

interface CartItem {
  code: string
  name: string
  price: number
  qty: number
}

export function OrderTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [items, setItems] = useState<AppItem[]>([])
  const [stock, setStock] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [quantity, setQuantity] = useState(1)
  const [selectedItem, setSelectedItem] = useState<AppItem | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [history, setHistory] = useState<OrderHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [histStart, setHistStart] = useState(() => daysAgoStr(7))
  const [histEnd, setHistEnd] = useState(todayStr)
  const [imageModal, setImageModal] = useState<{ url: string; name: string } | null>(null)
  const [imageLoadError, setImageLoadError] = useState(false)
  const [receiveModal, setReceiveModal] = useState<{ orderId: number; order: OrderHistoryItem } | null>(null)
  const [receivePhotoFile, setReceivePhotoFile] = useState<File | null>(null)
  const [receivePhotoPreview, setReceivePhotoPreview] = useState<string | null>(null)
  const [receiveSubmitting, setReceiveSubmitting] = useState(false)
  const [inspectedItems, setInspectedItems] = useState<Record<number, Set<number>>>({})
  const [receivedQtys, setReceivedQtys] = useState<Record<number, Record<number, number>>>({})

  const categories = useMemo(() => {
    const cats = new Map<string, AppItem[]>()
    for (const item of items) {
      const cat = item.category || t('all')
      if (!cats.has(cat)) cats.set(cat, [])
      cats.get(cat)!.push(item)
    }
    return Array.from(cats.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [items, t])

  useEffect(() => {
    if (!auth?.store) return
    setLoading(true)
    getAppData(auth.store)
      .then((r) => {
        setItems(r.items)
        setStock(r.stock || {})
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [auth?.store])

  const addToCart = () => {
    if (!selectedItem) return
    setCart((prev) => {
      const existing = prev.find((x) => x.code === selectedItem.code)
      if (existing) {
        return prev.map((x) =>
          x.code === selectedItem.code ? { ...x, qty: x.qty + quantity } : x
        )
      }
      return [...prev, { code: selectedItem.code, name: selectedItem.name, price: selectedItem.price, qty: quantity }]
    })
    setSelectedItem(null)
    setQuantity(1)
  }

  const removeFromCart = (code: string) => {
    setCart((prev) => prev.filter((x) => x.code !== code))
  }

  const { subtotal, vat, total } = useMemo(() => {
    let sub = 0
    for (const c of cart) sub += c.price * c.qty
    const v = Math.round(sub * 0.07)
    return { subtotal: sub, vat: v, total: sub + v }
  }, [cart])

  const handlePlaceOrder = async () => {
    if (!auth?.store || !auth?.user || cart.length === 0) return
    setSubmitting(true)
    try {
      const res = await processOrder({
        storeName: auth.store,
        userName: auth.user,
        cart: cart.map((c) => ({ code: c.code, name: c.name, price: c.price, qty: c.qty })),
      })
      if (res.success) {
        alert(t('orderSuccess'))
        setCart([])
      } else {
        alert(t('orderFail') + (res.message ? ': ' + translateApiMessage(res.message, t) : ''))
      }
    } catch (e) {
      alert(t('orderFail') + ': ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSubmitting(false)
    }
  }

  const loadHistory = () => {
    if (!auth?.store) return
    setHistoryLoading(true)
    getMyOrderHistory({ store: auth.store, startStr: histStart, endStr: histEnd })
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false))
  }

  const translateOrderStatus = (status: string) => {
    const m: Record<string, I18nKeys> = {
      Pending: "statusPending",
      Approved: "statusApproved",
      Hold: "statusHold",
      Rejected: "statusRejected",
    }
    return m[status] ? t(m[status]) : status
  }

  const translateDeliveryStatus = (d: string) => {
    if (d === "배송중") return t("statusInTransit")
    if (d === "배송완료" || d === "배송 완료") return t("statusDelivered")
    if (d === "일부배송완료" || d === "일부 배송 완료") return t("statusPartialDelivered")
    return d
  }

  const deliveryStatusColor = (d: string) => {
    if (d === "배송중") return "bg-[#2563eb] text-white"
    if (d === "배송완료" || d === "배송 완료") return "bg-[#16a34a] text-white"
    if (d === "일부배송완료" || d === "일부 배송 완료") return "bg-[#d97706] text-white"
    return ""
  }

  const canReceive = (o: OrderHistoryItem) =>
    o.status === "Approved" &&
    o.deliveryStatus !== "배송완료" &&
    o.deliveryStatus !== "배송 완료" &&
    o.deliveryStatus !== "일부배송완료" && o.deliveryStatus !== "일부 배송 완료"

  const receiveCameraRef = useRef<HTMLInputElement>(null)
  const receiveFileRef = useRef<HTMLInputElement>(null)

  const toggleInspected = (orderId: number, itemIdx: number) => {
    setInspectedItems((prev) => {
      const next = { ...prev }
      const set = new Set(next[orderId] ?? [])
      if (set.has(itemIdx)) set.delete(itemIdx)
      else set.add(itemIdx)
      next[orderId] = set
      return next
    })
  }

  const getReceivedQty = (orderId: number, itemIdx: number, defaultQty: number) => {
    return receivedQtys[orderId]?.[itemIdx] ?? defaultQty
  }

  const setReceivedQty = (orderId: number, itemIdx: number, value: number) => {
    setReceivedQtys((prev) => {
      const orderMap = prev[orderId] ?? {}
      const nextOrder = { ...orderMap, [itemIdx]: Math.max(0, value) }
      return { ...prev, [orderId]: nextOrder }
    })
  }

  const isAllInspected = (o: OrderHistoryItem) => {
    const items = o.items || []
    if (items.length === 0) return true
    const checked = inspectedItems[o.id] ?? new Set<number>()
    return items.every((_, idx) => checked.has(idx))
  }

  const openReceiveModal = (orderId: number, o: OrderHistoryItem) => {
    setReceiveModal({ orderId, order: o })
    setReceivePhotoFile(null)
    setReceivePhotoPreview(null)
  }

  const closeReceiveModal = () => {
    setReceivePhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setReceiveModal(null)
    setReceivePhotoFile(null)
    if (receiveCameraRef.current) receiveCameraRef.current.value = ""
    if (receiveFileRef.current) receiveFileRef.current.value = ""
  }

  const onReceiveFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith("image/")) {
      setReceivePhotoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(file)
      })
      setReceivePhotoFile(file)
    }
    e.target.value = ""
  }

  const handleReceiveSubmit = async () => {
    if (!receiveModal) return
    if (!receivePhotoFile) {
      alert(t("receivePhotoRequired"))
      return
    }
    const isPartial = receiveModal.order && !isAllInspected(receiveModal.order)
    if (isPartial) {
      const inspectedSet = inspectedItems[receiveModal.order!.id] ?? new Set<number>()
      if (inspectedSet.size === 0) {
        alert(t("inspectPartialMinItems"))
        return
      }
    }
    setReceiveSubmitting(true)
    const modal = receiveModal
    try {
      const dataUrl = await compressImageForUpload(receivePhotoFile)
      if (!dataUrl?.startsWith("data:image")) {
        alert(t("orderFail"))
        setReceiveSubmitting(false)
        return
      }
      try {
        const isPartial = modal.order && !isAllInspected(modal.order)
        const inspectedSet = modal.order ? (inspectedItems[modal.order.id] ?? new Set<number>()) : new Set<number>()
        const inspectedIndices = Array.from(inspectedSet).sort((a, b) => a - b)
        const items = modal.order?.items ?? []
        const receivedQtysMap: Record<number, number> = {}
        if (isPartial) {
          inspectedIndices.forEach((idx) => {
            const it = items[idx]
            const origQty = it?.qty ?? 0
            receivedQtysMap[idx] = getReceivedQty(modal.order!.id, idx, origQty)
          })
        } else {
          items.forEach((it, idx) => {
            receivedQtysMap[idx] = getReceivedQty(modal.order!.id, idx, it?.qty ?? 0)
          })
        }
        const res = await processOrderReceive({
            orderRowId: modal.orderId,
            imageUrl: dataUrl,
            isPartialReceive: isPartial,
            inspectedIndices: isPartial ? inspectedIndices : undefined,
            receivedQtys: receivedQtysMap,
          })
        if (res && res.success === true) {
          receiveCameraRef.current && (receiveCameraRef.current.value = "")
          receiveFileRef.current && (receiveFileRef.current.value = "")
          loadHistory()
          if (auth?.store) {
            getAppData(auth.store).then((r) => setStock(r.stock || {}))
          }
          setReceivePhotoPreview((p) => { if (p) URL.revokeObjectURL(p); return null })
          setReceiveModal(null)
          setReceivePhotoFile(null)
          setReceivedQtys((prev) => {
            const next = { ...prev }
            delete next[modal.orderId]
            return next
          })
          setReceiveSubmitting(false)
          setTimeout(() => alert(t("receiveDone")), 50)
        } else {
          alert(translateApiMessage(res?.message, t) || t("orderFail"))
        }
      } catch (err) {
        console.error("processOrderReceive error:", err)
        alert(t("orderFail") + ": " + (err instanceof Error ? err.message : String(err)))
      } finally {
        setReceiveSubmitting(false)
      }
    } catch (err) {
      console.error("compressImage error:", err)
      alert(t("orderFail") + ": " + (err instanceof Error ? err.message : String(err)))
      setReceiveSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {imageModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => { setImageModal(null); setImageLoadError(false) }}
        >
          <div className="relative max-w-[90vw] max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            {imageLoadError ? (
              <div className="flex min-h-[120px] items-center justify-center rounded-lg bg-muted/80 px-6 py-8">
                <p className="text-center text-sm text-muted-foreground">{t("imageLoadError")}</p>
              </div>
            ) : (
              <img
                src={imageModal.url}
                alt={imageModal.name}
                className="max-w-full max-h-[80vh] rounded-lg object-contain"
                onError={() => setImageLoadError(true)}
                onLoad={() => setImageLoadError(false)}
              />
            )}
            <p className="mt-2 text-center text-sm text-white">{imageModal.name}</p>
            <Button variant="ghost" size="sm" className="absolute -top-2 -right-2 rounded-full bg-black/50 text-white hover:bg-black/70" onClick={() => { setImageModal(null); setImageLoadError(false) }}>
              ✕
            </Button>
          </div>
        </div>
      )}

      {receiveModal && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
          onClick={closeReceiveModal}
        >
          <div
            className="relative w-full max-w-[360px] rounded-xl bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 font-semibold">{t("receivePhotoTitle")}</h3>
            <p className="mb-3 text-sm text-muted-foreground">{t("receivePhotoHint")}</p>
            {receiveModal.order && !isAllInspected(receiveModal.order) && (
              <p className="mb-3 rounded-lg bg-amber-500/15 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">{t("inspectPartialWarning")}</p>
            )}
            <input
              ref={receiveCameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="absolute h-0 w-0 opacity-0"
              onChange={onReceiveFileSelect}
            />
            <input
              ref={receiveFileRef}
              type="file"
              accept="image/*"
              className="absolute h-0 w-0 opacity-0"
              onChange={onReceiveFileSelect}
            />
            <div className="mb-3 flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => receiveCameraRef.current?.click()}
              >
                📷 {t("takePhoto")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => receiveFileRef.current?.click()}
              >
                📁 {t("chooseFile")}
              </Button>
            </div>
            <div className="mb-3 min-h-[80px] rounded-lg border border-border bg-muted/30 p-2">
              {receivePhotoPreview ? (
                <img src={receivePhotoPreview} alt="Preview" className="max-h-[120px] max-w-full rounded-lg object-contain" />
              ) : (
                <p className="py-4 text-center text-xs text-muted-foreground">{t("receivePhotoRequired")}</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={closeReceiveModal}>
                {t("cancel")}
              </Button>
              <Button size="sm" onClick={handleReceiveSubmit} disabled={!receivePhotoFile || receiveSubmitting}>
                {receiveSubmitting ? t("loading") : t("confirmReceive")}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
      <Tabs defaultValue="new" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="new" className="text-sm font-medium">
            {t('ordNew')}
          </TabsTrigger>
          <TabsTrigger value="history" className="text-sm font-medium">
            {t('ordHistory')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="mt-4 flex flex-col gap-4">
          <Card className="shadow-sm">
            <CardContent className="p-0">
              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">{t('loadingItems')}</div>
              ) : items.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">{t('noItems')}</div>
              ) : (
                <Accordion type="single" collapsible className="w-full">
                  {categories.map(([catName, catItems]) => (
                    <AccordionItem key={catName} value={catName} className="border-b border-border/60 last:border-0">
                      <AccordionTrigger className="px-4 py-3.5 text-sm font-semibold hover:no-underline">
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
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && hasImg) {
                                      e.stopPropagation()
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
                                <div
                                  className="min-w-0 flex-1"
                                >
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="font-semibold">{item.name}</span>
                                    <span className="text-xs text-muted-foreground">({item.spec || "-"})</span>
                                    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold text-white ${isLow ? "bg-destructive" : "bg-[#16a34a]"}`}>
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

          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-xl border border-border bg-card">
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-l-xl text-primary" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-10 text-center text-sm font-semibold text-foreground">{quantity}</span>
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-r-xl text-primary" onClick={() => setQuantity((q) => q + 1)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Button className="h-10 flex-1 font-semibold" onClick={addToCart} disabled={!selectedItem}>
              <ShoppingCart className="mr-2 h-4 w-4" />
              {t('addCart')}
            </Button>
          </div>

          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold">{t('ordCartItems')}</CardTitle>
              <Badge variant="secondary" className="text-xs">{cart.length}{t('countUnit')}</Badge>
            </CardHeader>
            <CardContent>
              {cart.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">{t('noCartItems')}</p>
              ) : (
                <div className="space-y-2">
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="px-3 py-2 text-left font-medium">{t('item')}</th>
                          <th className="px-3 py-2 text-right font-medium">{t('price')}</th>
                          <th className="px-3 py-2 text-right font-medium">{t('qty')}</th>
                          <th className="px-3 py-2 text-right font-medium">{t('sub')}</th>
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
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => removeFromCart(c.code)}>
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
                      <span>{t('subtotal')}</span>
                      <span>{subtotal}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t('vat')}</span>
                      <span>{vat}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-foreground pt-2 border-t">
                      <span>{t('total')}</span>
                      <span>{total}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Button className="h-12 w-full text-base font-bold" onClick={handlePlaceOrder} disabled={cart.length === 0 || submitting}>
            {submitting ? t('loading') : t('placeOrder')}
          </Button>
        </TabsContent>

        <TabsContent value="history" className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={histStart}
                onChange={(e) => setHistStart(e.target.value)}
                className="h-9 flex-1 min-w-0 text-xs"
              />
              <span className="text-xs text-muted-foreground shrink-0">~</span>
              <Input
                type="date"
                value={histEnd}
                onChange={(e) => setHistEnd(e.target.value)}
                className="h-9 flex-1 min-w-0 text-xs"
              />
            </div>
            <Button size="sm" className="h-9 font-medium" onClick={loadHistory} disabled={historyLoading}>
              {historyLoading ? t('loading') : t('search')}
            </Button>
          </div>
          <Card className="shadow-sm">
            <CardContent className="py-6">
              {history.length === 0 ? (
                <div className="text-center">
                  <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground/40" />
                  <p className="mt-3 text-sm text-muted-foreground">{t('orderHistoryEmpty')}</p>
                </div>
              ) : (
                <Accordion type="single" collapsible className="w-full space-y-2">
                  {history.map((o) => (
                    <AccordionItem key={o.id} value={`hist-${o.id}`} className="border-b-0 rounded-lg border border-border/60 px-3 data-[state=open]:rounded-b-lg">
                      <AccordionTrigger className="py-3 hover:no-underline [&[data-state=open]>svg]:rotate-180">
                        <div className="flex w-full items-start gap-3 text-left">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-semibold">{t("orderDate")} {o.date}</span>
                              {o.deliveryDate && (
                                <span className="text-xs text-muted-foreground">{t("deliveryDate")} {o.deliveryDate}</span>
                              )}
                              <Badge variant="outline" className="text-xs">
                                {translateOrderStatus(o.status || "")}
                              </Badge>
                              {(o.deliveryStatus === "배송중" || o.deliveryStatus === "배송 완료" || o.deliveryStatus === "배송완료" || o.deliveryStatus === "일부배송완료" || o.deliveryStatus === "일부 배송 완료") && (
                                <Badge className={`text-xs ${deliveryStatusColor(o.deliveryStatus)}`}>
                                  {translateDeliveryStatus(o.deliveryStatus)}
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">{o.summary}</div>
                          </div>
                          <span className="shrink-0 font-bold text-primary">{o.total} ฿</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-3 pt-0">
                        <div className="rounded-lg bg-muted/30 p-3">
                          <div className="space-y-1.5 text-sm">
                            {(o.items || []).map((it, idx) => {
                              const showCheck = canReceive(o)
                              const checked = (inspectedItems[o.id] ?? new Set<number>()).has(idx)
                              const isReceived = o.deliveryStatus === "일부배송완료" || o.deliveryStatus === "일부 배송 완료"
                                ? (o.receivedIndices ?? []).includes(idx)
                                : o.deliveryStatus === "배송완료" || o.deliveryStatus === "배송 완료"
                              return (
                                <div key={idx} className="flex items-center gap-2 border-b border-border/40 pb-1.5 last:border-0 last:pb-0">
                                  {showCheck && (
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleInspected(o.id, idx)}
                                      className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                                      aria-label={it.name ?? ""}
                                    />
                                  )}
                                  {!showCheck && isReceived && (
                                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#16a34a] text-[10px] text-white" title={t("itemReceived")}>✓</span>
                                  )}
                                  <span className={`flex-1 min-w-0 ${isReceived ? "text-muted-foreground" : ""}`}>{it.name ?? "-"}</span>
                                  {showCheck && checked ? (
                                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                      <span className="text-muted-foreground text-xs">{t("orderReceivedQty") || "받은 수량"}:</span>
                                      <Input
                                        type="number"
                                        min={0}
                                        className="h-7 w-14 text-center text-xs tabular-nums py-0"
                                        value={getReceivedQty(o.id, idx, it.qty ?? 0)}
                                        onChange={(e) => {
                                          const v = parseInt(e.target.value, 10)
                                          setReceivedQty(o.id, idx, isNaN(v) || v < 0 ? 0 : v)
                                        }}
                                      />
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground shrink-0">× {it.qty ?? "-"}</span>
                                  )}
                                  {isReceived && <Badge variant="secondary" className="text-[10px] shrink-0">{t("itemReceived")}</Badge>}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                        {canReceive(o) && (
                          <Button
                            className="mt-3 w-full bg-[#E91E63] hover:bg-[#E91E63]/90"
                            size="sm"
                            onClick={() => openReceiveModal(o.id, o)}
                          >
                            📥 {t("receive")}
                          </Button>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
