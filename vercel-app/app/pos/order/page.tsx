"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import Image from "next/image"
import {
  getPosMenus,
  getPosMenuCategories,
  getPosMenuOptions,
  getPosPromosWithItems,
  getPosOrders,
  getPosTodaySales,
  getPosTableLayout,
  getPosPrinterSettings,
  validatePosCoupon,
  useStoreList,
  type PosMenu,
  type PosMenuOption,
  type PosOrder,
  type PosPromoWithItems,
} from "@/lib/api-client"
import { savePosOrderWithOffline } from "@/lib/offline"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { cn, escapeHtml } from "@/lib/utils"
import { Minus, Plus, Printer, RefreshCw, RotateCcw, ShoppingCart, Tag, Trash2, X } from "lucide-react"
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
import { OfflineBanner } from "@/components/offline-banner"

type OrderType = "dine_in" | "takeout" | "delivery"

/** 치킨 기본 옵션(S 순살): POS 옵션 목록에서 제외, "기본 (S 순살)" 버튼으로만 선택 */
function isChickenDefaultOption(name: string | undefined): boolean {
  if (!name?.trim()) return false
  const n = name.trim()
  return /^S\s*[-]?\s*순살\s*$/i.test(n) || n === "S 순살" || n === "S - 순살" || n === "S-순살"
}

interface CartItem {
  id: string
  name: string
  price: number
  qty: number
  optionId?: string
  optionName?: string
  /** 반반: 1번째 맛 메뉴/옵션 ID (S 순살) */
  menuId1?: string
  optionId1?: string
  menuId2?: string
  optionId2?: string
  promoId?: string
  promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
}

function getInitialOrderType(searchParams: URLSearchParams | null): OrderType {
  const type = searchParams?.get("type")?.toLowerCase()
  if (type === "takeout" || type === "delivery" || type === "dine_in") return type
  return "dine_in"
}

