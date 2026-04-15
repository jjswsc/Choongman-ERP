"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { UtensilsCrossed, FilePlus, Save, RotateCcw, RefreshCw, Pencil, Trash2, Plus, ChevronDown, ChevronRight, LayoutGrid, Layers, Monitor, PauseCircle, PlayCircle, FolderTree, History, DollarSign, Calculator, ClipboardList, Download, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import {
  getPosMenus,
  getPosMenuCategories,
  getPosMenuCategoriesConfig,
  getNextPosMenuCode,
  type PosMenuCategoriesConfig,
  getPosMenuOptions,
  getPosMenuIngredients,
  getMenuCost,
  getAdminItems,
  savePosMenu,
  savePosMenuOption,
  savePosMenuIngredient,
  deletePosMenu,
  deletePosMenuOption,
  deletePosMenuIngredient,
  updatePosMenuSoldOut,
  getPosPromos,
  getPosPromoSchemaStatus,
  importPosMenus,
  refreshPosMenusCatalogCache,
  useStoreList,
  type PosMenu,
  type PosMenuOption,
  type PosMenuIngredient,
  type PosPromo,
} from "@/lib/api-client"
import {
  adminTabsBarCn,
  adminTabsContentCn,
  adminTabsIconCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { PosMenuCategorySettingsDialog } from "@/components/erp/pos-menu-category-settings-dialog"
import { PosSetMenuTabWorkspace } from "@/components/erp/pos-set-menu-tab-workspace"
import { PosSetMenuInquiryTab } from "@/components/erp/pos-set-menu-inquiry-tab"
import { PosStoreFinalPriceSettings } from "@/components/erp/pos-store-final-price-settings"
import { PriceHistoryTab } from "@/components/erp/price-history-tab"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole } from "@/lib/permissions"
import { POS_MAIN_CATEGORIES, POS_CATEGORIES_BY_MAIN } from "@/lib/pos-menu-categories"
import {
  PROMOTION_MAIN_CATEGORY,
  normalizePromotionCategoryMain,
  normalizePromotionSubcategory,
  promotionSubcategoriesEqual,
  uniqueSubcategoriesForMainMenu,
} from "@/lib/pos-promo-constants"
import { translatePosMenuCategoryLabel } from "@/lib/pos-menu-category-label"
import { sortByCode } from "@/lib/sort-utils"

/** 코드 자동 생성 대상 대분류 (C/K/S/D/T 접두사) */
const CODE_AUTO_MAINS = ["Chicken", "Korean", "Side", "Drinks", "Topping"] as const

/** 옵션관리 탭: 고정 2단계 — 1. 사이즈, 2. 부위 */
const OPTION_SIZE_VALUES = ["S", "M", "L"]
const OPTION_PART_VALUES = ["순살", "윙", "봉"] as const
/** 치킨 메뉴: 코드가 c로 시작. 기본가=S 순살, 옵션은 M 순살/윙/봉 3개만 */
const CHICKEN_CODE_PREFIX = "c"
function isChickenMenu(code: string | undefined): boolean {
  return !!code?.trim().toLowerCase().startsWith(CHICKEN_CODE_PREFIX)
}
/** 치킨 기본 옵션(S 순살): 메뉴 관리 옵션 목록에서 제외하고, 기본 행 하나로만 표시 */
function isChickenDefaultOption(name: string | undefined): boolean {
  if (!name?.trim()) return false
  const n = name.trim()
  return /^S\s*[-]?\s*순살\s*$/i.test(n) || n === "S 순살" || n === "S - 순살" || n === "S-순살"
}

