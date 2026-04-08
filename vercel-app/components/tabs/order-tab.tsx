"use client"
import { appAlert } from "@/lib/app-message"

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
import {
  adminTabsBarCn,
  adminTabsContentFlushCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuth } from "@/lib/auth-context"
import { useStoreView } from "@/lib/store-view-context"
import { isOfficeRole, isOfficeStore } from "@/lib/permissions"
import { useLang } from "@/lib/lang-context"
import { useT, type I18nKeys } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { getAppData, processOrder, getMyOrderHistory, processOrderReceive, translateTexts, type AppItem, type OrderHistoryItem } from "@/lib/api-client"
import { cn, compressImageForUpload } from "@/lib/utils"
import { Minus, Plus, ShoppingCart, Trash2, Package, ClipboardList, Info } from "lucide-react"
import { ImageViewerWithRotate } from "@/components/ui/image-viewer-with-rotate"
import { ListPaginationBar } from "@/components/list-pagination-bar"

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

function parsePositiveIntQty(s: string): number {
  const n = parseInt(String(s).replace(/\D/g, ""), 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

/** 일부 수령 후 추가 수령 시: 아직 미수령인 줄 번호만 */
function getEligibleReceiveIndices(o: OrderHistoryItem): number[] {
  const items = o.items ?? []
  const partial =
    o.deliveryStatus === "일부배송완료" || o.deliveryStatus === "일부 배송 완료"
  if (!partial) return items.map((_, i) => i)
  const rec = new Set(o.receivedIndices ?? [])
  return items.map((_, i) => i).filter((i) => !rec.has(i))
}

interface CartItem {
  code: string
  name: string
  price: number
  qty: number
  taxType?: string
}

export function OrderTab() {
  const { auth } = useAuth()
  const { viewStore } = useStoreView()
  const { lang } = useLang()
  const t = useT(lang)
  const isOffice = auth && (isOfficeRole(auth.role || "") || isOfficeStore(auth.store || ""))
  const effectiveStore = isOffice && viewStore ? viewStore : auth?.store ?? ""
  const [items, setItems] = useState<AppItem[]>([])
  const [stock, setStock] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [quantityInput, setQuantityInput] = useState("1")
  const [selectedItem, setSelectedItem] = useState<AppItem | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [history, setHistory] = useState<OrderHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const histPageSize = 20
  const [histPage, setHistPage] = useState(1)
  const [histTotal, setHistTotal] = useState(0)
  const [histStart, setHistStart] = useState(todayStr)
  const [histEnd, setHistEnd] = useState(todayStr)
  const [imageModal, setImageModal] = useState<{ url: string; name: string } | null>(null)
  const [imageLoadError, setImageLoadError] = useState(false)
  const [descriptionModal, setDescriptionModal] = useState<{ name: string; description: string } | null>(null)
  const [descriptionTranslated, setDescriptionTranslated] = useState<string | null>(null)
  const [receiveModal, setReceiveModal] = useState<{ orderId: number; order: OrderHistoryItem } | null>(null)
  const [receivePhotoFiles, setReceivePhotoFiles] = useState<File[]>([])
  const [receivePhotoPreviews, setReceivePhotoPreviews] = useState<string[]>([])
  const [receiveSubmitting, setReceiveSubmitting] = useState(false)
  const [rejectReasonModal, setRejectReasonModal] = useState<{ order: OrderHistoryItem } | null>(null)
  const [inspectedItems, setInspectedItems] = useState<Record<number, Set<number>>>({})
  const [receivedQtys, setReceivedQtys] = useState<Record<number, Record<number, number>>>({})
  const receivedQtysRef = useRef<Record<number, Record<number, number>>>({})
  useEffect(() => {
    receivedQtysRef.current = receivedQtys
  }, [receivedQtys])

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
    getAppData(effectiveStore, { scope: 'order' })
      .then((r) => {
        setItems(r.items)
        setStock(r.stock || {})
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [effectiveStore])

  const addToCart = () => {
    if (!selectedItem) return
    const qty = parsePositiveIntQty(quantityInput)
    setCart((prev) => {
      const existing = prev.find((x) => x.code === selectedItem.code)
      if (existing) {
        return prev.map((x) =>
          x.code === selectedItem.code ? { ...x, qty: x.qty + qty } : x
        )
      }
      return [...prev, { code: selectedItem.code, name: selectedItem.name, price: selectedItem.price, qty, taxType: selectedItem.taxType }]
    })
    setSelectedItem(null)
    setQuantityInput("1")
  }

  const removeFromCart = (code: string) => {
    setCart((prev) => prev.filter((x) => x.code !== code))
  }

  const { subtotal, vat, total } = useMemo(() => {
    let sub = 0
    let taxableSub = 0
    for (const c of cart) {
      const amt = c.price * c.qty
      sub += amt
      if (c.taxType !== '면세' && c.taxType !== '영세율') taxableSub += amt
    }
    const v = Math.round(taxableSub * 0.07)
    return { subtotal: sub, vat: v, total: sub + v }
  }, [cart])

  const handlePlaceOrder = async () => {
    if (!effectiveStore || !auth?.user || cart.length === 0) return
    setSubmitting(true)
    try {
      const res = await processOrder({
        storeName: effectiveStore,
        userName: auth.user,
        cart: cart.map((c) => ({ code: c.code, name: c.name, price: c.price, qty: c.qty, taxType: c.taxType })),
      })
      if (res.success) {
        await appAlert(t('orderSuccess'))
        setCart([])
      } else {
        await appAlert(t('orderFail') + (res.message ? ': ' + translateApiMessage(res.message, t) : ''))
      }
    } catch (e) {
      await appAlert(t('orderFail') + ': ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSubmitting(false)
    }
  }

  const loadHistory = (page?: number) => {
    if (!effectiveStore) return
    const p = page ?? histPage
    setHistoryLoading(true)
    getMyOrderHistory({
      store: effectiveStore,
      startStr: histStart,
      endStr: histEnd,
      page: p,
      pageSize: histPageSize,
    })
      .then((res) => {
        setHistory(res.items)
        setHistTotal(res.total)
        setHistPage(res.page)
      })
      .catch(() => {
        setHistory([])
        setHistTotal(0)
      })
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
    if (d === "배송중") return "bg-sky-600 text-white dark:bg-sky-600"
    if (d === "배송완료" || d === "배송 완료") return "bg-emerald-600 text-white dark:bg-emerald-600"
    if (d === "일부배송완료" || d === "일부 배송 완료") return "bg-amber-500 text-white dark:bg-amber-600"
    return ""
  }

  const canReceive = (o: OrderHistoryItem) => {
    if (o.isForceOutbound || o.status !== "Approved") return false
    if (o.deliveryStatus === "배송완료" || o.deliveryStatus === "배송 완료") return false
    const partial = o.deliveryStatus === "일부배송완료" || o.deliveryStatus === "일부 배송 완료"
    if (partial && getEligibleReceiveIndices(o).length === 0) return false
    return true
  }

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
    const v = Math.max(0, value)
    const prev = receivedQtysRef.current
    const orderMap = prev[orderId] ?? {}
    const next = { ...prev, [orderId]: { ...orderMap, [itemIdx]: v } }
    receivedQtysRef.current = next
    setReceivedQtys(next)
  }

  const getReceivedQtyLatest = (orderId: number, itemIdx: number, defaultQty: number) => {
    return receivedQtysRef.current[orderId]?.[itemIdx] ?? receivedQtys[orderId]?.[itemIdx] ?? defaultQty
  }

  const isAllEligibleInspected = (o: OrderHistoryItem) => {
    const eligible = getEligibleReceiveIndices(o)
    if (eligible.length === 0) return true
    const checked = inspectedItems[o.id] ?? new Set<number>()
    return eligible.every((idx) => checked.has(idx))
  }

  const MAX_RECEIVE_PHOTOS = 5

  const openReceiveModal = (orderId: number, o: OrderHistoryItem) => {
    setInspectedItems((prev) => ({ ...prev, [orderId]: new Set<number>() }))
    setReceivedQtys((prev) => {
      const next = { ...prev }
      delete next[orderId]
      receivedQtysRef.current = next
      return next
    })
    setReceiveModal({ orderId, order: o })
    setReceivePhotoFiles([])
    setReceivePhotoPreviews((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p))
      return []
    })
  }

  const closeReceiveModal = () => {
    setReceivePhotoPreviews((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p))
      return []
    })
    setReceiveModal(null)
    setReceivePhotoFiles([])
    if (receiveCameraRef.current) receiveCameraRef.current.value = ""
    if (receiveFileRef.current) receiveFileRef.current.value = ""
  }

  const appendReceivePhotos = (newFiles: FileList | null) => {
    if (!newFiles?.length) return
    const valid = Array.from(newFiles).filter((f) => f.type.startsWith("image/"))
    if (!valid.length) return
    setReceivePhotoFiles((prev) => {
      const next = [...prev, ...valid].slice(0, MAX_RECEIVE_PHOTOS)
      setReceivePhotoPreviews((p) => {
        p.forEach((u) => URL.revokeObjectURL(u))
        return next.map((f) => URL.createObjectURL(f))
      })
      return next
    })
  }

  const removeReceivePhoto = (idx: number) => {
    setReceivePhotoFiles((prev) => prev.filter((_, i) => i !== idx))
    setReceivePhotoPreviews((prev) => {
      if (prev[idx]) URL.revokeObjectURL(prev[idx])
      return prev.filter((_, i) => i !== idx)
    })
  }

  const onReceiveCameraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith("image/")) {
      const dt = new DataTransfer()
      dt.items.add(file)
      appendReceivePhotos(dt.files)
    }
    e.target.value = ""
  }

  const onReceiveFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    appendReceivePhotos(e.target.files)
    e.target.value = ""
  }

  const handleReceiveSubmit = async () => {
    if (!receiveModal) return
    if (!receivePhotoFiles.length) {
      await appAlert(t("receivePhotoRequired"))
      return
    }
    const eligible = receiveModal.order ? getEligibleReceiveIndices(receiveModal.order) : []
    const isPartial = receiveModal.order && !isAllEligibleInspected(receiveModal.order)
    if (isPartial) {
      const inspectedSet = inspectedItems[receiveModal.order!.id] ?? new Set<number>()
      const picked = [...inspectedSet].filter((i) => eligible.includes(i))
      if (picked.length === 0) {
        await appAlert(t("inspectPartialMinItems"))
        return
      }
    }
    setReceiveSubmitting(true)
    const modal = receiveModal
    try {
      const dataUrls: string[] = []
      for (const file of receivePhotoFiles) {
        const dataUrl = await compressImageForUpload(file)
        if (dataUrl?.startsWith("data:image")) dataUrls.push(dataUrl)
      }
      if (!dataUrls.length) {
        await appAlert(t("orderFail"))
        setReceiveSubmitting(false)
        return
      }
      try {
        const elig = modal.order ? getEligibleReceiveIndices(modal.order) : []
        const inspectedSet = modal.order ? (inspectedItems[modal.order.id] ?? new Set<number>()) : new Set<number>()
        const inspectedIndices = [...inspectedSet].filter((i) => elig.includes(i)).sort((a, b) => a - b)
        const isPartial = modal.order ? inspectedIndices.length < elig.length : false
        const items = modal.order?.items ?? []
        const receivedQtysMap: Record<number, number> = {}
        if (isPartial) {
          inspectedIndices.forEach((idx) => {
            const it = items[idx]
            const origQty = it?.qty ?? 0
            receivedQtysMap[idx] = getReceivedQtyLatest(modal.order!.id, idx, origQty)
          })
        } else {
          elig.forEach((idx) => {
            const it = items[idx]
            receivedQtysMap[idx] = getReceivedQtyLatest(modal.order!.id, idx, it?.qty ?? 0)
          })
        }
        const res = await processOrderReceive({
            orderRowId: modal.orderId,
            imageUrls: dataUrls,
            isPartialReceive: isPartial,
            inspectedIndices: isPartial ? inspectedIndices : undefined,
            receivedQtys: receivedQtysMap,
          })
        if (res && res.success === true) {
          if (receiveCameraRef.current) receiveCameraRef.current.value = ""
          if (receiveFileRef.current) receiveFileRef.current.value = ""
          loadHistory()
          if (effectiveStore) {
            getAppData(effectiveStore, { scope: 'order' }).then((r) => setStock(r.stock || {}))
          }
          setReceivePhotoPreviews((p) => { p.forEach((u) => URL.revokeObjectURL(u)); return [] })
          setReceiveModal(null)
          setReceivePhotoFiles([])
          setReceivedQtys((prev) => {
            const next = { ...prev }
            delete next[modal.orderId]
            receivedQtysRef.current = next
            return next
          })
          setReceiveSubmitting(false)
          setTimeout(() => {
            void appAlert(t("receiveDone"))
          }, 50)
        } else {
          await appAlert(translateApiMessage(res?.message, t) || t("orderFail"))
        }
      } catch (err) {
        console.error("processOrderReceive error:", err)
        await appAlert(t("orderFail") + ": " + (err instanceof Error ? err.message : String(err)))
      } finally {
        setReceiveSubmitting(false)
      }
    } catch (err) {
      console.error("compressImage error:", err)
      await appAlert(t("orderFail") + ": " + (err instanceof Error ? err.message : String(err)))
      setReceiveSubmitting(false)
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
            <Button variant="ghost" size="sm" className="absolute -top-2 -right-2 rounded-full bg-black/50 text-white hover:bg-black/70" onClick={() => { setImageModal(null); setImageLoadError(false) }}>
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
            {receiveModal.order && !isAllEligibleInspected(receiveModal.order) && (
              <p className="mb-3 rounded-lg bg-amber-500/15 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">{t("inspectPartialWarning")}</p>
            )}
            <input
              ref={receiveCameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="absolute h-0 w-0 opacity-0"
              onChange={onReceiveCameraChange}
            />
            <input
              ref={receiveFileRef}
              type="file"
              accept="image/*"
              multiple
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
              {receivePhotoPreviews.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {receivePhotoPreviews.map((src, idx) => (
                    <div key={idx} className="relative">
                      <img src={src} alt="" className="h-[80px] w-[80px] rounded-lg object-cover" />
                      <button
                        type="button"
                        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white text-xs"
                        onClick={() => removeReceivePhoto(idx)}
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {receivePhotoFiles.length < MAX_RECEIVE_PHOTOS && (
                    <button
                      type="button"
                      onClick={() => receiveFileRef.current?.click()}
                      className="flex h-[80px] w-[80px] items-center justify-center rounded-lg border border-dashed border-muted-foreground/40 text-2xl text-muted-foreground hover:bg-muted/50"
                    >
                      +
                    </button>
                  )}
                </div>
              ) : (
                <p className="py-4 text-center text-xs text-muted-foreground">{t("receivePhotoRequired")}</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={closeReceiveModal}>
                {t("cancel")}
              </Button>
              <Button size="sm" onClick={handleReceiveSubmit} disabled={!receivePhotoFiles.length || receiveSubmitting}>
                {receiveSubmitting ? t("loading") : t("confirmReceive")}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
      <Tabs defaultValue="new" className={adminTabsRootCn}>
        <div className={adminTabsBarCn}>
          <div className={adminTabsScrollCn}>
            <TabsList className={adminTabsListRowCn}>
              <TabsTrigger value="new" className={adminTabsTriggerCn}>
                {t('ordNew')}
              </TabsTrigger>
              <TabsTrigger value="history" className={adminTabsTriggerCn}>
                {t('ordHistory')}
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="new" className={cn(adminTabsContentFlushCn, "flex flex-col gap-4")}>
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
                                    <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary">{item.code}</span>
                                    <span className="font-semibold">{item.name}</span>
                                    <span className="text-xs text-muted-foreground">({item.spec || "-"})</span>
                                    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold text-white ${isLow ? "bg-destructive" : "bg-[#16a34a]"}`}>
                                      {isLow ? t("stockLow") + ":" + qty : t("stock") + ":" + qty}
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
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-l-xl text-primary"
                onClick={() =>
                  setQuantityInput(String(Math.max(1, parsePositiveIntQty(quantityInput) - 1)))
                }
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label={t("qty")}
                className="h-10 w-[4.5rem] min-w-[3.25rem] max-w-[7rem] rounded-none border-0 border-x border-border bg-transparent text-center text-sm font-semibold shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                value={quantityInput}
                onChange={(e) => setQuantityInput(e.target.value.replace(/\D/g, ""))}
                onBlur={() => setQuantityInput(String(parsePositiveIntQty(quantityInput)))}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-r-xl text-primary"
                onClick={() => setQuantityInput(String(parsePositiveIntQty(quantityInput) + 1))}
              >
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
                            <td className="px-3 py-2 font-medium">
                              <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary mr-1">{c.code}</span>
                              {c.name}
                            </td>
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

        <TabsContent value="history" className={cn(adminTabsContentFlushCn, "flex flex-col gap-4")}>
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
            <Button size="sm" className="h-9 font-medium" onClick={() => loadHistory(1)} disabled={historyLoading}>
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
                              {(o.userNick || o.userName) && (
                                <span className="text-xs text-muted-foreground">({t("orderOrderedBy") || "발주자"} {o.userNick || o.userName})</span>
                              )}
                              {o.deliveryDate && (
                                <span className="text-xs text-muted-foreground">{t("deliveryDate")} {o.deliveryDate}</span>
                              )}
                              {o.isForceOutbound && (
                                <Badge variant="outline" className="text-sm px-2.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300">
                                  {t("outTypeForce") || "강제출고"}
                                </Badge>
                              )}
                              <Badge
                                variant={o.status === "Rejected" ? "destructive" : "outline"}
                                className={`text-sm px-2.5 py-0.5 ${o.status === "Rejected" ? "bg-destructive text-destructive-foreground border-0" : ""} ${o.status === "Rejected" && o.rejectReason ? "cursor-pointer" : ""}`}
                                onClick={o.status === "Rejected" && o.rejectReason ? (e) => { e.stopPropagation(); setRejectReasonModal({ order: o }); } : undefined}
                              >
                                {translateOrderStatus(o.status || "")}
                              </Badge>
                              {(o.deliveryStatus === "배송중" || o.deliveryStatus === "배송 완료" || o.deliveryStatus === "배송완료" || o.deliveryStatus === "일부배송완료" || o.deliveryStatus === "일부 배송 완료") && (
                                <Badge className={`text-sm px-2.5 py-0.5 ${deliveryStatusColor(o.deliveryStatus)}`}>
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
                          <div className="space-y-3 text-sm">
                            {(() => {
                              const items = o.items || []
                              const byLocation = new Map<string, typeof items>()
                              for (const it of items) {
                                const loc = it.outboundLocation || "(미지정)"
                                if (!byLocation.has(loc)) byLocation.set(loc, [])
                                byLocation.get(loc)!.push(it)
                              }
                              const groups = Array.from(byLocation.entries()).sort((a, b) => a[0].localeCompare(b[0]))
                              const eligibleReceiveIdx = getEligibleReceiveIndices(o)
                              return groups.map(([loc, locItems]) => (
                                <div key={loc} className="space-y-1.5">
                                  <div className="text-xs font-semibold text-primary/90 border-b border-border/60 pb-1">
                                    {t("outWhWarehouseCol") || "출고지"}: {loc}
                                    {(o.deliveryDatesByOutbound?.[loc] || o.deliveryDate) && (
                                      <span className="ml-1.5 text-muted-foreground font-normal">
                                        · {t("deliveryDate")} {(o.deliveryDatesByOutbound?.[loc] || o.deliveryDate)}
                                      </span>
                                    )}
                                  </div>
                                  {locItems.map((it) => {
                                    const idx = it.index ?? items.indexOf(it)
                                    const showCheck = canReceive(o) && eligibleReceiveIdx.includes(idx)
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
                                          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] text-white dark:bg-emerald-600" title={t("itemReceived")}>✓</span>
                                        )}
                                        {!showCheck && !isReceived && (o.deliveryStatus === "일부배송완료" || o.deliveryStatus === "일부 배송 완료") && (
                                          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 shrink-0" title={t("outItemUnreceived") || "미수령"}>
                                            {t("outItemUnreceived") || "미수령"}
                                          </span>
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
                                          <span className="text-muted-foreground shrink-0">
                                            × {it.originalQty != null && it.receivedQty != null && it.originalQty !== it.receivedQty
                                              ? `${it.originalQty} → ${it.receivedQty}`
                                              : (it.receivedQty ?? it.qty ?? "-")}
                                          </span>
                                        )}
                                        {isReceived && <Badge variant="secondary" className="text-[10px] shrink-0">{t("itemReceived")}</Badge>}
                                      </div>
                                    )
                                  })}
                                </div>
                              ))
                            })()}
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
          <ListPaginationBar
            page={histPage}
            pageSize={histPageSize}
            total={histTotal}
            onPageChange={(p) => loadHistory(p)}
            disabled={historyLoading}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={!!rejectReasonModal} onOpenChange={(open) => !open && setRejectReasonModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("reasonPh") || "사유"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{rejectReasonModal?.order?.rejectReason || "-"}</p>
        </DialogContent>
      </Dialog>
    </div>
  )
}
