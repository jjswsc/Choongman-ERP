"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { UtensilsCrossed, FilePlus, Save, RotateCcw, RefreshCw, Pencil, Trash2, Plus, ChevronDown, ChevronRight, LayoutGrid, Layers, Monitor, PauseCircle, PlayCircle, FolderTree, History, Calculator, ClipboardList, Download, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
  getPosDeliveryAppPolicies,
  getNextPosMenuCode,
  savePosDeliveryAppPolicies,
  type PosMenuCategoriesConfig,
  type DeliveryAppCode,
  type PosDeliveryAppPolicy,
  type PosDeliveryMenuPolicy,
  getPosMenuOptions,
  getPosOptionGroups,
  getPosMenuIngredients,
  getPosMenuPackagingChecklist,
  getMenuCost,
  getAdminItems,
  savePosMenu,
  savePosMenuPackagingChecklist,
  savePosMenuOption,
  savePosMenuOptionsBulk,
  savePosOptionGroup,
  savePosMenuOptionGroupLinks,
  savePosMenuIngredient,
  deletePosMenu,
  deletePosMenuOption,
  deletePosOptionGroup,
  deletePosMenuIngredient,
  updatePosMenuSoldOut,
  getPosPromos,
  getPosPromoSchemaStatus,
  importPosMenus,
  POS_MENU_UPLOAD_TOO_LARGE,
  refreshPosMenusCatalogCache,
  uploadPosMenuImage,
  useStoreList,
  type PosMenu,
  type PosOptionSelectionGroupConfig,
  type PosMenuPackagingCheckItem,
  type PosMenuOption,
  type PosOptionGroup,
  type PosOptionGroupItem,
  type PosPackagingChecklistOrderType,
  type PosMenuIngredient,
  type PosPromo,
} from "@/lib/api-client"
import { preparePosMenuImageFileForUpload } from "@/lib/pos-menu-image-compress"
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
import { PriceScheduleTab } from "@/components/erp/price-schedule-tab"
import { OptionsConfigShell } from "@/components/erp/options-config-shell"
import { OptionGroupListPanel } from "@/components/erp/option-group-list-panel"
import { OptionGroupEditorPanel } from "@/components/erp/option-group-editor-panel"
import { OptionItemRowCard } from "@/components/erp/option-item-row-card"
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
import { translatePosMenuLineForReceipt } from "@/lib/pos-print-translate"
import { sortByCode } from "@/lib/sort-utils"

/** 코드 자동 생성 대상 대분류 (C/K/S/D/T 접두사) */
const CODE_AUTO_MAINS = ["Chicken", "Korean", "Side", "Drinks", "Topping"] as const

