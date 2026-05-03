"use client"
import { appAlert } from "@/lib/app-message"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import {
  getPosMenus,
  getPosMenuCategories,
  getPosMenuOptions,
  getPosPromoItems,
  getPosPromosWithItems,
  getPosOrders,
  getPosBusinessDaySettings,
  getPosTodaySales,
  getPosTableLayout,
  getPosPrinterSettings,
  type PosPrinterSettings,
  getPosCollabCampaigns,
  validatePosCoupon,
  useStoreList,
  type PosMenu,
  type PosMenuOption,
  type PosOrder,
  type PosPromoWithItems,
} from "@/lib/api-client"
import type { MarketingCollabDetail } from "@/lib/marketing-collab-detail"
import { collabDiscountAmountForCart } from "@/lib/pos-collab-discount"
import { savePosOrderWithOffline } from "@/lib/offline"
import { getBangkokDateStr, getPosBusinessDateStr, setPosBusinessHoursClient } from "@/lib/pos-business-day"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole } from "@/lib/permissions"
import { useLang } from "@/lib/lang-context"
import { useT, tr as i18nTr } from "@/lib/i18n"
import { localizeApiMessage } from "@/lib/translate-api-message"
import { cn, escapeHtml, formatBahtNum } from "@/lib/utils"
import { computePosPricing, type PosPricingAdjustments } from "@/lib/pos-pricing"
import type { PosPaymentOtherBreakdown } from "@/lib/pos-payment-other-breakdown"
import { parsePosOrderMemo } from "@/lib/pos-tax-invoice"
import { Handshake, Minus, Plus, Printer, RefreshCw, RotateCcw, ShoppingCart, Tag, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { OfflineBanner } from "@/components/offline-banner"
import { getBanbanFlavorMenuList, isBanbanMenu } from "@/lib/pos-banban-utils"
import { translateReceiptTableDisplayName } from "@/lib/pos-print-translate"
import {
  PROMOTION_MAIN_CATEGORY,
  normalizePosMainCategoryTabs,
  normalizePromotionSubcategory,
  promotionSubcategoriesEqual,
  uniqueSubcategoriesForMainMenu,
} from "@/lib/pos-promo-constants"
import { getPromoChoiceSlotLabel, splitPromoChoiceGroups, type PromoChoiceGroup } from "@/lib/pos-promo-choice"
import { translatePosMenuCategoryLabel } from "@/lib/pos-menu-category-label"
import { isPromoVisibleInContext } from "@/lib/pos-promo-visibility"
import { formatPosDateTimeMedium } from "@/lib/pos-datetime-locale"
import { kitchenSlipPrintI18n } from "@/lib/pos-kitchen-slip-print-i18n"
import { buildKitchenSlipGroupOpts, buildKitchenSlipGroups } from "@/lib/pos-kitchen-slip-routing"
import { buildKitchenSlipDocumentHtml, resolveKitchenSlipDesign } from "@/lib/pos-kitchen-slip-html"
import { formatPosOrderNoForPrint } from "@/lib/pos-order-no"
import { formatPosReceiptOrderNoDisplay, resolvePosReceiptOrderNoRaw } from "@/lib/pos-delivery-platform"
import { translatePosMenuLineForReceipt } from "@/lib/pos-print-translate"
import {
  printPosHtmlDocument,
  POS_THERMAL_BETWEEN_KITCHEN_SLIPS_MS,
  type PrintPosHtmlDocumentOptions,
} from "@/lib/pos-print-html"
import { resolveEscPosCutOverride } from "@/lib/pos-thermal-escpos-cut"
import {
  enrichPosOrderLikeItemsWithPromoSnapshot,
  type PosOrderReceiptLineOptions,
} from "@/lib/pos-payment-receipt-from-order"
import {
  RECEIPT_AMOUNT_COL_MM,
  RECEIPT_CONTENT_NUDGE_LEFT_MM,
  RECEIPT_GRID_COL_GAP_PX,
  RECEIPT_INNER_INSET_LEFT_MM,
  RECEIPT_INNER_INSET_RIGHT_MM,
  RECEIPT_TRAILING_BOTTOM_MM,
} from "@/lib/pos-receipt-layout"
import { POS_THERMAL_RECEIPT_WIDTH_MM, posThermalReceiptPageSizeRule } from "@/lib/pos-receipt-paper"
import { usePosMainDevice } from "@/hooks/use-pos-main-device"
import { PosMenuFillImage } from "@/components/pos/pos-menu-image"
import { usePosMenusCatalogLiveRefresh } from "@/lib/offline/use-pos-menus-catalog-live-refresh"
import {
  resolvePosMenuDescriptionForChannel,
  resolvePosMenuOptionDescriptionForChannel,
} from "@/lib/pos-menu-display-description"
import { resolvePromoSublineOptionDisplayName } from "@/lib/pos-promo-subline-option-label"

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
  note?: string
  optionId?: string
  optionName?: string
  /** 반반: 1번째 맛 메뉴/옵션 ID (S 순살) */
  menuId1?: string
  optionId1?: string
  menuId2?: string
  optionId2?: string
  promoId?: string
  promoCode?: string
  promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
}

