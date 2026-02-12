"use client"

import { useEffect, useState, useMemo } from "react"
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
import { getAppData, processOrder, getMyOrderHistory, type AppItem, type OrderHistoryItem } from "@/lib/api-client"
import { Minus, Plus, ShoppingCart, Trash2, Package, ClipboardList } from "lucide-react"

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
  price: number
  qty: number
}

export function OrderTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [items, setItems] = useState<AppItem[]>([])
  const [loading, setLoading] = useState(true)
  const [quantity, setQuantity] = useState(1)
  const [selectedItem, setSelectedItem] = useState<AppItem | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [history, setHistory] = useState<OrderHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [histStart, setHistStart] = useState(() => daysAgoStr(7))
  const [histEnd, setHistEnd] = useState(todayStr)

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
      .then((r) => setItems(r.items))
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
        alert(t('orderFail') + (res.message ? ': ' + res.message : ''))
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

  return (
    <div className="flex flex-col gap-4 p-4">
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
                          {catItems.map((item) => (
                            <button
                              key={item.code}
                              type="button"
                              onClick={() => setSelectedItem(item)}
                              className={`flex justify-between items-center rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                                selectedItem?.code === item.code
                                  ? "bg-primary/10 font-medium text-primary"
                                  : "text-foreground hover:bg-muted"
                              }`}
                            >
                              <span>{item.name}</span>
                              <span className="text-xs font-semibold text-destructive">{item.price}</span>
                            </button>
                          ))}
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
                <div className="flex flex-col gap-2">
                  {cart.map((c) => (
                    <div key={c.code} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm font-medium text-foreground truncate">{c.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{c.price} × {c.qty}</span>
                        <Badge variant="outline" className="text-xs shrink-0">{c.price * c.qty}</Badge>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => removeFromCart(c.code)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
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
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={histStart} onChange={(e) => setHistStart(e.target.value)} className="date-input-compact h-9 flex-1 min-w-0 max-w-[120px] text-xs" />
            <span className="text-xs text-muted-foreground shrink-0">~</span>
            <Input type="date" value={histEnd} onChange={(e) => setHistEnd(e.target.value)} className="date-input-compact h-9 flex-1 min-w-0 max-w-[120px] text-xs" />
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
                <div className="flex flex-col gap-3">
                  {history.map((o) => (
                    <div key={o.id} className="rounded-lg border border-border/60 p-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium">{o.date}</span>
                        <Badge variant="outline" className="text-xs">{o.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{o.summary}</p>
                      <p className="text-sm font-semibold text-primary mt-1">{o.total}</p>
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
