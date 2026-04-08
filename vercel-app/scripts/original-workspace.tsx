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
  type PosPromoItem,
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
  return /^S\s*[-]?\s*∞ê£∞é┤\s*$/i.test(n) || n === "S ∞ê£∞é┤" || n === "S - ∞ê£∞é┤" || n === "S-∞ê£∞é┤"
}

/** ∞ä╕φè╕┬╖∞ï£δ«¼ δô£δí¡δïñ∞Ü┤: ∞ê¿Ω╕┤ S Ω╕░δ│╕Ω│╝ Ω╡¼δ╢äφòÿΩ╕░ ∞£äφò£ Select value */
const CHICKEN_BASE_SELECT_VALUE = "__pos_chicken_s_default__"

/** ∞ú╝δ¼╕┬╖φöäδí£δ¬¿ Ω│╡φå╡ δ░░δï¼∞ò▒ ∞╜öδô£ (POS δ¥╝δ▓¿ ∞¥╕∞ï¥Ω│╝ δÅÖ∞¥╝: grab / lineman / shopee) */
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
  /** ∞í░φÜî φâ¡ δô▒∞ùÉ∞ä£ δäÿΩ╕╕ δòî: φò┤δï╣ φöäδí£δ¬¿ φÄ╕∞ºæ∞£╝δí£ ∞áäφÖÿ φ¢ä δ╢Çδ¬¿∞ùÉ∞ä£ ∞┤êΩ╕░φÖö */
  focusPromoId?: string | null
  onFocusPromoConsumed?: () => void
  /** δºê∞╝Çφîà φÖöδ⌐┤: φò¡∞âü ∞¥┤ ∞║áφÄÿ∞¥╕∞ùÉ ∞ù░Ω▓░(∞ïáΩ╖£δèö standaloneSetMenu false, ∞╜öδô£ ∞₧ÉδÅÖ ∞▒äδ▓ê) */
  fixedMarketingCampaignId?: string | null
}