/** 옵션관리 탭: 고정 2단계 — 1. 사이즈, 2. 부위 */
const OPTION_SIZE_VALUES = ["S", "M", "L"]
const OPTION_PART_VALUES = ["Boneless", "Wing", "Drumette"] as const
/** 치킨 메뉴: 코드가 c로 시작. 기본가=S 순살, 옵션은 M 순살/윙/봉 3개만 */
const CHICKEN_CODE_PREFIX = "c"
function isChickenMenu(code: string | undefined): boolean {
  return !!code?.trim().toLowerCase().startsWith(CHICKEN_CODE_PREFIX)
}
/** 치킨 기본 옵션(S 순살): 메뉴 관리 옵션 목록에서 제외하고, 기본 행 하나로만 표시 */
function isChickenDefaultOption(name: string | undefined): boolean {
  if (!name?.trim()) return false
  const n = name.trim()
  return (
    /^S\s*[-]?\s*순살\s*$/i.test(n) ||
    /^S\s*[-]?\s*boneless\s*$/i.test(n) ||
    n === "S 순살" ||
    n === "S - 순살" ||
    n === "S-순살" ||
    n === "S Boneless" ||
    n === "S - Boneless" ||
    n === "S-Boneless"
  )
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

function normalizeOptionSelectionConfig(
  groups: string[],
  existing?: PosOptionSelectionGroupConfig[]
): PosOptionSelectionGroupConfig[] {
  const byKey = new Map<string, PosOptionSelectionGroupConfig>()
  for (const row of existing || []) {
    const key = String(row?.key ?? "").trim()
    if (!key) continue
    byKey.set(key, row)
  }
  return groups.map((key) => {
    const prev = byKey.get(key)
    const required = prev?.required !== false
    const audience =
      prev?.audience === "delivery" || prev?.audience === "hall" ? prev.audience : "all"
    return {
      key,
      label: String(prev?.label ?? key).trim() || key,
      audience,
      required,
      minSelect: required ? 1 : 0,
      maxSelect: 1,
    }
  })
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
  descriptionDefault: "",
  descriptionDelivery: "",
  descriptionTable: "",
  vatIncluded: true,
  isActive: true,
  isBanban: false,
}

type PackagingChecklistDraftRow = {
  localId: string
  optionId: string
  orderType: PosPackagingChecklistOrderType
  itemName: string
  isRequired: boolean
  sortOrder: number
  isActive: boolean
}

function newPackagingChecklistRow(sortOrder: number): PackagingChecklistDraftRow {
  return {
    localId: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    optionId: "",
    orderType: "both",
    itemName: "",
    isRequired: true,
    sortOrder,
    isActive: true,
  }
}

export default function PosMenusPage() {
  const { auth } = useAuth()
  const { stores } = useStoreList()
  const { lang } = useLang()
  const t = useT(lang)
  /** 옵션 부위명(순살/윙/봉) — POS/영수증과 동일 규칙(미번역·폴백 t 시에도 언어 사전 적용) */
  const optionPartLabel = (name: string) => translatePosMenuLineForReceipt(name, t)
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
  const [selectedOptionDescId, setSelectedOptionDescId] = React.useState("")
  const [optionDescDefaultDraft, setOptionDescDefaultDraft] = React.useState("")
  const [optionDescDeliveryDraft, setOptionDescDeliveryDraft] = React.useState("")
  const [optionDescTableDraft, setOptionDescTableDraft] = React.useState("")
  const [menuIngredients, setMenuIngredients] = React.useState<PosMenuIngredient[]>([])
  const [items, setItems] = React.useState<{ code: string; name: string; category: string }[]>([])
  const [newOptionName, setNewOptionName] = React.useState("")
  const [newOptionModifier, setNewOptionModifier] = React.useState("0")
  const [newOptionModifierDelivery, setNewOptionModifierDelivery] = React.useState("")
  const [newOptionChannelScope, setNewOptionChannelScope] = React.useState<"all" | "hall" | "delivery" | "packaging">("all")
  const [newOptionDescriptionDefault, setNewOptionDescriptionDefault] = React.useState("")
  const [newOptionDescriptionDelivery, setNewOptionDescriptionDelivery] = React.useState("")
  const [newOptionDescriptionTable, setNewOptionDescriptionTable] = React.useState("")
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
  const [packagingChecklistRows, setPackagingChecklistRows] = React.useState<PackagingChecklistDraftRow[]>([])
  const [packagingChecklistLoading, setPackagingChecklistLoading] = React.useState(false)
  const [packagingChecklistSaving, setPackagingChecklistSaving] = React.useState(false)
  const [formTab, setFormTab] = React.useState<"info" | "options" | "cost" | "description" | "packagingChecklist">("info")
  const [mainTab, setMainTab] = React.useState<
    "screen" | "optionsConfig" | "set" | "setInquiry" | "priceHistory" | "finalPrice" | "deliveryOps"
  >("screen")
  const [priceManageTab, setPriceManageTab] = React.useState<"history" | "schedule">("history")
  const [pricingStoreCode, setPricingStoreCode] = React.useState("")
  const canSearchAllStores = isOfficeRole(auth?.role || "")
  const effectivePricingStore = canSearchAllStores && pricingStoreCode ? pricingStoreCode : auth?.store || ""
  const [optionsConfigSelectedMenuId, setOptionsConfigSelectedMenuId] = React.useState<string | null>(null)
  const [optionsConfigMenuOptions, setOptionsConfigMenuOptions] = React.useState<PosMenuOption[]>([])
  const [optionsConfigOriginalOptions, setOptionsConfigOriginalOptions] = React.useState<PosMenuOption[]>([])
  const [optionsConfigSaving, setOptionsConfigSaving] = React.useState(false)
  const [optionsConfigSelectedGroupKey, setOptionsConfigSelectedGroupKey] = React.useState<string>("")
  const [newOptionStepValues, setNewOptionStepValues] = React.useState<Record<string, string>>({})
  const [optionsConfigSearchTerm, setOptionsConfigSearchTerm] = React.useState("")
  const [optionsConfigCategoryFilter, setOptionsConfigCategoryFilter] = React.useState("all")
  const [categoriesConfig, setCategoriesConfig] = React.useState<PosMenuCategoriesConfig | null>(null)
  const [categorySettingsOpen, setCategorySettingsOpen] = React.useState(false)
  const [categoryMainOpen, setCategoryMainOpen] = React.useState(false)
  const [categoryOpen, setCategoryOpen] = React.useState(false)
  const [newOptionSize, setNewOptionSize] = React.useState("")
  const [newOptionPart, setNewOptionPart] = React.useState("")
  const [chickenBatchApplying, setChickenBatchApplying] = React.useState(false)
  /** 옵션 구성 탭: 메뉴의 선택 단계(저장 전 편집) */
  const [optionsConfigGroupsDraft, setOptionsConfigGroupsDraft] = React.useState("")
  const [optionsConfigGroupRulesDraft, setOptionsConfigGroupRulesDraft] = React.useState<PosOptionSelectionGroupConfig[]>([])
  const [optionsConfigNewStepValues, setOptionsConfigNewStepValues] = React.useState<Record<string, string>>({})
  const [optionsConfigApplyingGroups, setOptionsConfigApplyingGroups] = React.useState(false)
  const [optionsConfigLibraryOptions, setOptionsConfigLibraryOptions] = React.useState<PosMenuOption[]>([])
  const [optionsConfigLibraryLoading, setOptionsConfigLibraryLoading] = React.useState(false)
  const [optionsConfigLibrarySearchTerm, setOptionsConfigLibrarySearchTerm] = React.useState("")
  const [optionsConfigLibraryFilter, setOptionsConfigLibraryFilter] = React.useState<"all" | "recent" | "frequent" | "deliveryOnly">("all")
  const [optionsConfigLibraryUsage, setOptionsConfigLibraryUsage] = React.useState<Record<string, { count: number; lastUsedAt: number }>>({})
  /** 비치킨·선택 단계 없음: POS에서 한 줄로 고르는 치환 옵션 */
  const [optionsConfigCustomOptionName, setOptionsConfigCustomOptionName] = React.useState("")
  const [optionsConfigBulkValuesInput, setOptionsConfigBulkValuesInput] = React.useState("")
  const [optionsConfigBulkHallPrice, setOptionsConfigBulkHallPrice] = React.useState("")
  const [optionsConfigBulkDeliveryPrice, setOptionsConfigBulkDeliveryPrice] = React.useState("")
  const [optionsConfigDraggingOptionId, setOptionsConfigDraggingOptionId] = React.useState<string | null>(null)
  /** set_main 단계 빠른 생성 입력 (예: 후라이드, 양념, 간장) */
  const [optionsConfigSetMainQuickValues, setOptionsConfigSetMainQuickValues] = React.useState("")
  const [optionsConfigNewOptionTitle, setOptionsConfigNewOptionTitle] = React.useState("")
  const [optionGroupMasters, setOptionGroupMasters] = React.useState<PosOptionGroup[]>([])
  const [optionGroupMasterLoading, setOptionGroupMasterLoading] = React.useState(false)
  const [optionGroupMasterSaving, setOptionGroupMasterSaving] = React.useState(false)
  const [optionGroupMasterSelectedId, setOptionGroupMasterSelectedId] = React.useState<string>("")
  const [optionGroupMasterName, setOptionGroupMasterName] = React.useState("")
  const [optionGroupMasterKey, setOptionGroupMasterKey] = React.useState("")
  const [optionGroupMasterSearchTerm, setOptionGroupMasterSearchTerm] = React.useState("")
  const [optionGroupMasterItems, setOptionGroupMasterItems] = React.useState<PosOptionGroupItem[]>([])
  const [optionGroupMenuLinksSaving, setOptionGroupMenuLinksSaving] = React.useState(false)
  const [promoListForSetTab, setPromoListForSetTab] = React.useState<PosPromo[]>([])
  const [setTabPromosLoading, setSetTabPromosLoading] = React.useState(false)
  const [schemaStatus, setSchemaStatus] = React.useState<{
    posPromosExtended: boolean
    posMenusPromoId: boolean
    ok: boolean
  } | null>(null)
  const [setTabSchemaDismissed, setSetTabSchemaDismissed] = React.useState(false)
  const [setTabFocusPromoId, setSetTabFocusPromoId] = React.useState<string | null>(null)
  const [deliveryOpsStoreCode, setDeliveryOpsStoreCode] = React.useState("")
  const [deliveryOpsAppCode, setDeliveryOpsAppCode] = React.useState<DeliveryAppCode>("grab")
  const [deliveryOpsLoading, setDeliveryOpsLoading] = React.useState(false)
  const [deliveryOpsSaving, setDeliveryOpsSaving] = React.useState(false)
  const [deliveryOpsImageUploadingMenuId, setDeliveryOpsImageUploadingMenuId] = React.useState<string | null>(null)
  const [deliveryOpsCopySourceStore, setDeliveryOpsCopySourceStore] = React.useState("")
  const [deliveryOpsCopying, setDeliveryOpsCopying] = React.useState(false)
  const [deliveryOpsApplyingAll, setDeliveryOpsApplyingAll] = React.useState(false)

  const resolveNewOptionChannelPayload = React.useCallback(() => {
    const hall = Number(newOptionModifier) || 0
    const deliveryInput = newOptionModifierDelivery !== "" ? Number(newOptionModifierDelivery) : null
    if (newOptionChannelScope === "hall") {
      return {
        sellHall: true,
        sellDelivery: false,
        sellPackaging: true,
        priceModifier: hall,
        priceModifierDelivery: null as number | null,
        priceModifierPackaging: null as number | null,
      }
    }
    if (newOptionChannelScope === "delivery") {
      return {
        sellHall: false,
        sellDelivery: true,
        sellPackaging: false,
        priceModifier: hall,
        priceModifierDelivery: deliveryInput ?? hall,
        priceModifierPackaging: null as number | null,
      }
    }
    return {
      sellHall: true,
      sellDelivery: true,
      sellPackaging: true,
      priceModifier: hall,
      priceModifierDelivery: deliveryInput,
      priceModifierPackaging: null as number | null,
    }
  }, [newOptionChannelScope, newOptionModifier, newOptionModifierDelivery])
  const [deliveryOpsSearch, setDeliveryOpsSearch] = React.useState("")
  const [deliveryOpsAppPolicy, setDeliveryOpsAppPolicy] = React.useState<PosDeliveryAppPolicy>({
    storeCode: "",
    appCode: "grab",
    enabled: true,
    orderAcceptanceMode: "manual",
    autoAcceptEnabled: false,
  })
  const [deliveryOpsMenuPolicyMap, setDeliveryOpsMenuPolicyMap] = React.useState<Record<string, PosDeliveryMenuPolicy>>({})
  const deliveryOpsImageInputRefs = React.useRef<Record<string, HTMLInputElement | null>>({})
  const [deliveryOpsCategoryOrderMap, setDeliveryOpsCategoryOrderMap] = React.useState<Record<string, number>>({})
  const deliveryOpsVisibleMenus = React.useMemo(() => {
    const q = deliveryOpsSearch.trim().toLowerCase()
    const src = [...menus]
    if (!q) return src
    return src.filter((m) => `${m.code} ${m.name} ${m.categoryMain || ""} ${m.category || ""}`.toLowerCase().includes(q))
  }, [menus, deliveryOpsSearch])

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
    if (canSearchAllStores && stores.length && !deliveryOpsStoreCode) {
      setDeliveryOpsStoreCode(stores[0])
    } else if (!canSearchAllStores && auth?.store) {
      setDeliveryOpsStoreCode(auth.store)
    }
  }, [canSearchAllStores, stores, auth?.store, deliveryOpsStoreCode])

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
      setSelectedOptionDescId("")
      setOptionDescDefaultDraft("")
      setOptionDescDeliveryDraft("")
      setOptionDescTableDraft("")
      setMenuIngredients([])
      setMenuCost(null)
      setBaseMenuCost(null)
      setSelectedIngredientOptionId("")
      return
    }
    getPosMenuOptions({ menuId: editingId }).then((opts) => setMenuOptions(opts || []))
  }, [editingId])

  React.useEffect(() => {
    if (!selectedOptionDescId) {
      setOptionDescDefaultDraft("")
      setOptionDescDeliveryDraft("")
      setOptionDescTableDraft("")
      return
    }
    const opt = menuOptions.find((o) => o.id === selectedOptionDescId)
    setOptionDescDefaultDraft(opt?.descriptionDefault ?? "")
    setOptionDescDeliveryDraft(opt?.descriptionDelivery ?? "")
    setOptionDescTableDraft(opt?.descriptionTable ?? "")
  }, [selectedOptionDescId, menuOptions])

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
    return JSON.stringify({
      groups: sel?.optionSelectionGroups ?? null,
      config: sel?.optionSelectionConfig ?? null,
    })
  }, [optionsConfigSelectedMenuId, menus])

  const applyLoadedOptionsForConfig = React.useCallback((raw: PosMenuOption[] | null | undefined) => {
    const next = Array.isArray(raw) ? raw : []
    setOptionsConfigMenuOptions(next)
    setOptionsConfigOriginalOptions(next)
  }, [])

  React.useEffect(() => {
    if (!optionsConfigSelectedMenuId) {
      setOptionsConfigMenuOptions([])
      setOptionsConfigOriginalOptions([])
      setOptionsConfigOriginalOptions([])
      setOptionsConfigGroupsDraft("")
      setOptionsConfigGroupRulesDraft([])
      setOptionsConfigNewStepValues({})
      setOptionsConfigCustomOptionName("")
      setOptionsConfigNewOptionTitle("")
      setOptionsConfigSelectedGroupKey("")
      return
    }
    getPosMenuOptions({ menuId: optionsConfigSelectedMenuId }).then(applyLoadedOptionsForConfig)
    setOptionsConfigNewStepValues({})
    setOptionsConfigCustomOptionName("")
    setOptionsConfigNewOptionTitle("")
    setNewOptionSize("")
    setNewOptionPart("")
    setNewOptionModifier("0")
    setNewOptionModifierDelivery("")
  }, [optionsConfigSelectedMenuId, applyLoadedOptionsForConfig])

  React.useEffect(() => {
    if (!optionsConfigSelectedMenuId) return
    const sel = menus.find((m) => m.id === optionsConfigSelectedMenuId)
    const g = sel?.optionSelectionGroups
    const parsedGroups = Array.isArray(g) && g.length > 0 ? g.map((x) => String(x).trim()).filter(Boolean) : []
    setOptionsConfigGroupsDraft(parsedGroups.join(", "))
    setOptionsConfigGroupRulesDraft(normalizeOptionSelectionConfig(parsedGroups, sel?.optionSelectionConfig))
  }, [optionsConfigSelectedMenuId, optionsConfigSelectedGroupsKey])

  const optionsConfigStepGroups = React.useMemo(() => {
    if (!optionsConfigSelectedMenuId) return [] as string[]
    const m = menus.find((x) => x.id === optionsConfigSelectedMenuId)
    return (m?.optionSelectionGroups ?? []).map((g) => String(g).trim()).filter(Boolean)
  }, [menus, optionsConfigSelectedMenuId])

  React.useEffect(() => {
    if (mainTab !== "optionsConfig") return
    let cancelled = false
    setOptionsConfigLibraryLoading(true)
    getPosMenuOptions()
      .then((list) => {
        if (cancelled) return
        setOptionsConfigLibraryOptions(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        if (cancelled) return
        setOptionsConfigLibraryOptions([])
      })
      .finally(() => {
        if (cancelled) return
        setOptionsConfigLibraryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [mainTab])

  React.useEffect(() => {
    if (!optionsConfigSelectedMenuId) {
      setOptionsConfigLibrarySearchTerm("")
      return
    }
  }, [optionsConfigSelectedMenuId])

  React.useEffect(() => {
    if (optionsConfigStepGroups.length === 0) {
      setOptionsConfigSelectedGroupKey("")
      return
    }
    setOptionsConfigSelectedGroupKey((prev) =>
      optionsConfigStepGroups.includes(prev) ? prev : optionsConfigStepGroups[0]
    )
  }, [optionsConfigStepGroups])

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
    setPackagingChecklistRows([])
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
          descriptionDefault: m.descriptionDefault ?? "",
          descriptionDelivery: m.descriptionDelivery ?? "",
          descriptionTable: m.descriptionTable ?? "",
          vatIncluded: m.vatIncluded,
          isActive: m.isActive,
          isBanban: m.isBanban ?? false,
        })
        void loadPackagingChecklistRows(editingId)
      }
    } else {
      setFormData(emptyForm)
      setPackagingChecklistRows([])
    }
  }

  const loadPackagingChecklistRows = React.useCallback(async (menuId: string) => {
    if (!menuId) {
      setPackagingChecklistRows([])
      return
    }
    setPackagingChecklistLoading(true)
    try {
      const res = await getPosMenuPackagingChecklist({ menuId })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || (t("msg_load_fail") || "불러오기 실패"))
        setPackagingChecklistRows([])
        return
      }
      const next = (res.items || []).map((it: PosMenuPackagingCheckItem) => ({
        localId: `db-${it.id}`,
        optionId: "",
        orderType: "both" as PosPackagingChecklistOrderType,
        itemName: String(it.itemName || ""),
        isRequired: it.isRequired !== false,
        sortOrder: Number(it.sortOrder ?? 0) || 0,
        isActive: it.isActive !== false,
      }))
      setPackagingChecklistRows(next)
    } catch (e) {
      await appAlert(`${t("error") || "오류"}: ${String(e)}`)
      setPackagingChecklistRows([])
    } finally {
      setPackagingChecklistLoading(false)
    }
  }, [t])

  const handlePackagingChecklistRowPatch = React.useCallback(
    (localId: string, patch: Partial<PackagingChecklistDraftRow>) => {
      setPackagingChecklistRows((prev) => prev.map((row) => (row.localId === localId ? { ...row, ...patch } : row)))
    },
    []
  )

  const handlePackagingChecklistRowRemove = React.useCallback((localId: string) => {
    setPackagingChecklistRows((prev) =>
      prev
        .filter((row) => row.localId !== localId)
        .map((row, idx) => ({ ...row, sortOrder: idx }))
    )
  }, [])

  const handleSavePackagingChecklist = React.useCallback(async () => {
    if (!editingId) return
    setPackagingChecklistSaving(true)
    try {
      const payload = packagingChecklistRows
        .map((row, idx) => ({
          optionId: null,
          orderType: "both" as PosPackagingChecklistOrderType,
          itemName: row.itemName.trim(),
          isRequired: row.isRequired,
          sortOrder: idx,
          isActive: row.isActive,
        }))
        .filter((row) => row.itemName.length > 0)
      const res = await savePosMenuPackagingChecklist({
        menuId: editingId,
        items: payload,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || (t("msg_save_fail_detail") || "저장에 실패했습니다."))
        return
      }
      await appAlert((t("itemsAlertSaved") || "저장되었습니다."))
      await loadPackagingChecklistRows(editingId)
    } catch (e) {
      await appAlert(`${t("error") || "오류"}: ${String(e)}`)
    } finally {
      setPackagingChecklistSaving(false)
    }
  }, [editingId, loadPackagingChecklistRows, packagingChecklistRows, t])

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
    let code = formData.code.trim()
    const name = formData.name.trim()
    /** 자동 코드 대분류인데 아직 code가 비어 있으면(비동기 실패·오프라인 등) 저장 직전에 한 번 더 발급 시도 */
    const mainTrim = formData.categoryMain.trim()
    if (
      !editingId &&
      !code &&
      mainTrim &&
      (CODE_AUTO_MAINS as readonly string[]).includes(mainTrim)
    ) {
      const { code: next } = await getNextPosMenuCode(mainTrim)
      if (next) {
        code = next
        setFormData((p) => ({ ...p, code: next }))
      }
    }
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
      descriptionDefault: formData.descriptionDefault.trim(),
      descriptionDelivery: formData.descriptionDelivery.trim() || null,
      descriptionTable: formData.descriptionTable.trim() || null,
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
      descriptionDefault: formData.descriptionDefault.trim(),
      descriptionDelivery: formData.descriptionDelivery.trim() || null,
      descriptionTable: formData.descriptionTable.trim() || null,
      vatIncluded: formData.vatIncluded,
      isActive: formData.isActive,
      sortOrder: 0,
      optionSelectionGroups: editingMenu?.optionSelectionGroups,
      optionSelectionConfig: editingMenu?.optionSelectionConfig,
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
      descriptionDefault: menu.descriptionDefault ?? "",
      descriptionDelivery: menu.descriptionDelivery ?? "",
      descriptionTable: menu.descriptionTable ?? "",
      vatIncluded: menu.vatIncluded,
      isActive: menu.isActive,
      isBanban: menu.isBanban ?? false,
    })
    setEditingId(menu.id)
    setNewOptionName("")
    setNewOptionModifier("0")
    setNewOptionModifierDelivery("")
    setNewOptionChannelScope("all")
    setNewOptionDescriptionDefault("")
    setNewOptionDescriptionDelivery("")
    setNewOptionDescriptionTable("")
    setSelectedIngredientOptionId("")
    void loadPackagingChecklistRows(menu.id)
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
    const channelPayload = resolveNewOptionChannelPayload()
    const res = await savePosMenuOption({
      menuId: Number(editingId),
      name: newOptionName.trim(),
      priceModifier: channelPayload.priceModifier,
      priceModifierDelivery: channelPayload.priceModifierDelivery,
      priceModifierPackaging: channelPayload.priceModifierPackaging,
      sortOrder: menuOptions.length,
      optionType: newOptionType,
      itemCode: null,
      additiveSourceMenuId:
        newOptionType === "additive" ? Number(newOptionSourceMenuId) || null : null,
      quantity: newOptionType === "additive" ? Number(newOptionQuantity) || 1 : 1,
      optionStepValues,
      sellHall: channelPayload.sellHall,
      sellDelivery: channelPayload.sellDelivery,
      sellPackaging: channelPayload.sellPackaging,
      descriptionDefault: newOptionDescriptionDefault.trim(),
      descriptionDelivery: newOptionDescriptionDelivery.trim() || null,
      descriptionTable: newOptionDescriptionTable.trim() || null,
    })
    if (res.success) {
      getPosMenuOptions({ menuId: editingId }).then(setMenuOptions)
      setNewOptionName("")
      setNewOptionModifier("0")
      setNewOptionModifierDelivery("")
      setNewOptionChannelScope("all")
      setNewOptionType("substitution")
      setNewOptionSourceMenuId("")
      setNewOptionQuantity("1")
      setNewOptionStepValues({})
      setNewOptionDescriptionDefault("")
      setNewOptionDescriptionDelivery("")
      setNewOptionDescriptionTable("")
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

  const handleSaveOptionDescription = async () => {
    if (!editingId || !selectedOptionDescId) return
    const opt = menuOptions.find((o) => o.id === selectedOptionDescId)
    if (!opt) return
    const res = await savePosMenuOption({
      id: opt.id,
      menuId: Number(editingId),
      name: opt.name,
      priceModifier: opt.priceModifier ?? 0,
      priceModifierDelivery: opt.priceModifierDelivery ?? null,
      priceModifierPackaging: opt.priceModifierPackaging ?? null,
      sortOrder: opt.sortOrder ?? 0,
      optionType: opt.optionType ?? "substitution",
      itemCode: opt.itemCode ?? null,
      additiveSourceMenuId: opt.additiveSourceMenuId ?? null,
      quantity: opt.quantity ?? 1,
      optionStepValues: opt.optionStepValues ?? undefined,
      sellHall: opt.sellHall ?? true,
      sellDelivery: opt.sellDelivery ?? true,
      sellPackaging: opt.sellPackaging ?? true,
      descriptionDefault: optionDescDefaultDraft.trim(),
      descriptionDelivery: optionDescDeliveryDraft.trim() || null,
      descriptionTable: optionDescTableDraft.trim() || null,
    })
    if (!res.success) {
      await appAlert(translateApiMessage(res.message, t) || t("msg_save_fail"))
      return
    }
    const opts = await getPosMenuOptions({ menuId: editingId })
    setMenuOptions(opts || [])
    await appAlert(t("itemsAlertUpdated") || "수정되었습니다.")
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
    getPosMenuOptions({ menuId }).then(applyLoadedOptionsForConfig)
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
  const loadOptionGroupMasters = React.useCallback(
    async (menuId?: string | null) => {
      setOptionGroupMasterLoading(true)
      try {
        const groups = await getPosOptionGroups({
          menuId: menuId && menuId.trim() ? menuId : undefined,
        })
        setOptionGroupMasters(Array.isArray(groups) ? groups : [])
      } finally {
        setOptionGroupMasterLoading(false)
      }
    },
    []
  )
  React.useEffect(() => {
    if (mainTab !== "optionsConfig") return
    void loadOptionGroupMasters(optionsConfigSelectedMenuId)
  }, [mainTab, optionsConfigSelectedMenuId, loadOptionGroupMasters])
  React.useEffect(() => {
    if (!optionGroupMasterSelectedId) {
      setOptionGroupMasterItems([])
      setOptionGroupMasterName("")
      setOptionGroupMasterKey("")
      return
    }
    const selected = optionGroupMasters.find((x) => x.id === optionGroupMasterSelectedId)
    if (!selected) return
    setOptionGroupMasterName(selected.name || "")
    setOptionGroupMasterKey(selected.key || "")
    setOptionGroupMasterItems(Array.isArray(selected.items) ? selected.items : [])
  }, [optionGroupMasterSelectedId, optionGroupMasters])
  const handleSaveOptionGroupMaster = React.useCallback(async () => {
    const key = optionGroupMasterKey.trim()
    const name = optionGroupMasterName.trim()
    if (!key || !name) {
      await appAlert(t("posOptionConfigNeedGroupsShort") || "그룹 키와 이름을 입력해 주세요.")
      return
    }
    setOptionGroupMasterSaving(true)
    try {
      const res = await savePosOptionGroup({
        id: optionGroupMasterSelectedId || undefined,
        key,
        name,
        sortOrder:
          optionGroupMasters.findIndex((x) => x.id === optionGroupMasterSelectedId) >= 0
            ? optionGroupMasters.findIndex((x) => x.id === optionGroupMasterSelectedId)
            : optionGroupMasters.length,
        items: optionGroupMasterItems.map((item, idx) => ({
          id: item.id || undefined,
          itemName: item.itemName,
          sortOrder: idx,
          basePriceHall: Number(item.basePriceHall ?? 0) || 0,
          basePriceDelivery:
            item.basePriceDelivery != null ? Number(item.basePriceDelivery) : null,
          sellHall: item.sellHall !== false,
          sellDelivery: item.sellDelivery !== false,
        })),
      })
      if (!res?.success) throw new Error(res?.message || "옵션그룹 저장 실패")
      setOptionGroupMasterSelectedId(String(res.id || optionGroupMasterSelectedId || ""))
      await loadOptionGroupMasters(optionsConfigSelectedMenuId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await appAlert(translateApiMessage(msg, t) || t("saveFailed") || "저장 실패")
    } finally {
      setOptionGroupMasterSaving(false)
    }
  }, [
    lang,
    loadOptionGroupMasters,
    optionGroupMasterItems,
    optionGroupMasterKey,
    optionGroupMasterName,
    optionGroupMasterSelectedId,
    optionGroupMasters,
    optionsConfigSelectedMenuId,
    t,
  ])
  const handleSaveMenuGroupLinks = React.useCallback(async () => {
    if (!optionsConfigSelectedMenuId) {
      await appAlert(t("posMenuOptionsConfigNoSelect") || "메뉴를 먼저 선택해 주세요.")
      return
    }
    setOptionGroupMenuLinksSaving(true)
    try {
      const links = optionGroupMasters
        .filter((x) => x.link)
        .sort(
          (a, b) =>
            Number(a.link?.sortOrder ?? 0) - Number(b.link?.sortOrder ?? 0)
        )
        .map((x, idx) => ({
          id: x.link?.id,
          groupId: x.id,
          sortOrder: Number(x.link?.sortOrder ?? idx),
          sellHall: x.link?.sellHall !== false,
          sellDelivery: x.link?.sellDelivery !== false,
          priceHallOverride:
            x.link?.priceHallOverride != null
              ? Number(x.link?.priceHallOverride)
              : null,
          priceDeliveryOverride:
            x.link?.priceDeliveryOverride != null
              ? Number(x.link?.priceDeliveryOverride)
              : null,
          required: x.link?.required !== false,
          minSelect: Number(x.link?.minSelect ?? 0),
          maxSelect: Number(x.link?.maxSelect ?? 1),
        }))
      const res = await savePosMenuOptionGroupLinks({
        menuId: Number(optionsConfigSelectedMenuId),
        links,
      })
      if (!res?.success) throw new Error(res?.message || "메뉴 링크 저장 실패")
      await loadOptionGroupMasters(optionsConfigSelectedMenuId)
      await loadMenusAndCategories(setOptionsConfigListLoading)
      const opts = await getPosMenuOptions({ menuId: optionsConfigSelectedMenuId, fresh: true })
      applyLoadedOptionsForConfig(Array.isArray(opts) ? opts : [])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await appAlert(translateApiMessage(msg, t) || t("saveFailed") || "저장 실패")
    } finally {
      setOptionGroupMenuLinksSaving(false)
    }
  }, [
    applyLoadedOptionsForConfig,
    lang,
    loadOptionGroupMasters,
    optionGroupMasters,
    optionsConfigSelectedMenuId,
    t,
  ])
  const optionGroupMastersFiltered = React.useMemo(() => {
    const q = optionGroupMasterSearchTerm.trim().toLowerCase()
    if (!q) return optionGroupMasters
    return optionGroupMasters.filter((g) => {
      const name = String(g.name || "").toLowerCase()
      const key = String(g.key || "").toLowerCase()
      return name.includes(q) || key.includes(q)
    })
  }, [optionGroupMasterSearchTerm, optionGroupMasters])
  const optionsConfigDraftGroupsParsed = React.useMemo(
    () => parseOptionGroupsFromText(optionsConfigGroupsDraft),
    [optionsConfigGroupsDraft]
  )

  React.useEffect(() => {
    if (!optionsConfigSelectedMenuId) return
    setOptionsConfigGroupRulesDraft((prev) => normalizeOptionSelectionConfig(optionsConfigDraftGroupsParsed, prev))
  }, [optionsConfigSelectedMenuId, optionsConfigDraftGroupsParsed])

  /** 사이즈/부위 드롭다운은 치킨(c 접두) 전용. 비치킨은 단계 키마다 직접 입력 */
  const optionsConfigUseSizePartUi = React.useMemo(() => {
    if (!optionsConfigSelectedMenu) return false
    return isChickenMenu(optionsConfigSelectedMenu.code)
  }, [optionsConfigSelectedMenu])

  const optionsConfigGroupPanelItems = React.useMemo(() => {
    if (optionsConfigStepGroups.length === 0) {
      return [
        {
          key: "__default__",
          label: t("posOptionSelectionGroups") || "기본 옵션",
          required: false,
          count: optionsConfigMenuOptions.length,
          audience: "all" as const,
        },
      ]
    }
    return optionsConfigStepGroups.map((groupKey) => {
      const row =
        optionsConfigGroupRulesDraft.find((x) => x.key === groupKey) ||
        ({ key: groupKey, label: groupKey, required: true } as PosOptionSelectionGroupConfig)
      const audience: "all" | "hall" | "delivery" =
        row.audience === "hall" || row.audience === "delivery" ? row.audience : "all"
      return {
        key: groupKey,
        label: String(row.label ?? groupKey),
        required: row.required !== false,
        count: optionsConfigMenuOptions.filter((opt) => (opt.optionStepValues?.[groupKey] ?? "").trim() !== "").length,
        audience,
      }
    })
  }, [optionsConfigStepGroups, optionsConfigMenuOptions, optionsConfigGroupRulesDraft, t])

  const handleOptionGroupAudienceToggle = React.useCallback(
    (groupKey: string, channel: "hall" | "delivery", checked: boolean) => {
      setOptionsConfigGroupRulesDraft((prev) => {
        const normalized = normalizeOptionSelectionConfig(
          optionsConfigDraftGroupsParsed.length > 0 ? optionsConfigDraftGroupsParsed : optionsConfigStepGroups,
          prev
        )
        return normalized.map((row) => {
          if (row.key !== groupKey) return row
          const hallEnabled = (row.audience ?? "all") !== "delivery"
          const deliveryEnabled = (row.audience ?? "all") !== "hall"
          const nextHall = channel === "hall" ? checked : hallEnabled
          const nextDelivery = channel === "delivery" ? checked : deliveryEnabled
          if (!nextHall && !nextDelivery) return row
          const nextAudience = nextHall && nextDelivery ? "all" : nextHall ? "hall" : "delivery"
          return { ...row, audience: nextAudience }
        })
      })
    },
    [optionsConfigDraftGroupsParsed, optionsConfigStepGroups]
  )

  const handleOptionGroupLabelChange = React.useCallback(
    (groupKey: string, label: string) => {
      setOptionsConfigGroupRulesDraft((prev) => {
        const normalized = normalizeOptionSelectionConfig(
          optionsConfigDraftGroupsParsed.length > 0 ? optionsConfigDraftGroupsParsed : optionsConfigStepGroups,
          prev
        )
        return normalized.map((row) => (row.key === groupKey ? { ...row, label } : row))
      })
    },
    [optionsConfigDraftGroupsParsed, optionsConfigStepGroups]
  )

  const handleMoveOptionGroup = React.useCallback(
    (groupKey: string, direction: "up" | "down") => {
      const current = optionsConfigDraftGroupsParsed.length > 0 ? optionsConfigDraftGroupsParsed : optionsConfigStepGroups
      const idx = current.indexOf(groupKey)
      if (idx < 0) return
      const target = direction === "up" ? idx - 1 : idx + 1
      if (target < 0 || target >= current.length) return
      const next = [...current]
      const temp = next[idx]
      next[idx] = next[target]
      next[target] = temp
      setOptionsConfigGroupsDraft(next.join(", "))
      setOptionsConfigGroupRulesDraft((prev) => normalizeOptionSelectionConfig(next, prev))
    },
    [optionsConfigDraftGroupsParsed, optionsConfigStepGroups]
  )

  const optionsConfigLibraryItems = React.useMemo(() => {
    const templates = new Map<
      string,
      { key: string; label: string; audience: "all" | "hall" | "delivery"; menuCount: number; sampleValues: Set<string> }
    >()
    for (const menu of menus) {
      const groups = (menu.optionSelectionGroups ?? []).map((g) => String(g).trim()).filter(Boolean)
      const cfgMap = new Map((menu.optionSelectionConfig ?? []).map((c) => [String(c.key ?? "").trim(), c]))
      for (const key of groups) {
        if (!templates.has(key)) {
          const cfg = cfgMap.get(key)
          const audience: "all" | "hall" | "delivery" =
            cfg?.audience === "hall" || cfg?.audience === "delivery" ? cfg.audience : "all"
          templates.set(key, {
            key,
            label: String(cfg?.label ?? key),
            audience,
            menuCount: 0,
            sampleValues: new Set<string>(),
          })
        }
        templates.get(key)!.menuCount += 1
      }
    }
    for (const opt of optionsConfigLibraryOptions) {
      const stepValues = opt.optionStepValues ?? {}
      for (const [k, v] of Object.entries(stepValues)) {
        const key = String(k).trim()
        const value = String(v ?? "").trim()
        if (!key || !value) continue
        if (!templates.has(key)) {
          templates.set(key, {
            key,
            label: key,
            audience: "all",
            menuCount: 0,
            sampleValues: new Set<string>(),
          })
        }
        templates.get(key)!.sampleValues.add(value)
      }
    }
    const q = optionsConfigLibrarySearchTerm.trim().toLowerCase()
    return Array.from(templates.values())
      .map((template) => {
        const noteParts: string[] = []
        noteParts.push((t("posOptionTemplateUsedMenuCount") || "메뉴 {n}개").replace("{n}", String(template.menuCount)))
        const sample = Array.from(template.sampleValues).slice(0, 3)
        if (sample.length > 0) noteParts.push(sample.join(", "))
        const usage = optionsConfigLibraryUsage[template.key]
        if (usage?.count) {
          noteParts.push((t("posOptionTemplateUseCount") || "사용 {n}회").replace("{n}", String(usage.count)))
        }
        return {
          id: template.key,
          label: template.label,
          note: noteParts.join(" | ") || undefined,
          deliveryOnly: template.audience === "delivery",
          audience: template.audience,
          usageCount: usage?.count ?? 0,
          lastUsedAt: usage?.lastUsedAt ?? 0,
          source: template,
        }
      })
      .filter((row) => !q || row.label.toLowerCase().includes(q) || row.id.toLowerCase().includes(q))
      .filter((row) => (optionsConfigLibraryFilter === "deliveryOnly" ? row.deliveryOnly : true))
      .sort((a, b) => {
        if (optionsConfigLibraryFilter === "recent") {
          if (b.lastUsedAt !== a.lastUsedAt) return b.lastUsedAt - a.lastUsedAt
        } else if (optionsConfigLibraryFilter === "frequent") {
          if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount
        }
        return a.label.localeCompare(b.label)
      })
  }, [menus, optionsConfigLibraryOptions, optionsConfigLibrarySearchTerm, optionsConfigLibraryFilter, optionsConfigLibraryUsage, t])

  const handleUseTemplateGroupForConfig = React.useCallback(
    async (templateGroupKey: string) => {
      const source = optionsConfigLibraryItems.find((x) => x.id === templateGroupKey)?.source
      if (!source) return
      const current = optionsConfigDraftGroupsParsed.length > 0 ? optionsConfigDraftGroupsParsed : optionsConfigStepGroups
      if (current.includes(source.key)) {
        await appAlert(t("posOptionTemplateDuplicateSkip") || "같은 이름의 옵션이 이미 있어 추가하지 않았습니다.")
        return
      }
      const merged = [...current, source.key]
      setOptionsConfigGroupsDraft(merged.join(", "))
      setOptionsConfigGroupRulesDraft((prev) => {
        const normalized = normalizeOptionSelectionConfig(merged, prev)
        return normalized.map((row) =>
          row.key === source.key ? { ...row, label: source.label, audience: source.audience } : row
        )
      })
      setOptionsConfigLibraryUsage((prev) => {
        const currentUsage = prev[templateGroupKey] ?? { count: 0, lastUsedAt: 0 }
        return {
          ...prev,
          [templateGroupKey]: {
            count: currentUsage.count + 1,
            lastUsedAt: Date.now(),
          },
        }
      })
    },
    [optionsConfigLibraryItems, optionsConfigDraftGroupsParsed, optionsConfigStepGroups, t]
  )

  /** 치킨 메뉴만: 옵션 추가 시 size, part 단계로 맞춤 */
  const ensureChickenMenuOptionGroups = React.useCallback(async () => {
    if (!optionsConfigSelectedMenuId || !optionsConfigSelectedMenu) return
    if (!isChickenMenu(optionsConfigSelectedMenu.code)) return
    const groups = optionsConfigSelectedMenu.optionSelectionGroups || []
    const hasCorrect = groups.length >= 2 && groups[0] === "size" && groups[1] === "part"
    if (hasCorrect) return
    const nextConfig = normalizeOptionSelectionConfig(["size", "part"], optionsConfigSelectedMenu.optionSelectionConfig)
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
      optionSelectionConfig: nextConfig,
      isBanban: optionsConfigSelectedMenu.isBanban ?? false,
    })
    if (res.success) {
      setMenus((prev) =>
        prev.map((m) => (m.id === optionsConfigSelectedMenuId ? { ...m, optionSelectionGroups: ["size", "part"], optionSelectionConfig: nextConfig } : m))
      )
      setOptionsConfigGroupRulesDraft(nextConfig)
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
    const nextConfig = normalizeOptionSelectionConfig(parsed, optionsConfigGroupRulesDraft)
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
        optionSelectionConfig: nextConfig,
        isBanban: optionsConfigSelectedMenu.isBanban ?? false,
      })
      if (res.success) {
        setMenus((prev) =>
          prev.map((m) => (m.id === optionsConfigSelectedMenuId ? { ...m, optionSelectionGroups: parsed, optionSelectionConfig: nextConfig } : m))
        )
        setOptionsConfigGroupRulesDraft(nextConfig)
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
    const nextConfig = normalizeOptionSelectionConfig(cleaned, optionsConfigGroupRulesDraft)
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
        optionSelectionConfig: nextConfig,
        isBanban: optionsConfigSelectedMenu.isBanban ?? false,
      })
      if (res.success) {
        setMenus((prev) =>
          prev.map((m) => (m.id === optionsConfigSelectedMenuId ? { ...m, optionSelectionGroups: cleaned, optionSelectionConfig: nextConfig } : m))
        )
        setOptionsConfigGroupRulesDraft(nextConfig)
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
    const channelPayload = resolveNewOptionChannelPayload()
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
      priceModifier: channelPayload.priceModifier,
      priceModifierDelivery: channelPayload.priceModifierDelivery,
      priceModifierPackaging: channelPayload.priceModifierPackaging,
      sortOrder: optionsConfigMenuOptions.length,
      optionType: "substitution",
      sellHall: channelPayload.sellHall,
      sellDelivery: channelPayload.sellDelivery,
      sellPackaging: channelPayload.sellPackaging,
    })
    if (res.success) {
      getPosMenuOptions({ menuId: optionsConfigSelectedMenuId }).then(applyLoadedOptionsForConfig)
      setOptionsConfigCustomOptionName("")
      setOptionsConfigNewOptionTitle("")
      setNewOptionModifier("0")
      setNewOptionModifierDelivery("")
      setNewOptionChannelScope("all")
    } else {
      await appAlert(res.message || t("msg_save_fail_detail"))
    }
  }

  const handleAddOptionForConfig = async () => {
    const channelPayload = resolveNewOptionChannelPayload()
    if (!optionsConfigSelectedMenuId || !optionsConfigSelectedMenu) return
    try {
      const explicitTitle = optionsConfigNewOptionTitle.trim()
      if (isChickenMenu(optionsConfigSelectedMenu.code)) {
        await appAlert(t("posChickenTitleOnlyHint") || "치킨 메뉴는 기존 옵션을 유지하고, 아래 목록에서 옵션 제목만 수정해 주세요.")
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

      const name = explicitTitle || groups.map((g) => optionStepValues[g]).join(" - ")
      const exists = optionsConfigMenuOptions.some((o) => groups.every((g) => o.optionStepValues?.[g] === optionStepValues[g]))
      if (exists) {
        await appAlert(`${name} ${t("itemsAlertCodeExists") || "이미 있습니다."}`)
        return
      }
      const res = await savePosMenuOption({
        menuId: Number(optionsConfigSelectedMenuId),
        name,
        priceModifier: channelPayload.priceModifier,
        priceModifierDelivery: channelPayload.priceModifierDelivery,
        priceModifierPackaging: channelPayload.priceModifierPackaging,
        sortOrder: optionsConfigMenuOptions.length,
        optionType: "substitution",
        optionStepValues,
        sellHall: channelPayload.sellHall,
        sellDelivery: channelPayload.sellDelivery,
        sellPackaging: channelPayload.sellPackaging,
      })
      if (res.success) {
        getPosMenuOptions({ menuId: optionsConfigSelectedMenuId }).then(applyLoadedOptionsForConfig)
        setOptionsConfigNewStepValues({})
        setOptionsConfigNewOptionTitle("")
        setNewOptionModifier("0")
        setNewOptionModifierDelivery("")
        setNewOptionChannelScope("all")
      } else {
        await appAlert(res.message || t("msg_save_fail_detail"))
      }
    } catch (e) {
      console.error("handleAddOptionForConfig:", e)
      await appAlert(e instanceof Error ? e.message : String(e))
    }
  }

  /**
   * set_main 단일 선택(예: 3개 중 1개) 옵션을 빠르게 생성
   * - 단계가 없으면 set_main으로 자동 저장
   * - 입력값은 쉼표/줄바꿈으로 구분
   */
  const handleQuickCreateSetMainOptions = async () => {
    const channelPayload = resolveNewOptionChannelPayload()
    if (!optionsConfigSelectedMenuId || !optionsConfigSelectedMenu) return
    const pid = optionsConfigSelectedMenu.promoId?.trim()
    if (pid) {
      await appAlert(t("posMenuPromoLinkedEdit") || "프로모션과 연동된 메뉴는 마케팅 > 프로모션 관리에서 수정하세요.")
      return
    }
    const labels = optionsConfigSetMainQuickValues
      .split(/[,，\n\r]+/)
      .map((v) => v.trim())
      .filter(Boolean)
    if (labels.length < 2) {
      await appAlert("최소 2개 이상 입력해 주세요. (예: 후라이드, 양념, 간장)")
      return
    }

    const currentGroups = optionsConfigStepGroups
    if (!(currentGroups.length === 1 && currentGroups[0] === "set_main")) {
      await handleApplyOptionPresetAndSave(["set_main"])
    }

    const latestOptions = await getPosMenuOptions({ menuId: optionsConfigSelectedMenuId }).catch(() => optionsConfigMenuOptions)
    const existing = Array.isArray(latestOptions) ? latestOptions : []
    const existingSet = new Set(
      existing.map((o) => String(o.optionStepValues?.set_main ?? o.name ?? "").trim().toLowerCase()).filter(Boolean)
    )

    let added = 0
    for (const label of labels) {
      const key = label.toLowerCase()
      if (existingSet.has(key)) continue
      const res = await savePosMenuOption({
        menuId: Number(optionsConfigSelectedMenuId),
        name: label,
        priceModifier: channelPayload.priceModifier,
        priceModifierDelivery: channelPayload.priceModifierDelivery,
        priceModifierPackaging: channelPayload.priceModifierPackaging,
        sortOrder: existing.length + added,
        optionType: "substitution",
        optionStepValues: { set_main: label },
        sellHall: channelPayload.sellHall,
        sellDelivery: channelPayload.sellDelivery,
        sellPackaging: channelPayload.sellPackaging,
      })
      if (!res.success) {
        await appAlert(res.message || t("msg_save_fail_detail"))
        return
      }
      existingSet.add(key)
      added++
    }

    const refreshed = await getPosMenuOptions({ menuId: optionsConfigSelectedMenuId })
    applyLoadedOptionsForConfig(Array.isArray(refreshed) ? refreshed : [])
    setOptionsConfigSetMainQuickValues("")
    await appAlert(added > 0 ? `${added}개 옵션을 추가했습니다.` : "이미 같은 옵션이 있어 추가된 항목이 없습니다.")
  }

  const handleAddAllOptionsForConfig = async () => {
    const channelPayload = resolveNewOptionChannelPayload()
    if (!optionsConfigSelectedMenuId || !optionsConfigSelectedMenu) return
    const isChicken = isChickenMenu(optionsConfigSelectedMenu.code)
    if (isChicken) {
      await appAlert(t("posChickenTitleOnlyHint") || "치킨 메뉴는 기존 옵션을 유지하고, 아래 목록에서 옵션 제목만 수정해 주세요.")
      return
    } else if (!isSizePartGroups(optionsConfigStepGroups)) {
      await appAlert(
        t("posOptionConfigAddAllSizePartOnly") ||
          "[전체 조합 추가]는 선택 단계가 size, part 순서일 때만 사용할 수 있습니다."
      )
      return
    }
    const existingKeys = new Set(
      optionsConfigMenuOptions.map((o) => `${o.optionStepValues?.size ?? ""}_${o.optionStepValues?.part ?? ""}`)
    )
    const price = 0
    const combinations: { size: string; part: string; sellHall: boolean; sellDelivery: boolean; sellPackaging: boolean }[] = isChicken
      ? [
          { size: "M", part: "Boneless", sellHall: true, sellDelivery: true, sellPackaging: true },
          { size: "M", part: "Wing", sellHall: true, sellDelivery: true, sellPackaging: true },
          { size: "M", part: "Drumette", sellHall: true, sellDelivery: true, sellPackaging: true },
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
        priceModifier: isChicken ? price : channelPayload.priceModifier,
        priceModifierDelivery: isChicken ? price : channelPayload.priceModifierDelivery,
        priceModifierPackaging: isChicken ? price : channelPayload.priceModifierPackaging,
        sortOrder: optionsConfigMenuOptions.length + added,
        optionType: "substitution",
        optionStepValues: { size, part },
        sellHall: isChicken ? sellHall : channelPayload.sellHall,
        sellDelivery: isChicken ? sellDelivery : channelPayload.sellDelivery,
        sellPackaging: isChicken ? sellPackaging : channelPayload.sellPackaging,
      })
      if (res.success) {
        existingKeys.add(`${size}_${part}`)
        added++
      }
    }
    if (added > 0) {
      getPosMenuOptions({ menuId: optionsConfigSelectedMenuId }).then(applyLoadedOptionsForConfig)
    }
  }

  /** 기본가 = S 순살. 옵션으로 붙는 것은 M 순살/윙/봉 3개만 */
  const CHICKEN_OPTION_COMBOS = [
    { size: "M", part: "Boneless", sellHall: true, sellDelivery: true, sellPackaging: true },
    { size: "M", part: "Wing", sellHall: true, sellDelivery: true, sellPackaging: true },
    { size: "M", part: "Drumette", sellHall: true, sellDelivery: true, sellPackaging: true },
  ] as const

  const handleChickenBatchApply = async () => {
    await appAlert(t("posChickenTitleOnlyHint") || "현재는 치킨 기존 옵션을 유지합니다. 옵션 목록에서 제목만 수정해 주세요.")
    return
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
          optionSelectionConfig: normalizeOptionSelectionConfig(["size", "part"], menu.optionSelectionConfig),
        })
        if (!saveMenuRes.success) {
          throw new Error(`메뉴 ${menu.code} 저장 실패: ${saveMenuRes.message}`)
        }
        const existing = await getPosMenuOptions({ menuId: menu.id, fresh: true })
        const existingPriceByStep = new Map<
          string,
          { hall: number; delivery: number | null; packaging: number | null }
        >(
          (existing || [])
            .map((opt) => {
              const size = String(opt.optionStepValues?.size ?? '').trim()
              const part = String(opt.optionStepValues?.part ?? '').trim()
              if (!size || !part) return null
              return [
                `${size}__${part}`,
                {
                  hall: Number.isFinite(Number(opt.priceModifier)) ? Number(opt.priceModifier) : 0,
                  delivery:
                    opt.priceModifierDelivery != null && Number.isFinite(Number(opt.priceModifierDelivery))
                      ? Number(opt.priceModifierDelivery)
                      : null,
                  packaging:
                    opt.priceModifierPackaging != null && Number.isFinite(Number(opt.priceModifierPackaging))
                      ? Number(opt.priceModifierPackaging)
                      : null,
                },
              ] as const
            })
            .filter(Boolean) as [string, { hall: number; delivery: number | null; packaging: number | null }][]
        )
        for (const opt of existing || []) {
          const delRes = await deletePosMenuOption({ id: String(opt.id) })
          if (!delRes.success) {
            throw new Error(`옵션 삭제 실패: ${delRes.message}`)
          }
        }
        for (let i = 0; i < CHICKEN_OPTION_COMBOS.length; i++) {
          const { size, part, sellHall, sellDelivery, sellPackaging } = CHICKEN_OPTION_COMBOS[i]
          const preserved = existingPriceByStep.get(`${size}__${part}`)
          const optRes = await savePosMenuOption({
            menuId: Number(menu.id),
            name: `${size} - ${part}`,
            priceModifier: preserved?.hall ?? 0,
            priceModifierDelivery: preserved?.delivery ?? null,
            priceModifierPackaging: preserved?.packaging ?? null,
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
      const selectedMenuId: string = optionsConfigSelectedMenuId ?? ""
      if (selectedMenuId && chickenMenus.some((m) => String(m.id) === selectedMenuId)) {
        getPosMenuOptions({ menuId: selectedMenuId }).then(applyLoadedOptionsForConfig)
      }
    } catch (e) {
      console.error("handleChickenBatchApply:", e)
      const errorMessage = (e as { message?: string }).message
      const message = errorMessage?.trim() || String(e)
      await appAlert(message)
    } finally {
      setChickenBatchApplying(false)
    }
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

  const handleOptionChannelsChangeForConfig = (
    opt: PosMenuOption,
    patch: Partial<Pick<PosMenuOption, "sellHall" | "sellDelivery" | "sellPackaging">>
  ) => {
    setOptionsConfigMenuOptions((prev) =>
      prev.map((o) =>
        o.id === opt.id
          ? {
              ...o,
              ...patch,
            }
          : o
      )
    )
  }

  const handleOptionNameChangeForConfig = (opt: PosMenuOption, value: string) => {
    const name = value
    setOptionsConfigMenuOptions((prev) =>
      prev.map((o) => (o.id === opt.id ? { ...o, name } : o))
    )
  }

  const handleOptionReorderForConfig = React.useCallback((dragId: string, dropId: string) => {
    if (!dragId || !dropId || dragId === dropId) return
    setOptionsConfigMenuOptions((prev) => {
      const from = prev.findIndex((x) => String(x.id) === String(dragId))
      const to = prev.findIndex((x) => String(x.id) === String(dropId))
      if (from < 0 || to < 0) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next.map((row, idx) => ({ ...row, sortOrder: idx }))
    })
  }, [])

  const handleBulkAddValuesForSelectedGroup = React.useCallback(async () => {
    const selectedKey = optionsConfigSelectedGroupKey || optionsConfigStepGroups[0]
    if (!selectedKey) {
      await appAlert(t("posOptionConfigNeedGroupsShort") || "먼저 위에서 선택 단계를 저장하세요.")
      return
    }
    const labels = optionsConfigBulkValuesInput
      .split(/[,，\n\r]+/)
      .map((v) => v.trim())
      .filter(Boolean)
    if (labels.length === 0) {
      await appAlert(t("posOptionBulkValuesRequired") || "추가할 값을 입력해 주세요.")
      return
    }
    const duplicates = new Set(
      optionsConfigMenuOptions.map((o) => String(o.optionStepValues?.[selectedKey] ?? "").trim().toLowerCase()).filter(Boolean)
    )
    const channelPayload = resolveNewOptionChannelPayload()
    const bulkHall = optionsConfigBulkHallPrice.trim() === "" ? channelPayload.priceModifier : Number(optionsConfigBulkHallPrice) || 0
    const bulkDelivery =
      optionsConfigBulkDeliveryPrice.trim() === ""
        ? channelPayload.priceModifierDelivery
        : Number(optionsConfigBulkDeliveryPrice)
    let added = 0
    setOptionsConfigMenuOptions((prev) => {
      const next = [...prev]
      for (const label of labels) {
        const key = label.toLowerCase()
        if (duplicates.has(key)) continue
        const draftId = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${added}`
        next.push({
          id: draftId,
          menuId: optionsConfigSelectedMenuId ?? "",
          name: label,
          priceModifier: bulkHall,
          priceModifierDelivery: bulkDelivery,
          priceModifierPackaging: null,
          sortOrder: next.length,
          optionType: "substitution",
          optionStepValues: { [selectedKey]: label },
          sellHall: channelPayload.sellHall,
          sellDelivery: channelPayload.sellDelivery,
          sellPackaging: channelPayload.sellHall,
        })
        duplicates.add(key)
        added++
      }
      return next
    })
    setOptionsConfigBulkValuesInput("")
    await appAlert(
      added > 0
        ? (t("posOptionBulkAddedCount") || "{n}개를 추가했습니다.").replace("{n}", String(added))
        : (t("posOptionBulkNoNew") || "추가할 새 항목이 없습니다.")
    )
  }, [
    optionsConfigSelectedGroupKey,
    optionsConfigStepGroups,
    optionsConfigBulkValuesInput,
    optionsConfigBulkHallPrice,
    optionsConfigBulkDeliveryPrice,
    optionsConfigMenuOptions,
    resolveNewOptionChannelPayload,
    optionsConfigSelectedMenuId,
    t,
  ])

  const areOptionsEqualForSave = React.useCallback((a: PosMenuOption, b: PosMenuOption) => {
    const normalizeStepValues = (row: PosMenuOption) => {
      const raw = row.optionStepValues ?? null
      if (!raw || typeof raw !== "object") return ""
      const keys = Object.keys(raw).sort()
      const sorted: Record<string, string> = {}
      for (const k of keys) sorted[k] = String(raw[k] ?? "")
      return JSON.stringify(sorted)
    }
    return (
      String(a.name ?? "") === String(b.name ?? "") &&
      Number(a.priceModifier ?? 0) === Number(b.priceModifier ?? 0) &&
      (a.priceModifierDelivery ?? null) === (b.priceModifierDelivery ?? null) &&
      (a.priceModifierPackaging ?? null) === (b.priceModifierPackaging ?? null) &&
      Number(a.sortOrder ?? 0) === Number(b.sortOrder ?? 0) &&
      (a.optionType ?? "substitution") === (b.optionType ?? "substitution") &&
      (a.itemCode ?? null) === (b.itemCode ?? null) &&
      (a.additiveSourceMenuId ?? null) === (b.additiveSourceMenuId ?? null) &&
      Number(a.quantity ?? 1) === Number(b.quantity ?? 1) &&
      normalizeStepValues(a) === normalizeStepValues(b) &&
      (a.sellHall ?? true) === (b.sellHall ?? true) &&
      (a.sellDelivery ?? true) === (b.sellDelivery ?? true) &&
      (a.sellPackaging ?? true) === (b.sellPackaging ?? true)
    )
  }, [])

  const handleSaveOptionsForConfig = async () => {
    if (!optionsConfigSelectedMenuId || optionsConfigMenuOptions.length === 0) return
    try {
      const currentNumericIds = new Set(
        optionsConfigMenuOptions
          .map((o) => String(o.id ?? ""))
          .filter((id) => /^\d+$/.test(id))
      )
      const deletedNumericIds = optionsConfigOriginalOptions
        .map((o) => String(o.id ?? ""))
        .filter((id) => /^\d+$/.test(id) && !currentNumericIds.has(id))

      const normalizedCurrentOptions = optionsConfigMenuOptions.map((o) => ({
        ...o,
        sellPackaging: o.sellHall ?? true,
        priceModifierPackaging: null,
      }))
      const originalMap = new Map(optionsConfigOriginalOptions.map((o) => [String(o.id), o]))
      const changed = normalizedCurrentOptions.filter((o) => {
        const prev = originalMap.get(String(o.id))
        if (!prev) return true
        return !areOptionsEqualForSave(o, prev)
      })
      if (changed.length === 0 && deletedNumericIds.length === 0) {
        await appAlert(t("msg_save_success") || "저장되었습니다.")
        return
      }
      setOptionsConfigSaving(true)

      if (deletedNumericIds.length > 0) {
        for (const id of deletedNumericIds) {
          const del = await deletePosMenuOption({ id })
          if (!del.success) {
            await appAlert(del.message || t("msg_delete_fail_detail") || "삭제 실패")
            return
          }
        }
      }

      if (changed.length === 0) {
        const refreshed = await getPosMenuOptions({ menuId: optionsConfigSelectedMenuId })
        applyLoadedOptionsForConfig(refreshed)
        await appAlert(t("msg_save_success") || "저장되었습니다.")
        return
      }

      const res = await savePosMenuOptionsBulk({
        options: changed.map((o) => ({
          id: /^\d+$/.test(String(o.id ?? "")) ? String(o.id) : undefined,
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
        })),
      })
      if (!res.success) {
        const firstError =
          "results" in res && Array.isArray(res.results)
            ? res.results.find((x: { success: boolean; message?: string }) => !x.success)
            : undefined
        await appAlert(firstError?.message || res.message || t("msg_save_fail_detail"))
        return
      }
      const refreshed = await getPosMenuOptions({ menuId: optionsConfigSelectedMenuId })
      applyLoadedOptionsForConfig(refreshed)
      await appAlert(t("msg_save_success") || "저장되었습니다.")
    } catch (e) {
      console.error("handleSaveOptionsForConfig:", e)
      await appAlert(e instanceof Error ? e.message : String(e))
    } finally {
      setOptionsConfigSaving(false)
    }
  }

  const handleResetOptionsForConfig = async () => {
    if (!optionsConfigSelectedMenuId || optionsConfigMenuOptions.length === 0) return
    if (!await appConfirm(t("posMenuOptionsConfigResetConfirm") || "선택한 메뉴의 모든 옵션을 삭제합니다. 계속하시겠습니까?")) return
    try {
      for (const o of optionsConfigMenuOptions) {
        if (!/^\d+$/.test(String(o.id ?? ""))) continue
        const res = await deletePosMenuOption({ id: o.id })
        if (!res.success) {
          await appAlert(res.message)
          return
        }
      }
      setOptionsConfigMenuOptions([])
      getPosMenuOptions({ menuId: optionsConfigSelectedMenuId }).then(applyLoadedOptionsForConfig)
      await appAlert(t("posMenuOptionsConfigResetDone") || "초기화되었습니다.")
    } catch (e) {
      console.error("handleResetOptionsForConfig:", e)
      await appAlert(e instanceof Error ? e.message : String(e))
    }
  }

  const handleDeleteOptionForConfig = async (opt: PosMenuOption) => {
    if (!await appConfirm(`"${opt.name}" ${t("posMenuConfirmDelete")}`)) return
    if (!/^\d+$/.test(String(opt.id ?? ""))) {
      await appAlert(
        t("posOptionConfigDeleteFromGroupHint") ||
          "이 옵션은 옵션그룹 링크에서 생성된 항목입니다. 왼쪽 '옵션그룹 마스터'에서 항목을 삭제한 뒤 저장해 주세요."
      )
      setOptionsConfigMenuOptions((prev) => prev.filter((o) => o.id !== opt.id))
      return
    }
    const res = await deletePosMenuOption({ id: opt.id })
    if (res.success) {
      setOptionsConfigMenuOptions((prev) => prev.filter((o) => o.id !== opt.id))
      setOptionsConfigOriginalOptions((prev) => prev.filter((o) => o.id !== opt.id))
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

  const handleDownloadFilteredMenusExcel = React.useCallback(async () => {
    if (filteredMenus.length === 0) {
      await appAlert(t("itemsNoResults") || "다운로드할 메뉴가 없습니다.")
      return
    }
    try {
      const XLSX = await import("xlsx")
      const rows = filteredMenus.map((m) => ({
        [t("itemsColCode") || "코드"]: m.code ?? "",
        [t("posMenuName") || "메뉴명"]: m.name ?? "",
        [t("posMenuCategoryMain") || "대분류"]: m.categoryMain ?? "",
        [t("posMenuCategory") || "카테고리"]: m.category ?? "",
        [t("posMenuPriceHall") || "홀 가격"]: Number(m.price ?? 0),
        [t("posMenuPriceDelivery") || "배달 가격"]: Number(m.priceDelivery ?? 0),
        [t("posMenuVatIncluded") || "부가세 포함"]: m.vatIncluded ? (t("yes") || "Y") : (t("no") || "N"),
        [t("posMenuActive") || "활성"]: m.isActive ? (t("yes") || "Y") : (t("no") || "N"),
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, t("posMenuList") || "메뉴 목록")
      const bangkokDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .format(new Date())
        .replace(/-/g, "")
      XLSX.writeFile(wb, `pos-menus-${bangkokDate}.xlsx`)
    } catch (e) {
      await appAlert(String(e instanceof Error ? e.message : e))
    }
  }, [filteredMenus, t])

  const handleDownloadAllMenusDetailedExcel = React.useCallback(async () => {
    if (menus.length === 0) {
      await appAlert(t("itemsNoResults") || "다운로드할 메뉴가 없습니다.")
      return
    }
    try {
      const XLSX = await import("xlsx")
      const sortedMenus = sortByCode([...menus], (m) => m.code)
      const menuRows = sortedMenus.map((m) => ({
        id: m.id ?? "",
        [t("itemsColCode") || "코드"]: m.code ?? "",
        [t("posMenuName") || "메뉴명"]: m.name ?? "",
        [t("posMenuCategoryMain") || "대분류"]: m.categoryMain ?? "",
        [t("posMenuCategory") || "카테고리"]: m.category ?? "",
        [t("posMenuPriceHall") || "홀 가격"]: Number(m.price ?? 0),
        [t("posMenuPriceDelivery") || "배달 가격"]: Number(m.priceDelivery ?? 0),
        [t("posMenuVatIncluded") || "부가세 포함"]: m.vatIncluded ? (t("yes") || "Y") : (t("no") || "N"),
        [t("posMenuActive") || "활성"]: m.isActive ? (t("yes") || "Y") : (t("no") || "N"),
        soldOutDate: m.soldOutDate ?? "",
        isBanban: m.isBanban ? (t("yes") || "Y") : (t("no") || "N"),
        promoId: m.promoId ?? "",
        kitchenPrinter: m.kitchenPrinter ?? "",
        cookingTimeMin: m.cookingTimeMin ?? "",
        optionSelectionGroups: Array.isArray(m.optionSelectionGroups) ? m.optionSelectionGroups.join(", ") : "",
        descriptionDefault: m.descriptionDefault ?? "",
        descriptionDelivery: m.descriptionDelivery ?? "",
        descriptionTable: m.descriptionTable ?? "",
        imageUrl: m.imageUrl ?? "",
      }))

      const allOptions = await getPosMenuOptions({ fresh: true }).catch(() => [])
      const menuById = new Map(sortedMenus.map((m) => [m.id, m]))
      const optionRows = [...allOptions]
        .sort((a, b) => {
          const aMenu = menuById.get(a.menuId)?.code ?? ""
          const bMenu = menuById.get(b.menuId)?.code ?? ""
          if (aMenu !== bMenu) return aMenu.localeCompare(bMenu, "en")
          return (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
        })
        .map((opt) => {
          const menu = menuById.get(opt.menuId)
          return {
            menuId: opt.menuId ?? "",
            menuCode: menu?.code ?? "",
            menuName: menu?.name ?? "",
            optionId: opt.id ?? "",
            optionName: opt.name ?? "",
            sortOrder: opt.sortOrder ?? 0,
            priceModifierHall: Number(opt.priceModifier ?? 0),
            priceModifierDelivery: Number(opt.priceModifierDelivery ?? 0),
            priceModifierPackaging: Number(opt.priceModifierPackaging ?? 0),
            optionType: opt.optionType ?? "",
            itemCode: opt.itemCode ?? "",
            additiveSourceMenuId: opt.additiveSourceMenuId ?? "",
            quantity: opt.quantity ?? "",
            sellHall: opt.sellHall === false ? (t("no") || "N") : (t("yes") || "Y"),
            sellDelivery: opt.sellDelivery === false ? (t("no") || "N") : (t("yes") || "Y"),
            sellPackaging: opt.sellPackaging === false ? (t("no") || "N") : (t("yes") || "Y"),
            descriptionDefault: opt.descriptionDefault ?? "",
            descriptionDelivery: opt.descriptionDelivery ?? "",
            descriptionTable: opt.descriptionTable ?? "",
            optionStepValues: opt.optionStepValues ? JSON.stringify(opt.optionStepValues) : "",
          }
        })

      const wb = XLSX.utils.book_new()
      const wsMenus = XLSX.utils.json_to_sheet(menuRows)
      XLSX.utils.book_append_sheet(wb, wsMenus, t("posMenuList") || "메뉴 목록")
      const wsOptions = XLSX.utils.json_to_sheet(optionRows)
      XLSX.utils.book_append_sheet(wb, wsOptions, t("posFormTabOptions") || "옵션")
      const bangkokDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .format(new Date())
        .replace(/-/g, "")
      XLSX.writeFile(wb, `pos-menus-all-detailed-${bangkokDate}.xlsx`)
    } catch (e) {
      await appAlert(String(e instanceof Error ? e.message : e))
    }
  }, [menus, t])

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

  const deliveryCategoryRows = React.useMemo(() => {
    const keySet = new Set<string>()
    const rows: Array<{ main: string; category: string; key: string }> = []
    for (const m of menus) {
      const main = String(m.categoryMain ?? "").trim()
      const category = String(m.category ?? "").trim()
      if (!category) continue
      const key = `${main}::${category}`
      if (keySet.has(key)) continue
      keySet.add(key)
      rows.push({ main, category, key })
    }
    const fallbackRank = new Map<string, number>()
    rows.forEach((r, i) => fallbackRank.set(r.key, i + 1))
    rows.sort((a, b) => {
      const ao = Number(deliveryOpsCategoryOrderMap[a.key] ?? fallbackRank.get(a.key) ?? 9999)
      const bo = Number(deliveryOpsCategoryOrderMap[b.key] ?? fallbackRank.get(b.key) ?? 9999)
      if (ao !== bo) return ao - bo
      if (a.main !== b.main) return a.main.localeCompare(b.main)
      return a.category.localeCompare(b.category)
    })
    return rows
  }, [menus, deliveryOpsCategoryOrderMap])

  const loadDeliveryOpsPolicy = React.useCallback(async () => {
    const storeCode = String(deliveryOpsStoreCode || "").trim()
    if (!storeCode) return
    setDeliveryOpsLoading(true)
    try {
      const res = await getPosDeliveryAppPolicies({ storeCode, appCode: deliveryOpsAppCode })
      if (!res?.success) throw new Error((res as { message?: string })?.message || "load_failed")
      setDeliveryOpsAppPolicy({
        storeCode,
        appCode: deliveryOpsAppCode,
        enabled: Boolean(res.appPolicy?.enabled ?? true),
        orderAcceptanceMode: (res.appPolicy?.orderAcceptanceMode ?? "manual") as "manual" | "auto",
        autoAcceptEnabled: Boolean(res.appPolicy?.autoAcceptEnabled ?? false),
        updatedAt: res.appPolicy?.updatedAt,
      })
      const menuMap: Record<string, PosDeliveryMenuPolicy> = {}
      for (const row of res.menuPolicies || []) {
        menuMap[String(row.menuId)] = row
      }
      setDeliveryOpsMenuPolicyMap(menuMap)
      const catMap: Record<string, number> = {}
      for (const row of res.categoryOrders || []) {
        const key = `${String(row.categoryMain ?? "").trim()}::${String(row.category ?? "").trim()}`
        if (key.endsWith("::")) continue
        const n = Number(row.sortOrder ?? 0) || 0
        if (n > 0) catMap[key] = n
      }
      setDeliveryOpsCategoryOrderMap(catMap)
    } catch (e) {
      await appAlert(translateApiMessage(String(e ?? "load_failed"), t))
    } finally {
      setDeliveryOpsLoading(false)
    }
  }, [deliveryOpsStoreCode, deliveryOpsAppCode, t])

  const buildDeliveryOpsSavePayload = React.useCallback((storeCode: string) => {
    const menuPolicies: PosDeliveryMenuPolicy[] = menus.map((m) => {
      const k = String(m.id)
      const row = deliveryOpsMenuPolicyMap[k]
      return {
        storeCode,
        appCode: deliveryOpsAppCode,
        menuId: Number(m.id),
        enabled: Boolean(row?.enabled ?? true),
        sortOrder: Number(row?.sortOrder ?? m.sortOrder ?? 0) || 0,
        sellStartTime: row?.sellStartTime ?? null,
        sellEndTime: row?.sellEndTime ?? null,
        stockQty: row?.stockQty == null ? null : Number(row.stockQty),
        soldOut: Boolean(row?.soldOut ?? false),
        autoStopOnZero: Boolean(row?.autoStopOnZero ?? true),
        imageUrl: String(row?.imageUrl ?? "").trim() || null,
      }
    })
    const categoryOrders = deliveryCategoryRows.map((r, idx) => ({
      storeCode,
      appCode: deliveryOpsAppCode,
      categoryMain: r.main,
      category: r.category,
      sortOrder: Math.max(1, Number(deliveryOpsCategoryOrderMap[r.key] ?? idx + 1) || (idx + 1)),
    }))
    return { menuPolicies, categoryOrders }
  }, [menus, deliveryOpsMenuPolicyMap, deliveryOpsAppCode, deliveryCategoryRows, deliveryOpsCategoryOrderMap])

  React.useEffect(() => {
    if (mainTab !== "deliveryOps") return
    void loadDeliveryOpsPolicy()
  }, [mainTab, loadDeliveryOpsPolicy])

  const upsertDeliveryMenuPolicy = React.useCallback((menuId: string, patch: Partial<PosDeliveryMenuPolicy>) => {
    setDeliveryOpsMenuPolicyMap((prev) => {
      const base = prev[menuId] || {
        storeCode: deliveryOpsStoreCode,
        appCode: deliveryOpsAppCode,
        menuId: Number(menuId) || 0,
        enabled: true,
        sortOrder: 0,
        sellStartTime: null,
        sellEndTime: null,
        stockQty: null,
        soldOut: false,
        autoStopOnZero: true,
        imageUrl: null,
      }
      return {
        ...prev,
        [menuId]: {
          ...base,
          ...patch,
          menuId: Number(menuId) || base.menuId,
          storeCode: deliveryOpsStoreCode,
          appCode: deliveryOpsAppCode,
        },
      }
    })
  }, [deliveryOpsStoreCode, deliveryOpsAppCode])

  const handleUploadDeliveryMenuImage = React.useCallback(
    async (menu: PosMenu, file: File) => {
      const menuId = String(menu.id)
      if (!file) return
      setDeliveryOpsImageUploadingMenuId(menuId)
      try {
        let toSend = file
        try {
          toSend = await preparePosMenuImageFileForUpload(file)
        } catch (prepErr) {
          const pmsg = String(prepErr)
          if (pmsg.includes("POS_MENU_IMAGE_DECODE_FAIL")) {
            await appAlert(t("posMenuImageDecodeFail") || "이미지를 열 수 없습니다. JPG·PNG·WebP 등으로 저장 후 다시 시도해 주세요.")
          } else {
            await appAlert(pmsg)
          }
          return
        }
        const res = await uploadPosMenuImage({ file: toSend })
        if (res?.success && res?.url) {
          upsertDeliveryMenuPolicy(menuId, { imageUrl: res.url })
          return
        }
        const msg =
          res?.message === POS_MENU_UPLOAD_TOO_LARGE
            ? t("posMenuImageUploadTooLarge") ||
              "파일이 너무 큽니다. 더 작은 사진을 선택하거나, 이미지 주소(URL)로 등록해 주세요."
            : res?.message || t("msg_upload_fail") || "업로드 실패"
        await appAlert(msg)
      } catch (e) {
        await appAlert(translateApiMessage(String(e ?? "upload_failed"), t))
      } finally {
        setDeliveryOpsImageUploadingMenuId(null)
      }
    },
    [t, upsertDeliveryMenuPolicy]
  )

  const handleSaveDeliveryOpsPolicy = React.useCallback(async () => {
    const storeCode = String(deliveryOpsStoreCode || "").trim()
    if (!storeCode) {
      await appAlert(t("store") || "매장을 먼저 선택해 주세요.")
      return
    }
    setDeliveryOpsSaving(true)
    try {
      const { menuPolicies, categoryOrders } = buildDeliveryOpsSavePayload(storeCode)
      const res = await savePosDeliveryAppPolicies({
        storeCode,
        appCode: deliveryOpsAppCode,
        appPolicy: {
          storeCode,
          appCode: deliveryOpsAppCode,
          enabled: Boolean(deliveryOpsAppPolicy.enabled),
          orderAcceptanceMode: deliveryOpsAppPolicy.orderAcceptanceMode,
          autoAcceptEnabled: false,
        },
        menuPolicies,
        categoryOrders,
      })
      if (!res?.success) {
        throw new Error(res?.message || "save_failed")
      }
      await appAlert(t("msg_save_success") || "저장되었습니다.")
      await loadDeliveryOpsPolicy()
    } catch (e) {
      await appAlert(translateApiMessage(String(e ?? "save_failed"), t))
    } finally {
      setDeliveryOpsSaving(false)
    }
  }, [
    deliveryOpsStoreCode,
    deliveryOpsAppCode,
    deliveryOpsAppPolicy,
    buildDeliveryOpsSavePayload,
    loadDeliveryOpsPolicy,
    t,
  ])

  const handleCopyDeliveryOpsFromStore = React.useCallback(async () => {
    const targetStoreCode = String(deliveryOpsStoreCode || "").trim()
    const sourceStoreCode = String(deliveryOpsCopySourceStore || "").trim()
    if (!targetStoreCode) {
      await appAlert(t("store") || "매장을 먼저 선택해 주세요.")
      return
    }
    if (!sourceStoreCode || sourceStoreCode === targetStoreCode) {
      await appAlert(t("posScreenConfigCopyPickOtherStore") || "다른 매장을 원본으로 선택하세요.")
      return
    }
    setDeliveryOpsCopying(true)
    try {
      const res = await getPosDeliveryAppPolicies({
        storeCode: sourceStoreCode,
        appCode: deliveryOpsAppCode,
      })
      if (!res?.success) throw new Error((res as { message?: string })?.message || "load_failed")
      setDeliveryOpsAppPolicy({
        storeCode: targetStoreCode,
        appCode: deliveryOpsAppCode,
        enabled: Boolean(res.appPolicy?.enabled ?? true),
        orderAcceptanceMode: (res.appPolicy?.orderAcceptanceMode ?? "manual") as "manual" | "auto",
        autoAcceptEnabled: false,
      })
      const menuMap: Record<string, PosDeliveryMenuPolicy> = {}
      for (const row of res.menuPolicies || []) {
        menuMap[String(row.menuId)] = {
          ...row,
          storeCode: targetStoreCode,
          appCode: deliveryOpsAppCode,
        }
      }
      setDeliveryOpsMenuPolicyMap(menuMap)
      const catMap: Record<string, number> = {}
      for (const row of res.categoryOrders || []) {
        const key = `${String(row.categoryMain ?? "").trim()}::${String(row.category ?? "").trim()}`
        if (key.endsWith("::")) continue
        const n = Number(row.sortOrder ?? 0) || 0
        if (n > 0) catMap[key] = n
      }
      setDeliveryOpsCategoryOrderMap(catMap)
      await appAlert(t("posScreenConfigDeliveryCopyDone") || "복사가 완료되었습니다. 저장 후 적용됩니다.")
    } catch (e) {
      await appAlert(translateApiMessage(String(e ?? "load_failed"), t))
    } finally {
      setDeliveryOpsCopying(false)
    }
  }, [deliveryOpsStoreCode, deliveryOpsCopySourceStore, deliveryOpsAppCode, t])


  const handleApplyDeliveryOpsToAllStores = React.useCallback(async () => {
    if (!canSearchAllStores) return
    const sourceStoreCode = String(deliveryOpsStoreCode || "").trim()
    if (!sourceStoreCode) {
      await appAlert(t("store") || "매장을 먼저 선택해 주세요.")
      return
    }
    const targets = stores.filter((s) => s && s !== sourceStoreCode)
    if (targets.length === 0) {
      await appAlert(t("noData") || "적용할 다른 매장이 없습니다.")
      return
    }
    const ok = await appConfirm(
      ((t("posDeliveryOpsApplyAllConfirm") || "{{n}}개 매장에 현재 배달앱 운영 설정을 전체 적용할까요?").includes("Apply to all stores")
        ? "{{n}}개 매장에 현재 배달앱 운영 설정을 전체 적용할까요?"
        : t("posDeliveryOpsApplyAllConfirm") || "{{n}}개 매장에 현재 배달앱 운영 설정을 전체 적용할까요?")
        .replace("{{n}}", String(targets.length))
    )
    if (!ok) return
    setDeliveryOpsApplyingAll(true)
    try {
      const { menuPolicies, categoryOrders } = buildDeliveryOpsSavePayload(sourceStoreCode)
      let done = 0
      for (const targetStore of targets) {
        const res = await savePosDeliveryAppPolicies({
          storeCode: targetStore,
          appCode: deliveryOpsAppCode,
          appPolicy: {
            storeCode: targetStore,
            appCode: deliveryOpsAppCode,
            enabled: Boolean(deliveryOpsAppPolicy.enabled),
            orderAcceptanceMode: deliveryOpsAppPolicy.orderAcceptanceMode,
            autoAcceptEnabled: false,
          },
          menuPolicies: menuPolicies.map((row) => ({ ...row, storeCode: targetStore })),
          categoryOrders: categoryOrders.map((row) => ({ ...row, storeCode: targetStore })),
        })
        if (!res?.success) {
          throw new Error(`${targetStore}: ${res?.message || "save_failed"}`)
        }
        done += 1
      }
      await appAlert(
        ((t("posDeliveryOpsApplyAllDone") || "{{n}}개 매장에 전체 적용했습니다.").includes("Applied to")
          ? "{{n}}개 매장에 전체 적용했습니다."
          : t("posDeliveryOpsApplyAllDone") || "{{n}}개 매장에 전체 적용했습니다.").replace("{{n}}", String(done))
      )
    } catch (e) {
      await appAlert(translateApiMessage(String(e ?? "save_failed"), t))
    } finally {
      setDeliveryOpsApplyingAll(false)
    }
  }, [canSearchAllStores, deliveryOpsStoreCode, stores, t, buildDeliveryOpsSavePayload, deliveryOpsAppCode, deliveryOpsAppPolicy])


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
          <AdminTabsBarWithHelp>
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
                <TabsTrigger value="finalPrice" className={adminTabsTriggerCn}>
                  <Calculator className={adminTabsIconCn} aria-hidden />
                  {t("posPricingTab") || "최종가격"}
                </TabsTrigger>
                <TabsTrigger value="deliveryOps" className={adminTabsTriggerCn}>
                  <Monitor className={adminTabsIconCn} aria-hidden />
                  {t("posMenuTabDeliveryOps") || "배달앱 운영"}
                </TabsTrigger>
              </TabsList>
          </AdminTabsBarWithHelp>
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
                        <TabsTrigger value="description" className={adminTabsTriggerCn}>
                          {t("posFormTabDescription") || "설명"}
                        </TabsTrigger>
                        <TabsTrigger value="packagingChecklist" className={adminTabsTriggerCn}>
                          {t("posFormTabPackagingChecklist") || "포장 체크리스트"}
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
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-xs text-muted-foreground">{t("posMenuCostRatio") || "최종 원가율"}</span>
                          <span className="ml-2 text-lg font-bold text-amber-600">
                            {baseMenuCost != null && (Number(formData.price) || 0) > 0
                              ? `${((baseMenuCost / (Number(formData.price) || 1)) * 100).toFixed(1)}%`
                              : "-"}
                          </span>
                        </div>
                        {editingId && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={() => {
                              const qs = new URLSearchParams({
                                menuId: editingId,
                                menuCode: formData.code || "",
                              })
                              window.location.href = `/admin/pos-cost-analysis?${qs.toString()}`
                            }}
                          >
                            {t("posMenuCostAnalysisShortcut") || "원가 분석 바로가기"}
                          </Button>
                        )}
                      </div>
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
                          <span className="shrink-0 py-2 text-muted-foreground w-16">{t("posChannel") || "채널"}</span>
                          <Select value={newOptionChannelScope} onValueChange={(v) => setNewOptionChannelScope(v as "all" | "hall" | "delivery" | "packaging")}>
                            <SelectTrigger className="h-8 w-32 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">{t("all") || "전체"}</SelectItem>
                              <SelectItem value="hall">{t("posOptionSellHall") || "홀"}</SelectItem>
                              <SelectItem value="delivery">{t("posOptionSellDelivery") || "배달"}</SelectItem>
                              <SelectItem value="packaging">{t("posOptionSellPackaging") || "포장"}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
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
                              <th className="px-3 py-2 text-right font-semibold">{t("quantity") || "수량"}</th>
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
                  <TabsContent value="description" className="mt-4 space-y-4">
                    <div className="rounded-md border border-border/70 bg-muted/20 p-3 space-y-3">
                      <h4 className="text-xs font-semibold">
                        {t("posMenuDescriptionSection") || "메뉴 설명 (배달앱/테이블오더용)"}
                      </h4>
                      <div>
                        <label className="text-xs font-semibold">
                          {t("posMenuDescriptionDefault") || "기본 설명"}
                        </label>
                        <Textarea
                          className="mt-1 min-h-[72px] text-xs"
                          placeholder={t("posMenuDescriptionDefaultPh") || "메뉴 기본 설명을 입력하세요."}
                          value={formData.descriptionDefault}
                          onChange={(e) =>
                            setFormData((p) => ({ ...p, descriptionDefault: e.target.value }))
                          }
                          disabled={!!editingMenuLinkedPromoId}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold">
                          {t("posMenuDescriptionDelivery") || "배달앱 설명 (비우면 기본 설명 사용)"}
                        </label>
                        <Textarea
                          className="mt-1 min-h-[60px] text-xs"
                          placeholder={t("posMenuDescriptionDeliveryPh") || "Grab/LineMan 등에 노출할 설명"}
                          value={formData.descriptionDelivery}
                          onChange={(e) =>
                            setFormData((p) => ({ ...p, descriptionDelivery: e.target.value }))
                          }
                          disabled={!!editingMenuLinkedPromoId}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold">
                          {t("posMenuDescriptionTable") || "테이블오더 설명 (비우면 기본 설명 사용)"}
                        </label>
                        <Textarea
                          className="mt-1 min-h-[60px] text-xs"
                          placeholder={t("posMenuDescriptionTablePh") || "테이블오더(QR 메뉴)용 설명"}
                          value={formData.descriptionTable}
                          onChange={(e) =>
                            setFormData((p) => ({ ...p, descriptionTable: e.target.value }))
                          }
                          disabled={!!editingMenuLinkedPromoId}
                        />
                      </div>
                    </div>
                    <div className="rounded border border-border/70 bg-muted/20 p-3 space-y-2">
                      <h4 className="text-xs font-semibold">
                        {t("posOptionDescriptionEdit") || "옵션 설명 수정"}
                      </h4>
                      {menuOptions.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {t("posOptionDescriptionEmpty") || "옵션이 없습니다. 먼저 옵션 탭에서 옵션을 추가해 주세요."}
                        </p>
                      ) : (
                        <>
                          <Select
                            value={selectedOptionDescId}
                            onValueChange={setSelectedOptionDescId}
                          >
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue
                                placeholder={t("posOptionDescriptionSelect") || "옵션 선택"}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {menuOptions.map((o) => (
                                <SelectItem key={o.id} value={o.id}>
                                  {optionPartLabel(o.name)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {selectedOptionDescId && (
                            <div className="grid gap-2">
                              <Textarea
                                className="min-h-[56px] text-xs"
                                placeholder={t("posOptionDescriptionDefaultPh") || "옵션 기본 설명"}
                                value={optionDescDefaultDraft}
                                onChange={(e) => setOptionDescDefaultDraft(e.target.value)}
                              />
                              <Textarea
                                className="min-h-[48px] text-xs"
                                placeholder={t("posOptionDescriptionDeliveryPh") || "배달앱 옵션 설명 (비우면 기본 설명)"}
                                value={optionDescDeliveryDraft}
                                onChange={(e) => setOptionDescDeliveryDraft(e.target.value)}
                              />
                              <Textarea
                                className="min-h-[48px] text-xs"
                                placeholder={t("posOptionDescriptionTablePh") || "테이블오더 옵션 설명 (비우면 기본 설명)"}
                                value={optionDescTableDraft}
                                onChange={(e) => setOptionDescTableDraft(e.target.value)}
                              />
                              <div className="flex justify-end">
                                <Button size="sm" onClick={handleSaveOptionDescription}>
                                  {t("itemsBtnSave") || "저장"}
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </TabsContent>
                  <TabsContent value="packagingChecklist" className="mt-4 space-y-3">
                    <div className="rounded-md border border-border/70 bg-muted/20 p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold">
                          {t("posPackagingChecklistTitle") || "포장 체크리스트"}
                        </h4>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => setPackagingChecklistRows((prev) => [...prev, newPackagingChecklistRow(prev.length)])}
                          >
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            {t("posPackagingChecklistAddRow") || "항목 추가"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={handleSavePackagingChecklist}
                            disabled={packagingChecklistSaving || packagingChecklistLoading}
                          >
                            {packagingChecklistSaving ? (t("loading") || "저장 중...") : (t("itemsBtnSave") || "저장")}
                          </Button>
                        </div>
                      </div>
                      {packagingChecklistLoading ? (
                        <p className="text-xs text-muted-foreground">{t("loading") || "불러오는 중..."}</p>
                      ) : packagingChecklistRows.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {t("posPackagingChecklistEmpty") || "등록된 체크 항목이 없습니다. [추가]로 첫 항목을 만드세요."}
                        </p>
                      ) : (
                        <div className="divide-y rounded-md border bg-background">
                          {packagingChecklistRows.map((row) => (
                            <div key={row.localId} className="grid grid-cols-12 gap-2 p-2 md:items-end">
                              <div className="col-span-12 md:col-span-8">
                                <label className="mb-1 block text-[11px] font-semibold">{t("posPackagingChecklistColItemName") || "항목명"}</label>
                                <Input
                                  className="h-8 text-xs"
                                  value={row.itemName}
                                  onChange={(e) => handlePackagingChecklistRowPatch(row.localId, { itemName: e.target.value })}
                                  placeholder={t("posPackagingChecklistItemNamePh") || "예: 소스컵 2개"}
                                />
                              </div>
                              <div className="col-span-6 md:col-span-4">
                                <label className="mb-1 block text-[11px] font-semibold">{t("posPackagingChecklistMenuCommon") || "메뉴 공통"}</label>
                                <div className="h-8 rounded-md border bg-muted/40 px-2 text-xs text-muted-foreground flex items-center">
                                  {t("posPackagingChecklistMenuCommon") || "메뉴 공통"}
                                </div>
                              </div>
                              <div className="col-span-12 flex items-center justify-between gap-2 text-xs">
                                <div className="flex items-center gap-4">
                                  <label className="inline-flex items-center gap-2">
                                    <Checkbox
                                      checked={row.isRequired}
                                      onCheckedChange={(v) => handlePackagingChecklistRowPatch(row.localId, { isRequired: v === true })}
                                    />
                                    <span>{t("posRequired") || "필수 항목"}</span>
                                  </label>
                                  <label className="inline-flex items-center gap-2">
                                    <Checkbox
                                      checked={row.isActive}
                                      onCheckedChange={(v) => handlePackagingChecklistRowPatch(row.localId, { isActive: v === true })}
                                    />
                                    <span>{t("use") || "사용"}</span>
                                  </label>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-destructive hover:text-destructive"
                                  onClick={() => handlePackagingChecklistRowRemove(row.localId)}
                                  title={t("delete") || "삭제"}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
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
                            onClick={async () => {
                              const trimmed = formData.categoryMain.trim()
                              setFormData((p) => ({ ...p, categoryMain: trimmed }))
                              setCategoryMainOpen(false)
                              if ((CODE_AUTO_MAINS as readonly string[]).includes(trimmed)) {
                                const { code: next } = await getNextPosMenuCode(trimmed)
                                if (next) setFormData((p) => ({ ...p, categoryMain: trimmed, code: next }))
                              }
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
                      disabled={
                        (CODE_AUTO_MAINS as readonly string[]).includes(formData.categoryMain) &&
                        !!formData.code.trim()
                      }
                      title={
                        (CODE_AUTO_MAINS as readonly string[]).includes(formData.categoryMain)
                          ? (t("posMenuCodeAuto") || "대분류 선택 시 자동 생성")
                          : undefined
                      }
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
                  onClick={() => void handleDownloadFilteredMenusExcel()}
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  {t("outExcelDownload") || "엑셀 다운로드"} ({t("btn_query") || "조회"})
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => void handleDownloadAllMenusDetailedExcel()}
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  {t("outExcelDownload") || "엑셀 다운로드"} ({t("all") || "전체"})
                </Button>
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
              <p className="text-xs text-muted-foreground">
                {t("posChickenBatchHint") || "코드가 c로 시작하는 메뉴(치킨)에 S/M·부위 옵션을 한 번에 적용할 수 있습니다."}
              </p>
              <Button variant="outline" size="sm" onClick={handleChickenBatchApply} disabled={chickenBatchApplying}>
                {chickenBatchApplying ? (t("loading") || "적용 중...") : (t("posChickenBatchButton") || "치킨 메뉴 일괄 옵션 적용")}
              </Button>
            </div>
            <div className="mb-4 grid gap-3 xl:grid-cols-2">
              <div className="rounded-xl border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold">
                    {t("posOptionTemplateLibraryTitle") || "옵션그룹 마스터"}
                  </h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => {
                      setOptionGroupMasterSelectedId("")
                      setOptionGroupMasterKey("")
                      setOptionGroupMasterName("")
                      setOptionGroupMasterItems([])
                    }}
                  >
                    {t("new") || "신규"}
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    className="h-8 text-xs"
                    placeholder="group key (size, side...)"
                    value={optionGroupMasterKey}
                    onChange={(e) => setOptionGroupMasterKey(e.target.value)}
                  />
                  <Input
                    className="h-8 text-xs"
                    placeholder={t("posOptionGroupName") || "옵션그룹 이름"}
                    value={optionGroupMasterName}
                    onChange={(e) => setOptionGroupMasterName(e.target.value)}
                  />
                </div>
                <div className="rounded border p-2 space-y-2">
                  {(optionGroupMasterItems || []).map((item, idx) => (
                    <div key={item.id || `new-${idx}`} className="grid grid-cols-[1fr_80px_80px_auto] gap-1">
                      <Input
                        className="h-7 text-xs"
                        value={item.itemName}
                        placeholder={t("posOptionTitle") || "항목명"}
                        onChange={(e) =>
                          setOptionGroupMasterItems((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, itemName: e.target.value } : x
                            )
                          )
                        }
                      />
                      <Input
                        className="h-7 text-xs text-right"
                        type="number"
                        value={String(item.basePriceHall ?? 0)}
                        onChange={(e) =>
                          setOptionGroupMasterItems((prev) =>
                            prev.map((x, i) =>
                              i === idx
                                ? { ...x, basePriceHall: Number(e.target.value || 0) }
                                : x
                            )
                          )
                        }
                      />
                      <Input
                        className="h-7 text-xs text-right"
                        type="number"
                        value={item.basePriceDelivery == null ? "" : String(item.basePriceDelivery)}
                        placeholder="-"
                        onChange={(e) =>
                          setOptionGroupMasterItems((prev) =>
                            prev.map((x, i) =>
                              i === idx
                                ? {
                                    ...x,
                                    basePriceDelivery:
                                      e.target.value.trim() === ""
                                        ? null
                                        : Number(e.target.value || 0),
                                  }
                                : x
                            )
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px]"
                        onClick={() =>
                          setOptionGroupMasterItems((prev) =>
                            prev.filter((_, i) => i !== idx)
                          )
                        }
                      >
                        {t("delete") || "삭제"}
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() =>
                      setOptionGroupMasterItems((prev) => [
                        ...prev,
                        {
                          id: "",
                          groupId: optionGroupMasterSelectedId || "",
                          itemName: "",
                          sortOrder: prev.length,
                          basePriceHall: 0,
                          basePriceDelivery: null,
                          sellHall: true,
                          sellDelivery: true,
                        },
                      ])
                    }
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    {t("posOptionAddSingle") || "항목 추가"}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-[11px]"
                    disabled={optionGroupMasterSaving}
                    onClick={() => void handleSaveOptionGroupMaster()}
                  >
                    {optionGroupMasterSaving ? (t("saving") || "저장 중...") : (t("save") || "저장")}
                  </Button>
                  {!!optionGroupMasterSelectedId && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={async () => {
                        const ok = await appConfirm(
                          t("confirmDeleteMenu") || "삭제하시겠습니까?"
                        )
                        if (!ok) return
                        await deletePosOptionGroup({ id: optionGroupMasterSelectedId })
                        setOptionGroupMasterSelectedId("")
                        await loadOptionGroupMasters(optionsConfigSelectedMenuId)
                      }}
                    >
                      {t("delete") || "삭제"}
                    </Button>
                  )}
                </div>
                <Input
                  className="h-8 text-xs"
                  value={optionGroupMasterSearchTerm}
                  onChange={(e) => setOptionGroupMasterSearchTerm(e.target.value)}
                  placeholder={t("itemsSearchPh") || "검색"}
                />
                <div className="max-h-40 overflow-y-auto rounded border p-1">
                  {(optionGroupMastersFiltered || []).map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className={cn(
                        "w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted",
                        optionGroupMasterSelectedId === g.id && "bg-primary/10"
                      )}
                      onClick={() => setOptionGroupMasterSelectedId(g.id)}
                    >
                      {g.key} - {g.name}
                    </button>
                  ))}
                  {optionGroupMasterLoading && (
                    <p className="p-2 text-[11px] text-muted-foreground">
                      {t("loading") || "로딩 중..."}
                    </p>
                  )}
                </div>
              </div>
              <div className="rounded-xl border bg-card p-3 space-y-2">
                <h3 className="text-sm font-bold">
                  {t("posMenuOptionsConfigSelectHint") || "선택 메뉴 적용"}
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  {(optionsConfigSelectedMenu?.name || "-") +
                    " / " +
                    (optionsConfigSelectedMenu?.code || "-")}
                </p>
                <div className="max-h-[420px] overflow-y-auto rounded border p-2 space-y-1">
                  {(optionGroupMastersFiltered || []).map((g, idx) => {
                    const link = g.link
                    const enabled = !!link
                    return (
                      <div key={`link-${g.id}`} className="rounded border p-2">
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-xs font-medium">
                            <Checkbox
                              checked={enabled}
                              onCheckedChange={(v) =>
                                setOptionGroupMasters((prev) =>
                                  prev.map((x, idx) =>
                                    x.id !== g.id
                                      ? x
                                      : {
                                          ...x,
                                          link:
                                            v === true
                                              ? {
                                                  id: x.link?.id,
                                                  menuId: optionsConfigSelectedMenuId || "",
                                                  groupId: x.id,
                                                  sortOrder: idx,
                                                  sellHall: true,
                                                  sellDelivery: true,
                                                  required: true,
                                                  minSelect: 1,
                                                  maxSelect: 1,
                                                }
                                              : null,
                                        }
                                  )
                                )
                              }
                            />
                            {g.name}
                          </label>
                          <span className="text-[10px] text-muted-foreground">
                            {g.key}
                          </span>
                        </div>
                        {enabled ? (
                          <div className="mt-2 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="mb-1 text-[10px] text-muted-foreground">
                                  {t("sort_order") || "순서"}
                                </p>
                                <Input
                                  className="h-7 text-right text-xs"
                                  type="number"
                                  value={String(link?.sortOrder ?? 0)}
                                  onChange={(e) =>
                                    setOptionGroupMasters((prev) =>
                                      prev.map((x) =>
                                        x.id === g.id
                                          ? {
                                              ...x,
                                              link: {
                                                ...(x.link || {
                                                  menuId: optionsConfigSelectedMenuId || "",
                                                  groupId: x.id,
                                                  sellHall: true,
                                                  sellDelivery: true,
                                                }),
                                                sortOrder: Number(e.target.value || 0),
                                              },
                                            }
                                          : x
                                      )
                                    )
                                  }
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-1">
                                <label className="rounded border px-1.5 py-1 text-[10px] flex items-center gap-1">
                                  <Checkbox
                                    checked={link?.sellHall !== false}
                                    onCheckedChange={(v) =>
                                      setOptionGroupMasters((prev) =>
                                        prev.map((x) =>
                                          x.id === g.id
                                            ? {
                                                ...x,
                                                link: {
                                                  ...(x.link || {
                                                    menuId: optionsConfigSelectedMenuId || "",
                                                    groupId: x.id,
                                                    sortOrder: 0,
                                                    sellHall: true,
                                                    sellDelivery: true,
                                                  }),
                                                  sellHall: v === true,
                                                },
                                              }
                                            : x
                                        )
                                      )
                                    }
                                  />
                                  {t("posOptionSellHall") || "홀"}
                                </label>
                                <label className="rounded border px-1.5 py-1 text-[10px] flex items-center gap-1">
                                  <Checkbox
                                    checked={link?.sellDelivery !== false}
                                    onCheckedChange={(v) =>
                                      setOptionGroupMasters((prev) =>
                                        prev.map((x) =>
                                          x.id === g.id
                                            ? {
                                                ...x,
                                                link: {
                                                  ...(x.link || {
                                                    menuId: optionsConfigSelectedMenuId || "",
                                                    groupId: x.id,
                                                    sortOrder: 0,
                                                    sellHall: true,
                                                    sellDelivery: true,
                                                  }),
                                                  sellDelivery: v === true,
                                                },
                                              }
                                            : x
                                        )
                                      )
                                    }
                                  />
                                  {t("posOptionSellDelivery") || "배달"}
                                </label>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="mb-1 text-[10px] text-muted-foreground">
                                  {t("posOptionBasePriceLabel") || "홀 가격 오버라이드"}
                                </p>
                                <Input
                                  className="h-7 text-right text-xs"
                                  type="number"
                                  placeholder="-"
                                  value={link?.priceHallOverride == null ? "" : String(link.priceHallOverride)}
                                  onChange={(e) =>
                                    setOptionGroupMasters((prev) =>
                                      prev.map((x) =>
                                        x.id === g.id
                                          ? {
                                              ...x,
                                              link: {
                                                ...(x.link || {
                                                  menuId: optionsConfigSelectedMenuId || "",
                                                  groupId: x.id,
                                                  sortOrder: 0,
                                                  sellHall: true,
                                                  sellDelivery: true,
                                                }),
                                                priceHallOverride:
                                                  e.target.value.trim() === "" ? null : Number(e.target.value || 0),
                                              },
                                            }
                                          : x
                                      )
                                    )
                                  }
                                />
                              </div>
                              <div>
                                <p className="mb-1 text-[10px] text-muted-foreground">
                                  {t("posOptionDeliveryPriceLabel") || "배달 가격 오버라이드"}
                                </p>
                                <Input
                                  className="h-7 text-right text-xs"
                                  type="number"
                                  placeholder="-"
                                  value={link?.priceDeliveryOverride == null ? "" : String(link.priceDeliveryOverride)}
                                  onChange={(e) =>
                                    setOptionGroupMasters((prev) =>
                                      prev.map((x) =>
                                        x.id === g.id
                                          ? {
                                              ...x,
                                              link: {
                                                ...(x.link || {
                                                  menuId: optionsConfigSelectedMenuId || "",
                                                  groupId: x.id,
                                                  sortOrder: 0,
                                                  sellHall: true,
                                                  sellDelivery: true,
                                                }),
                                                priceDeliveryOverride:
                                                  e.target.value.trim() === "" ? null : Number(e.target.value || 0),
                                              },
                                            }
                                          : x
                                      )
                                    )
                                  }
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <label className="rounded border px-1.5 py-1 text-[10px] flex items-center gap-1">
                                <Checkbox
                                  checked={link?.required !== false}
                                  onCheckedChange={(v) =>
                                    setOptionGroupMasters((prev) =>
                                      prev.map((x) =>
                                        x.id === g.id
                                          ? {
                                              ...x,
                                              link: {
                                                ...(x.link || {
                                                  menuId: optionsConfigSelectedMenuId || "",
                                                  groupId: x.id,
                                                  sortOrder: 0,
                                                  sellHall: true,
                                                  sellDelivery: true,
                                                }),
                                                required: v === true,
                                              },
                                            }
                                          : x
                                      )
                                    )
                                  }
                                />
                                {t("required") || "필수"}
                              </label>
                              <Input
                                className="h-7 text-right text-xs"
                                type="number"
                                min={0}
                                value={String(link?.minSelect ?? 0)}
                                onChange={(e) =>
                                  setOptionGroupMasters((prev) =>
                                    prev.map((x) =>
                                      x.id === g.id
                                        ? {
                                            ...x,
                                            link: {
                                              ...(x.link || {
                                                menuId: optionsConfigSelectedMenuId || "",
                                                groupId: x.id,
                                                sortOrder: 0,
                                                sellHall: true,
                                                sellDelivery: true,
                                              }),
                                              minSelect: Math.max(0, Number(e.target.value || 0)),
                                            },
                                          }
                                        : x
                                    )
                                  )
                                }
                              />
                              <Input
                                className="h-7 text-right text-xs"
                                type="number"
                                min={1}
                                value={String(link?.maxSelect ?? 1)}
                                onChange={(e) =>
                                  setOptionGroupMasters((prev) =>
                                    prev.map((x) =>
                                      x.id === g.id
                                        ? {
                                            ...x,
                                            link: {
                                              ...(x.link || {
                                                menuId: optionsConfigSelectedMenuId || "",
                                                groupId: x.id,
                                                sortOrder: 0,
                                                sellHall: true,
                                                sellDelivery: true,
                                              }),
                                              maxSelect: Math.max(1, Number(e.target.value || 1)),
                                            },
                                          }
                                        : x
                                    )
                                  )
                                }
                              />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  onClick={() => void handleSaveMenuGroupLinks()}
                  disabled={!optionsConfigSelectedMenuId || optionGroupMenuLinksSaving}
                >
                  {optionGroupMenuLinksSaving
                    ? t("saving") || "저장 중..."
                    : t("save") || "저장"}
                </Button>
              </div>
            </div>
            <OptionsConfigShell
              menuListPanel={
                <div className="rounded-xl border bg-card overflow-hidden">
                  <div className="border-b px-4 py-3 bg-muted/20 flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold">{t("posMenuList")}</h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {t("posMenuOptionsConfigSelectHint") || "메뉴를 선택하면 옵션을 구성할 수 있습니다"}
                      </p>
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
                          applyLoadedOptionsForConfig(Array.isArray(opts) ? opts : [])
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
                        {mainCategories.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={optionsConfigCategoryFilter} onValueChange={setOptionsConfigCategoryFilter}>
                      <SelectTrigger className="h-9 w-full text-xs">
                        <SelectValue placeholder={t("posMenuCategorySub") || "소분류"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t("posMenuCategoryAll")}</SelectItem>
                        {optionsConfigCategoriesByMain.map((c) => (
                          <SelectItem key={c} value={c}>
                            {translatePosMenuCategoryLabel(c, t)}
                          </SelectItem>
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
                          const optCount = isSelected
                            ? isChickenMenu(m.code)
                              ? (() => {
                                  const nd = optionsConfigMenuOptions.filter((o) => !isChickenDefaultOption(o.name))
                                  const hasHiddenS = optionsConfigMenuOptions.some((o) => isChickenDefaultOption(o.name))
                                  if (nd.length === 0 && hasHiddenS) return 1
                                  return nd.length
                                })()
                              : optionsConfigMenuOptions.length
                            : null
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
                                  <span
                                    className={cn(
                                      "ml-1.5",
                                      isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                                    )}
                                  >
                                    ({optCount})
                                  </span>
                                )}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              }
              optionGroupPanel={
                <OptionGroupListPanel
                  title={t("posOptionSelectionGroups") || "옵션 그룹"}
                  emptyLabel={t("posOptionConfigNeedGroupsShort") || "먼저 위에서 선택 단계를 저장하세요."}
                  requiredLabel={t("posOptionRequiredOne") || "필수 1개 선택"}
                  optionalLabel={t("posOptionOptionalZeroOne") || "선택 0~1개"}
                  groups={optionsConfigGroupPanelItems}
                  selectedGroupKey={optionsConfigSelectedGroupKey || optionsConfigGroupPanelItems[0]?.key || ""}
                  onSelectGroup={setOptionsConfigSelectedGroupKey}
                  onChangeGroupLabel={handleOptionGroupLabelChange}
                  saveGroupsLabel={t("posOptionConfigApplySteps") || "단계 저장"}
                  onSaveGroups={() => void handleApplyOptionGroupsForConfig()}
                  saveGroupsDisabled={optionsConfigApplyingGroups || !!optionsConfigSelectedMenu?.promoId?.trim()}
                  chickenPresetLabel={t("posOptionConfigPresetChicken") || "치킨: size > part"}
                  onApplyChickenPreset={() => void handleApplyOptionPresetAndSave(["size", "part"])}
                  chickenPresetDisabled={
                    optionsConfigApplyingGroups ||
                    !!optionsConfigSelectedMenu?.promoId?.trim() ||
                    !optionsConfigSelectedMenu ||
                    !isChickenMenu(optionsConfigSelectedMenu.code)
                  }
                  moveUpLabel={t("move_up") || "위로"}
                  moveDownLabel={t("move_down") || "아래로"}
                  onMoveGroup={handleMoveOptionGroup}
                  hallLabel={t("posOptionSellHall") || "홀"}
                  deliveryLabel={t("posOptionSellDelivery") || "배달"}
                  onToggleGroupAudience={handleOptionGroupAudienceToggle}
                  libraryTitle={t("posOptionTemplateLibraryTitle") || "공통 옵션그룹 리스트"}
                  librarySearchLabel={t("search") || "검색"}
                  librarySearchPlaceholder={t("posOptionTemplateSearchPlaceholder") || "옵션그룹 이름으로 검색"}
                  librarySearchTerm={optionsConfigLibrarySearchTerm}
                  onLibrarySearchTermChange={setOptionsConfigLibrarySearchTerm}
                  filterAllLabel={t("all") || "전체"}
                  filterRecentLabel={t("posOptionTemplateFilterRecent") || "최근 사용"}
                  filterFrequentLabel={t("posOptionTemplateFilterFrequent") || "자주 사용"}
                  filterDeliveryOnlyLabel={t("posOptionTemplateFilterDeliveryOnly") || "배달 전용"}
                  libraryFilter={optionsConfigLibraryFilter}
                  onLibraryFilterChange={setOptionsConfigLibraryFilter}
                  libraryItems={optionsConfigLibraryItems.map((x) => ({ id: x.id, label: x.label, note: x.note }))}
                  libraryLoading={optionsConfigLibraryLoading}
                  libraryLoadingLabel={t("loading") || "로딩 중..."}
                  libraryEmptyLabel={t("posOptionTemplateListEmpty") || "불러올 공통 옵션그룹이 없습니다."}
                  useTemplateLabel={t("posOptionTemplateUseBtn") || "이 그룹 사용"}
                  onUseTemplate={handleUseTemplateGroupForConfig}
                />
              }
              editorPanel={
                <OptionGroupEditorPanel
                  menuName={optionsConfigSelectedMenu?.name}
                  menuCode={optionsConfigSelectedMenu?.code}
                  titleFallback={t("posMenuOptions") || "옵션"}
                  emptyMessage={t("posMenuOptionsConfigNoSelect") || "왼쪽에서 메뉴를 선택해 주세요"}
                  resetLabel={t("posMenuOptionsConfigReset") || "초기화"}
                  saveLabel={t("save") || "저장"}
                  onReset={handleResetOptionsForConfig}
                  onSave={handleSaveOptionsForConfig}
                  saveDisabled={optionsConfigMenuOptions.length === 0 || optionsConfigSaving}
                  resetDisabled={optionsConfigMenuOptions.length === 0 || optionsConfigSaving}
                >
                  <div className="space-y-4">
                    <p className="text-[11px] text-muted-foreground">
                      {t("posOptionResetHint") || "기존 옵션을 지우고 새로 적용하려면 먼저 [초기화]를 누른 뒤 옵션을 추가하세요."}
                    </p>

                    <div className="rounded border bg-muted/10 p-2">
                      <p className="text-[11px] text-muted-foreground">
                        {t("posOptionGroupEditHintRight") || "옵션그룹 선택 단계 수정은 가운데 패널에서 진행하세요. 이 영역은 그룹의 옵션 항목 편집 전용입니다."}
                      </p>
                    </div>

                    <div className="rounded border p-3 bg-muted/20">
                      {optionsConfigSelectedMenu && isChickenMenu(optionsConfigSelectedMenu.code) && (
                        <p className="mb-2 text-xs text-amber-700">
                          {t("posChickenTitleOnlyHint") || "치킨 메뉴는 기존 옵션 구조를 유지합니다. 아래 옵션 목록에서 제목만 수정해 주세요."}
                        </p>
                      )}
                      <div className="space-y-2">
                        <div className="w-full">
                          <label className="text-xs font-medium block mb-0.5">
                            {t("posOptionTitle") || "제목"} ({t("optional") || "선택"})
                          </label>
                          <Input
                            className="h-8 w-full text-xs"
                            placeholder={t("posOptionNamePlaceholder") || "미입력 시 단계값으로 자동 생성"}
                            value={optionsConfigNewOptionTitle}
                            onChange={(e) => setOptionsConfigNewOptionTitle(e.target.value)}
                          />
                        </div>

                        {optionsConfigUseSizePartUi ? (
                          <div className="flex flex-wrap gap-2 items-end">
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
                              <div className="flex items-center gap-1">
                                <Select value={newOptionPart || "_"} onValueChange={(v) => setNewOptionPart(v === "_" ? "" : v)}>
                                  <SelectTrigger className="h-8 w-28 text-xs">
                                    <SelectValue placeholder={t("posOptionPartPlaceholder") || "Boneless/Wing/Drumette"} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="_">{t("posMenuCategoryAll") || "선택"}</SelectItem>
                                    {OPTION_PART_VALUES.map((v) => (
                                      <SelectItem key={v} value={v}>
                                        {v}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Input
                                  className="h-8 w-28 text-xs"
                                  value={newOptionPart}
                                  onChange={(e) => setNewOptionPart(e.target.value)}
                                  placeholder={t("posOptionPartCustomPlaceholder") || "Custom type"}
                                />
                              </div>
                            </div>
                          </div>
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
                          <p className="text-xs text-muted-foreground py-1">
                            {t("posOptionConfigNeedGroupsShort") || "먼저 위에서 선택 단계를 저장하세요."}
                          </p>
                        )}

                        <div className="rounded border bg-background p-2">
                        <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
                          {t("posOptionChannelScopeTitle") || "채널 설정 (기본채널=홀+포장, 배달)"}
                        </p>
                          <div className="flex flex-wrap gap-1.5">
                            <Button
                              type="button"
                              variant={newOptionChannelScope === "all" ? "default" : "outline"}
                              size="sm"
                              className="h-7 text-[11px]"
                              onClick={() => setNewOptionChannelScope("all")}
                            >
                              {t("posOptionScopeAll") || "기본+배달"}
                            </Button>
                            <Button
                              type="button"
                              variant={newOptionChannelScope === "hall" ? "default" : "outline"}
                              size="sm"
                              className="h-7 text-[11px]"
                              onClick={() => setNewOptionChannelScope("hall")}
                            >
                              {t("posOptionScopeBaseOnly") || "기본채널만"}
                            </Button>
                            <Button
                              type="button"
                              variant={newOptionChannelScope === "delivery" ? "default" : "outline"}
                              size="sm"
                              className="h-7 text-[11px]"
                              onClick={() => setNewOptionChannelScope("delivery")}
                            >
                              {t("posOptionScopeDeliveryOnly") || "배달만"}
                            </Button>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 items-end">
                          <div className="flex gap-2">
                            <div>
                              <div className="text-xs font-medium mb-0.5">
                                {t("posOptionBasePriceLabel") || "기본채널 가격"}
                              </div>
                              <Input
                                type="number"
                                placeholder="0"
                                className="h-8 w-28 text-right text-xs"
                                value={newOptionModifier}
                                onChange={(e) => setNewOptionModifier(e.target.value)}
                              />
                            </div>
                            <div>
                              <div className="text-xs font-medium mb-0.5">
                                {t("posOptionDeliveryPriceLabel") || "배달 가격"}
                              </div>
                              <Input
                                type="number"
                                placeholder="-"
                                className="h-8 w-24 text-right text-xs"
                                value={newOptionModifierDelivery}
                                onChange={(e) => setNewOptionModifierDelivery(e.target.value)}
                              />
                            </div>
                            <div>
                              <div className="text-xs font-medium mb-0.5 text-muted-foreground">
                                {t("posOptionPackagingIncludedInBase") || "포장은 기본채널 가격에 포함"}
                              </div>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            className="h-8 px-3"
                            onClick={handleAddOptionForConfig}
                            disabled={
                              (optionsConfigSelectedMenu ? isChickenMenu(optionsConfigSelectedMenu.code) : false) ||
                              (optionsConfigUseSizePartUi
                                ? !newOptionSize || !newOptionPart
                                : optionsConfigStepGroups.length === 0 ||
                                  optionsConfigStepGroups.some((g) => !(optionsConfigNewStepValues[g] ?? "").trim()))
                            }
                            type="button"
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            {t("posOptionAddSingle") || "옵션 추가"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={handleAddAllOptionsForConfig}
                            disabled={
                              !optionsConfigSelectedMenu ||
                              isChickenMenu(optionsConfigSelectedMenu.code) ||
                              (!isChickenMenu(optionsConfigSelectedMenu.code) && !isSizePartGroups(optionsConfigStepGroups))
                            }
                            title={
                              !optionsConfigSelectedMenu ||
                              (!isChickenMenu(optionsConfigSelectedMenu.code) && !isSizePartGroups(optionsConfigStepGroups))
                                ? (t("posOptionConfigAddAllSizePartOnly") || "size, part 단계일 때만 사용")
                                : isChickenMenu(optionsConfigSelectedMenu.code)
                                  ? (t("posChickenTitleOnlyHint") || "치킨은 기존 옵션 제목만 수정")
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

                    {optionsConfigSelectedMenu &&
                    !isChickenMenu(optionsConfigSelectedMenu.code) &&
                    optionsConfigStepGroups.length === 0 ? (
                      <div className="rounded border p-3 bg-muted/15 space-y-2">
                        <p className="text-xs font-medium">{t("posOptionDirectAddSection") || "옵션명 직접 추가 (단계 없음)"}</p>
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

                    <div className="rounded border p-3">
                      <h4 className="mb-2 text-xs font-semibold">{t("posMenuOptions") || "옵션 목록"}</h4>
                      <div className="mb-2 rounded border bg-muted/10 p-2">
                        <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                          {(t("posOptionBulkAddTitle") || "선택 그룹에 값 일괄 추가")} ({optionsConfigSelectedGroupKey || "-"})
                        </p>
                        <div className="flex flex-wrap items-end gap-2">
                          <Input
                            className="h-8 min-w-[240px] flex-1 text-xs"
                            placeholder={t("posOptionBulkAddPlaceholder") || "예: 치킨무, 김치, 단무지"}
                            value={optionsConfigBulkValuesInput}
                            onChange={(e) => setOptionsConfigBulkValuesInput(e.target.value)}
                          />
                          <Input
                            className="h-8 w-24 text-xs text-right"
                            type="number"
                            placeholder={t("posOptionBasePriceLabel") || "기본채널 가격"}
                            value={optionsConfigBulkHallPrice}
                            onChange={(e) => setOptionsConfigBulkHallPrice(e.target.value)}
                          />
                          <Input
                            className="h-8 w-24 text-xs text-right"
                            type="number"
                            placeholder={t("posOptionDeliveryPriceLabel") || "배달 가격"}
                            value={optionsConfigBulkDeliveryPrice}
                            onChange={(e) => setOptionsConfigBulkDeliveryPrice(e.target.value)}
                          />
                          <Button type="button" size="sm" className="h-8 text-xs" onClick={() => void handleBulkAddValuesForSelectedGroup()}>
                            {t("posOptionBulkAddBtn") || "값 일괄 추가"}
                          </Button>
                        </div>
                      </div>
                      <div className="max-h-[520px] overflow-y-auto space-y-2 pr-1">
                        {(() => {
                          const optionsToShowRaw =
                            optionsConfigSelectedMenu && isChickenMenu(optionsConfigSelectedMenu.code)
                              ? optionsConfigMenuOptions.filter((o) => !isChickenDefaultOption(o.name))
                              : optionsConfigMenuOptions
                          const optionsToShow = [...optionsToShowRaw].sort((a, b) => {
                            const ao = Number(a.sortOrder ?? 0)
                            const bo = Number(b.sortOrder ?? 0)
                            if (ao !== bo) return ao - bo
                            return String(a.name ?? "").localeCompare(String(b.name ?? ""))
                          })
                          if (optionsToShow.length === 0) {
                            return (
                              <p className="py-6 text-center text-xs text-muted-foreground">
                                {optionsConfigMenuOptions.length === 0
                                  ? (t("posOptionsConfigEmptyOptions") || "위에서 옵션을 추가해 주세요.")
                                  : (t("posChickenBaseOnlyHint") || "치킨은 기본(S 순살)만 있습니다. M 순살/윙/봉은 \"치킨 옵션 추가\"로 넣으세요.")}
                              </p>
                            )
                          }
                          return optionsToShow.map((o) => (
                            <OptionItemRowCard
                              key={o.id}
                              option={o}
                              displayName={optionPartLabel(o.name)}
                              editableName={!!(optionsConfigSelectedMenu && isChickenMenu(optionsConfigSelectedMenu.code))}
                              optionNamePlaceholder={t("posOptionNamePlaceholder") || "옵션명"}
                              channelTitle={t("posOptionChannelTitle") || "판매 채널"}
                              baseChannelLabel={t("posOptionBaseChannelLabel") || "기본채널(홀+포장)"}
                              deliveryChannelLabel={t("posOptionSellDelivery") || "배달"}
                              priceAdjustTitle={t("posOptionPriceAdjustTitle") || "가격 조정"}
                              basePricePlaceholder={t("posOptionBasePricePlaceholder") || "기본채널"}
                              deliveryPricePlaceholder={t("posOptionDeliveryPricePlaceholder") || "배달(미입력=기본)"}
                              onChangeName={(value) => handleOptionNameChangeForConfig(o, value)}
                              onChangePrice={(field, value) => handlePriceChangeForConfig(o, field, value)}
                              onToggleBaseChannel={(checked) =>
                                handleOptionChannelsChangeForConfig(o, {
                                  sellHall: checked,
                                  sellPackaging: checked,
                                })
                              }
                              onToggleDeliveryChannel={(checked) =>
                                handleOptionChannelsChangeForConfig(o, {
                                  sellDelivery: checked,
                                })
                              }
                              onDelete={() => handleDeleteOptionForConfig(o)}
                              draggable={true}
                              onDragStart={() => setOptionsConfigDraggingOptionId(String(o.id))}
                              onDragOver={() => undefined}
                              onDrop={() => {
                                if (!optionsConfigDraggingOptionId) return
                                handleOptionReorderForConfig(optionsConfigDraggingOptionId, String(o.id))
                                setOptionsConfigDraggingOptionId(null)
                              }}
                            />
                          ))
                        })()}
                      </div>
                    </div>
                  </div>
                </OptionGroupEditorPanel>
              }
            />
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
            <div className="rounded-xl border bg-card p-4 sm:p-6 space-y-4">
              <Tabs value={priceManageTab} onValueChange={(v) => setPriceManageTab(v as "history" | "schedule")}>
                <TabsList className={adminTabsListRowCn}>
                  <TabsTrigger value="history" className={adminTabsTriggerCn}>
                    {t("priceHistoryTabLabel") || "가격 이력"}
                  </TabsTrigger>
                  <TabsTrigger value="schedule" className={adminTabsTriggerCn}>
                    {t("priceScheduleTabLabel") || "가격 예약"}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="history" className="mt-4">
                  <PriceHistoryTab entityTypes={["pos_menu", "pos_menu_option"]} mode="menu" />
                </TabsContent>
                <TabsContent value="schedule" className="mt-4">
                  <PriceScheduleTab mode="pos_menu" canManage={canSearchAllStores} />
                </TabsContent>
              </Tabs>
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
          <TabsContent value="deliveryOps" className={adminTabsContentCn}>
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold">{t("posMenuTabDeliveryOps") || "배달앱 운영"}</h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canSearchAllStores && (
                    <>
                      <Select
                        value={deliveryOpsCopySourceStore || "__none__"}
                        onValueChange={(v) => setDeliveryOpsCopySourceStore(v === "__none__" ? "" : v)}
                      >
                        <SelectTrigger className="h-9 w-48">
                          <SelectValue placeholder={t("posTableLayoutCopyFrom") || "다른 매장에서 복사"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">{t("posTableLayoutCopyFrom") || "다른 매장에서 복사"}</SelectItem>
                          {stores
                            .filter((s) => s && s !== deliveryOpsStoreCode)
                            .map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9"
                        onClick={() => void handleCopyDeliveryOpsFromStore()}
                        disabled={
                          deliveryOpsCopying ||
                          !deliveryOpsCopySourceStore ||
                          deliveryOpsCopySourceStore === deliveryOpsStoreCode
                        }
                      >
                        {deliveryOpsCopying ? (t("loading") || "처리 중...") : (t("posTableLayoutCopyBtn") || "복사")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9"
                        onClick={() => void handleApplyDeliveryOpsToAllStores()}
                        disabled={deliveryOpsApplyingAll || stores.filter((s) => s && s !== deliveryOpsStoreCode).length === 0}
                      >
                        {deliveryOpsApplyingAll
                          ? (t("loading") || "처리 중...")
                          : (t("posDeliveryOpsApplyAll") || "전체 적용")}
                      </Button>
                    </>
                  )}
                  <Button type="button" onClick={handleSaveDeliveryOpsPolicy} disabled={deliveryOpsSaving}>
                    <Save className="h-4 w-4 mr-1.5" />
                    {deliveryOpsSaving ? (t("loading") || "저장 중...") : (t("itemsBtnSave") || "저장")}
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <label className="text-xs font-semibold">{t("store") || "매장"}</label>
                  <Select value={deliveryOpsStoreCode} onValueChange={setDeliveryOpsStoreCode}>
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(canSearchAllStores ? stores : [auth?.store || ""]).filter(Boolean).map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold">{t("posDeliveryOpsApp") || "앱"}</label>
                  <Select value={deliveryOpsAppCode} onValueChange={(v) => setDeliveryOpsAppCode(v as DeliveryAppCode)}>
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="grab">Grab</SelectItem>
                      <SelectItem value="lineman">LineMan</SelectItem>
                      <SelectItem value="shopee">Shopee</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold">{t("posDeliveryOpsAcceptMode") || "주문 수락 모드"}</label>
                  <Select
                    value={deliveryOpsAppPolicy.orderAcceptanceMode}
                    onValueChange={(v) =>
                      setDeliveryOpsAppPolicy((p) => ({ ...p, orderAcceptanceMode: v as "manual" | "auto" }))
                    }
                  >
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">{t("posDeliveryOpsAcceptModeManual") || "수동"}</SelectItem>
                      <SelectItem value="auto">{t("posDeliveryOpsAcceptModeAuto") || "자동"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-4 pb-1">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={deliveryOpsAppPolicy.enabled}
                      onChange={(e) => setDeliveryOpsAppPolicy((p) => ({ ...p, enabled: e.target.checked }))}
                    />
                    {t("posDeliveryOpsEnabled") || "앱 연동 사용"}
                  </label>
                </div>
              </div>
              <div className="rounded-lg border p-3 space-y-2">
                <h4 className="text-xs font-semibold">{t("posDeliveryOpsCategoryOrder") || "카테고리 순서"}</h4>
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {deliveryCategoryRows.map((row, idx) => (
                    <div key={row.key} className="flex items-center gap-2 rounded border px-2 py-1.5">
                      <span className="text-[11px] text-muted-foreground min-w-0 flex-1 truncate">
                        {row.main ? `${row.main} / ${translatePosMenuCategoryLabel(row.category, t)}` : translatePosMenuCategoryLabel(row.category, t)}
                      </span>
                      <Input
                        type="number"
                        className="h-7 w-20 text-xs text-right"
                        value={String(deliveryOpsCategoryOrderMap[row.key] ?? (idx + 1))}
                        onChange={(e) =>
                          setDeliveryOpsCategoryOrderMap((prev) => ({
                            ...prev,
                            [row.key]: Math.max(1, Number(e.target.value) || (idx + 1)),
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold">{t("posDeliveryOpsVisibleMenus") || "배달앱 노출 메뉴"}</h4>
                  <Input
                    className="h-8 w-60 text-xs"
                    value={deliveryOpsSearch}
                    onChange={(e) => setDeliveryOpsSearch(e.target.value)}
                    placeholder={t("itemsSearchPh") || "검색"}
                  />
                </div>
                <div className="max-h-[420px] overflow-auto border rounded">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/80">
                      <tr className="border-b">
                        <th className="p-2 text-left">{t("posMenuName") || "메뉴"}</th>
                        <th className="p-2 text-center w-16">{t("use") || "사용"}</th>
                        <th className="p-2 text-center w-20">{t("sortOrder") || "순서"}</th>
                        <th className="p-2 text-center w-24">{t("posDeliveryOpsSellStart") || "판매 시작"}</th>
                        <th className="p-2 text-center w-24">{t("posDeliveryOpsSellEnd") || "판매 종료"}</th>
                        <th className="p-2 text-center w-24">{t("posDeliveryOpsStockQty") || "재고수량"}</th>
                        <th className="p-2 text-center w-20">{t("posSoldOut") || "품절"}</th>
                        <th className="p-2 text-center w-44">{t("image") || "이미지"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveryOpsVisibleMenus.map((m) => {
                        const policy = deliveryOpsMenuPolicyMap[String(m.id)] || {
                          storeCode: deliveryOpsStoreCode,
                          appCode: deliveryOpsAppCode,
                          menuId: Number(m.id),
                          enabled: true,
                          sortOrder: m.sortOrder ?? 0,
                          sellStartTime: null,
                          sellEndTime: null,
                          stockQty: null,
                          soldOut: false,
                          autoStopOnZero: true,
                          imageUrl: null,
                        }
                        const fallbackImageUrl = String(m.imageUrl || "").trim()
                        const overrideImageUrl = String(policy.imageUrl || "").trim()
                        const effectiveImageUrl = overrideImageUrl || fallbackImageUrl
                        return (
                          <tr key={m.id} className="border-b last:border-b-0">
                            <td className="p-2">
                              <div className="font-medium">{m.code} - {m.name}</div>
                              <div className="text-muted-foreground">{m.categoryMain || "-"} / {translatePosMenuCategoryLabel(m.category || "-", t)}</div>
                            </td>
                            <td className="p-2 text-center">
                              <Checkbox
                                checked={policy.enabled}
                                onCheckedChange={(v) => upsertDeliveryMenuPolicy(String(m.id), { enabled: Boolean(v) })}
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                className="h-7 text-right"
                                value={String(policy.sortOrder ?? 0)}
                                onChange={(e) => upsertDeliveryMenuPolicy(String(m.id), { sortOrder: Number(e.target.value) || 0 })}
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                type="time"
                                className="h-7"
                                value={String(policy.sellStartTime ?? "")}
                                onChange={(e) => upsertDeliveryMenuPolicy(String(m.id), { sellStartTime: e.target.value || null })}
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                type="time"
                                className="h-7"
                                value={String(policy.sellEndTime ?? "")}
                                onChange={(e) => upsertDeliveryMenuPolicy(String(m.id), { sellEndTime: e.target.value || null })}
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                className="h-7 text-right"
                                value={policy.stockQty == null ? "" : String(policy.stockQty)}
                                onChange={(e) => upsertDeliveryMenuPolicy(String(m.id), { stockQty: e.target.value === "" ? null : Number(e.target.value) })}
                              />
                            </td>
                            <td className="p-2 text-center">
                              <Checkbox
                                checked={policy.soldOut}
                                onCheckedChange={(v) => upsertDeliveryMenuPolicy(String(m.id), { soldOut: Boolean(v) })}
                              />
                            </td>
                            <td className="p-2">
                              <input
                                ref={(el) => {
                                  deliveryOpsImageInputRefs.current[String(m.id)] = el
                                }}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0]
                                  if (file) {
                                    await handleUploadDeliveryMenuImage(m, file)
                                  }
                                  e.currentTarget.value = ""
                                }}
                              />
                              <div className="flex items-center justify-center gap-1.5">
                                {effectiveImageUrl ? (
                                  <img
                                    src={effectiveImageUrl}
                                    alt={`${m.name} delivery`}
                                    className="h-8 w-8 rounded border object-cover"
                                  />
                                ) : (
                                  <div className="h-8 w-8 rounded border bg-muted" />
                                )}
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-[11px]"
                                  disabled={deliveryOpsImageUploadingMenuId === String(m.id)}
                                  onClick={() => deliveryOpsImageInputRefs.current[String(m.id)]?.click()}
                                >
                                  {deliveryOpsImageUploadingMenuId === String(m.id)
                                    ? (t("loading") || "업로드중")
                                    : (t("upload") || "업로드")}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-[11px]"
                                  disabled={!overrideImageUrl}
                                  onClick={() => upsertDeliveryMenuPolicy(String(m.id), { imageUrl: null })}
                                >
                                  {t("reset") || "기본"}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {deliveryOpsLoading && (
                <p className="text-xs text-muted-foreground">{t("loading") || "불러오는 중..."}</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