export default function PosOrderPage() {
  const searchParams = useSearchParams()
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()
  const [menus, setMenus] = React.useState<PosMenu[]>([])
  const [promos, setPromos] = React.useState<PosPromoWithItems[]>([])
  const [categories, setCategories] = React.useState<string[]>([])
  const [mainCategories, setMainCategories] = React.useState<string[]>([])
  const [selectedMainCategory, setSelectedMainCategory] = React.useState<string>("")
  const [allOptions, setAllOptions] = React.useState<PosMenuOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [optionPickerMenu, setOptionPickerMenu] = React.useState<PosMenu | null>(null)
  const [optionPickerStep, setOptionPickerStep] = React.useState(0)
  const [optionPickerSelections, setOptionPickerSelections] = React.useState<Record<string, string>>({})
  /** 반반: 1번째 맛(메뉴) 선택 후 저장, 2번째 맛 선택 시 장바구니 추가 */
  const [optionPickerBanbanFirst, setOptionPickerBanbanFirst] = React.useState<PosMenu | null>(null)
  const [selectedCategory, setSelectedCategory] = React.useState<string>("")
  const [cart, setCart] = React.useState<CartItem[]>([])
  const [orderType, setOrderType] = React.useState<OrderType>(() => getInitialOrderType(searchParams))
  const [storeCode, setStoreCode] = React.useState("")
  const [tableName, setTableName] = React.useState("")
  const [tableOptions, setTableOptions] = React.useState<{ id: string; name: string }[]>([])
  const [discountType, setDiscountType] = React.useState<"pct" | "amt">("amt")
  const [discountValue, setDiscountValue] = React.useState("")
  const [discountReason, setDiscountReason] = React.useState("")
  const [couponCode, setCouponCode] = React.useState("")
  const [appliedCoupon, setAppliedCoupon] = React.useState<{ name: string; discountAmt: number; discountReason: string } | null>(null)
  const [couponLoading, setCouponLoading] = React.useState(false)
  const [memo, setMemo] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [recentOrders, setRecentOrders] = React.useState<PosOrder[]>([])
  const [recentLoading, setRecentLoading] = React.useState(false)
  const [todaySales, setTodaySales] = React.useState<{
    completedCount: number
    completedTotal: number
    pendingCount: number
  } | null>(null)
  const [storeFees, setStoreFees] = React.useState({ deliveryFee: 0, packagingFee: 0 })
  const [showPaymentModal, setShowPaymentModal] = React.useState(false)
  const [payCash, setPayCash] = React.useState("")
  const [payCard, setPayCard] = React.useState("")
  const [payQr, setPayQr] = React.useState("")
  const [payOther, setPayOther] = React.useState("")
  const [receiptData, setReceiptData] = React.useState<{
    orderNo: string
    items: CartItem[]
    subtotal: number
    discountAmt: number
    deliveryFee: number
    packagingFee: number
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

  const loadStoreFees = React.useCallback(() => {
    if (!storeCode) return
    getPosPrinterSettings({ storeCode })
      .then((s) => setStoreFees({ deliveryFee: s.deliveryFee ?? 0, packagingFee: s.packagingFee ?? 0 }))
      .catch(() => setStoreFees({ deliveryFee: 0, packagingFee: 0 }))
  }, [storeCode])

  React.useEffect(() => {
    loadStoreFees()
  }, [loadStoreFees])

  const loadMenusAndPromos = React.useCallback(() => {
    setLoading(true)
    Promise.all([getPosMenus(), getPosMenuCategories(), getPosMenuOptions(), getPosPromosWithItems()])
      .then(([list, { categories: cats, mainCategories: mains }, opts, promoList]) => {
        setMenus(list || [])
        setPromos(promoList || [])
        setAllOptions(opts || [])
        const promoCategories = [...new Set((promoList || []).map((p) => p.category).filter(Boolean))]
        const merged = [...new Set([...(cats || []), ...promoCategories])].sort()
        setCategories(merged)
        setMainCategories(mains || [])
        setSelectedMainCategory((prev) => ((mains || []).includes(prev) ? prev : ""))
        setSelectedCategory((prev) => (merged.includes(prev) ? prev : ""))
      })
      .catch(() => {
        setMenus([])
        setPromos([])
        setCategories([])
        setAllOptions([])
      })
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    loadMenusAndPromos()
  }, [loadMenusAndPromos])

  const optionsByMenuId = React.useMemo(() => {
    const sellKey = orderType === "dine_in" ? "sellHall" : orderType === "delivery" ? "sellDelivery" : "sellPackaging"
    const m: Record<string, PosMenuOption[]> = {}
    for (const o of allOptions) {
      const sell = o[sellKey]
      if (sell === false) continue
      const mid = o.menuId
      if (!m[mid]) m[mid] = []
      m[mid].push(o)
    }
    return m
  }, [allOptions, orderType])

  /** 반반용: 코드 c로 시작하는 치킨 메뉴 (기본가=S 순살, 옵션 없이 맛 2개 선택) */
  const chickenMenusForBanban = React.useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return menus.filter(
      (m) =>
        m.isActive &&
        (!m.soldOutDate || m.soldOutDate !== today) &&
        m.code?.trim().toLowerCase().startsWith("c") &&
        !m.isBanban
    )
  }, [menus])

  const todayStr = new Date().toISOString().slice(0, 10)
  /** 선택한 대분류에 속한 소분류만 (메뉴 기준) */
  const categoriesForSelectedMain = React.useMemo(() => {
    if (!selectedMainCategory) return [] as string[]
    const set = new Set(menus.filter((m) => (m.categoryMain ?? "") === selectedMainCategory).map((m) => m.category).filter(Boolean))
    return Array.from(set).sort()
  }, [menus, selectedMainCategory])

  const filteredMenus = React.useMemo(() => {
    const active = menus.filter((m) => m.isActive)
    const notSoldOut = active.filter((m) => !m.soldOutDate || m.soldOutDate !== todayStr)
    if (!selectedMainCategory || !selectedCategory) return []
    return notSoldOut.filter(
      (m) => (m.categoryMain ?? "") === selectedMainCategory && m.category === selectedCategory
    )
  }, [menus, selectedCategory, selectedMainCategory, todayStr])

  const filteredPromos = React.useMemo(() => {
    const active = promos.filter((p) => p.isActive)
    if (!selectedCategory) return active
    return active.filter((p) => p.category === selectedCategory)
  }, [promos, selectedCategory])

  const getPromoPrice = (p: PosPromoWithItems) =>
    orderType === "delivery" && p.priceDelivery != null ? p.priceDelivery : p.price

  const getMenuPrice = (menu: PosMenu) =>
    orderType === "delivery" && menu.priceDelivery != null ? menu.priceDelivery : menu.price
  const getOptionModifier = (opt: PosMenuOption) => {
    if (orderType === "delivery" && opt.priceModifierDelivery != null) return opt.priceModifierDelivery
    if (orderType === "takeout" && opt.priceModifierPackaging != null) return opt.priceModifierPackaging
    return opt.priceModifier ?? 0
  }

  const addToCartWithOption = (menu: PosMenu, opt: PosMenuOption | null, defaultOptionDisplayName?: string) => {
    const cartId = opt ? `${menu.id}-${opt.id}` : menu.id
    const name = opt ? `${menu.name} (${opt.name})` : (defaultOptionDisplayName ? `${menu.name} (${defaultOptionDisplayName})` : menu.name)
    const price = getMenuPrice(menu) + (opt ? getOptionModifier(opt) : 0)
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
        optionName: opt?.name ?? defaultOptionDisplayName,
      }]
    })
    setOptionPickerMenu(null)
    setOptionPickerStep(0)
    setOptionPickerSelections({})
  }

  const addToCart = (menu: PosMenu) => {
    if (menu.isBanban) {
      setOptionPickerBanbanFirst(null)
      setOptionPickerMenu(menu)
      return
    }
    const opts = optionsByMenuId[menu.id]
    if (opts && opts.length > 0) {
      setOptionPickerMenu(menu)
      return
    }
    addToCartWithOption(menu, null)
  }

  /** 반반: 치킨 메뉴 2개(기본가=S 순살)를 골라 한 상으로 추가, 원가 = 각 0.5씩 */
  const addToCartBanban = (banbanMenu: PosMenu, menu1: PosMenu, menu2: PosMenu) => {
    const ids = [menu1.id, menu2.id].sort()
    const cartId = `banban-${ids.join("-")}`
    const name = `${banbanMenu.name} (${menu1.name} / ${menu2.name})`
    const price = Math.round((getMenuPrice(menu1) + getMenuPrice(menu2)) / 2)
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
        menuId1: menu1.id,
        optionId1: undefined,
        menuId2: menu2.id,
        optionId2: undefined,
      }]
    })
    setOptionPickerMenu(null)
    setOptionPickerBanbanFirst(null)
  }

  const addPromoToCart = (promo: PosPromoWithItems) => {
    const cartId = `promo-${promo.id}`
    const price = getPromoPrice(promo)
    setCart((prev) => {
      const i = prev.findIndex((x) => x.id === cartId)
      if (i >= 0) {
        const n = [...prev]
        n[i] = { ...n[i], qty: n[i].qty + 1 }
        return n
      }
      return [...prev, {
        id: cartId,
        name: promo.name,
        price,
        qty: 1,
        promoId: promo.id,
        promoItems: promo.items || [],
      }]
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
      for (const it of order.items as { id?: string; name?: string; price?: number; qty?: number; menuId1?: string; optionId1?: string; menuId2?: string; optionId2?: string; promoId?: string; promoItems?: { menuId: string; optionId: string | null; quantity: number }[] }[]) {
        const id = String(it.id ?? "")
        const name = String(it.name ?? "")
        const price = Number(it.price ?? 0)
        const qty = Number(it.qty ?? 1)
        if (!id) continue
        const i = next.findIndex((x) => x.id === id)
        const item = { id, name, price, qty, ...(it.menuId1 != null && { menuId1: it.menuId1, optionId1: it.optionId1, menuId2: it.menuId2, optionId2: it.optionId2 }), ...(it.promoId && it.promoItems && { promoId: it.promoId, promoItems: it.promoItems }) }
        if (i >= 0) {
          next[i] = { ...next[i], qty: next[i].qty + qty }
        } else {
          next.push(item)
        }
      }
      return next
    })
  }

  const subtotal = cart.reduce((s, it) => s + it.price * it.qty, 0)
  const manualDiscount =
    discountType === "pct"
      ? Math.round(subtotal * (Number(discountValue) || 0) / 100)
      : Math.min(subtotal, Math.max(0, Number(discountValue) || 0))
  const discountAmt = appliedCoupon ? appliedCoupon.discountAmt : manualDiscount
  const effectiveDiscountReason = appliedCoupon ? appliedCoupon.discountReason : discountReason.trim()
  const deliveryFeeAmt = orderType === "delivery" ? storeFees.deliveryFee : 0
  const packagingFeeAmt = orderType === "takeout" ? storeFees.packagingFee : 0
  const total = Math.max(0, subtotal - discountAmt + deliveryFeeAmt + packagingFeeAmt)

  const handleApplyCoupon = async () => {
    const code = couponCode.trim().toUpperCase()
    if (!code) return
    setCouponLoading(true)
    try {
      const res = await validatePosCoupon({ code, subtotal })
      if (res.valid && res.discountAmt != null) {
        setAppliedCoupon({
          name: res.couponName ?? code,
          discountAmt: res.discountAmt,
          discountReason: res.discountReason ?? `쿠폰: ${code}`,
        })
        setDiscountValue("")
        setDiscountReason("")
      } else {
        alert(res.message ?? (t("posCouponInvalid") || "유효하지 않은 쿠폰입니다."))
      }
    } catch (e) {
      alert(String(e))
    } finally {
      setCouponLoading(false)
    }
  }

  const handleClearCoupon = () => {
    setAppliedCoupon(null)
    setCouponCode("")
  }

  React.useEffect(() => {
    if (appliedCoupon) setAppliedCoupon(null)
  }, [cart])

  const openPaymentModal = () => {
    if (cart.length === 0) {
      alert(t("posCartEmpty") || "장바구니가 비어 있습니다.")
      return
    }
    setPayCash(String(total))
    setPayCard("0")
    setPayQr("0")
    setPayOther("0")
    setShowPaymentModal(true)
  }

  const handleCheckout = async (payment: { cash: number; card: number; qr: number; other: number }) => {
    if (cart.length === 0) return
    const sum = payment.cash + payment.card + payment.qr + payment.other
    if (Math.abs(sum - total) > 0.01) {
      alert(t("posPaymentSumMismatch") || "결제 합계가 주문 금액과 일치하지 않습니다.")
      return
    }
    setSubmitting(true)
    try {
      const res = await savePosOrderWithOffline({
        storeCode: storeCode || "ST01",
        orderType,
        tableName: orderType === "dine_in" ? tableName : "",
        memo: memo.trim() || undefined,
        discountAmt: discountAmt || undefined,
        discountReason: effectiveDiscountReason || undefined,
        deliveryFee: deliveryFeeAmt || undefined,
        packagingFee: packagingFeeAmt || undefined,
        paymentCash: payment.cash || undefined,
        paymentCard: payment.card || undefined,
        paymentQr: payment.qr || undefined,
        paymentOther: payment.other || undefined,
        items: cart.map((it) => ({
          id: it.id,
          name: it.name,
          price: it.price,
          qty: it.qty,
          ...(it.menuId1 != null && { menuId1: it.menuId1, optionId1: it.optionId1, menuId2: it.menuId2, optionId2: it.optionId2 }),
          ...(it.promoId && it.promoItems && { promoId: it.promoId, promoItems: it.promoItems }),
        })),
      })
      if (res.success) {
        setShowPaymentModal(false)
        setReceiptData({
          orderNo: res.orderNo ?? "",
          items: [...cart],
          subtotal,
          discountAmt,
          deliveryFee: deliveryFeeAmt,
          packagingFee: packagingFeeAmt,
          total,
          storeCode: storeCode || "ST01",
          orderType,
          tableName: orderType === "dine_in" ? tableName : "",
          memo: memo.trim(),
          discountReason: effectiveDiscountReason,
        })
        clearCart()
        setMemo("")
        setDiscountValue("")
        setDiscountReason("")
        handleClearCoupon()
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

  const handlePrintKitchenSlip = async () => {
    if (!receiptData || !receiptData.storeCode) return
    const win = window.open("", "_blank")
    if (!win) {
      alert(t("posPrintBlocked") || "팝업이 차단되었습니다. 인쇄를 허용해 주세요.")
      return
    }
    try {
      const settings = await getPosPrinterSettings({ storeCode: receiptData.storeCode })
      const categoryByMenuId = Object.fromEntries(menus.map((m) => [String(m.id), m.category]))
      const kitchen1 = settings.kitchen1Categories || []
      const kitchen2 = settings.kitchen2Categories || []
      const mode = settings.kitchenMode || 1

      const toSlips = (): { label: string; items: CartItem[] }[] => {
        if (mode === 1) {
          return [{ label: t("posKitchenOrder") || "주방 주문서", items: receiptData.items }]
        }
        const slip1: CartItem[] = []
        const slip2: CartItem[] = []
        for (const it of receiptData.items) {
          const menuId = String(it.id ?? "").split("-")[0]
          const cat = categoryByMenuId[menuId] ?? ""
          if (kitchen2.includes(cat)) {
            slip2.push(it)
          } else {
            slip1.push(it)
          }
        }
        const result: { label: string; items: CartItem[] }[] = []
        if (slip1.length) result.push({ label: `${t("posKitchen1") || "주방 1"}`, items: slip1 })
        if (slip2.length) result.push({ label: `${t("posKitchen2") || "주방 2"}`, items: slip2 })
        return result.length ? result : [{ label: t("posKitchenOrder") || "주방 주문서", items: receiptData.items }]
      }
      const slips = toSlips()
      const printOne = (idx: number) => {
        if (idx >= slips.length) return
        const slip = slips[idx]
        const w = idx === 0 ? win : window.open("", "_blank")
        if (!w) return
        const html = `
          <!DOCTYPE html>
          <html><head><title>${escapeHtml(slip.label)}</title>
          <style>
            body { font-family: sans-serif; font-size: 18px; padding: 20px; max-width: 320px; }
            .k-header { text-align: center; font-size: 22px; font-weight: bold; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px; }
            .k-row { margin: 6px 0; font-size: 18px; }
            .k-memo { margin-top: 8px; padding: 8px; background: #f0f0f0; font-size: 16px; }
          </style></head><body>
          <div class="k-header">${escapeHtml(slip.label)}</div>
          <div class="k-row"><strong>${escapeHtml(receiptData.orderNo)}</strong></div>
          <div class="k-row">${escapeHtml(receiptData.storeCode + " · " + (orderTypeLabels[receiptData.orderType as OrderType] || receiptData.orderType) + (receiptData.tableName ? ` · ${t("posTable") || "테이블"}: ${receiptData.tableName}` : ""))}</div>
          <div class="k-row">${new Date().toLocaleString("ko-KR")}</div>
          <hr style="margin: 10px 0;" />
          ${slip.items.map((it) => `<div class="k-row">${escapeHtml(it.name)} × ${it.qty}</div>`).join("")}
          ${receiptData.memo ? `<div class="k-memo">${escapeHtml((t("posCustomerMemo") || "메모") + ": " + receiptData.memo)}</div>` : ""}
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
      alert(String(e))
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
    <div className="flex h-full flex-col">
      <OfflineBanner
          onSyncComplete={loadTodaySales}
          offlineMsg={t("posOfflineSaved") || "오프라인 모드 - 주문이 로컬에 저장됩니다. 복구 후 자동 전송됩니다."}
          syncingMsg={t("posSyncing") || "동기화 중..."}
          retryLabel={t("posRetrySync") || "재시도"}
        />
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
        {/* 1단계: 주문 유형 선택 (매장/포장/배달) */}
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3">
          <span className="shrink-0 text-xs font-medium text-slate-400">
            {t("posOrderType") || "주문 유형"}
          </span>
          <div className="flex gap-2">
            {(["dine_in", "takeout", "delivery"] as OrderType[]).map((typ) => (
              <button
                key={typ}
                onClick={() => setOrderType(typ)}
                className={cn(
                  "rounded-lg px-5 py-2.5 text-sm font-semibold transition",
                  orderType === typ ? "bg-amber-500 text-slate-900" : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300"
                )}
              >
                {orderTypeLabels[typ]}
              </button>
            ))}
          </div>
        </div>
        {/* 2단계: 대분류 선택 */}
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-800 bg-slate-900/50 px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 text-slate-400 hover:text-white"
            onClick={loadMenusAndPromos}
            disabled={loading}
            title={t("posRefreshMenus") || "메뉴 새로고침"}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <span className="shrink-0 text-xs text-slate-400">{t("posMainCategory") || "대분류"}</span>
          <div className="flex flex-1 gap-2 overflow-x-auto">
            {mainCategories.map((main) => (
              <button
                key={main}
                onClick={() => {
                  setSelectedMainCategory(main)
                  setSelectedCategory("")
                }}
                className={cn(
                  "shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition",
                  selectedMainCategory === main ? "bg-amber-500 text-slate-900" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                )}
              >
                {main}
              </button>
            ))}
          </div>
        </div>
        {/* 3단계: 카테고리(소분류) 선택 */}
        {selectedMainCategory && (
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-800 bg-slate-800/50 px-3 py-2">
            <span className="shrink-0 text-xs text-slate-400">{t("posCategory") || "카테고리"}</span>
            <div className="flex flex-1 gap-2 overflow-x-auto">
              {categoriesForSelectedMain.map((c) => (
                <button
                  key={c}
                  onClick={() => setSelectedCategory(c)}
                  className={cn(
                    "shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition",
                    selectedCategory === c ? "bg-amber-500 text-slate-900" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filteredPromos.map((p) => (
              <button
                key={`promo-${p.id}`}
                onClick={() => addPromoToCart(p)}
                className="flex flex-col overflow-hidden rounded-xl border border-amber-600/50 bg-amber-900/30 p-2 text-left transition hover:border-amber-500 hover:bg-amber-800/40 active:scale-[0.98]"
              >
                <div className="relative aspect-square shrink-0 overflow-hidden rounded-lg bg-slate-700/80 flex items-center justify-center">
                  <span className="text-3xl">🏷️</span>
                </div>
                <div className="mt-2 truncate text-sm font-medium text-white">{p.name}</div>
                <div className="text-xs font-bold text-amber-400">
                  {(getPromoPrice(p)) > 0 ? `${(getPromoPrice(p)).toLocaleString()} ฿` : "-"}
                </div>
              </button>
            ))}
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
                  {(getMenuPrice(m)) > 0 ? `${(getMenuPrice(m)).toLocaleString()} ฿` : "-"}
                </div>
              </button>
            ))}
          </div>
          {!selectedMainCategory && (
            <div className="col-span-full py-12 text-center text-slate-400">
              {t("posSelectMainCategoryFirst") || "주문 유형 선택 후, 위에서 대분류를 선택하세요."}
            </div>
          )}
          {selectedMainCategory && !selectedCategory && (
            <div className="col-span-full py-12 text-center text-slate-400">
              {t("posSelectCategoryFirst") || "카테고리를 선택하세요."}
            </div>
          )}
          {selectedMainCategory && selectedCategory && filteredMenus.length === 0 && filteredPromos.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-400">
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
            <label className="text-xs text-slate-400">{t("posCoupon") || "쿠폰"}</label>
            {appliedCoupon ? (
              <div className="mt-1 flex items-center justify-between rounded-lg border border-green-600/50 bg-green-500/10 px-2 py-1.5 text-sm">
                <span className="text-green-400 truncate">{appliedCoupon.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-slate-400 hover:text-white"
                  onClick={handleClearCoupon}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div className="mt-1 flex gap-1">
                <Input
                  placeholder={t("posCouponCodePh") || "쿠폰 코드"}
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleApplyCoupon()}
                  className="h-9 flex-1 border-slate-600 bg-slate-800 text-sm uppercase"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 border-slate-600 bg-slate-800 px-3"
                  onClick={handleApplyCoupon}
                  disabled={!couponCode.trim() || couponLoading}
                >
                  <Tag className="mr-1 h-3.5 w-3.5" />
                  {couponLoading ? "..." : t("posCouponApply") || "적용"}
                </Button>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-slate-400">{t("posDiscount") || "할인"}</label>
            <div className={cn("mt-1 flex gap-2", appliedCoupon && "opacity-50")}>
              <div className="flex rounded-lg border border-slate-600 bg-slate-800 overflow-hidden">
                <button
                  type="button"
                  onClick={() => !appliedCoupon && setDiscountType("amt")}
                  disabled={!!appliedCoupon}
                  className={cn(
                    "px-2 py-1.5 text-xs",
                    discountType === "amt" ? "bg-amber-500/30 text-amber-400" : "text-slate-500"
                  )}
                >
                  ฿
                </button>
                <button
                  type="button"
                  onClick={() => !appliedCoupon && setDiscountType("pct")}
                  disabled={!!appliedCoupon}
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
                disabled={!!appliedCoupon}
              />
              <Input
                placeholder={t("posDiscountReasonPh") || "사유"}
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                className="h-9 flex-1 border-slate-600 bg-slate-800 text-sm"
                disabled={!!appliedCoupon}
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
            {deliveryFeeAmt > 0 && (
              <div className="flex justify-between text-sm text-slate-400">
                <span>{t("posDeliveryFee") || "배달 수수료"}</span>
                <span className="tabular-nums">+{deliveryFeeAmt.toLocaleString()} ฿</span>
              </div>
            )}
            {packagingFeeAmt > 0 && (
              <div className="flex justify-between text-sm text-slate-400">
                <span>{t("posPackagingFee") || "포장 수수료"}</span>
                <span className="tabular-nums">+{packagingFeeAmt.toLocaleString()} ฿</span>
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
            onClick={openPaymentModal}
          >
            {submitting ? "..." : t("posCheckout") || "결제"}
          </Button>
        </div>
      </div>
      </div>

      {/* 분할 결제 모달 */}
      <Dialog open={showPaymentModal} onOpenChange={(open) => !open && setShowPaymentModal(false)}>
        <DialogContent className="max-w-xs sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("posSplitPayment") || "결제 수단 입력"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-center">
              <span className="text-xs text-muted-foreground">{t("posInputTotal") || "합계"}</span>
              <div className="text-xl font-bold tabular-nums">{total.toLocaleString()} ฿</div>
            </div>
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <label className="w-16 text-sm">{t("posPaymentCash") || "현금"}</label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={payCash}
                  onChange={(e) => setPayCash(e.target.value)}
                  className="h-9 text-right"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="w-16 text-sm">{t("posPaymentCard") || "카드"}</label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={payCard}
                  onChange={(e) => setPayCard(e.target.value)}
                  className="h-9 text-right"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="w-16 text-sm">{t("posPaymentQr") || "QR"}</label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={payQr}
                  onChange={(e) => setPayQr(e.target.value)}
                  className="h-9 text-right"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="w-16 text-sm">{t("posPaymentOther") || "기타"}</label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={payOther}
                  onChange={(e) => setPayOther(e.target.value)}
                  className="h-9 text-right"
                />
              </div>
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span>{t("posPaymentSum") || "입력 합계"}</span>
              <span className={cn(
                "tabular-nums font-medium",
                Math.abs((parseFloat(payCash) || 0) + (parseFloat(payCard) || 0) + (parseFloat(payQr) || 0) + (parseFloat(payOther) || 0) - total) < 0.01
                  ? "text-green-600"
                  : "text-amber-600"
              )}>
                {((parseFloat(payCash) || 0) + (parseFloat(payCard) || 0) + (parseFloat(payQr) || 0) + (parseFloat(payOther) || 0)).toLocaleString()} ฿
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setPayCash(String(total))
                  setPayCard("0")
                  setPayQr("0")
                  setPayOther("0")
                }}
              >
                {t("posPaymentFullCash") || "전액 현금"}
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-amber-500 font-bold text-slate-900 hover:bg-amber-400"
                disabled={submitting}
                onClick={() => handleCheckout({
                  cash: parseFloat(payCash) || 0,
                  card: parseFloat(payCard) || 0,
                  qr: parseFloat(payQr) || 0,
                  other: parseFloat(payOther) || 0,
                })}
              >
                {submitting ? "..." : t("posCheckout") || "결제"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 옵션 선택 모달 - 단계별(사이즈→순살/뼈) 또는 평면 목록 */}
      <Dialog
        open={!!optionPickerMenu}
        onOpenChange={(open) => {
          if (!open) {
            setOptionPickerMenu(null)
            setOptionPickerStep(0)
            setOptionPickerSelections({})
            setOptionPickerBanbanFirst(null)
          }
        }}
      >
        <DialogContent className="max-w-xs sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {optionPickerMenu?.name} — {t("posSelectOption") || "옵션 선택"}
              {optionPickerMenu?.optionSelectionGroups?.length
                ? ` (${(optionPickerStep || 0) + 1}/${optionPickerMenu.optionSelectionGroups.length})`
                : ""}
            </DialogTitle>
          </DialogHeader>
          {optionPickerMenu && (() => {
            if (optionPickerMenu.isBanban) {
              const first = optionPickerBanbanFirst
              const list = chickenMenusForBanban
              return (
                <div className="flex flex-col gap-3 py-2">
                  <p className="text-xs text-muted-foreground">
                    {first ? (t("posBanbanSecondHalf") || "2번째 맛") : (t("posBanbanFirstHalf") || "1번째 맛")}
                  </p>
                  {first && (
                    <p className="text-xs font-medium text-amber-400">
                      {t("posBanbanFirstSelected") || "1번째"}: {first.name}
                    </p>
                  )}
                  {list.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("posBanbanNoChicken") || "치킨 메뉴가 없습니다."}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {list.map((menu) => (
                        <button
                          key={menu.id}
                          type="button"
                          onClick={() => {
                            if (first) {
                              addToCartBanban(optionPickerMenu, first, menu)
                            } else {
                              setOptionPickerBanbanFirst(menu)
                            }
                          }}
                          className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-left transition hover:border-amber-500/50 hover:bg-slate-700"
                        >
                          <span className="block font-medium">{menu.name}</span>
                          <span className="text-xs text-amber-400">{getMenuPrice(menu).toLocaleString()} ฿</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {first && (
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => setOptionPickerBanbanFirst(null)}>
                      ← {t("posBack") || "이전"} ({t("posBanbanFirstHalf") || "1번째 맛 다시"})
                    </Button>
                  )}
                </div>
              )
            }
            const opts = optionsByMenuId[optionPickerMenu.id] || []
            const isChickenBasePrice = (optionPickerMenu.categoryMain ?? "") === "Chicken" || optionPickerMenu.code?.trim().toLowerCase().startsWith("c")
            const optsToShow = isChickenBasePrice ? opts.filter((o) => !isChickenDefaultOption(o.name)) : opts
            const groups = optionPickerMenu.optionSelectionGroups || []
            const optsWithSteps = opts.filter(
              (o) => o.optionType === "substitution" && o.optionStepValues && Object.keys(o.optionStepValues).length > 0
            )
            const optsWithStepsToShow = isChickenBasePrice ? optsWithSteps.filter((o) => !isChickenDefaultOption(o.name)) : optsWithSteps
            const useMultiStep = groups.length > 0 && optsWithStepsToShow.length > 0
            /** S 사이즈(기본 S 순살)는 배달에서만 사용: 배달일 때만 "기본 (S 순살)" 버튼 표시 */
            const defaultBtn = isChickenBasePrice && orderType === "delivery" && (
              <button
                type="button"
                onClick={() => addToCartWithOption(optionPickerMenu, null, "S 순살")}
                className="mb-3 flex w-full justify-between rounded-lg border border-amber-600/60 bg-amber-950/40 px-4 py-3 text-left transition hover:border-amber-500 hover:bg-amber-900/30"
              >
                <span className="font-medium">{t("posOptionDefault") || "기본 (S 순살)"}</span>
                <span className="font-bold text-amber-400">{getMenuPrice(optionPickerMenu).toLocaleString()} ฿</span>
              </button>
            )
            if (useMultiStep) {
              const groupKey = groups[optionPickerStep]
              const values = [...new Set(optsWithStepsToShow.map((o) => o.optionStepValues?.[groupKey]).filter(Boolean))] as string[]
              const handleStepSelect = (value: string) => {
                const nextSelections = { ...optionPickerSelections, [groupKey]: value }
                setOptionPickerSelections(nextSelections)
                if (optionPickerStep >= groups.length - 1) {
                  const match = optsWithStepsToShow.find((o) =>
                    groups.every((g) => o.optionStepValues?.[g] === nextSelections[g])
                  )
                  if (match) {
                    addToCartWithOption(optionPickerMenu, match)
                  }
                } else {
                  setOptionPickerStep((s) => s + 1)
                }
              }
              const groupLabels: Record<string, string> = { size: "사이즈", part: "부위", topping: "토핑", bone: "뼈/순살", type: "타입" }
              return (
                <div className="flex flex-col gap-3 py-2">
                  {defaultBtn}
                  <p className="text-xs text-muted-foreground">
                    {groupLabels[groupKey] || groupKey}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {values.map((val) => (
                      <button
                        key={val}
                        onClick={() => handleStepSelect(val)}
                        className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 transition hover:border-amber-500/50 hover:bg-slate-700"
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                  {optionPickerStep > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => setOptionPickerStep((s) => s - 1)}
                    >
                      ← {t("posBack") || "이전"}
                    </Button>
                  )}
                </div>
              )
            }
            return (
              <div className="flex flex-col gap-2 py-2">
                {defaultBtn}
                {optsToShow.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => addToCartWithOption(optionPickerMenu, opt)}
                    className="flex justify-between rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-left transition hover:border-amber-500/50 hover:bg-slate-700"
                  >
                    <span>{opt.name}</span>
                    <span className="font-bold text-amber-400">
                      {(getMenuPrice(optionPickerMenu) + getOptionModifier(opt)).toLocaleString()} ฿
                    </span>
                  </button>
                ))}
              </div>
            )
          })()}
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
                    <span>{t("posDiscount") || "할인"}{receiptData.discountReason ? ` ${receiptData.discountReason}` : ""}</span>
                    <span className="tabular-nums">-{receiptData.discountAmt.toLocaleString()} ฿</span>
                  </div>
                )}
                {(receiptData.deliveryFee ?? 0) > 0 && (
                  <div className="receipt-row flex justify-between text-xs">
                    <span>{t("posDeliveryFee") || "배달 수수료"}</span>
                    <span className="tabular-nums">+{receiptData.deliveryFee?.toLocaleString()} ฿</span>
                  </div>
                )}
                {(receiptData.packagingFee ?? 0) > 0 && (
                  <div className="receipt-row flex justify-between text-xs">
                    <span>{t("posPackagingFee") || "포장 수수료"}</span>
                    <span className="tabular-nums">+{receiptData.packagingFee?.toLocaleString()} ฿</span>
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
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handlePrintKitchenSlip}
                >
                  <Printer className="h-4 w-4" />
                  {t("posKitchenSlip") || "주방 주문서"}
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
