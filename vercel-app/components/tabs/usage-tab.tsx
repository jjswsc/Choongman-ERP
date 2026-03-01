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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/lib/auth-context"
import { useStoreView } from "@/lib/store-view-context"
import { isOfficeRole, isOfficeStore } from "@/lib/permissions"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { getAppData, processUsage, getMyUsageHistory, translateTexts, type AppItem, type UsageHistoryItem } from "@/lib/api-client"
import { Plus, ShoppingCart, Trash2, Package, Info } from "lucide-react"
import { ImageViewerWithRotate } from "@/components/ui/image-viewer-with-rotate"

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

type UsageRow = { unitKey: string; qty: string }

export function UsageTab() {
  const { auth } = useAuth()
  const { viewStore } = useStoreView()
  const { lang } = useLang()
  const t = useT(lang)
  const isOffice = auth && (isOfficeRole(auth.role || "") || isOfficeStore(auth.store || ""))
  const effectiveStore = isOffice && viewStore ? viewStore : auth?.store ?? ""
  const [items, setItems] = useState<AppItem[]>([])
  const [stock, setStock] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<AppItem | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [history, setHistory] = useState<UsageHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [histStart, setHistStart] = useState(todayStr)
  const [histEnd, setHistEnd] = useState(todayStr)
  const [imageModal, setImageModal] = useState<{ url: string; name: string } | null>(null)
  const [imageLoadError, setImageLoadError] = useState(false)
  const [descriptionModal, setDescriptionModal] = useState<{ name: string; description: string } | null>(null)
  const [descriptionTranslated, setDescriptionTranslated] = useState<string | null>(null)
  /** 사용 수량 여러 행 (재고 조정과 동일: 단위 + 수량, 합산 후 장바구니 추가) */
  const [usageRows, setUsageRows] = useState<UsageRow[]>([])

  const usageUnitOptions = useMemo(() => {
    const std = selectedItem?.standardUnits?.filter((o) => (o.unit || "").trim() && o.totalQuantity > 0) ?? []
    return [{ kind: "spec" as const }, ...std.map((o) => ({ kind: "standard" as const, unit: o.unit, totalQuantity: o.totalQuantity }))]
  }, [selectedItem])

  const defaultUsageRow = useCallback((): UsageRow => {
    const first = usageUnitOptions[0]
    return { unitKey: first?.kind === "spec" ? "spec" : first ? `${first.unit}::${first.totalQuantity}` : "spec", qty: "" }
  }, [usageUnitOptions])

  const usageRowToSpecQty = useCallback((unitKey: string, qtyStr: string): number => {
    const n = Number(qtyStr)
    if (isNaN(n) || n === 0) return 0
    if (!unitKey || unitKey === "spec") return n
    const [, tqStr] = unitKey.split("::")
    const tq = Number(tqStr)
    return tq > 0 ? n / tq : n
  }, [])

  const totalUsageSpecQty = useMemo(
    () => usageRows.reduce((sum, r) => sum + usageRowToSpecQty(r.unitKey, r.qty), 0),
    [usageRows, usageRowToSpecQty]
  )

  useEffect(() => {
    if (selectedItem) setUsageRows([defaultUsageRow()])
  }, [selectedItem?.code, defaultUsageRow])

  useEffect(() => {
    if (!descriptionModal?.description?.trim()) {
      setDescriptionTranslated(null)
      return
    }
    let cancelled = false
    setDescriptionTranslated(null)
    translateTexts([descriptionModal.description.trim()], lang).then(([translated]) => {
      if (!cancelled) setDescriptionTranslated(translated ?? descriptionModal.description)
    }).catch(() => {
      if (!cancelled) setDescriptionTranslated(descriptionModal.description)
    })
    return () => { cancelled = true }
  }, [descriptionModal?.description, descriptionModal?.name, lang])

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
    if (!effectiveStore) return
    setLoading(true)
    getAppData(effectiveStore)
      .then((r) => {
        setItems(r.items)
        setStock(r.stock || {})
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [effectiveStore])

  const loadHistory = useCallback(() => {
    if (!effectiveStore) return
    setHistoryLoading(true)
    getMyUsageHistory({ store: effectiveStore, startStr: histStart, endStr: histEnd })
      .then(setHistory)
      .finally(() => setHistoryLoading(false))
  }, [effectiveStore, histStart, histEnd])

  const addUsageRow = () => setUsageRows((prev) => [...prev, defaultUsageRow()])
  const removeUsageRow = (idx: number) => setUsageRows((prev) => prev.filter((_, i) => i !== idx))
  const setUsageRow = (idx: number, upd: Partial<UsageRow>) =>
    setUsageRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...upd } : r)))

  const addToCart = () => {
    if (!selectedItem) return
    const qtyToAdd = Math.round(totalUsageSpecQty * 1e6) / 1e6
    if (qtyToAdd === 0) {
      alert(t("stockAdjustQtyRequired") || "수량을 입력해 주세요.")
      return
    }
    setCart((prev) => {
      const existing = prev.find((x) => x.code === selectedItem.code)
      if (existing) {
        return prev.map((x) =>
          x.code === selectedItem.code ? { ...x, qty: x.qty + qtyToAdd } : x
        )
      }
      return [...prev, { code: selectedItem.code, name: selectedItem.name, qty: qtyToAdd }]
    })
    setSelectedItem(null)
    setUsageRows([defaultUsageRow()])
  }

  const removeFromCart = (code: string) => {
    setCart((prev) => prev.filter((x) => x.code !== code))
  }

  const handleConfirmUsage = async () => {
    if (!effectiveStore || cart.length === 0) return
    setSubmitting(true)
    try {
      const res = await processUsage({
        storeName: effectiveStore,
        userName: auth?.user ?? "",
        items: cart.map((c) => ({ code: c.code, name: c.name, qty: c.qty })),
      })
      if (res.success) {
        alert(t('confirmUsage') + ' ✓')
        setCart([])
        loadHistory()
        getAppData(effectiveStore).then((r) => setStock(r.stock || {}))
      } else {
        alert(translateApiMessage(res.message, t) || t('orderFail'))
      }
    } catch (e) {
      alert((t('orderFail') as string) + ': ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSubmitting(false)
    }
  }

  if (!effectiveStore) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <Package className="h-12 w-12 text-muted-foreground/50" />
        <p className="text-center text-sm text-muted-foreground">
          {isOffice ? t("orderStoreSelectFromTop") : t("msg_select_store_name")}
        </p>
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
              <ImageViewerWithRotate
                src={imageModal.url}
                alt={imageModal.name}
                imgClassName="max-w-full max-h-[80vh] rounded-lg object-contain"
                onError={() => setImageLoadError(true)}
                onLoad={() => setImageLoadError(false)}
                rotateLeftLabel={t("imageRotateLeft") || "반시계"}
                rotateRightLabel={t("imageRotateRight") || "시계"}
              />
            )}
            <p className="mt-2 text-center text-sm text-white">{imageModal.name}</p>
            <Button variant="ghost" size="sm" className="absolute -top-2 -right-2 rounded-full bg-black/50 text-white hover:bg-black/70" onClick={() => { setImageModal(null); setImageLoadError(false) }} aria-label={t("btn_close")}>
              ✕
            </Button>
          </div>
        </div>
      )}

      {descriptionModal && (
        <Dialog open={!!descriptionModal} onOpenChange={(open) => { if (!open) { setDescriptionModal(null); setDescriptionTranslated(null) } }}>
          <DialogContent className="max-w-sm sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{descriptionModal.name}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {descriptionTranslated ?? descriptionModal.description}
            </p>
          </DialogContent>
        </Dialog>
      )}

      <Tabs defaultValue="input" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="input" className="text-sm font-medium">{t('useInput')}</TabsTrigger>
          <TabsTrigger value="history" className="text-sm font-medium">{t('useHistory')}</TabsTrigger>
        </TabsList>

        <TabsContent value="input" className="mt-4 flex flex-col gap-4">
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
                                    <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary">{item.code}</span>
                                    <span className="font-semibold">{item.name}</span>
                                    <span className="text-xs text-muted-foreground">({item.spec || "-"})</span>
                                    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold text-white ${isLow ? "bg-destructive" : "bg-[#16a34a]"}`}>
                                      {isLow ? t("stockLow") + ":" + formatStock(st) : t("stock") + ":" + formatStock(st)}
                                    </span>
                                    {item.description && (
                                      <button
                                        type="button"
                                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-primary hover:bg-primary/20"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setDescriptionModal({ name: item.name, description: item.description! })
                                        }}
                                        title={t("itemsDescription") || "설명"}
                                      >
                                        <Info className="h-3.5 w-3.5" />
                                      </button>
                                    )}
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

          {selectedItem && (
            <Card className="shrink-0 border-2 border-primary/40 bg-primary/5 shadow-md">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold text-foreground">{t("useQtyLabel") || "사용 수량"}</CardTitle>
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1 border-primary/50 bg-background" onClick={addUsageRow}>
                    <Plus className="h-3.5 w-3.5" />
                    {t("itemsAdd") || "추가"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="space-y-2.5 max-h-[220px] overflow-y-auto">
                  {usageRows.map((row, idx) => (
                    <div key={idx} className="flex gap-2 items-center flex-nowrap">
                      <Select value={row.unitKey} onValueChange={(v) => setUsageRow(idx, { unitKey: v })}>
                        <SelectTrigger className="w-[180px] min-w-[180px] shrink-0 text-sm h-10 overflow-hidden text-left border-primary/30 bg-background">
                          <SelectValue placeholder={t("stockAdjustUnit") || "단위"} />
                        </SelectTrigger>
                        <SelectContent>
                          {usageUnitOptions.map((o) => {
                            const val = o.kind === "spec" ? "spec" : `${o.unit}::${o.totalQuantity}`
                            const label = o.kind === "spec"
                              ? (t("stockAdjustUnitSpec") || "규격 (1개)")
                              : `${o.unit} (${o.totalQuantity} = 1 ${t("specUnit") || "규격"})`
                            return (
                              <SelectItem key={val} value={val}>
                                {label}
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        placeholder={t("stockAdjustDiffPh") || "수량"}
                        value={row.qty}
                        onChange={(e) => setUsageRow(idx, { qty: e.target.value })}
                        className="text-sm w-28 min-w-[5rem] h-10 shrink-0 border-primary/30 font-medium"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 shrink-0 text-destructive hover:bg-destructive/10"
                        onClick={() => removeUsageRow(idx)}
                        aria-label={t("cancel")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                {usageRows.length >= 2 && (
                  <p className="text-sm font-semibold text-foreground">
                    {t("stockAdjustTotalLabel") || "합계"}: <span className="tabular-nums font-bold text-primary">{Math.round(totalUsageSpecQty * 1e4) / 1e4}</span> {t("specUnit") || "규격"}
                  </p>
                )}
                <Button className="h-12 w-full font-bold text-base" size="lg" onClick={addToCart} disabled={!selectedItem}>
                  <ShoppingCart className="mr-2 h-5 w-5" />
                  {t("addUsage")}
                </Button>
              </CardContent>
            </Card>
          )}

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
                        <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary">{item.code}</span>
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
                          {(h.userNick || h.userName) && <span className="ml-2">({t('useUsedBy') || '사용자'} {h.userNick || h.userName})</span>}
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
