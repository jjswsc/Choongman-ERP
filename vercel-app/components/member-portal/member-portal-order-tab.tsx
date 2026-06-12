"use client"

import * as React from "react"
import { startTransition } from "react"
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Store,
  Trash2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  getPosMenuCategories,
  getPosMenus,
  getPosMenuOptions,
  type PosMenu,
  type PosMenuOption,
} from "@/lib/api-client"
import type { MemberSummary } from "@/lib/members-server"
import { formatBangkokDateTimeLocalInput } from "@/lib/member-portal-pickup-time"
import { memberPortalT, type MemberPortalKey } from "@/lib/member-portal-i18n"
import type { LangCode } from "@/lib/lang-context"
import { formatBaht, formatDateTime } from "@/components/member-portal/portal-ui"
import { memberPortalOrderStatusLabelKey } from "@/lib/member-portal-orders-list-server"
import { mpGlassCard, mpGlassCardSoft } from "@/lib/member-portal-design"
import { PosMenuFillImage } from "@/components/pos/pos-menu-image"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { isBanbanMenu } from "@/lib/pos-banban-utils"
import {
  collectPosOptionPickerStepValues,
  resolvePosOptionPickerMatch,
} from "@/lib/pos-option-picker-resolve"
import {
  filterOptionSelectionGroupsForAudience,
  filterPosOptionsForVisibleGroups,
  inferOptionSelectionGroupsFromOptions,
  resolveStepAudienceFromOrderType,
} from "@/lib/pos-option-selection-groups"
import { mainCategoryMatches } from "@/lib/pos-menu-categories"
import { memberPortalStoreMatchesQuery } from "@/lib/member-portal-stores"
import { MemberPortalCheckoutSheet } from "@/components/member-portal/member-portal-checkout-sheet"
import { MemberPortalQrPayDialog } from "@/components/member-portal/member-portal-qr-pay-dialog"
import { readMemberPortalCheckoutDraft } from "@/lib/member-portal-checkout-draft-storage"
import { MemberPortalDeliveryAppLogo } from "@/components/member-portal/member-portal-delivery-app-logo"
import {
  PROMOTION_MAIN_CATEGORY,
  normalizePosMainCategoryTabs,
  normalizePromotionSubcategory,
  promotionSubcategoriesEqual,
  uniqueSubcategoriesForMainMenu,
} from "@/lib/pos-promo-constants"

type StoreRow = { storeCode: string; displayName: string; mapQuery: string }

type DeliveryLinks = { grab: string; lineman: string; shopee: string }

const DEFAULT_DELIVERY_LINKS: DeliveryLinks = {
  grab: "https://food.grab.com/th/th/",
  lineman: "https://lineman.line.me/",
  shopee: "https://shopeefood.th/",
}

type CartLine = {
  cartKey: string
  menuId: string
  optionId?: string
  code?: string
  name: string
  price: number
  qty: number
}

function packagingMenuPrice(menu: PosMenu): number {
  return Math.max(0, Number(menu.price || 0))
}

function packagingOptionModifier(opt: PosMenuOption): number {
  if (opt.priceModifierPackaging != null) return Number(opt.priceModifierPackaging)
  return Number(opt.priceModifier || 0)
}

function cartLineKey(menuId: string, optionId?: string): string {
  return `${menuId}:${optionId || ""}`
}

function MemberMenuThumb({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg bg-neutral-100">
      <PosMenuFillImage src={src} alt={alt} />
    </div>
  )
}

type MenuListSection = { key: string; title: string; items: PosMenu[] }

function scheduleAfterPaint(task: () => void) {
  requestAnimationFrame(() => {
    task()
  })
}

type PickupMenuCatalogProps = {
  menusLoading: boolean
  packagingMenus: PosMenu[]
  showCategoryNav: boolean
  mainCategoryTabs: string[]
  activeMainCategory: string
  activeSubCategory: string
  subCategoriesForMain: string[]
  menuListSections: MenuListSection[]
  onSelectMainCategory: (main: string) => void
  onSelectAllCategories: () => void
  onSelectSubCategory: (sub: string) => void
  onAddMenu: (menu: PosMenu) => void
  t: (key: MemberPortalKey, params?: Record<string, string>) => string
}