/** 옵션 구성 탭·메뉴 폼: 쉼표 구분 단계 키 (영문 키 권장: size, part, side, drink) */
function parseOptionGroupsFromText(text: string): string[] {
  const parts = text
    .split(/[,，\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return Array.from(new Set(parts))
}

function isSizePartGroups(groups: string[]): boolean {
  return groups.length === 2 && groups[0] === "size" && groups[1] === "part"
}

/** 추가형 옵션: 연결 메뉴코드(또는 레거시 품목코드)×수량 */
function additiveOptionLinkSuffix(opt: PosMenuOption, menus: PosMenu[]): string {
  if (opt.optionType !== "additive") return ""
  const mid = opt.additiveSourceMenuId
  if (mid != null && Number(mid) > 0) {
    const m = menus.find((x) => x.id === String(mid))
    return m ? `${m.code}×${opt.quantity ?? 1}` : `id:${mid}×${opt.quantity ?? 1}`
  }
  const ic = opt.itemCode?.trim()
  if (ic) return `${ic}×${opt.quantity ?? 1}`
  return ""
}

const emptyForm = {
  code: "",
  name: "",
  categoryMain: "",
  category: "",
  price: "",
  priceDelivery: "",
  imageUrl: "",
  vatIncluded: true,
  isActive: true,
  isBanban: false,
}

export default function PosMenusPage() {
  const { auth } = useAuth()
  const { stores } = useStoreList()
  const { lang } = useLang()
  const t = useT(lang)
  /** 옵션 부위명(순살/윙/봉) 표시 시 현재 언어로 번역. "M - 순살" 등 포함 형태도 처리 */
  const optionPartLabel = (name: string) => {
    if (!name?.trim()) return name ?? ""
    let s = String(name)
    if (s.includes("순살")) s = s.replace(/순살/g, t("posOptionPartBoneless"))
    if (s.includes("윙")) s = s.replace(/윙/g, t("posOptionPartWing"))
    if (s.includes("봉")) s = s.replace(/봉/g, t("posOptionPartDrumstick"))
    return s
  }
  const [menus, setMenus] = React.useState<PosMenu[]>([])
  const [allCategories, setAllCategories] = React.useState<string[]>([])
  const [allMainCategories, setAllMainCategories] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(false)
  const [refreshLoading, setRefreshLoading] = React.useState(false)
  const [menuImportBusy, setMenuImportBusy] = React.useState(false)
  const menuImportInputRef = React.useRef<HTMLInputElement>(null)
  const [formData, setFormData] = React.useState(emptyForm)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [categoryFilter, setCategoryFilter] = React.useState("all")
  const [mainCategoryFilter, setMainCategoryFilter] = React.useState("all")
  const [soldOutFilter, setSoldOutFilter] = React.useState<"all" | "selling" | "soldOut">("all")
  const [optionsConfigListLoading, setOptionsConfigListLoading] = React.useState(false)
  const [soldOutTogglingId, setSoldOutTogglingId] = React.useState<string | null>(null)
  const [soldOutTogglingOptionId, setSoldOutTogglingOptionId] = React.useState<string | null>(null)
  const [menuOptions, setMenuOptions] = React.useState<PosMenuOption[]>([])
  const [menuIngredients, setMenuIngredients] = React.useState<PosMenuIngredient[]>([])
  const [items, setItems] = React.useState<{ code: string; name: string; category: string }[]>([])
  const [newOptionName, setNewOptionName] = React.useState("")
  const [newOptionModifier, setNewOptionModifier] = React.useState("0")
  const [newOptionModifierDelivery, setNewOptionModifierDelivery] = React.useState("")
  const [newOptionType, setNewOptionType] = React.useState<"substitution" | "additive">("substitution")
  /** 추가형: 연결할 소스 메뉴 id (pos_menus) */
  const [newOptionSourceMenuId, setNewOptionSourceMenuId] = React.useState("")
  const [newOptionQuantity, setNewOptionQuantity] = React.useState("1")
  const [selectedIngredientOptionId, setSelectedIngredientOptionId] = React.useState<string>("")
  const [newIngredientCode, setNewIngredientCode] = React.useState("")
  const [newIngredientQty, setNewIngredientQty] = React.useState("1")
  const [newIngredientLossRate, setNewIngredientLossRate] = React.useState("0")
  const [newIngredientType, setNewIngredientType] = React.useState<"food" | "packaging">("food")
  const [menuCost, setMenuCost] = React.useState<{ cost: number; breakdown: { itemCode: string; itemName: string; quantity: number; lossRate: number; costPerUnit: number; costTotal: number }[] } | null>(null)
  const [baseMenuCost, setBaseMenuCost] = React.useState<number | null>(null)
  const [expandedMenuId, setExpandedMenuId] = React.useState<string | null>(null)
  const [expandedMenuData, setExpandedMenuData] = React.useState<{ options: PosMenuOption[] } | null>(null)
  const [formTab, setFormTab] = React.useState<"info" | "options" | "cost">("info")
  const [mainTab, setMainTab] = React.useState<
    "screen" | "optionsConfig" | "set" | "setInquiry" | "priceHistory" | "priceApply" | "finalPrice"
  >("screen")
  const [pricingStoreCode, setPricingStoreCode] = React.useState("")
  const canSearchAllStores = isOfficeRole(auth?.role || "")
  const effectivePricingStore = canSearchAllStores && pricingStoreCode ? pricingStoreCode : auth?.store || ""
  const [optionsConfigSelectedMenuId, setOptionsConfigSelectedMenuId] = React.useState<string | null>(null)
  const [optionsConfigMenuOptions, setOptionsConfigMenuOptions] = React.useState<PosMenuOption[]>([])
  const [newOptionStepValues, setNewOptionStepValues] = React.useState<Record<string, string>>({})
  const [optionsConfigSearchTerm, setOptionsConfigSearchTerm] = React.useState("")
  const [optionsConfigCategoryFilter, setOptionsConfigCategoryFilter] = React.useState("all")
  const [categoriesConfig, setCategoriesConfig] = React.useState<PosMenuCategoriesConfig | null>(null)
  const [categorySettingsOpen, setCategorySettingsOpen] = React.useState(false)
  const [categoryMainOpen, setCategoryMainOpen] = React.useState(false)
  const [categoryOpen, setCategoryOpen] = React.useState(false)
  const [newOptionSize, setNewOptionSize] = React.useState("")
  const [newOptionPart, setNewOptionPart] = React.useState("")
  const [newOptionModifierPackaging, setNewOptionModifierPackaging] = React.useState("")
  const [chickenBatchApplying, setChickenBatchApplying] = React.useState(false)
  /** 옵션 구성 탭: 메뉴의 선택 단계(저장 전 편집) */
  const [optionsConfigGroupsDraft, setOptionsConfigGroupsDraft] = React.useState("")
  const [optionsConfigNewStepValues, setOptionsConfigNewStepValues] = React.useState<Record<string, string>>({})
  const [optionsConfigApplyingGroups, setOptionsConfigApplyingGroups] = React.useState(false)
  /** 비치킨·선택 단계 없음: POS에서 한 줄로 고르는 치환 옵션 */
  const [optionsConfigCustomOptionName, setOptionsConfigCustomOptionName] = React.useState("")
  const [promoListForSetTab, setPromoListForSetTab] = React.useState<PosPromo[]>([])
  const [setTabPromosLoading, setSetTabPromosLoading] = React.useState(false)
  const [schemaStatus, setSchemaStatus] = React.useState<{
    posPromosExtended: boolean
    posMenusPromoId: boolean
    ok: boolean
  } | null>(null)
  const [setTabSchemaDismissed, setSetTabSchemaDismissed] = React.useState(false)
  const [setTabFocusPromoId, setSetTabFocusPromoId] = React.useState<string | null>(null)

  React.useEffect(() => {
    try {
      if (typeof window !== "undefined" && localStorage.getItem("admin_pos_menu_set_schema_banner_dismiss") === "1") {
        setSetTabSchemaDismissed(true)
      }
    } catch {
      /* ignore */
    }
  }, [])

  React.useEffect(() => {
    if (canSearchAllStores && stores.length && !pricingStoreCode) {
      setPricingStoreCode(stores[0])
    } else if (!canSearchAllStores && auth?.store) {
      setPricingStoreCode(auth.store)
    }
  }, [canSearchAllStores, stores, auth?.store, pricingStoreCode])

  React.useEffect(() => {
    if (mainTab !== "set" && mainTab !== "setInquiry") return
    setSetTabPromosLoading(true)
    Promise.all([getPosPromos().catch(() => []), getPosPromoSchemaStatus().catch(() => null)])
      .then(([plist, schema]) => {
        setPromoListForSetTab(Array.isArray(plist) ? plist : [])
        if (schema) setSchemaStatus(schema)
      })
      .finally(() => setSetTabPromosLoading(false))
  }, [mainTab])

  const loadMenusAndCategories = React.useCallback(async (setLoadingState?: (v: boolean) => void) => {
    const setBusy = setLoadingState ?? (() => {})
    setBusy(true)
    try {
      // 세 API를 동시에 호출해 대기 시간 단축 (순차 호출 대비)
      const [list, catRes, config] = await Promise.all([
        getPosMenus(),
        getPosMenuCategories().catch(() => ({ categories: [] as string[], mainCategories: [] as string[] })),
        getPosMenuCategoriesConfig().catch(() => null),
      ])
      setMenus(Array.isArray(list) ? list : [])
      const { categories, mainCategories } = catRes ?? { categories: [], mainCategories: [] }
      setAllCategories(Array.isArray(categories) ? categories : [])
      setAllMainCategories(Array.isArray(mainCategories) ? mainCategories : [])
      setCategoriesConfig(config ?? null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const isNetworkError = /failed to fetch|network error|load failed|connection/i.test(msg)
      const hint = isNetworkError ? "\n\n" + (t("msg_load_fail_network") || "연결할 수 없습니다. 로그인 상태를 확인하거나, 개발 서버가 실행 중인지 확인해 주세요.") : ""
      await appAlert((t("msg_load_fail") || "목록을 불러오지 못했습니다.") + "\n" + msg + hint)
    } finally {
      setBusy(false)
    }
  }, [t])

  const handleDownloadPosMenuTemplate = React.useCallback(async () => {
    try {
      const { buildPosMenuImportTemplateBlob } = await import("@/lib/pos-menu-import-xlsx")
      const blob = await buildPosMenuImportTemplateBlob()
      const a = document.createElement("a")
      const url = URL.createObjectURL(blob)
      a.href = url
      a.download = "pos-menus-import-template.xlsx"
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      await appAlert(String(e instanceof Error ? e.message : e))
    }
  }, [])

  const handlePosMenuImportFileChange = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ""
      if (!file) return
      setMenuImportBusy(true)
      try {
        const { parsePosMenuImportWorkbook } = await import("@/lib/pos-menu-import-xlsx")
        const menus = await parsePosMenuImportWorkbook(file)
        if (menus.length === 0) {
          await appAlert(
            "업로드할 유효한 행이 없습니다. 첫 행은 양식과 동일한 영문 헤더(code, name, …)인지 확인해 주세요."
          )
          return
        }
        const ok = await appConfirm(
          `총 ${menus.length}행을 반영합니다. 동일 메뉴 코드는 덮어씁니다. 프로모션 연동 메뉴는 건너뜁니다. 계속할까요?`
        )
        if (!ok) return
        const r = await importPosMenus(menus)
        await refreshPosMenusCatalogCache()
        await loadMenusAndCategories()
        const detailLines = [
          `신규 ${r.inserted ?? 0}건, 갱신 ${r.updated ?? 0}건, 건너뜀·실패 ${r.skipped ?? 0}건`,
          ...(r.errors?.length ? ["", ...r.errors.slice(0, 20)] : []),
          r.errorsTruncated ? "\n… (오류 일부만 표시)" : "",
        ].join("\n")
        const title = r.success
          ? "일괄 반영이 완료되었습니다."
          : "일부 행만 반영되었거나 모두 건너뛰었습니다."
        await appAlert(`${title}\n\n${detailLines}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await appAlert(translateApiMessage(msg, t) || msg)
      } finally {
        setMenuImportBusy(false)
      }
    },
    [t, loadMenusAndCategories]
  )

  const refreshSetTabAfterSave = React.useCallback(() => {
    void getPosPromos()
      .then((plist) => setPromoListForSetTab(Array.isArray(plist) ? plist : []))
      .catch(() => {})
    void loadMenusAndCategories()
  }, [loadMenusAndCategories])

  const handleSetTabFocusConsumed = React.useCallback(() => setSetTabFocusPromoId(null), [])

  // 카테고리 설정은 페이지 로드 시 미리 로드 (메뉴 폼에서 대분류·카테고리 선택 가능)
  React.useEffect(() => {
    getPosMenuCategoriesConfig().then(setCategoriesConfig).catch(() => setCategoriesConfig(null))
  }, [])

  /** 페이지 진입 시 메뉴 1회 자동 조회 (화면 세트 시뮬·세트 탭·옵션구성에 공통) — 실패 시 [조회]로 재시도 */
  const initialPosMenusLoadRef = React.useRef(false)
  React.useEffect(() => {
    if (initialPosMenusLoadRef.current) return
    initialPosMenusLoadRef.current = true
    void loadMenusAndCategories(setLoading)
  }, [loadMenusAndCategories])

  const effectiveOptionIdForIngredients = selectedIngredientOptionId === "" || selectedIngredientOptionId === "null" ? undefined : selectedIngredientOptionId

  React.useEffect(() => {
    if (!editingId) {
      setMenuOptions([])
      setMenuIngredients([])
      setMenuCost(null)
      setBaseMenuCost(null)
      setSelectedIngredientOptionId("")
      return
    }
    getPosMenuOptions({ menuId: editingId }).then((opts) => setMenuOptions(opts || []))
  }, [editingId])

  React.useEffect(() => {
    if (!editingId) return
    getPosMenuIngredients({ menuId: editingId, optionId: effectiveOptionIdForIngredients ?? "null" }).then(setMenuIngredients)
  }, [editingId, effectiveOptionIdForIngredients])

  React.useEffect(() => {
    if (!editingId) return
    getMenuCost({ menuId: editingId, optionId: effectiveOptionIdForIngredients }).then((r) => setMenuCost({ cost: (r as { costHall?: number }).costHall ?? r.cost, breakdown: r.breakdown }))
  }, [editingId, menuIngredients, effectiveOptionIdForIngredients])

  React.useEffect(() => {
    if (!editingId) return
    getMenuCost({ menuId: editingId }).then((r) => setBaseMenuCost((r as { costHall?: number }).costHall ?? r.cost))
  }, [editingId, menuIngredients])

  const handleExpandMenu = React.useCallback(async (menuId: string) => {
    if (expandedMenuId === menuId) {
      setExpandedMenuId(null)
      setExpandedMenuData(null)
      return
    }
    try {
      const opts = await getPosMenuOptions({ menuId })
      if (!opts || opts.length === 0) {
        return
      }
      setExpandedMenuId(menuId)
      setExpandedMenuData({ options: opts })
    } catch {
      setExpandedMenuData(null)
    }
  }, [expandedMenuId])

  const loadItems = React.useCallback(() => {
    getAdminItems()
      .then((list) => setItems((list || []).map((x) => ({ code: x.code, name: x.name, category: x.category || "" }))))
      .catch(() => setItems([]))
  }, [])

  React.useEffect(() => {
    if (editingId) loadItems()
    else setItems([])
  }, [editingId, loadItems])

  const optionsConfigSelectedGroupsKey = React.useMemo(() => {
    if (!optionsConfigSelectedMenuId) return ""
    const sel = menus.find((m) => m.id === optionsConfigSelectedMenuId)
    return JSON.stringify(sel?.optionSelectionGroups ?? null)
  }, [optionsConfigSelectedMenuId, menus])

  React.useEffect(() => {
    if (!optionsConfigSelectedMenuId) {
      setOptionsConfigMenuOptions([])
      setOptionsConfigGroupsDraft("")
      setOptionsConfigNewStepValues({})
      setOptionsConfigCustomOptionName("")
      return
    }
    getPosMenuOptions({ menuId: optionsConfigSelectedMenuId }).then(setOptionsConfigMenuOptions)
    setOptionsConfigNewStepValues({})
    setOptionsConfigCustomOptionName("")
    setNewOptionSize("")
    setNewOptionPart("")
    setNewOptionModifier("0")
    setNewOptionModifierDelivery("")
    setNewOptionModifierPackaging("")
  }, [optionsConfigSelectedMenuId])

  React.useEffect(() => {
    if (!optionsConfigSelectedMenuId) return
    const sel = menus.find((m) => m.id === optionsConfigSelectedMenuId)
    const g = sel?.optionSelectionGroups
    setOptionsConfigGroupsDraft(Array.isArray(g) && g.length > 0 ? g.join(", ") : "")
  }, [optionsConfigSelectedMenuId, optionsConfigSelectedGroupsKey])

  React.useEffect(() => {
    if (mainTab === "optionsConfig" && optionsConfigSelectedMenuId) loadItems()
  }, [mainTab, optionsConfigSelectedMenuId, loadItems])

  /** 추가형 옵션에 연결 가능한 POS 메뉴(자기 자신 제외) */
  const additiveMenusForOptions = React.useMemo(() => {
    return [...menus]
      .filter((m) => m.isActive && (!editingId || m.id !== editingId))
      .sort((a, b) => (a.code || "").localeCompare(b.code || "", undefined, { numeric: true }))
  }, [menus, editingId])

  const handleNewRegister = () => {
    setEditingId(null)
    const filter = mainCategoryFilter === "all" ? "" : mainCategoryFilter.trim()
    if (!filter) {
      setFormData(emptyForm)
      return
    }
    setFormData({ ...emptyForm, categoryMain: filter, category: "" })
    if ((CODE_AUTO_MAINS as readonly string[]).includes(filter)) {
      void getNextPosMenuCode(filter).then(({ code: next }) => {
        if (next) setFormData((p) => ({ ...p, categoryMain: filter, category: "", code: next }))
      })
    }
  }

  const handleReset = () => {
    if (editingId) {
      const m = menus.find((x) => x.id === editingId)
      if (m) {
        setFormData({
          ...emptyForm,
          code: m.code,
          name: m.name,
          categoryMain: m.categoryMain ?? "",
          category: m.category ?? "",
          price: String(m.price),
          priceDelivery: m.priceDelivery != null ? String(m.priceDelivery) : "",
          imageUrl: m.imageUrl,
          vatIncluded: m.vatIncluded,
          isActive: m.isActive,
          isBanban: m.isBanban ?? false,
        })
      }
    } else {
      setFormData(emptyForm)
    }
  }

  const editingMenuLinkedPromoId = React.useMemo(() => {
    if (!editingId) return null
    const pid = menus.find((x) => x.id === editingId)?.promoId?.trim()
    return pid || null
  }, [editingId, menus])

  const editingMenuForFormOptions = React.useMemo(
    () => (editingId ? menus.find((m) => m.id === editingId) : null),
    [editingId, menus]
  )
  const currentMenuGroups = React.useMemo(
    () => (editingMenuForFormOptions?.optionSelectionGroups ?? []).map((g) => String(g).trim()).filter(Boolean),
    [editingMenuForFormOptions]
  )

  const handleSave = async () => {
    const wasEditingExisting = Boolean(editingId)
    if (editingMenuLinkedPromoId) {
      await appAlert(
        t("posMenuPromoLinkedEdit") || "프로모션과 연동된 메뉴는 마케팅 > 프로모션 관리에서 수정하세요."
      )
      return
    }
    const code = formData.code.trim()
    const name = formData.name.trim()
    if (!code || !name) {
      await appAlert(t("posMenuAlertCodeName"))
      return
    }
    if (!editingId && menus.some((m) => m.code === code)) {
      await appAlert(t("itemsAlertCodeExists"))
      return
    }
    const effectiveCategoryMain = formData.categoryMain.trim()
    let effectiveCategory = formData.category.trim()
    if (normalizePromotionCategoryMain(effectiveCategoryMain) === PROMOTION_MAIN_CATEGORY) {
      effectiveCategory = normalizePromotionSubcategory(effectiveCategory)
    }
    const editingMenu = editingId ? menus.find((m) => m.id === editingId) : null
    const res = await savePosMenu({
      id: editingId || undefined,
      code,
      name,
      categoryMain: effectiveCategoryMain,
      category: effectiveCategory,
      price: Number(formData.price) || 0,
      priceDelivery: formData.priceDelivery !== "" ? Number(formData.priceDelivery) : null,
      imageUrl: formData.imageUrl.trim(),
      vatIncluded: formData.vatIncluded,
      isActive: formData.isActive,
      isBanban: formData.isBanban,
    })
    if (!res.success) {
      await appAlert(translateApiMessage(res.message, t) || t("msg_save_fail_detail"))
      return
    }
    const newMenu: PosMenu = {
      id: editingId || "",
      code,
      name,
      categoryMain: effectiveCategoryMain,
      category: effectiveCategory,
      price: Number(formData.price) || 0,
      priceDelivery: formData.priceDelivery !== "" ? Number(formData.priceDelivery) : null,
      imageUrl: formData.imageUrl.trim(),
      vatIncluded: formData.vatIncluded,
      isActive: formData.isActive,
      sortOrder: 0,
      optionSelectionGroups: editingMenu?.optionSelectionGroups,
      isBanban: formData.isBanban,
    }
    if (editingId) {
      setMenus((prev) => prev.map((m) => (m.id === editingId ? { ...newMenu, id: editingId } : m)))
      await appAlert(t("itemsAlertUpdated"))
    } else {
      getPosMenus().then(setMenus)
      await appAlert(t("itemsAlertSaved"))
    }
    const newCat = effectiveCategory
    if (newCat && !allCategories.includes(newCat)) {
      setAllCategories((prev) => [...prev, newCat].sort())
    }
    const newMainCat = effectiveCategoryMain
    if (newMainCat && !allMainCategories.includes(newMainCat)) {
      setAllMainCategories((prev) => [...prev, newMainCat].sort())
    }
    if (!wasEditingExisting) {
      setFormData(emptyForm)
      setEditingId(null)
    }
  }

  const handleEdit = (menu: PosMenu) => {
    const mainNorm = normalizePromotionCategoryMain(menu.categoryMain ?? "")
    setFormData({
      code: menu.code,
      name: menu.name,
      categoryMain: menu.categoryMain ?? "",
      category:
        mainNorm === PROMOTION_MAIN_CATEGORY
          ? normalizePromotionSubcategory(menu.category ?? "")
          : (menu.category ?? ""),
      price: String(menu.price),
      priceDelivery: menu.priceDelivery != null ? String(menu.priceDelivery) : "",
      imageUrl: menu.imageUrl,
      vatIncluded: menu.vatIncluded,
      isActive: menu.isActive,
      isBanban: menu.isBanban ?? false,
    })
    setEditingId(menu.id)
    setNewOptionName("")
    setNewOptionModifier("0")
    setNewOptionModifierDelivery("")
    setSelectedIngredientOptionId("")
  }

  const handleAddOption = async () => {
    if (!editingId || !newOptionName.trim()) return
    if (newOptionType === "additive" && !newOptionSourceMenuId.trim()) {
      await appAlert(t("posOptionAdditiveMenuRequired") || "추가형 옵션은 연결할 메뉴(메뉴코드)를 선택해야 합니다.")
      return
    }
    if (newOptionType === "substitution" && currentMenuGroups.length > 0) {
      const missing = currentMenuGroups.filter((g) => !(newOptionStepValues[g] ?? "").trim())
      if (missing.length > 0) {
        await appAlert(
          t("posOptionStepValuesRequired") ||
            `옵션 선택 단계가 설정된 메뉴는 대체형 옵션에 모든 단계 값을 입력해야 합니다. (빈 값: ${missing.join(", ")})`
        )
        return
      }
    }
    const optionStepValues =
      newOptionType === "substitution" && currentMenuGroups.length > 0
        ? Object.fromEntries(currentMenuGroups.map((g) => [g, (newOptionStepValues[g] || "").trim()]))
        : undefined
    const res = await savePosMenuOption({
      menuId: Number(editingId),
      name: newOptionName.trim(),
      priceModifier: Number(newOptionModifier) || 0,
      priceModifierDelivery: newOptionModifierDelivery !== "" ? Number(newOptionModifierDelivery) : null,
      sortOrder: menuOptions.length,
      optionType: newOptionType,
      itemCode: null,
      additiveSourceMenuId:
        newOptionType === "additive" ? Number(newOptionSourceMenuId) || null : null,
      quantity: newOptionType === "additive" ? Number(newOptionQuantity) || 1 : 1,
      optionStepValues,
    })
    if (res.success) {
      getPosMenuOptions({ menuId: editingId }).then(setMenuOptions)
      setNewOptionName("")
      setNewOptionModifier("0")
      setNewOptionModifierDelivery("")
      setNewOptionType("substitution")
      setNewOptionSourceMenuId("")
      setNewOptionQuantity("1")
      setNewOptionStepValues({})
    } else {
      await appAlert(res.message)
    }
  }

  const handleAddIngredient = async () => {
    if (!editingId || !newIngredientCode.trim()) return
    const res = await savePosMenuIngredient({
      menuId: Number(editingId),
      itemCode: newIngredientCode.trim(),
      quantity: Number(newIngredientQty) || 1,
      lossRate: Number(newIngredientLossRate) || 0,
      optionId: effectiveOptionIdForIngredients ? Number(effectiveOptionIdForIngredients) : null,
      ingredientType: newIngredientType,
    })
    if (res.success) {
      getPosMenuIngredients({ menuId: editingId, optionId: effectiveOptionIdForIngredients ?? "null" }).then(setMenuIngredients)
      setNewIngredientCode("")
      setNewIngredientQty("1")
      setNewIngredientLossRate("0")
      setNewIngredientType("food")
    } else {
      await appAlert(res.message)
    }
  }

  const handleDeleteIngredient = async (ing: PosMenuIngredient) => {
    if (!await appConfirm(`${ing.itemCode} ${t("posMenuConfirmDelete")}`)) return
    const res = await deletePosMenuIngredient({ id: ing.id })
    if (res.success) {
      setMenuIngredients((prev) => prev.filter((i) => i.id !== ing.id))
    } else {
      await appAlert(res.message)
    }
  }

  const handleDeleteOption = async (opt: PosMenuOption) => {
    if (!await appConfirm(`"${opt.name}" ${t("posMenuConfirmDelete")}`)) return
    const res = await deletePosMenuOption({ id: opt.id })
    if (res.success) {
      setMenuOptions((prev) => prev.filter((o) => o.id !== opt.id))
    } else {
      await appAlert(res.message)
    }
  }

  /** 메뉴 목록 펼침에서 옵션 삭제 시 DB 반영 및 화면 갱신 */
  const handleDeleteOptionInList = async (opt: PosMenuOption, menuId: string) => {
    if (!await appConfirm(`"${opt.name}" ${t("posMenuConfirmDelete")}`)) return
    const res = await deletePosMenuOption({ id: opt.id })
    if (res.success) {
      const opts = await getPosMenuOptions({ menuId })
      setExpandedMenuData(opts && opts.length > 0 ? { options: opts } : null)
      if (!opts || opts.length === 0) setExpandedMenuId(null)
      getPosMenus().then(setMenus)
    } else {
      await appAlert(res.message)
    }
  }

  /** 메뉴 목록 펼침에서 옵션 수정 → 옵션 구성 탭으로 이동 */
  const handleEditOptionInList = (menuId: string) => {
    setOptionsConfigSelectedMenuId(menuId)
    setMainTab("optionsConfig")
    getPosMenuOptions({ menuId }).then(setOptionsConfigMenuOptions)
  }

  /** 옵션 판매 중지 토글 (sell_hall/delivery/packaging 모두 false면 품절) */
  const handleSoldOutToggleOption = async (opt: PosMenuOption, menuId: string) => {
    const isSoldOut = !(opt.sellHall ?? true) && !(opt.sellDelivery ?? true) && !(opt.sellPackaging ?? true)
    const next = !isSoldOut
    setSoldOutTogglingOptionId(String(opt.id))
    try {
      const res = await savePosMenuOption({
        id: opt.id,
        menuId: Number(opt.menuId),
        name: opt.name,
        priceModifier: opt.priceModifier ?? 0,
        priceModifierDelivery: opt.priceModifierDelivery ?? null,
        priceModifierPackaging: opt.priceModifierPackaging ?? null,
        sortOrder: opt.sortOrder ?? 0,
        optionType: opt.optionType ?? "substitution",
        itemCode: opt.itemCode ?? null,
        additiveSourceMenuId: opt.additiveSourceMenuId ?? null,
        quantity: opt.quantity ?? undefined,
        optionStepValues: opt.optionStepValues ?? undefined,
        sellHall: next,
        sellDelivery: next,
        sellPackaging: next,
      })
      if (res.success) {
        const opts = await getPosMenuOptions({ menuId })
        setExpandedMenuData(opts && opts.length > 0 ? { options: opts } : null)
        getPosMenus().then(setMenus)
      } else {
        await appAlert(res.message)
      }
    } finally {
      setSoldOutTogglingOptionId(null)
    }
  }

  const optionsConfigSelectedMenu = optionsConfigSelectedMenuId ? menus.find((m) => m.id === optionsConfigSelectedMenuId) : null

  const optionsConfigStepGroups = React.useMemo(() => {
    if (!optionsConfigSelectedMenuId) return [] as string[]
    const m = menus.find((x) => x.id === optionsConfigSelectedMenuId)
    return (m?.optionSelectionGroups ?? []).map((g) => String(g).trim()).filter(Boolean)
  }, [menus, optionsConfigSelectedMenuId])

  /** 사이즈/부위 드롭다운은 치킨(c 접두) 전용. 비치킨은 단계 키마다 직접 입력 */
  const optionsConfigUseSizePartUi = React.useMemo(() => {
    if (!optionsConfigSelectedMenu) return false
    return isChickenMenu(optionsConfigSelectedMenu.code)
  }, [optionsConfigSelectedMenu])

  /** 치킨 메뉴만: 옵션 추가 시 size, part 단계로 맞춤 */
  const ensureChickenMenuOptionGroups = React.useCallback(async () => {
    if (!optionsConfigSelectedMenuId || !optionsConfigSelectedMenu) return
    if (!isChickenMenu(optionsConfigSelectedMenu.code)) return
    const groups = optionsConfigSelectedMenu.optionSelectionGroups || []
    const hasCorrect = groups.length >= 2 && groups[0] === "size" && groups[1] === "part"
    if (hasCorrect) return
    const res = await savePosMenu({
      id: optionsConfigSelectedMenuId,
      code: optionsConfigSelectedMenu.code,
      name: optionsConfigSelectedMenu.name,
      category: optionsConfigSelectedMenu.category,
      categoryMain: optionsConfigSelectedMenu.categoryMain ?? "",
      price: optionsConfigSelectedMenu.price,
      priceDelivery: optionsConfigSelectedMenu.priceDelivery ?? null,
      imageUrl: optionsConfigSelectedMenu.imageUrl ?? "",
      vatIncluded: optionsConfigSelectedMenu.vatIncluded ?? true,
      isActive: optionsConfigSelectedMenu.isActive ?? true,
      optionSelectionGroups: ["size", "part"],
      isBanban: optionsConfigSelectedMenu.isBanban ?? false,
    })
    if (res.success) {
      setMenus((prev) =>
        prev.map((m) => (m.id === optionsConfigSelectedMenuId ? { ...m, optionSelectionGroups: ["size", "part"] } : m))
      )
    }
  }, [optionsConfigSelectedMenuId, optionsConfigSelectedMenu])

  const handleApplyOptionGroupsForConfig = async () => {
    if (!optionsConfigSelectedMenuId || !optionsConfigSelectedMenu) return
    const pid = optionsConfigSelectedMenu.promoId?.trim()
    if (pid) {
      await appAlert(t("posMenuPromoLinkedEdit") || "프로모션과 연동된 메뉴는 마케팅 > 프로모션 관리에서 수정하세요.")
      return
    }
    const parsed = parseOptionGroupsFromText(optionsConfigGroupsDraft)
    setOptionsConfigApplyingGroups(true)
    try {
      const res = await savePosMenu({
        id: optionsConfigSelectedMenuId,
        code: optionsConfigSelectedMenu.code,
        name: optionsConfigSelectedMenu.name,
        category: optionsConfigSelectedMenu.category ?? "",
        categoryMain: optionsConfigSelectedMenu.categoryMain ?? "",
        sortOrder: optionsConfigSelectedMenu.sortOrder ?? 0,
        price: optionsConfigSelectedMenu.price,
        priceDelivery: optionsConfigSelectedMenu.priceDelivery ?? null,
        imageUrl: optionsConfigSelectedMenu.imageUrl ?? "",
        vatIncluded: optionsConfigSelectedMenu.vatIncluded ?? true,
        isActive: optionsConfigSelectedMenu.isActive ?? true,
        optionSelectionGroups: parsed,
        isBanban: optionsConfigSelectedMenu.isBanban ?? false,
      })
      if (res.success) {
        setMenus((prev) =>
          prev.map((m) => (m.id === optionsConfigSelectedMenuId ? { ...m, optionSelectionGroups: parsed } : m))
        )
        setOptionsConfigNewStepValues({})
        await appAlert(t("msg_save_success") || "저장되었습니다.")
      } else {
        await appAlert(res.message || t("msg_save_fail_detail"))
      }
    } finally {
      setOptionsConfigApplyingGroups(false)
    }
  }

  /** 프리셋 단계를 입력란에 반영한 뒤 곧바로 DB에 저장 */
  const handleApplyOptionPresetAndSave = async (preset: string[]) => {
    if (!optionsConfigSelectedMenuId || !optionsConfigSelectedMenu) return
    const pid = optionsConfigSelectedMenu.promoId?.trim()
    if (pid) {
      await appAlert(t("posMenuPromoLinkedEdit") || "프로모션과 연동된 메뉴는 마케팅 > 프로모션 관리에서 수정하세요.")
      return
    }
    const cleaned = preset.map((x) => String(x).trim()).filter(Boolean)
    if (cleaned.length === 0) return
    setOptionsConfigGroupsDraft(cleaned.join(", "))
    setOptionsConfigApplyingGroups(true)
    try {
      const res = await savePosMenu({
        id: optionsConfigSelectedMenuId,
        code: optionsConfigSelectedMenu.code,
        name: optionsConfigSelectedMenu.name,
        category: optionsConfigSelectedMenu.category ?? "",
        categoryMain: optionsConfigSelectedMenu.categoryMain ?? "",
        sortOrder: optionsConfigSelectedMenu.sortOrder ?? 0,
        price: optionsConfigSelectedMenu.price,
        priceDelivery: optionsConfigSelectedMenu.priceDelivery ?? null,
        imageUrl: optionsConfigSelectedMenu.imageUrl ?? "",
        vatIncluded: optionsConfigSelectedMenu.vatIncluded ?? true,
        isActive: optionsConfigSelectedMenu.isActive ?? true,
        optionSelectionGroups: cleaned,
        isBanban: optionsConfigSelectedMenu.isBanban ?? false,
      })
      if (res.success) {
        setMenus((prev) =>
          prev.map((m) => (m.id === optionsConfigSelectedMenuId ? { ...m, optionSelectionGroups: cleaned } : m))
        )
        setOptionsConfigNewStepValues({})
        await appAlert(t("msg_save_success") || "저장되었습니다.")
      } else {
        await appAlert(res.message || t("msg_save_fail_detail"))
      }
    } finally {
      setOptionsConfigApplyingGroups(false)
    }
  }

  const handleAddFlatOptionForConfig = async () => {
    if (!optionsConfigSelectedMenuId || !optionsConfigSelectedMenu) return
    if (isChickenMenu(optionsConfigSelectedMenu.code)) return
    if (optionsConfigStepGroups.length > 0) {
      await appAlert(
        t("posOptionDirectAddNeedNoSteps") ||
          "선택 단계가 설정된 메뉴에서는 아래 단계별 입력으로 조합을 추가하세요. 한 줄 옵션만 쓰려면 선택 단계를 비운 뒤 [단계 저장]하세요."
      )
      return
    }
    const name = optionsConfigCustomOptionName.trim()
    if (!name) {
      await appAlert(t("posOptionDirectAddNameRequired") || "옵션명을 입력해 주세요.")
      return
    }
    const exists = optionsConfigMenuOptions.some((o) => o.name.trim() === name)
    if (exists) {
      await appAlert(`${name} ${t("itemsAlertCodeExists") || "이미 있습니다."}`)
      return
    }
    const res = await savePosMenuOption({
      menuId: Number(optionsConfigSelectedMenuId),
      name,
      priceModifier: Number(newOptionModifier) || 0,
      priceModifierDelivery: newOptionModifierDelivery !== "" ? Number(newOptionModifierDelivery) : null,
      priceModifierPackaging: newOptionModifierPackaging !== "" ? Number(newOptionModifierPackaging) : null,
      sortOrder: optionsConfigMenuOptions.length,
      optionType: "substitution",
      sellHall: true,
      sellDelivery: true,
      sellPackaging: true,
    })
    if (res.success) {
      getPosMenuOptions({ menuId: optionsConfigSelectedMenuId }).then(setOptionsConfigMenuOptions)
      setOptionsConfigCustomOptionName("")
      setNewOptionModifier("0")
      setNewOptionModifierDelivery("")
      setNewOptionModifierPackaging("")
    } else {
      await appAlert(res.message || t("msg_save_fail_detail"))
    }
  }

  const handleAddOptionForConfig = async () => {
    if (!optionsConfigSelectedMenuId || !optionsConfigSelectedMenu) return
    try {
      if (isChickenMenu(optionsConfigSelectedMenu.code)) {
        await ensureChickenMenuOptionGroups()
        if (!newOptionSize || !newOptionPart) return
        const name = `${newOptionSize} - ${newOptionPart}`
        const optionStepValues = { size: newOptionSize, part: newOptionPart }
        const exists = optionsConfigMenuOptions.some(
          (o) => o.optionStepValues?.size === newOptionSize && o.optionStepValues?.part === newOptionPart
        )
        if (exists) {
          await appAlert(`${name} ${t("itemsAlertCodeExists") || "이미 있습니다."}`)
          return
        }
        const res = await savePosMenuOption({
          menuId: Number(optionsConfigSelectedMenuId),
          name,
          priceModifier: Number(newOptionModifier) || 0,
          priceModifierDelivery: newOptionModifierDelivery !== "" ? Number(newOptionModifierDelivery) : null,
          priceModifierPackaging: newOptionModifierPackaging !== "" ? Number(newOptionModifierPackaging) : null,
          sortOrder: optionsConfigMenuOptions.length,
          optionType: "substitution",
          optionStepValues,
          sellHall: true,
          sellDelivery: true,
          sellPackaging: true,
        })
        if (res.success) {
          getPosMenuOptions({ menuId: optionsConfigSelectedMenuId }).then(setOptionsConfigMenuOptions)
          setNewOptionSize("")
          setNewOptionPart("")
          setNewOptionModifier("0")
          setNewOptionModifierDelivery("")
          setNewOptionModifierPackaging("")
        } else {
          await appAlert(res.message || t("msg_save_fail_detail"))
        }
        return
      }

      const groups = optionsConfigStepGroups
      if (groups.length === 0) {
        await appAlert(
          t("posOptionConfigNeedGroups") ||
            "아래에 옵션 선택 단계를 입력하고 [단계 저장]을 눌러 주세요. (예: side, drink)"
        )
        return
      }

      let optionStepValues: Record<string, string>
      if (isSizePartGroups(groups)) {
        if (!newOptionSize || !newOptionPart) return
        optionStepValues = { size: newOptionSize, part: newOptionPart }
      } else {
        const missing = groups.filter((g) => !(optionsConfigNewStepValues[g] ?? "").trim())
        if (missing.length > 0) {
          await appAlert(
            (t("posOptionStepValuesRequired") || "단계 값을 입력해 주세요.") + ` (${missing.join(", ")})`
          )
          return
        }
        optionStepValues = Object.fromEntries(groups.map((g) => [g, (optionsConfigNewStepValues[g] ?? "").trim()]))
      }

      const name = groups.map((g) => optionStepValues[g]).join(" - ")
      const exists = optionsConfigMenuOptions.some((o) => groups.every((g) => o.optionStepValues?.[g] === optionStepValues[g]))
      if (exists) {
        await appAlert(`${name} ${t("itemsAlertCodeExists") || "이미 있습니다."}`)
        return
      }
      const res = await savePosMenuOption({
        menuId: Number(optionsConfigSelectedMenuId),
        name,
        priceModifier: Number(newOptionModifier) || 0,
        priceModifierDelivery: newOptionModifierDelivery !== "" ? Number(newOptionModifierDelivery) : null,
        priceModifierPackaging: newOptionModifierPackaging !== "" ? Number(newOptionModifierPackaging) : null,
        sortOrder: optionsConfigMenuOptions.length,
        optionType: "substitution",
        optionStepValues,
        sellHall: true,
        sellDelivery: true,
        sellPackaging: true,
      })
      if (res.success) {
        getPosMenuOptions({ menuId: optionsConfigSelectedMenuId }).then(setOptionsConfigMenuOptions)
        setOptionsConfigNewStepValues({})
        setNewOptionModifier("0")
        setNewOptionModifierDelivery("")
        setNewOptionModifierPackaging("")
      } else {
        await appAlert(res.message || t("msg_save_fail_detail"))
      }
    } catch (e) {
      console.error("handleAddOptionForConfig:", e)
      await appAlert(e instanceof Error ? e.message : String(e))
    }
  }

  const handleAddAllOptionsForConfig = async () => {
    if (!optionsConfigSelectedMenuId || !optionsConfigSelectedMenu) return
    const isChicken = isChickenMenu(optionsConfigSelectedMenu.code)
    if (isChicken) {
      await ensureChickenMenuOptionGroups()
    } else {
      if (!isSizePartGroups(optionsConfigStepGroups)) {
        await appAlert(
          t("posOptionConfigAddAllSizePartOnly") ||
            "[전체 조합 추가]는 선택 단계가 size, part 순서일 때만 사용할 수 있습니다. (치킨은 자동)"
        )
        return
      }
    }
    const existingKeys = new Set(
      optionsConfigMenuOptions.map((o) => `${o.optionStepValues?.size ?? ""}_${o.optionStepValues?.part ?? ""}`)
    )
    const price = 0
    const combinations: { size: string; part: string; sellHall: boolean; sellDelivery: boolean; sellPackaging: boolean }[] = isChicken
      ? [
          { size: "M", part: "순살", sellHall: true, sellDelivery: true, sellPackaging: true },
          { size: "M", part: "윙", sellHall: true, sellDelivery: true, sellPackaging: true },
          { size: "M", part: "봉", sellHall: true, sellDelivery: true, sellPackaging: true },
        ]
      : OPTION_SIZE_VALUES.flatMap((size) =>
          OPTION_PART_VALUES.map((part) => ({
            size,
            part,
            sellHall: true,
            sellDelivery: true,
            sellPackaging: true,
          }))
        )
    let added = 0
    for (const { size, part, sellHall, sellDelivery, sellPackaging } of combinations) {
      if (existingKeys.has(`${size}_${part}`)) continue
      const name = `${size} - ${part}`
      const res = await savePosMenuOption({
        menuId: Number(optionsConfigSelectedMenuId),
        name,
        priceModifier: isChicken ? price : Number(newOptionModifier) || 0,
        priceModifierDelivery: isChicken ? price : newOptionModifierDelivery !== "" ? Number(newOptionModifierDelivery) : null,
        priceModifierPackaging: isChicken ? price : newOptionModifierPackaging !== "" ? Number(newOptionModifierPackaging) : null,
        sortOrder: optionsConfigMenuOptions.length + added,
        optionType: "substitution",
        optionStepValues: { size, part },
        sellHall,
        sellDelivery,
        sellPackaging,
      })
      if (res.success) {
        existingKeys.add(`${size}_${part}`)
        added++
      }
    }
    if (added > 0) {
      getPosMenuOptions({ menuId: optionsConfigSelectedMenuId }).then(setOptionsConfigMenuOptions)
    }
  }

  /** 기본가 = S 순살. 옵션으로 붙는 것은 M 순살/윙/봉 3개만 */
  const CHICKEN_OPTION_COMBOS = [
    { size: "M", part: "순살", sellHall: true, sellDelivery: true, sellPackaging: true },
    { size: "M", part: "윙", sellHall: true, sellDelivery: true, sellPackaging: true },
    { size: "M", part: "봉", sellHall: true, sellDelivery: true, sellPackaging: true },
  ] as const

  const handleChickenBatchApply = async () => {
    let list = menus
    if (list.length === 0) {
      try {
        list = await getPosMenus()
        setMenus(list || [])
      } catch (_e) {
        await appAlert(t("posChickenBatchNoMenus") || "메뉴 목록을 불러올 수 없습니다.")
        return
      }
    }
    const chickenMenus = (list || []).filter((m) => isChickenMenu(m.code))
    if (chickenMenus.length === 0) {
      await appAlert(t("posChickenBatchNoMenus") || "코드가 c로 시작하는 메뉴가 없습니다.")
      return
    }
    if (!await appConfirm((t("posChickenBatchConfirm") || "코드가 c로 시작하는 {n}개 치킨 메뉴에 옵션(M 순살/윙/봉 3개)을 일괄 적용합니다. 기본가=S 순살. 기존 옵션은 삭제됩니다. 계속하시겠습니까?").replace("{n}", String(chickenMenus.length)))) return
    setChickenBatchApplying(true)
    try {
      let done = 0
      for (const menu of chickenMenus) {
        const saveMenuRes = await savePosMenu({
          id: menu.id,
          code: menu.code,
          name: menu.name,
          category: menu.category ?? "",
          categoryMain: menu.categoryMain ?? "",
          sortOrder: menu.sortOrder ?? 0,
          price: menu.price,
          priceDelivery: menu.priceDelivery ?? null,
          imageUrl: menu.imageUrl ?? "",
          vatIncluded: menu.vatIncluded ?? true,
          isActive: menu.isActive ?? true,
          optionSelectionGroups: ["size", "part"],
        })
        if (!saveMenuRes.success) {
          throw new Error(`메뉴 ${menu.code} 저장 실패: ${saveMenuRes.message}`)
        }
        const existing = await getPosMenuOptions({ menuId: menu.id })
        for (const opt of existing || []) {
          const delRes = await deletePosMenuOption({ id: String(opt.id) })
          if (!delRes.success) {
            throw new Error(`옵션 삭제 실패: ${delRes.message}`)
          }
        }
        for (let i = 0; i < CHICKEN_OPTION_COMBOS.length; i++) {
          const { size, part, sellHall, sellDelivery, sellPackaging } = CHICKEN_OPTION_COMBOS[i]
          const optRes = await savePosMenuOption({
            menuId: Number(menu.id),
            name: `${size} - ${part}`,
            priceModifier: 0,
            priceModifierDelivery: null,
            priceModifierPackaging: null,
            sortOrder: i,
            optionType: "substitution",
            optionStepValues: { size, part },
            sellHall,
            sellDelivery,
            sellPackaging,
          })
          if (!optRes.success) {
            throw new Error(`옵션 저장 실패 (${menu.code} ${size} ${part}): ${optRes.message}`)
          }
        }
        done++
      }
      const updated = await getPosMenus()
      setMenus(updated || [])
      await appAlert((t("posChickenBatchDone") || "치킨 메뉴 {n}건에 옵션(M 순살/윙/봉)을 적용했습니다.").replace("{n}", String(done)))
      if (optionsConfigSelectedMenuId && chickenMenus.some((m) => m.id === optionsConfigSelectedMenuId)) {
        getPosMenuOptions({ menuId: optionsConfigSelectedMenuId }).then(setOptionsConfigMenuOptions)
      }
    } catch (e) {
      console.error("handleChickenBatchApply:", e)
      await appAlert(e instanceof Error ? e.message : String(e))
    } finally {
      setChickenBatchApplying(false)
    }
  }

  const handleToggleSellChannelForConfig = (opt: PosMenuOption, channel: "sellHall" | "sellDelivery" | "sellPackaging") => {
    const next = !(opt[channel] ?? true)
    setOptionsConfigMenuOptions((prev) =>
      prev.map((o) => (o.id === opt.id ? { ...o, [channel]: next } : o))
    )
  }

  const handlePriceChangeForConfig = (opt: PosMenuOption, field: "priceModifier" | "priceModifierDelivery" | "priceModifierPackaging", value: string) => {
    const num = value === "" ? NaN : Number(value)
    const v = field === "priceModifier" 
      ? (Number.isNaN(num) ? 0 : num) 
      : (Number.isNaN(num) ? null : num)
    setOptionsConfigMenuOptions((prev) =>
      prev.map((o) => (o.id === opt.id ? { ...o, [field]: v } : o))
    )
  }

  const handleSaveOptionsForConfig = async () => {
    if (!optionsConfigSelectedMenuId || optionsConfigMenuOptions.length === 0) return
    try {
      for (const o of optionsConfigMenuOptions) {
        const res = await savePosMenuOption({
          id: o.id,
          menuId: Number(o.menuId),
          name: o.name,
          priceModifier: o.priceModifier ?? 0,
          priceModifierDelivery: o.priceModifierDelivery ?? null,
          priceModifierPackaging: o.priceModifierPackaging ?? null,
          sortOrder: o.sortOrder,
          optionType: o.optionType ?? "substitution",
          itemCode: o.itemCode ?? null,
          additiveSourceMenuId: o.additiveSourceMenuId ?? null,
          quantity: o.quantity ?? 1,
          optionStepValues: o.optionStepValues ?? undefined,
          sellHall: o.sellHall ?? true,
          sellDelivery: o.sellDelivery ?? true,
          sellPackaging: o.sellPackaging ?? true,
        })
        if (!res.success) {
          await appAlert(res.message)
          return
        }
      }
      getPosMenuOptions({ menuId: optionsConfigSelectedMenuId }).then(setOptionsConfigMenuOptions)
      await appAlert(t("msg_save_success") || "저장되었습니다.")
    } catch (e) {
      console.error("handleSaveOptionsForConfig:", e)
      await appAlert(e instanceof Error ? e.message : String(e))
    }
  }

  const handleResetOptionsForConfig = async () => {
    if (!optionsConfigSelectedMenuId || optionsConfigMenuOptions.length === 0) return
    if (!await appConfirm(t("posMenuOptionsConfigResetConfirm") || "선택한 메뉴의 모든 옵션을 삭제합니다. 계속하시겠습니까?")) return
    try {
      for (const o of optionsConfigMenuOptions) {
        const res = await deletePosMenuOption({ id: o.id })
        if (!res.success) {
          await appAlert(res.message)
          return
        }
      }
      setOptionsConfigMenuOptions([])
      getPosMenuOptions({ menuId: optionsConfigSelectedMenuId }).then(setOptionsConfigMenuOptions)
      await appAlert(t("posMenuOptionsConfigResetDone") || "초기화되었습니다.")
    } catch (e) {
      console.error("handleResetOptionsForConfig:", e)
      await appAlert(e instanceof Error ? e.message : String(e))
    }
  }

  const handleDeleteOptionForConfig = async (opt: PosMenuOption) => {
    if (!await appConfirm(`"${opt.name}" ${t("posMenuConfirmDelete")}`)) return
    const res = await deletePosMenuOption({ id: opt.id })
    if (res.success) {
      setOptionsConfigMenuOptions((prev) => prev.filter((o) => o.id !== opt.id))
    } else {
      await appAlert(res.message)
    }
  }

  const handleDelete = async (menu: PosMenu) => {
    if (!await appConfirm(`"${menu.name}" ${t("posMenuConfirmDelete")}`)) return
    const res = await deletePosMenu({ id: menu.id })
    if (!res.success) {
      await appAlert(translateApiMessage(res.message, t) || t("msg_delete_fail_detail"))
      return
    }
    setMenus((prev) => prev.filter((m) => m.id !== menu.id))
    if (editingId === menu.id) {
      setFormData(emptyForm)
      setEditingId(null)
    }
    await appAlert(t("itemsAlertDeleted"))
  }

  const todayStr = new Date().toISOString().slice(0, 10)
  const handleSoldOutToggle = async (menu: PosMenu) => {
    const isSoldOut = menu.soldOutDate === todayStr
    setSoldOutTogglingId(menu.id)
    try {
      const res = await updatePosMenuSoldOut({ id: menu.id, soldOut: !isSoldOut })
      if (res.success) {
        setMenus((prev) =>
          prev.map((m) =>
            m.id === menu.id
              ? { ...m, soldOutDate: !isSoldOut ? todayStr : null }
              : m
          )
        )
      } else {
        await appAlert(res.message || t("msg_save_fail_detail"))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSoldOutTogglingId(null)
    }
  }

  const filteredMenus = React.useMemo(() => {
    const filtered = menus.filter((m) => {
      const matchTerm =
        !searchTerm ||
        m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.code.toLowerCase().includes(searchTerm.toLowerCase())
      const categoryEq =
        categoryFilter !== "all" &&
        (mainCategoryFilter === PROMOTION_MAIN_CATEGORY
          ? promotionSubcategoriesEqual(m.category, categoryFilter)
          : m.category === categoryFilter)
      const matchCategory = categoryFilter === "all" || categoryEq
      const mainEq = (m.categoryMain ?? "") === mainCategoryFilter
      const matchMainCategory = mainCategoryFilter === "all" || mainEq
      const isSoldOut = !!(m.soldOutDate && String(m.soldOutDate).trim())
      const matchSoldOut =
        soldOutFilter === "all" ||
        (soldOutFilter === "selling" && !isSoldOut) ||
        (soldOutFilter === "soldOut" && isSoldOut)
      return matchTerm && matchCategory && matchMainCategory && matchSoldOut
    })
    return sortByCode(filtered, (m) => m.code)
  }, [menus, searchTerm, categoryFilter, mainCategoryFilter, soldOutFilter])

  const optionsConfigFilteredMenus = React.useMemo(() => {
    const filtered = menus.filter((m) => {
      const matchTerm =
        !optionsConfigSearchTerm ||
        m.name.toLowerCase().includes(optionsConfigSearchTerm.toLowerCase()) ||
        m.code.toLowerCase().includes(optionsConfigSearchTerm.toLowerCase())
      const categoryEq =
        optionsConfigCategoryFilter !== "all" &&
        (mainCategoryFilter === PROMOTION_MAIN_CATEGORY
          ? promotionSubcategoriesEqual(m.category, optionsConfigCategoryFilter)
          : m.category === optionsConfigCategoryFilter)
      const matchCategory = optionsConfigCategoryFilter === "all" || categoryEq
      const mainEq = (m.categoryMain ?? "") === mainCategoryFilter
      const matchMainCategory = mainCategoryFilter === "all" || mainEq
      return matchTerm && matchCategory && matchMainCategory
    })
    return sortByCode(filtered, (m) => m.code)
  }, [menus, optionsConfigSearchTerm, optionsConfigCategoryFilter, mainCategoryFilter])

  const categories = React.useMemo(() => {
    const presetFromConfig = categoriesConfig?.categoriesByMain
      ? new Set(
          Object.values(categoriesConfig.categoriesByMain).flat().filter((c): c is string => typeof c === "string")
        )
      : new Set(POS_MAIN_CATEGORIES.flatMap((m) => POS_CATEGORIES_BY_MAIN[m as keyof typeof POS_CATEGORIES_BY_MAIN] ?? []))
    const fromMenus = new Set(menus.map((m) => m.category).filter((c): c is string => typeof c === "string" && c !== ""))
    const fromDb = new Set(allCategories)
    return Array.from(new Set([...presetFromConfig, ...fromDb, ...fromMenus]))
      .filter((c): c is string => typeof c === "string")
      .sort()
  }, [menus, allCategories, categoriesConfig])

  const mainCategories = React.useMemo(() => {
    const preset = categoriesConfig?.mainCategories?.length
      ? new Set(categoriesConfig.mainCategories.filter((c): c is string => typeof c === "string"))
      : new Set(POS_MAIN_CATEGORIES)
    const fromMenus = new Set(menus.map((m) => m.categoryMain).filter((c): c is string => typeof c === "string" && c !== ""))
    const fromDb = new Set(allMainCategories)
    return Array.from(new Set([...preset, ...fromDb, ...fromMenus]))
      .filter((c): c is string => typeof c === "string")
      .sort()
  }, [menus, allMainCategories, categoriesConfig])

  const categoriesByMain = React.useMemo(() => {
    const main = formData.categoryMain?.trim() || null
    if (!main) return categories.filter((c): c is string => typeof c === "string")
    const presetFromConfig = categoriesConfig?.categoriesByMain?.[main]
    const presetFromLib = main in POS_CATEGORIES_BY_MAIN ? POS_CATEGORIES_BY_MAIN[main as keyof typeof POS_CATEGORIES_BY_MAIN] : null
    const preset = presetFromConfig?.length ? presetFromConfig : (presetFromLib ?? [])
    const fromMenus = menus
      .filter((m) => (m.categoryMain ?? "") === main)
      .map((m) => m.category)
      .filter((c): c is string => typeof c === "string" && c !== "")
    const raw = Array.from(new Set([...preset, ...fromMenus])).filter((c): c is string => typeof c === "string")
    if (main === PROMOTION_MAIN_CATEGORY) {
      return uniqueSubcategoriesForMainMenu(main, raw)
    }
    return raw.sort()
  }, [formData.categoryMain, menus, categories, categoriesConfig])

  /** 옵션 구성 탭: 대분류 선택 시 해당 대분류에 속한 소분류만 */
  const optionsConfigCategoriesByMain = React.useMemo(() => {
    const main = mainCategoryFilter === "all" ? null : mainCategoryFilter?.trim() || null
    if (!main) return categories.filter((c): c is string => typeof c === "string")
    const presetFromConfig = categoriesConfig?.categoriesByMain?.[main]
    const presetFromLib = main in POS_CATEGORIES_BY_MAIN ? POS_CATEGORIES_BY_MAIN[main as keyof typeof POS_CATEGORIES_BY_MAIN] : null
    const preset = presetFromConfig?.length ? presetFromConfig : (presetFromLib ?? [])
    const fromMenus = menus
      .filter((m) => (m.categoryMain ?? "") === main)
      .map((m) => m.category)
      .filter((c): c is string => typeof c === "string" && c !== "")
    const raw = Array.from(new Set([...preset, ...fromMenus])).filter((c): c is string => typeof c === "string")
    if (main === PROMOTION_MAIN_CATEGORY) {
      return uniqueSubcategoriesForMainMenu(main, raw)
    }
    return raw.sort()
  }, [mainCategoryFilter, menus, categories, categoriesConfig])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <UtensilsCrossed className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">{t("posMenuMgmt")}</h1>
              <p className="text-xs text-muted-foreground">{t("posMenuMgmtSub")}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 px-3 text-xs"
            onClick={() => setCategorySettingsOpen(true)}
          >
            <FolderTree className="h-3.5 w-3.5" />
            {(t("posMenuCategorySettings") === "posMenuCategorySettings" ? "카테고리 설정" : t("posMenuCategorySettings"))}
          </Button>
        </div>

        <PosMenuCategorySettingsDialog
          open={categorySettingsOpen}
          onOpenChange={setCategorySettingsOpen}
          onSaved={async () => {
            const config = await getPosMenuCategoriesConfig()
            setCategoriesConfig(config ?? null)
          }}
        />

        {loading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}
        <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as typeof mainTab)} className={adminTabsRootCn}>
          <div className={adminTabsBarCn}>
            <div className={adminTabsScrollCn}>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="screen" className={adminTabsTriggerCn}>
                  <LayoutGrid className={adminTabsIconCn} aria-hidden />
                  {t("posMenuTabScreen")}
                </TabsTrigger>
                <TabsTrigger value="optionsConfig" className={adminTabsTriggerCn}>
                  <Layers className={adminTabsIconCn} aria-hidden />
                  {t("posMenuTabOptionsConfig")}
                </TabsTrigger>
                <TabsTrigger value="set" className={adminTabsTriggerCn}>
                  <Monitor className={adminTabsIconCn} aria-hidden />
                  {t("posMenuTabSet")}
                </TabsTrigger>
                <TabsTrigger value="setInquiry" className={adminTabsTriggerCn}>
                  <ClipboardList className={adminTabsIconCn} aria-hidden />
                  {t("posMenuTabSetInquiry")}
                </TabsTrigger>
                <TabsTrigger value="priceHistory" className={adminTabsTriggerCn}>
                  <History className={adminTabsIconCn} aria-hidden />
                  {t("posMenuTabPriceHistory") || "메뉴 가격이력"}
                </TabsTrigger>
                <TabsTrigger value="priceApply" className={adminTabsTriggerCn}>
                  <DollarSign className={adminTabsIconCn} aria-hidden />
                  {t("posMenuTabPriceApply") || "가격 적용"}
                </TabsTrigger>
                <TabsTrigger value="finalPrice" className={adminTabsTriggerCn}>
                  <Calculator className={adminTabsIconCn} aria-hidden />
                  {t("posPricingTab") || "최종가격"}
                </TabsTrigger>
              </TabsList>
            </div>
          </div>
          <TabsContent value="screen" className={adminTabsContentCn}>
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          {/* Form */}
          <div className="lg:sticky lg:top-0 lg:self-start">
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h3 className="text-sm font-bold text-card-foreground">{t("posMenuFormTitle")}</h3>
                <p className="text-[11px] text-muted-foreground">
                  {editingId ? t("itemsFormEditDesc") : t("itemsFormNewDesc")}
                </p>
              </div>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 px-3 text-[11px]" onClick={handleNewRegister}>
                <FilePlus className="h-3.5 w-3.5" />
                {t("itemsBtnNewRegister")}
              </Button>
            </div>
            <div className="flex flex-col gap-4 p-6">
              {editingMenuLinkedPromoId && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {t("posMenuPromoLinkedBanner") ||
                    "프로모션 연동 메뉴입니다. 이름·가격·분류·활성은 마케팅 > 프로모션 관리에서 수정하세요."}
                </div>
              )}
              {editingId ? (
                <>
                <Tabs value={formTab} onValueChange={(v) => setFormTab(v as typeof formTab)}>
                  <div className={adminTabsBarCn}>
                    <div className={adminTabsScrollCn}>
                      <TabsList className={adminTabsListRowCn}>
                        <TabsTrigger value="info" className={adminTabsTriggerCn}>
                          {t("posFormTabInfo") || "메뉴정보"}
                        </TabsTrigger>
                        <TabsTrigger value="options" className={adminTabsTriggerCn}>
                          {t("posFormTabOptions") || "옵션"}
                        </TabsTrigger>
                        <TabsTrigger value="cost" className={adminTabsTriggerCn}>
                          {t("posFormTabCost") || "원가"}
                        </TabsTrigger>
                      </TabsList>
                    </div>
                  </div>
                  <TabsContent value="info" className="space-y-4 mt-4">
                    <div>
                      <label className="text-xs font-semibold">{t("posMenuCode")}</label>
                      <Input placeholder="M001" className="mt-1 h-10" value={formData.code} onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value }))} disabled />
                    </div>
                    <div>
                      <label className="text-xs font-semibold">{t("posMenuName")}</label>
                      <Input
                        placeholder={t("itemsNamePh")}
                        className="mt-1 h-10"
                        value={formData.name}
                        onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                        disabled={!!editingMenuLinkedPromoId}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold">{t("posMenuCategoryMain")}</label>
                      <DropdownMenu open={categoryMainOpen} onOpenChange={setCategoryMainOpen}>
                        <div className="flex h-10 rounded-md border border-input bg-background overflow-hidden mt-1">
                          <Input
                            placeholder={t("posMenuCategoryMain")}
                            className="h-10 flex-1 rounded-r-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                            value={formData.categoryMain}
                            onChange={(e) => setFormData((p) => ({ ...p, categoryMain: e.target.value }))}
                            onFocus={() => setCategoryMainOpen(true)}
                            disabled={!!editingMenuLinkedPromoId}
                          />
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-l-none border-l">
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                        </div>
                        <DropdownMenuContent align="start" className="max-h-60 min-w-[200px]">
                          {mainCategories.map((c) => (
                            <DropdownMenuItem
                              key={c}
                              onClick={() => {
                                setFormData((p) => ({ ...p, categoryMain: c, category: "" }))
                                setCategoryMainOpen(false)
                              }}
                            >
                              {c}
                            </DropdownMenuItem>
                          ))}
                          {formData.categoryMain.trim() &&
                            !mainCategories.some((c) => c.toLowerCase() === formData.categoryMain.trim().toLowerCase()) && (
                            <DropdownMenuItem
                              onClick={() => {
                                setFormData((p) => ({ ...p, categoryMain: formData.categoryMain.trim() }))
                                setCategoryMainOpen(false)
                              }}
                              className="text-primary font-medium"
                            >
                              + {t("itemsCategoryNew") || "신규 대분류"}: {formData.categoryMain.trim()}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div>
                      <label className="text-xs font-semibold">{t("posMenuCategory")}</label>
                      <DropdownMenu open={categoryOpen} onOpenChange={setCategoryOpen}>
                        <div className="flex h-10 rounded-md border border-input bg-background overflow-hidden mt-1">
                          <Input
                            placeholder={t("itemsCategoryPh")}
                            className="h-10 flex-1 rounded-r-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                            value={formData.category}
                            onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value }))}
                            onFocus={() => setCategoryOpen(true)}
                            disabled={!!editingMenuLinkedPromoId}
                          />
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-l-none border-l">
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                        </div>
                        <DropdownMenuContent align="start" className="max-h-60 min-w-[200px]">
                          {categoriesByMain.map((c) => (
                            <DropdownMenuItem
                              key={c}
                              onClick={() => {
                                setFormData((p) => ({ ...p, category: c }))
                                setCategoryOpen(false)
                              }}
                            >
                              {translatePosMenuCategoryLabel(c, t)}
                            </DropdownMenuItem>
                          ))}
                          {formData.category.trim() &&
                            !categoriesByMain.some((c) => c.toLowerCase() === formData.category.trim().toLowerCase()) && (
                            <DropdownMenuItem
                              onClick={() => {
                                setFormData((p) => ({ ...p, category: formData.category.trim() }))
                                setCategoryOpen(false)
                              }}
                              className="text-primary font-medium"
                            >
                              + {t("itemsCategoryNew") || "신규 카테고리"}: {formData.category.trim()}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold">{t("posMenuPriceHall")}</label>
                        <Input type="number" placeholder="0" className="mt-1 h-10 text-right" value={formData.price} onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))} disabled={!!editingMenuLinkedPromoId} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold">{t("posMenuPriceDelivery")}</label>
                        <Input type="number" placeholder="홀과 동일" className="mt-1 h-10 text-right" value={formData.priceDelivery} onChange={(e) => setFormData((p) => ({ ...p, priceDelivery: e.target.value }))} disabled={!!editingMenuLinkedPromoId} />
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={formData.vatIncluded} onChange={(e) => setFormData((p) => ({ ...p, vatIncluded: e.target.checked }))} disabled={!!editingMenuLinkedPromoId} />
                        {t("posMenuVatIncluded")}
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData((p) => ({ ...p, isActive: e.target.checked }))} disabled={!!editingMenuLinkedPromoId} />
                        {t("posMenuActive")}
                      </label>
                      <label className="flex items-center gap-2 text-xs" title={t("posMenuBanbanHint") || "POS에서 다른 치킨(S 순살) 2개를 골라 한 상으로 주문. 원가는 각 0.5씩."}>
                        <input type="checkbox" checked={formData.isBanban} onChange={(e) => setFormData((p) => ({ ...p, isBanban: e.target.checked }))} disabled={!!editingMenuLinkedPromoId} />
                        {t("posMenuBanban") || "반반 메뉴 (맛 2개 선택)"}
                      </label>
                    </div>
                    <div className="rounded border border-dashed border-primary/30 bg-muted/20 p-3">
                      <h4 className="text-xs font-semibold text-muted-foreground">{t("posMenuOptions") || "옵션"}</h4>
                      {(() => {
                        const optsToShow = isChickenMenu(formData.code) ? menuOptions.filter((o) => !isChickenDefaultOption(o.name)) : menuOptions
                        return optsToShow.length > 0 ? (
                        <ul className="mt-2 space-y-1 max-h-28 overflow-y-auto">
                          {optsToShow.map((o) => (
                            <li key={o.id} className="flex items-center justify-between rounded bg-muted/50 px-2 py-1 text-xs">
                              <span>{optionPartLabel(o.name)}</span>
                              <span className="text-muted-foreground tabular-nums">
                                {(o.priceModifier ?? 0) !== 0 ? `+${o.priceModifier}` : "-"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">{t("posMenuOptionsSelectHint") || "옵션 구성 탭에서 사이즈, 부위를 추가해 주세요."}</p>
                      )
                      })()}
                      <Button variant="outline" size="sm" className="mt-2 text-xs" onClick={() => { setFormTab("options"); setMainTab("optionsConfig"); setOptionsConfigSelectedMenuId(editingId); }}>{t("posMenuTabOptionsConfig") || "옵션 구성"}</Button>
                    </div>
                  </TabsContent>
                  <TabsContent value="options" className="mt-4">
                    <div className="rounded border border-dashed p-3">
                      <h4 className="mb-2 text-xs font-semibold">{t("posMenuOptions") || "옵션 (반반, 뼈/순살 등)"}</h4>
                      <ul className="mb-2 space-y-1">
                        {(isChickenMenu(formData.code) ? menuOptions.filter((o) => !isChickenDefaultOption(o.name)) : menuOptions).map((o) => (
                          <li key={o.id} className="flex items-center justify-between rounded bg-muted/50 px-2 py-1 text-xs">
                            <span>
                              <span className={o.optionType === "additive" ? "text-amber-600" : ""}>{optionPartLabel(o.name)}</span>
                              {o.optionType === "additive" && additiveOptionLinkSuffix(o, menus) && (
                                <span className="ml-1 text-muted-foreground">+{additiveOptionLinkSuffix(o, menus)}</span>
                              )}
                              {o.optionType === "substitution" && o.optionStepValues && Object.keys(o.optionStepValues).length > 0 && (
                                <span className="ml-1 text-muted-foreground">({Object.entries(o.optionStepValues).map(([k, v]) => `${k}:${v}`).join(" / ")})</span>
                              )}
                              {(o.priceModifier ?? 0) !== 0 || (o.priceModifierDelivery ?? o.priceModifier ?? 0) !== 0
                                ? ` (홀 ${(o.priceModifier ?? 0) >= 0 ? "+" : ""}${o.priceModifier ?? 0} / 배달 ${(o.priceModifierDelivery ?? o.priceModifier ?? 0) >= 0 ? "+" : ""}${o.priceModifierDelivery ?? o.priceModifier ?? 0})` : ""}
                            </span>
                            <Button size="sm" variant="ghost" className="h-5 px-1 text-destructive hover:text-destructive" onClick={() => handleDeleteOption(o)}><Trash2 className="h-3 w-3" /></Button>
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <Input placeholder={t("posOptionNamePh") || "옵션명"} className="h-8 text-xs flex-1" value={newOptionName} onChange={(e) => setNewOptionName(e.target.value)} />
                          <Button size="sm" className="h-8 px-2 shrink-0" onClick={handleAddOption}><Plus className="h-3.5 w-3.5" /></Button>
                        </div>
                        <div className="flex gap-2 items-center">
                          <span className="text-[10px] text-muted-foreground shrink-0">{t("posOptionType") || "타입"}</span>
                          <Select value={newOptionType} onValueChange={(v) => setNewOptionType(v as "substitution" | "additive")}>
                            <SelectTrigger className="h-8 w-28 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="substitution">{t("posOptionTypeSubstitution") || "대체형"}</SelectItem>
                              <SelectItem value="additive">{t("posOptionTypeAdditive") || "추가형"}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {newOptionType === "substitution" && currentMenuGroups.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {currentMenuGroups.map((g) => (
                              <div key={g} className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground">{g}</span>
                                <Input
                                  placeholder={g}
                                  className="h-8 w-24 text-xs"
                                  value={newOptionStepValues[g] ?? ""}
                                  onChange={(e) => setNewOptionStepValues((p) => ({ ...p, [g]: e.target.value }))}
                                />
                              </div>
                            ))}
                            <p className="text-[10px] text-muted-foreground w-full">예: size=M, bone=순살</p>
                          </div>
                        )}
                        {newOptionType === "additive" && (
                          <div className="flex flex-col gap-2">
                            <div className="flex gap-2 items-center flex-wrap">
                              <Select value={newOptionSourceMenuId} onValueChange={setNewOptionSourceMenuId}>
                                <SelectTrigger className="h-8 flex-1 min-w-[120px] text-xs">
                                  <SelectValue placeholder={t("posOptionAdditiveMenu") || "연결 메뉴"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {additiveMenusForOptions.map((m) => (
                                    <SelectItem key={m.id} value={m.id}>
                                      {m.code} — {m.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input type="number" min={0.001} step={0.1} placeholder="1" className="h-8 w-16 text-right text-xs" value={newOptionQuantity} onChange={(e) => setNewOptionQuantity(e.target.value)} />
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                              {t("posAdditiveOptionMenuHint") ||
                                "추가형은 별도 등록한 POS 메뉴(메뉴코드)를 연결합니다. 해당 메뉴의 기본 재료(BOM)가 옵션 수량 배수만큼 원가·재고에 가산됩니다."}
                            </p>
                          </div>
                        )}
                        <div className="flex gap-2 text-xs">
                          <span className="shrink-0 py-2 text-muted-foreground w-16">{t("posOptionModifierHall")}</span>
                          <Input type="number" placeholder="+0" className="h-8 w-20 text-right text-xs" value={newOptionModifier} onChange={(e) => setNewOptionModifier(e.target.value)} />
                          <span className="shrink-0 py-2 text-muted-foreground w-20">{t("posOptionModifierDelivery")}</span>
                          <Input type="number" placeholder="홀과 동일" className="h-8 w-20 text-right text-xs" value={newOptionModifierDelivery} onChange={(e) => setNewOptionModifierDelivery(e.target.value)} />
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="cost" className="mt-4">
                    {(isChickenMenu(formData.code) ? menuOptions.some((o) => o.optionType === "substitution" && !isChickenDefaultOption(o.name)) : menuOptions.some((o) => o.optionType === "substitution")) && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground shrink-0">{t("posIngredientScope") || "재료 범위"}</span>
                        <Select value={selectedIngredientOptionId || "base"} onValueChange={(v) => setSelectedIngredientOptionId(v === "base" ? "" : v)}>
                          <SelectTrigger className="h-8 w-40 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="base">{isChickenMenu(formData.code) ? (t("posIngredientScopeBaseChicken") || "기본 (S 순살)") : (t("posIngredientScopeBase") || "기본 (옵션 없음)")}</SelectItem>
                            {(isChickenMenu(formData.code) ? menuOptions.filter((o) => o.optionType === "substitution" && !isChickenDefaultOption(o.name)) : menuOptions.filter((o) => o.optionType === "substitution")).map((o) => (
                              <SelectItem key={o.id} value={o.id}>{t("posIngredientScopeOption") || "옵션"}: {optionPartLabel(o.name)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="rounded border border-dashed border-amber-500/50 p-3">
                      <h4 className="mb-2 text-xs font-semibold">
                        {selectedIngredientOptionId ? `${t("posIngredientScopeOption") || "옵션"}: ${optionPartLabel(menuOptions.find((o) => o.id === selectedIngredientOptionId)?.name ?? "")}` : t("posMenuIngredients") || "재료 (BOM)"}
                      </h4>
                      <ul className="mb-2 max-h-48 overflow-y-auto space-y-1">
                        {menuIngredients.map((ing) => (
                          <li key={ing.id} className="flex items-center justify-between rounded bg-amber-500/10 px-2 py-1 text-xs">
                            <span>
                              {ing.itemCode} × {ing.quantity}{(ing.lossRate ?? 0) > 0 ? ` (로스 ${ing.lossRate}%)` : ""}
                              {ing.ingredientType === "packaging" && <span className="ml-1 text-amber-600">[포장]</span>}
                            </span>
                            <Button size="sm" variant="ghost" className="h-5 px-1 text-destructive hover:text-destructive" onClick={() => handleDeleteIngredient(ing)}><Trash2 className="h-3 w-3" /></Button>
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap gap-2">
                        <Select value={newIngredientType} onValueChange={(v) => setNewIngredientType(v as "food" | "packaging")}>
                          <SelectTrigger className="h-8 w-24 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="food">{t("posCostTypeFood") || "음식"}</SelectItem>
                            <SelectItem value="packaging">{t("posCostTypePackaging") || "포장"}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={newIngredientCode} onValueChange={setNewIngredientCode}>
                          <SelectTrigger className="h-8 flex-1 min-w-[120px] text-xs">
                            <SelectValue placeholder={t("posIngredientPh") || "재료 선택"} />
                          </SelectTrigger>
                          <SelectContent>
                            {items.map((it) => <SelectItem key={it.code} value={it.code}>{it.code} — {it.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input type="number" min={0.001} step={0.1} placeholder="1" className="h-8 w-16 text-right text-xs" value={newIngredientQty} onChange={(e) => setNewIngredientQty(e.target.value)} />
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground shrink-0">{t("posIngredientLoss") || "로스"}</span>
                          <Input type="number" min={0} max={100} step={0.5} placeholder="0" className="h-8 w-14 text-right text-xs" value={newIngredientLossRate} onChange={(e) => setNewIngredientLossRate(e.target.value)} />
                          <span className="text-[10px] text-muted-foreground">%</span>
                        </div>
                        <Button size="sm" className="h-8 px-2" onClick={handleAddIngredient}><Plus className="h-3.5 w-3.5" /></Button>
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">{t("posIngredientHint") || "판매 시 해당 재료가 자동 차감됩니다."}</p>
                    </div>
                    {menuCost != null && menuCost.breakdown.length > 0 && (
                      <div className="rounded border bg-muted/30 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="px-3 py-2 text-left font-semibold">{t("posMenuIngredients") || "재료"}</th>
                              <th className="px-3 py-2 text-right font-semibold">수량</th>
                              <th className="px-3 py-2 text-right font-semibold">{t("posIngredientLoss") || "로스"}</th>
                              <th className="px-3 py-2 text-right font-semibold">{t("posMenuCost") || "원가"}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {menuCost.breakdown.map((b) => (
                              <tr key={b.itemCode} className="border-b last:border-b-0">
                                <td className="px-3 py-2">{b.itemName}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{b.quantity}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{(b.lossRate ?? 0) > 0 ? `${b.lossRate}%` : "-"}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-medium">{b.costTotal.toFixed(1)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="flex justify-between items-center border-t bg-muted/30 px-3 py-2">
                          <span className="text-xs font-semibold">{t("posMenuCost") || "총 원가"}</span>
                          <span className="font-bold tabular-nums">{menuCost.cost.toFixed(1)}</span>
                        </div>
                        {(Number(formData.price) || 0) > 0 && (
                          <div className="flex justify-between items-center border-t px-3 py-2">
                            <span className="text-xs font-semibold">{t("posMenuCostRatio") || "원가율"}</span>
                            <span className="font-bold text-amber-600 tabular-nums">{((menuCost.cost / (Number(formData.price) || 1)) * 100).toFixed(1)}%</span>
                          </div>
                        )}
                      </div>
                    )}
                    {baseMenuCost != null && (Number(formData.price) || 0) > 0 && (
                      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                        <span className="text-xs text-muted-foreground">{t("posMenuCostRatio") || "최종 원가율"}</span>
                        <span className="ml-2 text-lg font-bold text-amber-600">
                          {((baseMenuCost / (Number(formData.price) || 1)) * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
                    <div className="flex gap-3 pt-2">
                      <Button className="flex-1" onClick={handleSave}><Save className="mr-2 h-4 w-4" />{t("itemsBtnSave")}</Button>
                      <Button variant="outline" onClick={handleReset}><RotateCcw className="mr-2 h-4 w-4" />{t("itemsBtnReset")}</Button>
                    </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-semibold">{t("posMenuCategoryMain")}</label>
                    <DropdownMenu open={categoryMainOpen} onOpenChange={setCategoryMainOpen}>
                      <div className="flex h-10 rounded-md border border-input bg-background overflow-hidden mt-1">
                        <Input
                          placeholder={t("posMenuCategoryMain")}
                          className="h-10 flex-1 rounded-r-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                          value={formData.categoryMain}
                          onChange={(e) => setFormData((p) => ({ ...p, categoryMain: e.target.value, category: "" }))}
                          onFocus={() => setCategoryMainOpen(true)}
                        />
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-l-none border-l">
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                      </div>
                      <DropdownMenuContent align="start" className="max-h-60 min-w-[200px]">
                        {mainCategories.map((c) => (
                          <DropdownMenuItem
                            key={c}
                            onClick={async () => {
                              setFormData((p) => ({ ...p, categoryMain: c, category: "" }))
                              setCategoryMainOpen(false)
                              if ((CODE_AUTO_MAINS as readonly string[]).includes(c)) {
                                const { code: next } = await getNextPosMenuCode(c)
                                if (next) setFormData((p) => ({ ...p, categoryMain: c, category: "", code: next }))
                              }
                            }}
                          >
                            {c}
                          </DropdownMenuItem>
                        ))}
                        {formData.categoryMain.trim() &&
                          !mainCategories.some((m) => m.toLowerCase() === formData.categoryMain.trim().toLowerCase()) && (
                          <DropdownMenuItem
                            onClick={() => {
                              setFormData((p) => ({ ...p, categoryMain: formData.categoryMain.trim() }))
                              setCategoryMainOpen(false)
                            }}
                            className="text-primary font-medium"
                          >
                            + {t("itemsCategoryNew") || "신규 대분류"}: {formData.categoryMain.trim()}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div>
                    <label className="text-xs font-semibold">{t("posMenuCode")}</label>
                    <Input
                      placeholder={
                        formData.categoryMain === "Topping"
                          ? "T001"
                          : formData.categoryMain === "Chicken"
                            ? "C001"
                            : "C001 / T001"
                      }
                      className="mt-1 h-10"
                      value={formData.code}
                      onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value }))}
                      disabled={(CODE_AUTO_MAINS as readonly string[]).includes(formData.categoryMain)}
                      title={(CODE_AUTO_MAINS as readonly string[]).includes(formData.categoryMain) ? (t("posMenuCodeAuto") || "대분류 선택 시 자동 생성") : undefined}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold">{t("posMenuName")}</label>
                    <Input placeholder={t("itemsNamePh")} className="mt-1 h-10" value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold">{t("posMenuCategory")}</label>
                    <DropdownMenu open={categoryOpen} onOpenChange={setCategoryOpen}>
                      <div className="flex h-10 rounded-md border border-input bg-background overflow-hidden mt-1">
                        <Input
                          placeholder={t("itemsCategoryPh")}
                          className="h-10 flex-1 rounded-r-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                          value={formData.category}
                          onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value }))}
                          onFocus={() => setCategoryOpen(true)}
                        />
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-l-none border-l">
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                      </div>
                      <DropdownMenuContent align="start" className="max-h-60 min-w-[200px]">
                        {categoriesByMain.map((c) => (
                          <DropdownMenuItem
                            key={c}
                            onClick={() => {
                              setFormData((p) => ({ ...p, category: c }))
                              setCategoryOpen(false)
                            }}
                          >
                            {translatePosMenuCategoryLabel(c, t)}
                          </DropdownMenuItem>
                        ))}
                        {formData.category.trim() &&
                          !categoriesByMain.some((c) => c.toLowerCase() === formData.category.trim().toLowerCase()) && (
                          <DropdownMenuItem
                            onClick={() => {
                              setFormData((p) => ({ ...p, category: formData.category.trim() }))
                              setCategoryOpen(false)
                            }}
                            className="text-primary font-medium"
                          >
                            + {t("itemsCategoryNew") || "신규 카테고리"}: {formData.category.trim()}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold">{t("posMenuPriceHall")}</label>
                      <Input type="number" placeholder="0" className="mt-1 h-10 text-right" value={formData.price} onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold">{t("posMenuPriceDelivery")}</label>
                      <Input type="number" placeholder="홀과 동일" className="mt-1 h-10 text-right" value={formData.priceDelivery} onChange={(e) => setFormData((p) => ({ ...p, priceDelivery: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={formData.vatIncluded} onChange={(e) => setFormData((p) => ({ ...p, vatIncluded: e.target.checked }))} />
                      {t("posMenuVatIncluded")}
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData((p) => ({ ...p, isActive: e.target.checked }))} />
                      {t("posMenuActive")}
                    </label>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button className="flex-1" onClick={handleSave}><Save className="mr-2 h-4 w-4" />{t("itemsBtnSave")}</Button>
                    <Button variant="outline" onClick={handleReset}><RotateCcw className="mr-2 h-4 w-4" />{t("itemsBtnReset")}</Button>
                  </div>
                </>
              )}
            </div>
          </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b px-6 py-4">
              <h3 className="text-sm font-bold">{t("posMenuList") || "메뉴 목록"}</h3>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <input
                  ref={menuImportInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  className="hidden"
                  onChange={handlePosMenuImportFileChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={menuImportBusy}
                  onClick={handleDownloadPosMenuTemplate}
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  {t("posMenuImportTemplate")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={menuImportBusy}
                  onClick={() => menuImportInputRef.current?.click()}
                >
                  <Upload className={cn("h-3.5 w-3.5 mr-1.5", menuImportBusy && "animate-pulse")} />
                  {menuImportBusy ? (t("loading") || "처리 중…") : t("posMenuImportUpload")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={refreshLoading}
                  onClick={() => loadMenusAndCategories(setRefreshLoading)}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", refreshLoading && "animate-spin")} />
                  {t("btn_query") || t("stockBtnSearch") || "조회"}
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-3 border-b bg-muted/20 px-6 py-3">
              <Select
                value={mainCategoryFilter}
                onValueChange={(v) => {
                  setMainCategoryFilter(v)
                  setCategoryFilter("all")
                }}
              >
                <SelectTrigger className="h-9 w-32 text-xs">
                  <SelectValue placeholder={t("posMenuCategoryMain")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("posMenuCategoryAll")}</SelectItem>
                  {mainCategories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-9 w-36 text-xs">
                  <SelectValue placeholder={t("posMenuCategorySub") || "소분류"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("posMenuCategoryAll")}</SelectItem>
                  {optionsConfigCategoriesByMain.map((c) => (
                    <SelectItem key={c} value={c}>{translatePosMenuCategoryLabel(c, t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={soldOutFilter} onValueChange={(v) => setSoldOutFilter(v as "all" | "selling" | "soldOut")}>
                <SelectTrigger className="h-9 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("posMenuCategoryAll")}</SelectItem>
                  <SelectItem value="selling">{t("posAvailable") || "판매"}</SelectItem>
                  <SelectItem value="soldOut">{t("posSoldOut") || "품절"}</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t("itemsSearchPh")}
                className="h-9 flex-1 text-xs"
              />
            </div>
            <div className="min-h-0 max-h-[calc(100vh-14rem)] overflow-x-auto overflow-y-scroll">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
                  <tr className="border-b bg-muted/30">
                    <th className="px-2 py-3 text-[11px] font-bold text-center w-8"></th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center min-w-[88px]">{t("itemsColCode")}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center min-w-[140px]">{t("posMenuName")}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-20">{t("posMenuCategoryMain")}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-24">{t("posMenuCategory")}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-24">{t("posMenuPriceCol") || "가격"}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center min-w-[112px]">{t("itemsColAction")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMenus.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                        {t("itemsNoResults")}
                      </td>
                    </tr>
                  ) : (
                    filteredMenus.map((m, idx) => {
                      const isSoldOutToday = m.soldOutDate === todayStr
                      const isExpanded = expandedMenuId === m.id
                      const expanded = isExpanded ? expandedMenuData : null
                      const expandedRows = (() => {
                        if (!isExpanded || !expanded) return null
                        const sorted = [...expanded.options].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                        const toShow = isChickenMenu(m.code) ? sorted.filter((opt) => !isChickenDefaultOption(opt.name)) : sorted
                        if (toShow.length === 0) {
                          if (isChickenMenu(m.code) && sorted.length > 0) {
                            return (
                              <tr key={`${m.id}-base`} className="bg-amber-500/5 border-b">
                                <td className="px-2 py-2 w-8" />
                                <td className="px-5 py-2 text-center min-w-[88px] font-mono text-[10px] text-muted-foreground">{m.code}</td>
                                <td className="px-5 py-2 min-w-[140px] pl-8 text-xs text-muted-foreground">{t("posIngredientScopeBaseChicken") || "기본 (S 순살)"}</td>
                                <td colSpan={4} className="px-5 py-2 text-xs text-muted-foreground">{t("posChickenBaseOnlyHint") || "메뉴 기본가에 해당. M 순살/윙/봉은 옵션 구성에서 추가."}</td>
                              </tr>
                            )
                          }
                          return null
                        }
                        return toShow.map((opt, i) => {
                          const optCode = `${m.code}-${i + 1}`
                          const optPrice = (m.price ?? 0) + (opt.priceModifier ?? 0)
                          const isOptSoldOut = !(opt.sellHall ?? true) && !(opt.sellDelivery ?? true) && !(opt.sellPackaging ?? true)
                          return (
                            <tr key={opt.id} className="bg-amber-500/5 border-b hover:bg-amber-500/10" onClick={(e) => e.stopPropagation()}>
                              <td className="px-2 py-2 w-8" />
                              <td className="px-5 py-2 text-center min-w-[88px] whitespace-nowrap">
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{optCode}</span>
                              </td>
                              <td className="px-5 py-2 min-w-[140px] pl-8">
                                <span className="text-sm">{optionPartLabel(opt.name)}</span>
                              </td>
                              <td className="px-5 py-2 text-center text-muted-foreground text-xs w-20">{m.categoryMain || "-"}</td>
                              <td className="px-5 py-2 text-center text-muted-foreground w-24">
                                {m.category ? translatePosMenuCategoryLabel(m.category, t) : "-"}
                              </td>
                              <td className="px-5 py-2 text-right font-medium tabular-nums text-xs w-24">{optPrice > 0 ? optPrice.toLocaleString() : "-"}</td>
                              <td className="px-5 py-2 w-28" onClick={(e) => e.stopPropagation()}>
                                <div className="flex justify-center gap-1">
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className={cn(
                                      "h-7 w-7",
                                      isOptSoldOut
                                        ? "text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                                        : "text-muted-foreground border-muted hover:bg-muted/50"
                                    )}
                                    onClick={() => handleSoldOutToggleOption(opt, m.id)}
                                    disabled={soldOutTogglingOptionId === String(opt.id)}
                                    title={soldOutTogglingOptionId === String(opt.id) ? "..." : isOptSoldOut ? (t("posSoldOut") || "품절") : (t("posAvailable") || "판매")}
                                  >
                                    {soldOutTogglingOptionId === String(opt.id) ? (
                                      <span className="text-[10px]">...</span>
                                    ) : isOptSoldOut ? (
                                      <PauseCircle className="h-3.5 w-3.5" />
                                    ) : (
                                      <PlayCircle className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7 text-primary border-primary/30 hover:bg-primary/10 hover:text-primary"
                                    onClick={() => handleEditOptionInList(m.id)}
                                    title={t("itemsBtnEdit")}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() => handleDeleteOptionInList(opt, m.id)}
                                    title={t("itemsBtnDelete")}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      })()
                      return (
                      <React.Fragment key={m.id}>
                      <tr
                        className={cn(
                          "border-b hover:bg-muted/20 cursor-pointer",
                          idx % 2 === 1 && "bg-muted/5"
                        )}
                        onClick={() => handleExpandMenu(m.id)}
                      >
                        <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleExpandMenu(m.id)}>
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </Button>
                        </td>
                        <td className="px-5 py-3 text-center min-w-[88px] whitespace-nowrap">
                          <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                            {m.code}
                          </span>
                        </td>
                        <td className="px-5 py-3">{m.name}</td>
                        <td className="px-5 py-3 text-center text-muted-foreground text-xs">{m.categoryMain || "-"}</td>
                        <td className="px-5 py-3 text-center text-muted-foreground">
                          {m.category ? translatePosMenuCategoryLabel(m.category, t) : "-"}
                        </td>
                        <td className="px-5 py-3 text-right font-bold tabular-nums text-xs">
                          {m.price > 0 ? m.price.toLocaleString() : "-"}
                        </td>
                        <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className={cn(
                                "h-7 w-7",
                                isSoldOutToday
                                  ? "text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                                  : "text-muted-foreground border-muted hover:bg-muted/50"
                              )}
                              onClick={() => handleSoldOutToggle(m)}
                              disabled={soldOutTogglingId === m.id || !m.isActive}
                              title={soldOutTogglingId === m.id ? "..." : isSoldOutToday ? (t("posSoldOut") || "품절") : (t("posAvailable") || "판매")}
                            >
                              {soldOutTogglingId === m.id ? (
                                <span className="text-[10px]">...</span>
                              ) : isSoldOutToday ? (
                                <PauseCircle className="h-3.5 w-3.5" />
                              ) : (
                                <PlayCircle className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 text-primary border-primary/30 hover:bg-primary/10 hover:text-primary"
                              onClick={() => handleEdit(m)}
                              title={t("itemsBtnEdit")}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => handleDelete(m)}
                              title={t("itemsBtnDelete")}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expandedRows}
                      </React.Fragment>
                    )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
          </TabsContent>
          <TabsContent value="optionsConfig" className={adminTabsContentCn}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{t("posChickenBatchHint") || "코드가 c로 시작하는 메뉴(치킨)에 S/M·부위 옵션을 한 번에 적용할 수 있습니다."}</p>
              <Button variant="outline" size="sm" onClick={handleChickenBatchApply} disabled={chickenBatchApplying}>
                {chickenBatchApplying ? (t("loading") || "적용 중...") : (t("posChickenBatchButton") || "치킨 메뉴 일괄 옵션 적용")}
              </Button>
            </div>
            <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
              {/* 좌측: 메뉴 리스트 */}
              <div className="lg:sticky lg:top-0 lg:self-start">
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="border-b px-4 py-3 bg-muted/20 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold">{t("posMenuList")}</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{t("posMenuOptionsConfigSelectHint") || "메뉴를 선택하면 옵션을 구성할 수 있습니다"}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs shrink-0"
                    disabled={optionsConfigListLoading}
                    onClick={async () => {
                      await loadMenusAndCategories(setOptionsConfigListLoading)
                      if (optionsConfigSelectedMenuId) {
                        const opts = await getPosMenuOptions({ menuId: optionsConfigSelectedMenuId })
                        setOptionsConfigMenuOptions(Array.isArray(opts) ? opts : [])
                      }
                    }}
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", optionsConfigListLoading && "animate-spin")} />
                    {t("btn_query") || "조회"}
                  </Button>
                </div>
                <div className="p-3 space-y-2 border-b">
                  <Select
                    value={mainCategoryFilter}
                    onValueChange={(v) => {
                      setMainCategoryFilter(v)
                      setOptionsConfigCategoryFilter("all")
                    }}
                  >
                    <SelectTrigger className="h-9 w-full text-xs">
                      <SelectValue placeholder={t("posMenuCategoryMain")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("posMenuCategoryAll")}</SelectItem>
                      {mainCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={optionsConfigCategoryFilter} onValueChange={setOptionsConfigCategoryFilter}>
                    <SelectTrigger className="h-9 w-full text-xs">
                      <SelectValue placeholder={t("posMenuCategorySub") || "소분류"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("posMenuCategoryAll")}</SelectItem>
                      {optionsConfigCategoriesByMain.map((c) => (
                        <SelectItem key={c} value={c}>{translatePosMenuCategoryLabel(c, t)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={optionsConfigSearchTerm}
                    onChange={(e) => setOptionsConfigSearchTerm(e.target.value)}
                    placeholder={t("itemsSearchPh")}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="max-h-[400px] overflow-y-auto p-2">
                  {optionsConfigFilteredMenus.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">{t("itemsNoResults")}</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {optionsConfigFilteredMenus.map((m) => {
                        const isSelected = optionsConfigSelectedMenuId === m.id
                        const optCount = isSelected ? optionsConfigMenuOptions.length : null
                        return (
                          <li key={m.id}>
                            <button
                              type="button"
                              className={cn(
                                "w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors",
                                isSelected ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted/60"
                              )}
                              onClick={() => setOptionsConfigSelectedMenuId(m.id)}
                            >
                              <span className="font-medium">{m.code}</span>
                              <span className="text-muted-foreground ml-1">—</span>
                              <span className={isSelected ? "text-primary-foreground/90" : ""}>{m.name}</span>
                              {optCount != null && optCount > 0 && (
                                <span className={cn("ml-1.5", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>({optCount})</span>
                              )}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </div>
              </div>
              {/* 우측: 옵션 설정 패널 */}
              <div className="rounded-xl border bg-card overflow-hidden">
                {!optionsConfigSelectedMenuId ? (
                  <div className="p-12 text-center">
                    <p className="text-sm text-muted-foreground">{t("posMenuOptionsConfigNoSelect") || "왼쪽에서 메뉴를 선택해 주세요"}</p>
                  </div>
                ) : (
                  <div className="p-6">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-bold">{optionsConfigSelectedMenu?.name} ({optionsConfigSelectedMenu?.code})</h3>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {optionsConfigUseSizePartUi
                            ? `1. ${t("posOptionGroupSize")} (S, M, L) → 2. ${t("posOptionGroupPart")} (${t("posOptionPartBoneless")}, ${t("posOptionPartWing")}, ${t("posOptionPartDrumstick")})`
                            : optionsConfigStepGroups.length > 0
                              ? (t("posOptionConfigCurrentSteps") || "저장된 선택 단계") +
                                ": " +
                                optionsConfigStepGroups.join(" → ") +
                                " · " +
                                (t("posOptionConfigNonChickenStepHint") || "각 칸에 원하는 문구를 직접 입력하세요 (한글·영문 가능).")
                              : t("posOptionConfigNoStepsYet") || "선택 단계가 없습니다. 아래에 입력 후 [단계 저장] 하세요."}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleResetOptionsForConfig} disabled={optionsConfigMenuOptions.length === 0}><RotateCcw className="h-3.5 w-3.5 mr-1" />{t("posMenuOptionsConfigReset") || "초기화"}</Button>
                        <Button size="sm" className="h-8 text-xs" onClick={handleSaveOptionsForConfig} disabled={optionsConfigMenuOptions.length === 0}><Save className="h-3.5 w-3.5 mr-1" />{t("save") || "저장"}</Button>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <p className="text-[11px] text-muted-foreground">
                        {t("posOptionResetHint") || "기존 옵션을 지우고 새로 적용하려면 먼저 [초기화]를 누른 뒤 옵션을 추가하세요."}
                      </p>
                      <div className="rounded border p-3 bg-muted/30 space-y-2">
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="min-w-[200px] flex-1">
                            <label className="text-xs font-medium block mb-0.5">{t("posOptionSelectionGroups") || "옵션 선택 단계"}</label>
                            <Input
                              className="h-8 text-xs"
                              placeholder={t("posOptionSelectionGroupsHint") || "예: size, part 또는 side, drink"}
                              value={optionsConfigGroupsDraft}
                              onChange={(e) => setOptionsConfigGroupsDraft(e.target.value)}
                              disabled={!!optionsConfigSelectedMenu?.promoId?.trim()}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-8 text-xs"
                            disabled={optionsConfigApplyingGroups || !!optionsConfigSelectedMenu?.promoId?.trim()}
                            onClick={() => handleApplyOptionGroupsForConfig()}
                          >
                            {optionsConfigApplyingGroups ? (t("loading") || "…") : (t("posOptionConfigApplySteps") || "단계 저장")}
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px]"
                            disabled={
                              optionsConfigApplyingGroups ||
                              !!optionsConfigSelectedMenu?.promoId?.trim() ||
                              !optionsConfigSelectedMenu ||
                              !isChickenMenu(optionsConfigSelectedMenu.code)
                            }
                            onClick={() => void handleApplyOptionPresetAndSave(["size", "part"])}
                          >
                            {t("posOptionConfigPresetChicken") || "프리셋: size, part (치킨)"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px]"
                            disabled={optionsConfigApplyingGroups || !!optionsConfigSelectedMenu?.promoId?.trim()}
                            onClick={() => void handleApplyOptionPresetAndSave(["side", "drink"])}
                          >
                            {t("posOptionConfigPresetSet") || "세트: side + drink (저장까지)"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px]"
                            disabled={optionsConfigApplyingGroups || !!optionsConfigSelectedMenu?.promoId?.trim()}
                            onClick={() => void handleApplyOptionPresetAndSave(["set_main", "side", "drink"])}
                          >
                            {t("posOptionConfigPresetSet3") || "세트 3단: 메인+사이드+음료 (저장까지)"}
                          </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {t("posOptionConfigStepsSaveHint") ||
                            "프리셋은 단계를 DB에 바로 저장합니다. 수동 입력은 쉼표·줄바꿈으로 구분 후 [단계 저장]을 누르세요. 그다음 아래에서 조합을 추가합니다."}
                        </p>
                      </div>
                      <div className="rounded border p-3 bg-muted/20">
                        <div className="flex flex-wrap gap-2 items-end">
                          {optionsConfigUseSizePartUi ? (
                            <>
                              <div>
                                <label className="text-xs font-medium block mb-0.5">1. {t("posOptionGroupSize")}</label>
                                <Select value={newOptionSize || "_"} onValueChange={(v) => setNewOptionSize(v === "_" ? "" : v)}>
                                  <SelectTrigger className="h-8 w-20 text-xs">
                                    <SelectValue placeholder="S/M/L" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="_">{t("posMenuCategoryAll") || "선택"}</SelectItem>
                                    {OPTION_SIZE_VALUES.map((v) => (
                                      <SelectItem key={v} value={v}>
                                        {v}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <label className="text-xs font-medium block mb-0.5">2. {t("posOptionGroupPart")}</label>
                                <Select value={newOptionPart || "_"} onValueChange={(v) => setNewOptionPart(v === "_" ? "" : v)}>
                                  <SelectTrigger className="h-8 w-24 text-xs">
                                    <SelectValue placeholder={t("posOptionPartPlaceholder") || "순살/윙/봉"} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="_">{t("posMenuCategoryAll") || "선택"}</SelectItem>
                                    {OPTION_PART_VALUES.map((v) => (
                                      <SelectItem key={v} value={v}>
                                        {v === "순살" ? t("posOptionPartBoneless") : v === "윙" ? t("posOptionPartWing") : t("posOptionPartDrumstick")}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </>
                          ) : optionsConfigStepGroups.length > 0 ? (
                            <div className="flex flex-wrap gap-2 items-end w-full">
                              {optionsConfigStepGroups.map((g) => (
                                <div key={g}>
                                  <label className="text-xs font-medium block mb-0.5">{g}</label>
                                  <Input
                                    className="h-8 w-28 text-xs"
                                    placeholder={g}
                                    value={optionsConfigNewStepValues[g] ?? ""}
                                    onChange={(e) => setOptionsConfigNewStepValues((p) => ({ ...p, [g]: e.target.value }))}
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground py-1">{t("posOptionConfigNeedGroupsShort") || "먼저 위에서 선택 단계를 저장하세요."}</p>
                          )}
                          <div className="flex flex-wrap gap-2 items-end">
                            <div className="flex gap-2">
                              <div>
                                <div className="text-xs font-medium mb-0.5">{t("posOptionSellHall")}</div>
                                <Input type="number" placeholder="0" className="h-8 w-24 text-right text-xs" value={newOptionModifier} onChange={(e) => setNewOptionModifier(e.target.value)} />
                              </div>
                              <div>
                                <div className="text-xs font-medium mb-0.5">{t("posOptionSellPackaging")}</div>
                                <Input type="number" placeholder="-" className="h-8 w-24 text-right text-xs" value={newOptionModifierPackaging} onChange={(e) => setNewOptionModifierPackaging(e.target.value)} />
                              </div>
                              <div>
                                <div className="text-xs font-medium mb-0.5">{t("posOptionSellDelivery")}</div>
                                <Input type="number" placeholder="-" className="h-8 w-24 text-right text-xs" value={newOptionModifierDelivery} onChange={(e) => setNewOptionModifierDelivery(e.target.value)} />
                              </div>
                            </div>
                            <Button
                              size="sm"
                              className="h-8 px-3"
                              onClick={handleAddOptionForConfig}
                              disabled={
                                optionsConfigUseSizePartUi
                                  ? !newOptionSize || !newOptionPart
                                  : optionsConfigStepGroups.length === 0 ||
                                    optionsConfigStepGroups.some((g) => !(optionsConfigNewStepValues[g] ?? "").trim())
                              }
                              type="button"
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" />
                            </Button>
                            <Button variant="outline" size="sm" className="h-8" onClick={handleResetOptionsForConfig} disabled={optionsConfigMenuOptions.length === 0} title={t("posMenuOptionsConfigReset") || "초기화"}>
                              <RotateCcw className="h-3.5 w-3.5 mr-1" />
                              {t("posMenuOptionsConfigReset") || "초기화"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8"
                              onClick={handleAddAllOptionsForConfig}
                              disabled={
                                !optionsConfigSelectedMenu ||
                                (!isChickenMenu(optionsConfigSelectedMenu.code) && !isSizePartGroups(optionsConfigStepGroups))
                              }
                              title={
                                !optionsConfigSelectedMenu ||
                                (!isChickenMenu(optionsConfigSelectedMenu.code) && !isSizePartGroups(optionsConfigStepGroups))
                                  ? (t("posOptionConfigAddAllSizePartOnly") || "size, part 단계일 때만 사용")
                                  : undefined
                              }
                            >
                              {optionsConfigSelectedMenu && isChickenMenu(optionsConfigSelectedMenu.code)
                                ? (t("posOptionAddAllChicken") || "치킨 옵션 추가 (M 순살/윙/봉 3개)")
                                : t("posOptionAddAll")}
                            </Button>
                          </div>
                        </div>
                      </div>
                      {optionsConfigSelectedMenu && !isChickenMenu(optionsConfigSelectedMenu.code) && optionsConfigStepGroups.length === 0 ? (
                        <div className="rounded border p-3 bg-muted/15 space-y-2">
                          <p className="text-xs font-medium">{t("posOptionDirectAddSection") || "옵션명 직접 추가 (단계 없음)"}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {t("posOptionDirectAddHint") ||
                              "세트처럼 단계 선택이 필요 없을 때 한 줄 옵션만 씁니다. 사이드+음료 세트는 위에서 세트 프리셋으로 단계를 만든 뒤 조합을 추가하세요."}
                          </p>
                          <div className="flex flex-wrap items-end gap-2">
                            <div className="min-w-[180px] flex-1">
                              <Input
                                className="h-8 text-xs"
                                placeholder={t("posOptionDirectAddPlaceholder") || "예: 라지 음료로 변경"}
                                value={optionsConfigCustomOptionName}
                                onChange={(e) => setOptionsConfigCustomOptionName(e.target.value)}
                                disabled={!!optionsConfigSelectedMenu?.promoId?.trim()}
                              />
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => void handleAddFlatOptionForConfig()}
                              disabled={!!optionsConfigSelectedMenu?.promoId?.trim()}
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              {t("posOptionDirectAddButton") || "한 줄 옵션 추가"}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      {/* 옵션 목록: 각 행에 홀/배달/포장 체크박스. 치킨은 S 순살(기본) 제외하고 M 순살/윙/봉만 표시 */}
                      <div className="rounded border p-3">
                        <h4 className="mb-2 text-xs font-semibold">{t("posMenuOptions") || "옵션 목록"}</h4>
                        <div className="max-h-60 overflow-y-auto">
                          {(() => {
                            const optionsToShow = optionsConfigSelectedMenu && isChickenMenu(optionsConfigSelectedMenu.code)
                              ? optionsConfigMenuOptions.filter((o) => !isChickenDefaultOption(o.name))
                              : optionsConfigMenuOptions
                            if (optionsToShow.length === 0) {
                              return <p className="py-6 text-center text-xs text-muted-foreground">{optionsConfigMenuOptions.length === 0 ? (t("posOptionsConfigEmptyOptions") || "위에서 옵션을 추가해 주세요.") : (t("posChickenBaseOnlyHint") || "치킨은 기본(S 순살)만 있습니다. M 순살/윙/봉은 \"치킨 옵션 추가\"로 넣으세요.")}</p>
                            }
                            return (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b text-muted-foreground">
                                  <th className="text-left py-2 px-2 font-medium">{t("posOptionsConfigOptionCol") || "옵션"}</th>
                                  <th className="text-center py-2 px-2 w-20">{t("posOptionSellHall")}</th>
                                  <th className="text-center py-2 px-2 w-20">{t("posOptionSellDelivery")}</th>
                                  <th className="text-center py-2 px-2 w-20">{t("posOptionSellPackaging")}</th>
                                  <th className="text-right py-2 px-2 w-24 text-xs font-medium">{t("posOptionSellHall")}</th>
                                  <th className="text-right py-2 px-2 w-24 text-xs font-medium">{t("posOptionSellPackaging")}</th>
                                  <th className="text-right py-2 px-2 w-24 text-xs font-medium">{t("posOptionSellDelivery")}</th>
                                  <th className="w-8"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {optionsToShow.map((o) => (
                                  <tr key={o.id} className="border-b last:border-b-0">
                                    <td className="py-2 px-2 font-medium">{optionPartLabel(o.name)}</td>
                                    <td className="py-2 px-2 text-center">
                                      <Checkbox checked={o.sellHall !== false} onCheckedChange={() => handleToggleSellChannelForConfig(o, "sellHall")} />
                                    </td>
                                    <td className="py-2 px-2 text-center">
                                      <Checkbox checked={o.sellDelivery !== false} onCheckedChange={() => handleToggleSellChannelForConfig(o, "sellDelivery")} />
                                    </td>
                                    <td className="py-2 px-2 text-center">
                                      <Checkbox checked={o.sellPackaging !== false} onCheckedChange={() => handleToggleSellChannelForConfig(o, "sellPackaging")} />
                                    </td>
                                    <td className="py-2 px-2">
                                      <Input type="number" className="h-7 w-24 text-right text-xs tabular-nums" value={o.priceModifier != null ? o.priceModifier : ""} onChange={(e) => handlePriceChangeForConfig(o, "priceModifier", e.target.value)} placeholder="0" />
                                    </td>
                                    <td className="py-2 px-2">
                                      <Input type="number" className="h-7 w-24 text-right text-xs tabular-nums" value={o.priceModifierPackaging ?? ""} onChange={(e) => handlePriceChangeForConfig(o, "priceModifierPackaging", e.target.value)} placeholder="-" />
                                    </td>
                                    <td className="py-2 px-2">
                                      <Input type="number" className="h-7 w-24 text-right text-xs tabular-nums" value={o.priceModifierDelivery ?? ""} onChange={(e) => handlePriceChangeForConfig(o, "priceModifierDelivery", e.target.value)} placeholder="-" />
                                    </td>
                                    <td className="py-2 px-2">
                                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => handleDeleteOptionForConfig(o)}><Trash2 className="h-3 w-3" /></Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            )
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="set" className={adminTabsContentCn}>
            {(setTabPromosLoading || loading) && menus.length === 0 ? (
              <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">{t("loading")}</div>
            ) : (
              <PosSetMenuTabWorkspace
                menus={menus}
                mainCategories={mainCategories}
                categoriesConfig={categoriesConfig}
                optionPartLabel={optionPartLabel}
                promos={promoListForSetTab}
                promosLoading={setTabPromosLoading}
                schemaOk={schemaStatus == null ? null : schemaStatus.ok}
                schemaBannerDismissed={setTabSchemaDismissed}
                onDismissSchemaBanner={() => {
                  try {
                    localStorage.setItem("admin_pos_menu_set_schema_banner_dismiss", "1")
                  } catch {
                    /* ignore */
                  }
                  setSetTabSchemaDismissed(true)
                }}
                onAfterSave={refreshSetTabAfterSave}
                focusPromoId={setTabFocusPromoId}
                onFocusPromoConsumed={handleSetTabFocusConsumed}
              />
            )}
          </TabsContent>
          <TabsContent value="setInquiry" className={adminTabsContentCn}>
            <div className="rounded-xl border border-border/80 bg-card p-4 sm:p-6">
              <PosSetMenuInquiryTab
                promos={promoListForSetTab}
                promosLoading={setTabPromosLoading}
                onRefresh={refreshSetTabAfterSave}
                onOpenInSetTab={(id) => {
                  setSetTabFocusPromoId(id)
                  setMainTab("set")
                }}
              />
            </div>
          </TabsContent>
          <TabsContent value="priceHistory" className={adminTabsContentCn}>
            <div className="rounded-xl border bg-card p-6">
              <PriceHistoryTab entityTypes={["pos_menu", "pos_menu_option"]} mode="menu" />
            </div>
          </TabsContent>
          <TabsContent value="priceApply" className={adminTabsContentCn}>
            <div className="rounded-xl border bg-card p-6 space-y-4">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                {t("posMenuTabPriceApply") || "가격 적용"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t("posMenuTabPriceApplyDesc") || "POS에서는 주문 유형에 따라 아래와 같이 메뉴 관리의 가격이 자동 적용됩니다."}
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{t("posOrderTypeDineIn") || "매장"}</p>
                  <p className="text-sm font-medium">{t("posMenuPriceApplyHall") || "홀 가격 적용"}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{t("posOrderTypeTakeout") || "포장"}</p>
                  <p className="text-sm font-medium">{t("posMenuPriceApplyHall") || "홀 가격 적용"}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{t("posOrderTypeDelivery") || "배달"}</p>
                  <p className="text-sm font-medium">{t("posMenuPriceApplyDelivery") || "배달앱 가격 적용"}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("posMenuPriceApplyHint") || "메뉴 정보 탭에서 홀·배달앱 가격을 각각 설정할 수 있습니다. 배달앱 가격이 없으면 홀 가격이 적용됩니다."}
              </p>
            </div>
          </TabsContent>
          <TabsContent value="finalPrice" className={adminTabsContentCn}>
            <div className="rounded-xl border bg-card p-6 space-y-4 max-w-2xl">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Calculator className="h-4 w-4 text-primary" />
                {t("posPricingTab") || "최종가격"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t("posPricingTabMenuHint") ||
                  "매장별 부가세·서비스·카드비 등 결제 시 최종 금액에 반영되는 비율 옵션입니다."}
              </p>
              {canSearchAllStores && (
                <div className="flex flex-wrap items-center gap-3">
                  <Select value={pricingStoreCode} onValueChange={setPricingStoreCode}>
                    <SelectTrigger className="h-10 w-40">
                      <SelectValue placeholder={t("store") || "매장"} />
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
              <PosStoreFinalPriceSettings storeCode={effectivePricingStore} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
