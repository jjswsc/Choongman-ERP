"use client"

import * as React from "react"
import Link from "next/link"
import { AlertTriangle, ExternalLink, Plus, Save, Search, Trash2, X, Layers, Sparkles } from "lucide-react"
import { appAlert } from "@/lib/app-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { useAuth } from "@/lib/auth-context"
import {
  deletePosPromoItem,
  getMenuCost,
  getPosMenuCostAnalysis,
  getPosDeliveryApps,
  getNextPosPromoCode,
  getPosMenuOptions,
  getPosPromoItems,
  savePosPromo,
  savePosPromoItem,
  type PosMenu,
  type PosMenuOption,
  type PosMenuCategoriesConfig,
  type PosPromo,
} from "@/lib/api-client"
import { POS_CATEGORIES_BY_MAIN } from "@/lib/pos-menu-categories"
import {
  PROMOTION_DEFAULT_SUBCATEGORIES,
  PROMOTION_MAIN_CATEGORY,
} from "@/lib/pos-promo-constants"
import {
  buildCostAnalysisLookups,
  calcPromoEconomics,
  calcRegularPriceSum,
  promoCostKey,
  resolveBundleSalePriceThb,
  resolveCostFromAnalysisMaps,
  type PromoLineLike,
} from "@/lib/promo-economics"

const CHICKEN_CODE_PREFIX = "c"
function isChickenMenu(code: string | undefined): boolean {
  return !!code?.trim().toLowerCase().startsWith(CHICKEN_CODE_PREFIX)
}
function isChickenDefaultOption(name: string | undefined): boolean {
  if (!name?.trim()) return false
  const n = name.trim()
  return /^S\s*[-]?\s*순살\s*$/i.test(n) || n === "S 순살" || n === "S - 순살" || n === "S-순살"
}

/** 주문·프로모 공통 배달앱 코드 (POS 라벨 인식과 동일: grab / lineman / shopee) */
const DEFAULT_PICKER_DELIVERY_APPS = [
  { code: "grab", nameKey: "posDeliveryAppGrab" as const },
  { code: "lineman", nameKey: "posDeliveryAppLineMan" as const },
  { code: "shopee", nameKey: "posDeliveryAppShopee" as const },
]

const CANON_DELIVERY_CODES = new Set(DEFAULT_PICKER_DELIVERY_APPS.map((d) => d.code))

function normalizeDeliveryAppCode(raw: string): string {
  const x = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
  if (x === "grab") return "grab"
  if (x === "lineman" || x === "linemanfood") return "lineman"
  if (x === "shopee" || x === "shopeefood") return "shopee"
  return String(raw ?? "").trim().toLowerCase()
}