type PromoChoiceDialogState = {
  promo: PosPromoWithItems
  fixedItems: { menuId: string; optionId: string | null; quantity: number }[]
  groups: PromoChoiceGroup[]
  selectedRowKeysByGroup: Record<string, string[]>
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
  const translateChickenPartLabel = React.useCallback(
    (name: string | undefined): string => translatePosMenuLineForReceipt(String(name || ""), t),
    [t]
  )
  const { stores } = useStoreList()
  const canSearchAll = isOfficeRole(auth?.role || "")
  const effectiveStores = React.useMemo(
    () => (canSearchAll ? stores : auth?.store ? [auth.store] : stores),
    [canSearchAll, auth?.store, stores]
  )
  const [menus, setMenus] = React.useState<PosMenu[]>([])
  usePosMenusCatalogLiveRefresh(React.useCallback((list) => setMenus(list), []))
  const [promos, setPromos] = React.useState<PosPromoWithItems[]>([])
  const [_categories, setCategories] = React.useState<string[]>([])
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
  const [promoChoiceDialog, setPromoChoiceDialog] = React.useState<PromoChoiceDialogState | null>(null)
  const [orderType] = React.useState<OrderType>(() => getInitialOrderType(searchParams))
  const [storeCode, setStoreCode] = React.useState("")
  const [tableName, setTableName] = React.useState("")
  const [tableOptions, setTableOptions] = React.useState<{ id: string; name: string }[]>([])
  const [discountType, setDiscountType] = React.useState<"pct" | "amt">("amt")
  const [discountValue, setDiscountValue] = React.useState("")
  const [discountReason, setDiscountReason] = React.useState("")
  const [couponCode, setCouponCode] = React.useState("")
  const [appliedCoupon, setAppliedCoupon] = React.useState<{ name: string; discountAmt: number; discountReason: string } | null>(null)
  const [couponLoading, setCouponLoading] = React.useState(false)
  const [collabOptions, setCollabOptions] = React.useState<
    { id: string; topic: string; campaignNo?: string; collabDetail: MarketingCollabDetail }[]
  >([])
  const [appliedCollabId, setAppliedCollabId] = React.useState<string | null>(null)
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
  const [autoPrintReceiptOnPayment, setAutoPrintReceiptOnPayment] = React.useState(false)
  const [autoPrintKitchenSlipOnOrder, setAutoPrintKitchenSlipOnOrder] = React.useState(false)
  const [autoPrintFinalOrderBeforePayment, setAutoPrintFinalOrderBeforePayment] = React.useState(false)
  const posPrinterSettingsRef = React.useRef<PosPrinterSettings | null>(null)
  const posPrinterSettingsStoreCodeRef = React.useRef("")
  const posPrinterSettingsInFlightStoreCodeRef = React.useRef("")
  const posPrinterSettingsInFlightRef = React.useRef<Promise<PosPrinterSettings> | null>(null)
  const [receiptBizName, setReceiptBizName] = React.useState("")
  const [receiptBizTaxId, setReceiptBizTaxId] = React.useState("")
  const [receiptBizAbn, setReceiptBizAbn] = React.useState("")
  const [receiptBizOwner, setReceiptBizOwner] = React.useState("")
  const [receiptBizAddress, setReceiptBizAddress] = React.useState("")
  const [receiptBizPhone, setReceiptBizPhone] = React.useState("")
  const [receiptLogoSize, setReceiptLogoSize] = React.useState<'sm' | 'md' | 'lg'>('md')
  const [vatRate, setVatRate] = React.useState(7)
  const [vatMode, setVatMode] = React.useState<'included' | 'separate'>('included')
  const [serviceRate, setServiceRate] = React.useState(0)
  const [serviceMode, setServiceMode] = React.useState<'included' | 'separate'>('separate')
  const [cardRate, setCardRate] = React.useState(0)
  const [cardMode, setCardMode] = React.useState<'included' | 'separate'>('separate')
  const [cardBaseMode, setCardBaseMode] = React.useState<'card_only' | 'card_plus_vat' | 'card_plus_vat_service'>('card_only')
  const [otherRate, setOtherRate] = React.useState(0)
  const [otherMode, setOtherMode] = React.useState<'included' | 'separate'>('separate')
  const [showPaymentModal, setShowPaymentModal] = React.useState(false)
  const [payCash, setPayCash] = React.useState("")
  const [payCard, setPayCard] = React.useState("")
  const [payQr, setPayQr] = React.useState("")
  const [payOther, setPayOther] = React.useState("")
  const [payDeliveryApp, setPayDeliveryApp] = React.useState("")
  const [deliveryPaymentChannel, setDeliveryPaymentChannel] = React.useState<"grab" | "lineman" | "shopee" | "dine_in">("grab")
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
    vatFeeAmt?: number
    vatFeeMode?: 'included' | 'separate'
    serviceFeeAmt?: number
    serviceFeeMode?: 'included' | 'separate'
    cardFeeAmt?: number
    cardFeeMode?: 'included' | 'separate'
    otherFeeAmt?: number
    otherFeeMode?: 'included' | 'separate'
    paymentCash?: number
    paymentCard?: number
    paymentQr?: number
    paymentOther?: number
    paymentOtherBreakdown?: PosPaymentOtherBreakdown | null
    paymentDeliveryApp?: number
    deliveryPaymentChannel?: string | null
  } | null>(null)
  const receiptRef = React.useRef<HTMLDivElement>(null)
  const autoPrintedKeyRef = React.useRef<string>("")
  const [isMainPosDevice] = usePosMainDevice(storeCode || null)

  React.useEffect(() => {
    const def = auth?.store || effectiveStores[0] || "ST01"
    if (!storeCode && def) setStoreCode(def)
  }, [auth?.store, effectiveStores, storeCode])

  const loadTodaySales = React.useCallback(() => {
    if (!storeCode) return
    getPosTodaySales({ storeCode })
      .then(setTodaySales)
      .catch(() => setTodaySales(null))
  }, [storeCode])

  React.useEffect(() => {
    loadTodaySales()
  }, [loadTodaySales])

  React.useEffect(() => {
    if (!storeCode.trim()) return
    let cancel = false
    void (async () => {
      try {
        const j = await getPosBusinessDaySettings(storeCode.trim())
        if (cancel) return
        setPosBusinessHoursClient({
          start: { hour: j.hour, minute: j.minute },
          end: { hour: j.endHour, minute: j.endMinute },
        })
      } catch {
        /* 기본값 유지 */
      }
    })()
    return () => {
      cancel = true
    }
  }, [storeCode])

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
      .then((s) => {
        posPrinterSettingsRef.current = s
        posPrinterSettingsStoreCodeRef.current = storeCode
        setStoreFees({ deliveryFee: s.deliveryFee ?? 0, packagingFee: s.packagingFee ?? 0 })
        setAutoPrintReceiptOnPayment(Boolean(s.autoPrintReceiptOnPayment ?? s.autoPrintReceiptOnOrder))
        setAutoPrintKitchenSlipOnOrder(Boolean(s.autoPrintKitchenSlipOnOrder))
        setAutoPrintFinalOrderBeforePayment(Boolean(s.autoPrintFinalOrderBeforePayment))
        setReceiptBizName(String(s.receiptBizName || ""))
        setReceiptBizTaxId(String(s.receiptBizTaxId || ""))
        setReceiptBizAbn(String(s.receiptBizAbn || ""))
        setReceiptBizOwner(String(s.receiptBizOwner || ""))
        setReceiptBizAddress(String(s.receiptBizAddress || ""))
        setReceiptBizPhone(String(s.receiptBizPhone || ""))
        setReceiptLogoSize(
          s.receiptLogoSize === 'sm'
            ? 'sm'
            : s.receiptLogoSize === 'lg'
              ? 'lg'
              : 'md'
        )
        setVatRate(Math.max(0, Number(s.vatRate ?? 7)))
        setVatMode(s.vatMode === 'separate' ? 'separate' : 'included')
        setServiceRate(Math.max(0, Number(s.serviceRate ?? 0)))
        setServiceMode(s.serviceMode === 'included' ? 'included' : 'separate')
        setCardRate(Math.max(0, Number(s.cardRate ?? 0)))
        setCardMode(s.cardMode === 'included' ? 'included' : 'separate')
        setCardBaseMode(
          s.cardBaseMode === 'card_plus_vat'
            ? 'card_plus_vat'
            : s.cardBaseMode === 'card_plus_vat_service'
              ? 'card_plus_vat_service'
              : 'card_only'
        )
        setOtherRate(Math.max(0, Number(s.otherRate ?? 0)))
        setOtherMode(s.otherMode === 'included' ? 'included' : 'separate')
      })
      .catch(() => {
        posPrinterSettingsRef.current = null
        posPrinterSettingsStoreCodeRef.current = ""
        setStoreFees({ deliveryFee: 0, packagingFee: 0 })
        setAutoPrintReceiptOnPayment(false)
        setAutoPrintKitchenSlipOnOrder(false)
        setAutoPrintFinalOrderBeforePayment(false)
        setReceiptBizName("")
        setReceiptBizTaxId("")
        setReceiptBizAbn("")
        setReceiptBizOwner("")
        setReceiptBizAddress("")
        setReceiptBizPhone("")
        setReceiptLogoSize('md')
        setVatRate(7)
        setVatMode('included')
        setServiceRate(0)
        setServiceMode('separate')
        setCardRate(0)
        setCardMode('separate')
        setCardBaseMode('card_only')
        setOtherRate(0)
        setOtherMode('separate')
      })
  }, [storeCode])

  React.useEffect(() => {
    loadStoreFees()
  }, [loadStoreFees])

  const getPrinterSettingsForStore = React.useCallback(async (targetStoreCode: string): Promise<PosPrinterSettings> => {
    const normalizedStoreCode = String(targetStoreCode || "").trim()
    if (!normalizedStoreCode) throw new Error("missing_store_code")
    if (
      posPrinterSettingsRef.current &&
      posPrinterSettingsStoreCodeRef.current === normalizedStoreCode
    ) {
      return posPrinterSettingsRef.current
    }
    if (
      posPrinterSettingsInFlightRef.current &&
      posPrinterSettingsInFlightStoreCodeRef.current === normalizedStoreCode
    ) {
      return posPrinterSettingsInFlightRef.current
    }
    const request = getPosPrinterSettings({ storeCode: normalizedStoreCode })
      .then((settings) => {
        posPrinterSettingsRef.current = settings
        posPrinterSettingsStoreCodeRef.current = normalizedStoreCode
        return settings
      })
      .finally(() => {
        if (posPrinterSettingsInFlightStoreCodeRef.current === normalizedStoreCode) {
          posPrinterSettingsInFlightRef.current = null
          posPrinterSettingsInFlightStoreCodeRef.current = ""
        }
      })
    posPrinterSettingsInFlightStoreCodeRef.current = normalizedStoreCode
    posPrinterSettingsInFlightRef.current = request
    return request
  }, [])

  const loadMenusAndPromos = React.useCallback(() => {
    setLoading(true)
    const emptyCats = { categories: [] as string[], mainCategories: [] as string[] }
    Promise.allSettled([
      getPosMenus(),
      getPosMenuCategories(),
      getPosMenuOptions(),
      getPosPromosWithItems(),
    ])
      .then(([r0, r1, r2, r3]) => {
        const list = r0.status === "fulfilled" ? r0.value || [] : []
        const catRes = r1.status === "fulfilled" ? r1.value || emptyCats : emptyCats
        const cats = catRes.categories || []
        const mains = catRes.mainCategories || []
        const opts = r2.status === "fulfilled" ? r2.value || [] : []
        const promoList = r3.status === "fulfilled" ? r3.value || [] : []
        const derivedCats = Array.from(new Set(list.map((m) => String(m.category || "").trim()).filter(Boolean)))
        const derivedMains = Array.from(new Set(list.map((m) => String(m.categoryMain || "").trim()).filter(Boolean)))
        const finalCats = cats.length > 0 ? cats : derivedCats
        const finalMains = mains.length > 0 ? mains : derivedMains
        setMenus(list)
        setPromos(promoList)
        setAllOptions(opts)
        const promoCategories = [...new Set((promoList || []).map((p) => p.category).filter(Boolean))]
        const merged = [...new Set([...(finalCats || []), ...promoCategories])].sort()
        setCategories(merged)
        const mainMerged = normalizePosMainCategoryTabs([...(finalMains || []), PROMOTION_MAIN_CATEGORY])
        setMainCategories(mainMerged)
        setSelectedMainCategory((prev) => (mainMerged.includes(prev) ? prev : ""))
        setSelectedCategory((prev) => {
          if (!prev) return ""
          if (merged.includes(prev)) return prev
          const pn = normalizePromotionSubcategory(prev)
          if (merged.some((c) => promotionSubcategoriesEqual(c, pn))) return pn
          return ""
        })
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

  const optionByIdForCartNote = React.useMemo(
    () => new Map<string, PosMenuOption>(allOptions.map((o) => [String(o.id), o])),
    [allOptions]
  )

  const promoCatalogById = React.useMemo(() => {
    const m = new Map<string, PosPromoWithItems>()
    for (const p of promos) {
      if (p?.id) m.set(String(p.id), p)
    }
    return m
  }, [promos])

  const posReceiptLineOptsKitchen: PosOrderReceiptLineOptions = React.useMemo(
    () => ({ promoCatalogById, menus }),
    [promoCatalogById, menus]
  )

  const todayStr = getBangkokDateStr()

  /** 반반 맛 선택 목록 (폴백: 같은 대분류 → c코드 대분류 → 음료/디저트 제외) */
  const banbanFlavorList = React.useMemo(() => {
    if (!optionPickerMenu || !isBanbanMenu(optionPickerMenu)) return []
    return getBanbanFlavorMenuList(menus, optionPickerMenu, todayStr)
  }, [menus, optionPickerMenu, todayStr])
  /** 선택한 대분류에 속한 소분류만 (메뉴 기준) */
  const categoriesForSelectedMain = React.useMemo(() => {
    if (!selectedMainCategory) return [] as string[]
    const fromMain = menus
      .filter((m) => (m.categoryMain ?? "") === selectedMainCategory)
      .map((m) => m.category)
      .filter(Boolean) as string[]
    const arr = uniqueSubcategoriesForMainMenu(selectedMainCategory, fromMain)
    if (arr.length > 0) return arr
    const fromCategory = menus.filter((m) => (m.category ?? "") === selectedMainCategory)
    if (fromCategory.length > 0) return [selectedMainCategory]
    return []
  }, [menus, selectedMainCategory])

  React.useEffect(() => {
    if (categoriesForSelectedMain.length === 0) return
    const valid =
      categoriesForSelectedMain.includes(selectedCategory) ||
      (selectedMainCategory === PROMOTION_MAIN_CATEGORY &&
        categoriesForSelectedMain.some((c) => promotionSubcategoriesEqual(c, selectedCategory)))
    if (!valid) {
      setSelectedCategory(categoriesForSelectedMain[0])
      return
    }
    if (
      selectedMainCategory === PROMOTION_MAIN_CATEGORY &&
      selectedCategory &&
      !categoriesForSelectedMain.includes(selectedCategory)
    ) {
      setSelectedCategory(normalizePromotionSubcategory(selectedCategory))
    }
  }, [categoriesForSelectedMain, selectedCategory, selectedMainCategory])

  const filteredMenus = React.useMemo(() => {
    const active = menus.filter((m) => m.isActive)
    const notSoldOut = active.filter((m) => !m.soldOutDate || m.soldOutDate !== todayStr)
    if (!selectedMainCategory || !selectedCategory) return []
    const subOk = (cat: string | undefined) =>
      selectedMainCategory === PROMOTION_MAIN_CATEGORY
        ? promotionSubcategoriesEqual(cat, selectedCategory)
        : (cat ?? "").trim() === selectedCategory
    const byMainAndSub = notSoldOut.filter(
      (m) => (m.categoryMain ?? "") === selectedMainCategory && subOk(m.category)
    )
    if (byMainAndSub.length > 0) return byMainAndSub
    return notSoldOut.filter((m) => subOk(m.category))
  }, [menus, selectedCategory, selectedMainCategory, todayStr])

  const linkedPromoIds = React.useMemo(() => {
    const s = new Set<string>()
    for (const m of menus) {
      const pid = m.promoId?.trim()
      if (pid) s.add(pid)
    }
    return s
  }, [menus])

  const businessDateYmd = getPosBusinessDateStr()

  React.useEffect(() => {
    if (!storeCode.trim()) {
      setCollabOptions([])
      setAppliedCollabId(null)
      return
    }
    let cancelled = false
    getPosCollabCampaigns({ storeCode })
      .then((rows) => {
        if (cancelled) return
        setCollabOptions(rows)
        setAppliedCollabId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : null))
      })
      .catch(() => {
        if (!cancelled) setCollabOptions([])
      })
    return () => {
      cancelled = true
    }
  }, [storeCode])

  const menuByIdForCollab = React.useMemo(() => {
    if (!menus.length) return new Map<string, PosMenu>()
    return new Map(menus.map((m) => [String(m.id), m]))
  }, [menus])

  const appliedCollab = React.useMemo(
    () => collabOptions.find((c) => c.id === appliedCollabId) ?? null,
    [collabOptions, appliedCollabId]
  )

  const collabDiscountAmt = React.useMemo(() => {
    if (!appliedCollab || menuByIdForCollab.size === 0) return 0
    return collabDiscountAmountForCart(cart, menuByIdForCollab, appliedCollab.collabDetail)
  }, [appliedCollab, cart, menuByIdForCollab])

  const filteredPromos = React.useMemo(() => {
    return promos.filter((p) => {
      if (!p.isActive) return false
      if (linkedPromoIds.has(p.id)) return false
      const cm = (p.categoryMain || PROMOTION_MAIN_CATEGORY).trim()
      const sub = (p.category || "").trim()
      if (selectedMainCategory && cm !== selectedMainCategory) return false
      if (selectedCategory) {
        if (selectedMainCategory === PROMOTION_MAIN_CATEGORY) {
          if (!promotionSubcategoriesEqual(sub, selectedCategory)) return false
        } else if (sub !== selectedCategory) {
          return false
        }
      }
      return isPromoVisibleInContext(p, {
        businessDateYmd,
        orderType,
        deliveryAppCode: null,
      })
    })
  }, [promos, selectedCategory, selectedMainCategory, linkedPromoIds, businessDateYmd, orderType])

  const getPromoPrice = (p: PosPromoWithItems) =>
    orderType === "delivery" && p.priceDelivery != null ? p.priceDelivery : p.price

  const resolveCartLineNote = React.useCallback(
    (item: CartItem) => {
      const raw = String(item.note ?? "").trim()
      if (raw) return raw
      if (!Array.isArray(item.promoItems) || item.promoItems.length === 0) return ""
      const orderChannel =
        orderType === "dine_in" ? "dine-in" : orderType === "delivery" ? "delivery" : ("takeout" as const)
      const lines = item.promoItems.slice(0, 4).map((line) => {
        const menu = menus.find((m) => String(m.id) === String(line.menuId))
        const menuName = (menu?.name ?? "").trim() || `#${String(line.menuId)}`
        const optName = resolvePromoSublineOptionDisplayName({
          optionId: line.optionId,
          optionById: optionByIdForCartNote,
          menuOptions: optionsByMenuId[String(line.menuId)],
          orderChannel,
        })
        const optionLabel = optName ? ` (${optName})` : ""
        return `${menuName}${optionLabel} x${Math.max(1, Number(line.quantity) || 1)}`
      })
      const hiddenCount = Math.max(0, item.promoItems.length - lines.length)
      return hiddenCount > 0 ? `${lines.join(", ")}, +${hiddenCount}` : lines.join(", ")
    },
    [menus, optionByIdForCartNote, optionsByMenuId, orderType]
  )

  React.useEffect(() => {
    const targets = cart
      .filter((it) => it.promoId && (!Array.isArray(it.promoItems) || it.promoItems.length === 0))
      .map((it) => String(it.promoId ?? "").trim())
      .filter(Boolean)
    if (targets.length === 0) return
    const uniq = Array.from(new Set(targets))
    let cancelled = false
    void (async () => {
      const rowsByPromo: Record<string, { menuId: string; optionId: string | null; quantity: number }[]> = {}
      for (const pid of uniq) {
        const rows = await getPosPromoItems({ promoId: pid }).catch(() => [])
        rowsByPromo[pid] = (rows || []).map((r) => ({
          menuId: String(r.menuId ?? ""),
          optionId: r.optionId ? String(r.optionId) : null,
          quantity: Math.max(1, Number(r.quantity) || 1),
        }))
      }
      if (cancelled) return
      setCart((prev) =>
        prev.map((it) => {
          const pid = String(it.promoId ?? "").trim()
          if (!pid) return it
          if (Array.isArray(it.promoItems) && it.promoItems.length > 0) return it
          const resolved = rowsByPromo[pid] || []
          if (resolved.length === 0) return it
          return { ...it, promoItems: resolved }
        })
      )
    })()
    return () => {
      cancelled = true
    }
  }, [cart])

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

  const addToCart = async (menu: PosMenu) => {
    const mirrorPromoId = menu.promoId?.trim()
    if (mirrorPromoId) {
      const pr = promos.find((x) => x.id === mirrorPromoId)
      if (pr) {
        void addPromoToCart(pr)
        return
      }
      const rows = await getPosPromoItems({ promoId: mirrorPromoId }).catch(() => [])
      if (rows.length > 0) {
        const fallbackPromo: PosPromoWithItems = {
          id: mirrorPromoId,
          code: menu.code,
          name: menu.name,
          category: menu.category,
          categoryMain: menu.categoryMain,
          price: menu.price,
          priceDelivery: menu.priceDelivery,
          vatIncluded: menu.vatIncluded !== false,
          isActive: menu.isActive !== false,
          sortOrder: menu.sortOrder ?? 0,
          items: rows.map((r) => ({
            menuId: String(r.menuId ?? ""),
            optionId: r.optionId ? String(r.optionId) : null,
            quantity: Math.max(1, Number(r.quantity) || 1),
            choiceGroup: String(r.choiceGroup ?? "").trim() || null,
            choicePickCount:
              r.choicePickCount != null && Number.isFinite(Number(r.choicePickCount))
                ? Math.max(1, Math.floor(Number(r.choicePickCount)))
                : null,
          })),
        }
        void addPromoToCart(fallbackPromo)
        return
      }
    }
    if (isBanbanMenu(menu)) {
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

  const addResolvedPromoToCart = React.useCallback((resolvedPromo: PosPromoWithItems) => {
    const normalizedItems = (resolvedPromo.items || []).map((x) => ({
      menuId: String(x.menuId),
      optionId: x.optionId ? String(x.optionId) : null,
      quantity: Math.max(1, Number(x.quantity) || 1),
    }))
    const signature = normalizedItems
      .map((x) => `${x.menuId}:${x.optionId || "-"}:${x.quantity}`)
      .join("|")
    const cartId = `promo-${resolvedPromo.id}-${signature || "base"}`
    const price = getPromoPrice(resolvedPromo)
    setCart((prev) => {
      const i = prev.findIndex((x) => x.id === cartId)
      if (i >= 0) {
        const n = [...prev]
        n[i] = { ...n[i], qty: n[i].qty + 1 }
        return n
      }
      return [
        ...prev,
        {
          id: cartId,
          name: resolvedPromo.name,
          price,
          qty: 1,
          promoId: resolvedPromo.id,
          promoCode: resolvedPromo.code,
          promoItems: normalizedItems,
        },
      ]
    })
  }, [getPromoPrice])

  const addPromoToCart = async (promo: PosPromoWithItems) => {
    const freshItems = await getPosPromoItems({ promoId: promo.id }).catch(() => null)
    const resolvedItems =
      Array.isArray(freshItems) && freshItems.length > 0
        ? freshItems
        : Array.isArray(promo.items)
          ? promo.items
          : []
    const resolvedPromo: PosPromoWithItems = { ...promo, items: resolvedItems || [] }
    const { fixedItems, groups } = splitPromoChoiceGroups((resolvedPromo.items || []).map((it) => ({
      menuId: String(it.menuId ?? ""),
      optionId: it.optionId ? String(it.optionId) : null,
      quantity: Math.max(1, Number(it.quantity) || 1),
      choiceGroup: String(it.choiceGroup ?? "").trim() || null,
      choicePickCount:
        it.choicePickCount != null && Number.isFinite(Number(it.choicePickCount))
          ? Math.max(1, Math.floor(Number(it.choicePickCount)))
          : null,
    })))
    if (groups.length === 0) {
      addResolvedPromoToCart({ ...resolvedPromo, items: fixedItems })
      return
    }
    const selectedRowKeysByGroup: Record<string, string[]> = {}
    for (const g of groups) selectedRowKeysByGroup[g.key] = []
    setPromoChoiceDialog({
      promo: resolvedPromo,
      fixedItems,
      groups,
      selectedRowKeysByGroup,
    })
  }

  const togglePromoChoice = React.useCallback((groupKey: string, rowKey: string) => {
    setPromoChoiceDialog((prev) => {
      if (!prev) return prev
      const group = prev.groups.find((g) => g.key === groupKey)
      if (!group) return prev
      const current = prev.selectedRowKeysByGroup[groupKey] || []
      const exists = current.includes(rowKey)
      let next = exists ? current.filter((x) => x !== rowKey) : [...current, rowKey]
      if (next.length > group.pickCount) next = next.slice(next.length - group.pickCount)
      return {
        ...prev,
        selectedRowKeysByGroup: {
          ...prev.selectedRowKeysByGroup,
          [groupKey]: next,
        },
      }
    })
  }, [])

  const confirmPromoChoice = React.useCallback(async () => {
    const state = promoChoiceDialog
    if (!state) return
    for (const g of state.groups) {
      const selected = state.selectedRowKeysByGroup[g.key] || []
      if (selected.length !== g.pickCount) {
        await appAlert(`"${g.key}" 그룹은 ${g.pickCount}개 선택해야 합니다.`)
        return
      }
    }
    const selectedItems = state.groups.flatMap((g) => {
      const pick = new Set(state.selectedRowKeysByGroup[g.key] || [])
      return g.lines
        .filter((line) => pick.has(line.rowKey))
        .map((line) => ({
          menuId: line.menuId,
          optionId: line.optionId,
          quantity: line.quantity,
        }))
    })
    addResolvedPromoToCart({
      ...state.promo,
      items: [...state.fixedItems, ...selectedItems],
    })
    setPromoChoiceDialog(null)
  }, [addResolvedPromoToCart, promoChoiceDialog])

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

  const clearCart = () => {
    setCart([])
    setAppliedCollabId(null)
  }

  const loadRecentOrders = React.useCallback(() => {
    const today = getPosBusinessDateStr()
    setRecentLoading(true)
    getPosOrders({
      startStr: today,
      endStr: today,
      posBizDayScope: true,
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
      for (const it of order.items as { id?: string; name?: string; price?: number; qty?: number; note?: string; menuId1?: string; optionId1?: string; menuId2?: string; optionId2?: string; promoId?: string; promoItems?: { menuId: string; optionId: string | null; quantity: number }[] }[]) {
        const id = String(it.id ?? "")
        const name = String(it.name ?? "")
        const price = Number(it.price ?? 0)
        const qty = Number(it.qty ?? 1)
        const note = String(it.note ?? "").trim()
        if (!id) continue
        const i = next.findIndex((x) => x.id === id)
        const item = {
          id,
          name,
          price,
          qty,
          ...(note && { note }),
          ...(it.menuId1 != null && { menuId1: it.menuId1, optionId1: it.optionId1, menuId2: it.menuId2, optionId2: it.optionId2 }),
          ...(it.promoId
            ? {
                promoId: it.promoId,
                ...(Array.isArray(it.promoItems) && it.promoItems.length > 0 ? { promoItems: it.promoItems } : {}),
              }
            : {}),
        }
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
  const baseDiscountAmt = appliedCoupon ? appliedCoupon.discountAmt : manualDiscount
  const discountAmt = Math.min(subtotal, baseDiscountAmt + collabDiscountAmt)
  const collabReasonPart = appliedCollab ? `${t("posCollabDiscount")}: ${appliedCollab.topic}` : ""
  const effectiveDiscountReason = (() => {
    const base = appliedCoupon ? appliedCoupon.discountReason : discountReason.trim()
    if (base && collabReasonPart) return `${base} · ${collabReasonPart}`
    return base || collabReasonPart
  })()
  const deliveryFeeAmt = orderType === "delivery" ? storeFees.deliveryFee : 0
  const packagingFeeAmt = orderType === "takeout" ? storeFees.packagingFee : 0
  const pricingAdjustments: PosPricingAdjustments = {
    vatRate,
    vatMode,
    serviceRate,
    serviceMode,
    cardRate,
    cardMode,
    cardBaseMode,
    otherRate,
    otherMode,
  }
  const pricing = computePosPricing({
    subtotal,
    discountAmt,
    deliveryFee: deliveryFeeAmt,
    packagingFee: packagingFeeAmt,
    adjustments: pricingAdjustments,
  })
  const total = pricing.finalTotal
  const paymentPreview = computePosPricing({
    subtotal,
    discountAmt,
    deliveryFee: deliveryFeeAmt,
    packagingFee: packagingFeeAmt,
    cardPaymentAmount: Number(payCard) || 0,
    adjustments: pricingAdjustments,
  })
  const paymentPreviewTotal = paymentPreview.finalTotal
  const paymentInputSum =
    (Number(payCash) || 0) +
    (Number(payCard) || 0) +
    (Number(payQr) || 0) +
    (Number(payOther) || 0) +
    (Number(payDeliveryApp) || 0)
  const paymentInputMatch = Math.abs(paymentInputSum - paymentPreviewTotal) < 0.01

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
        await appAlert(localizeApiMessage(res.message, t, t("posCouponInvalid") || "유효하지 않은 쿠폰입니다.", lang))
      }
    } catch (e) {
      await appAlert(i18nTr(t, "posUnexpectedErrorDetail", { detail: String(e) }))
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

  const handleCheckout = async (payment: {
    cash: number
    card: number
    qr: number
    other: number
    deliveryApp: number
    deliveryChannel: "grab" | "lineman" | "shopee" | "dine_in" | null
  }) => {
    if (cart.length === 0) return
    const checkoutPricing = computePosPricing({
      subtotal,
      discountAmt,
      deliveryFee: deliveryFeeAmt,
      packagingFee: packagingFeeAmt,
      cardPaymentAmount: payment.card,
      adjustments: pricingAdjustments,
    })
    const checkoutTotal = checkoutPricing.finalTotal
    const sum = payment.cash + payment.card + payment.qr + payment.other + payment.deliveryApp
    if (Math.abs(sum - checkoutTotal) > 0.01) {
      await appAlert(t("posPaymentSumMismatch") || "결제 합계가 주문 금액과 일치하지 않습니다.")
      return
    }
    setSubmitting(true)
    try {
      const miscOther = Math.max(0, Number(payment.other) || 0)
      const paymentOtherBreakdown: PosPaymentOtherBreakdown | undefined =
        miscOther > 0.005 ? { misc: Math.round(miscOther * 100) / 100 } : undefined
      const res = await savePosOrderWithOffline({
        storeCode: storeCode || "ST01",
        createdBy: auth?.user ?? "",
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
        ...(paymentOtherBreakdown ? { paymentOtherBreakdown } : {}),
        paymentDeliveryApp: payment.deliveryApp || undefined,
        deliveryPaymentChannel:
          payment.deliveryApp > 0.005 ? payment.deliveryChannel : null,
        pricingAdjustments,
        items: cart.map((it) => ({
          id: it.id,
          name: it.name,
          price: it.price,
          qty: it.qty,
          note: it.note,
          orderType,
          ...(it.menuId1 != null && { menuId1: it.menuId1, optionId1: it.optionId1, menuId2: it.menuId2, optionId2: it.optionId2 }),
          ...(it.promoId
            ? {
                promoId: it.promoId,
                ...(it.promoCode ? { promoCode: it.promoCode } : {}),
                ...(Array.isArray(it.promoItems) && it.promoItems.length > 0 ? { promoItems: it.promoItems } : {}),
              }
            : {}),
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
          total: checkoutTotal,
          storeCode: storeCode || "ST01",
          orderType,
          tableName: orderType === "dine_in" ? tableName : "",
          memo: memo.trim(),
          discountReason: effectiveDiscountReason,
          vatFeeAmt: checkoutPricing.vatFeeAmt,
          vatFeeMode: checkoutPricing.vatFeeMode,
          serviceFeeAmt: checkoutPricing.serviceFeeAmt,
          serviceFeeMode: checkoutPricing.serviceFeeMode,
          cardFeeAmt: checkoutPricing.cardFeeAmt,
          cardFeeMode: checkoutPricing.cardFeeMode,
          otherFeeAmt: checkoutPricing.otherFeeAmt,
          otherFeeMode: checkoutPricing.otherFeeMode,
          paymentCash: payment.cash,
          paymentCard: payment.card,
          paymentQr: payment.qr,
          paymentOther: payment.other,
          ...(paymentOtherBreakdown ? { paymentOtherBreakdown } : {}),
          paymentDeliveryApp: payment.deliveryApp,
          deliveryPaymentChannel:
            payment.deliveryApp > 0.005 ? payment.deliveryChannel : null,
        })
        clearCart()
        setMemo("")
        setDiscountValue("")
        setDiscountReason("")
        handleClearCoupon()
        loadTodaySales()
      } else {
        await appAlert(localizeApiMessage(res.message, t, t("msg_save_fail"), lang))
      }
    } catch (e) {
      await appAlert(i18nTr(t, "posUnexpectedErrorDetail", { detail: String(e) }))
    } finally {
      setSubmitting(false)
    }
  }

  const POS_PAPER_SIDE_PADDING_MM = 0
  const getPosPaperBaseCss = (fontFamily: string, fontSizePx: number) => `
    ${posThermalReceiptPageSizeRule()}
    html, body { margin: 0; padding: 0; }
    html { height: auto; }
    body {
      width: ${POS_THERMAL_RECEIPT_WIDTH_MM}mm;
      max-width: ${POS_THERMAL_RECEIPT_WIDTH_MM}mm;
      min-height: auto;
      height: auto;
      box-sizing: border-box;
      font-family: ${fontFamily};
      font-size: ${fontSizePx}px;
      padding: ${POS_PAPER_SIDE_PADDING_MM}mm ${RECEIPT_INNER_INSET_RIGHT_MM}mm ${POS_PAPER_SIDE_PADDING_MM}mm ${RECEIPT_INNER_INSET_LEFT_MM}mm;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @media print {
      body { zoom: 1; }
    }
  `
  const printInIframe = React.useCallback(
    (
      fullHtml: string,
      title: string,
      thermal?: Pick<
        PrintPosHtmlDocumentOptions,
        "printRole" | "printReceiptKind" | "kitchenStation" | "escPosCutOverride"
      >
    ) =>
      new Promise<void>((resolve, reject) => {
        printPosHtmlDocument(fullHtml, {
          title,
          printDelayMs: 0,
          fallbackCleanupMs: 120_000,
          ...thermal,
          onPrintUnavailable: () => reject(new Error(t("posPrintUnavailable"))),
          onAfterCleanup: () => resolve(),
        })
      }),
    [t]
  )

  const handlePrintReceipt = async () => {
    if (!receiptRef.current) return
    const printContent = receiptRef.current.innerHTML
    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${t("posReceipt") || "영수증"}</title>
          <style>
            ${getPosPaperBaseCss("'Noto Sans KR', 'Malgun Gothic', Arial, sans-serif", 12)}
            body { font-weight: 600; line-height: 1.42; letter-spacing: 0; color: #000; padding-top: 0; padding-bottom: ${RECEIPT_TRAILING_BOTTOM_MM}mm; padding-left: ${RECEIPT_INNER_INSET_LEFT_MM}mm; padding-right: ${RECEIPT_INNER_INSET_RIGHT_MM}mm; }
            .receipt-content { width: 100%; max-width: 100%; margin-left: auto; margin-right: auto; box-sizing: border-box; padding: 0; position: relative; left: -${RECEIPT_CONTENT_NUDGE_LEFT_MM}mm; break-inside: avoid; page-break-inside: avoid; }
            .receipt-header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
            .receipt-row { display: grid; grid-template-columns: minmax(0, 1fr) ${RECEIPT_AMOUNT_COL_MM}mm; column-gap: ${RECEIPT_GRID_COL_GAP_PX}px; align-items: start; margin: 4px 0; padding-right: 0; box-sizing: border-box; }
            .receipt-row > span:first-child { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
            .receipt-row > span:last-child { white-space: normal; text-align: right; overflow-wrap: anywhere; word-break: break-word; font-size: 10px; line-height: 1.2; }
            .receipt-row.receipt-total > span:last-child, .receipt-total .receipt-row > span:last-child { font-size: 11px; }
            .receipt-total { border-top: 1px dashed #000; margin-top: 8px; padding-top: 8px; font-weight: bold; }
            .receipt-biz { margin: 2px 0; font-size: 11px; }
            .receipt-brand-logo { display: inline-block; height: auto; object-fit: contain; }
            .receipt-brand-logo.sm { width: 84px; }
            .receipt-brand-logo.md { width: 108px; }
            .receipt-brand-logo.lg { width: 132px; }
            .receipt-store-name { margin-top: 4px; font-size: 11px; color: #000; text-align: center; }
            .space-y-2 > * + * { margin-top: 8px; }
            .space-y-1 > * + * { margin-top: 4px; }
          </style>
        </head>
        <body>${printContent}</body>
      </html>
    `
    try {
      await printInIframe(fullHtml, t("posReceipt") || "영수증", {
        printRole: "receipt",
        printReceiptKind: "hall_order",
        escPosCutOverride: resolveEscPosCutOverride(posPrinterSettingsRef.current, {
          printRole: "receipt",
          printReceiptKind: "hall_order",
        }),
      })
    } catch {
      await appAlert(t("posPrintBlockedBrowser"))
    }
  }

  const openPaymentModal = async () => {
    if (cart.length === 0) {
      await appAlert(t("posCartEmpty") || "장바구니가 비어 있습니다.")
      return
    }
    if (autoPrintFinalOrderBeforePayment && receiptRef.current) {
      await handlePrintReceipt()
    }
    setPayCash(String(total))
    setPayCard("0")
    setPayQr("0")
    setPayOther("0")
    setPayDeliveryApp("0")
    setDeliveryPaymentChannel("grab")
    setShowPaymentModal(true)
  }

  const handlePrintKitchenSlip = async () => {
    if (!receiptData || !receiptData.storeCode) return
    try {
      const settings = await getPrinterSettingsForStore(receiptData.storeCode)
      const ki = kitchenSlipPrintI18n(settings, lang)
      const itemsForKitchen = enrichPosOrderLikeItemsWithPromoSnapshot(
        receiptData.items as unknown as Record<string, unknown>[],
        posReceiptLineOptsKitchen
      ) as unknown as typeof receiptData.items
      const slips = buildKitchenSlipGroups(
        itemsForKitchen,
        { ...buildKitchenSlipGroupOpts(settings, menus, ki.kLabels), splitPromoKitchenLines: true }
      )
      if (slips.length === 0) {
        await appAlert(t("posKitchenNoItemsToPrint") || "주방으로 출력할 품목이 없습니다.")
        return
      }
      const slipDesign = resolveKitchenSlipDesign(settings)
      const kitchenOrderNoRaw = resolvePosReceiptOrderNoRaw({
        posOrderNo: receiptData.orderNo,
        tableName: receiptData.tableName,
        memo: receiptData.memo,
      })
      const printOne = async (idx: number): Promise<void> => {
        if (idx >= slips.length) return
        const slip = slips[idx]
        const kitchenMemo = parsePosOrderMemo(receiptData.memo).plainMemo
        const tablePart = receiptData.tableName
          ? ` · ${ki.t("posTable") || "테이블"}: ${translateReceiptTableDisplayName(receiptData.tableName, ki.t)}`
          : ""
        const memoLine =
          kitchenMemo.trim() ? `${ki.t("posCustomerMemo") || "메모"}: ${kitchenMemo.trim()}` : ""
        const html = buildKitchenSlipDocumentHtml({
          label: slip.label,
          orderNo: kitchenOrderNoRaw,
          storeCode: receiptData.storeCode,
          orderTypeLabel: ki.orderTypeLabels[receiptData.orderType as OrderType] || receiptData.orderType,
          tablePart,
          dateStr: formatPosDateTimeMedium(new Date(), ki.lang),
          items: slip.items.map((it) => ({
            name: translatePosMenuLineForReceipt(it.name, ki.t),
            qty: it.qty,
            note: (it as { note?: string }).note,
          })),
          memoLine: memoLine || null,
          escapeHtml,
          design: slipDesign,
          printColorAdjust: "economy",
        })
        await printInIframe(html, slip.label, {
          printRole: "kitchen",
          kitchenStation: slip.station,
          escPosCutOverride: resolveEscPosCutOverride(settings, { printRole: "kitchen" }),
        })
        if (idx + 1 < slips.length) {
          await new Promise((resolve) => setTimeout(resolve, POS_THERMAL_BETWEEN_KITCHEN_SLIPS_MS))
          await printOne(idx + 1)
        }
      }
      await printOne(0)
    } catch (e) {
      await appAlert(i18nTr(t, "posUnexpectedErrorDetail", { detail: String(e) }))
    }
  }

  React.useEffect(() => {
    if (!receiptData) return
    if (!isMainPosDevice) return
    if (!autoPrintReceiptOnPayment && !autoPrintKitchenSlipOnOrder) return
    const key = `${receiptData.orderNo}|${receiptData.storeCode}|${receiptData.total}|${receiptData.items.length}`
    if (autoPrintedKeyRef.current === key) return
    autoPrintedKeyRef.current = key

    const timers: ReturnType<typeof setTimeout>[] = []
    if (autoPrintKitchenSlipOnOrder) {
      timers.push(setTimeout(() => {
        void handlePrintKitchenSlip()
      }, 180))
    }
    if (autoPrintReceiptOnPayment) {
      timers.push(setTimeout(() => {
        handlePrintReceipt()
      }, autoPrintKitchenSlipOnOrder ? 780 : 180))
    }
    return () => timers.forEach((id) => clearTimeout(id))
  }, [receiptData, isMainPosDevice, autoPrintReceiptOnPayment, autoPrintKitchenSlipOnOrder, handlePrintReceipt, handlePrintKitchenSlip])

  const orderTypeLabels: Record<OrderType, string> = {
    dine_in: t("posOrderTypeDineIn") ?? "매장",
    takeout: t("posOrderTypeTakeout") ?? "포장",
    delivery: t("posOrderTypeDelivery") ?? "배달",
  }
  const tr = (key: string, fallback: string) => {
    const value = t(key)
    return value && value !== key ? value : fallback
  }
  const parsedReceiptMemo = React.useMemo(
    () => parsePosOrderMemo(receiptData?.memo),
    [receiptData?.memo]
  )

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <OfflineBanner
          onSyncComplete={loadTodaySales}
          offlineMsg={t("posOfflineSaved") || "오프라인 모드 - 주문이 로컬에 저장됩니다. 복구 후 자동 전송됩니다."}
          syncingMsg={t("posSyncing") || "동기화 중..."}
          retryLabel={t("posRetrySync") || "재시도"}
        />
      {todaySales != null && (
        <div className="flex shrink-0 items-center justify-end border-b border-slate-200 bg-white px-4 py-2 text-xs shadow-sm">
          <span className="font-bold tabular-nums text-slate-800">
            {formatBahtNum(todaySales.completedTotal)} ฿
          </span>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
      {/* 메뉴 영역 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 대분류 선택 (유형은 첫 화면에서 선택됨) */}
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-2.5 py-1.5 shadow-sm">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 text-slate-600 hover:text-slate-900"
            onClick={loadMenusAndPromos}
            disabled={loading}
            title={t("posRefreshMenus") || "메뉴 새로고침"}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <span className="shrink-0 text-xs text-slate-600">{t("posMainCategory") || "대분류"}</span>
          <div className="flex flex-1 gap-2 overflow-x-auto">
            {mainCategories.map((main) => (
              <button
                key={main}
                onClick={() => {
                  setSelectedMainCategory(main)
                  setSelectedCategory("")
                }}
                className={cn(
                  "shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition",
                  selectedMainCategory === main ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                )}
              >
                {main}
              </button>
            ))}
          </div>
        </div>
        {/* 3단계: 카테고리(소분류) 선택 */}
        {selectedMainCategory && (
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-2.5 py-1.5">
            <span className="shrink-0 text-xs text-slate-600">{t("posCategory") || "카테고리"}</span>
            <div className="flex flex-1 gap-2 overflow-x-auto">
              {categoriesForSelectedMain.map((c) => (
                <button
                  key={c}
                  onClick={() => setSelectedCategory(c)}
                  className={cn(
                    "shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition",
                    selectedCategory === c ? "bg-emerald-500 text-white" : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                  )}
                >
                  {translatePosMenuCategoryLabel(c, t)}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* Oll star pos 15dlscl (1024x768/1366x768) 최적화: 1024 이하 3열, 이상 4~5열 */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-3">
          <div className="grid content-start auto-rows-max grid-cols-3 items-start gap-2 sm:gap-2.5 min-[1025px]:grid-cols-4 min-[1200px]:grid-cols-5">
            {filteredPromos.map((p) => (
              <button
                key={`promo-${p.id}`}
                onClick={() => void addPromoToCart(p)}
                className="flex h-[170px] flex-col overflow-hidden rounded-xl border border-amber-300 bg-amber-50 p-1.5 text-left transition hover:border-amber-400 hover:bg-amber-100 active:scale-[0.98] touch-manipulation"
              >
                <div className="relative h-[92px] shrink-0 overflow-hidden rounded-lg bg-amber-100 flex items-center justify-center">
                  <span className="font-pos-emoji text-3xl">🏷️</span>
                </div>
                <div
                  className="mt-1 overflow-hidden break-words text-sm font-medium leading-tight text-slate-800"
                  style={{
                    height: "2.6em",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {p.name}
                </div>
                <div className="mt-auto text-xs font-bold text-amber-600">
                  {(getPromoPrice(p)) > 0 ? `${formatBahtNum(getPromoPrice(p))} ฿` : "-"}
                </div>
              </button>
            ))}
            {filteredMenus.map((m) => {
              const menuDesc = resolvePosMenuDescriptionForChannel(m, orderType)
              return (
              <button
                key={m.id}
                onClick={() => addToCart(m)}
                className="flex min-h-[170px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-left transition hover:border-emerald-400 hover:shadow-md active:scale-[0.98] touch-manipulation h-full"
              >
                <div className="relative h-[88px] w-full shrink-0 overflow-hidden rounded-lg bg-slate-100 min-[400px]:h-[92px]">
                  <PosMenuFillImage src={m.imageUrl || ''} alt={m.name} />
                </div>
                <div className="mt-1 flex min-h-0 flex-1 flex-col gap-0.5">
                  <div
                    className="overflow-hidden break-words text-sm font-medium leading-tight text-slate-800"
                    style={{
                      maxHeight: "2.6em",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {m.name}
                  </div>
                  {menuDesc ? (
                    <p
                      className="line-clamp-2 text-[10px] leading-snug text-slate-500"
                      title={menuDesc}
                    >
                      {menuDesc}
                    </p>
                  ) : null}
                </div>
                <div className="mt-auto text-xs font-bold text-emerald-600">
                  {(getMenuPrice(m)) > 0 ? `${formatBahtNum(getMenuPrice(m))} ฿` : "-"}
                </div>
              </button>
            )
            })}
          </div>
          {!selectedMainCategory && (
            <div className="col-span-full py-12 text-center text-slate-500">
              {t("posSelectMainCategoryFirst") || "위에서 대분류를 선택하세요."}
            </div>
          )}
          {selectedMainCategory && !selectedCategory && (
            <div className="col-span-full py-12 text-center text-slate-500">
              {t("posSelectCategoryFirst") || "카테고리를 선택하세요."}
            </div>
          )}
          {selectedMainCategory && selectedCategory && filteredMenus.length === 0 && filteredPromos.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-500">
              {t("posNoMenus") || "등록된 메뉴가 없습니다."}
            </div>
          )}
        </div>
      </div>

      {/* 장바구니: 1024 이하 240px, 이상 288px (태블릿 가로 여백 확보) */}
      <div className="flex w-[240px] min-[1025px]:w-72 shrink-0 flex-col border-l border-slate-200 bg-white shadow-lg">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <ShoppingCart className="h-4 w-4" />
            {t("posCart") || "장바구니"}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-slate-600 hover:text-slate-900"
            onClick={clearCart}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            {t("posClear") || "비우기"}
          </Button>
        </div>
        <div className="flex shrink-0 flex-col gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
          {effectiveStores.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs text-slate-600 w-12">
                {t("store") || "매장"}
              </span>
              <Select value={storeCode || effectiveStores[0]} onValueChange={setStoreCode} disabled={!canSearchAll}>
                <SelectTrigger className="h-8 flex-1 border-slate-200 bg-white text-sm text-slate-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {effectiveStores.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs text-slate-600 w-12">
              {t("posOrderType") || "유형"}
            </span>
            <span className="rounded-lg bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-700">
              {orderTypeLabels[orderType]}
            </span>
          </div>
          {orderType === "dine_in" && (
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs text-slate-600 w-12">
                {t("posTable") || "테이블"}
              </span>
              {tableOptions.length > 0 ? (
                <>
                  <Select
                    value={tableOptions.some((x) => x.name === tableName) ? tableName : "_"}
                    onValueChange={(v) => setTableName(v === "_" ? "" : v)}
                  >
                    <SelectTrigger className="h-8 min-w-[80px] border-slate-200 bg-white text-sm text-slate-800">
                      <SelectValue placeholder={t("posTablePh") || "1번"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_">
                        {t("posTableOther") || "직접 입력"}
                      </SelectItem>
                      {tableOptions.map((tbl) => (
                        <SelectItem key={tbl.id} value={tbl.name}>
                          {translateReceiptTableDisplayName(tbl.name, t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(!tableName || !tableOptions.some((x) => x.name === tableName)) && (
                    <Input
                      placeholder={t("posTableCustomPh") || "테이블명"}
                      value={tableName}
                      onChange={(e) => setTableName(e.target.value)}
                      className="h-8 flex-1 border-slate-200 bg-white text-sm text-slate-800"
                    />
                  )}
                </>
              ) : (
                <Input
                  placeholder={t("posTablePh") || "1번"}
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  className="h-8 flex-1 border-slate-200 bg-white text-sm text-slate-800"
                />
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 flex-1 border-slate-200 bg-white text-xs text-slate-700 hover:bg-slate-100"
              onClick={loadRecentOrders}
              disabled={recentLoading}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              {recentLoading ? "..." : t("posReorder") || "재주문"}
            </Button>
          </div>
        </div>
        {recentOrders.length > 0 && (
          <div className="shrink-0 overflow-x-auto border-b border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex gap-2">
              {recentOrders.map((o) => (
                <button
                  key={o.id}
                  onClick={() => reorderFrom(o)}
                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-emerald-400 hover:bg-emerald-50"
                >
                  <div className="text-[10px] font-bold text-emerald-600">{formatPosOrderNoForPrint(o.orderNo)}</div>
                  <div className="text-[11px] text-slate-600">
                    {formatBahtNum(o.total)} ฿
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-4 py-3 bg-slate-50/50">
          {cart.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              {t("posCartEmpty") || "장바구니가 비어 있습니다."}
            </p>
          ) : (
            <div className="space-y-2">
              {cart.map((it) => (
                (() => {
                  const lineNote = resolveCartLineNote(it)
                  return (
                <div
                  key={it.id}
                  className="rounded-lg bg-white border border-slate-200 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm text-slate-800">
                        {translatePosMenuLineForReceipt(it.name, t)}
                      </div>
                      {lineNote ? (
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500">{lineNote}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateQty(it.id, -1)}
                        className="rounded p-1 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-6 text-center text-sm font-medium tabular-nums text-slate-800">
                        {it.qty}
                      </span>
                      <button
                        onClick={() => updateQty(it.id, 1)}
                        className="rounded p-1 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="w-16 text-right text-xs font-bold text-emerald-600 tabular-nums">
                      {formatBahtNum(it.price * it.qty)} ฿
                    </span>
                    <button
                      onClick={() => removeFromCart(it.id)}
                      className="rounded p-1 text-slate-500 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                  )
                })()
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 border-t border-slate-200 bg-white p-4 space-y-3">
          <div>
            <label className="text-xs text-slate-600">{t("posCustomerMemo") || "손님 메모"}</label>
            <Input
              placeholder={t("posCustomerMemoPh") || "알레르기, 맵기 조절 등"}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="mt-1 h-9 border-slate-200 bg-slate-50 text-sm text-slate-800"
            />
          </div>
          <div className="rounded-lg border border-violet-200/80 bg-violet-50/35 px-3 py-2.5">
            <div className="mb-2 flex items-center gap-2">
              <Handshake className="h-3.5 w-3.5 text-violet-700" />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-slate-800">{t("posPaymentSectionCollab")}</span>
                <p className="text-[10px] text-slate-500">{t("posCollabSelectLabel")}</p>
              </div>
            </div>
            <Select
              value={appliedCollabId ?? "__none__"}
              onValueChange={(v) => setAppliedCollabId(v === "__none__" ? null : v)}
            >
              <SelectTrigger className="h-9 border-slate-200 bg-white text-sm text-slate-800">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("posCollabNoneOption")}</SelectItem>
                {collabOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {(c.campaignNo ? `[${c.campaignNo}] ` : "") + c.topic}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!menus.length ? (
              <p className="mt-1.5 text-[11px] text-amber-800">{t("posCollabMenusNotLoaded")}</p>
            ) : null}
            {appliedCollabId && collabDiscountAmt <= 0 && menus.length > 0 ? (
              <p className="mt-1.5 text-[11px] text-amber-800">{t("posCollabNoMatchingLines")}</p>
            ) : null}
          </div>
          <div className="rounded-lg border border-amber-200/80 bg-amber-50/35 px-3 py-2.5">
            <label className="text-xs font-semibold text-slate-800">{t("posPaymentSectionManualDiscount")}</label>
            <div className={cn("mt-1 flex gap-2", appliedCoupon && "opacity-50")}>
              <div className="flex rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => !appliedCoupon && setDiscountType("amt")}
                  disabled={!!appliedCoupon}
                  className={cn(
                    "px-2 py-1.5 text-xs",
                    discountType === "amt" ? "bg-emerald-100 text-emerald-700" : "text-slate-500"
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
                    discountType === "pct" ? "bg-emerald-100 text-emerald-700" : "text-slate-500"
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
                className="h-9 w-20 border-slate-200 bg-slate-50 text-sm text-right text-slate-800"
                disabled={!!appliedCoupon}
              />
              <Input
                placeholder={t("posDiscountReasonPh") || "사유"}
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                className="h-9 flex-1 border-slate-200 bg-slate-50 text-sm text-slate-800"
                disabled={!!appliedCoupon}
              />
            </div>
          </div>
          <div className="rounded-lg border border-sky-200/80 bg-sky-50/40 px-3 py-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex shrink-0 items-center gap-2">
                <Tag className="h-3.5 w-3.5 shrink-0 text-sky-700" />
                <span className="text-xs font-semibold text-slate-800">{t("posPaymentSectionCoupon")}</span>
              </div>
              <div className="min-w-0 flex-1">
                {appliedCoupon ? (
                  <div className="flex items-center justify-between rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-sm">
                    <span className="text-emerald-700 truncate">{appliedCoupon.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 shrink-0 p-0 text-slate-600 hover:text-slate-900"
                      onClick={handleClearCoupon}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <Input
                      placeholder={t("posCouponCodePh") || "쿠폰 코드"}
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === "Enter" && handleApplyCoupon()}
                      className="h-9 min-w-0 flex-1 border-slate-200 bg-white text-sm uppercase text-slate-800"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 shrink-0 border-slate-200 bg-white px-3 text-slate-700"
                      onClick={handleApplyCoupon}
                      disabled={!couponCode.trim() || couponLoading}
                    >
                      {couponLoading ? "..." : t("posCouponApply") || "적용"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2 rounded-md border border-slate-200/80 bg-slate-50/60 py-1 pl-1 pr-2">
            <div className="w-0.5 shrink-0 rounded-full bg-slate-300/70 self-stretch min-h-[2.5rem]" aria-hidden />
            <div className="min-w-0 flex-1 space-y-0 text-xs leading-tight text-slate-600">
              <div className="flex justify-between gap-2 py-0.5">
                <span className="min-w-0 pl-0.5">{t("posSubtotal") || "소계"}</span>
                <span className="shrink-0 tabular-nums text-slate-800">{formatBahtNum(subtotal)} ฿</span>
              </div>
              {discountAmt > 0 && (
                <div className="flex justify-between gap-2 py-0.5 text-emerald-600">
                  <span className="min-w-0 pl-0.5">{t("posDiscount") || "할인"}</span>
                  <span className="shrink-0 tabular-nums">-{formatBahtNum(discountAmt)} ฿</span>
                </div>
              )}
              {deliveryFeeAmt > 0 && (
                <div className="flex justify-between gap-2 py-0.5">
                  <span className="min-w-0 pl-0.5">{t("posDeliveryFee") || "배달 수수료"}</span>
                  <span className="shrink-0 tabular-nums text-slate-800">+{formatBahtNum(deliveryFeeAmt)} ฿</span>
                </div>
              )}
              {packagingFeeAmt > 0 && (
                <div className="flex justify-between gap-2 py-0.5">
                  <span className="min-w-0 pl-0.5">{t("posPackagingFee") || "포장 수수료"}</span>
                  <span className="shrink-0 tabular-nums text-slate-800">+{formatBahtNum(packagingFeeAmt)} ฿</span>
                </div>
              )}
              {pricing.vatFeeAmt > 0 && (
                <div className="flex justify-between gap-2 py-0.5">
                  <span className="min-w-0 pl-0.5">{t("posVatLabel") || "부가세"}</span>
                  <span className="shrink-0 tabular-nums text-slate-800">{pricing.vatFeeMode === 'separate' ? '+' : ''}{formatBahtNum(pricing.vatFeeAmt)} ฿</span>
                </div>
              )}
              {pricing.serviceFeeAmt > 0 && (
                <div className="flex justify-between gap-2 py-0.5">
                  <span className="min-w-0 pl-0.5">{t("posServiceFee") || "서비스비"}</span>
                  <span className="shrink-0 tabular-nums text-slate-800">{pricing.serviceFeeMode === 'separate' ? '+' : ''}{formatBahtNum(pricing.serviceFeeAmt)} ฿</span>
                </div>
              )}
              {pricing.cardFeeAmt > 0 && (
                <div className="flex justify-between gap-2 py-0.5">
                  <span className="min-w-0 pl-0.5">{t("posCardFee") || "카드비"}</span>
                  <span className="shrink-0 tabular-nums text-slate-800">{pricing.cardFeeMode === 'separate' ? '+' : ''}{formatBahtNum(pricing.cardFeeAmt)} ฿</span>
                </div>
              )}
              {pricing.otherFeeAmt > 0 && (
                <div className="flex justify-between gap-2 py-0.5">
                  <span className="min-w-0 pl-0.5">{t("posOtherFee") || "기타"}</span>
                  <span className="shrink-0 tabular-nums text-slate-800">{pricing.otherFeeMode === 'separate' ? '+' : ''}{formatBahtNum(pricing.otherFeeAmt)} ฿</span>
                </div>
              )}
              <div className="flex justify-between gap-2 border-t border-slate-200/90 pt-1 mt-0.5 text-sm font-bold text-slate-800">
                <span className="min-w-0 pl-0.5">{t("posTotal") || "합계"}</span>
                <span className="shrink-0 tabular-nums">{formatBahtNum(total)} ฿</span>
              </div>
            </div>
          </div>
          <Button
            className="w-full bg-emerald-500 font-bold text-white hover:bg-emerald-600"
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
              <span className="text-xs text-muted-foreground">{t("posTotal") || "합계"}</span>
              <div className="text-xl font-bold tabular-nums">{formatBahtNum(paymentPreviewTotal)} ฿</div>
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
              <div className="rounded-lg border border-border/60 p-2 space-y-2">
                <div className="flex items-center gap-2">
                  <label className="w-16 shrink-0 text-sm">{t("posPaymentDeliveryApp") || "배달앱"}</label>
                  <div className="grid flex-1 gap-1.5 min-w-0">
                    <Label className="text-[11px] text-muted-foreground">{t("posDeliveryPaymentChannel") || "채널"}</Label>
                    <Select
                      value={deliveryPaymentChannel}
                      onValueChange={(v) => setDeliveryPaymentChannel(v as "grab" | "lineman" | "shopee" | "dine_in")}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="grab">{t("posDeliveryPayGrab") || "Grab"}</SelectItem>
                        <SelectItem value="lineman">{t("posDeliveryPayLineman") || "Line Man"}</SelectItem>
                        <SelectItem value="shopee">{t("posDeliveryPayShopeeFood") || "Shopee Food"}</SelectItem>
                        <SelectItem value="dine_in">{t("posDeliveryPayDineIn") || "Dine in"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={payDeliveryApp}
                    onChange={(e) => setPayDeliveryApp(e.target.value)}
                    className="h-9 w-24 text-right shrink-0"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span>{t("posPaymentSum") || "입력 합계"}</span>
              <span className={cn(
                "tabular-nums font-medium",
                paymentInputMatch
                  ? "text-green-600"
                  : "text-amber-600"
              )}>
                {formatBahtNum(paymentInputSum)} ฿
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setPayCash(String(paymentPreviewTotal))
                  setPayCard("0")
                  setPayQr("0")
                  setPayOther("0")
                  setPayDeliveryApp("0")
                }}
              >
                {t("posPaymentFullCash") || "전액 현금"}
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-emerald-500 font-bold text-white hover:bg-emerald-600"
                disabled={submitting}
                onClick={() => handleCheckout({
                  cash: parseFloat(payCash) || 0,
                  card: parseFloat(payCard) || 0,
                  qr: parseFloat(payQr) || 0,
                  other: parseFloat(payOther) || 0,
                  deliveryApp: parseFloat(payDeliveryApp) || 0,
                  deliveryChannel: deliveryPaymentChannel,
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
            {optionPickerMenu
              ? (() => {
                  const md = resolvePosMenuDescriptionForChannel(optionPickerMenu, orderType)
                  return md ? (
                    <p className="text-left text-xs text-muted-foreground whitespace-pre-wrap max-h-28 overflow-y-auto pr-1">
                      {md}
                    </p>
                  ) : null
                })()
              : null}
          </DialogHeader>
          {optionPickerMenu && (() => {
            if (isBanbanMenu(optionPickerMenu)) {
              const first = optionPickerBanbanFirst
              const list = banbanFlavorList
              return (
                <div className="flex flex-col gap-3 py-2">
                  <p className="text-xs text-muted-foreground">
                    {first ? (t("posBanbanSecondHalf") || "2번째 맛") : (t("posBanbanFirstHalf") || "1번째 맛")}
                  </p>
                  {first && (
                    <p className="text-xs font-medium text-amber-600">
                      {t("posBanbanFirstSelected") || "1번째"}: {first.name}
                    </p>
                  )}
                  {list.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("posBanbanNoChicken") || "치킨 메뉴가 없습니다."}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {list.map((menu) => {
                        const banDesc = resolvePosMenuDescriptionForChannel(menu, orderType)
                        return (
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
                          className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-emerald-400 hover:bg-emerald-50"
                        >
                          <span className="block font-medium text-slate-800">{menu.name}</span>
                          {banDesc ? (
                            <span className="mt-0.5 block line-clamp-2 text-[11px] text-muted-foreground" title={banDesc}>
                              {banDesc}
                            </span>
                          ) : null}
                          <span className="text-xs text-emerald-600">{formatBahtNum(getMenuPrice(menu))} ฿</span>
                        </button>
                        )
                      })}
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
                className="mb-3 flex w-full justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-left transition hover:border-amber-400 hover:bg-amber-100"
              >
                <span className="font-medium text-slate-800">{t("posOptionDefault") || "기본 (S 순살)"}</span>
                <span className="font-bold text-amber-600">{formatBahtNum(getMenuPrice(optionPickerMenu))} ฿</span>
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
              const groupLabels: Record<string, string> = {
                size: "사이즈",
                part: "부위",
                topping: "토핑",
                bone: "뼈/순살",
                type: "타입",
                set_main: "세트 메인",
                side: "사이드",
                drink: "음료",
                soup: "스프",
                rice: "밥",
              }
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
                        className="rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:border-emerald-400 hover:bg-emerald-50 text-slate-800"
                      >
                        {translateChickenPartLabel(val)}
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
                {optsToShow.map((opt) => {
                  const optDesc = resolvePosMenuOptionDescriptionForChannel(opt, orderType)
                  return (
                  <button
                    key={opt.id}
                    onClick={() => addToCartWithOption(optionPickerMenu, opt)}
                    className="flex justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-emerald-400 hover:bg-emerald-50"
                  >
                    <span className="min-w-0 flex-1 text-slate-800">
                      <span className="block font-medium">{translateChickenPartLabel(opt.name)}</span>
                      {optDesc ? (
                        <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground" title={optDesc}>
                          {optDesc}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-bold text-emerald-600">
                      {formatBahtNum(getMenuPrice(optionPickerMenu) + getOptionModifier(opt))} ฿
                    </span>
                  </button>
                  )
                })}
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={!!promoChoiceDialog} onOpenChange={(open) => !open && setPromoChoiceDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>세트 구성 선택</DialogTitle>
          </DialogHeader>
          {promoChoiceDialog ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{promoChoiceDialog.promo.name}</p>
              {promoChoiceDialog.groups.map((group) => {
                const selected = promoChoiceDialog.selectedRowKeysByGroup[group.key] || []
                return (
                  <div key={group.key} className="rounded-lg border border-border/60 p-3 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">
                      {getPromoChoiceSlotLabel(group.key, t)} ({selected.length}/{group.pickCount})
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {group.lines.map((line) => {
                        const menu = menus.find((m) => String(m.id) === String(line.menuId))
                        const option = line.optionId
                          ? allOptions.find((o) => String(o.id) === String(line.optionId))
                          : null
                        const label = `${menu?.name ?? `#${line.menuId}`}${option?.name ? ` (${option.name})` : ''}`
                        const active = selected.includes(line.rowKey)
                        return (
                          <button
                            key={line.rowKey}
                            type="button"
                            onClick={() => togglePromoChoice(group.key, line.rowKey)}
                            className={cn(
                              "rounded-md border px-3 py-2 text-left text-sm transition",
                              active
                                ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                                : "border-border/70 bg-background hover:border-emerald-300"
                            )}
                          >
                            {label} x{Math.max(1, Number(line.quantity) || 1)}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPromoChoiceDialog(null)}>
                  취소
                </Button>
                <Button type="button" onClick={() => void confirmPromoChoice()}>
                  담기
                </Button>
              </DialogFooter>
            </div>
          ) : null}
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
                  <img
                    src="/company-stamp.png"
                    alt="Company logo"
                    className={`receipt-brand-logo inline-block ${receiptLogoSize}`}
                  />
                  <div className="receipt-store-name">{receiptData.storeCode}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatPosReceiptOrderNoDisplay({
                      posOrderNo: receiptData.orderNo,
                      tableName: receiptData.tableName,
                      memo: receiptData.memo,
                    })}
                  </div>
                  <div className="text-xs">
                    {orderTypeLabels[receiptData.orderType as OrderType] || receiptData.orderType}
                    {receiptData.tableName && ` · ${t("posTable") || "테이블"}: ${receiptData.tableName}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatPosDateTimeMedium(new Date(), lang)}
                  </div>
                  <div className="text-xs">{parsedReceiptMemo.taxInvoice ? tr("posReceiptTaxInvoice", "세금계산서") : tr("posReceiptSimpleTaxInvoice", "간이 세금계산서")}</div>
                </div>
                {receiptBizName && <div className="receipt-biz">{receiptBizName}</div>}
                {receiptBizTaxId && <div className="receipt-biz">{tr("posTaxIdLabel", "Tax ID")}: {receiptBizTaxId}</div>}
                {receiptBizAbn && <div className="receipt-biz">ABN: {receiptBizAbn}</div>}
                {receiptBizOwner && <div className="receipt-biz">{t("posOwner") || "대표"}: {receiptBizOwner}</div>}
                {receiptBizAddress && <div className="receipt-biz">{receiptBizAddress}</div>}
                {receiptBizPhone && <div className="receipt-biz">{tr("posTelLabel", "TEL")}: {receiptBizPhone}</div>}
                {parsedReceiptMemo.taxInvoice && (
                  <div className="text-xs border border-black p-2">
                    <div className="font-semibold mb-1">{tr("posReceiptTaxInvoice", "세금계산서")}</div>
                    <div>{tr("posTaxCustomerTypeLabel", "구분")}: {parsedReceiptMemo.taxInvoice.customerType === "company" ? tr("posTaxCustomerCorporate", "법인") : tr("posTaxCustomerIndividual", "개인")}</div>
                    <div>{tr("posName", "이름")}: {parsedReceiptMemo.taxInvoice.name}</div>
                    <div>{tr("posTaxIdLabel", "Tax ID")}: {parsedReceiptMemo.taxInvoice.taxId}</div>
                    <div>{tr("posBranchLabel", "지점")}: {parsedReceiptMemo.taxInvoice.branchNo || (parsedReceiptMemo.taxInvoice.customerType === "company" ? "00000" : tr("posHeadOffice", "본점"))}</div>
                    <div>{tr("settings_address", "주소")}: {parsedReceiptMemo.taxInvoice.address}</div>
                    <div>{tr("posPhone", "전화번호")}: {parsedReceiptMemo.taxInvoice.phone}</div>
                    <div>{tr("posTaxEmailLabel", "E-mail")}: {parsedReceiptMemo.taxInvoice.email}</div>
                  </div>
                )}
                <div className="space-y-1">
                  {receiptData.items.map((it) => (
                    <div key={it.id} className="receipt-row flex justify-between">
                      <span>
                        {it.name} × {it.qty}
                      </span>
                      <span className="tabular-nums">
                        {formatBahtNum(it.price * it.qty)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="receipt-row flex justify-between text-xs border-t pt-2 mt-2">
                  <span>{t("posSubtotal") || "소계"}</span>
                  <span className="tabular-nums">{formatBahtNum(receiptData.subtotal)}</span>
                </div>
                {receiptData.discountAmt > 0 && (
                  <div className="receipt-row flex justify-between text-xs text-green-600">
                    <span>{t("posDiscount") || "할인"}{receiptData.discountReason ? ` ${receiptData.discountReason}` : ""}</span>
                    <span className="tabular-nums">-{formatBahtNum(receiptData.discountAmt)}</span>
                  </div>
                )}
                {(receiptData.deliveryFee ?? 0) > 0 && (
                  <div className="receipt-row flex justify-between text-xs">
                    <span>{t("posDeliveryFee") || "배달 수수료"}</span>
                    <span className="tabular-nums">+{formatBahtNum(receiptData.deliveryFee)}</span>
                  </div>
                )}
                {(receiptData.packagingFee ?? 0) > 0 && (
                  <div className="receipt-row flex justify-between text-xs">
                    <span>{t("posPackagingFee") || "포장 수수료"}</span>
                    <span className="tabular-nums">+{formatBahtNum(receiptData.packagingFee)}</span>
                  </div>
                )}
                {(receiptData.vatFeeAmt ?? 0) > 0 && (
                  <div className="receipt-row flex justify-between text-xs">
                    <span>{t("posVatLabel") || "부가세"}</span>
                    <span className="tabular-nums">{receiptData.vatFeeMode === 'separate' ? '+' : ''}{formatBahtNum(receiptData.vatFeeAmt)}</span>
                  </div>
                )}
                {(receiptData.serviceFeeAmt ?? 0) > 0 && (
                  <div className="receipt-row flex justify-between text-xs">
                    <span>{t("posServiceFee") || "서비스비"}</span>
                    <span className="tabular-nums">{receiptData.serviceFeeMode === 'separate' ? '+' : ''}{formatBahtNum(receiptData.serviceFeeAmt)}</span>
                  </div>
                )}
                {(receiptData.cardFeeAmt ?? 0) > 0 && (
                  <div className="receipt-row flex justify-between text-xs">
                    <span>{t("posCardFee") || "카드비"}</span>
                    <span className="tabular-nums">{receiptData.cardFeeMode === 'separate' ? '+' : ''}{formatBahtNum(receiptData.cardFeeAmt)}</span>
                  </div>
                )}
                {(receiptData.otherFeeAmt ?? 0) > 0 && (
                  <div className="receipt-row flex justify-between text-xs">
                    <span>{t("posOtherFee") || "기타"}</span>
                    <span className="tabular-nums">{receiptData.otherFeeMode === 'separate' ? '+' : ''}{formatBahtNum(receiptData.otherFeeAmt)}</span>
                  </div>
                )}
                {parsedReceiptMemo.plainMemo && (
                  <div className="text-xs text-muted-foreground">
                    {tr("posCustomerMemo", "메모")}: {parsedReceiptMemo.plainMemo}
                  </div>
                )}
                <div className="receipt-total flex justify-between">
                  <span>{t("posTotal") || "합계"}</span>
                  <span className="tabular-nums">{formatBahtNum(receiptData.total)}</span>
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