type ComposerLine = {
  key: string
  menuId: string
  optionId: string | null
  qty: number
  menuName: string
  optionLabel?: string
  /** φûë δï¿∞£ä φòá∞¥╕∞£¿(%) ΓÇö δ╣ä∞Ü░δ⌐┤ ∞ä╕φè╕ Ω╖£∞╣Ö∞¥ä δö░δªä */
  lineDiscountPct?: string
  /** φûë δï¿∞£ä φîÉδºñΩ░Ç(∞┤¥∞òí) ΓÇö δ╣ä∞Ü░δ⌐┤ φûë φòá∞¥╕∞£¿/∞ä╕φè╕ Ω╖£∞╣Ö∞£╝δí£ Ω│ä∞é░ */
  lineSalePrice?: string
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
  /** ∞ïáΩ╖£ ∞┤ê∞òê ∞ä╕∞àÿ(∞║áφÄÿ∞¥╕ Ω│á∞áò ∞ï£ δïñ∞¥î ∞╜öδô£ ∞₧¼∞▒äδ▓ê) */
  const [promoDraftGen, setPromoDraftGen] = React.useState(0)
  const [form, setForm] = React.useState(emptyForm)
  const [lines, setLines] = React.useState<ComposerLine[]>([])
  const [savingPromo, setSavingPromo] = React.useState(false)
  const [savingSet, setSavingSet] = React.useState(false)
  const [loadingEdit, setLoadingEdit] = React.useState(false)

  /** editPromoIdΩ░Ç nullδí£ ∞£á∞ºÇδÉÿδèö δÅÖ∞òê promos/menus Ω░▒∞ïáδºêδïñ ∞ñä∞¥ä δ╣ä∞Ü░∞ºÇ ∞òèΩ╕░ ∞£äφò¿ */
  const prevEditPromoIdForEffectRef = React.useRef<string | null | undefined>(undefined)
  /** Ω░Ö∞¥Ç φöäδí£δ¬¿δÑ╝ ∞¥┤δ»╕ φÅ╝+∞ñä∞ùÉ δ░ÿ∞ÿüφûê∞£╝δ⌐┤ promos δ¬⌐δí¥δºî δ░öδÇÉ Ω▓╜∞Ü░ API ∞₧¼∞í░φÜî┬╖∞ñä δì«∞û┤∞ô░Ω╕░ ∞â¥δ₧╡ */
  const lastHydratedPromoIdRef = React.useRef<string | null>(null)
  /** δ▓êδôñ δºê∞èñφä░ ∞áÇ∞₧Ñ ∞ºüφ¢ä DB itemsδèö ∞òä∞ºü δ╣ä∞û┤ ∞₧ê∞£╝δ»Çδí£ δ╣ê δ░░∞ù┤δí£ ∞ñä∞¥ä δì«∞û┤∞ô░∞ºÇ ∞òè∞¥î */
  const preserveLinesAfterMasterSaveRef = React.useRef<string | null>(null)

  const [pickMain, setPickMain] = React.useState("all")
  const [pickSub, setPickSub] = React.useState("all")
  const [pickSearchInput, setPickSearchInput] = React.useState("")
  /** [Ω▓Ç∞âë] φ¢ä ∞áü∞Ü⌐δÉ£ Ω▓Ç∞âë∞û┤(δ╣ê δ¼╕∞₧É∞ù┤ = ∞¥┤δªä┬╖∞╜öδô£ φòäφä░ ∞ùå∞¥î, δîÇ┬╖∞åîδ╢äδÑÿδºî ∞áü∞Ü⌐) */
  const [pickSearchApplied, setPickSearchApplied] = React.useState("")
  /** Ω▓Ç∞âë δ▓äφè╝/Enterδí£ δ¬⌐δí¥∞¥ä ∞ù░ δÆñ∞ùÉδºî δª¼∞èñφè╕ φæ£∞ï£ */
  const [pickMenuListShown, setPickMenuListShown] = React.useState(false)
  const [pickMenuId, setPickMenuId] = React.useState("")
  const [pickQty, setPickQty] = React.useState("1")
  /** Step 1 δ⌐öδë┤ Ω│áδÑ╝ δòî ∞░╕Ω│áφòá Ω░ÇΩ▓⌐ Ω╕░∞ñÇ(δºñ∞₧Ñ/δ░░δï¼) */
  const [pickPricingBasis, setPickPricingBasis] = React.useState<"hall" | "delivery">("hall")

  const [discountMode, setDiscountMode] = React.useState<"pct" | "baht">("pct")
  const [discountPctStr, setDiscountPctStr] = React.useState("")
  const [discountBahtStr, setDiscountBahtStr] = React.useState("")
  const [salesSetCountStr, setSalesSetCountStr] = React.useState("")
  /** Ω░ÇΩ▓⌐ δ╢ä∞ä¥: φÖÇ┬╖δ░░δï¼ ∞▒äδäÉ δ¬¿δæÉ ∞╝£∞ºä Ω▓╜∞Ü░ ∞áäφÖÿ */
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
  }, [remoteDeliveryApps, t])

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

  /** φÖÇ┬╖φÅ¼∞₧Ñ∞¥Ç δÅÖ∞¥╝ ∞áòΩ░Ç φò⌐; δ░░δï¼∞¥Ç δ│äδÅä ∞áòΩ░Ç φò⌐ */
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
  const projectedProfitDelivery = salesSetCount > 0 ? economics.marginBahtDel * salesSetCount : null

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

  /** Ω░ÇΩ▓⌐δ╢ä∞ä¥ ∞▒äδäÉ Ω╕░∞ñÇ ΓÇö ∞í░φò⌐ φæ£ φòÿδï¿ ∞Üö∞ò╜ φûë┬╖Ω░ü ∞ñä ∞áòΩ░Ç/∞¢ÉΩ░Ç φæ£∞ï£∞ùÉ ∞é¼∞Ü⌐ */
  const composeSummaryReg = activePriceAnalysis === "hall" ? regularSum : regularSumDelivery
  const composeSummaryDiscPct =
    composeSummaryReg > 0 ? ((composeSummaryReg - paSaleRef) / composeSummaryReg) * 100 : 0
  const analysisWarningKey = !costsReady
    ? null
    : paMarginBaht < 0
      ? "posSetTabWarnNegativeMargin"
      : paCostRate >= 100
        ? "posSetTabWarnHighCostRate"
        : null

  const setActiveChannelSalePrice = React.useCallback(
    (raw: string) => {
      if (activePriceAnalysis === "hall") {
        setForm((p) => ({ ...p, price: raw }))
      } else {
        setForm((p) => ({ ...p, priceDelivery: raw }))
      }
    },
    [activePriceAnalysis]
  )

  const parseNum = React.useCallback((v: string | undefined) => {
    const s = String(v ?? "").replace(/,/g, "").trim()
    if (s === "") return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }, [])

  const lineEconomicsMap = React.useMemo(() => {
    const defaultLineDiscount = Number.isFinite(composeSummaryDiscPct) ? composeSummaryDiscPct : 0
    const out: Record<string, { reg: number; cost: number; discountPct: number; sale: number; costRate: number; margin: number; marginPct: number }> = {}
    for (const ln of lines) {
      const menu = menuById[ln.menuId]
      const opts = optionsByMenuId[ln.menuId] || []
      const opt = ln.optionId ? opts.find((o) => String(o.id) === String(ln.optionId)) : null
      const hallMenu = menu?.price ?? 0
      const menuUnit =
        activePriceAnalysis === "delivery" &&
        menu != null &&
        menu.priceDelivery != null &&
        Number.isFinite(Number(menu.priceDelivery))
          ? Number(menu.priceDelivery)
          : hallMenu
      const hallMod = opt?.priceModifier ?? 0
      const optMod =
        activePriceAnalysis === "delivery" &&
        opt != null &&
        opt.priceModifierDelivery != null &&
        Number.isFinite(Number(opt.priceModifierDelivery))
          ? Number(opt.priceModifierDelivery)
          : hallMod
      const reg = (menuUnit + optMod) * ln.qty
      const ck = promoCostKey(ln.menuId, ln.optionId)
      const ce =
        resolveCostFromAnalysisMaps(costAnalysisMap, costAnalysisCodeMap, menuById, ln.menuId, ln.optionId) ?? costMap[ck]
      const unitCost = activePriceAnalysis === "delivery" ? (ce?.del ?? 0) : (ce?.hall ?? 0)
      const cost = unitCost * ln.qty

      const lineDiscount = parseNum(ln.lineDiscountPct)
      const discountPct = lineDiscount != null ? Math.max(0, lineDiscount) : Math.max(0, defaultLineDiscount)
      const lineSaleRaw = parseNum(ln.lineSalePrice)
      const sale = lineSaleRaw != null ? Math.max(0, lineSaleRaw) : Math.max(0, reg * (1 - discountPct / 100))
      const margin = sale - cost
      const costRate = sale > 0 ? (cost / sale) * 100 : 0
      const marginPct = sale > 0 ? (margin / sale) * 100 : 0
      out[ln.key] = { reg, cost, discountPct, sale, costRate, margin, marginPct }
    }
    return out
  }, [
    activePriceAnalysis,
    composeSummaryDiscPct,
    costAnalysisCodeMap,
    costAnalysisMap,
    costMap,
    lines,
    menuById,
    optionsByMenuId,
    parseNum,
  ])

  const lineAverages = React.useMemo(() => {
    if (lines.length === 0) return null
    let discount = 0
    let sale = 0
    for (const ln of lines) {
      const row = lineEconomicsMap[ln.key]
      if (!row) continue
      discount += row.discountPct
      sale += row.sale
    }
    return {
      discountPctAvg: discount / lines.length,
      saleAvg: sale / lines.length,
    }
  }, [lineEconomicsMap, lines])

  const lineSummary = React.useMemo(() => {
    if (lines.length === 0) return null
    let discount = 0
    let saleTotal = 0
    for (const ln of lines) {
      const row = lineEconomicsMap[ln.key]
      if (!row) continue
      discount += row.discountPct
      saleTotal += row.sale
    }
    return {
      discountPctAvg: discount / lines.length,
      saleTotal,
    }
  }, [lineEconomicsMap, lines])

  const syncSaleFromDiscount = React.useCallback(
    (nextMode: "pct" | "baht", nextPct: string, nextBaht: string) => {
      const nextSale = resolveBundleSalePriceThb({
        regularPriceSum: composeSummaryReg,
        salePriceDirectStr: "",
        discountPctStr: nextPct,
        discountBahtStr: nextBaht,
        discountMode: nextMode,
      })
      setActiveChannelSalePrice(String(nextSale))
    },
    [composeSummaryReg, setActiveChannelSalePrice]
  )

  const syncDiscountFromSale = React.useCallback(
    (saleRaw: string) => {
      const sale = parseNum(saleRaw)
      if (sale == null || composeSummaryReg <= 0) return
      const clampedSale = Math.max(0, sale)
      const discountPct = Math.max(0, ((composeSummaryReg - clampedSale) / composeSummaryReg) * 100)
      const discountBaht = Math.max(0, composeSummaryReg - clampedSale)
      setDiscountPctStr(discountPct.toFixed(2))
      setDiscountBahtStr(discountBaht.toFixed(2))
    },
    [composeSummaryReg, parseNum]
  )

  React.useEffect(() => {
    const prevId = prevEditPromoIdForEffectRef.current
    const idChanged = prevId !== editPromoId
    prevEditPromoIdForEffectRef.current = editPromoId

    if (!editPromoId) {
      lastHydratedPromoIdRef.current = null
      if (idChanged && prevId !== undefined && prevId !== null) {
        const base = emptyForm()
        setForm(fixedCid ? { ...base, marketingCampaignId: fixedCid } : base)
        setLines([])
        setDiscountPctStr("")
        setDiscountBahtStr("")
        setPickPricingBasis("hall")
        setPriceAnalysisChannel("hall")
      }
      setLoadingEdit(false)
      return
    }

    const promo = promos.find((p) => String(p.id) === String(editPromoId))
    const alreadyHydrated = lastHydratedPromoIdRef.current === editPromoId && !!promo
    if (alreadyHydrated) {
      setLoadingEdit(false)
      return
    }

    let cancelled = false
    setLoadingEdit(true)
    void (async () => {
      try {
        const promoRow = promos.find((p) => String(p.id) === String(editPromoId))
        if (cancelled) return
        if (!promoRow) return
        const items = await getPosPromoItems({ promoId: editPromoId }).catch(() => [])
        if (cancelled) return
        setForm({
          marketingCampaignId: promoRow.marketingCampaignId?.trim() ?? "",
          code: promoRow.code ?? "",
          name: promoRow.name ?? "",
          category: promoRow.category?.trim() || PROMOTION_DEFAULT_SUBCATEGORIES[0],
          price: String(promoRow.price),
          priceDelivery: promoRow.priceDelivery != null ? String(promoRow.priceDelivery) : "",
          vatIncluded: promoRow.vatIncluded !== false,
          isActive: promoRow.isActive !== false,
          channelHall: promoRow.channelHall !== false,
          channelTakeout: promoRow.channelTakeout !== false,
          channelDelivery: promoRow.channelDelivery !== false,
          deliveryAppCodes: normalizeDeliveryAppCodesList(promoRow.deliveryAppCodes ?? null),
        })
        const basis = promoRow.composePricingBasis === "delivery" ? "delivery" : "hall"
        setPickPricingBasis(basis)
        setPriceAnalysisChannel(basis)
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
            lineDiscountPct: "",
            lineSalePrice: "",
          }
        })
        const preserveLocalCompose =
          preserveLinesAfterMasterSaveRef.current != null &&
          preserveLinesAfterMasterSaveRef.current === String(editPromoId)
        if (preserveLocalCompose) {
          preserveLinesAfterMasterSaveRef.current = null
        } else {
          setLines(nextLines)
        }
        setDiscountPctStr("")
        setDiscountBahtStr("")
        lastHydratedPromoIdRef.current = editPromoId
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

  /** DB∞ùÉ ∞¥┤δ»╕ ∞₧êδèö φöäδí£δ¬¿∞àÿ φæ£∞ï£δ¬à δ¬⌐δí¥ (Ω╖╕δú╣ ∞äáφâ¥∞Ü⌐) */
  const promoGroupNamesSorted = React.useMemo(() => {
    const s = new Set<string>()
    for (const p of promos) {
      const n = (p.name ?? "").trim()
      if (n) s.add(n)
    }
    return [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
  }, [promos])

  /** ∞àÇδáëφè╕∞ùÉ φÿä∞₧¼ ∞₧àδáÑ ∞ñæ∞¥╕ ∞¥┤δªäδÅä ∞ÿ¼δáñ∞ä£ Ω░Æ∞¥┤ φò¡∞âü ∞£áφÜ¿φòÿδÅäδí¥ */
  const namesForGroupSelect = React.useMemo(() => {
    const cur = form.name.trim()
    const merged = new Set(promoGroupNamesSorted)
    if (cur) merged.add(cur)
    return [...merged].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
  }, [promoGroupNamesSorted, form.name])

  const groupSelectValue = form.name.trim() ? form.name.trim() : "__new__"

  const applyPromoGroupPick = React.useCallback((raw: string) => {
    preserveLinesAfterMasterSaveRef.current = null
    lastHydratedPromoIdRef.current = null
    if (raw === "__new__") {
      setForm((p) => ({ ...p, name: "", code: "" }))
      setEditPromoId(null)
      setLines([])
      setPickPricingBasis("hall")
      setPriceAnalysisChannel("hall")
      return
    }
    setForm((p) => ({ ...p, name: raw, code: "" }))
    setEditPromoId(null)
    setLines([])
    setPickPricingBasis("hall")
    setPriceAnalysisChannel("hall")
  }, [])

  /** ∞ÿñδÑ╕∞¬╜ δ¬⌐δí¥: φöäδí£δ¬¿∞àÿδ¬à(δºê∞èñφä░ name) Ω╕░∞ñÇ Ω╖╕δú╣ */
  const mirrorMenusByPromoName = React.useMemo(() => {
    const m = new Map<string, PosMenu[]>()
    for (const menu of mirrorMenus) {
      const pid = String(menu.promoId ?? "").trim()
      const pr = pid ? promoById[pid] : undefined
      const label = (pr?.name ?? menu.name ?? "").trim() || "ΓÇö"
      if (!m.has(label)) m.set(label, [])
      m.get(label)!.push(menu)
    }
    const entries = [...m.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    for (const [, rows] of entries) {
      rows.sort((a, b) => String(a.code ?? "").localeCompare(String(b.code ?? "")))
    }
    return entries
  }, [mirrorMenus, promoById])

  /** ∞Ü░∞╕í δ¬⌐δí¥: φÿä∞₧¼ φÄ╕∞ºæ ∞ñæ∞¥╕ φöäδí£δ¬¿∞àÿδ¬à(Ω╖╕δú╣)Ω│╝ Ω░Ö∞¥Ç ∞¥┤δªä∞¥ÿ δ»╕δƒ¼ ∞ä╕φè╕δºî */
  const savedSetsNameKey = React.useMemo(() => {
    if (editPromoId) {
      const pr = promoById[editPromoId]
      const fromPromo = (pr?.name ?? "").trim()
      if (fromPromo) return fromPromo
      const mirror = mirrorMenus.find((m) => String(m.promoId) === String(editPromoId))
      const fromMirror = (mirror?.name ?? "").trim()
      if (fromMirror) return fromMirror
      return form.name.trim()
    }
    return form.name.trim()
  }, [editPromoId, promoById, form.name, mirrorMenus])

  const mirrorRowsForCurrentPromoName = React.useMemo(() => {
    if (!savedSetsNameKey) return [] as PosMenu[]
    const entry = mirrorMenusByPromoName.find(([n]) => n === savedSetsNameKey)
    return entry ? entry[1] : []
  }, [mirrorMenusByPromoName, savedSetsNameKey])

  type SavedSetComposePreviewEntry =
    | { status: "loading" }
    | { status: "ok"; previewLines: string[]; total: number }
    | { status: "err" }

  const [savedSetComposePreview, setSavedSetComposePreview] = React.useState<
    Record<string, SavedSetComposePreviewEntry>
  >({})

  const mirrorRowPromoIds = React.useMemo(
    () =>
      [
        ...new Set(
          mirrorRowsForCurrentPromoName.map((m) => String(m.promoId ?? "").trim()).filter(Boolean)
        ),
      ].sort(),
    [mirrorRowsForCurrentPromoName]
  )
  const mirrorRowPromoIdsKey = mirrorRowPromoIds.join("\u0001")

  const optionPartLabelRef = React.useRef(optionPartLabel)
  optionPartLabelRef.current = optionPartLabel

  const buildSavedSetPreviewFromItems = React.useCallback(
    (items: PosPromoItem[]) => {
      const optPart = optionPartLabelRef.current
      const allLines = items.map((it) => {
        const mid = String(it.menuId)
        const menu = menuById[mid]
        const opts = optionsByMenuId[mid] || []
        const opt = it.optionId ? opts.find((o) => String(o.id) === String(it.optionId)) : null
        let label = menu?.name?.trim() || `#${mid.slice(0, 8)}`
        if (opt?.name?.trim()) label += ` (${optPart(opt.name)})`
        const q = Number(it.quantity) || 1
        if (q !== 1) label += ` ├ù${q}`
        return label
      })
      return { previewLines: allLines.slice(0, 4), total: items.length }
    },
    [menuById, optionsByMenuId]
  )

  const refreshSavedSetComposePreview = React.useCallback(
    async (pid: string) => {
      const id = String(pid ?? "").trim()
      if (!id) return
      setSavedSetComposePreview((prev) => ({ ...prev, [id]: { status: "loading" } }))
      try {
        const items = await getPosPromoItems({ promoId: id })
        const { previewLines, total } = buildSavedSetPreviewFromItems(items)
        setSavedSetComposePreview((prev) => ({ ...prev, [id]: { status: "ok", previewLines, total } }))
      } catch {
        setSavedSetComposePreview((prev) => ({ ...prev, [id]: { status: "err" } }))
      }
    },
    [buildSavedSetPreviewFromItems]
  )

  React.useEffect(() => {
    const ids = mirrorRowPromoIds
    if (ids.length === 0) {
      setSavedSetComposePreview({})
      return
    }
    let cancelled = false

    setSavedSetComposePreview((prev) => {
      const next: Record<string, SavedSetComposePreviewEntry> = {}
      for (const id of ids) {
        if (prev[id]?.status === "ok") next[id] = prev[id]!
      }
      return next
    })

    for (const pid of ids) {
      void (async () => {
        setSavedSetComposePreview((prev) => {
          if (prev[pid]?.status === "ok") return prev
          return { ...prev, [pid]: { status: "loading" } }
        })
        try {
          const items = await getPosPromoItems({ promoId: pid })
          if (cancelled) return
          const { previewLines, total } = buildSavedSetPreviewFromItems(items)
          setSavedSetComposePreview((prev) => {
            if (!ids.includes(pid)) return prev
            return { ...prev, [pid]: { status: "ok", previewLines, total } }
          })
        } catch {
          if (cancelled) return
          setSavedSetComposePreview((prev) => {
            if (!ids.includes(pid)) return prev
            return { ...prev, [pid]: { status: "err" } }
          })
        }
      })()
    }

    return () => {
      cancelled = true
    }
  }, [mirrorRowPromoIdsKey, mirrorRowPromoIds, menuById, optionsByMenuId, buildSavedSetPreviewFromItems])

  React.useEffect(() => {
    const id = focusPromoId?.trim()
    if (!id) return
    preserveLinesAfterMasterSaveRef.current = null
    setEditPromoId(id)
    onFocusPromoConsumed?.()
  }, [focusPromoId, onFocusPromoConsumed])

  const startNew = () => {
    preserveLinesAfterMasterSaveRef.current = null
    lastHydratedPromoIdRef.current = null
    setEditPromoId(null)
    const base = emptyForm()
    setForm(fixedCid ? { ...base, marketingCampaignId: fixedCid } : base)
    setLines([])
    setPickMenuId("")
    setDiscountPctStr("")
    setDiscountBahtStr("")
    setSalesSetCountStr("")
    setPickPricingBasis("hall")
    setPriceAnalysisChannel("hall")
    setPromoDraftGen((n) => n + 1)
  }

  /** Ω░Ö∞¥Ç φöäδí£δ¬¿∞àÿδ¬à┬╖∞▒äδäÉ┬╖Ω░ÇΩ▓⌐ δô▒∞¥Ç ∞£á∞ºÇφòÿΩ│á ∞âê ∞ä╕φè╕(∞âê ∞╜öδô£)δºî Ω╡¼∞ä▒ */
  const startNewSetKeepPromoMeta = () => {
    preserveLinesAfterMasterSaveRef.current = null
    lastHydratedPromoIdRef.current = null
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
          lineDiscountPct: "",
          lineSalePrice: "",
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

  /** ∞ÿ╡∞àÿ 0┬╖1Ω░£δèö ∞ªë∞ï£ ∞í░φò⌐ δ░ÿ∞ÿü, 2Ω░£ ∞¥┤∞âüδºî ∞ÿ╡∞àÿ ∞äáφâ¥ φî¿δäÉ */
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
    const oid = optionId === CHICKEN_BASE_SELECT_VALUE ? null : optionId
    appendPickLine(pickMenuId, oid, pickQty)
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

  /** φòá∞¥╕ ∞ï£δ«¼ ΓåÆ φîÉδºñΩ░Ç: Ω░ÇΩ▓⌐ δ╢ä∞ä¥∞ùÉ∞ä£ ∞äáφâ¥φò£ ∞▒äδäÉ(φÖÇ/δ░░δï¼ φåáΩ╕Ç)∞ùÉδºî δ░ÿ∞ÿü. ∞▒äδäÉ∞¥┤ φòÿδéÿδ┐É∞¥┤δ⌐┤ φò┤δï╣ ∞▒äδäÉδí£ Ω│á∞áò. */
  const applyDiscountToActiveChannel = React.useCallback(() => {
    if (showPricingHall && !showPricingDelivery) {
      setForm((p) => ({ ...p, price: String(resolvedDiscountSaleHallThb) }))
      return
    }
    if (!showPricingHall && showPricingDelivery) {
      setForm((p) => ({ ...p, priceDelivery: String(resolvedDiscountSaleDeliveryThb) }))
      return
    }
    if (showPricingHall && showPricingDelivery) {
      if (priceAnalysisChannel === "hall") {
        setForm((p) => ({ ...p, price: String(resolvedDiscountSaleHallThb) }))
      } else {
        setForm((p) => ({ ...p, priceDelivery: String(resolvedDiscountSaleDeliveryThb) }))
      }
    }
  }, [
    showPricingHall,
    showPricingDelivery,
    priceAnalysisChannel,
    resolvedDiscountSaleHallThb,
    resolvedDiscountSaleDeliveryThb,
  ])

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
        composePricingBasis: pickPricingBasis,
      },
    }
  }

  /** φöäδí£δ¬¿ δºê∞èñφä░δºî (∞¥┤δªä┬╖∞▒äδäÉ┬╖Ω░ÇΩ▓⌐┬╖VAT δô▒). ∞í░φò⌐ ∞ñä∞¥Ç ∞áÇ∞₧Ñφòÿ∞ºÇ ∞òè∞¥î */
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
      const pidStr = String(pid)
      if (lines.length > 0) {
        preserveLinesAfterMasterSaveRef.current = pidStr
        lastHydratedPromoIdRef.current = null
      }
      setEditPromoId(pidStr)
      await appAlert(t("posSetTabPromoSaved"))
      onAfterSave()
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSavingPromo(false)
    }
  }

  /** ∞í░φò⌐ ∞ñäδºî. φöäδí£δ¬¿ δºê∞èñφä░δèö δ¿╝∞áÇ ∞áÇ∞₧ÑδÉÿ∞û┤ ∞₧ê∞û┤∞ò╝ φò¿ */
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
      lastHydratedPromoIdRef.current = null
      void refreshSavedSetComposePreview(editPromoId)
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

      <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
        {/* ∞óî: ∞╣┤φàîΩ│áδª¼ + δ⌐öδë┤ */}
        <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/20 p-4 shadow-sm xl:col-span-4 dark:bg-zinc-950/40">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Step 1 ┬╖ {t("posMenuBundleSimPickTitle")}
          </p>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-foreground">{t("posMenuBundleSimPickTitle")}</p>
            <span className="text-[10px] text-muted-foreground">{t("posSetTabCostFromAnalysis")}</span>
          </div>
          <div className="rounded-md border border-border/60 bg-background/40 p-2">
            <p className="mb-1 text-[10px] text-muted-foreground">{t("posSetTabPriceAnalysis")}</p>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={pickPricingBasis === "hall" ? "default" : "outline"}
                className="h-8 text-[11px]"
                onClick={() => {
                  setPickPricingBasis("hall")
                  setPriceAnalysisChannel("hall")
                }}
              >
                {t("posMenuPriceHall")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={pickPricingBasis === "delivery" ? "default" : "outline"}
                className="h-8 text-[11px]"
                onClick={() => {
                  setPickPricingBasis("delivery")
                  setPriceAnalysisChannel("delivery")
                }}
              >
                {t("posOrderTypeDelivery")}
              </Button>
            </div>
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
                  const listCost = pickPricingBasis === "delivery" ? ac?.del : ac?.hall
                  const listPriceRaw =
                    pickPricingBasis === "delivery" &&
                    m.priceDelivery != null &&
                    Number.isFinite(Number(m.priceDelivery))
                      ? Number(m.priceDelivery)
                      : Number(m.price ?? 0)
                  const listPrice = Number.isFinite(listPriceRaw) ? listPriceRaw : 0
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
                              {t("itemsCost")} α╕┐
                              {listCost != null ? listCost.toFixed(1) : costAnalysisLoaded ? "ΓÇö" : "ΓÇª"}
                            </span>
                            <span className="text-emerald-700 dark:text-emerald-300">
                              {t("itemsPrice")} α╕┐{Math.round(listPrice).toLocaleString()}
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
                    {menuById[pickMenuId] && isChickenMenu(menuById[pickMenuId]?.code) ? (
                      <SelectItem value={CHICKEN_BASE_SELECT_VALUE}>
                        {t("posIngredientScopeBaseChicken") || t("posOptionDefault")}
                      </SelectItem>
                    ) : null}
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

        {/* ∞ñæ∞òÖ: ∞ä╕φè╕ ∞Üö∞ò╜ + Ω╡¼∞ä▒ + ∞ºÇφæ£ */}
        <div className="space-y-4 xl:col-span-8">
          <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm ring-1 ring-emerald-500/10 dark:bg-zinc-950/35">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  Step 2 ┬╖ {t("posSetTabComposeHeader")}
                </p>
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
                          {t("posPromoCostSum")} α╕┐{costHallTotal.toFixed(1)}
                        </span>
                        <span className="text-border">┬╖</span>
                        <span className="font-mono tabular-nums">
                          {t("posMenuBundleCostRate")} {economics.costRateHall.toFixed(1)}%
                        </span>
                        <span className="text-border">┬╖</span>
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
                        <span className="text-border">┬╖</span>
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
            <div className="max-h-[min(28rem,70vh)] overflow-auto rounded-lg border border-border/60">
              <table className="w-full min-w-[56rem] text-sm">
                <thead>
                  <tr className="border-b bg-muted/60">
                    <th className="w-10 px-1 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("posSetTabComposeColNo")}
                    </th>
                    <th className="min-w-[9rem] px-2 py-2.5 text-left text-sm font-semibold">{t("posPromoItems")}</th>
                    <th className="w-16 px-2 py-2.5 text-right text-sm font-semibold">{t("qty")}</th>
                    <th className="w-[5rem] px-1 py-2.5 text-right text-xs font-semibold leading-tight text-muted-foreground">
                      {t("itemsCost")}
                    </th>
                    <th className="w-[5rem] px-1 py-2.5 text-right text-xs font-semibold leading-tight text-muted-foreground">
                      {t("posMenuBundleColReg")}
                    </th>
                    <th className="w-[4.25rem] px-1 py-2.5 text-right text-xs font-semibold leading-tight text-muted-foreground">
                      {t("posPromoSimulatorDiscountPct")}
                    </th>
                    <th className="w-[6rem] px-1 py-2.5 text-right text-xs font-semibold leading-tight text-muted-foreground">
                      {t("posMenuBundleSalePrice")}
                    </th>
                    <th className="w-[4.25rem] px-1 py-2.5 text-right text-xs font-semibold leading-tight text-muted-foreground">
                      {t("posMenuBundleCostRate")}
                    </th>
                    <th className="w-[5rem] px-1 py-2.5 text-right text-xs font-semibold leading-tight text-muted-foreground">
                      {t("posMenuBundleMarginBaht")}
                    </th>
                    <th className="w-[4.25rem] px-1 py-2.5 text-right text-xs font-semibold leading-tight text-muted-foreground">
                      {t("posMenuBundleMarginPct")}
                    </th>
                    <th className="w-9 px-0 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-3 py-8 text-center text-base text-muted-foreground">
                        {t("posSetTabLinesEmpty")}
                      </td>
                    </tr>
                  ) : (
                    lines.map((ln, idx) => {
                      const row = lineEconomicsMap[ln.key]
                      const reg = row?.reg ?? 0
                      const lineCost = row?.cost ?? 0
                      const rowSale = row?.sale ?? 0
                      const rowCostRate = row?.costRate ?? 0
                      const rowMargin = row?.margin ?? 0
                      const rowMarginPct = row?.marginPct ?? 0
                      return (
                        <tr key={ln.key} className="border-b border-border/50 last:border-0">
                          <td className="px-1 py-2.5 text-center text-sm tabular-nums text-muted-foreground">{idx + 1}</td>
                          <td className="px-2 py-2.5">
                            <span className="text-sm font-medium">{ln.menuName}</span>
                            {ln.optionLabel ? (
                              <span className="text-sm text-muted-foreground"> ({optionPartLabel(ln.optionLabel)})</span>
                            ) : null}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <Input
                              type="number"
                              min={0.5}
                              step={0.5}
                              className="ml-auto h-9 w-16 text-right text-sm tabular-nums"
                              value={ln.qty}
                              onChange={(e) => {
                                const v = Number(e.target.value)
                                setLines((prev) =>
                                  prev.map((x) => (x.key === ln.key ? { ...x, qty: Number.isFinite(v) ? v : x.qty } : x))
                                )
                              }}
                            />
                          </td>
                          <td className="px-1 py-2 text-right font-mono text-sm tabular-nums text-muted-foreground">
                            {!costsReady && lines.length > 0 ? "ΓÇª" : `α╕┐${lineCost.toFixed(1)}`}
                          </td>
                          <td className="px-1 py-2 text-right font-mono text-sm tabular-nums">
                            α╕┐{Math.round(reg).toLocaleString()}
                          </td>
                          <td className="px-1 py-1.5">
                            <Input
                              className="h-9 text-right text-sm tabular-nums"
                              inputMode="decimal"
                              placeholder={row?.discountPct != null ? row.discountPct.toFixed(1) : "0"}
                              value={ln.lineDiscountPct ?? ""}
                              onChange={(e) =>
                                setLines((prev) =>
                                  prev.map((x) =>
                                    x.key === ln.key ? { ...x, lineDiscountPct: e.target.value, lineSalePrice: "" } : x
                                  )
                                )
                              }
                            />
                          </td>
                          <td className="px-1 py-1.5">
                            <Input
                              className="h-9 text-right text-sm tabular-nums"
                              inputMode="decimal"
                              placeholder={Math.max(0, rowSale).toFixed(1)}
                              value={ln.lineSalePrice ?? ""}
                              onChange={(e) =>
                                setLines((prev) => prev.map((x) => (x.key === ln.key ? { ...x, lineSalePrice: e.target.value } : x)))
                              }
                            />
                          </td>
                          <td className="px-1 py-2 text-right font-mono text-sm tabular-nums">{`${rowCostRate.toFixed(1)}%`}</td>
                          <td className={cn("px-1 py-2 text-right font-mono text-sm tabular-nums", rowMargin >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>
                            α╕┐{rowMargin.toFixed(1)}
                          </td>
                          <td className={cn("px-1 py-2 text-right font-mono text-sm tabular-nums", rowMarginPct >= 0 ? "text-rose-700 dark:text-rose-400" : "text-destructive")}>
                            {`${rowMarginPct.toFixed(1)}%`}
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => setLines((prev) => prev.filter((x) => x.key !== ln.key))}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
                {lines.length > 0 && (showPricingHall || showPricingDelivery) ? (
                  <tfoot>
                    <tr className="border-t-2 border-primary/25 bg-muted/45">
                      <td className="px-1 py-3 text-center text-sm text-muted-foreground">ΓÇö</td>
                      <td className="px-2 py-3 text-sm font-semibold leading-snug">
                        {activePriceAnalysis === "hall"
                          ? t("posSetTabComposeSummaryLabelHall")
                          : t("posSetTabComposeSummaryLabelDel")}
                      </td>
                      <td className="px-2 py-3 text-right text-sm text-muted-foreground">ΓÇö</td>
                      <td className="px-1 py-3 text-right font-mono text-sm font-semibold tabular-nums">
                        {!costsReady ? "ΓÇª" : `α╕┐${paCostTotal.toFixed(1)}`}
                      </td>
                      <td className="px-1 py-3 text-right font-mono text-sm font-semibold tabular-nums">
                        α╕┐{Math.round(composeSummaryReg).toLocaleString()}
                      </td>
                      <td className="px-1 py-3 text-right font-mono text-sm tabular-nums">
                        {(lineSummary?.discountPctAvg ?? composeSummaryDiscPct).toFixed(1)}%
                      </td>
                      <td className="bg-amber-200/55 px-1 py-3 text-right font-mono text-sm font-bold tabular-nums dark:bg-amber-950/45">
                        α╕┐{Math.round(lineSummary?.saleTotal ?? paSaleRef).toLocaleString()}
                      </td>
                      <td className="px-1 py-3 text-right font-mono text-sm tabular-nums">
                        {lines.length ? `${paCostRate.toFixed(1)}%` : "ΓÇö"}
                      </td>
                      <td
                        className={cn(
                          "px-1 py-3 text-right font-mono text-sm font-semibold tabular-nums",
                          lines.length && paMarginBaht >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"
                        )}
                      >
                        {lines.length ? `α╕┐${paMarginBaht.toFixed(1)}` : "ΓÇö"}
                      </td>
                      <td
                        className={cn(
                          "px-1 py-3 text-right font-mono text-sm font-semibold tabular-nums",
                          lines.length && paMarginPct >= 0 ? "text-rose-700 dark:text-rose-400" : "text-destructive"
                        )}
                      >
                        {lines.length ? `${paMarginPct.toFixed(1)}%` : "ΓÇö"}
                      </td>
                      <td className="px-1 py-3" />
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
          <div
            className={cn(
              "min-w-0 rounded-xl border border-border/80 bg-card/90 p-4 shadow-sm ring-1 ring-primary/10 space-y-4 xl:order-1",
              !costsReady && lines.length > 0 && "opacity-95"
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  Step 3 ┬╖ {t("posSetTabPricingFlowTitle")}
                </p>
                <p className="text-base font-bold">{t("posSetTabPriceAnalysis")}</p>
              </div>
              {showPricingHall && showPricingDelivery ? (
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={priceAnalysisChannel === "hall" ? "default" : "outline"}
                    className="h-9 text-sm"
                    onClick={() => setPriceAnalysisChannel("hall")}
                  >
                    {t("posMenuPriceHall")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={priceAnalysisChannel === "delivery" ? "default" : "outline"}
                    className="h-9 text-sm"
                    onClick={() => setPriceAnalysisChannel("delivery")}
                  >
                    {t("posOrderTypeDelivery")}
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              <div
                className={cn(
                  "grid gap-2",
                  showPricingHall && showPricingDelivery && "sm:grid-cols-3",
                  (showPricingHall || showPricingDelivery) && !(showPricingHall && showPricingDelivery) && "sm:grid-cols-2"
                )}
              >
                {showPricingHall ? (
                  <div className="flex min-h-[76px] flex-col justify-between rounded-lg border border-border/50 bg-background/40 px-3 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("posSetTabRegularSumHallLabel")}
                    </p>
                    <p className="mt-1 font-mono text-base font-semibold tabular-nums">α╕┐{Math.round(regularSum).toLocaleString()}</p>
                  </div>
                ) : null}
                {showPricingDelivery ? (
                  <div className="flex min-h-[76px] flex-col justify-between rounded-lg border border-border/50 bg-background/40 px-3 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("posSetTabRegularSumDeliveryLabel")}
                    </p>
                    <p className="mt-1 font-mono text-base font-semibold tabular-nums">α╕┐{Math.round(regularSumDelivery).toLocaleString()}</p>
                  </div>
                ) : null}
                {showPricingHall || showPricingDelivery ? (
                  <div className="flex min-h-[76px] flex-col justify-between rounded-lg border border-border/50 bg-background/40 px-3 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {activePriceAnalysis === "hall" ? t("posMenuPriceHall") : t("posOrderTypeDelivery")}
                    </p>
                    <Input
                      className="mt-1 h-9 text-right text-sm tabular-nums"
                      inputMode="decimal"
                      value={String(paSaleRef)}
                      onChange={(e) => {
                        setActiveChannelSalePrice(e.target.value)
                        syncDiscountFromSale(e.target.value)
                      }}
                    />
                  </div>
                ) : null}
              </div>
              {showPricingHall || showPricingDelivery ? (
                <div className="flex min-h-[72px] flex-col justify-between rounded-lg border border-border/50 bg-background/40 px-3 py-2.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("posSetTabSalesSetCount")}
                  </label>
                  <Input
                    className="mt-1 h-9 text-right text-sm tabular-nums"
                    inputMode="numeric"
                    placeholder="0"
                    value={salesSetCountStr}
                    onChange={(e) => setSalesSetCountStr(e.target.value)}
                  />
                  {t("posSetTabSalesSetCountHint") ? (
                    <p className="mt-1 text-[11px] text-muted-foreground leading-snug">{t("posSetTabSalesSetCountHint")}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
            {lineAverages ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("posSetTabLineAvgDiscountPct")}
                  </p>
                  <p className="mt-1 font-mono text-base font-semibold tabular-nums">{lineAverages.discountPctAvg.toFixed(1)}%</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("posSetTabLineAvgSalePrice")}
                  </p>
                  <p className="mt-1 font-mono text-base font-semibold tabular-nums">α╕┐{lineAverages.saleAvg.toFixed(1)}</p>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/10 px-3 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("posSetTabDiscountBlock")}</span>
              <Button
                type="button"
                size="sm"
                variant={discountMode === "pct" ? "default" : "outline"}
                className="h-9 text-sm"
                onClick={() => setDiscountMode("pct")}
              >
                {t("posMenuBundleDiscountModePct")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={discountMode === "baht" ? "default" : "outline"}
                className="h-9 text-sm"
                onClick={() => setDiscountMode("baht")}
              >
                {t("posMenuBundleDiscountModeBaht")}
              </Button>
              {discountMode === "pct" ? (
                <Input
                  className="h-9 w-28 text-right text-sm tabular-nums"
                  inputMode="decimal"
                  value={discountPctStr}
                  onChange={(e) => {
                    const v = e.target.value
                    setDiscountPctStr(v)
                    syncSaleFromDiscount("pct", v, discountBahtStr)
                  }}
                />
              ) : (
                <Input
                  className="h-9 w-28 text-right text-sm tabular-nums"
                  inputMode="decimal"
                  value={discountBahtStr}
                  onChange={(e) => {
                    const v = e.target.value
                    setDiscountBahtStr(v)
                    syncSaleFromDiscount("baht", discountPctStr, v)
                  }}
                />
              )}
              {showPricingHall || showPricingDelivery ? (
                <div className="ml-auto">
                  <Button type="button" size="sm" variant="secondary" className="h-9 text-sm" onClick={applyDiscountToActiveChannel}>
                    {t("posSetTabApplyDiscount")}
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                <p className="text-xs font-semibold text-muted-foreground">{t("posPromoCostSum")}</p>
                <p className="mt-1 font-mono text-base font-semibold tabular-nums">
                  {lines.length === 0 || costsReady ? `α╕┐${paCostTotal.toFixed(1)}` : t("posPromoSimulatorCalculating")}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5">
                <p className="text-xs font-semibold text-muted-foreground">{t("posMenuBundleCostRate")}</p>
                <p className="mt-1 font-mono text-base tabular-nums">{lines.length ? `${paCostRate.toFixed(1)}%` : "ΓÇö"}</p>
              </div>
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 dark:bg-emerald-950/20">
                <p className="text-xs font-semibold text-muted-foreground">{t("posMenuBundleMarginPct")}</p>
                <p className={cn("mt-1 font-mono text-base font-semibold tabular-nums", paMarginBaht >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                  {lines.length ? `${paMarginPct.toFixed(1)}%` : "ΓÇö"}
                </p>
              </div>
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 dark:bg-emerald-950/20">
                <p className="text-xs font-semibold text-muted-foreground">{t("posMenuBundleMarginBaht")}</p>
                <p className={cn("mt-1 font-mono text-base font-semibold tabular-nums", paMarginBaht >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                  {lines.length ? `α╕┐${paMarginBaht.toFixed(1)}` : "ΓÇö"}
                </p>
              </div>
            </div>

            {analysisWarningKey ? (
              <div className="rounded-lg border border-amber-400/50 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
                {t(analysisWarningKey)}
              </div>
            ) : null}

            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={form.vatIncluded} onCheckedChange={(c) => setForm((p) => ({ ...p, vatIncluded: c === true }))} />
              {t("posMenuVatIncluded")}
            </label>

            {projectedProfitHall != null && salesSetCount > 0 && showPricingHall && activePriceAnalysis === "hall" ? (
              <div className="flex justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm font-semibold">
                <span className="text-muted-foreground">{t("posSetTabProjectedProfit")}</span>
                <span className="font-mono text-primary tabular-nums">α╕┐{Math.round(projectedProfitHall).toLocaleString()}</span>
              </div>
            ) : null}
            {projectedProfitDelivery != null && salesSetCount > 0 && showPricingDelivery && activePriceAnalysis === "delivery" ? (
              <div className="flex justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm font-semibold">
                <span className="text-muted-foreground">{t("posSetTabProjectedProfitDelivery")}</span>
                <span className="font-mono text-primary tabular-nums">α╕┐{Math.round(projectedProfitDelivery).toLocaleString()}</span>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
              <Button
                type="button"
                className="h-10 bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={savingPromo || savingSet}
                onClick={() => void handleSavePromo()}
              >
                <Save className="mr-2 h-4 w-4" />
                {savingPromo ? t("loading") : t("posSetTabSavePromo")}
              </Button>
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
            <p className="text-[10px] text-muted-foreground leading-relaxed">{t("posSetTabSavePromoFooterHint")}</p>
          </div>

        {/* ∞áÇ∞₧ÑδÉ£ ∞ä╕φè╕ (Ω░ÇΩ▓⌐ δ╢ä∞ä¥Ω│╝ δÅÖ∞¥╝ φÅ¡ 1/2, ∞╣┤δô£δèö ∞ù┤ ∞òê∞ùÉ∞ä£ Ω░Çδí£ ∞áä∞▓┤) */}
        <div className="flex min-h-0 w-full min-w-0 flex-col gap-3 rounded-xl border border-border/80 bg-muted/15 p-4 shadow-sm xl:order-2 dark:bg-zinc-950/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Step 4 ┬╖ {t("posSetTabSavedSetsTitle")}
          </p>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-bold">{t("posSetTabSavedSetsTitle")}</p>
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
            <ul className="grid w-full max-h-[min(520px,65vh)] grid-cols-1 gap-2 overflow-y-auto overflow-x-hidden pr-0.5">
              {mirrorRowsForCurrentPromoName.map((m) => {
                const pid = String(m.promoId ?? "").trim()
                const pr = pid ? promoById[pid] : undefined
                const active = editPromoId && pid === editPromoId
                const preview = pid ? savedSetComposePreview[pid] : undefined
                const hallOn = pr?.channelHall !== false
                const takeOn = pr?.channelTakeout !== false
                const delOn = pr?.channelDelivery !== false
                const delCodes = normalizeDeliveryAppCodesList(pr?.deliveryAppCodes)
                const disc = pr?.discountPercent != null ? Number(pr.discountPercent) : null
                const showDisc = disc != null && !Number.isNaN(disc) && disc !== 0
                const saleActive = pr?.isActive !== false
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      disabled={!pid || promosLoading}
                      onClick={() => {
                        if (!pid) return
                        preserveLinesAfterMasterSaveRef.current = null
                        setEditPromoId(pid)
                      }}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                        active
                          ? "border-emerald-500/50 bg-emerald-500/10"
                          : "border-border/60 bg-card/80 hover:bg-muted/60"
                      )}
                    >
                      <div className="grid w-full grid-cols-1 gap-2 md:grid-cols-12 md:items-start md:gap-x-3 md:gap-y-1">
                        {/* δ⌐öφâÇ: ∞╜öδô£┬╖∞âüφâ£┬╖∞▒äδäÉ┬╖∞¥┤δªä */}
                        <div className="min-w-0 md:col-span-4">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="min-w-0 truncate font-mono text-xs font-semibold tabular-nums">
                              {pr?.code || m.code}
                            </span>
                            <Badge
                              variant={saleActive ? "default" : "secondary"}
                              className={cn(
                                "shrink-0 px-1.5 py-0 text-[10px] font-normal",
                                saleActive && "bg-emerald-600 hover:bg-emerald-600"
                              )}
                            >
                              {saleActive ? t("posSetInquiryActive") : t("posSetInquiryInactive")}
                            </Badge>
                            <span className="flex flex-wrap gap-1">
                              {hallOn ? (
                                <span className="rounded border border-border/50 bg-muted/40 px-1 py-0 text-[10px] text-muted-foreground leading-none">
                                  {t("posOrderTypeDineIn")}
                                </span>
                              ) : null}
                              {takeOn ? (
                                <span className="rounded border border-border/50 bg-muted/40 px-1 py-0 text-[10px] text-muted-foreground leading-none">
                                  {t("posOrderTypeTakeout")}
                                </span>
                              ) : null}
                              {delOn ? (
                                <span className="rounded border border-border/50 bg-muted/40 px-1 py-0 text-[10px] text-muted-foreground leading-none">
                                  {t("posOrderTypeDelivery")}
                                </span>
                              ) : null}
                            </span>
                          </div>
                          <p className="mt-0.5 line-clamp-1 text-xs font-medium leading-snug text-foreground">
                            {pr?.name || m.name || "ΓÇö"}
                          </p>
                          {delOn && delCodes.length > 0 ? (
                            <p className="mt-0.5 line-clamp-1 text-[10px] leading-tight text-muted-foreground">
                              {delCodes
                                .map((c) => {
                                  const row = DEFAULT_PICKER_DELIVERY_APPS.find((d) => d.code === c)
                                  return row ? t(row.nameKey) : c
                                })
                                .join(" ┬╖ ")}
                            </p>
                          ) : null}
                        </div>

                        {/* Ω╡¼∞ä▒ δ»╕δª¼δ│┤Ω╕░ ΓÇö Ω░Çδí£ Ω│╡Ω░ä φÖ£∞Ü⌐ */}
                        <div className="min-w-0 border-t border-border/40 pt-2 md:col-span-5 md:border-l md:border-t-0 md:pl-3 md:pt-0">
                          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {t("posSetTabSavedSetBundleLines")}
                            {preview?.status === "ok" && preview.total > 0 ? (
                              <span className="ml-1 font-normal normal-case text-muted-foreground/80">
                                ({t("posSetTabMenuLineCount").replace("{{n}}", String(preview.total))})
                              </span>
                            ) : null}
                          </p>
                          {preview?.status === "loading" ? (
                            <p className="animate-pulse text-xs text-muted-foreground">ΓÇª</p>
                          ) : null}
                          {preview?.status === "err" ? (
                            <p className="text-xs text-destructive">{t("posSetTabSavedSetComposeLoadErr")}</p>
                          ) : null}
                          {preview?.status === "ok" && preview.total === 0 ? (
                            <p className="text-xs text-muted-foreground">ΓÇö</p>
                          ) : null}
                          {preview?.status === "ok" && preview.previewLines.length > 0 ? (
                            <ul className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
                              {preview.previewLines.map((line, i) => (
                                <li
                                  key={`${pid}-${i}`}
                                  className="line-clamp-1 min-w-0 text-left text-[11px] leading-snug text-foreground/90"
                                >
                                  ┬╖ {line}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {preview?.status === "ok" && preview.total > preview.previewLines.length ? (
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              {t("posSetTabSavedSetMoreLines").replace(
                                "{{n}}",
                                String(preview.total - preview.previewLines.length)
                              )}
                            </p>
                          ) : null}
                        </div>

                        {/* Ω░ÇΩ▓⌐┬╖φòá∞¥╕ */}
                        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-border/40 pt-2 text-xs md:col-span-3 md:flex-col md:items-end md:border-l md:border-t-0 md:pl-3 md:pt-0 md:text-right">
                          {showDisc ? (
                            <p className="font-medium text-amber-800 dark:text-amber-200">
                              {t("posPromoSimulatorDiscountPct")}{" "}
                              <span className="font-mono tabular-nums">{disc!.toFixed(1)}%</span>
                            </p>
                          ) : null}
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 md:flex-col md:items-end md:gap-0">
                            <p className="font-mono tabular-nums text-muted-foreground">
                              {t("posMenuPriceHall")}{" "}
                              <span className="text-foreground">α╕┐{Math.round(pr?.price ?? m.price ?? 0).toLocaleString()}</span>
                            </p>
                            {pr?.priceDelivery != null && Number(pr.priceDelivery) > 0 ? (
                              <p className="font-mono tabular-nums text-muted-foreground">
                                {t("posMenuPriceDelivery")}{" "}
                                <span className="text-foreground">
                                  α╕┐{Math.round(Number(pr.priceDelivery)).toLocaleString()}
                                </span>
                              </p>
                            ) : null}
                          </div>
                          {pr?.vatIncluded === false ? (
                            <p className="w-full text-[10px] text-muted-foreground md:text-right">{t("posCostExclVat")}</p>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="mt-2 border-t border-border/60 pt-3">
            <p className="text-[10px] text-muted-foreground leading-relaxed">{t("posSetTabSaveSplitHint")}</p>
          </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  )
}

function sortByCode<T>(arr: T[], codeOf: (x: T) => string | undefined): T[] {
  return [...arr].sort((a, b) => String(codeOf(a) ?? "").localeCompare(String(codeOf(b) ?? "")))
}