function normalizeDeliveryAppCodesList(codes: string[] | null | undefined): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const c of codes ?? []) {
    const n = normalizeDeliveryAppCode(c)
    if (!n || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

export type PosSetMenuTabWorkspaceProps = {
  menus: PosMenu[]
  mainCategories: string[]
  categoriesConfig: PosMenuCategoriesConfig | null
  optionPartLabel: (name: string) => string
  promos: PosPromo[]
  promosLoading: boolean
  schemaOk: boolean | null
  schemaBannerDismissed: boolean
  onDismissSchemaBanner: () => void
  onAfterSave: () => void
  /** 조회 탭 등에서 넘길 때: 해당 프로모 편집으로 전환 후 부모에서 초기화 */
  focusPromoId?: string | null
  onFocusPromoConsumed?: () => void
  /** 마케팅 화면: 항상 이 캠페인에 연결(신규는 standaloneSetMenu false, 코드 자동 채번) */
  fixedMarketingCampaignId?: string | null
}

type ComposerLine = {
  key: string
  menuId: string
  optionId: string | null
  qty: number
  menuName: string
  optionLabel?: string
}

type CostEntry = { hall: number; del: number }

const emptyForm = () => ({
  marketingCampaignId: "",
  code: "",
  name: "",
  category: PROMOTION_DEFAULT_SUBCATEGORIES[0] as string,
  price: "",
  priceDelivery: "",
  vatIncluded: true,
  isActive: true,
  channelHall: true,
  channelTakeout: true,
  channelDelivery: true,
  deliveryAppCodes: normalizeDeliveryAppCodesList(
    DEFAULT_PICKER_DELIVERY_APPS.map((d) => d.code)
  ),
})

export function PosSetMenuTabWorkspace({
  menus,
  mainCategories,
  categoriesConfig,
  optionPartLabel,
  promos,
  promosLoading,
  schemaOk,
  schemaBannerDismissed,
  onDismissSchemaBanner,
  onAfterSave,
  focusPromoId,
  onFocusPromoConsumed,
  fixedMarketingCampaignId,
}: PosSetMenuTabWorkspaceProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const fixedCid = (fixedMarketingCampaignId ?? "").trim()

  const [allOptions, setAllOptions] = React.useState<PosMenuOption[]>([])
  const [editPromoId, setEditPromoId] = React.useState<string | null>(null)
  /** 신규 초안 세션(캠페인 고정 시 다음 코드 재채번) */
  const [promoDraftGen, setPromoDraftGen] = React.useState(0)
  const [form, setForm] = React.useState(emptyForm)
  const [lines, setLines] = React.useState<ComposerLine[]>([])
  const [savingPromo, setSavingPromo] = React.useState(false)
  const [savingSet, setSavingSet] = React.useState(false)
  const [loadingEdit, setLoadingEdit] = React.useState(false)

  const [pickMain, setPickMain] = React.useState("all")
  const [pickSub, setPickSub] = React.useState("all")
  const [pickSearchInput, setPickSearchInput] = React.useState("")
  /** [검색] 후 적용된 검색어(빈 문자열 = 이름·코드 필터 없음, 대·소분류만 적용) */
  const [pickSearchApplied, setPickSearchApplied] = React.useState("")
  /** 검색 버튼/Enter로 목록을 연 뒤에만 리스트 표시 */
  const [pickMenuListShown, setPickMenuListShown] = React.useState(false)
  const [pickMenuId, setPickMenuId] = React.useState("")
  const [pickQty, setPickQty] = React.useState("1")

  const [discountMode, setDiscountMode] = React.useState<"pct" | "baht">("pct")
  const [discountPctStr, setDiscountPctStr] = React.useState("")
  const [discountBahtStr, setDiscountBahtStr] = React.useState("")
  const [salesSetCountStr, setSalesSetCountStr] = React.useState("")
  /** 가격 분석: 홀·배달 채널 모두 켜진 경우 전환 */
  const [priceAnalysisChannel, setPriceAnalysisChannel] = React.useState<"hall" | "delivery">("hall")

  const [costMap, setCostMap] = React.useState<Record<string, CostEntry>>({})
  const [costAnalysisMap, setCostAnalysisMap] = React.useState<Record<string, CostEntry>>({})
  const [costAnalysisCodeMap, setCostAnalysisCodeMap] = React.useState<Record<string, CostEntry>>({})
  const [costAnalysisLoaded, setCostAnalysisLoaded] = React.useState(false)
  const [remoteDeliveryApps, setRemoteDeliveryApps] = React.useState<{ code: string; name: string }[]>([])

  const mirrorMenus = React.useMemo(
    () =>
      sortByCode(
        menus.filter((m) => m.promoId != null && String(m.promoId).trim() !== ""),
        (m) => m.code
      ),
    [menus]
  )

  React.useEffect(() => {
    void getPosMenuOptions()
      .then((o) => setAllOptions(Array.isArray(o) ? o : []))
      .catch(() => setAllOptions([]))
  }, [])

  React.useEffect(() => {
    const sc = auth?.store?.trim() || undefined
    void getPosDeliveryApps({ storeCode: sc, includeDisabled: false })
      .then((list) =>
        setRemoteDeliveryApps(
          (list || [])
            .map((a) => ({ code: String(a.code || "").trim(), name: String(a.name || a.code || "") }))
            .filter((a) => a.code)
        )
      )
      .catch(() => setRemoteDeliveryApps([]))
  }, [auth?.store])

  const deliveryAppsPicker = React.useMemo(() => {
    const base = DEFAULT_PICKER_DELIVERY_APPS.map((d) => ({ code: d.code, name: t(d.nameKey) }))
    const seen = new Set<string>(CANON_DELIVERY_CODES)
    const extras: { code: string; name: string }[] = []
    for (const a of remoteDeliveryApps) {
      const c = normalizeDeliveryAppCode(a.code)
      if (!c || seen.has(c)) continue
      seen.add(c)
      extras.push({ code: c, name: String(a.name || c).trim() || c })
    }
    return [...base, ...extras]
  }, [remoteDeliveryApps, t, lang])

  React.useEffect(() => {
    let cancelled = false
    void getPosMenuCostAnalysis({ summary: true })
      .then((rows) => {
        if (cancelled) return
        const lookups = buildCostAnalysisLookups(rows ?? [])
        setCostAnalysisMap(lookups.byMenuKey)
        setCostAnalysisCodeMap(lookups.byCodeKey)
        setCostAnalysisLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setCostAnalysisLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const optionsByMenuId = React.useMemo(() => {
    const m: Record<string, PosMenuOption[]> = {}
    for (const o of allOptions) {
      const mid = String(o.menuId ?? "")
      if (!mid) continue
      if (!m[mid]) m[mid] = []
      m[mid].push(o)
    }
    return m
  }, [allOptions])

  const pickSubCategories = React.useMemo(() => {
    const main = pickMain === "all" ? null : pickMain.trim() || null
    if (!main) {
      const s = new Set<string>()
      for (const m of menus) {
        const c = m.category?.trim()
        if (c) s.add(c)
      }
      return Array.from(s).sort()
    }
    const presetFromConfig = categoriesConfig?.categoriesByMain?.[main]
    const presetFromLib =
      main in POS_CATEGORIES_BY_MAIN ? POS_CATEGORIES_BY_MAIN[main as keyof typeof POS_CATEGORIES_BY_MAIN] : null
    const preset = presetFromConfig?.length ? presetFromConfig : presetFromLib ?? []
    const fromMenus = menus
      .filter((m) => (m.categoryMain ?? "") === main)
      .map((m) => m.category)
      .filter((c): c is string => typeof c === "string" && c !== "")
    return Array.from(new Set([...preset, ...fromMenus]))
      .filter((c): c is string => typeof c === "string")
      .sort()
  }, [pickMain, menus, categoriesConfig])

  const eligibleMenus = React.useMemo(
    () => menus.filter((m) => m.isActive && !(m.promoId != null && String(m.promoId).trim() !== "")),
    [menus]
  )

  const applyPickMenuSearch = React.useCallback(() => {
    setPickSearchApplied(pickSearchInput.trim())
    setPickMenuListShown(true)
  }, [pickSearchInput])

  const filteredPickMenus = React.useMemo(() => {
    if (!pickMenuListShown) return []
    const q = pickSearchApplied.toLowerCase()
    return eligibleMenus.filter((m) => {
      if (pickMain !== "all" && (m.categoryMain ?? "") !== pickMain) return false
      if (pickSub !== "all" && (m.category ?? "") !== pickSub) return false
      if (!q) return true
      const nm = (m.name ?? "").toLowerCase()
      const cd = (m.code ?? "").toLowerCase()
      return nm.includes(q) || cd.includes(q)
    })
  }, [eligibleMenus, pickMain, pickSub, pickSearchApplied, pickMenuListShown])

  const menuById = React.useMemo(() => {
    const r: Record<string, PosMenu> = {}
    for (const m of menus) r[String(m.id)] = m
    return r
  }, [menus])

  const promoItemsLike: PromoLineLike[] = React.useMemo(
    () => lines.map((ln) => ({ menuId: ln.menuId, optionId: ln.optionId, quantity: ln.qty })),
    [lines]
  )

  const menuRowsForPricing = React.useMemo(
    () => menus.map((m) => ({ id: m.id, price: m.price, priceDelivery: m.priceDelivery })),
    [menus]
  )

  const regularSum = React.useMemo(
    () =>
      calcRegularPriceSum({
        items: promoItemsLike,
        menus: menuRowsForPricing,
        optionsByMenuId,
        channel: "hall",
      }),
    [promoItemsLike, menuRowsForPricing, optionsByMenuId]
  )

  const regularSumDelivery = React.useMemo(
    () =>
      calcRegularPriceSum({
        items: promoItemsLike,
        menus: menuRowsForPricing,
        optionsByMenuId,
        channel: "delivery",
      }),
    [promoItemsLike, menuRowsForPricing, optionsByMenuId]
  )

  const missingCostKeys = React.useMemo(() => {
    if (!costAnalysisLoaded) return ""
    const need = new Set<string>()
    for (const ln of lines) {
      const k = promoCostKey(ln.menuId, ln.optionId)
      const fromAnalysis = resolveCostFromAnalysisMaps(
        costAnalysisMap,
        costAnalysisCodeMap,
        menuById,
        ln.menuId,
        ln.optionId
      )
      if (fromAnalysis == null && costMap[k] == null) need.add(k)
    }
    return [...need].sort().join("|")
  }, [lines, costMap, costAnalysisMap, costAnalysisCodeMap, costAnalysisLoaded, menuById])

  React.useEffect(() => {
    if (!missingCostKeys) return
    const keys = missingCostKeys.split("|").filter(Boolean)
    let cancelled = false
    for (const k of keys) {
      const line = lines.find((ln) => promoCostKey(ln.menuId, ln.optionId) === k)
      if (!line) continue
      void getMenuCost({ menuId: line.menuId, optionId: line.optionId || undefined })
        .then((r) => {
          if (cancelled) return
          const hall = (r as { costHall?: number }).costHall ?? (r as { cost?: number }).cost ?? 0
          const del = (r as { costDelivery?: number }).costDelivery ?? hall
          setCostMap((prev) => (prev[k] != null ? prev : { ...prev, [k]: { hall, del } }))
        })
        .catch(() => {
          if (cancelled) return
          setCostMap((prev) => (prev[k] != null ? prev : { ...prev, [k]: { hall: 0, del: 0 } }))
        })
    }
    return () => {
      cancelled = true
    }
  }, [missingCostKeys, lines])

  const costHallTotal = React.useMemo(() => {
    let s = 0
    for (const ln of lines) {
      const k = promoCostKey(ln.menuId, ln.optionId)
      const c =
        resolveCostFromAnalysisMaps(costAnalysisMap, costAnalysisCodeMap, menuById, ln.menuId, ln.optionId) ??
        costMap[k]
      s += (c?.hall ?? 0) * ln.qty
    }
    return s
  }, [lines, costMap, costAnalysisMap, costAnalysisCodeMap, menuById])

  const costDelTotal = React.useMemo(() => {
    let s = 0
    for (const ln of lines) {
      const k = promoCostKey(ln.menuId, ln.optionId)
      const c =
        resolveCostFromAnalysisMaps(costAnalysisMap, costAnalysisCodeMap, menuById, ln.menuId, ln.optionId) ??
        costMap[k]
      s += (c?.del ?? 0) * ln.qty
    }
    return s
  }, [lines, costMap, costAnalysisMap, costAnalysisCodeMap, menuById])

  const costsReady =
    !costAnalysisLoaded ||
    lines.length === 0 ||
    lines.every((ln) => {
      const k = promoCostKey(ln.menuId, ln.optionId)
      return (
        resolveCostFromAnalysisMaps(costAnalysisMap, costAnalysisCodeMap, menuById, ln.menuId, ln.optionId) !=
          null || costMap[k] != null
      )
    })

  const saleHall = Number(form.price) || 0
  const saleDel =
    form.priceDelivery.trim() !== "" && Number.isFinite(Number(form.priceDelivery))
      ? Number(form.priceDelivery)
      : saleHall

  /** 홀·포장은 동일 정가 합; 배달은 별도 정가 합 */
  const showPricingHall = form.channelHall || form.channelTakeout
  const showPricingDelivery = form.channelDelivery

  React.useEffect(() => {
    if (showPricingHall && !showPricingDelivery) setPriceAnalysisChannel("hall")
    else if (!showPricingHall && showPricingDelivery) setPriceAnalysisChannel("delivery")
  }, [showPricingHall, showPricingDelivery])

  const economics = React.useMemo(
    () =>
      calcPromoEconomics({
        regularPriceSum: regularSum,
        costTotalHall: costHallTotal,
        costTotalDelivery: costDelTotal,
        salePriceHall: saleHall,
        salePriceDelivery: form.priceDelivery.trim() !== "" ? saleDel : undefined,
      }),
    [regularSum, costHallTotal, costDelTotal, saleHall, saleDel, form.priceDelivery]
  )

  const salesSetCount = Math.max(0, Number(salesSetCountStr.replace(/,/g, "")) || 0)
  const projectedProfitHall = salesSetCount > 0 ? economics.marginBaht * salesSetCount : null

  const activePriceAnalysis: "hall" | "delivery" =
    showPricingHall && showPricingDelivery
      ? priceAnalysisChannel
      : showPricingHall
        ? "hall"
        : "delivery"
  const paCostTotal = activePriceAnalysis === "hall" ? costHallTotal : costDelTotal
  const paCostRate = activePriceAnalysis === "hall" ? economics.costRateHall : economics.costRateDelivery
  const paMarginPct = activePriceAnalysis === "hall" ? economics.marginPercent : economics.marginPercentDel
  const paMarginBaht = activePriceAnalysis === "hall" ? economics.marginBaht : economics.marginBahtDel
  const paSaleRef = activePriceAnalysis === "hall" ? saleHall : saleDel

  React.useEffect(() => {
    if (!editPromoId) {
      const base = emptyForm()
      setForm(fixedCid ? { ...base, marketingCampaignId: fixedCid } : base)
      setLines([])
      setDiscountPctStr("")
      setDiscountBahtStr("")
      setLoadingEdit(false)
      return
    }
    let cancelled = false
    setLoadingEdit(true)
    void (async () => {
      try {
        const promo = promos.find((p) => String(p.id) === String(editPromoId))
        const items = await getPosPromoItems({ promoId: editPromoId }).catch(() => [])
        if (cancelled) return
        setForm({
          marketingCampaignId: promo?.marketingCampaignId?.trim() ?? "",
          code: promo?.code ?? "",
          name: promo?.name ?? "",
          category: promo?.category?.trim() || PROMOTION_DEFAULT_SUBCATEGORIES[0],
          price: promo != null ? String(promo.price) : "",
          priceDelivery: promo?.priceDelivery != null ? String(promo.priceDelivery) : "",
          vatIncluded: promo?.vatIncluded !== false,
          isActive: promo?.isActive !== false,
          channelHall: promo?.channelHall !== false,
          channelTakeout: promo?.channelTakeout !== false,
          channelDelivery: promo?.channelDelivery !== false,
          deliveryAppCodes: normalizeDeliveryAppCodesList(promo?.deliveryAppCodes ?? null),
        })
        const nextLines: ComposerLine[] = (items || []).map((it) => {
          const menu = menus.find((m) => String(m.id) === String(it.menuId))
          const opt = it.optionId ? allOptions.find((o) => String(o.id) === String(it.optionId)) : null
          return {
            key: `db-${it.id}`,
            menuId: String(it.menuId),
            optionId: it.optionId ? String(it.optionId) : null,
            qty: Number(it.quantity) || 1,
            menuName: menu?.name ?? `menu ${it.menuId}`,
            optionLabel: opt?.name,
          }
        })
        setLines(nextLines)
        setDiscountPctStr("")
        setDiscountBahtStr("")
      } finally {
        if (!cancelled) setLoadingEdit(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [editPromoId, promos, menus, allOptions, fixedCid])

  React.useEffect(() => {
    if (!fixedCid || editPromoId) return
    let cancelled = false
    void getNextPosPromoCode({ campaignId: fixedCid })
      .then((r) => {
        if (cancelled) return
        const next = r?.code?.trim()
        if (!next) return
        setForm((p) => {
          if (p.code.trim()) return p
          if ((p.marketingCampaignId || "").trim() !== fixedCid) return p
          return { ...p, code: next }
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [editPromoId, fixedCid, promoDraftGen])

  const promoById = React.useMemo(() => {
    const r: Record<string, PosPromo> = {}
    for (const p of promos) r[String(p.id)] = p
    return r
  }, [promos])

  /** DB에 이미 있는 프로모션 표시명 목록 (그룹 선택용) */
  const promoGroupNamesSorted = React.useMemo(() => {
    const s = new Set<string>()
    for (const p of promos) {
      const n = (p.name ?? "").trim()
      if (n) s.add(n)
    }
    return [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
  }, [promos])

  /** 셀렉트에 현재 입력 중인 이름도 올려서 값이 항상 유효하도록 */
  const namesForGroupSelect = React.useMemo(() => {
    const cur = form.name.trim()
    const merged = new Set(promoGroupNamesSorted)
    if (cur) merged.add(cur)
    return [...merged].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
  }, [promoGroupNamesSorted, form.name])

  const groupSelectValue = form.name.trim() ? form.name.trim() : "__new__"

  const applyPromoGroupPick = React.useCallback((raw: string) => {
    if (raw === "__new__") {
      setForm((p) => ({ ...p, name: "", code: "" }))
      setEditPromoId(null)
      setLines([])
      return
    }
    setForm((p) => ({ ...p, name: raw, code: "" }))
    setEditPromoId(null)
    setLines([])
  }, [])

  /** 오른쪽 목록: 프로모션명(마스터 name) 기준 그룹 */
  const mirrorMenusByPromoName = React.useMemo(() => {
    const m = new Map<string, PosMenu[]>()
    for (const menu of mirrorMenus) {
      const pid = String(menu.promoId ?? "").trim()
      const pr = pid ? promoById[pid] : undefined
      const label = (pr?.name ?? menu.name ?? "").trim() || "—"
      if (!m.has(label)) m.set(label, [])
      m.get(label)!.push(menu)
    }
    const entries = [...m.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    for (const [, rows] of entries) {
      rows.sort((a, b) => String(a.code ?? "").localeCompare(String(b.code ?? "")))
    }
    return entries
  }, [mirrorMenus, promoById])

  /** 우측 목록: 현재 편집 중인 프로모션명(그룹)과 같은 이름의 미러 세트만 */
  const savedSetsNameKey = React.useMemo(() => {
    if (editPromoId) {
      const pr = promoById[editPromoId]
      return (pr?.name ?? "").trim() || form.name.trim()
    }
    return form.name.trim()
  }, [editPromoId, promoById, form.name])

  const mirrorRowsForCurrentPromoName = React.useMemo(() => {
    if (!savedSetsNameKey) return [] as PosMenu[]
    const entry = mirrorMenusByPromoName.find(([n]) => n === savedSetsNameKey)
    return entry ? entry[1] : []
  }, [mirrorMenusByPromoName, savedSetsNameKey])

  React.useEffect(() => {
    const id = focusPromoId?.trim()
    if (!id) return
    setEditPromoId(id)
    onFocusPromoConsumed?.()
  }, [focusPromoId, onFocusPromoConsumed])

  const startNew = () => {
    setEditPromoId(null)
    const base = emptyForm()
    setForm(fixedCid ? { ...base, marketingCampaignId: fixedCid } : base)
    setLines([])
    setPickMenuId("")
    setDiscountPctStr("")
    setDiscountBahtStr("")
    setSalesSetCountStr("")
    setPromoDraftGen((n) => n + 1)
  }

  /** 같은 프로모션명·채널·가격 등은 유지하고 새 세트(새 코드)만 구성 */
  const startNewSetKeepPromoMeta = () => {
    setEditPromoId(null)
    setLines([])
    setPickMenuId("")
    setDiscountPctStr("")
    setDiscountBahtStr("")
    setSalesSetCountStr("")
    setForm((p) => ({ ...p, code: "" }))
  }

  const resetBundleOnly = () => {
    setLines([])
    setDiscountPctStr("")
    setDiscountBahtStr("")
    setSalesSetCountStr("")
    setPickMenuId("")
  }

  const isMenuAlreadyInBundle = (menuId: string) =>
    lines.some((ln) => String(ln.menuId) === String(menuId))

  const toggleDeliveryApp = (code: string) => {
    const canon = normalizeDeliveryAppCode(code)
    if (!canon) return
    setForm((p) => {
      const set = new Set(p.deliveryAppCodes.map(normalizeDeliveryAppCode).filter(Boolean))
      if (set.has(canon)) set.delete(canon)
      else set.add(canon)
      return { ...p, deliveryAppCodes: [...set] }
    })
  }

  const appendPickLine = React.useCallback(
    (menuId: string, optionId: string | null, qtyStr: string) => {
      const menu = menuById[menuId]
      if (!menu) return
      const optsRaw = optionsByMenuId[menuId] || []
      const opt = optionId ? optsRaw.find((o) => String(o.id) === String(optionId)) : null
      const qty = Math.max(0.5, Number(qtyStr) || 1)
      setLines((prev) => [
        ...prev,
        {
          key: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          menuId,
          optionId,
          qty,
          menuName: menu.name ?? "",
          optionLabel: opt?.name,
        },
      ])
    },
    [menuById, optionsByMenuId]
  )

  const pickOptionsForMenu = React.useCallback(
    (menuId: string, menuCode: string | undefined) => {
      const optsRaw = optionsByMenuId[menuId] || []
      return isChickenMenu(menuCode) ? optsRaw.filter((o) => !isChickenDefaultOption(o.name)) : optsRaw
    },
    [optionsByMenuId]
  )

  /** 옵션 0·1개는 즉시 조합 반영, 2개 이상만 옵션 선택 패널 */
  const handlePickMenuFromList = (m: PosMenu) => {
    const mid = String(m.id)
    const opts = pickOptionsForMenu(mid, m.code)
    if (opts.length === 0) {
      appendPickLine(mid, null, pickQty)
      return
    }
    if (opts.length === 1) {
      appendPickLine(mid, String(opts[0].id), pickQty)
      return
    }
    setPickMenuId(mid)
  }

  const finishPickMultiOption = (optionId: string) => {
    if (!pickMenuId.trim()) return
    appendPickLine(pickMenuId, optionId, pickQty)
    setPickMenuId("")
    setPickQty("1")
  }

  const pickOptionsFiltered = React.useMemo(() => {
    const menu = menuById[pickMenuId]
    const raw = pickMenuId ? optionsByMenuId[pickMenuId] || [] : []
    if (!menu) return raw
    if (isChickenMenu(menu.code)) return raw.filter((o) => !isChickenDefaultOption(o.name))
    return raw
  }, [pickMenuId, optionsByMenuId, menuById])

  const resolvedDiscountSaleHallThb = React.useMemo(
    () =>
      resolveBundleSalePriceThb({
        regularPriceSum: regularSum,
        salePriceDirectStr: "",
        discountPctStr,
        discountBahtStr,
        discountMode,
      }),
    [regularSum, discountPctStr, discountBahtStr, discountMode]
  )

  const resolvedDiscountSaleDeliveryThb = React.useMemo(
    () =>
      resolveBundleSalePriceThb({
        regularPriceSum: regularSumDelivery,
        salePriceDirectStr: "",
        discountPctStr,
        discountBahtStr,
        discountMode,
      }),
    [regularSumDelivery, discountPctStr, discountBahtStr, discountMode]
  )

  const applyDiscountToHallPrice = () => {
    setForm((p) => ({ ...p, price: String(resolvedDiscountSaleHallThb) }))
  }

  const applyDiscountToDeliveryPrice = () => {
    setForm((p) => ({ ...p, priceDelivery: String(resolvedDiscountSaleDeliveryThb) }))
  }

  const applyDiscountToHallAndDelivery = () => {
    setForm((p) => ({
      ...p,
      price: String(resolvedDiscountSaleHallThb),
      priceDelivery: String(resolvedDiscountSaleDeliveryThb),
    }))
  }

  const replacePromoItems = async (promoId: string) => {
    const existing = await getPosPromoItems({ promoId }).catch(() => [])
    for (const row of existing || []) {
      await deletePosPromoItem({ id: row.id })
    }
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i]
      const res = await savePosPromoItem({
        promoId: Number(promoId),
        menuId: Number(ln.menuId),
        optionId: ln.optionId ? Number(ln.optionId) : null,
        quantity: ln.qty,
        sortOrder: i,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("msg_save_fail"))
        return false
      }
    }
    return true
  }

  const buildSavePromoPayload = () => {
    const name = form.name.trim()
    const codeTrim = form.code.trim()
    const effCid = form.marketingCampaignId.trim() || fixedCid
    const dpct = regularSum > 0 ? Math.round(economics.discountPercent * 100) / 100 : null
    return {
      name,
      codeTrim,
      dpct,
      payload: {
        id: editPromoId || undefined,
        code: editPromoId ? codeTrim : undefined,
        name,
        category: form.category.trim() || PROMOTION_DEFAULT_SUBCATEGORIES[0],
        categoryMain: PROMOTION_MAIN_CATEGORY,
        price: saleHall,
        priceDelivery: form.priceDelivery.trim() !== "" ? Number(form.priceDelivery) : null,
        vatIncluded: form.vatIncluded,
        isActive: form.isActive,
        marketingCampaignId: effCid || null,
        channelHall: form.channelHall,
        channelTakeout: form.channelTakeout,
        channelDelivery: form.channelDelivery,
        deliveryAppCodes:
          form.channelDelivery && form.deliveryAppCodes.length > 0
            ? normalizeDeliveryAppCodesList(form.deliveryAppCodes)
            : null,
        discountPercent: dpct,
        validFrom: null,
        validTo: null,
        marketingActualCost: 0,
        standaloneSetMenu: !editPromoId && !effCid,
        userRole: auth?.role,
        userName: auth?.user,
      },
    }
  }

  /** 프로모 마스터만 (이름·채널·가격·VAT 등). 조합 줄은 저장하지 않음 */
  const handleSavePromo = async () => {
    if (savingPromo || savingSet) return
    const { name, codeTrim, payload } = buildSavePromoPayload()
    if (!name) {
      await appAlert(t("posMenuAlertCodeName"))
      return
    }
    if (!form.channelHall && !form.channelTakeout && !form.channelDelivery) {
      await appAlert(t("posSetTabChannelsRequired"))
      return
    }
    if (editPromoId && !codeTrim) {
      await appAlert(t("posMenuAlertCodeName"))
      return
    }
    setSavingPromo(true)
    try {
      const res = await savePosPromo(payload)
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("msg_save_fail_detail"))
        return
      }
      const pid = editPromoId || res.id
      if (!pid) {
        await appAlert(t("msg_save_fail_detail"))
        return
      }
      setEditPromoId(String(pid))
      await appAlert(t("posSetTabPromoSaved"))
      onAfterSave()
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSavingPromo(false)
    }
  }

  /** 조합 줄만. 프로모 마스터는 먼저 저장되어 있어야 함 */
  const handleSaveSetComposition = async () => {
    if (savingPromo || savingSet) return
    if (!editPromoId) {
      await appAlert(t("posSetTabSaveSetNeedPromoFirst"))
      return
    }
    if (lines.length === 0) {
      await appAlert(t("posSetTabNeedLines"))
      return
    }
    setSavingSet(true)
    try {
      const itemsOk = await replacePromoItems(editPromoId)
      if (!itemsOk) return
      await appAlert(t("posSetTabSetCompositionSaved"))
      onAfterSave()
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSavingSet(false)
    }
  }

  const menuLineBadge = t("posSetTabMenuLineCount").replace("{{n}}", String(lines.length))

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-base font-bold tracking-tight">{t("posSetTabWorkspaceTitle")}</h3>
          {t("posSetTabWorkspaceDesc") ? (
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground leading-relaxed">{t("posSetTabWorkspaceDesc")}</p>
          ) : null}
          <p className="mt-2 max-w-2xl text-[11px] text-muted-foreground/90 leading-relaxed border-l-2 border-emerald-500/60 pl-3">
            {fixedCid ? t("posSetTabMarketingCampaignContextNote") : t("posSetTabMarketingPromoNote")}
          </p>
        </div>
        {!fixedCid ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 text-xs" asChild>
              <Link href="/admin/marketing/promos">
                <ExternalLink className="h-3.5 w-3.5" />
                {t("posMenuSetOpenMarketing")}
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      {schemaOk === false && !schemaBannerDismissed && (
        <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-semibold">{t("posPromoSchemaBannerTitle")}</p>
            <p className="text-xs leading-relaxed opacity-90">{t("posPromoSchemaBannerBody")}</p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-md p-1 hover:bg-amber-200/60 dark:hover:bg-amber-900/50"
            aria-label={t("cancel")}
            onClick={onDismissSchemaBanner}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {(promosLoading || loadingEdit) && (
        <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">{t("loading")}</div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(220px,1.01fr)_minmax(300px,1.63fr)_minmax(260px,0.95fr)] xl:items-start">
        {/* 좌: 카테고리 + 메뉴 */}
        <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/20 p-4 shadow-sm dark:bg-zinc-950/40">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-foreground">{t("posMenuBundleSimPickTitle")}</p>
            <span className="text-[10px] text-muted-foreground">{t("posSetTabCostFromAnalysis")}</span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed border-l-2 border-border pl-2.5">
            {t("posSetTabPickMenusCategoryHint")}
          </p>
          <Select value={pickMain} onValueChange={(v) => { setPickMain(v); setPickSub("all") }}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder={t("posMenuCategoryMain")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("posMenuCategoryAll")}</SelectItem>
              {mainCategories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={pickSub} onValueChange={setPickSub}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder={t("posMenuCategorySub")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("posMenuCategoryAll")}</SelectItem>
              {pickSubCategories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input
              className="h-9 min-w-0 flex-1 text-xs"
              placeholder={t("posSetTabSearchMenuPh")}
              value={pickSearchInput}
              onChange={(e) => setPickSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  applyPickMenuSearch()
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              className="h-9 shrink-0 gap-1 px-3 text-xs"
              onClick={applyPickMenuSearch}
            >
              <Search className="h-3.5 w-3.5" />
              {t("search")}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[10px] text-muted-foreground">{t("qty")}</span>
            <Input
              type="number"
              min={0.5}
              step={0.5}
              className="h-8 w-20 text-right text-xs tabular-nums"
              value={pickQty}
              onChange={(e) => setPickQty(e.target.value)}
              aria-label={t("qty")}
            />
            {t("posSetTabPickQtyHint") ? (
              <span className="text-[10px] text-muted-foreground leading-tight">{t("posSetTabPickQtyHint")}</span>
            ) : null}
          </div>
          <div className="max-h-[min(420px,55vh)] overflow-y-auto rounded-lg border border-border/60 bg-card/80">
            {!pickMenuListShown ? (
              t("posSetTabPickSearchHint") ? (
                <p className="p-4 text-center text-xs text-muted-foreground leading-relaxed">{t("posSetTabPickSearchHint")}</p>
              ) : (
                <div className="min-h-[72px]" aria-hidden />
              )
            ) : filteredPickMenus.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">{t("itemsNoResults")}</p>
            ) : (
              <ul className="divide-y divide-border/50 text-xs">
                {filteredPickMenus.map((m) => {
                  const ac = resolveCostFromAnalysisMaps(
                    costAnalysisMap,
                    costAnalysisCodeMap,
                    menuById,
                    String(m.id),
                    null
                  )
                  const hallCost = ac?.hall
                  const listHall = m.price ?? 0
                  const inBundle = isMenuAlreadyInBundle(String(m.id))
                  return (
                    <li
                      key={m.id}
                      className="flex flex-col gap-2 px-3 py-2.5 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium leading-tight">{m.name}</p>
                          <p className="truncate text-[10px] text-muted-foreground font-mono">{m.code}</p>
                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold tabular-nums leading-snug">
                            <span className="text-foreground">
                              {t("itemsCost")} ฿
                              {hallCost != null ? hallCost.toFixed(1) : costAnalysisLoaded ? "—" : "…"}
                            </span>
                            <span className="text-emerald-700 dark:text-emerald-300">
                              {t("itemsSellingPrice")} ฿{Math.round(listHall).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {inBundle ? (
                            <Badge variant="secondary" className="text-[10px] font-normal">
                              {t("posSetTabAdded")}
                            </Badge>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 gap-1 bg-emerald-600 px-2 text-[10px] text-white hover:bg-emerald-700"
                            onClick={() => handlePickMenuFromList(m)}
                          >
                            <Plus className="h-3 w-3" />
                            {t("posMenuBundleSimUseMenu")}
                          </Button>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          {pickMenuId ? (
            <div className="space-y-2 rounded-md border border-dashed border-primary/30 bg-primary/5 p-2">
              <p className="text-[10px] font-semibold text-muted-foreground">{t("posSetTabPickOptionPrompt")}</p>
              <p className="text-xs font-medium">{menuById[pickMenuId]?.name}</p>
              {pickOptionsFiltered.length > 1 ? (
                <Select key={pickMenuId} onValueChange={(v) => finishPickMultiOption(v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={t("posPromoSelectOption")} />
                  </SelectTrigger>
                  <SelectContent>
                    {pickOptionsFiltered.map((o) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        {optionPartLabel(o.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* 중앙: 세트 요약 + 구성 + 지표 */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm ring-1 ring-emerald-500/10 dark:bg-zinc-950/35">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold tracking-tight">{t("posSetTabComposeHeader")}</p>
                {lines.length > 0 ? (
                  <Badge variant="outline" className="border-emerald-500/40 font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
                    {menuLineBadge}
                  </Badge>
                ) : null}
              </div>
                <Sparkles className="h-4 w-4 text-emerald-500/70" aria-hidden />
            </div>
            {lines.length > 0 && (showPricingHall || showPricingDelivery) ? (
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2 text-[11px] dark:bg-emerald-950/25">
                <span className="shrink-0 font-semibold text-emerald-800 dark:text-emerald-200">
                  {t("posSetTabQuickSummaryTitle")}
                </span>
                {showPricingHall ? (
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-muted-foreground">{t("posMenuPriceHall")}</span>
                    {!costsReady ? (
                      <span>{t("posPromoSimulatorCalculating")}</span>
                    ) : (
                      <>
                        <span className="font-mono tabular-nums">
                          {t("posPromoCostSum")} ฿{costHallTotal.toFixed(1)}
                        </span>
                        <span className="text-border">·</span>
                        <span className="font-mono tabular-nums">
                          {t("posMenuBundleCostRate")} {economics.costRateHall.toFixed(1)}%
                        </span>
                        <span className="text-border">·</span>
                        <span
                          className={cn(
                            "font-mono tabular-nums",
                            economics.marginPercent >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                          )}
                        >
                          {t("posMenuBundleMarginPct")} {economics.marginPercent.toFixed(1)}%
                        </span>
                      </>
                    )}
                  </span>
                ) : null}
                {showPricingHall && showPricingDelivery ? (
                  <span className="hidden text-muted-foreground sm:inline" aria-hidden>
                    |
                  </span>
                ) : null}
                {showPricingDelivery ? (
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-muted-foreground">{t("posOrderTypeDelivery")}</span>
                    {!costsReady ? (
                      <span>{t("posPromoSimulatorCalculating")}</span>
                    ) : (
                      <>
                        <span className="font-mono tabular-nums">
                          {t("posMenuBundleCostRate")} {economics.costRateDelivery.toFixed(1)}%
                        </span>
                        <span className="text-border">·</span>
                        <span
                          className={cn(
                            "font-mono tabular-nums",
                            economics.marginPercentDel >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                          )}
                        >
                          {t("posMenuBundleMarginPct")} {economics.marginPercentDel.toFixed(1)}%
                        </span>
                      </>
                    )}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-2">
                <label className="text-[10px] font-medium text-muted-foreground">{t("posSetTabPromoGroupLabel")}</label>
                <Select value={groupSelectValue} onValueChange={applyPromoGroupPick}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder={t("posSetTabPromoGroupPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__new__">{t("posSetTabPromoGroupSelectNew")}</SelectItem>
                    {namesForGroupSelect.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground leading-relaxed">{t("posSetTabPromoGroupHint")}</p>
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] font-medium text-muted-foreground">{t("posSetTabPromoNameFieldLabel")} *</label>
                <Input
                  className="mt-1 h-9 text-sm"
                  placeholder={t("posSetTabSetNamePh")}
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                />
                <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">{t("posSetTabPromoNameFieldHint")}</p>
              </div>
              {editPromoId && form.code.trim() ? (
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-medium text-muted-foreground">{t("itemsColCode")}</label>
                  <p className="mt-1 rounded-md border bg-muted/30 px-2 py-1.5 font-mono text-xs">{form.code.trim()}</p>
                </div>
              ) : null}
              <div className="sm:col-span-2 rounded-lg border border-border/60 bg-muted/10 px-3 py-3">
                <p className="text-xs font-semibold">{t("posPromoChannels")}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={form.channelHall}
                      onCheckedChange={(v) => setForm((p) => ({ ...p, channelHall: v === true }))}
                    />
                    {t("posOrderTypeDineIn")}
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={form.channelTakeout}
                      onCheckedChange={(v) => setForm((p) => ({ ...p, channelTakeout: v === true }))}
                    />
                    {t("posOrderTypeTakeout")}
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={form.channelDelivery}
                      onCheckedChange={(v) => {
                        const on = v === true
                        setForm((p) =>
                          on
                            ? {
                                ...p,
                                channelDelivery: true,
                                deliveryAppCodes: normalizeDeliveryAppCodesList(
                                  DEFAULT_PICKER_DELIVERY_APPS.map((d) => d.code)
                                ),
                              }
                            : { ...p, channelDelivery: false }
                        )
                      }}
                    />
                    {t("posOrderTypeDelivery")}
                  </label>
                </div>
                {form.channelDelivery ? (
                  <div className="mt-3 border-t border-border/50 pt-3">
                    <p className="text-xs font-semibold">{t("posPromoDeliveryApps")}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                      {deliveryAppsPicker.map((a) => {
                        const checked = form.deliveryAppCodes.some((c) => normalizeDeliveryAppCode(c) === a.code)
                        return (
                          <label key={a.code} className="flex items-center gap-2 text-xs">
                            <Checkbox checked={checked} onCheckedChange={() => toggleDeliveryApp(a.code)} />
                            <span>{a.name}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-card/90 p-4 shadow-sm">
            <p className="mb-2 text-sm font-bold">{t("posMenuBundleSimComposeTitle")}</p>
            <div className="max-h-56 overflow-auto rounded-lg border border-border/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/60">
                    <th className="px-2 py-2.5 text-left font-medium">{t("posPromoItems")}</th>
                    <th className="w-14 px-2 py-2.5 text-right font-medium">{t("qty")}</th>
                    <th className="w-20 px-2 py-2.5 text-right font-medium">{t("itemsCost")}</th>
                    <th className="w-24 px-2 py-2.5 text-right font-medium">{t("posMenuBundleColReg")}</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        {t("posSetTabLinesEmpty")}
                      </td>
                    </tr>
                  ) : (
                    lines.map((ln) => {
                      const menu = menuById[ln.menuId]
                      const opts = optionsByMenuId[ln.menuId] || []
                      const opt = ln.optionId ? opts.find((o) => String(o.id) === String(ln.optionId)) : null
                      const unit = (menu?.price ?? 0) + (opt?.priceModifier ?? 0)
                      const reg = unit * ln.qty
                      const ck = promoCostKey(ln.menuId, ln.optionId)
                      const ce =
                        resolveCostFromAnalysisMaps(
                          costAnalysisMap,
                          costAnalysisCodeMap,
                          menuById,
                          ln.menuId,
                          ln.optionId
                        ) ?? costMap[ck]
                      const lineCost = (ce?.hall ?? 0) * ln.qty
                      return (
                        <tr key={ln.key} className="border-b border-border/50 last:border-0">
                          <td className="px-2 py-2">
                            <span className="font-medium">{ln.menuName}</span>
                            {ln.optionLabel ? (
                              <span className="text-muted-foreground"> ({optionPartLabel(ln.optionLabel)})</span>
                            ) : null}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <Input
                              type="number"
                              min={0.5}
                              step={0.5}
                              className="ml-auto h-8 w-14 text-right text-sm tabular-nums"
                              value={ln.qty}
                              onChange={(e) => {
                                const v = Number(e.target.value)
                                setLines((prev) =>
                                  prev.map((x) => (x.key === ln.key ? { ...x, qty: Number.isFinite(v) ? v : x.qty } : x))
                                )
                              }}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                            {!costsReady && lines.length > 0 ? "…" : `฿${lineCost.toFixed(1)}`}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">฿{Math.round(reg).toLocaleString()}</td>
                          <td className="px-1 py-1 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => setLines((prev) => prev.filter((x) => x.key !== ln.key))}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-card/90 p-4 shadow-sm ring-1 ring-primary/10 space-y-4">
            <p className="text-sm font-bold tracking-tight">{t("posSetTabPricingFlowTitle")}</p>

            <div className="flex gap-3 rounded-lg border border-border/60 bg-muted/10 p-3">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary"
                aria-hidden
              >
                1
              </span>
              <div className="min-w-0 flex-1 space-y-3">
                {showPricingHall || showPricingDelivery ? (
                  <div
                    className={cn(
                      "grid w-full gap-3",
                      showPricingHall && showPricingDelivery ? "sm:grid-cols-2" : "grid-cols-1"
                    )}
                  >
                    {showPricingHall ? (
                      <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("posSetTabRegularSumHallLabel")}
                        </p>
                        <p className="mt-1 font-mono text-lg font-bold tabular-nums">฿{Math.round(regularSum).toLocaleString()}</p>
                      </div>
                    ) : null}
                    {showPricingDelivery ? (
                      <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("posSetTabRegularSumDeliveryLabel")}
                        </p>
                        <p className="mt-1 font-mono text-lg font-bold tabular-nums text-muted-foreground">
                          ฿{Math.round(regularSumDelivery).toLocaleString()}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <label
                  className={cn(
                    "flex items-center gap-2 text-xs",
                    (showPricingHall || showPricingDelivery) && "border-t border-border/50 pt-3"
                  )}
                >
                  <Checkbox checked={form.vatIncluded} onCheckedChange={(c) => setForm((p) => ({ ...p, vatIncluded: c === true }))} />
                  {t("posMenuVatIncluded")}
                </label>
              </div>
            </div>

            <div className="flex gap-3 rounded-lg border border-border/60 bg-muted/10 p-3">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary"
                aria-hidden
              >
                2
              </span>
              <div className="min-w-0 flex-1 space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("posSetTabDiscountBlock")}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={discountMode === "pct" ? "default" : "outline"}
                    className="h-8 text-xs"
                    onClick={() => setDiscountMode("pct")}
                  >
                    {t("posMenuBundleDiscountModePct")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={discountMode === "baht" ? "default" : "outline"}
                    className="h-8 text-xs"
                    onClick={() => setDiscountMode("baht")}
                  >
                    {t("posMenuBundleDiscountModeBaht")}
                  </Button>
                  <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-initial">
                    <label htmlFor="pos-set-discount-input" className="sr-only">
                      {discountMode === "pct" ? t("posPromoSimulatorDiscountPct") : t("posMenuBundleDiscountBaht")}
                    </label>
                    <span className="shrink-0 text-[10px] text-muted-foreground whitespace-nowrap">
                      {discountMode === "pct" ? t("posPromoSimulatorDiscountPct") : t("posMenuBundleDiscountBaht")}
                    </span>
                    {discountMode === "pct" ? (
                      <Input
                        id="pos-set-discount-input"
                        className="h-8 w-[5.5rem] text-right text-xs tabular-nums sm:w-24"
                        inputMode="decimal"
                        value={discountPctStr}
                        onChange={(e) => setDiscountPctStr(e.target.value)}
                      />
                    ) : (
                      <Input
                        id="pos-set-discount-input"
                        className="h-8 w-[5.5rem] text-right text-xs tabular-nums sm:w-28"
                        inputMode="decimal"
                        value={discountBahtStr}
                        onChange={(e) => setDiscountBahtStr(e.target.value)}
                      />
                    )}
                  </div>
                </div>
                <div
                  className={cn(
                    "grid gap-2",
                    showPricingHall && showPricingDelivery ? "sm:grid-cols-2" : "grid-cols-1"
                  )}
                >
                  {showPricingHall ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border/70 bg-background/50 px-2 py-2">
                      <span className="text-[10px] font-medium text-muted-foreground">{t("posSetTabPricingSimNonDeliveryTag")}</span>
                      <span className="text-[10px] text-muted-foreground">{t("posMenuBundleDiscountAmt")}</span>
                      <span className="font-mono text-sm font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                        −฿{Math.max(0, Math.round(regularSum - resolvedDiscountSaleHallThb)).toLocaleString()}
                      </span>
                      <span className="text-muted-foreground/50">→</span>
                      <span className="text-[10px] text-muted-foreground">{t("posSetTabDiscountSimResult")}</span>
                      <span className="font-mono text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                        ฿{resolvedDiscountSaleHallThb.toLocaleString()}
                      </span>
                    </div>
                  ) : null}
                  {showPricingDelivery ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border/70 bg-background/50 px-2 py-2">
                      <span className="text-[10px] font-medium text-muted-foreground">{t("posOrderTypeDelivery")}</span>
                      <span className="text-[10px] text-muted-foreground">{t("posMenuBundleDiscountAmt")}</span>
                      <span className="font-mono text-sm font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                        −฿{Math.max(0, Math.round(regularSumDelivery - resolvedDiscountSaleDeliveryThb)).toLocaleString()}
                      </span>
                      <span className="text-muted-foreground/50">→</span>
                      <span className="text-[10px] text-muted-foreground">{t("posSetTabDiscountSimResult")}</span>
                      <span className="font-mono text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                        ฿{resolvedDiscountSaleDeliveryThb.toLocaleString()}
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {showPricingHall ? (
                    <Button type="button" size="sm" variant="secondary" className="h-8 text-xs" onClick={applyDiscountToHallPrice}>
                      {t("posSetTabApplyDiscountToHall")}
                    </Button>
                  ) : null}
                  {showPricingDelivery ? (
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={applyDiscountToDeliveryPrice}>
                      {t("posSetTabApplyDiscountToDelivery")}
                    </Button>
                  ) : null}
                  {showPricingHall && showPricingDelivery ? (
                    <Button type="button" size="sm" variant="default" className="h-8 text-xs" onClick={applyDiscountToHallAndDelivery}>
                      {t("posSetTabApplyDiscountToBoth")}
                    </Button>
                  ) : null}
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">{t("posMenuBundleSalePriorityHint")}</p>
              </div>
            </div>

            <div className="flex gap-3 rounded-lg border border-border/60 bg-muted/10 p-3">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary"
                aria-hidden
              >
                3
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <div
                  className={cn(
                    "grid gap-3",
                    showPricingHall && showPricingDelivery ? "sm:grid-cols-2" : "grid-cols-1"
                  )}
                >
                  {showPricingHall ? (
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground">{t("posMenuPriceHall")} *</label>
                      <Input
                        className="mt-1 h-9 text-right text-sm tabular-nums"
                        inputMode="decimal"
                        value={form.price}
                        onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
                      />
                    </div>
                  ) : null}
                  {showPricingDelivery ? (
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground">{t("posMenuPriceDelivery")}</label>
                      <Input
                        className="mt-1 h-9 text-right text-sm tabular-nums"
                        inputMode="decimal"
                        placeholder={t("posMenuBundleSaleDirectPh")}
                        value={form.priceDelivery}
                        onChange={(e) => setForm((p) => ({ ...p, priceDelivery: e.target.value }))}
                      />
                      <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">{t("posSetTabPricingDeliveryHint")}</p>
                    </div>
                  ) : null}
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">{t("posSetTabPricingManualOverrideHint")}</p>
              </div>
            </div>

            <div className="rounded-lg border border-border/50 bg-muted/5 px-3 py-3">
              <div className="grid gap-2 sm:grid-cols-2 sm:items-end">
                <div>
                  <label className="text-[10px] text-muted-foreground">{t("posSetTabSalesSetCount")}</label>
                  <Input
                    className="mt-0.5 h-9 text-right tabular-nums"
                    inputMode="numeric"
                    placeholder="0"
                    value={salesSetCountStr}
                    onChange={(e) => setSalesSetCountStr(e.target.value)}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground sm:pb-1">{t("posSetTabSalesSetCountHint")}</p>
              </div>
            </div>
          </div>

          <div
            className={cn(
              "rounded-xl border border-border/80 bg-card/90 p-4 shadow-sm",
              !costsReady && lines.length > 0 && "opacity-90"
            )}
          >
            <p className="mb-3 text-sm font-bold">{t("posSetTabPriceAnalysis")}</p>
            <p className="mb-3 text-[10px] text-muted-foreground leading-relaxed">{t("posSetTabPriceAnalysisHint")}</p>
            {showPricingHall || showPricingDelivery ? (
              <>
                {showPricingHall && showPricingDelivery ? (
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={priceAnalysisChannel === "hall" ? "default" : "outline"}
                      className="h-8 text-xs"
                      onClick={() => setPriceAnalysisChannel("hall")}
                    >
                      {t("posMenuPriceHall")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={priceAnalysisChannel === "delivery" ? "default" : "outline"}
                      className="h-8 text-xs"
                      onClick={() => setPriceAnalysisChannel("delivery")}
                    >
                      {t("posOrderTypeDelivery")}
                    </Button>
                  </div>
                ) : null}
                {activePriceAnalysis === "delivery" ? (
                  <div className="mb-2 flex flex-wrap justify-between gap-2 rounded-lg border border-border/50 bg-muted/15 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">{t("posSetTabEffectiveDeliverySale")}</span>
                    <span className="text-right font-mono font-medium tabular-nums">
                      ฿{paSaleRef.toLocaleString()}
                      {form.priceDelivery.trim() === "" ? (
                        <span className="ml-1 block text-[10px] font-normal text-muted-foreground sm:inline sm:ml-2">
                          ({t("posSetTabEffectiveDeliverySaleFollowsHall")})
                        </span>
                      ) : null}
                    </span>
                  </div>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      {activePriceAnalysis === "hall" ? t("posPromoCostSum") : t("posMenuBundleCostDelivery")}
                    </p>
                    <p className="mt-1 font-mono text-base font-semibold tabular-nums">
                      {lines.length === 0 || costsReady ? `฿${paCostTotal.toFixed(1)}` : t("posPromoSimulatorCalculating")}
                    </p>
                    <p className="text-xs text-muted-foreground/80">
                      {activePriceAnalysis === "hall" ? t("posMenuBundleHallChannel") : t("posMenuBundleDeliveryChannel")}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/15 px-3 py-3">
                    <p className="text-xs font-medium text-muted-foreground">{t("posMenuBundleCostRate")}</p>
                    <p className="mt-1 font-mono text-base tabular-nums">{lines.length ? `${paCostRate.toFixed(1)}%` : "—"}</p>
                    <p className="text-xs text-muted-foreground/80">
                      {activePriceAnalysis === "hall" ? t("posMenuPriceHall") : t("posOrderTypeDelivery")}
                    </p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-3 dark:bg-emerald-950/20">
                    <p className="text-xs font-medium text-muted-foreground">{t("posMenuBundleMarginPct")}</p>
                    <p
                      className={cn(
                        "mt-1 font-mono text-base font-semibold tabular-nums",
                        paMarginBaht >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                      )}
                    >
                      {lines.length ? `${paMarginPct.toFixed(1)}%` : "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-3 dark:bg-emerald-950/20 sm:col-span-2 lg:col-span-3">
                    <p className="text-xs font-medium text-muted-foreground">{t("posMenuBundleMarginBaht")}</p>
                    <p
                      className={cn(
                        "mt-1 font-mono text-xl font-bold tabular-nums",
                        paMarginBaht >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                      )}
                    >
                      {lines.length ? `฿${paMarginBaht.toFixed(1)}` : "—"}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {activePriceAnalysis === "hall" ? t("posMenuPriceHall") : t("posOrderTypeDelivery")}
                    </p>
                  </div>
                </div>
              </>
            ) : null}
            {projectedProfitHall != null && salesSetCount > 0 && showPricingHall ? (
              <div className="mt-3 flex justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-base font-semibold">
                <span className="text-muted-foreground">{t("posSetTabProjectedProfit")}</span>
                <span className="font-mono text-primary tabular-nums">฿{Math.round(projectedProfitHall).toLocaleString()}</span>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                className="h-10 bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={savingPromo || savingSet}
                onClick={() => void handleSavePromo()}
              >
                <Save className="mr-2 h-4 w-4" />
                {savingPromo ? t("loading") : t("posSetTabSavePromo")}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">{t("posSetTabSavePromoFooterHint")}</p>
          </div>
        </div>

        {/* 우: 프로모션명별 저장된 세트 */}
        <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/15 p-4 shadow-sm dark:bg-zinc-950/40">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold">{t("posSetTabSavedSetsTitle")}</p>
            <p className="text-[10px] text-muted-foreground leading-relaxed">{t("posSetTabSavedSetsSamePromoHint")}</p>
            <p className="text-[10px] text-muted-foreground/90 leading-relaxed">{t("posSetTabSavedSetsInquiryLinkHint")}</p>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-[11px]"
                onClick={startNewSetKeepPromoMeta}
              >
                <Plus className="h-3.5 w-3.5" />
                {t("posSetTabAddSetSamePromoName")}
              </Button>
              <Button type="button" variant="secondary" size="sm" className="h-8 gap-1 text-[11px]" onClick={startNew}>
                <Layers className="h-3.5 w-3.5" />
                {t("posSetTabNewPromo")}
              </Button>
            </div>
          </div>
          {mirrorMenus.length === 0 ? (
            <div className="flex flex-1 flex-col justify-center rounded-lg border border-dashed border-muted-foreground/25 bg-background/50 px-3 py-8 text-center">
              <p className="text-sm font-medium text-muted-foreground">{t("posSetTabSavedSetsEmpty")}</p>
              <p className="mt-1 text-[11px] text-muted-foreground/90">{t("posSetTabSavedSetsEmptyHint")}</p>
            </div>
          ) : !savedSetsNameKey ? (
            <div className="flex flex-1 flex-col justify-center rounded-lg border border-dashed border-muted-foreground/25 bg-background/50 px-3 py-8 text-center">
              <p className="text-sm font-medium text-muted-foreground">{t("posSetTabSavedSetsNeedPromoName")}</p>
              <p className="mt-1 text-[11px] text-muted-foreground/90">{t("posSetTabSavedSetsNeedPromoNameHint")}</p>
            </div>
          ) : mirrorRowsForCurrentPromoName.length === 0 ? (
            <div className="flex flex-1 flex-col justify-center rounded-lg border border-dashed border-muted-foreground/25 bg-background/50 px-3 py-8 text-center">
              <p className="text-sm font-medium text-muted-foreground">
                {t("posSetTabSavedSetsEmptyForCurrentName").replace("{{name}}", savedSetsNameKey)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground/90">{t("posSetTabSavedSetsEmptyHint")}</p>
            </div>
          ) : (
            <ul className="max-h-[min(520px,65vh)] space-y-1 overflow-y-auto pr-0.5">
              {mirrorRowsForCurrentPromoName.map((m) => {
                const pid = String(m.promoId ?? "").trim()
                const pr = pid ? promoById[pid] : undefined
                const active = editPromoId && pid === editPromoId
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      disabled={!pid || promosLoading}
                      onClick={() => pid && setEditPromoId(pid)}
                      className={cn(
                        "w-full rounded-lg border px-2.5 py-2 text-left text-xs transition-colors",
                        active
                          ? "border-emerald-500/50 bg-emerald-500/10"
                          : "border-border/60 bg-card/80 hover:bg-muted/60"
                      )}
                    >
                      <p className="truncate font-medium">{pr?.code || m.code}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {t("posMenuPriceHall")} ฿{Math.round(pr?.price ?? m.price ?? 0).toLocaleString()}
                        {pr?.priceDelivery != null && Number(pr.priceDelivery) > 0
                          ? ` · ${t("posMenuPriceDelivery")} ฿${Math.round(Number(pr.priceDelivery)).toLocaleString()}`
                          : ""}
                      </p>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="mt-2 space-y-2 border-t border-border/60 pt-3">
            <p className="text-[10px] font-semibold text-foreground">{t("posSetTabSavedSetActionsTitle")}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                className="h-10"
                disabled={savingPromo || savingSet}
                onClick={() => void handleSaveSetComposition()}
              >
                <Layers className="mr-2 h-4 w-4" />
                {savingSet ? t("loading") : t("posSetTabSaveSetComposition")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10"
                disabled={savingPromo || savingSet}
                onClick={resetBundleOnly}
              >
                {t("posSetTabResetBundle")}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">{t("posSetTabSaveSplitHint")}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function sortByCode<T>(arr: T[], codeOf: (x: T) => string | undefined): T[] {
  return [...arr].sort((a, b) => String(codeOf(a) ?? "").localeCompare(String(codeOf(b) ?? "")))
}
