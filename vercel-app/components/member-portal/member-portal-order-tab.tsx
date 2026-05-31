"use client"

import * as React from "react"
import { ArrowLeft, ExternalLink, Minus, Plus, ShoppingBag, Store } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getPosMenus, getPosMenuOptions, type PosMenu, type PosMenuOption } from "@/lib/api-client"
import type { MemberSummary } from "@/lib/members-server"
import { formatBangkokDateTimeLocalInput } from "@/lib/member-portal-pickup-time"
import { memberPortalT, type MemberPortalKey } from "@/lib/member-portal-i18n"
import type { LangCode } from "@/lib/lang-context"
import { formatBaht } from "@/components/member-portal/portal-ui"
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

type OrderView = "hub" | "delivery" | "pickup"

type MemberPortalOrderTabProps = {
  lang: LangCode
  t: (key: MemberPortalKey, params?: Record<string, string>) => string
  member: MemberSummary
  stores: StoreRow[]
  favoriteStoreCode: string
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

export function MemberPortalOrderTab({ lang, t, member: _member, stores, favoriteStoreCode }: MemberPortalOrderTabProps) {
  const [view, setView] = React.useState<OrderView>("hub")
  const [deliveryLinks, setDeliveryLinks] = React.useState<DeliveryLinks | null>(null)
  const [deliveryLoading, setDeliveryLoading] = React.useState(false)

  const [pickupStore, setPickupStore] = React.useState(favoriteStoreCode || "")
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

  React.useEffect(() => {
    if (favoriteStoreCode && !pickupStore) setPickupStore(favoriteStoreCode)
  }, [favoriteStoreCode, pickupStore])

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

  const cartTotal = React.useMemo(
    () => cart.reduce((sum, line) => sum + line.price * line.qty, 0),
    [cart]
  )

  const loadMenus = React.useCallback(async (storeCode: string) => {
    if (!storeCode) return
    setMenusLoading(true)
    setOrderError("")
    try {
      const [rows, opts] = await Promise.all([
        getPosMenus({ storeCode, fresh: true }),
        getPosMenuOptions({ fresh: true }),
      ])
      setMenus(Array.isArray(rows) ? rows : [])
      setMenuOptions(Array.isArray(opts) ? opts : [])
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
    setOrderMessage("")
    setOrderError("")
  }

  const closeOptionPicker = () => {
    setOptionPickerMenu(null)
    setOptionPickerStep(0)
    setOptionPickerSelections({})
  }

  const addToCart = (menu: PosMenu, opt: PosMenuOption | null) => {
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
    closeOptionPicker()
  }

  const handleMenuAdd = (menu: PosMenu) => {
    const groups = menu.optionSelectionGroups
    if (Array.isArray(groups) && groups.length > 0) {
      setOptionPickerMenu(menu)
      setOptionPickerStep(0)
      setOptionPickerSelections({})
      return
    }
    addToCart(menu, null)
  }

  const goHub = () => {
    setView("hub")
    resetPickupFlow()
  }

  const startPickupMenu = () => {
    if (!pickupStore) {
      setOrderError(t("orderSelectStoreFirst"))
      return
    }
    if (!pickupAt || pickupAt < pickupMinAt) {
      setOrderError(t("orderPickupTooSoon"))
      return
    }
    setOrderError("")
    setMemberNoticeOpen(true)
  }

  const confirmMemberNotice = () => {
    setMemberNoticeOpen(false)
    setPickupReady(true)
    void loadMenus(pickupStore)
  }

  const changeQty = (cartKey: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.cartKey === cartKey ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
    )
  }

  const submitPickupOrder = async () => {
    if (!pickupStore || cart.length === 0) return
    setSubmitting(true)
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
      setOrderMessage(t("orderSubmitSuccess", { orderNo: res.orderNo || "" }))
      setCart([])
      setPickupReady(false)
      setView("hub")
    } catch {
      setOrderError(t("orderSubmitFail"))
    } finally {
      setSubmitting(false)
    }
  }

  const resolvedDeliveryLinks = deliveryLinks ?? DEFAULT_DELIVERY_LINKS

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
            className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-left transition hover:bg-white/[0.05]"
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
                <span className="font-semibold">{app.label}</span>
                <ExternalLink className="h-4 w-4 opacity-80" />
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
        <div className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-white/45">{t("orderSelectStore")}</Label>
            <select
              value={pickupStore}
              onChange={(e) => setPickupStore(e.target.value)}
              className="h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-amber-400/40"
            >
              <option value="" className="bg-[#121214]">
                {t("orderSelectStorePh")}
              </option>
              {stores.map((s) => (
                <option key={s.storeCode} value={s.storeCode} className="bg-[#121214]">
                  {s.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-white/45">{t("orderPickupTime")}</Label>
            <Input
              type="datetime-local"
              value={pickupAt}
              min={pickupMinAt}
              onChange={(e) => setPickupAt(e.target.value)}
              className="h-12 rounded-2xl border-white/10 bg-black/20 text-white [color-scheme:dark]"
            />
            <p className="text-[11px] text-white/40">{t("orderPickupTimeHint")}</p>
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
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs text-amber-100">
            {t("orderPickupSummary", {
              store: stores.find((s) => s.storeCode === pickupStore)?.displayName || pickupStore,
              time: pickupAt.replace("T", " "),
            })}
          </div>

          {menusLoading ? (
            <p className="text-sm text-white/45">{t("loginChecking")}</p>
          ) : (
            <div className="space-y-2">
              {packagingMenus.length === 0 ? (
                <p className="text-sm text-white/45">{t("orderMenuEmpty")}</p>
              ) : (
                packagingMenus.map((menu) => (
                  <div
                    key={menu.id}
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                  >
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/5">
                      <PosMenuFillImage
                        src={String(menu.imageUrl || "")}
                        alt={String(menu.name || "menu")}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{menu.name}</p>
                      <p className="text-xs text-amber-200/90">{formatBaht(Number(menu.price || 0))}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0 rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10"
                      onClick={() => handleMenuAdd(menu)}
                    >
                      {t("orderAdd")}
                    </Button>
                  </div>
                ))
              )}
              <p className="text-[11px] text-white/35">{t("orderMenuOptionsNote")}</p>
            </div>
          )}

          {cart.length > 0 && (
            <div className="sticky bottom-24 z-20 rounded-3xl border border-white/10 bg-[#121214]/95 p-4 shadow-2xl backdrop-blur-md">
              <p className="mb-2 text-sm font-medium">{t("orderCartTitle")}</p>
              <div className="max-h-40 space-y-2 overflow-y-auto">
                {cart.map((line) => (
                  <div key={line.cartKey} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-white/85">{line.name}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5"
                        onClick={() => changeQty(line.cartKey, -1)}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-6 text-center tabular-nums">{line.qty}</span>
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5"
                        onClick={() => changeQty(line.cartKey, 1)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
                <span className="text-sm text-white/55">{t("orderCartTotal")}</span>
                <span className="text-lg font-semibold text-amber-200">{formatBaht(cartTotal)}</span>
              </div>
              <Button
                type="button"
                disabled={submitting}
                onClick={() => void submitPickupOrder()}
                className="mt-3 h-12 w-full rounded-2xl bg-amber-400 font-semibold text-black hover:bg-amber-300"
              >
                {submitting ? t("saving") : t("orderSubmit")}
              </Button>
            </div>
          )}
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
