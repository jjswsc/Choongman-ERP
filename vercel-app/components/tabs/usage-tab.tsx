"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
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
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { getAppData, processUsage, getMyUsageHistory, type AppItem, type UsageHistoryItem } from "@/lib/api-client"
import { Minus, Plus, ShoppingCart, Trash2, Package } from "lucide-react"

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

function formatStock(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/** 사용(usage) 수량 표시 - 소수점 최대 3자리, 뒤 0 제거 */
function formatUsageQty(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return parseFloat(n.toFixed(3)).toString()
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function daysAgoStr(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

interface CartItem {
  code: string
  name: string
  qty: number
}

export function UsageTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [items, setItems] = useState<AppItem[]>([])
  const [stock, setStock] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [quantity, setQuantity] = useState(0.5)
  const [selectedItem, setSelectedItem] = useState<AppItem | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [history, setHistory] = useState<UsageHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [histStart, setHistStart] = useState(() => daysAgoStr(7))
  const [histEnd, setHistEnd] = useState(todayStr)
  const [imageModal, setImageModal] = useState<{ url: string; name: string } | null>(null)
  const [imageLoadError, setImageLoadError] = useState(false)
  const [fractionRow, setFractionRow] = useState<0 | 1>(0)

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

  const loadHistory = useCallback(() => {
    if (!auth?.store) return
    setHistoryLoading(true)
    getMyUsageHistory({ store: auth.store, startStr: histStart, endStr: histEnd })
      .then(setHistory)
      .finally(() => setHistoryLoading(false))
  }, [auth?.store, histStart, histEnd])

  useEffect(() => {
    if (auth?.store) loadHistory()
  }, [auth?.store, loadHistory])

  const addToCart = () => {
    if (!selectedItem) return
    setCart((prev) => {
      const existing = prev.find((x) => x.code === selectedItem.code)
      if (existing) {
        return prev.map((x) =>
          x.code === selectedItem.code ? { ...x, qty: x.qty + quantity } : x
        )
      }
      return [...prev, { code: selectedItem.code, name: selectedItem.name, qty: quantity }]
    })
    setSelectedItem(null)
    setQuantity(0.5)
  }

  const removeFromCart = (code: string) => {
    setCart((prev) => prev.filter((x) => x.code !== code))
  }

  const handleConfirmUsage = async () => {
    if (!auth?.store || cart.length === 0) return
    setSubmitting(true)
    try {
      const res = await processUsage({
        storeName: auth.store,
        userName: auth.user,
        items: cart.map((c) => ({ code: c.code, name: c.name, qty: c.qty })),
      })
      if (res.success) {
        alert(t('confirmUsage') + ' ✓')
        setCart([])
        loadHistory()
        getAppData(auth.store).then((r) => setStock(r.stock || {}))
      } else {
        alert(translateApiMessage(res.message, t) || t('orderFail'))
      }
    } catch (e) {
      alert((t('orderFail') as string) + ': ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSubmitting(false)
    }
  }

  if (!auth?.store) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <Package className="h-12 w-12 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">매장을 선택해 주세요.</p>
      </div>
    )
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
            <Button variant="ghost" size="sm" className="absolute -top-2 -right-2 rounded-full bg-black/50 text-white hover:bg-black/70" onClick={() => { setImageModal(null); setImageLoadError(false) }} aria-label={t("btn_close")}>
              ✕
            </Button>
          </div>
        </div>
      )}
      <Tabs defaultValue="input" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="input" className="text-sm font-medium">{t('useInput')}</TabsTrigger>
          <TabsTrigger value="history" className="text-sm font-medium">{t('useHistory')}</TabsTrigger>
        </TabsList>

        <TabsContent value="input" className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2 shrink-0">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-muted-foreground shrink-0 py-1.5">{t("useQtyFraction") || "분수"}:</span>
                {fractionRow === 0 ? (
                  <>
                    <Button type="button" variant="outline" size="sm" className="h-9 px-3 font-medium shrink-0" onClick={() => setQuantity(1)}>1</Button>
                    <Button type="button" variant="outline" size="sm" className="h-9 px-3 font-medium shrink-0" onClick={() => setQuantity(0.5)}>½</Button>
                    <Button type="button" variant="outline" size="sm" className="h-9 px-3 font-medium shrink-0" onClick={() => setQuantity(0.25)}>¼</Button>
                    <Button type="button" variant="outline" size="sm" className="h-9 px-3 font-medium shrink-0" onClick={() => setQuantity(Math.round((1 / 6) * 1000) / 1000)}>⅙</Button>
                    <Button type="button" variant="outline" size="sm" className="h-9 px-3 font-medium shrink-0" onClick={() => setQuantity(0.2)}>1/5</Button>
                    <Button type="button" variant="outline" size="sm" className="h-9 px-3 font-medium shrink-0" onClick={() => setQuantity(0.1)}>1/10</Button>
                    <Button type="button" variant="outline" size="sm" className="h-9 px-2.5 font-medium shrink-0" onClick={() => setFractionRow(1)} title={t("switchFraction") || "전환"}>⇄</Button>
                  </>
                ) : (
                  <>
                    <Button type="button" variant="outline" size="sm" className="h-9 px-3 font-medium shrink-0" onClick={() => setQuantity(0.04)}>1/25</Button>
                    <Button type="button" variant="outline" size="sm" className="h-9 px-3 font-medium shrink-0" onClick={() => setQuantity(0.02)}>1/50</Button>
                    <Button type="button" variant="outline" size="sm" className="h-9 px-3 font-medium shrink-0" onClick={() => setQuantity(0.01)}>1/100</Button>
                    <Button type="button" variant="outline" size="sm" className="h-9 px-3 font-medium shrink-0" onClick={() => setQuantity(0.005)}>1/200</Button>
                    <Button type="button" variant="outline" size="sm" className="h-9 px-3 font-medium shrink-0" onClick={() => setQuantity(1 / 1200)}>1/1200</Button>
                    <Button type="button" variant="outline" size="sm" className="h-9 px-2.5 font-medium shrink-0" onClick={() => setFractionRow(0)} title={t("switchFraction") || "전환"}>⇄</Button>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-xl border border-border bg-card flex-1">
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-l-xl text-primary" onClick={() => setQuantity(Math.max(0.0001, quantity - 0.25))}>
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  className="h-10 w-16 border-0 text-center text-sm font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  value={quantity}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (!isNaN(v) && v >= 0.0001) setQuantity(v)
                  }}
                  onBlur={(e) => {
                    const v = parseFloat(e.target.value)
                    if (isNaN(v) || v < 0.0001) setQuantity(0.5)
                  }}
                />
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-r-xl text-primary" onClick={() => setQuantity(quantity + 0.25)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <Button className="h-10 flex-1 font-semibold" onClick={addToCart} disabled={!selectedItem}>
                <ShoppingCart className="mr-2 h-4 w-4" />
                {t("addUsage")}
              </Button>
            </div>
          </div>

          <Card className="shadow-sm">
            <CardContent className="p-0">
              {loading ? (
                <div className="py-10 text-center text-sm text-muted-foreground">{t('loading')}</div>
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
                            const st = stock[item.code] ?? 0
                            const isLow = item.safeQty != null && st <= item.safeQty
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
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="font-semibold">{item.name}</span>
                                    <span className="text-xs text-muted-foreground">({item.spec || "-"})</span>
                                    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold text-white ${isLow ? "bg-destructive" : "bg-[#16a34a]"}`}>
                                      {isLow ? t("stockLow") + ":" + formatStock(st) : t("stock") + ":" + formatStock(st)}
                                    </span>
                                  </div>
                                </div>
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

          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold">{t('itemsUsed')}</CardTitle>
              <Badge variant="secondary" className="text-xs">{cart.length}{t('countUnit')}</Badge>
            </CardHeader>
            <CardContent>
              {cart.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">{t('noCartItems')}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {cart.map((item) => (
                    <div key={item.code} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-foreground">{item.name}</span>
                        <Badge variant="outline" className="text-xs">{formatUsageQty(item.qty)}</Badge>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => removeFromCart(item.code)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Button
            className="h-12 w-full text-base font-bold"
            onClick={handleConfirmUsage}
            disabled={cart.length === 0 || submitting}
          >
            {submitting ? t("loading") : t("confirmUsage")}
          </Button>
        </TabsContent>
        <TabsContent value="history" className="mt-4 flex flex-col gap-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
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
                  {historyLoading ? t('loading') : t('search') || '조회'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <div className="py-10 text-center">
                  <Package className="mx-auto h-10 w-10 text-muted-foreground/40" />
                  <p className="mt-3 text-sm text-muted-foreground">{t('useHistoryEmpty')}</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {history.map((h, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {h.dateTime}
                          {h.userName && <span className="ml-2">({t('useUsedBy') || '사용자'} {h.userName})</span>}
                        </p>
                        <p className="font-medium">{h.item}</p>
                      </div>
                      <span className="font-bold text-primary">-{formatStock(h.qty)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