const PickupMenuCatalog = React.memo(function PickupMenuCatalog({
  menusLoading,
  packagingMenus,
  showCategoryNav,
  mainCategoryTabs,
  activeMainCategory,
  activeSubCategory,
  subCategoriesForMain,
  menuListSections,
  onSelectMainCategory,
  onSelectAllCategories,
  onSelectSubCategory,
  onAddMenu,
  t,
}: PickupMenuCatalogProps) {
  return (
    <div className="pb-6">
      {menusLoading ? (
        <p className="px-4 py-10 text-center text-sm text-neutral-500">{t("loginChecking")}</p>
      ) : packagingMenus.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-neutral-500">{t("orderMenuEmpty")}</p>
      ) : (
        <>
          {showCategoryNav ? (
            <div className="sticky top-0 z-10 space-y-0 border-b border-neutral-100 bg-white/95 backdrop-blur-sm">
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                  {t("orderMainCategory")}
                </span>
                <div className="flex flex-1 gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <button
                    type="button"
                    onClick={onSelectAllCategories}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                      !activeMainCategory ? "bg-amber-400 text-black" : "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {t("orderCategoryAll")}
                  </button>
                  {mainCategoryTabs.map((main) => (
                    <button
                      key={main}
                      type="button"
                      onClick={() => onSelectMainCategory(main)}
                      className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                        activeMainCategory === main ? "bg-amber-400 text-black" : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {main}
                    </button>
                  ))}
                </div>
              </div>
              {activeMainCategory && subCategoriesForMain.length > 0 ? (
                <div className="flex items-center gap-2 border-t border-neutral-50 bg-neutral-50/90 px-3 py-2">
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                    {t("orderSubCategory")}
                  </span>
                  <div className="flex flex-1 gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {subCategoriesForMain.map((sub) => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => onSelectSubCategory(sub)}
                        className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                          activeSubCategory === sub ||
                          (activeMainCategory === PROMOTION_MAIN_CATEGORY &&
                            promotionSubcategoriesEqual(activeSubCategory, sub))
                            ? "border-amber-400 bg-amber-400 text-black"
                            : "border-neutral-200 bg-white text-neutral-600"
                        }`}
                      >
                        {normalizePromotionSubcategory(sub)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="px-4 pt-2">
            {activeMainCategory && !activeSubCategory ? (
              <p className="py-10 text-center text-sm text-neutral-500">{t("orderSelectSubCategory")}</p>
            ) : menuListSections.length === 0 ? (
              <p className="py-10 text-center text-sm text-neutral-500">{t("orderMenuEmpty")}</p>
            ) : (
              menuListSections.map((section) => (
                <section key={section.key} className="mb-4">
                  {!activeMainCategory || menuListSections.length > 1 ? (
                    <h3 className="mb-2 text-sm font-bold text-neutral-800">{section.title}</h3>
                  ) : null}
                  <ul className="divide-y divide-neutral-100">
                    {section.items.map((menu) => (
                      <li key={menu.id}>
                        <div className="flex gap-3 py-3">
                          <MemberMenuThumb src={String(menu.imageUrl || "")} alt={String(menu.name || "menu")} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-medium leading-snug text-neutral-900">{menu.name}</p>
                            <p className="mt-1 text-sm font-semibold text-neutral-800">
                              {formatBaht(Number(menu.price || 0))}
                            </p>
                          </div>
                          <button
                            type="button"
                            aria-label={t("orderAdd")}
                            onClick={() => onAddMenu(menu)}
                            className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400 text-lg font-semibold leading-none text-black shadow-sm transition hover:bg-amber-300 active:scale-95"
                          >
                            +
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
            <p className="border-t border-neutral-100 py-3 text-[11px] text-neutral-400">{t("orderMenuOptionsNote")}</p>
          </div>
        </>
      )}
    </div>
  )
})

type CartConfirmDialogProps = {
  open: boolean
  submitting: boolean
  storeName: string
  pickupAt: string
  cartTotal: number
  onCancel: () => void
  onConfirm: () => void
  t: (key: MemberPortalKey, params?: Record<string, string>) => string
}

const CartConfirmDialog = React.memo(function CartConfirmDialog({
  open,
  submitting,
  storeName,
  pickupAt,
  cartTotal,
  onCancel,
  onConfirm,
  t,
}: CartConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[28px] bg-white p-6 text-neutral-900 shadow-2xl">
        <p className="text-lg font-bold">{t("orderCartConfirmTitle")}</p>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">{t("orderCartConfirmBody")}</p>
        <div className="mt-4 rounded-xl bg-neutral-50 px-3 py-2.5 text-sm">
          <p className="font-medium">{storeName}</p>
          <p className="text-neutral-500">{pickupAt.replace("T", " ")}</p>
          <p className="mt-1 font-bold tabular-nums">{formatBaht(cartTotal)}</p>
        </div>
        <div className="mt-5 flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1 rounded-2xl"
            disabled={submitting}
            onClick={onCancel}
          >
            {t("orderBack")}
          </Button>
          <button
            type="button"
            disabled={submitting}
            onClick={onConfirm}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl bg-amber-400 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:pointer-events-none disabled:opacity-50"
          >
            {submitting ? t("saving") : t("orderCartConfirmBtn")}
          </button>
        </div>
      </div>
    </div>
  )
})

function orderStoreMatchesQuery(store: StoreRow, query: string): boolean {
  return memberPortalStoreMatchesQuery(
    {
      storeCode: store.storeCode,
      displayName: store.displayName,
      address: "",
      mapQuery: store.mapQuery,
      photoUrl: "",
      sortOrder: 0,
      isActive: true,
    },
    query
  )
}

function menuMatchesSubcategory(
  menu: PosMenu,
  main: string,
  sub: string
): boolean {
  const subOk =
    main === PROMOTION_MAIN_CATEGORY
      ? promotionSubcategoriesEqual(menu.category, sub)
      : String(menu.category ?? "").trim() === sub
  return mainCategoryMatches(main, menu.categoryMain, menu.code) && subOk
}

function buildAllMenuSections(menus: PosMenu[], mainTabs: string[]): MenuListSection[] {
  const sections: MenuListSection[] = []
  const used = new Set<string>()
  for (const main of mainTabs) {
    const subs = uniqueSubcategoriesForMainMenu(
      main,
      menus
        .filter((m) => mainCategoryMatches(main, m.categoryMain, m.code))
        .map((m) => String(m.category || "").trim())
        .filter(Boolean)
    )
    for (const sub of subs) {
      const items = menus.filter((m) => menuMatchesSubcategory(m, main, sub))
      if (items.length === 0) continue
      const key = `${main}::${sub}`
      used.add(key)
      sections.push({
        key,
        title: `${main} · ${normalizePromotionSubcategory(sub)}`,
        items,
      })
    }
  }
  const uncategorized = menus.filter((m) => {
    const main = String(m.categoryMain || "").trim()
    const sub = String(m.category || "").trim()
    const key = main && sub ? `${main}::${sub}` : ""
    return !key || !used.has(key)
  })
  if (uncategorized.length > 0) {
    sections.push({ key: "__other", title: "—", items: uncategorized })
  }
  return sections
}

type MemberOrderRow = {
  orderId: number
  orderNo: string
  storeCode: string
  status: string
  total: number
  pointUsed: number
  pickupHint: string
  createdAt: string
  awaitingPayment: boolean
  paymentExpired: boolean
  paymentExpiresAt?: string | null
}

type OrderView = "hub" | "delivery" | "pickup"

type MemberPortalOrderTabProps = {
  lang: LangCode
  t: (key: MemberPortalKey, params?: Record<string, string>) => string
  member: MemberSummary
  stores: StoreRow[]
  favoriteStoreCodes: string[]
}

async function postMemberOrder(body: Record<string, unknown>) {
  const res = await fetch("/api/member-portal/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  })
  return res.json() as Promise<{ success: boolean; message?: string; orderNo?: string }>
}

export function MemberPortalOrderTab({ lang, t, member, stores, favoriteStoreCodes }: MemberPortalOrderTabProps) {
  const primaryFavoriteStoreCode = favoriteStoreCodes[0] || ""
  const [view, setView] = React.useState<OrderView>("hub")
  const [deliveryLinks, setDeliveryLinks] = React.useState<DeliveryLinks | null>(null)
  const [deliveryLoading, setDeliveryLoading] = React.useState(false)

  const [pickupStore, setPickupStore] = React.useState(primaryFavoriteStoreCode)
  const [pickupAt, setPickupAt] = React.useState("")
  const [pickupMinAt, setPickupMinAt] = React.useState("")
  const [memberNoticeOpen, setMemberNoticeOpen] = React.useState(false)
  const [pickupReady, setPickupReady] = React.useState(false)

  const [menus, setMenus] = React.useState<PosMenu[]>([])
  const [menuOptions, setMenuOptions] = React.useState<PosMenuOption[]>([])
  const [menusLoading, setMenusLoading] = React.useState(false)
  const [cart, setCart] = React.useState<CartLine[]>([])
  const [optionPickerMenu, setOptionPickerMenu] = React.useState<PosMenu | null>(null)
  const [optionPickerStep, setOptionPickerStep] = React.useState(0)
  const [optionPickerSelections, setOptionPickerSelections] = React.useState<Record<string, string>>({})
  const [submitting, setSubmitting] = React.useState(false)
  const [orderMessage, setOrderMessage] = React.useState("")
  const [orderError, setOrderError] = React.useState("")
  const [catalogMainCategories, setCatalogMainCategories] = React.useState<string[]>([])
  const [activeMainCategory, setActiveMainCategory] = React.useState("")
  const [activeSubCategory, setActiveSubCategory] = React.useState("")
  const [storeSearch, setStoreSearch] = React.useState("")
  const [cartSheetOpen, setCartSheetOpen] = React.useState(false)
  const [cartConfirmOpen, setCartConfirmOpen] = React.useState(false)
  const [checkoutOpen, setCheckoutOpen] = React.useState(false)
  const [storePrepayEnabled, setStorePrepayEnabled] = React.useState(false)
  const [myOrders, setMyOrders] = React.useState<MemberOrderRow[]>([])
  const [myOrdersLoading, setMyOrdersLoading] = React.useState(false)
  const [resumePayOrder, setResumePayOrder] = React.useState<MemberOrderRow | null>(null)

  const dateLocale = lang === "ko" ? "ko-KR" : lang === "en" ? "en-US" : "th-TH"

  const loadMyOrders = React.useCallback(async () => {
    setMyOrdersLoading(true)
    try {
      const res = await fetch("/api/member-portal/orders?limit=10", { credentials: "same-origin" })
      const data = (await res.json()) as { success?: boolean; rows?: MemberOrderRow[] }
      if (data.success) setMyOrders(data.rows || [])
    } catch {
      setMyOrders([])
    } finally {
      setMyOrdersLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (primaryFavoriteStoreCode && !pickupStore) setPickupStore(primaryFavoriteStoreCode)
  }, [primaryFavoriteStoreCode, pickupStore])

  React.useEffect(() => {
    setPickupMinAt(formatBangkokDateTimeLocalInput(new Date(), 30))
    setPickupAt(formatBangkokDateTimeLocalInput(new Date(), 45))
  }, [])

  React.useEffect(() => {
    if (view !== "delivery") return
    if (deliveryLinks) return
    setDeliveryLoading(true)
    void fetch("/api/member-portal/delivery-links", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { success?: boolean; links?: DeliveryLinks }) => {
        if (j.success && j.links) setDeliveryLinks(j.links)
      })
      .finally(() => setDeliveryLoading(false))
  }, [view, deliveryLinks])

  React.useEffect(() => {
    if (view !== "hub") return
    void loadMyOrders()
    const id = window.setInterval(() => void loadMyOrders(), 30_000)
    return () => window.clearInterval(id)
  }, [loadMyOrders, view, orderMessage])

  const todayStr = React.useMemo(() => getBangkokTodayDateString(), [])

  const optionsByMenuId = React.useMemo(() => {
    const map: Record<string, PosMenuOption[]> = {}
    for (const o of menuOptions) {
      const mid = String(o.menuId || "")
      if (!mid) continue
      if (!map[mid]) map[mid] = []
      map[mid].push(o)
    }
    return map
  }, [menuOptions])

  const packagingMenus = React.useMemo(() => {
    return menus.filter(
      (m) =>
        m.isActive !== false &&
        m.sellPackaging !== false &&
        (!m.soldOutDate || m.soldOutDate !== todayStr) &&
        !isBanbanMenu(m)
    )
  }, [menus, todayStr])

  const filteredStores = React.useMemo(
    () => stores.filter((s) => orderStoreMatchesQuery(s, storeSearch)),
    [stores, storeSearch]
  )

  const mainCategoryTabs = React.useMemo(() => {
    const fromMenus = packagingMenus
      .map((m) => String(m.categoryMain || "").trim())
      .filter(Boolean)
    const fromApi = catalogMainCategories
    const merged = normalizePosMainCategoryTabs([...(fromApi.length > 0 ? fromApi : fromMenus)])
    return merged.filter((main) =>
      packagingMenus.some((m) => mainCategoryMatches(main, m.categoryMain, m.code))
    )
  }, [packagingMenus, catalogMainCategories])

  const subCategoriesForMain = React.useMemo(() => {
    if (!activeMainCategory) return [] as string[]
    const fromMain = packagingMenus
      .filter((m) => mainCategoryMatches(activeMainCategory, m.categoryMain, m.code))
      .map((m) => String(m.category || "").trim())
      .filter(Boolean)
    return uniqueSubcategoriesForMainMenu(activeMainCategory, fromMain)
  }, [packagingMenus, activeMainCategory])

  React.useEffect(() => {
    if (!activeMainCategory) {
      setActiveSubCategory("")
      return
    }
    if (subCategoriesForMain.length === 0) return
    const valid =
      subCategoriesForMain.includes(activeSubCategory) ||
      (activeMainCategory === PROMOTION_MAIN_CATEGORY &&
        subCategoriesForMain.some((c) => promotionSubcategoriesEqual(c, activeSubCategory)))
    if (!valid) setActiveSubCategory(subCategoriesForMain[0])
  }, [activeMainCategory, activeSubCategory, subCategoriesForMain])

  const filteredPackagingMenus = React.useMemo(() => {
    if (!activeMainCategory) return packagingMenus
    if (!activeSubCategory) return [] as PosMenu[]
    return packagingMenus.filter((m) =>
      menuMatchesSubcategory(m, activeMainCategory, activeSubCategory)
    )
  }, [packagingMenus, activeMainCategory, activeSubCategory])

  const menuListSections = React.useMemo((): MenuListSection[] => {
    if (!activeMainCategory) {
      return buildAllMenuSections(packagingMenus, mainCategoryTabs)
    }
    if (!activeSubCategory) return []
    return [
      {
        key: `${activeMainCategory}::${activeSubCategory}`,
        title: activeSubCategory,
        items: filteredPackagingMenus,
      },
    ]
  }, [
    activeMainCategory,
    activeSubCategory,
    filteredPackagingMenus,
    mainCategoryTabs,
    packagingMenus,
  ])

  const showCategoryNav = mainCategoryTabs.length > 0

  const cartItemCount = React.useMemo(() => cart.reduce((n, l) => n + l.qty, 0), [cart])

  const cartTotal = React.useMemo(
    () => cart.reduce((sum, line) => sum + line.price * line.qty, 0),
    [cart]
  )

  const loadMenus = React.useCallback(async (storeCode: string) => {
    if (!storeCode) return
    setMenusLoading(true)
    setOrderError("")
    try {
      const [rows, opts, cats] = await Promise.all([
        getPosMenus({ storeCode, fresh: true }),
        getPosMenuOptions({ fresh: true }),
        getPosMenuCategories(),
      ])
      setMenus(Array.isArray(rows) ? rows : [])
      setMenuOptions(Array.isArray(opts) ? opts : [])
      const apiMains = cats?.mainCategories || []
      const derivedMains = Array.from(
        new Set(
          (Array.isArray(rows) ? rows : [])
            .map((m) => String(m.categoryMain || "").trim())
            .filter(Boolean)
        )
      )
      setCatalogMainCategories(apiMains.length > 0 ? apiMains : derivedMains)
    } catch {
      setMenus([])
      setMenuOptions([])
      setOrderError(t("orderMenuLoadFail"))
    } finally {
      setMenusLoading(false)
    }
  }, [t])

  const resetPickupFlow = () => {
    setPickupReady(false)
    setMemberNoticeOpen(false)
    setCart([])
    setMenus([])
    setMenuOptions([])
    setOptionPickerMenu(null)
    setOptionPickerStep(0)
    setOptionPickerSelections({})
    setActiveMainCategory("")
    setActiveSubCategory("")
    setCatalogMainCategories([])
    setStoreSearch("")
    setCartSheetOpen(false)
    setCartConfirmOpen(false)
    setOrderMessage("")
    setOrderError("")
  }

  const closeOptionPicker = () => {
    setOptionPickerMenu(null)
    setOptionPickerStep(0)
    setOptionPickerSelections({})
  }

  const addToCart = React.useCallback((menu: PosMenu, opt: PosMenuOption | null) => {
    const price = packagingMenuPrice(menu) + (opt ? packagingOptionModifier(opt) : 0)
    const rawOptId = opt ? String(opt.id || "").trim() : ""
    const optionId = rawOptId && /^\d+$/.test(rawOptId) ? rawOptId : undefined
    const optionCode = opt?.optionCode ? String(opt.optionCode).trim() : undefined
    const name = opt
      ? `${String(menu.name || "")} (${String(opt.name || "")})`
      : String(menu.name || "")
    const key = cartLineKey(String(menu.id), optionId || optionCode || "")
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.cartKey === key)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 }
        return next
      }
      return [
        ...prev,
        {
          cartKey: key,
          menuId: String(menu.id),
          optionId,
          code: optionCode || menu.code,
          name,
          price,
          qty: 1,
        },
      ]
    })
    setOptionPickerMenu(null)
    setOptionPickerStep(0)
    setOptionPickerSelections({})
  }, [])

  const handleMenuAdd = React.useCallback(
    (menu: PosMenu) => {
      const groups = menu.optionSelectionGroups
      if (Array.isArray(groups) && groups.length > 0) {
        setOptionPickerMenu(menu)
        setOptionPickerStep(0)
        setOptionPickerSelections({})
        return
      }
      addToCart(menu, null)
    },
    [addToCart]
  )

  const selectAllCategories = React.useCallback(() => {
    setActiveMainCategory("")
    setActiveSubCategory("")
  }, [])

  const selectMainCategory = React.useCallback((main: string) => {
    setActiveMainCategory(main)
    setActiveSubCategory("")
  }, [])

  const selectSubCategory = React.useCallback((sub: string) => {
    setActiveSubCategory(sub)
  }, [])

  const goHub = () => {
    setView("hub")
    resetPickupFlow()
  }

  const refreshPickupTimeBounds = React.useCallback(() => {
    const min = formatBangkokDateTimeLocalInput(new Date(), 30)
    setPickupMinAt(min)
    setPickupAt((prev) => {
      if (!prev || prev < min) return formatBangkokDateTimeLocalInput(new Date(), 45)
      return prev
    })
    return min
  }, [])

  const startPickupMenu = () => {
    if (!pickupStore) {
      setOrderError(t("orderSelectStoreFirst"))
      return
    }
    setOrderError("")
    setMemberNoticeOpen(true)
  }

  const confirmMemberNotice = React.useCallback(() => {
    setMemberNoticeOpen(false)
    scheduleAfterPaint(() => {
      startTransition(() => {
        setPickupReady(true)
        setActiveMainCategory("")
        setActiveSubCategory("")
      })
      void loadMenus(pickupStore)
    })
  }, [loadMenus, pickupStore])

  const changeQty = (cartKey: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.cartKey === cartKey ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
    )
  }

  const clearCart = () => {
    setCart([])
    setCartSheetOpen(false)
    setCartConfirmOpen(false)
  }

  const openCartConfirm = React.useCallback(() => {
    if (cart.length === 0) return
    const min = refreshPickupTimeBounds()
    const at =
      pickupAt && pickupAt >= min ? pickupAt : formatBangkokDateTimeLocalInput(new Date(), 45)
    if (!at || at < min) {
      setOrderError(t("orderPickupTooSoon"))
      return
    }
    if (at !== pickupAt) setPickupAt(at)
    setOrderError("")
    scheduleAfterPaint(() => {
      void (async () => {
        try {
          const res = await fetch("/api/member-portal/orders/checkout-preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
              storeCode: pickupStore,
              items: cart.map(({ menuId, optionId, code, name, price, qty }) => ({
                menuId,
                ...(optionId ? { optionId } : {}),
                ...(code ? { optionCode: String(code) } : {}),
                code,
                name,
                price,
                qty,
              })),
              pointUsed: 0,
            }),
          })
          const data = (await res.json()) as { success?: boolean; preview?: { prepayEnabled?: boolean } }
          const prepay = Boolean(data.success && data.preview?.prepayEnabled)
          setStorePrepayEnabled(prepay)
          if (prepay) setCheckoutOpen(true)
          else setCartConfirmOpen(true)
        } catch {
          setCartConfirmOpen(true)
        }
      })()
    })
  }, [cart, pickupAt, pickupStore, refreshPickupTimeBounds, t])

  const submitPickupOrder = React.useCallback(async () => {
    if (!pickupStore || cart.length === 0) return
    setOrderError("")
    setOrderMessage("")
    try {
      const res = await postMemberOrder({
        storeCode: pickupStore,
        pickupAt,
        items: cart.map(({ menuId, optionId, code, name, price, qty }) => ({
          menuId,
          ...(optionId ? { optionId } : {}),
          ...(code ? { optionCode: String(code) } : {}),
          code,
          name,
          price,
          qty,
        })),
      })
      if (!res.success) {
        const code = String(res.message || "")
        const known: MemberPortalKey[] = [
          "pickup_too_soon",
          "empty_cart",
          "store_required",
          "invalid_pickup_time",
        ]
        setOrderError(
          known.includes(code as MemberPortalKey)
            ? memberPortalT(lang, code as MemberPortalKey)
            : t("orderSubmitFail")
        )
        return
      }
      startTransition(() => {
        setOrderMessage(t("orderSubmitSuccess", { orderNo: res.orderNo || "" }))
        setCart([])
        setCartSheetOpen(false)
        setCartConfirmOpen(false)
        setOrderError("")
        setPickupReady(false)
        setView("hub")
      })
    } catch {
      setOrderError(t("orderSubmitFail"))
    } finally {
      setSubmitting(false)
    }
  }, [cart, lang, pickupAt, pickupStore, t])

  const restoreCheckoutDraft = React.useCallback(() => {
    const draft = readMemberPortalCheckoutDraft()
    if (!draft?.cart?.length) return
    setPickupStore(draft.storeCode)
    setPickupAt(draft.pickupAt)
    setCart(
      draft.cart.map((line) => ({
        cartKey: cartLineKey(line.menuId, line.optionId),
        menuId: line.menuId,
        optionId: line.optionId,
        code: line.code,
        name: line.name,
        price: line.price,
        qty: line.qty,
      }))
    )
    setView("pickup")
    setCheckoutOpen(false)
  }, [])

  const handleReorder = React.useCallback(
    async (row: MemberOrderRow) => {
      setOrderError("")
      try {
        const res = await fetch(`/api/member-portal/orders/${row.orderId}/reorder-items`, {
          credentials: "same-origin",
        })
        const data = (await res.json()) as {
          success?: boolean
          storeCode?: string
          items?: Array<{
            menuId: string
            optionId?: string
            code?: string
            name: string
            price: number
            qty: number
          }>
        }
        if (!data.success || !data.items?.length) {
          setOrderError(t("orderSubmitFail"))
          return
        }
        setPickupStore(data.storeCode || row.storeCode)
        setCart(
          data.items.map((line) => ({
            cartKey: cartLineKey(line.menuId, line.optionId),
            menuId: line.menuId,
            optionId: line.optionId,
            code: line.code,
            name: line.name,
            price: line.price,
            qty: line.qty,
          }))
        )
        setView("pickup")
        setOrderMessage(t("orderMyOrdersReorderDone"))
      } catch {
        setOrderError(t("orderSubmitFail"))
      }
    },
    [t]
  )

  const handleCheckoutPaid = React.useCallback(
    ({ orderNo, paidWithPointsOnly }: { orderNo: string; paidWithPointsOnly: boolean }) => {
      startTransition(() => {
        setOrderMessage(
          paidWithPointsOnly
            ? t("orderSubmitSuccessPoints", { orderNo })
            : t("orderSubmitSuccessPaid", { orderNo })
        )
        setCart([])
        setCartSheetOpen(false)
        setCartConfirmOpen(false)
        setCheckoutOpen(false)
        setOrderError("")
        setPickupReady(false)
        setView("hub")
        void loadMyOrders()
      })
    },
    [loadMyOrders, t]
  )

  const handleConfirmSubmit = React.useCallback(() => {
    if (!pickupStore || cart.length === 0 || submitting) return
    setSubmitting(true)
    scheduleAfterPaint(() => {
      void submitPickupOrder()
    })
  }, [cart.length, pickupStore, submitPickupOrder, submitting])

  const resolvedDeliveryLinks = deliveryLinks ?? DEFAULT_DELIVERY_LINKS
  const pickupStoreName =
    stores.find((s) => s.storeCode === pickupStore)?.displayName || pickupStore

  const readyPickupOrder = React.useMemo(() => {
    return myOrders.find((row) => String(row.status || "").toLowerCase() === "ready") || null
  }, [myOrders])

  const readyPickupStoreLabel = readyPickupOrder
    ? stores.find((s) => s.storeCode === readyPickupOrder.storeCode)?.displayName ||
      readyPickupOrder.storeCode
    : ""

  const deliveryApps = [
    { code: "grab", label: "GrabFood", color: "from-[#00B14F] to-[#008f41]", url: resolvedDeliveryLinks.grab },
    { code: "lineman", label: "LINE MAN", color: "from-[#06C755] to-[#049a44]", url: resolvedDeliveryLinks.lineman },
    { code: "shopee", label: "ShopeeFood", color: "from-[#EE4D2D] to-[#d73211]", url: resolvedDeliveryLinks.shopee },
  ] as const

  if (view === "hub") {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t("orderTitle")}</h2>
          <p className="text-sm text-white/45">{t("orderDesc")}</p>
        </div>
        {!!orderMessage && (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {orderMessage}
          </div>
        )}
        {readyPickupOrder ? (
          <div className="rounded-2xl border border-sky-400/30 bg-sky-500/15 px-4 py-3 text-sm text-sky-100">
            {t("orderPickupReadyBanner", {
              orderNo: readyPickupOrder.orderNo,
              store: readyPickupStoreLabel,
            })}
          </div>
        ) : null}
        <div className={`${mpGlassCardSoft} p-4`}>
          <h3 className="text-sm font-semibold text-white/80">{t("orderMyOrdersTitle")}</h3>
          {myOrdersLoading ? (
            <p className="mt-3 text-sm text-white/45">{t("loginChecking")}</p>
          ) : myOrders.length === 0 ? (
            <p className="mt-3 text-sm text-white/45">{t("orderMyOrdersEmpty")}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {myOrders.map((row) => {
                const statusKey = memberPortalOrderStatusLabelKey(row)
                const storeLabel =
                  stores.find((s) => s.storeCode === row.storeCode)?.displayName || row.storeCode
                return (
                  <li
                    key={row.orderId}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-white/90">{storeLabel}</p>
                        <p className="text-xs text-white/45">
                          {row.orderNo}
                          {row.pickupHint ? ` · ${row.pickupHint}` : ""}
                        </p>
                        <p className="text-[11px] text-white/35">
                          {formatDateTime(row.createdAt, dateLocale)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold tabular-nums text-amber-200">{formatBaht(row.total)}</p>
                        <p className="text-[11px] text-white/50">{t(statusKey)}</p>
                      </div>
                    </div>
                    {row.awaitingPayment ? (
                      <button
                        type="button"
                        className="mt-2 w-full rounded-xl bg-amber-400 py-2 text-xs font-semibold text-black"
                        onClick={() => setResumePayOrder(row)}
                      >
                        {t("orderMyOrdersResumePay")}
                      </button>
                    ) : row.paymentExpired ? (
                      <button
                        type="button"
                        className="mt-2 w-full rounded-xl border border-white/20 py-2 text-xs font-semibold text-white/90"
                        onClick={() => void handleReorder(row)}
                      >
                        {t("orderCheckoutRestoreCart")}
                      </button>
                    ) : !row.awaitingPayment && row.status !== "cancelled" && row.status !== "canceled" ? (
                      <button
                        type="button"
                        className="mt-2 w-full rounded-xl border border-white/15 py-2 text-xs font-medium text-white/70"
                        onClick={() => void handleReorder(row)}
                      >
                        {t("orderMyOrdersReorder")}
                      </button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => {
              setView("pickup")
              resetPickupFlow()
            }}
            className="rounded-3xl border border-amber-400/25 bg-gradient-to-br from-amber-400/15 to-transparent p-5 text-left transition hover:border-amber-400/40"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-200">
                <Store className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-amber-50">{t("orderPickupBtn")}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/50">{t("orderPickupHubDesc")}</p>
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setView("delivery")}
            className={`${mpGlassCardSoft} p-5 text-left transition hover:border-white/15`}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white/80">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">{t("orderDeliveryBtn")}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/50">{t("orderDeliveryHubDesc")}</p>
              </div>
            </div>
          </button>
        </div>
        <MemberPortalQrPayDialog
          open={Boolean(resumePayOrder)}
          orderId={resumePayOrder?.orderId ?? 0}
          orderNo={resumePayOrder?.orderNo}
          qrAmount={resumePayOrder?.total ?? 0}
          paymentExpiresAt={resumePayOrder?.paymentExpiresAt}
          onClose={() => setResumePayOrder(null)}
          onPaid={() => {
            const no = resumePayOrder?.orderNo || ""
            setResumePayOrder(null)
            setOrderMessage(t("orderSubmitSuccessPaid", { orderNo: no }))
            void loadMyOrders()
          }}
          onExpired={() => {
            setResumePayOrder(null)
            void loadMyOrders()
          }}
          t={t}
        />
      </div>
    )
  }

  if (view === "delivery") {
    return (
      <div className="space-y-4">
        <button type="button" onClick={goHub} className="inline-flex items-center gap-2 text-sm text-white/55 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          {t("orderBack")}
        </button>
        <div>
          <h2 className="text-lg font-semibold">{t("orderDeliveryBtn")}</h2>
          <p className="text-sm text-white/45">{t("orderDeliveryDesc")}</p>
        </div>
        {deliveryLoading ? (
          <p className="text-sm text-white/45">{t("loginChecking")}</p>
        ) : (
          <div className="space-y-3">
            {deliveryApps.map((app) => (
              <a
                key={app.code}
                href={app.url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-between rounded-2xl border border-white/10 bg-gradient-to-r ${app.color} px-5 py-4 text-white shadow-lg transition hover:brightness-110`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <MemberPortalDeliveryAppLogo code={app.code} className="h-8 w-8 shrink-0" />
                  <span className="font-semibold">{app.label}</span>
                </span>
                <ExternalLink className="h-4 w-4 shrink-0 opacity-80" />
              </a>
            ))}
          </div>
        )}
        <p className="text-xs leading-relaxed text-white/40">{t("orderDeliveryNote")}</p>
      </div>
    )
  }

  // pickup
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => {
          if (pickupReady) {
            setPickupReady(false)
            setCart([])
            return
          }
          goHub()
        }}
        className="inline-flex items-center gap-2 text-sm text-white/55 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        {pickupReady ? t("orderPickupSetupBack") : t("orderBack")}
      </button>

      <div>
        <h2 className="text-lg font-semibold">{t("orderPickupBtn")}</h2>
        <p className="text-sm leading-relaxed text-amber-100/80">{t("orderPickupSavingsDesc")}</p>
      </div>

      {!!orderError && (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{orderError}</div>
      )}

      {!pickupReady ? (
        <div className={`space-y-4 ${mpGlassCard} p-5`}>
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-wider text-white/45">{t("orderSelectStore")}</Label>
            {stores.length > 4 ? (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <Input
                  value={storeSearch}
                  onChange={(e) => setStoreSearch(e.target.value)}
                  placeholder={t("locationSearchPh")}
                  className="h-11 rounded-2xl border-white/10 bg-black/25 pl-10 text-white placeholder:text-white/35"
                />
              </div>
            ) : null}
            <div className="max-h-52 space-y-2 overflow-y-auto pr-0.5">
              {stores.length === 0 ? (
                <p className="text-sm text-white/45">{t("orderSelectStorePh")}</p>
              ) : filteredStores.length === 0 ? (
                <p className="text-sm text-white/45">{t("locationNoResult")}</p>
              ) : (
                filteredStores.map((s) => {
                  const selected = pickupStore === s.storeCode
                  return (
                    <button
                      key={s.storeCode}
                      type="button"
                      onClick={() => setPickupStore(s.storeCode)}
                      className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left transition ${
                        selected
                          ? "border-amber-400/50 bg-amber-400/10"
                          : "border-white/10 bg-black/20 hover:border-white/20"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{s.displayName}</p>
                      </div>
                      {selected ? (
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 text-black">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <span className="h-6 w-6 shrink-0 rounded-full border border-white/20" />
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>
          <Button
            type="button"
            onClick={startPickupMenu}
            className="h-12 w-full rounded-2xl bg-amber-400 font-semibold text-black hover:bg-amber-300"
          >
            {t("orderPickupContinue")}
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2 rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
            <Store className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <p className="min-w-0 truncate text-sm font-semibold text-white">
              {stores.find((s) => s.storeCode === pickupStore)?.displayName || pickupStore}
            </p>
          </div>

          <div
            className={`-mx-4 overflow-hidden rounded-t-[1.75rem] bg-white text-neutral-900 shadow-[0_-10px_40px_rgba(0,0,0,0.35)] ${
              cart.length > 0 ? "pb-28" : ""
            }`}
          >
            <PickupMenuCatalog
              menusLoading={menusLoading}
              packagingMenus={packagingMenus}
              showCategoryNav={showCategoryNav}
              mainCategoryTabs={mainCategoryTabs}
              activeMainCategory={activeMainCategory}
              activeSubCategory={activeSubCategory}
              subCategoriesForMain={subCategoriesForMain}
              menuListSections={menuListSections}
              onSelectAllCategories={selectAllCategories}
              onSelectMainCategory={selectMainCategory}
              onSelectSubCategory={selectSubCategory}
              onAddMenu={handleMenuAdd}
              t={t}
            />
          </div>

          {cart.length > 0 ? (
            <>
              <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4">
                <button
                  type="button"
                  onClick={() => {
                    refreshPickupTimeBounds()
                    setOrderError("")
                    setCartSheetOpen(true)
                  }}
                  className="pointer-events-auto flex w-full max-w-[430px] items-center gap-3 rounded-2xl bg-amber-400 px-4 py-3.5 text-left text-black shadow-[0_8px_28px_rgba(212,175,55,0.38)] active:scale-[0.99]"
                >
                  <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/10">
                    <ShoppingBag className="h-5 w-5" />
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-neutral-900 px-1 text-[10px] font-bold text-white">
                      {cartItemCount > 99 ? "99+" : cartItemCount}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{t("orderViewCart")}</span>
                    <span className="block text-xs text-black/60">{t("orderPayAtPickup")}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-base font-bold tabular-nums">{formatBaht(cartTotal)}</span>
                    <span className="block text-[11px] font-medium text-black/55">
                      {t("orderItemCount", { count: String(cartItemCount) })}
                    </span>
                  </span>
                </button>
              </div>

              {cartSheetOpen ? (
                <div
                  className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
                  role="presentation"
                  onClick={() => setCartSheetOpen(false)}
                >
                  <div
                    className="flex max-h-[85vh] w-full max-w-[430px] flex-col rounded-t-[1.75rem] bg-white text-neutral-900 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex justify-center pt-2.5">
                      <span className="h-1 w-10 rounded-full bg-neutral-200" aria-hidden />
                    </div>
                    <div className="flex items-center justify-between gap-2 px-5 pb-3 pt-1">
                      <div className="flex items-center gap-2">
                        <ShoppingBag className="h-5 w-5 text-amber-600" />
                        <p className="text-base font-bold">{t("orderCartTitle")}</p>
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600">
                          {cartItemCount}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label={t("orderBack")}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-600"
                        onClick={() => setCartSheetOpen(false)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mx-5 mb-3 space-y-2 rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-3 text-xs text-amber-950">
                      <p className="font-semibold">
                        {stores.find((s) => s.storeCode === pickupStore)?.displayName || pickupStore}
                      </p>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold uppercase tracking-wider text-amber-900/70">
                          {t("orderPickupTime")}
                        </Label>
                        <Input
                          type="datetime-local"
                          value={pickupAt}
                          min={pickupMinAt}
                          onChange={(e) => {
                            setPickupAt(e.target.value)
                            setOrderError("")
                          }}
                          className="h-11 rounded-xl border-amber-200/80 bg-white text-neutral-900 [color-scheme:light]"
                        />
                        <p className="text-[11px] text-amber-900/65">{t("orderPickupTimeHint")}</p>
                      </div>
                    </div>

                    <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-2">
                      {cart.map((line) => (
                        <div
                          key={line.cartKey}
                          className="flex gap-3 rounded-xl border border-neutral-100 bg-neutral-50/80 p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-snug text-neutral-900">{line.name}</p>
                            <p className="mt-1 text-xs text-neutral-500">
                              {formatBaht(line.price)} × {line.qty}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <p className="text-sm font-bold tabular-nums text-neutral-900">
                              {formatBaht(line.price * line.qty)}
                            </p>
                            <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white p-0.5">
                              <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-700 hover:bg-neutral-50"
                                onClick={() => changeQty(line.cartKey, -1)}
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <span className="w-7 text-center text-sm tabular-nums font-semibold">{line.qty}</span>
                              <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-700 hover:bg-neutral-50"
                                onClick={() => changeQty(line.cartKey, 1)}
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-neutral-100 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                      <div className="mb-2 flex items-center justify-between">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs font-medium text-red-600/90"
                          onClick={clearCart}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t("orderClearCart")}
                        </button>
                        <span className="text-xs text-neutral-500">
                          {storePrepayEnabled ? t("orderCheckoutPayBtn") : t("orderPayAtPickup")}
                        </span>
                      </div>
                      {!!orderError ? (
                        <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                          {orderError}
                        </p>
                      ) : null}
                      <div className="mb-4 flex items-end justify-between">
                        <span className="text-sm text-neutral-500">{t("orderCartTotal")}</span>
                        <span className="text-2xl font-bold tabular-nums text-neutral-900">
                          {formatBaht(cartTotal)}
                        </span>
                      </div>
                      <Button
                        type="button"
                        disabled={submitting}
                        onClick={openCartConfirm}
                        className="h-12 w-full rounded-2xl bg-amber-400 text-base font-semibold text-black shadow-md hover:bg-amber-300"
                      >
                        {t("orderSubmit")}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              <CartConfirmDialog
                open={cartConfirmOpen}
                submitting={submitting}
                storeName={pickupStoreName}
                pickupAt={pickupAt}
                cartTotal={cartTotal}
                onCancel={() => setCartConfirmOpen(false)}
                onConfirm={handleConfirmSubmit}
                t={t}
              />
              <MemberPortalCheckoutSheet
                open={checkoutOpen}
                lang={lang}
                t={t}
                member={member}
                storeCode={pickupStore}
                storeName={pickupStoreName}
                pickupAt={pickupAt}
                cart={cart}
                onClose={() => setCheckoutOpen(false)}
                onPaid={handleCheckoutPaid}
                onError={(msg) => setOrderError(msg)}
                onRestoreCart={restoreCheckoutDraft}
              />
            </>
          ) : null}
        </>
      )}

      {optionPickerMenu ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-0 backdrop-blur-sm sm:items-center sm:px-5">
          <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-[28px] border border-white/10 bg-[#121214] shadow-2xl sm:rounded-[28px]">
            {(() => {
              const menu = optionPickerMenu
              const opts = optionsByMenuId[String(menu.id)] || []
              const stepAudience = resolveStepAudienceFromOrderType("takeout")
              const groupConfigMap = new Map(
                (menu.optionSelectionConfig || [])
                  .map((cfg) => [String(cfg?.key ?? "").trim(), cfg] as const)
                  .filter(([k]) => !!k)
              )
              const fallbackGroups = inferOptionSelectionGroupsFromOptions(opts, menu.code)
              const configuredGroups =
                (menu.optionSelectionGroups || []).length > 0
                  ? menu.optionSelectionGroups || []
                  : fallbackGroups
              const groups = filterOptionSelectionGroupsForAudience(
                configuredGroups,
                groupConfigMap,
                stepAudience
              )
              const visibleGroupKeys = new Set(groups)
              const optsFiltered = filterPosOptionsForVisibleGroups(
                opts.filter((o) => o.sellPackaging !== false),
                visibleGroupKeys
              )
              const optsWithSteps = optsFiltered.filter(
                (o) =>
                  o.optionType === "substitution" &&
                  o.optionStepValues &&
                  Object.keys(o.optionStepValues).length > 0
              )
              const isChickenBase =
                (menu.categoryMain ?? "") === "Chicken" ||
                String(menu.code || "")
                  .trim()
                  .toLowerCase()
                  .startsWith("c")
              const useMultiStep = groups.length > 0 && optsWithSteps.length > 0

              if (!useMultiStep) {
                const flatOpts = optsFiltered.filter((o) => o.optionType === "substitution")
                return (
                  <>
                    <div className="border-b border-white/10 px-5 py-4">
                      <p className="font-semibold text-white">{menu.name}</p>
                      <p className="text-xs text-white/45">{t("orderSelectOption")}</p>
                    </div>
                    <div className="space-y-2 overflow-y-auto px-5 py-4">
                      {flatOpts.length === 0 ? (
                        <Button
                          type="button"
                          className="h-11 w-full rounded-2xl bg-amber-400 font-semibold text-black hover:bg-amber-300"
                          onClick={() => addToCart(menu, null)}
                        >
                          {t("orderAdd")}
                        </Button>
                      ) : (
                        flatOpts.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => addToCart(menu, opt)}
                            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-amber-400/30 hover:bg-white/[0.06]"
                          >
                            <span className="text-sm text-white/90">{opt.name}</span>
                            <span className="shrink-0 text-sm font-semibold text-amber-200">
                              {formatBaht(packagingMenuPrice(menu) + packagingOptionModifier(opt))}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                    <div className="border-t border-white/10 p-4">
                      <Button type="button" variant="outline" className="w-full rounded-2xl border-white/15" onClick={closeOptionPicker}>
                        {t("orderBack")}
                      </Button>
                    </div>
                  </>
                )
              }

              const groupKey = groups[optionPickerStep]
              const values = collectPosOptionPickerStepValues({
                groupKey,
                groups,
                menuCode: menu.code,
                options: opts,
                optionsWithSteps: optsWithSteps,
                isChickenMenu: isChickenBase,
              })

              const handleStepSelect = (value: string) => {
                const next = { ...optionPickerSelections, [groupKey]: value }
                setOptionPickerSelections(next)
                if (optionPickerStep >= groups.length - 1) {
                  const match = resolvePosOptionPickerMatch({
                    menuCode: menu.code,
                    storeCode: pickupStore,
                    optionSelectionGroups: menu.optionSelectionGroups,
                    groups,
                    selections: next,
                    optionsWithSteps: optsWithSteps,
                    allOptions: opts,
                    groupConfigByKey: groupConfigMap,
                  })
                  if (match) {
                    addToCart(menu, match)
                  } else {
                    setOrderError(t("orderSubmitFail"))
                    closeOptionPicker()
                  }
                } else {
                  setOptionPickerStep((s) => s + 1)
                }
              }

              return (
                <>
                  <div className="border-b border-white/10 px-5 py-4">
                    <p className="font-semibold text-white">{menu.name}</p>
                    <p className="text-xs text-white/45">
                      {t("orderSelectOption")} ·{" "}
                      {t("orderOptionStep", {
                        step: String(optionPickerStep + 1),
                        total: String(groups.length),
                      })}
                    </p>
                  </div>
                  <div className="space-y-2 overflow-y-auto px-5 py-4">
                    {values.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleStepSelect(value)}
                        className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm text-white/90 transition hover:border-amber-400/30 hover:bg-white/[0.06]"
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 border-t border-white/10 p-4">
                    {optionPickerStep > 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 rounded-2xl border-white/15"
                        onClick={() => setOptionPickerStep((s) => Math.max(0, s - 1))}
                      >
                        {t("orderOptionBack")}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 rounded-2xl border-white/15"
                      onClick={closeOptionPicker}
                    >
                      {t("orderBack")}
                    </Button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      ) : null}

      {memberNoticeOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[28px] border border-amber-400/25 bg-[#121214] p-6 shadow-2xl">
            <p className="text-center text-lg font-bold text-amber-100">{t("orderMemberNoticeTitle")}</p>
            <p className="mt-3 text-center text-sm leading-relaxed text-white/65">{t("orderMemberNoticeBody")}</p>
            <Button
              type="button"
              onClick={confirmMemberNotice}
              className="mt-6 h-12 w-full rounded-2xl bg-amber-400 font-semibold text-black hover:bg-amber-300"
            >
              {t("orderMemberNoticeOk")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
