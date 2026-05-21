"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { UtensilsCrossed, FilePlus, Save, RotateCcw, RefreshCw, Pencil, Trash2, Plus, ChevronDown, ChevronRight, LayoutGrid, Layers, Monitor, PauseCircle, PlayCircle, FolderTree, History, Calculator, ClipboardList, Download, Upload, Search } from "lucide-react"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  savePosMenuOptionGroupLinks,
  savePosOptionGroup,
  savePosMenuIngredient,
  deletePosMenu,
  deletePosMenuOption,
  deletePosMenuIngredient,
  updatePosMenuSoldOut,
  getPosPromos,
  getPosPromoSchemaStatus,
  importPosMenus,
  POS_MENU_UPLOAD_TOO_LARGE,
  refreshPosMenusCatalogCache,
  syncPosMenuImageCrossChannels,
  uploadPosMenuImage,
  useStoreList,
  type PosMenu,
  type PosOptionSelectionGroupConfig,
  type PosMenuPackagingCheckItem,
  type PosMenuOption,
  type PosOptionGroup,
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
import { resolvePosOptionGroupCode } from "@/lib/pos-option-group-code"
import {
  PROMOTION_MAIN_CATEGORY,
  normalizePromotionCategoryMain,
  normalizePromotionSubcategory,
  promotionSubcategoriesEqual,
  uniqueSubcategoriesForMainMenu,
} from "@/lib/pos-promo-constants"
import { translatePosMenuCategoryLabel } from "@/lib/pos-menu-category-label"
import { translatePosMenuLineForReceipt, chickenPartDedupeKey, prettyChickenPartLibraryLabel } from "@/lib/pos-print-translate"
import { sortByCode } from "@/lib/sort-utils"
import { isStrictBonelessBbqChickenCode } from "@/lib/pos-bbq-option-guard"
import {
  inferOptionSelectionGroupsFromOptions,
  normalizeOptionGroupsForMenu,
  syncOptionSelectionConfigToGroupKeys,
} from "@/lib/pos-option-selection-groups"
import { ADMIN_BTN_XS_CN } from "@/lib/admin-ui-standards"
import { resolvePosMenuImageUrlPayloadForSave } from "@/lib/pos-menu-image-storage-path"
import {
  menuHasPersistedStoreScope,
  resolveEffectiveMenuScopeStoreCodes,
} from "@/lib/pos-menu-store-scope"

/** 원가 분석 화면 이동 후 복귀 시 편집 중이던 메뉴·노출 매장 복원 */
const POS_MENUS_EDIT_RESUME_KEY = "cm_pos_menus_edit_resume_v1"

function menuScopeStoreCodes(menu: PosMenu): string[] {
  return Array.isArray(menu.storeCodes)
    ? menu.storeCodes.map((x) => String(x || "").trim()).filter(Boolean)
    : []
}

function storeScopeCodesEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const norm = (xs: string[]) => [...xs].map((x) => x.toLowerCase()).sort()
  const sa = norm(a)
  const sb = norm(b)
  return sa.every((v, i) => v === sb[i])
}

/** 코드 자동 생성 대상 대분류 (C/K/S/D/T 접두사) */
const CODE_AUTO_MAINS = ["Chicken", "Korean", "Side", "Drinks", "Topping"] as const

/** 옵션관리 탭: 고정 2단계 — 1. 사이즈, 2. 부위 */
const OPTION_SIZE_VALUES = ["S", "M", "L"]
const OPTION_PART_VALUES = ["Boneless", "Wing", "Drumette"] as const
/** 치킨 메뉴: 코드가 c로 시작. 기본가=S Boneless, 옵션은 M Boneless·Wing·Drumette 조합 */
const CHICKEN_CODE_PREFIX = "c"
/** 치킨 size/part 단계의 공통 표시 제목(영문 고정). 세부 구분은 · 뒤에 사이즈/부위 라벨로 표시 */
const CHICKEN_OPTION_GROUP_TITLE = "chicken size"

/** 옵션 일괄 추가「메뉴 검색·선택」: 좌측 메뉴 목록과 동일한 `코드 — 이름` 표기 */
function formatPosMenuBulkPickLabel(m: PosMenu): string {
  const c = String(m.code ?? "").trim()
  const n = String(m.name ?? "").trim()
  if (c && n) return `${c} — ${n}`
  return n || c
}

function formatChickenOptionStepDisplayLabel(stepKey: "size" | "part", t: (key: string) => string): string {
  const suffix = stepKey === "size" ? t("posOptionGroupSize") : t("posOptionGroupPart")
  return `${CHICKEN_OPTION_GROUP_TITLE} · ${suffix}`
}

/** 치킨(c)·size+part 단계일 때 option_selection_config.label 을 통일 형식으로 덮어씀 */
function applyChickenOptionGroupLabelsToConfig(
  groups: string[],
  normalizedConfig: PosOptionSelectionGroupConfig[],
  menuCode: string | undefined,
  t: (key: string) => string
): PosOptionSelectionGroupConfig[] {
  if (!isChickenMenu(menuCode) || !isSizePartGroups(groups)) return normalizedConfig
  return normalizedConfig.map((row) => {
    if (row.key === "size") return { ...row, label: formatChickenOptionStepDisplayLabel("size", t) }
    if (row.key === "part") return { ...row, label: formatChickenOptionStepDisplayLabel("part", t) }
    return row
  })
}

/** 치킨(c) size/part는 공통 규칙으로 통일: size 단계는 배달 전용 + 단일 선택 */
function applyChickenDeliveryRulesToConfig(
  groups: string[],
  normalizedConfig: PosOptionSelectionGroupConfig[],
  menuCode: string | undefined,
  t: (key: string) => string
): PosOptionSelectionGroupConfig[] {
  const withLabels = applyChickenOptionGroupLabelsToConfig(groups, normalizedConfig, menuCode, t)
  if (!isChickenMenu(menuCode)) return withLabels
  if (groups.length === 1 && groups[0] === "part") {
    return withLabels.map((row) => (row.key === "part" ? { ...row, label: t("posOptionGroupPart") || "부위" } : row))
  }
  if (!isSizePartGroups(groups)) return withLabels
  return withLabels.map((row) => {
    if (row.key !== "size") return row
    return {
      ...row,
      audience: "delivery",
      required: true,
      minSelect: 1,
      maxSelect: 1,
    }
  })
}

function isChickenMenu(code: string | undefined): boolean {
  return !!code?.trim().toLowerCase().startsWith(CHICKEN_CODE_PREFIX)
}
/** 치킨 기본 옵션(S Boneless): 메뉴 관리 옵션 목록에서 제외하고, 기본 행 하나로만 표시 */
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

/** 위/아래 스왑 후 `normalizeOptionGroupsForMenu` 적용 결과. 경계 밖이면 null */
function optionStepOrderAfterSwap(
  orderedKeys: string[],
  groupKey: string,
  direction: "up" | "down",
  menuCode: string | undefined
): string[] | null {
  const idx = orderedKeys.indexOf(groupKey)
  if (idx < 0) return null
  const target = direction === "up" ? idx - 1 : idx + 1
  if (target < 0 || target >= orderedKeys.length) return null
  const swapped = [...orderedKeys]
  const a = swapped[idx]!
  const b = swapped[target]!
  swapped[idx] = b
  swapped[target] = a
  return normalizeOptionGroupsForMenu(swapped, menuCode)
}

/** 치킨 옵션: DB option_step_values.size 가 비어 있을 때 이름 맨 앞 S/M/L 로 사이즈 추론 (레거시 행) */
function inferChickenOptionSizeValue(o: PosMenuOption): string {
  const fromStep = String(o.optionStepValues?.size ?? "").trim()
  if (fromStep) return fromStep
  const name = String(o.name ?? "").trim()
  const m = name.match(/^\s*([SML])(?:\s*[-–—]\s*|\s+$|\b)/i)
  if (m) return m[1].toUpperCase()
  return ""
}

/** 치킨: DB part 비어 있을 때 `M - Boneless` 등에서 부위 토큰 추론 */
function inferChickenOptionPartValue(o: PosMenuOption): string {
  const fromStep = String(o.optionStepValues?.part ?? "").trim()
  if (fromStep) return fromStep
  const name = String(o.name ?? "").trim()
  let rest = name.replace(/^\s*[SML]\s*[-–—]\s*/i, "").trim()
  if (!rest) rest = name.replace(/^\s*[SML]\s+/i, "").trim()
  if (rest) return rest
  if (name && !/^\s*[SML]\b/i.test(name)) return name
  return ""
}

/**
 * size/part 외 단계(sidedish 등)가 있으면, 이름만으로 part를 채우면 김치 같은 행이 part·다른 단계에 동시에 걸린다.
 * 레거시 콤보(M - 윙)·size 스텝이 있을 때만 이름에서 part 추론을 허용한다.
 */
function shouldInferChickenPartFromName(o: PosMenuOption, stepGroups: string[]): boolean {
  if (isSizePartGroups(stepGroups)) return true
  if (stepGroups.length === 1 && stepGroups[0] === "part") return true
  if (stepGroups.length > 0 && stepGroups.every((k) => k === "size" || k === "part")) return true
  if (inferChickenOptionSizeValue(o)) return true
  if (/^\s*[SML](?:\s*[-–—]|\s+|\b)/i.test(String(o.name ?? "").trim())) return true
  return false
}

/** 옵션 구성 탭: 단계별 목록 필터(치킨 size/part는 이름에서 step 값 추론) */
function optionStepValueForGroupFilter(
  opt: PosMenuOption,
  groupKey: string,
  menuCode: string | undefined,
  stepGroups: string[]
): string {
  if (isChickenMenu(menuCode) && isSizePartGroups(stepGroups)) {
    if (groupKey === "size") return inferChickenOptionSizeValue(opt)
    if (groupKey === "part") return inferChickenOptionPartValue(opt)
  }
  if (isChickenMenu(menuCode) && groupKey === "part" && stepGroups.includes("part")) {
    const direct = String(opt.optionStepValues?.part ?? "").trim()
    if (direct) return direct
    if (!shouldInferChickenPartFromName(opt, stepGroups)) return ""
    return inferChickenOptionPartValue(opt)
  }
  if (isChickenMenu(menuCode) && groupKey === "size" && stepGroups.includes("size")) {
    const direct = String(opt.optionStepValues?.size ?? "").trim()
    if (direct) return direct
    return inferChickenOptionSizeValue(opt)
  }
  return String(opt.optionStepValues?.[groupKey] ?? "").trim()
}

function optionMatchesGroupFilter(
  opt: PosMenuOption,
  groupKey: string,
  menuCode: string | undefined,
  stepGroups: string[]
): boolean {
  return optionStepValueForGroupFilter(opt, groupKey, menuCode, stepGroups) !== ""
}

/** 치킨 옵션 구성: part 단계에서 부위 값별로 묶어 보여 줌 */
function groupChickenMenuOptionsByPartValue(options: PosMenuOption[]): { partValue: string; items: PosMenuOption[] }[] {
  const map = new Map<string, PosMenuOption[]>()
  for (const o of options) {
    const p = inferChickenOptionPartValue(o)
    if (!p) continue
    if (!map.has(p)) map.set(p, [])
    map.get(p)!.push(o)
  }
  const entries = [...map.entries()]
  entries.sort((a, b) => {
    const ia = OPTION_PART_VALUES.indexOf(a[0] as (typeof OPTION_PART_VALUES)[number])
    const ib = OPTION_PART_VALUES.indexOf(b[0] as (typeof OPTION_PART_VALUES)[number])
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a[0].localeCompare(b[0], undefined, { numeric: true })
  })
  return entries.map(([partValue, items]) => ({
    partValue,
    items: [...items].sort((a, b) => {
      const ao = Number(a.sortOrder ?? 0)
      const bo = Number(b.sortOrder ?? 0)
      if (ao !== bo) return ao - bo
      return String(a.name ?? "").localeCompare(String(b.name ?? ""))
    }),
  }))
}

/** 치킨 옵션 구성: 관리자 목록에서 사이즈 단계일 때 S/M/L 값별로 묶어 보여 줌 */
function groupChickenMenuOptionsBySizeValue(options: PosMenuOption[]): { sizeValue: string; items: PosMenuOption[] }[] {
  const map = new Map<string, PosMenuOption[]>()
  for (const o of options) {
    const sz = inferChickenOptionSizeValue(o)
    if (!sz) continue
    if (!map.has(sz)) map.set(sz, [])
    map.get(sz)!.push(o)
  }
  const entries = [...map.entries()]
  entries.sort((a, b) => {
    const ia = OPTION_SIZE_VALUES.indexOf(a[0] as "S" | "M" | "L")
    const ib = OPTION_SIZE_VALUES.indexOf(b[0] as "S" | "M" | "L")
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a[0].localeCompare(b[0], undefined, { numeric: true })
  })
  return entries.map(([sizeValue, items]) => ({
    sizeValue,
    items: [...items].sort((a, b) => {
      const ao = Number(a.sortOrder ?? 0)
      const bo = Number(b.sortOrder ?? 0)
      if (ao !== bo) return ao - bo
      return String(a.name ?? "").localeCompare(String(b.name ?? ""))
    }),
  }))
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
    const minFromPrev = prev?.minSelect
    const maxFromPrev = prev?.maxSelect
    let minSelect =
      minFromPrev != null && Number.isFinite(Number(minFromPrev))
        ? Math.max(0, Math.floor(Number(minFromPrev)))
        : required
          ? 1
          : 0
    const maxSelect =
      maxFromPrev != null && Number.isFinite(Number(maxFromPrev))
        ? Math.max(1, Math.floor(Number(maxFromPrev)))
        : 1
    if (minSelect > maxSelect) minSelect = maxSelect
    return {
      key,
      label: String(prev?.label ?? key).trim() || key,
      audience,
      required,
      minSelect,
      maxSelect,
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

function buildOptionCode(menuCode: string | undefined, sortOrder: number | undefined): string {
  const code = String(menuCode ?? "").trim()
  if (!code) return ""
  const order = Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : -1
  if (order < 0) return ""
  return `${code}-${Math.floor(order) + 1}`
}

function resolveOptionCode(option: PosMenuOption, menuCode: string | undefined): string {
  const explicit = String(option.optionCode ?? "").trim()
  if (explicit) return explicit
  return buildOptionCode(menuCode, option.sortOrder)
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
  /** 옵션 부위명 — 영수증과 동일하게 한글 부위 표기를 Boneless/Wing/Drumette 로 통일 */
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
  const searchParams = useSearchParams()
  React.useEffect(() => {
    const tab = String(searchParams.get("tab") || "").trim()
    if (tab === "optionsConfig") setMainTab("optionsConfig")
  }, [searchParams])
  const [priceManageTab, setPriceManageTab] = React.useState<"history" | "schedule">("history")
  const [pricingStoreCode, setPricingStoreCode] = React.useState("")
  const canSearchAllStores = isOfficeRole(auth?.role || "")
  const availableScopeStores = React.useMemo(() => {
    const out: string[] = []
    const push = (raw: unknown) => {
      const v = String(raw || "").trim()
      if (!v) return
      if (!out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v)
    }
    if (canSearchAllStores) {
      for (const s of stores) push(s)
    } else {
      push(auth?.store)
      for (const s of auth?.allowedStores || []) push(s)
      if (out.length === 0) {
        for (const s of stores) push(s)
      }
    }
    return out.sort((a, b) => a.localeCompare(b))
  }, [canSearchAllStores, stores, auth?.store, auth?.allowedStores])
  const defaultScopeStoreCodes = React.useMemo(() => {
    // 본사(전 매장 검색): 신규 시 스코프가 비면 저장 검증에 걸리므로, 노출 후보 전체를 기본 선택한다.
    if (canSearchAllStores) return [...availableScopeStores]
    if (auth?.store) return [String(auth.store).trim()].filter(Boolean)
    if (availableScopeStores.length > 0) return [availableScopeStores[0]]
    return []
  }, [canSearchAllStores, auth?.store, availableScopeStores])
  const [selectedStoreCodes, setSelectedStoreCodes] = React.useState<string[]>([])
  const [storeScopeDirty, setStoreScopeDirty] = React.useState(false)
  // 편집 시에는 실제 메뉴에 저장된 노출 매장을 그대로 보여준다.
  // (신규 메뉴 기본값은 defaultScopeStoreCodes가 담당)
  const getEditorScopeStoreCodes = React.useCallback(
    (menu?: PosMenu | null): string[] => {
      const persisted = menu ? menuScopeStoreCodes(menu) : []
      return resolveEffectiveMenuScopeStoreCodes(persisted, availableScopeStores)
    },
    [availableScopeStores]
  )
  const editingMenuForScope = editingId ? menus.find((m) => m.id === editingId) : null
  const showStoreScopeCompatHint =
    !!editingMenuForScope &&
    !menuHasPersistedStoreScope(menuScopeStoreCodes(editingMenuForScope))
  const toggleStoreScopeCode = React.useCallback((storeCode: string, checked: boolean) => {
    const normalized = String(storeCode || "").trim()
    if (!normalized) return
    setStoreScopeDirty(true)
    setSelectedStoreCodes((prev) => {
      const has = prev.some((x) => x.toLowerCase() === normalized.toLowerCase())
      if (checked) return has ? prev : [...prev, normalized]
      return prev.filter((x) => x.toLowerCase() !== normalized.toLowerCase())
    })
  }, [])
  const allStoreScopeSelected =
    availableScopeStores.length > 0 &&
    availableScopeStores.every((sc) => selectedStoreCodes.some((x) => x.toLowerCase() === sc.toLowerCase()))
  const someStoreScopeSelected =
    !allStoreScopeSelected &&
    availableScopeStores.some((sc) => selectedStoreCodes.some((x) => x.toLowerCase() === sc.toLowerCase()))
  const toggleAllStoreScope = React.useCallback(
    (checked: boolean) => {
      setStoreScopeDirty(true)
      setSelectedStoreCodes(checked ? [...availableScopeStores] : [])
    },
    [availableScopeStores]
  )
  const renderMenuStoreScopePicker = (hintKey: string, keyPrefix: string) => (
    <div className="rounded-md border border-dashed p-3">
      <label className="text-xs font-semibold">{t("store") || "매장"}</label>
      <p className="mt-1 text-[11px] text-muted-foreground">{t(hintKey)}</p>
      {showStoreScopeCompatHint && (
        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
          {t("posMenuVisibleStoresCompatHint")}
        </p>
      )}
      <div className="mt-2 grid max-h-32 grid-cols-2 gap-2 overflow-y-auto">
        {availableScopeStores.length > 1 && (
          <label
            className={`col-span-2 flex items-center gap-2 border-b border-dashed pb-2 text-xs font-medium ${someStoreScopeSelected ? "text-muted-foreground" : ""}`}
          >
            <input
              type="checkbox"
              checked={allStoreScopeSelected}
              ref={(el) => {
                if (el) el.indeterminate = someStoreScopeSelected
              }}
              onChange={(e) => toggleAllStoreScope(e.target.checked)}
            />
            <span>{t("store_all_stores") || "전체 매장"}</span>
          </label>
        )}
        {availableScopeStores.map((sc) => {
          const checked = selectedStoreCodes.some((x) => x.toLowerCase() === sc.toLowerCase())
          return (
            <label key={`${keyPrefix}-${sc}`} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => toggleStoreScopeCode(sc, e.target.checked)}
              />
              <span>{sc}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
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
  /** 옵션 구성 탭: 메뉴의 선택 단계(저장 전 편집) */
  const [optionsConfigGroupsDraft, setOptionsConfigGroupsDraft] = React.useState("")
  const [optionsConfigNewGroupKeyInput, setOptionsConfigNewGroupKeyInput] = React.useState("")
  const [optionsConfigGroupRulesDraft, setOptionsConfigGroupRulesDraft] = React.useState<PosOptionSelectionGroupConfig[]>([])
  const [optionsConfigNewStepValues, setOptionsConfigNewStepValues] = React.useState<Record<string, string>>({})
  const [optionsConfigApplyingGroups, setOptionsConfigApplyingGroups] = React.useState(false)
  /** 비치킨·선택 단계 없음: POS에서 한 줄로 고르는 치환 옵션 */
  const [optionsConfigCustomOptionName, setOptionsConfigCustomOptionName] = React.useState("")
  const [optionsConfigBulkValuesInput, setOptionsConfigBulkValuesInput] = React.useState("")
  const [optionsConfigBulkHallPrice, setOptionsConfigBulkHallPrice] = React.useState("")
  const [optionsConfigBulkDeliveryPrice, setOptionsConfigBulkDeliveryPrice] = React.useState("")
  const [optionsConfigBulkMenuPickerOpen, setOptionsConfigBulkMenuPickerOpen] = React.useState(false)
  const [optionsConfigBulkMenuPickerSearch, setOptionsConfigBulkMenuPickerSearch] = React.useState("")
  const [optionsConfigBulkMenuPickerChecked, setOptionsConfigBulkMenuPickerChecked] = React.useState<Record<string, boolean>>({})
  const [optionsConfigDraggingOptionId, setOptionsConfigDraggingOptionId] = React.useState<string | null>(null)
  const [optionsConfigShowAllOptions, setOptionsConfigShowAllOptions] = React.useState(false)
  const [optionsConfigCopySourceMenuId, setOptionsConfigCopySourceMenuId] = React.useState<string>("")
  const [optionsConfigCopying, setOptionsConfigCopying] = React.useState(false)
  const [optionsConfigNewOptionTitle, setOptionsConfigNewOptionTitle] = React.useState("")
  const [optionsConfigLibraryGroups, setOptionsConfigLibraryGroups] = React.useState<PosOptionGroup[]>([])
  /** 옵션 구성 탭: 공통 그룹 제안용 전체 메뉴 옵션(치킨 part 등 가상 그룹 생성) */
  const [optionsConfigAllMenuOptionsCatalog, setOptionsConfigAllMenuOptionsCatalog] = React.useState<PosMenuOption[]>([])
  const [optionsConfigLibraryLoading, setOptionsConfigLibraryLoading] = React.useState(false)
  const [optionsConfigLibrarySearchTerm, setOptionsConfigLibrarySearchTerm] = React.useState("")
  const [optionsConfigLibraryFilter, setOptionsConfigLibraryFilter] = React.useState<
    "all" | "recent" | "frequent" | "deliveryOnly"
  >("all")
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

  /** 신규 등록 시에만 기본 노출 매장 — 편집 중(editingId)에는 handleEdit·서버 목록과 동기화 */
  React.useEffect(() => {
    if (editingId) return
    if (selectedStoreCodes.length > 0) return
    if (defaultScopeStoreCodes.length === 0) return
    setSelectedStoreCodes(defaultScopeStoreCodes)
  }, [defaultScopeStoreCodes, selectedStoreCodes.length, editingId])

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
        getPosMenus({ fresh: true }),
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
      setOptionsConfigShowAllOptions(false)
      setOptionsConfigCopySourceMenuId("")
      setOptionsConfigNewGroupKeyInput("")
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
    setOptionsConfigShowAllOptions(false)
    setOptionsConfigCopySourceMenuId("")
    setOptionsConfigNewGroupKeyInput("")
  }, [optionsConfigSelectedMenuId, applyLoadedOptionsForConfig])

  React.useEffect(() => {
    if (!optionsConfigSelectedMenuId) return
    const sel = menus.find((m) => m.id === optionsConfigSelectedMenuId)
    const g = sel?.optionSelectionGroups
    const parsedGroupsRaw = Array.isArray(g) && g.length > 0 ? g.map((x) => String(x).trim()).filter(Boolean) : []
    const parsedGroups = normalizeOptionGroupsForMenu(parsedGroupsRaw, sel?.code)
    setOptionsConfigGroupsDraft(parsedGroups.join(", "))
    const normalizedRules = normalizeOptionSelectionConfig(parsedGroups, sel?.optionSelectionConfig)
    setOptionsConfigGroupRulesDraft(applyChickenDeliveryRulesToConfig(parsedGroups, normalizedRules, sel?.code, t))
  }, [optionsConfigSelectedMenuId, optionsConfigSelectedGroupsKey, t])

  React.useEffect(() => {
    if (!optionsConfigSelectedMenuId) return
    const sel = menus.find((m) => m.id === optionsConfigSelectedMenuId)
    const configured = Array.isArray(sel?.optionSelectionGroups)
      ? sel.optionSelectionGroups.map((x) => String(x).trim()).filter(Boolean)
      : []
    if (configured.length > 0) return
    if (optionsConfigGroupsDraft.trim() !== "") return
    const inferred = inferOptionSelectionGroupsFromOptions(optionsConfigMenuOptions, sel?.code)
    if (inferred.length === 0) return
    setOptionsConfigGroupsDraft(inferred.join(", "))
    const normalizedRules = normalizeOptionSelectionConfig(inferred, sel?.optionSelectionConfig)
    setOptionsConfigGroupRulesDraft(applyChickenDeliveryRulesToConfig(inferred, normalizedRules, sel?.code, t))
  }, [
    menus,
    optionsConfigGroupsDraft,
    optionsConfigMenuOptions,
    optionsConfigSelectedMenuId,
    t,
  ])

  const optionsConfigStepGroups = React.useMemo(() => {
    if (!optionsConfigSelectedMenuId) return [] as string[]
    const m = menus.find((x) => x.id === optionsConfigSelectedMenuId)
    return normalizeOptionGroupsForMenu(
      (m?.optionSelectionGroups ?? []).map((g) => String(g).trim()).filter(Boolean),
      m?.code
    )
  }, [menus, optionsConfigSelectedMenuId])

  /** 옵션 구성 UI: [단계 저장] 전에도 드래프트 문자열 기준으로 단계 목록·선택을 맞춤 (빈 문자열 = 단계 없음 편집) */
  const optionsConfigPanelStepGroups = React.useMemo(() => {
    if (!optionsConfigSelectedMenuId) return [] as string[]
    const m = menus.find((x) => x.id === optionsConfigSelectedMenuId)
    const code = m?.code
    const trimmed = optionsConfigGroupsDraft.trim()
    if (trimmed === "") return [] as string[]
    return normalizeOptionGroupsForMenu(parseOptionGroupsFromText(optionsConfigGroupsDraft), code)
  }, [optionsConfigSelectedMenuId, menus, optionsConfigGroupsDraft])

  React.useEffect(() => {
    if (optionsConfigPanelStepGroups.length === 0) {
      setOptionsConfigSelectedGroupKey("")
      return
    }
    setOptionsConfigSelectedGroupKey((prev) =>
      optionsConfigPanelStepGroups.includes(prev) ? prev : optionsConfigPanelStepGroups[0]
    )
  }, [optionsConfigPanelStepGroups])

  const optionsConfigEffectiveGroupKey = React.useMemo(() => {
    if (!optionsConfigSelectedMenuId) return ""
    if (optionsConfigPanelStepGroups.length === 0) return "__default__"
    if (optionsConfigSelectedGroupKey && optionsConfigPanelStepGroups.includes(optionsConfigSelectedGroupKey)) {
      return optionsConfigSelectedGroupKey
    }
    return optionsConfigPanelStepGroups[0] || ""
  }, [optionsConfigSelectedMenuId, optionsConfigSelectedGroupKey, optionsConfigPanelStepGroups])

  React.useEffect(() => {
    if (mainTab !== "optionsConfig") return
    let cancelled = false
    setOptionsConfigLibraryLoading(true)
    void getPosOptionGroups()
      .then((list) => {
        if (cancelled) return
        setOptionsConfigLibraryGroups(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        if (cancelled) return
        setOptionsConfigLibraryGroups([])
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
    if (mainTab !== "optionsConfig") return
    let cancelled = false
    void getPosMenuOptions({ fresh: true })
      .then((list) => {
        if (cancelled) return
        setOptionsConfigAllMenuOptionsCatalog(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        if (!cancelled) setOptionsConfigAllMenuOptionsCatalog([])
      })
    return () => {
      cancelled = true
    }
  }, [mainTab])

  React.useEffect(() => {
    if (!optionsConfigSelectedMenuId) setOptionsConfigLibrarySearchTerm("")
  }, [optionsConfigSelectedMenuId])

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
    setSelectedStoreCodes(defaultScopeStoreCodes)
    setStoreScopeDirty(false)
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
        setSelectedStoreCodes(getEditorScopeStoreCodes(m))
        setStoreScopeDirty(false)
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
      setSelectedStoreCodes(defaultScopeStoreCodes)
      setStoreScopeDirty(false)
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
    const persistedScope = editingMenu ? menuScopeStoreCodes(editingMenu) : []
    const shouldPersistStoreScope =
      !editingId || storeScopeDirty || menuHasPersistedStoreScope(persistedScope)
    const scopeForSave = shouldPersistStoreScope
      ? (() => {
          if (!editingMenu || storeScopeDirty) return selectedStoreCodes
          if (selectedStoreCodes.length > 0) return selectedStoreCodes
          return persistedScope.length > 0 ? persistedScope : selectedStoreCodes
        })()
      : []
    if (shouldPersistStoreScope && scopeForSave.length === 0) {
      await appAlert(t("posMenuVisibleStoresPickAtLeastOne"))
      return
    }
    if (shouldPersistStoreScope && !storeScopeDirty && !storeScopeCodesEqual(selectedStoreCodes, scopeForSave)) {
      setSelectedStoreCodes(scopeForSave)
    }
    const imageSave = resolvePosMenuImageUrlPayloadForSave(formData.imageUrl.trim(), editingId, {
      isEdit: !!editingId,
      existingImageUrl: editingMenu?.imageUrl,
    })
    if (!editingId && imageSave.mismatchMessage) {
      await appAlert(
        `${imageSave.mismatchMessage}\n\n${t("posMenuImageUploadHint") || "이 메뉴에서 사진을 다시 업로드한 뒤 저장해 주세요."}`
      )
      return
    }
    const savePayload: Parameters<typeof savePosMenu>[0] = {
      id: editingId || undefined,
      code,
      name,
      categoryMain: effectiveCategoryMain,
      category: effectiveCategory,
      price: Number(formData.price) || 0,
      priceDelivery: formData.priceDelivery !== "" ? Number(formData.priceDelivery) : null,
      descriptionDefault: formData.descriptionDefault.trim(),
      descriptionDelivery: formData.descriptionDelivery.trim() || null,
      descriptionTable: formData.descriptionTable.trim() || null,
      vatIncluded: formData.vatIncluded,
      isActive: formData.isActive,
      isBanban: formData.isBanban,
    }
    if (shouldPersistStoreScope) {
      savePayload.storeCodes = scopeForSave
    }
    if (imageSave.includeImageUrl) {
      savePayload.imageUrl = imageSave.imageUrl
    }
    const res = await savePosMenu(savePayload)
    if (!res.success) {
      await appAlert(translateApiMessage(res.message, t) || t("msg_save_fail_detail"))
      return
    }
    const scopeTargets = Array.from(new Set(scopeForSave.map((x) => String(x || "").trim()).filter(Boolean)))
    if (scopeTargets.length > 0) {
      await Promise.all(scopeTargets.map((sc) => refreshPosMenusCatalogCache({ storeCode: sc })))
    } else {
      await refreshPosMenusCatalogCache()
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
      storeCodes: scopeForSave,
    }
    if (editingId) {
      setMenus((prev) => prev.map((m) => (m.id === editingId ? { ...newMenu, id: editingId } : m)))
      if (imageSave.mismatchMessage) {
        await appAlert(
          `${t("posMenuSavedWithoutImageMismatch") || "메뉴 정보는 저장했습니다. 다만 사진 URL이 다른 메뉴용이라 사진은 그대로 두었습니다."}\n\n${imageSave.mismatchMessage}\n\n${t("posMenuImageUploadHint") || "이 메뉴에서 사진을 다시 업로드해 주세요."}`
        )
      } else {
        await appAlert(t("itemsAlertUpdated"))
      }
    } else {
      getPosMenus({ fresh: true }).then(setMenus)
      await appAlert(t("itemsAlertSaved"))
    }
    setStoreScopeDirty(false)
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
      setSelectedStoreCodes(defaultScopeStoreCodes)
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
    setSelectedStoreCodes(getEditorScopeStoreCodes(menu))
    setStoreScopeDirty(false)
    setEditingId(menu.id)
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-menu-row-id="${CSS.escape(menu.id)}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    })
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

  /** 목록 새로고침·원가 저장 후 복귀 등 — 서버 storeCodes 로 체크박스 유지 */
  React.useEffect(() => {
    if (!editingId) return
    if (storeScopeDirty) return
    const m = menus.find((x) => x.id === editingId)
    if (!m) return
    const scope = getEditorScopeStoreCodes(m)
    setSelectedStoreCodes((prev) => (storeScopeCodesEqual(prev, scope) ? prev : scope))
  }, [editingId, menus, storeScopeDirty, getEditorScopeStoreCodes])

  const resumeEditFromCostAnalysisRef = React.useRef(false)
  React.useEffect(() => {
    if (menus.length === 0 || resumeEditFromCostAnalysisRef.current) return
    try {
      const raw = sessionStorage.getItem(POS_MENUS_EDIT_RESUME_KEY)
      if (!raw) return
      resumeEditFromCostAnalysisRef.current = true
      sessionStorage.removeItem(POS_MENUS_EDIT_RESUME_KEY)
      const parsed = JSON.parse(raw) as { editingId?: string; selectedStoreCodes?: string[] }
      const id = String(parsed.editingId ?? "").trim()
      if (!id) return
      const m = menus.find((x) => x.id === id)
      if (m) {
        handleEdit(m)
        return
      }
      const cachedScope = Array.isArray(parsed.selectedStoreCodes)
        ? parsed.selectedStoreCodes.map((x) => String(x || "").trim()).filter(Boolean)
        : []
      if (cachedScope.length > 0) {
        setEditingId(id)
        setSelectedStoreCodes(cachedScope)
        setStoreScopeDirty(false)
      }
    } catch {
      /* ignore */
    }
  }, [menus, handleEdit])

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
      optionCode: buildOptionCode(formData.code, menuOptions.length),
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
      optionCode: resolveOptionCode(opt, formData.code),
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
      getPosMenus({ fresh: true }).then(setMenus)
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
        optionCode: resolveOptionCode(opt, menus.find((m) => m.id === String(opt.menuId))?.code),
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
        getPosMenus({ fresh: true }).then(setMenus)
      } else {
        await appAlert(res.message)
      }
    } finally {
      setSoldOutTogglingOptionId(null)
    }
  }

  const optionsConfigSelectedMenu = optionsConfigSelectedMenuId ? menus.find((m) => m.id === optionsConfigSelectedMenuId) : null

  const VIRTUAL_CHICKEN_PART_GROUP_ID = "virtual:chicken-part"

  const optionsConfigVirtualChickenPartLibraryGroup = React.useMemo((): PosOptionGroup | null => {
    const realPartWithItems = optionsConfigLibraryGroups.some(
      (g) => String(g.key ?? "").trim().toLowerCase() === "part" && (g.items?.length ?? 0) > 0
    )
    if (realPartWithItems) return null
    const chickenMenuIds = new Set(
      menus.filter((m) => isChickenMenu(m.code)).map((m) => String(m.id).trim()).filter(Boolean)
    )
    if (chickenMenuIds.size === 0 || optionsConfigAllMenuOptionsCatalog.length === 0) return null
    const byDedupeKey = new Map<string, PosOptionGroup["items"][0]>()
    let sort = 0
    const menusWithPart = new Set<string>()
    for (const o of optionsConfigAllMenuOptionsCatalog) {
      const mid = String(o.menuId ?? "").trim()
      if (!mid || !chickenMenuIds.has(mid)) continue
      const menu = menus.find((m) => String(m.id) === mid)
      const stepGroups = normalizeOptionGroupsForMenu(
        Array.isArray(menu?.optionSelectionGroups)
          ? menu.optionSelectionGroups.map((x) => String(x).trim()).filter(Boolean)
          : [],
        menu?.code
      )
      const fromStep = String(o.optionStepValues?.part ?? "").trim()
      const inferred = shouldInferChickenPartFromName(o, stepGroups) ? inferChickenOptionPartValue(o) : ""
      const part = fromStep || inferred
      const p = String(part ?? "").trim()
      if (!p) continue
      const dedupeKey = chickenPartDedupeKey(p)
      if (!dedupeKey) continue
      menusWithPart.add(mid)
      if (byDedupeKey.has(dedupeKey)) continue
      byDedupeKey.set(dedupeKey, {
        id: "",
        groupId: "",
        itemName: prettyChickenPartLibraryLabel(dedupeKey, p),
        sortOrder: sort++,
        basePriceHall: 0,
        basePriceDelivery: null,
        sellHall: true,
        sellDelivery: true,
      })
    }
    if (byDedupeKey.size === 0) return null
    const partOrder = (k: string) => {
      const i = ["boneless", "wing", "drumette"].indexOf(k)
      return i === -1 ? 100 : i
    }
    const sortedItems = [...byDedupeKey.entries()]
      .sort(([ka], [kb]) => {
        const d = partOrder(ka) - partOrder(kb)
        if (d !== 0) return d
        return ka.localeCompare(kb, undefined, { numeric: true })
      })
      .map(([, row], i) => ({ ...row, sortOrder: i }))
    return {
      id: VIRTUAL_CHICKEN_PART_GROUP_ID,
      key: "part",
      code: resolvePosOptionGroupCode({ key: "part" }),
      name: t("posOptionVirtualLibraryChickenPartName") || "부위 후보 (치킨 메뉴 DB)",
      isActive: true,
      sortOrder: -100,
      items: sortedItems,
      linkedMenuCount: menusWithPart.size,
    }
  }, [menus, optionsConfigLibraryGroups, optionsConfigAllMenuOptionsCatalog, t])

  const optionsConfigLibraryGroupsForUi = React.useMemo(() => {
    const out = [...optionsConfigLibraryGroups]
    if (optionsConfigVirtualChickenPartLibraryGroup) out.push(optionsConfigVirtualChickenPartLibraryGroup)
    return out
  }, [optionsConfigLibraryGroups, optionsConfigVirtualChickenPartLibraryGroup])

  const optionsConfigLibraryItems = React.useMemo(() => {
    const q = optionsConfigLibrarySearchTerm.trim().toLowerCase()
    const MAX_ITEM_LINES = 40
    type Row = {
      id: string
      groupCode: string
      groupTitle: string
      groupKey: string
      itemLines: string[]
      itemTotal: number
      footerNote: string
      sortLabel: string
      linkedMenuCount: number
      sortOrder: number
      numericId: number
      canUse: boolean
    }
    const rows: Row[] = []
    for (const g of optionsConfigLibraryGroupsForUi) {
      if (!g.isActive) continue
      const items = g.items || []
      const hasItems = items.length > 0
      const groupKey = String(g.key ?? "").trim()
      const keyLower = groupKey.toLowerCase()
      const groupCode = resolvePosOptionGroupCode({ code: g.code, key: groupKey })
      const codeLower = groupCode.toLowerCase()
      const name = String(g.name ?? "").trim()
      const nameLower = name.toLowerCase()
      if (q && !keyLower.includes(q) && !codeLower.includes(q) && !nameLower.includes(q)) {
        const inItem = items.some((it) => String(it.itemName ?? "").trim().toLowerCase().includes(q))
        if (!inItem) continue
      }
      const deliveryOnlyGroup =
        hasItems && items.every((it) => it.sellDelivery !== false && it.sellHall === false)
      if (optionsConfigLibraryFilter === "deliveryOnly" && !deliveryOnlyGroup) continue
      const linkedMenuCount = Number(g.linkedMenuCount ?? 0)
      if (optionsConfigLibraryFilter === "frequent" && linkedMenuCount < 2) continue
      const groupTitle = name || groupKey || "—"
      const itemsSorted = [...items].sort((a, b) => {
        const ao = Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)
        if (ao !== 0) return ao
        return String(a.itemName ?? "").localeCompare(String(b.itemName ?? ""), undefined, { numeric: true })
      })
      const allNamesRaw = itemsSorted.map((it) => String(it.itemName ?? "").trim()).filter(Boolean)
      const seenLower = new Set<string>()
      const allNames: string[] = []
      for (const n of allNamesRaw) {
        const k = n.toLowerCase()
        if (seenLower.has(k)) continue
        seenLower.add(k)
        allNames.push(n)
      }
      const itemLines = allNames.slice(0, MAX_ITEM_LINES)
      const itemTotal = allNames.length
      const moreHidden = itemTotal - itemLines.length
      const footerNote =
        moreHidden > 0
          ? (t("posOptionTemplateItemListTruncated") || "목록 {shown}개까지 표시 · 외 {more}건")
              .replace("{shown}", String(itemLines.length))
              .replace("{more}", String(moreHidden))
          : ""
      const sortLabel = `${groupCode} ${groupKey} ${name} ${allNames.join(" ")}`.trim()
      const numericId = String(g.id).startsWith("virtual:") ? 0 : Number(g.id) || 0
      rows.push({
        id: String(g.id),
        groupCode,
        groupTitle,
        groupKey,
        itemLines,
        itemTotal,
        footerNote,
        sortLabel,
        linkedMenuCount,
        sortOrder: Number(g.sortOrder ?? 0),
        numericId,
        canUse: hasItems,
      })
    }
    if (optionsConfigLibraryFilter === "recent") {
      rows.sort((a, b) => b.numericId - a.numericId)
    } else if (optionsConfigLibraryFilter === "frequent") {
      rows.sort((a, b) => b.linkedMenuCount - a.linkedMenuCount || b.numericId - a.numericId)
    } else {
      rows.sort((a, b) => {
        const so = a.sortOrder - b.sortOrder
        if (so !== 0) return so
        return a.sortLabel.localeCompare(b.sortLabel, undefined, { numeric: true })
      })
    }
    return rows.slice(0, 200)
  }, [optionsConfigLibraryGroupsForUi, optionsConfigLibraryFilter, optionsConfigLibrarySearchTerm, t])

  const handleUseOptionTemplateFromLibrary = React.useCallback(
    async (groupId: string) => {
      if (!optionsConfigSelectedMenuId || !optionsConfigSelectedMenu) {
        await appAlert(t("posMenuOptionsConfigNoSelect") || "메뉴를 먼저 선택해 주세요.")
        return
      }
      if (optionsConfigSelectedMenu.promoId?.trim()) {
        await appAlert(t("posMenuPromoLinkedEdit") || "프로모션과 연동된 메뉴는 마케팅 > 프로모션 관리에서 수정하세요.")
        return
      }

      let resolvedGroupId = String(groupId).trim()
      let postMaterializeGroups: PosOptionGroup[] | null = null

      if (resolvedGroupId.startsWith("virtual:")) {
        const v = optionsConfigLibraryGroupsForUi.find((x) => String(x.id) === resolvedGroupId)
        if (!v?.items?.length) {
          await appAlert(t("posOptionTemplateListEmpty") || "불러올 공통 옵션그룹이 없습니다.")
          return
        }
        const globalList = (await getPosOptionGroups()) as PosOptionGroup[]
        const gk = String(v.key ?? "").trim().toLowerCase()
        const existingSameKey = globalList.find((g) => String(g.key ?? "").trim().toLowerCase() === gk)
        const useExistingId =
          existingSameKey?.id &&
          String(existingSameKey.id).length > 0 &&
          (existingSameKey.items?.length ?? 0) === 0
            ? String(existingSameKey.id)
            : undefined
        const saveRes = await savePosOptionGroup({
          id: useExistingId,
          key: String(v.key ?? "").trim(),
          name: String(v.name ?? "").trim(),
          sortOrder: Number(v.sortOrder ?? 0) || 0,
          items: v.items.map((it, i) => ({
            itemName: String(it.itemName ?? "").trim(),
            sortOrder: i,
            basePriceHall: Number(it.basePriceHall ?? 0) || 0,
            basePriceDelivery: it.basePriceDelivery != null ? Number(it.basePriceDelivery) : null,
            sellHall: it.sellHall !== false,
            sellDelivery: it.sellDelivery !== false,
          })),
        })
        if (!saveRes.success) {
          await appAlert(translateApiMessage(saveRes.message, t) || saveRes.message || t("msg_save_fail_detail"))
          return
        }
        resolvedGroupId = String(saveRes.id ?? "").trim()
        postMaterializeGroups = (await getPosOptionGroups()) as PosOptionGroup[]
        setOptionsConfigLibraryGroups(Array.isArray(postMaterializeGroups) ? postMaterializeGroups : [])
      }

      const gidNum = Number(resolvedGroupId)
      if (!Number.isFinite(gidNum) || gidNum <= 0) {
        await appAlert(t("posOptionTemplateInvalidGroup") || "유효하지 않은 옵션그룹입니다.")
        return
      }

      const template =
        postMaterializeGroups?.find((x) => String(x.id) === resolvedGroupId) ??
        optionsConfigLibraryGroupsForUi.find((x) => String(x.id) === resolvedGroupId)
      if (!template?.items?.length) {
        await appAlert(t("posOptionTemplateListEmpty") || "불러올 공통 옵션그룹이 없습니다.")
        return
      }

      const menuGroups = await getPosOptionGroups({ menuId: optionsConfigSelectedMenuId })
      const already = (menuGroups || []).find((g) => String(g.id) === String(resolvedGroupId) && g.link)
      if (already) {
        await appAlert(t("posOptionTemplateGroupAlreadyLinked"))
        return
      }

      const linkedOnMenu = (menuGroups || []).filter((g): g is PosOptionGroup & { link: NonNullable<PosOptionGroup["link"]> } =>
        Boolean(g.link)
      )
      const hasStandaloneDb =
        optionsConfigMenuOptions.some((o) => /^\d+$/.test(String(o.id ?? ""))) && linkedOnMenu.length === 0
      if (hasStandaloneDb) {
        const ok = await appConfirm(t("posOptionGroupLinkFirstWarning"))
        if (!ok) return
      }

      const sortedExisting = [...linkedOnMenu].sort(
        (a, b) => Number(a.link?.sortOrder ?? 0) - Number(b.link?.sortOrder ?? 0)
      )
      const maxOrder = sortedExisting.reduce((m, g) => Math.max(m, Number(g.link?.sortOrder ?? 0)), -1)

      const payloads = sortedExisting.map((g, idx) => ({
        id: g.link?.id,
        groupId: String(g.id),
        sortOrder: Number(g.link?.sortOrder ?? idx),
        sellHall: g.link?.sellHall !== false,
        sellDelivery: g.link?.sellDelivery !== false,
        priceHallOverride: g.link?.priceHallOverride ?? null,
        priceDeliveryOverride: g.link?.priceDeliveryOverride ?? null,
        required: g.link?.required !== false,
        minSelect: Number(g.link?.minSelect ?? 0),
        maxSelect: Number(g.link?.maxSelect ?? 1),
      }))

      payloads.push({
        id: undefined,
        groupId: resolvedGroupId,
        sortOrder: maxOrder + 1,
        sellHall: true,
        sellDelivery: true,
        priceHallOverride: null,
        priceDeliveryOverride: null,
        required: true,
        minSelect: 1,
        maxSelect: 1,
      })

      try {
        const res = await savePosMenuOptionGroupLinks({
          menuId: Number(optionsConfigSelectedMenuId),
          links: payloads,
        })
        if (!res?.success) {
          await appAlert(translateApiMessage(res?.message, t) || t("saveFailed") || "저장 실패")
          return
        }
        await loadMenusAndCategories(setOptionsConfigListLoading)
        const linkedGroups = await getPosOptionGroups({ menuId: optionsConfigSelectedMenuId })
        const keysFromLinks = (linkedGroups || [])
          .filter((g) => g.link)
          .map((g) => String(g.key ?? "").trim())
          .filter(Boolean)
        const draftKeys = parseOptionGroupsFromText(optionsConfigGroupsDraft)
        const mergedGroupKeys = normalizeOptionGroupsForMenu(
          Array.from(new Set([...keysFromLinks, ...draftKeys])),
          optionsConfigSelectedMenu.code
        )
        const currentGroupKeys = normalizeOptionGroupsForMenu(
          (optionsConfigSelectedMenu.optionSelectionGroups ?? [])
            .map((x) => String(x).trim())
            .filter(Boolean),
          optionsConfigSelectedMenu.code
        )
        if (JSON.stringify(mergedGroupKeys) !== JSON.stringify(currentGroupKeys)) {
          const nextConfig = applyChickenDeliveryRulesToConfig(
            mergedGroupKeys,
            syncOptionSelectionConfigToGroupKeys(mergedGroupKeys, optionsConfigGroupRulesDraft),
            optionsConfigSelectedMenu.code,
            t
          )
          const syncRes = await savePosMenu({
            id: optionsConfigSelectedMenuId,
            code: optionsConfigSelectedMenu.code,
            name: optionsConfigSelectedMenu.name,
            category: optionsConfigSelectedMenu.category ?? "",
            categoryMain: optionsConfigSelectedMenu.categoryMain ?? "",
            sortOrder: optionsConfigSelectedMenu.sortOrder ?? 0,
            price: optionsConfigSelectedMenu.price,
            priceDelivery: optionsConfigSelectedMenu.priceDelivery ?? null,
            vatIncluded: optionsConfigSelectedMenu.vatIncluded ?? true,
            isActive: optionsConfigSelectedMenu.isActive ?? true,
            optionSelectionGroups: mergedGroupKeys,
            optionSelectionConfig: nextConfig,
            isBanban: optionsConfigSelectedMenu.isBanban ?? false,
          })
          if (syncRes.success) {
            setMenus((prev) =>
              prev.map((m) =>
                m.id === optionsConfigSelectedMenuId
                  ? { ...m, optionSelectionGroups: mergedGroupKeys, optionSelectionConfig: nextConfig }
                  : m
              )
            )
            setOptionsConfigGroupsDraft(mergedGroupKeys.join(", "))
            setOptionsConfigGroupRulesDraft(nextConfig)
          }
        }
        const opts = await getPosMenuOptions({ menuId: optionsConfigSelectedMenuId, fresh: true })
        applyLoadedOptionsForConfig(Array.isArray(opts) ? opts : [])
        const refreshedLib = await getPosOptionGroups()
        setOptionsConfigLibraryGroups(Array.isArray(refreshedLib) ? refreshedLib : [])
        await appAlert(t("posOptionTemplateGroupLinkedDone"))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        await appAlert(translateApiMessage(msg, t) || t("saveFailed") || "저장 실패")
      }
    },
    [
      applyLoadedOptionsForConfig,
      loadMenusAndCategories,
      optionsConfigLibraryGroupsForUi,
      optionsConfigGroupsDraft,
      optionsConfigGroupRulesDraft,
      optionsConfigMenuOptions,
      optionsConfigSelectedMenu,
      optionsConfigSelectedMenuId,
      t,
    ]
  )

  const optionsConfigDraftGroupsParsed = React.useMemo(
    () => parseOptionGroupsFromText(optionsConfigGroupsDraft),
    [optionsConfigGroupsDraft]
  )

  React.useEffect(() => {
    if (!optionsConfigSelectedMenuId) return
    setOptionsConfigGroupRulesDraft((prev) => normalizeOptionSelectionConfig(optionsConfigDraftGroupsParsed, prev))
  }, [optionsConfigSelectedMenuId, optionsConfigDraftGroupsParsed])

  /** 사이즈/부위 드롭다운은 치킨(c 접두)이면서 단계가 size·part만일 때. part+추가단계(sauce 등)는 키별 입력 */
  const optionsConfigUseSizePartUi = React.useMemo(() => {
    if (!optionsConfigSelectedMenu) return false
    if (!isChickenMenu(optionsConfigSelectedMenu.code)) return false
    const g = optionsConfigPanelStepGroups
    if (g.length === 0) return false
    return g.every((key) => key === "size" || key === "part") && g.includes("part")
  }, [optionsConfigSelectedMenu, optionsConfigPanelStepGroups])

  const optionsConfigGroupPanelItems = React.useMemo(() => {
    if (optionsConfigPanelStepGroups.length === 0) {
      return [
        {
          key: "__default__",
          label: t("posOptionDefaultGroupRowLabel"),
          required: false,
          count: optionsConfigMenuOptions.length,
          audience: "all" as const,
          minSelect: 0,
          maxSelect: 1,
          ruleSummary: t("posOptionStepListDefaultHint") || "선택 단계 없음",
        },
      ]
    }
    return optionsConfigPanelStepGroups.map((groupKey) => {
      const row =
        optionsConfigGroupRulesDraft.find((x) => x.key === groupKey) ||
        ({ key: groupKey, label: groupKey, required: true, minSelect: 1, maxSelect: 1 } as PosOptionSelectionGroupConfig)
      const required = row.required !== false
      const minSel =
        row.minSelect != null && Number.isFinite(Number(row.minSelect))
          ? Math.max(0, Math.floor(Number(row.minSelect)))
          : required
            ? 1
            : 0
      const maxSel =
        row.maxSelect != null && Number.isFinite(Number(row.maxSelect))
          ? Math.max(1, Math.floor(Number(row.maxSelect)))
          : 1
      const audience: "all" | "hall" | "delivery" =
        row.audience === "hall" || row.audience === "delivery" ? row.audience : "all"
      const audienceWord =
        audience === "all"
          ? t("posOptionAudienceShortAll") || "홀+배달"
          : audience === "hall"
            ? t("posOptionSellHall") || "홀"
            : t("posOptionSellDelivery") || "배달"
      const ruleSummary = (t("posOptionSelectionRuleSummary") || "채널: {audience} / 최소 {min}개 / 최대 {max}개")
        .replace("{audience}", audienceWord)
        .replace("{min}", String(minSel))
        .replace("{max}", String(maxSel))
      let displayLabel = String(row.label ?? groupKey).trim()
      if (isChickenMenu(optionsConfigSelectedMenu?.code) && isSizePartGroups(optionsConfigPanelStepGroups)) {
        if (groupKey === "size") displayLabel = formatChickenOptionStepDisplayLabel("size", t)
        else if (groupKey === "part") displayLabel = formatChickenOptionStepDisplayLabel("part", t)
      }
      return {
        key: groupKey,
        label: displayLabel,
        required,
        count: optionsConfigMenuOptions.filter((opt) =>
          optionMatchesGroupFilter(opt, groupKey, optionsConfigSelectedMenu?.code, optionsConfigPanelStepGroups)
        ).length,
        audience,
        minSelect: minSel,
        maxSelect: maxSel,
        ruleSummary,
      }
    })
  }, [
    optionsConfigPanelStepGroups,
    optionsConfigMenuOptions,
    optionsConfigGroupRulesDraft,
    optionsConfigSelectedMenu?.code,
    t,
  ])

  const optionsConfigSelectedGroupLabel = React.useMemo(() => {
    const key = optionsConfigEffectiveGroupKey
    if (!key) return ""
    const row = optionsConfigGroupPanelItems.find((g) => g.key === key)
    return row?.label || key
  }, [optionsConfigEffectiveGroupKey, optionsConfigGroupPanelItems])

  /** 옵션 목록 괄호 제목: 치킨 size/part는 가운데 패널과 중복되지 않게 짧게(사이즈 / 부위만) */
  const optionsConfigOptionListBracketLabel = React.useMemo(() => {
    if (!optionsConfigEffectiveGroupKey || optionsConfigEffectiveGroupKey === "__default__") return ""
    if (
      optionsConfigSelectedMenu &&
      isChickenMenu(optionsConfigSelectedMenu.code) &&
      isSizePartGroups(optionsConfigPanelStepGroups)
    ) {
      if (optionsConfigEffectiveGroupKey === "size") return t("posOptionGroupSize")
      if (optionsConfigEffectiveGroupKey === "part") return t("posOptionGroupPart")
    }
    return optionsConfigSelectedGroupLabel || optionsConfigEffectiveGroupKey
  }, [
    optionsConfigEffectiveGroupKey,
    optionsConfigSelectedGroupLabel,
    optionsConfigSelectedMenu,
    optionsConfigPanelStepGroups,
    t,
  ])

  const optionsConfigOptionsInSelectedGroup = React.useMemo(() => {
    const key = optionsConfigEffectiveGroupKey
    if (!key || key === "__default__") return optionsConfigMenuOptions
    const inGroup = optionsConfigMenuOptions.filter((opt) =>
      optionMatchesGroupFilter(opt, key, optionsConfigSelectedMenu?.code, optionsConfigPanelStepGroups)
    )
    const isChickenSizePart =
      isChickenMenu(optionsConfigSelectedMenu?.code) &&
      isSizePartGroups(optionsConfigPanelStepGroups) &&
      (key === "size" || key === "part")
    /** 레거시: DB step 만 있을 때 비치킨 등은 0건이면 전체 표시. 치킨 size/part는 추론 실패 시 빈 목록(전체 폴백으로 size/part 동일 표시 방지) */
    if (inGroup.length === 0 && optionsConfigMenuOptions.length > 0 && !isChickenSizePart) {
      return optionsConfigMenuOptions
    }
    return inGroup
  }, [
    optionsConfigMenuOptions,
    optionsConfigEffectiveGroupKey,
    optionsConfigSelectedMenu?.code,
    optionsConfigPanelStepGroups,
  ])

  const optionsConfigOptionsOutsideSelectedGroupCount = React.useMemo(() => {
    const key = optionsConfigEffectiveGroupKey
    if (!key || key === "__default__") return 0
    const inGroup = optionsConfigMenuOptions.filter((opt) =>
      optionMatchesGroupFilter(opt, key, optionsConfigSelectedMenu?.code, optionsConfigPanelStepGroups)
    )
    const isChickenSizePart =
      isChickenMenu(optionsConfigSelectedMenu?.code) &&
      isSizePartGroups(optionsConfigPanelStepGroups) &&
      (key === "size" || key === "part")
    if (inGroup.length === 0 && optionsConfigMenuOptions.length > 0 && !isChickenSizePart) return 0
    return optionsConfigMenuOptions.filter(
      (opt) => !optionMatchesGroupFilter(opt, key, optionsConfigSelectedMenu?.code, optionsConfigPanelStepGroups)
    ).length
  }, [
    optionsConfigMenuOptions,
    optionsConfigEffectiveGroupKey,
    optionsConfigSelectedMenu?.code,
    optionsConfigPanelStepGroups,
  ])

  const optionsConfigCopySourceMenus = React.useMemo(() => {
    if (!optionsConfigSelectedMenuId) return [] as PosMenu[]
    return menus.filter((m) => m.id !== optionsConfigSelectedMenuId)
  }, [menus, optionsConfigSelectedMenuId])

  const handleOptionGroupRuleFieldChange = React.useCallback(
    (groupKey: string, patch: Partial<PosOptionSelectionGroupConfig>) => {
      setOptionsConfigGroupRulesDraft((prev) => {
        const targetGroups = optionsConfigPanelStepGroups
        const normalized = normalizeOptionSelectionConfig(targetGroups, prev)
        const patched = normalized.map((row) => (row.key === groupKey ? { ...row, ...patch } : row))
        return applyChickenDeliveryRulesToConfig(targetGroups, patched, optionsConfigSelectedMenu?.code, t)
      })
    },
    [optionsConfigPanelStepGroups, optionsConfigSelectedMenu?.code, t]
  )

  /** 선택 단계의 노출 채널( audience ) — 단계 저장 시 DB 반영 */
  const optionsConfigStepChannelScope = React.useMemo((): "all" | "hall" | "delivery" => {
    const groupKey = optionsConfigEffectiveGroupKey
    if (groupKey && groupKey !== "__default__" && optionsConfigPanelStepGroups.includes(groupKey)) {
      const row = optionsConfigGroupRulesDraft.find((x) => x.key === groupKey)
      if (row?.audience === "hall" || row?.audience === "delivery") return row.audience
    }
    if (newOptionChannelScope === "delivery") return "delivery"
    if (newOptionChannelScope === "hall" || newOptionChannelScope === "packaging") return "hall"
    return "all"
  }, [
    optionsConfigEffectiveGroupKey,
    optionsConfigPanelStepGroups,
    optionsConfigGroupRulesDraft,
    newOptionChannelScope,
  ])

  const handleOptionsConfigStepChannelScope = React.useCallback(
    (scope: "all" | "hall" | "delivery") => {
      setNewOptionChannelScope(scope)
      const groupKey = optionsConfigEffectiveGroupKey
      if (!groupKey || groupKey === "__default__" || !optionsConfigPanelStepGroups.includes(groupKey)) {
        return
      }
      handleOptionGroupRuleFieldChange(groupKey, { audience: scope })
    },
    [optionsConfigEffectiveGroupKey, optionsConfigPanelStepGroups, handleOptionGroupRuleFieldChange]
  )

  const resolveAudienceFromChannelToggle = React.useCallback(
    (current: "all" | "hall" | "delivery" | undefined, channel: "hall" | "delivery", checked: boolean) => {
      const hallOn = channel === "hall" ? checked : current === "all" || current === "hall"
      const delOn = channel === "delivery" ? checked : current === "all" || current === "delivery"
      if (hallOn && delOn) return "all" as const
      if (delOn) return "delivery" as const
      if (hallOn) return "hall" as const
      return "all" as const
    },
    []
  )

  const handleToggleGroupAudienceForConfig = React.useCallback(
    (groupKey: string, channel: "hall" | "delivery", checked: boolean) => {
      const row = optionsConfigGroupRulesDraft.find((x) => x.key === groupKey)
      const current =
        row?.audience === "hall" || row?.audience === "delivery" ? row.audience : ("all" as const)
      handleOptionGroupRuleFieldChange(groupKey, {
        audience: resolveAudienceFromChannelToggle(current, channel, checked),
      })
    },
    [optionsConfigGroupRulesDraft, handleOptionGroupRuleFieldChange, resolveAudienceFromChannelToggle]
  )

  const persistOptionGroupConfigFromDraft = React.useCallback(async (): Promise<{
    ok: boolean
    message?: string
    skipped?: boolean
  }> => {
    if (!optionsConfigSelectedMenuId || !optionsConfigSelectedMenu) return { ok: true, skipped: true }
    const pid = optionsConfigSelectedMenu.promoId?.trim()
    if (pid) {
      return {
        ok: false,
        message: t("posMenuPromoLinkedEdit") || "프로모션과 연동된 메뉴는 마케팅 > 프로모션 관리에서 수정하세요.",
      }
    }
    const parsed = normalizeOptionGroupsForMenu(
      parseOptionGroupsFromText(optionsConfigGroupsDraft),
      optionsConfigSelectedMenu.code
    )
    const normalized = normalizeOptionSelectionConfig(parsed, optionsConfigGroupRulesDraft)
    const nextConfig = applyChickenDeliveryRulesToConfig(
      parsed,
      normalized,
      optionsConfigSelectedMenu.code,
      t
    )
    const savedGroups = normalizeOptionGroupsForMenu(
      (optionsConfigSelectedMenu.optionSelectionGroups ?? []).map((x) => String(x).trim()).filter(Boolean),
      optionsConfigSelectedMenu.code
    )
    const savedConfig = applyChickenDeliveryRulesToConfig(
      savedGroups,
      normalizeOptionSelectionConfig(savedGroups, optionsConfigSelectedMenu.optionSelectionConfig),
      optionsConfigSelectedMenu.code,
      t
    )
    if (JSON.stringify(parsed) === JSON.stringify(savedGroups) && JSON.stringify(nextConfig) === JSON.stringify(savedConfig)) {
      return { ok: true, skipped: true }
    }
    const res = await savePosMenu({
      id: optionsConfigSelectedMenuId,
      code: optionsConfigSelectedMenu.code,
      name: optionsConfigSelectedMenu.name,
      category: optionsConfigSelectedMenu.category ?? "",
      categoryMain: optionsConfigSelectedMenu.categoryMain ?? "",
      sortOrder: optionsConfigSelectedMenu.sortOrder ?? 0,
      price: optionsConfigSelectedMenu.price,
      priceDelivery: optionsConfigSelectedMenu.priceDelivery ?? null,
      vatIncluded: optionsConfigSelectedMenu.vatIncluded ?? true,
      isActive: optionsConfigSelectedMenu.isActive ?? true,
      optionSelectionGroups: parsed,
      optionSelectionConfig: nextConfig,
      isBanban: optionsConfigSelectedMenu.isBanban ?? false,
    })
    if (!res.success) return { ok: false, message: res.message || t("msg_save_fail_detail") }
    setMenus((prev) =>
      prev.map((m) =>
        m.id === optionsConfigSelectedMenuId
          ? { ...m, optionSelectionGroups: parsed, optionSelectionConfig: nextConfig }
          : m
      )
    )
    setOptionsConfigGroupRulesDraft(nextConfig)
    return { ok: true, skipped: false }
  }, [
    optionsConfigSelectedMenuId,
    optionsConfigSelectedMenu,
    optionsConfigGroupsDraft,
    optionsConfigGroupRulesDraft,
    t,
  ])

  const handleMoveOptionGroup = React.useCallback(
    (groupKey: string, direction: "up" | "down") => {
      const current = [...optionsConfigPanelStepGroups]
      const code = optionsConfigSelectedMenu?.code
      const nextNorm = optionStepOrderAfterSwap(current, groupKey, direction, code)
      if (!nextNorm) return
      if (nextNorm.length === current.length && nextNorm.every((k, i) => k === current[i])) return
      setOptionsConfigGroupsDraft(nextNorm.join(", "))
      setOptionsConfigGroupRulesDraft((prev) => {
        const normalized = normalizeOptionSelectionConfig(nextNorm, prev)
        return applyChickenDeliveryRulesToConfig(nextNorm, normalized, code, t)
      })
    },
    [optionsConfigPanelStepGroups, optionsConfigSelectedMenu?.code, t]
  )

  const isOptionStepMoveUpDisabled = React.useCallback(
    (groupKey: string) => {
      const current = optionsConfigPanelStepGroups
      const idx = current.indexOf(groupKey)
      if (idx <= 0) return true
      const code = optionsConfigSelectedMenu?.code
      const nextNorm = optionStepOrderAfterSwap(current, groupKey, "up", code)
      if (!nextNorm) return true
      return nextNorm.length === current.length && nextNorm.every((k, i) => k === current[i])
    },
    [optionsConfigPanelStepGroups, optionsConfigSelectedMenu?.code]
  )

  const isOptionStepMoveDownDisabled = React.useCallback(
    (groupKey: string) => {
      const current = optionsConfigPanelStepGroups
      const idx = current.indexOf(groupKey)
      if (idx < 0 || idx >= current.length - 1) return true
      const code = optionsConfigSelectedMenu?.code
      const nextNorm = optionStepOrderAfterSwap(current, groupKey, "down", code)
      if (!nextNorm) return true
      return nextNorm.length === current.length && nextNorm.every((k, i) => k === current[i])
    },
    [optionsConfigPanelStepGroups, optionsConfigSelectedMenu?.code]
  )

  const handleRemoveOptionGroup = React.useCallback(
    async (groupKey: string) => {
      if (!optionsConfigSelectedMenu) return
      const promoId = optionsConfigSelectedMenu.promoId?.trim()
      if (promoId) {
        await appAlert(t("posMenuPromoLinkedEdit") || "프로모션과 연동된 메뉴는 마케팅 > 프로모션 관리에서 수정하세요.")
        return
      }
      const current = [...optionsConfigPanelStepGroups]
      if (!current.includes(groupKey)) return
      if (isChickenMenu(optionsConfigSelectedMenu.code) && groupKey === "part") {
        await appAlert(
          t("posOptionRemovePartBlocked") || "치킨 메뉴에서는 부위(part) 단계를 제거할 수 없습니다."
        )
        return
      }
      if (isChickenMenu(optionsConfigSelectedMenu.code) && current.length <= 1) {
        await appAlert(
          t("posOptionGroupDeleteChickenMin") ||
            "치킨 메뉴는 옵션 선택 단계를 최소 1개(part) 유지해야 합니다."
        )
        return
      }
      const ok = await appConfirm(
        (t("posOptionStepRemoveGroupConfirm") || '단계 "{step}"을(를) 목록에서 제거할까요? [단계 저장] 후 서버에 반영됩니다.').replace(
          "{step}",
          groupKey
        )
      )
      if (!ok) return
      const next = current.filter((k) => k !== groupKey)
      setOptionsConfigGroupsDraft(next.length > 0 ? next.join(", ") : "")
      setOptionsConfigGroupRulesDraft((prev) => {
        const normalized = normalizeOptionSelectionConfig(next, prev)
        return applyChickenDeliveryRulesToConfig(next, normalized, optionsConfigSelectedMenu.code, t)
      })
      setOptionsConfigSelectedGroupKey((prev) => {
        if (prev !== groupKey) return prev
        return next[0] ?? ""
      })
    },
    [optionsConfigSelectedMenu, optionsConfigPanelStepGroups, t]
  )

  const handleAppendOptionStepKey = React.useCallback(async () => {
    if (!optionsConfigSelectedMenuId || !optionsConfigSelectedMenu) {
      await appAlert(t("posMenuOptionsConfigNoSelect") || "메뉴를 먼저 선택해 주세요.")
      return
    }
    if (optionsConfigSelectedMenu.promoId?.trim()) {
      await appAlert(t("posMenuPromoLinkedEdit") || "프로모션과 연동된 메뉴는 마케팅 > 프로모션 관리에서 수정하세요.")
      return
    }
    const raw = optionsConfigNewGroupKeyInput.trim()
    if (!raw) {
      await appAlert(t("posOptionAddStepEmpty") || "단계 키를 입력해 주세요.")
      return
    }
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(raw)) {
      await appAlert(
        t("posOptionAddStepInvalid") ||
          "단계 키는 영문으로 시작하고, 영문·숫자·밑줄(_)만 사용할 수 있습니다."
      )
      return
    }
    const key = raw.toLowerCase()
    if (isStrictBonelessBbqChickenCode(optionsConfigSelectedMenu.code) && (key === "size" || key === "part")) {
      await appAlert(
        "BBQ 메뉴(C020~C023)는 size/part 단계를 허용하지 않습니다. sidedish 같은 부가 단계를 사용해 주세요."
      )
      return
    }
    const current = parseOptionGroupsFromText(optionsConfigGroupsDraft)
    if (current.some((x) => x.toLowerCase() === key)) {
      await appAlert(t("posOptionAddStepDuplicate") || "이미 있는 단계입니다.")
      return
    }
    const next = normalizeOptionGroupsForMenu([...current, key], optionsConfigSelectedMenu.code)
    if (!next.some((x) => x.toLowerCase() === key)) {
      await appAlert(
        "이 단계 키는 현재 메뉴 정책에서 허용되지 않습니다. sidedish 같은 부가 단계 키를 사용해 주세요."
      )
      return
    }
    setOptionsConfigGroupsDraft(next.join(", "))
    setOptionsConfigGroupRulesDraft((prev) => {
      const normalized = normalizeOptionSelectionConfig(next, prev)
      return applyChickenDeliveryRulesToConfig(next, normalized, optionsConfigSelectedMenu.code, t)
    })
    setOptionsConfigNewGroupKeyInput("")
    await appAlert(
      t("posOptionAddStepAppended") || "단계를 추가했습니다. 서버에 반영하려면 [단계 저장]을 눌러 주세요."
    )
  }, [
    optionsConfigGroupsDraft,
    optionsConfigNewGroupKeyInput,
    optionsConfigSelectedMenu,
    optionsConfigSelectedMenuId,
    t,
  ])

  const handleApplyOptionGroupsForConfig = async () => {
    if (!optionsConfigSelectedMenuId || !optionsConfigSelectedMenu) return
    setOptionsConfigApplyingGroups(true)
    try {
      const res = await persistOptionGroupConfigFromDraft()
      if (!res.ok) {
        await appAlert(res.message || t("msg_save_fail_detail"))
        return
      }
      if (!res.skipped) {
        setOptionsConfigNewStepValues({})
        await appAlert(t("msg_save_success") || "저장되었습니다.")
      } else {
        await appAlert(t("posOptionConfigNoGroupChanges") || "변경된 단계 설정이 없습니다.")
      }
    } finally {
      setOptionsConfigApplyingGroups(false)
    }
  }

  const handleAddFlatOptionForConfig = async () => {
    const channelPayload = resolveNewOptionChannelPayload()
    if (!optionsConfigSelectedMenuId || !optionsConfigSelectedMenu) return
    if (isChickenMenu(optionsConfigSelectedMenu.code)) return
    if (optionsConfigPanelStepGroups.length > 0) {
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
      optionCode: buildOptionCode(optionsConfigSelectedMenu.code, optionsConfigMenuOptions.length),
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

      const groups = optionsConfigPanelStepGroups
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
        optionCode: buildOptionCode(optionsConfigSelectedMenu.code, optionsConfigMenuOptions.length),
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

  const handleAddAllOptionsForConfig = async () => {
    const channelPayload = resolveNewOptionChannelPayload()
    if (!optionsConfigSelectedMenuId || !optionsConfigSelectedMenu) return
    if (isChickenMenu(optionsConfigSelectedMenu.code)) return
    if (!isSizePartGroups(optionsConfigPanelStepGroups)) {
      await appAlert(
        t("posOptionConfigAddAllSizePartOnly") ||
          "[전체 조합 추가]는 선택 단계가 size, part 순서일 때만 사용할 수 있습니다."
      )
      return
    }
    const existingKeys = new Set(
      optionsConfigMenuOptions.map((o) => `${o.optionStepValues?.size ?? ""}_${o.optionStepValues?.part ?? ""}`)
    )
    const combinations: { size: string; part: string; sellHall: boolean; sellDelivery: boolean; sellPackaging: boolean }[] =
      OPTION_SIZE_VALUES.flatMap((size) =>
        OPTION_PART_VALUES.map((part) => ({
          size,
          part,
          sellHall: true,
          sellDelivery: true,
          sellPackaging: true,
        }))
      )
    let added = 0
    for (const { size, part } of combinations) {
      if (existingKeys.has(`${size}_${part}`)) continue
      const name = `${size} - ${part}`
      const res = await savePosMenuOption({
        menuId: Number(optionsConfigSelectedMenuId),
        optionCode: buildOptionCode(optionsConfigSelectedMenu.code, optionsConfigMenuOptions.length + added),
        name,
        priceModifier: channelPayload.priceModifier,
        priceModifierDelivery: channelPayload.priceModifierDelivery,
        priceModifierPackaging: channelPayload.priceModifierPackaging,
        sortOrder: optionsConfigMenuOptions.length + added,
        optionType: "substitution",
        optionStepValues: { size, part },
        sellHall: channelPayload.sellHall,
        sellDelivery: channelPayload.sellDelivery,
        sellPackaging: channelPayload.sellPackaging,
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
    const selectedMenuCode = optionsConfigSelectedMenu?.code
    setOptionsConfigMenuOptions((prev) => {
      const from = prev.findIndex((x) => String(x.id) === String(dragId))
      const to = prev.findIndex((x) => String(x.id) === String(dropId))
      if (from < 0 || to < 0) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next.map((row, idx) => ({
        ...row,
        sortOrder: idx,
        optionCode: buildOptionCode(selectedMenuCode, idx),
      }))
    })
  }, [optionsConfigSelectedMenu?.code])

  const appendOptionsConfigBulkLabels = React.useCallback((labels: string[]) => {
    const clean = [...new Set(labels.map((l) => l.trim()).filter(Boolean))]
    if (clean.length === 0) return
    setOptionsConfigBulkValuesInput((prev) => {
      const base = prev.trim()
      const chunk = clean.join(", ")
      if (!base) return chunk
      return `${base.replace(/,\s*$/, "")}, ${chunk}`
    })
  }, [])

  const optionsConfigBulkMenuPickerList = React.useMemo(() => {
    const cur = optionsConfigSelectedMenuId
    const q = optionsConfigBulkMenuPickerSearch.trim().toLowerCase()
    let rows = menus.filter((m) => String(m.id) !== String(cur ?? ""))
    if (q) {
      rows = rows.filter((m) => {
        const hay = `${m.code ?? ""} ${m.name ?? ""} ${m.category ?? ""} ${m.categoryMain ?? ""}`.toLowerCase()
        return hay.includes(q)
      })
    }
    return sortByCode(rows, (m) => m.code)
  }, [menus, optionsConfigSelectedMenuId, optionsConfigBulkMenuPickerSearch])

  const optionsConfigBulkMenuPickerSelectedCount = React.useMemo(
    () => Object.values(optionsConfigBulkMenuPickerChecked).filter(Boolean).length,
    [optionsConfigBulkMenuPickerChecked]
  )

  const handleBulkAddValuesForSelectedGroup = React.useCallback(async () => {
    const selectedKey = optionsConfigEffectiveGroupKey !== "__default__" ? optionsConfigEffectiveGroupKey : ""
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
      optionsConfigMenuOptions
        .map((o) =>
          optionStepValueForGroupFilter(o, selectedKey, optionsConfigSelectedMenu?.code, optionsConfigPanelStepGroups).toLowerCase()
        )
        .filter(Boolean)
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
          optionCode: buildOptionCode(optionsConfigSelectedMenu?.code, next.length),
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
    optionsConfigEffectiveGroupKey,
    optionsConfigBulkValuesInput,
    optionsConfigBulkHallPrice,
    optionsConfigBulkDeliveryPrice,
    optionsConfigMenuOptions,
    resolveNewOptionChannelPayload,
    optionsConfigSelectedMenuId,
    optionsConfigSelectedMenu?.code,
    optionsConfigPanelStepGroups,
    t,
  ])

  const handleImportOptionsFromExistingMenu = React.useCallback(async () => {
    if (!optionsConfigSelectedMenuId || !optionsConfigSelectedMenu) return
    const sourceMenuId = optionsConfigCopySourceMenuId.trim()
    if (!sourceMenuId) {
      await appAlert(t("posOptionCopySourceRequired") || "가져올 원본 메뉴를 선택해 주세요.")
      return
    }
    const sourceMenu = menus.find((m) => m.id === sourceMenuId)
    if (!sourceMenu) {
      await appAlert(t("posOptionCopySourceRequired") || "가져올 원본 메뉴를 선택해 주세요.")
      return
    }
    const promoId = optionsConfigSelectedMenu.promoId?.trim()
    if (promoId) {
      await appAlert(t("posMenuPromoLinkedEdit") || "프로모션과 연동된 메뉴는 마케팅 > 프로모션 관리에서 수정하세요.")
      return
    }
    const confirmed = await appConfirm(
      (t("posOptionCopyConfirm") || "'{source}' 메뉴 옵션을 현재 메뉴에 가져올까요? 기존 옵션 뒤에 추가됩니다.")
        .replace("{source}", `${sourceMenu.code} ${sourceMenu.name}`)
    )
    if (!confirmed) return
    setOptionsConfigCopying(true)
    try {
      const sourceOptionsRaw = await getPosMenuOptions({ menuId: sourceMenuId, fresh: true })
      const sourceOptions = Array.isArray(sourceOptionsRaw) ? sourceOptionsRaw : []
      if (sourceOptions.length === 0) {
        await appAlert(t("posOptionCopyNoOptions") || "선택한 메뉴에 가져올 옵션이 없습니다.")
        return
      }
      const sourceGroups = normalizeOptionGroupsForMenu(
        (sourceMenu.optionSelectionGroups ?? []).map((x) => String(x).trim()).filter(Boolean),
        optionsConfigSelectedMenu.code
      )
      const normalizedGroupCfg = normalizeOptionSelectionConfig(sourceGroups, sourceMenu.optionSelectionConfig)
      const nextGroupConfig = applyChickenDeliveryRulesToConfig(
        sourceGroups,
        normalizedGroupCfg,
        optionsConfigSelectedMenu.code,
        t
      )
      const needGroupSync =
        JSON.stringify(sourceGroups) !== JSON.stringify(optionsConfigStepGroups) ||
        JSON.stringify(nextGroupConfig) !== JSON.stringify(optionsConfigGroupRulesDraft)
      if (needGroupSync) {
        const saveMenuRes = await savePosMenu({
          id: optionsConfigSelectedMenuId,
          code: optionsConfigSelectedMenu.code,
          name: optionsConfigSelectedMenu.name,
          category: optionsConfigSelectedMenu.category ?? "",
          categoryMain: optionsConfigSelectedMenu.categoryMain ?? "",
          sortOrder: optionsConfigSelectedMenu.sortOrder ?? 0,
          price: optionsConfigSelectedMenu.price,
          priceDelivery: optionsConfigSelectedMenu.priceDelivery ?? null,
          vatIncluded: optionsConfigSelectedMenu.vatIncluded ?? true,
          isActive: optionsConfigSelectedMenu.isActive ?? true,
          optionSelectionGroups: sourceGroups,
          optionSelectionConfig: nextGroupConfig,
          isBanban: optionsConfigSelectedMenu.isBanban ?? false,
        })
        if (!saveMenuRes.success) {
          await appAlert(saveMenuRes.message || t("msg_save_fail_detail"))
          return
        }
        setMenus((prev) =>
          prev.map((m) =>
            m.id === optionsConfigSelectedMenuId
              ? { ...m, optionSelectionGroups: sourceGroups, optionSelectionConfig: nextGroupConfig }
              : m
          )
        )
        setOptionsConfigGroupsDraft(sourceGroups.join(", "))
        setOptionsConfigGroupRulesDraft(nextGroupConfig)
      }
      const startSortOrder = optionsConfigMenuOptions.length
      const saveRes = await savePosMenuOptionsBulk({
        options: sourceOptions.map((opt, idx) => ({
          menuId: Number(optionsConfigSelectedMenuId),
          optionCode: String(opt.optionCode ?? "").trim() || undefined,
          name: String(opt.name ?? "").trim(),
          priceModifier: Number(opt.priceModifier ?? 0) || 0,
          priceModifierDelivery: opt.priceModifierDelivery ?? null,
          priceModifierPackaging: opt.priceModifierPackaging ?? null,
          sortOrder: startSortOrder + idx,
          optionType: opt.optionType ?? "substitution",
          itemCode: opt.itemCode ?? null,
          additiveSourceMenuId: opt.additiveSourceMenuId ?? null,
          quantity: opt.quantity ?? 1,
          optionStepValues: opt.optionStepValues ?? null,
          sellHall: opt.sellHall ?? true,
          sellDelivery: opt.sellDelivery ?? true,
          sellPackaging: opt.sellPackaging ?? true,
        })),
      })
      if (!saveRes.success) {
        const firstFailed = (saveRes.results || []).find((x) => !x.success)
        await appAlert(firstFailed?.message || saveRes.message || t("msg_save_fail_detail"))
        return
      }
      const refreshed = await getPosMenuOptions({ menuId: optionsConfigSelectedMenuId, fresh: true })
      applyLoadedOptionsForConfig(Array.isArray(refreshed) ? refreshed : [])
      const importedCount = sourceOptions.length
      await appAlert(
        (t("posOptionCopyDone") || "{n}개 옵션을 가져왔습니다. 코드 충돌 항목은 자동 재매핑되었습니다.").replace(
          "{n}",
          String(importedCount)
        )
      )
    } finally {
      setOptionsConfigCopying(false)
    }
  }, [
    optionsConfigSelectedMenuId,
    optionsConfigSelectedMenu,
    optionsConfigCopySourceMenuId,
    menus,
    t,
    optionsConfigStepGroups,
    optionsConfigGroupRulesDraft,
    optionsConfigMenuOptions.length,
    applyLoadedOptionsForConfig,
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
      String(a.optionCode ?? "") === String(b.optionCode ?? "") &&
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
      const groupRes = await persistOptionGroupConfigFromDraft()
      if (!groupRes.ok) {
        await appAlert(groupRes.message || t("msg_save_fail_detail"))
        return
      }
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
        optionCode: resolveOptionCode(o, optionsConfigSelectedMenu?.code),
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
          optionCode: o.optionCode ?? undefined,
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
      const filteredMenuIdSet = new Set(filteredMenus.map((m) => m.id))
      const rowKindCol = t("posMenuExportRowKind") || "행 구분"
      const rowKindMenu = t("posMenuExportRowMenu") || "메뉴"
      const rowKindOption = t("posMenuExportRowOption") || "옵션"
      const sheetUnified = (t("posMenuExportSheetUnified") || "메뉴+옵션(통합)").slice(0, 31)

      const menuCols = (m: (typeof filteredMenus)[0]) => ({
        [t("itemsColCode") || "코드"]: m.code ?? "",
        [t("posMenuName") || "메뉴명"]: m.name ?? "",
        [t("posMenuCategoryMain") || "대분류"]: m.categoryMain ?? "",
        [t("posMenuCategory") || "카테고리"]: m.category ?? "",
        [t("posMenuPriceHall") || "홀 가격"]: Number(m.price ?? 0),
        [t("posMenuPriceDelivery") || "배달 가격"]: Number(m.priceDelivery ?? 0),
        [t("posMenuVatIncluded") || "부가세 포함"]: m.vatIncluded ? (t("yes") || "Y") : (t("no") || "N"),
        [t("posMenuActive") || "활성"]: m.isActive ? (t("yes") || "Y") : (t("no") || "N"),
      })

      const emptyOptionCols = () => ({
        menuId: "",
        menuCode: "",
        menuName: "",
        optionId: "",
        optionCode: "",
        optionName: "",
        sortOrder: "",
        priceModifierHall: "",
        priceModifierDelivery: "",
        priceModifierPackaging: "",
        optionType: "",
        itemCode: "",
        additiveSourceMenuId: "",
        quantity: "",
        sellHall: "",
        sellDelivery: "",
        sellPackaging: "",
        optionDescriptionDefault: "",
        optionDescriptionDelivery: "",
        optionDescriptionTable: "",
        optionStepValues: "",
      })

      const optionExportCols = (opt: PosMenuOption, menu: (typeof filteredMenus)[0]) => {
        const optionCode = resolveOptionCode(opt, menu?.code)
        return {
          menuId: opt.menuId ?? "",
          menuCode: menu?.code ?? "",
          menuName: menu?.name ?? "",
          optionId: opt.id ?? "",
          optionCode,
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
          optionDescriptionDefault: opt.descriptionDefault ?? "",
          optionDescriptionDelivery: opt.descriptionDelivery ?? "",
          optionDescriptionTable: opt.descriptionTable ?? "",
          optionStepValues: opt.optionStepValues ? JSON.stringify(opt.optionStepValues) : "",
        }
      }

      const allOptions = await getPosMenuOptions({ fresh: true }).catch(() => [])
      const optionsByMenu = new Map<string, PosMenuOption[]>()
      for (const opt of allOptions) {
        if (opt.menuId == null || opt.menuId === "" || !filteredMenuIdSet.has(opt.menuId)) continue
        const arr = optionsByMenu.get(opt.menuId) ?? []
        arr.push(opt)
        optionsByMenu.set(opt.menuId, arr)
      }
      for (const [, list] of optionsByMenu) {
        list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      }

      const unifiedRows: Record<string, string | number>[] = []
      for (const m of filteredMenus) {
        const opts = optionsByMenu.get(m.id) ?? []
        const base = menuCols(m)
        if (opts.length === 0) {
          unifiedRows.push({ [rowKindCol]: rowKindMenu, ...base, ...emptyOptionCols() })
          continue
        }
        for (const opt of opts) {
          unifiedRows.push({
            [rowKindCol]: rowKindOption,
            ...base,
            ...optionExportCols(opt, m),
          })
        }
      }

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unifiedRows), sheetUnified)
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
      const rowKindCol = t("posMenuExportRowKind") || "행 구분"
      const rowKindMenu = t("posMenuExportRowMenu") || "메뉴"
      const rowKindOption = t("posMenuExportRowOption") || "옵션"
      const sheetUnified = (t("posMenuExportSheetUnified") || "메뉴+옵션(통합)").slice(0, 31)

      const detailedMenuCols = (m: (typeof menus)[0]) => ({
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
      })

      const emptyOptionColsDetailed = () => ({
        menuId: "",
        menuCode: "",
        menuName: "",
        optionId: "",
        optionCode: "",
        optionName: "",
        sortOrder: "",
        priceModifierHall: "",
        priceModifierDelivery: "",
        priceModifierPackaging: "",
        optionType: "",
        itemCode: "",
        additiveSourceMenuId: "",
        quantity: "",
        sellHall: "",
        sellDelivery: "",
        sellPackaging: "",
        optionDescriptionDefault: "",
        optionDescriptionDelivery: "",
        optionDescriptionTable: "",
        optionStepValues: "",
      })

      const optionExportColsDetailed = (opt: PosMenuOption, menu: (typeof menus)[0]) => {
        const optionCode = resolveOptionCode(opt, menu?.code)
        return {
          menuId: opt.menuId ?? "",
          menuCode: menu?.code ?? "",
          menuName: menu?.name ?? "",
          optionId: opt.id ?? "",
          optionCode,
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
          optionDescriptionDefault: opt.descriptionDefault ?? "",
          optionDescriptionDelivery: opt.descriptionDelivery ?? "",
          optionDescriptionTable: opt.descriptionTable ?? "",
          optionStepValues: opt.optionStepValues ? JSON.stringify(opt.optionStepValues) : "",
        }
      }

      const allOptions = await getPosMenuOptions({ fresh: true }).catch(() => [])
      const sortedMenuIds = new Set(sortedMenus.map((m) => m.id))
      const optionsByMenu = new Map<string, PosMenuOption[]>()
      for (const opt of allOptions) {
        if (opt.menuId == null || opt.menuId === "" || !sortedMenuIds.has(opt.menuId)) continue
        const arr = optionsByMenu.get(opt.menuId) ?? []
        arr.push(opt)
        optionsByMenu.set(opt.menuId, arr)
      }
      for (const [, list] of optionsByMenu) {
        list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      }

      const unifiedRows: Record<string, string | number>[] = []
      for (const m of sortedMenus) {
        const opts = optionsByMenu.get(m.id) ?? []
        const base = detailedMenuCols(m)
        if (opts.length === 0) {
          unifiedRows.push({ [rowKindCol]: rowKindMenu, ...base, ...emptyOptionColsDetailed() })
          continue
        }
        for (const opt of opts) {
          unifiedRows.push({
            [rowKindCol]: rowKindOption,
            ...base,
            ...optionExportColsDetailed(opt, m),
          })
        }
      }

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unifiedRows), sheetUnified)
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
        const res = await uploadPosMenuImage({ file: toSend, menuId })
        if (res?.success && res?.url) {
          const menuCode = String(menu.code ?? "").trim()
          const sameCodeMenus =
            menuCode.length > 0
              ? menus.filter((m) => String(m.code ?? "").trim() === menuCode)
              : [menu]
          for (const target of sameCodeMenus) {
            upsertDeliveryMenuPolicy(String(target.id), { imageUrl: res.url })
          }
          // DeliveryOps 오버라이드 이미지와 별개로 POS 대표 메뉴 이미지(pos_menus.image)도 동기화한다.
          // 그래야 POS 터미널/주문 화면의 프로모 타일 썸네일에 즉시 반영된다.
          try {
            const syncRes = await savePosMenu({
              id: menuId,
              imageUrl: res.url,
              imageOnly: true,
            })
            if (!syncRes?.success) {
              await appAlert(
                translateApiMessage(
                  String(syncRes?.message || "save_failed"),
                  t
                )
              )
            }
          } catch (syncErr) {
            await appAlert(translateApiMessage(String(syncErr ?? "save_failed"), t))
          }
          const scopedStore = String(deliveryOpsStoreCode || "").trim()
          if (scopedStore) {
            try {
              const syncCrossRes = await syncPosMenuImageCrossChannels({
                storeCode: scopedStore,
                menuId,
                menuCode,
                imageUrl: res.url,
                source: "delivery-ops",
              })
              if (!syncCrossRes?.success) {
                await appAlert(
                  translateApiMessage(
                    String(syncCrossRes?.message || "save_failed"),
                    t
                  )
                )
              }
            } catch (syncCrossErr) {
              await appAlert(translateApiMessage(String(syncCrossErr ?? "save_failed"), t))
            }
          }
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
    [t, upsertDeliveryMenuPolicy, menus, deliveryOpsStoreCode]
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

        <Dialog
          open={optionsConfigBulkMenuPickerOpen}
          onOpenChange={(open) => {
            setOptionsConfigBulkMenuPickerOpen(open)
            if (open) {
              setOptionsConfigBulkMenuPickerSearch("")
              setOptionsConfigBulkMenuPickerChecked({})
            }
          }}
        >
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden gap-3 p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="text-base">{t("posOptionBulkMenuPickerTitle") || "메뉴에서 값으로 넣기"}</DialogTitle>
              <DialogDescription className="text-xs">{t("posOptionBulkMenuPickerHint")}</DialogDescription>
            </DialogHeader>
            <Input
              className="h-9 text-sm"
              placeholder={t("posOptionBulkMenuPickerSearchPh") || "코드·메뉴명 검색"}
              value={optionsConfigBulkMenuPickerSearch}
              onChange={(e) => setOptionsConfigBulkMenuPickerSearch(e.target.value)}
              autoFocus
            />
            <div className="max-h-[min(52vh,28rem)] overflow-y-auto rounded-md border">
              {optionsConfigBulkMenuPickerList.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">{t("posOptionBulkMenuPickerEmpty")}</p>
              ) : (
                <ul className="divide-y">
                  {optionsConfigBulkMenuPickerList.map((m) => {
                    const line = formatPosMenuBulkPickLabel(m)
                    const checked = !!optionsConfigBulkMenuPickerChecked[String(m.id)]
                    return (
                      <li key={m.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/40">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) =>
                            setOptionsConfigBulkMenuPickerChecked((prev) => ({
                              ...prev,
                              [String(m.id)]: c === true,
                            }))
                          }
                          aria-label={line}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm" title={line}>
                          {m.code ? (
                            <>
                              <span className="font-mono text-xs text-muted-foreground">{m.code}</span>
                              <span className="text-muted-foreground"> — </span>
                            </>
                          ) : null}
                          <span>{m.name}</span>
                        </span>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className={`${ADMIN_BTN_XS_CN} shrink-0 text-[11px]`}
                          onClick={() => appendOptionsConfigBulkLabels([line])}
                        >
                          {t("posOptionBulkMenuPickerRowAdd")}
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="outline" size="sm" onClick={() => setOptionsConfigBulkMenuPickerOpen(false)}>
                {t("btn_close")}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={optionsConfigBulkMenuPickerSelectedCount === 0}
                onClick={() => {
                  const ids = Object.entries(optionsConfigBulkMenuPickerChecked)
                    .filter(([, v]) => v)
                    .map(([k]) => k)
                  const labels = ids
                    .map((id) => menus.find((mm) => String(mm.id) === id))
                    .filter((x): x is PosMenu => !!x)
                    .map(formatPosMenuBulkPickLabel)
                  appendOptionsConfigBulkLabels(labels)
                  setOptionsConfigBulkMenuPickerChecked({})
                }}
              >
                {(t("posOptionBulkMenuPickerAddSelected") || "선택한 메뉴를 입력란에 추가 ({n})").replace(
                  "{n}",
                  String(optionsConfigBulkMenuPickerSelectedCount)
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
                    {renderMenuStoreScopePicker("posMenuVisibleStoresScopeHint", "scope-edit")}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold">{t("posMenuPriceHall")}</label>
                        <Input type="number" placeholder="0" className="mt-1 h-10 text-right" value={formData.price} onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))} disabled={!!editingMenuLinkedPromoId} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold">{t("posMenuPriceDelivery")}</label>
                        <Input type="number" placeholder={t("posMenuSameAsHallPlaceholder")} className="mt-1 h-10 text-right" value={formData.priceDelivery} onChange={(e) => setFormData((p) => ({ ...p, priceDelivery: e.target.value }))} disabled={!!editingMenuLinkedPromoId} />
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
                      <label className="flex items-center gap-2 text-xs" title={t("posMenuBanbanHint") || "POS에서 다른 치킨(S Boneless) 2개를 골라 한 상으로 주문. 원가는 각 0.5씩."}>
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
                              try {
                                sessionStorage.setItem(
                                  POS_MENUS_EDIT_RESUME_KEY,
                                  JSON.stringify({
                                    editingId,
                                    selectedStoreCodes,
                                  })
                                )
                              } catch {
                                /* ignore */
                              }
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
                            <p className="text-[10px] text-muted-foreground w-full">예: size=M, part=Boneless</p>
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
                          <Input type="number" placeholder={t("posMenuSameAsHallPlaceholder")} className="h-8 w-20 text-right text-xs" value={newOptionModifierDelivery} onChange={(e) => setNewOptionModifierDelivery(e.target.value)} />
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
                            <SelectItem value="base">{isChickenMenu(formData.code) ? (t("posIngredientScopeBaseChicken") || "기본 (S Boneless)") : (t("posIngredientScopeBase") || "기본 (옵션 없음)")}</SelectItem>
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
                  {renderMenuStoreScopePicker("posMenuVisibleStoresRequiredToSave", "scope-new")}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold">{t("posMenuPriceHall")}</label>
                      <Input type="number" placeholder="0" className="mt-1 h-10 text-right" value={formData.price} onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold">{t("posMenuPriceDelivery")}</label>
                      <Input type="number" placeholder={t("posMenuSameAsHallPlaceholder")} className="mt-1 h-10 text-right" value={formData.priceDelivery} onChange={(e) => setFormData((p) => ({ ...p, priceDelivery: e.target.value }))} />
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
                      const isEditingRow = editingId === m.id
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
                                <td className="px-5 py-2 min-w-[140px] pl-8 text-xs text-muted-foreground">{t("posIngredientScopeBaseChicken") || "기본 (S Boneless)"}</td>
                                <td colSpan={4} className="px-5 py-2 text-xs text-muted-foreground">{t("posChickenBaseOnlyHint") || "메뉴 기본가에 해당. M Boneless / Wing / Drumette는 옵션 구성에서 추가."}</td>
                              </tr>
                            )
                          }
                          return null
                        }
                        return toShow.map((opt) => {
                          const optCode = resolveOptionCode(opt, m.code)
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
                        data-menu-row-id={m.id}
                        className={cn(
                          "border-b cursor-pointer transition-colors",
                          isEditingRow
                            ? "bg-primary/20 hover:bg-primary/25 border-l-4 border-l-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.2)]"
                            : "hover:bg-muted/20",
                          !isEditingRow && idx % 2 === 1 && "bg-muted/5"
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
            <OptionsConfigShell
              menuListPanel={
                <div className="rounded-xl border bg-card overflow-hidden">
                  <div className="border-b px-4 py-3 bg-muted/20 flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold">{t("posMenuList")}</h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {t("posMenuOptionsConfigSelectMenuHint")}
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
                  title={t("posOptionStepNavigatorTitle")}
                  emptyLabel={t("posOptionStepListEmptyHint")}
                  requiredLabel={t("posOptionRequiredOne") || "필수 1개 선택"}
                  optionalLabel={t("posOptionOptionalZeroOne") || "선택 0~1개"}
                  groups={optionsConfigGroupPanelItems}
                  selectedGroupKey={optionsConfigEffectiveGroupKey || optionsConfigGroupPanelItems[0]?.key || ""}
                  onSelectGroup={setOptionsConfigSelectedGroupKey}
                  stepListReadOnly={false}
                  onToggleGroupAudience={handleToggleGroupAudienceForConfig}
                  moveUpLabel={t("move_up") || "위로"}
                  moveDownLabel={t("move_down") || "아래로"}
                  isMoveUpDisabled={isOptionStepMoveUpDisabled}
                  isMoveDownDisabled={isOptionStepMoveDownDisabled}
                  onMoveGroup={handleMoveOptionGroup}
                  onRemoveGroup={handleRemoveOptionGroup}
                  removeGroupLabel={t("posOptionStepRemoveGroup")}
                  removeGroupDisabled={
                    !!optionsConfigSelectedMenu?.promoId?.trim() ||
                    (optionsConfigSelectedMenu
                      ? isChickenMenu(optionsConfigSelectedMenu.code) && optionsConfigPanelStepGroups.length <= 1
                      : false)
                  }
                  hallLabel={t("posOptionSellHall") || "홀"}
                  deliveryLabel={t("posOptionSellDelivery") || "배달"}
                />
              }
              editorPanel={
                <OptionGroupEditorPanel
                  menuName={optionsConfigSelectedMenu?.name}
                  menuCode={optionsConfigSelectedMenu?.code}
                  contextLabel={
                    optionsConfigSelectedGroupLabel
                      ? (t("posOptionGroupContextTitle") || "현재 선택 그룹: {group}").replace(
                          "{group}",
                          optionsConfigSelectedGroupLabel
                        )
                      : undefined
                  }
                  titleFallback={t("posMenuOptions") || "옵션"}
                  emptyMessage={t("posMenuOptionsConfigNoSelect")}
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
                    <p className="text-[11px] text-muted-foreground">
                      {t("posOptionSaveIncludesStepsHint") ||
                        "상단 [저장]은 옵션 항목·가격·판매 채널과 함께 왼쪽 단계의 채널(홀/배달) 설정도 DB에 반영합니다. 단계 순서·추가만 바꾼 경우 [단계 저장]을 눌러 주세요."}
                    </p>
                    <div className="rounded border border-dashed border-border/70 bg-muted/15 p-3 space-y-2">
                      <p className="text-xs font-semibold">{t("posOptionAddStepTitle") || "선택 단계 추가"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {t("posOptionAddStepHint") ||
                          "영문 키(예: sauce, spicy). 치킨(c 코드)은 부위(part) 단계가 항상 포함됩니다. 추가 후 [단계 저장]으로 서버에 반영하세요."}
                      </p>
                      <div className="flex flex-wrap items-end gap-2">
                        <Input
                          className="h-8 min-w-[200px] max-w-sm flex-1 text-xs"
                          placeholder={t("posOptionAddStepPlaceholder") || "새 단계 키 (예: sauce)"}
                          value={optionsConfigNewGroupKeyInput}
                          onChange={(e) => setOptionsConfigNewGroupKeyInput(e.target.value)}
                          disabled={!optionsConfigSelectedMenuId || !!optionsConfigSelectedMenu?.promoId?.trim()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              void handleAppendOptionStepKey()
                            }
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 text-xs"
                          disabled={!optionsConfigSelectedMenuId || !!optionsConfigSelectedMenu?.promoId?.trim()}
                          onClick={() => void handleAppendOptionStepKey()}
                        >
                          {t("posOptionAddStepButton") || "단계 추가"}
                        </Button>
                      </div>
                    </div>
                    <div className="rounded border bg-muted/10 p-3 space-y-4">
                      <div>
                        <p className="text-xs font-semibold">
                          {t("posOptionImportCardTitle") || "옵션 가져오기 · 공통 그룹 연결"}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {t("posOptionImportCardHint") ||
                            "다른 메뉴에서 옵션 단계와 항목을 복사하거나, 저장된 공통 옵션그룹을 현재 메뉴에 연결합니다."}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <p className="text-[11px] font-medium text-muted-foreground">
                          {t("posOptionImportFromMenuLabel") || "다른 메뉴에서 복사"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {t("posOptionCopyFromMenuHint") ||
                            "원본 메뉴의 옵션 단계/옵션 항목을 가져옵니다. option_code는 우선 유지하고 충돌 시 자동 재매핑됩니다."}
                        </p>
                        <div className="flex flex-wrap items-end gap-2">
                          <Select
                            value={optionsConfigCopySourceMenuId || "__none__"}
                            onValueChange={(v) => setOptionsConfigCopySourceMenuId(v === "__none__" ? "" : v)}
                            disabled={!optionsConfigSelectedMenuId || optionsConfigCopying}
                          >
                            <SelectTrigger className="h-8 min-w-[240px] text-xs">
                              <SelectValue placeholder={t("posOptionCopySourceSelect") || "원본 메뉴 선택"} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">{t("posOptionCopySourceSelect") || "원본 메뉴 선택"}</SelectItem>
                              {optionsConfigCopySourceMenus.map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                  {m.code} - {m.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => void handleImportOptionsFromExistingMenu()}
                            disabled={!optionsConfigCopySourceMenuId || optionsConfigCopying || !optionsConfigSelectedMenuId}
                          >
                            {optionsConfigCopying
                              ? t("loading") || "로딩 중..."
                              : t("posOptionCopyImportButton") || "옵션 가져오기"}
                          </Button>
                        </div>
                      </div>

                      <div className="border-t border-border/60 pt-3 space-y-2">
                        <p className="text-[11px] font-medium text-muted-foreground">
                          {t("posOptionTemplateLibraryTitle") || "공통 옵션 목록"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {t("posOptionImportLibraryHint") ||
                            "목록에서 공통 옵션그룹을 고른 뒤 [이 그룹 사용]으로 연결합니다. 이미 연결된 그룹은 다시 넣을 수 없습니다."}
                        </p>
                        <div className="flex flex-wrap gap-2 items-end">
                          <div className="min-w-[160px] flex-1">
                            <label className="text-[11px] text-muted-foreground block mb-0.5">
                              {t("itemsSearchPh") || "검색"}
                            </label>
                            <Input
                              className="h-8 text-xs"
                              placeholder={t("posOptionTemplateSearchPlaceholder") || ""}
                              value={optionsConfigLibrarySearchTerm}
                              onChange={(e) => setOptionsConfigLibrarySearchTerm(e.target.value)}
                              disabled={!optionsConfigSelectedMenuId}
                            />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(
                            [
                              ["all", t("noticeFilterAll") || "전체"],
                              ["recent", t("posOptionTemplateFilterRecent") || "최근"],
                              ["frequent", t("posOptionTemplateFilterFrequent") || "자주"],
                              ["deliveryOnly", t("posOptionTemplateFilterDeliveryOnly") || "배달 전용"],
                            ] as const
                          ).map(([key, lab]) => (
                            <Button
                              key={key}
                              type="button"
                              variant={optionsConfigLibraryFilter === key ? "default" : "outline"}
                              size="sm"
                              className={`${ADMIN_BTN_XS_CN} text-[11px]`}
                              disabled={!optionsConfigSelectedMenuId}
                              onClick={() => setOptionsConfigLibraryFilter(key)}
                            >
                              {lab}
                            </Button>
                          ))}
                        </div>
                        <div className="max-h-[320px] overflow-y-auto rounded border bg-background p-2 space-y-2">
                          {optionsConfigLibraryLoading ? (
                            <p className="py-6 text-center text-xs text-muted-foreground">
                              {t("loading") || "로딩 중..."}
                            </p>
                          ) : optionsConfigLibraryItems.length === 0 ? (
                            <p className="py-6 text-center text-xs text-muted-foreground">
                              {t("posOptionTemplateListEmpty") || "목록이 비어 있습니다."}
                            </p>
                          ) : (
                            optionsConfigLibraryItems.map((row) => (
                              <div
                                key={row.id}
                                className="flex flex-col gap-2 rounded-md border border-border/50 bg-muted/20 px-2.5 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
                              >
                                <div className="min-w-0 flex-1 space-y-1">
                                  <p className="text-xs font-mono font-semibold leading-snug break-all text-foreground">
                                    {row.groupCode}
                                  </p>
                                  <p className="text-[11px] leading-snug break-words text-foreground/90">
                                    {row.groupTitle}
                                  </p>
                                  {row.groupKey ? (
                                    <p className="text-[10px] text-muted-foreground font-mono">
                                      {(t("posOptionTemplateStepKeyLabel") || "단계 key").replace("{key}", row.groupKey)}
                                    </p>
                                  ) : null}
                                  {row.itemLines.length > 0 ? (
                                    <ul className="mt-1 max-h-[140px] list-disc space-y-0.5 overflow-y-auto pl-4 text-[11px] leading-snug text-muted-foreground marker:text-muted-foreground/80">
                                      {row.itemLines.map((line, i) => (
                                        <li key={`${row.id}-it-${i}`} className="break-words">
                                          {line}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="text-[11px] text-amber-800 dark:text-amber-200/90">
                                      {t("posOptionTemplateGroupNoItems")}
                                    </p>
                                  )}
                                  {row.footerNote ? (
                                    <p className="text-[10px] text-muted-foreground">{row.footerNote}</p>
                                  ) : null}
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={row.canUse ? "default" : "secondary"}
                                  className={cn(
                                    "h-auto min-h-8 shrink-0 cursor-pointer self-stretch px-3 py-2 text-[11px] font-semibold sm:self-start sm:min-w-[7.5rem]",
                                    row.canUse && "shadow-sm ring-1 ring-primary/25 hover:ring-primary/40"
                                  )}
                                  disabled={!optionsConfigSelectedMenuId || !row.canUse}
                                  title={
                                    !row.canUse
                                      ? (t("posOptionTemplateUseDisabledHint") ||
                                          "공통 그룹에 저장된 항목이 있을 때만 연결할 수 있습니다.")
                                      : undefined
                                  }
                                  onClick={() => void handleUseOptionTemplateFromLibrary(row.id)}
                                >
                                  {t("posOptionTemplateUseBtn") || "이 그룹 사용"}
                                </Button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded border p-3 bg-muted/20">
                      <p className="text-xs font-semibold">{t("posOptionRowAddBlockTitle")}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
                        {t("posOptionRowAddBlockHint")}
                      </p>
                      <div className="mt-3 space-y-2">
                        <div className="w-full">
                          <label className="text-xs font-medium block mb-0.5">
                            {t("posOptionTitle") || "선택지 줄 이름"}
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
                                  <SelectValue placeholder={t("posOptionSizeAbbrevPlaceholder")} />
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
                        ) : optionsConfigPanelStepGroups.length > 0 ? (
                          <div className="flex flex-wrap gap-2 items-end w-full">
                            {[...(optionsConfigPanelStepGroups || [])]
                              .sort((a, b) => {
                                if (a === optionsConfigEffectiveGroupKey) return -1
                                if (b === optionsConfigEffectiveGroupKey) return 1
                                return 0
                              })
                              .map((g) => {
                                const stepFieldLabel =
                                  optionsConfigGroupPanelItems.find((x) => x.key === g)?.label ?? g
                                return (
                              <div key={g}>
                                <label className="text-xs font-medium block mb-0.5">
                                  {stepFieldLabel}
                                  {g === optionsConfigEffectiveGroupKey ? (
                                    <span className="ml-1 text-[10px] text-primary">
                                      {t("posOptionSelectedGroupBadge") || "편집 중"}
                                    </span>
                                  ) : null}
                                </label>
                                <Input
                                  className="h-8 w-28 text-xs"
                                  placeholder={g}
                                  value={optionsConfigNewStepValues[g] ?? ""}
                                  onChange={(e) => setOptionsConfigNewStepValues((p) => ({ ...p, [g]: e.target.value }))}
                                />
                              </div>
                                )
                              })}
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
                          {optionsConfigEffectiveGroupKey && optionsConfigEffectiveGroupKey !== "__default__" ? (
                            <p className="mb-1.5 text-[10px] leading-snug text-muted-foreground">
                              {t("posOptionChannelScopeStepHint") ||
                                "선택 단계가 매장·포장/배달 중 어디에 보일지 정합니다. 변경 후 [단계 저장]을 눌러 주세요."}
                            </p>
                          ) : null}
                          <div className="flex flex-wrap items-end justify-between gap-2">
                            <div className="flex flex-wrap gap-1.5">
                              <Button
                                type="button"
                                variant={optionsConfigStepChannelScope === "all" ? "default" : "outline"}
                                size="sm"
                                className={`${ADMIN_BTN_XS_CN} text-[11px]`}
                                onClick={() => handleOptionsConfigStepChannelScope("all")}
                              >
                                {t("posOptionScopeAll") || "기본+배달"}
                              </Button>
                              <Button
                                type="button"
                                variant={optionsConfigStepChannelScope === "hall" ? "default" : "outline"}
                                size="sm"
                                className={`${ADMIN_BTN_XS_CN} text-[11px]`}
                                onClick={() => handleOptionsConfigStepChannelScope("hall")}
                              >
                                {t("posOptionScopeBaseOnly") || "기본채널만"}
                              </Button>
                              <Button
                                type="button"
                                variant={optionsConfigStepChannelScope === "delivery" ? "default" : "outline"}
                                size="sm"
                                className={`${ADMIN_BTN_XS_CN} text-[11px]`}
                                onClick={() => handleOptionsConfigStepChannelScope("delivery")}
                              >
                                {t("posOptionScopeDeliveryOnly") || "배달만"}
                              </Button>
                            </div>
                            {optionsConfigSelectedMenuId &&
                              optionsConfigPanelStepGroups.length > 0 &&
                              optionsConfigEffectiveGroupKey &&
                              optionsConfigEffectiveGroupKey !== "__default__" &&
                              (() => {
                                const groupKey = optionsConfigEffectiveGroupKey
                                const row =
                                  optionsConfigGroupRulesDraft.find((x) => x.key === groupKey) ||
                                  ({
                                    key: groupKey,
                                    label: groupKey,
                                    audience: "all",
                                    required: true,
                                    minSelect: 1,
                                    maxSelect: 1,
                                  } as PosOptionSelectionGroupConfig)
                                const minSel =
                                  row.minSelect != null && Number.isFinite(Number(row.minSelect))
                                    ? Math.max(0, Math.floor(Number(row.minSelect)))
                                    : row.required !== false
                                      ? 1
                                      : 0
                                const maxSel =
                                  row.maxSelect != null && Number.isFinite(Number(row.maxSelect))
                                    ? Math.max(1, Math.floor(Number(row.maxSelect)))
                                    : 1
                                const promoLocked = !!optionsConfigSelectedMenu?.promoId?.trim()
                                return (
                                  <div className="flex w-full min-w-0 flex-col gap-2">
                                    <div className="flex max-w-md items-start gap-2 rounded-md border border-border/50 bg-muted/15 px-2 py-1.5">
                                      <Checkbox
                                        id={`opt-req-${groupKey}`}
                                        checked={row.required !== false}
                                        disabled={promoLocked}
                                        onCheckedChange={(ck) => {
                                          const on = ck === true
                                          handleOptionGroupRuleFieldChange(groupKey, {
                                            required: on,
                                            minSelect: on ? Math.max(1, minSel || 1) : 0,
                                            maxSelect: on
                                              ? Math.max(maxSel, Math.max(1, minSel || 1))
                                              : Math.max(1, maxSel),
                                          })
                                        }}
                                      />
                                      <label
                                        htmlFor={`opt-req-${groupKey}`}
                                        className="cursor-pointer text-[11px] leading-snug"
                                      >
                                        <span className="font-medium">{t("posOptionRuleRequireForOrder")}</span>
                                        <span className="mt-0.5 block text-[10px] text-muted-foreground">
                                          {t("posOptionRuleRequireForOrderHint")}
                                        </span>
                                      </label>
                                    </div>
                                    <div className="flex flex-wrap items-end gap-2">
                                      <div>
                                        <label className="mb-0.5 block text-[11px] font-medium text-muted-foreground">
                                          {t("posOptionRuleMinSelect")}
                                        </label>
                                        <Input
                                          type="number"
                                          min={0}
                                          className="h-7 w-14 text-right text-xs"
                                          disabled={promoLocked}
                                          value={minSel}
                                          onChange={(e) => {
                                            const n = Math.max(0, Math.floor(Number(e.target.value)))
                                            handleOptionGroupRuleFieldChange(groupKey, {
                                              required: n > 0,
                                              minSelect: n,
                                              maxSelect: Math.max(maxSel, n > 0 ? n : 1),
                                            })
                                          }}
                                        />
                                      </div>
                                      <div>
                                        <label className="mb-0.5 block text-[11px] font-medium text-muted-foreground">
                                          {t("posOptionRuleMaxSelect")}
                                        </label>
                                        <Input
                                          type="number"
                                          min={1}
                                          className="h-7 w-14 text-right text-xs"
                                          disabled={promoLocked}
                                          value={maxSel}
                                          onChange={(e) => {
                                            const n = Math.max(1, Math.floor(Number(e.target.value)))
                                            handleOptionGroupRuleFieldChange(groupKey, {
                                              maxSelect: n,
                                              minSelect: Math.min(minSel, n),
                                            })
                                          }}
                                        />
                                      </div>
                                      <Button
                                        type="button"
                                        size="sm"
                                        className={`${ADMIN_BTN_XS_CN} text-[11px]`}
                                        onClick={() => void handleApplyOptionGroupsForConfig()}
                                        disabled={optionsConfigApplyingGroups || promoLocked}
                                      >
                                        {optionsConfigApplyingGroups
                                          ? (t("saving") || "저장 중...")
                                          : (t("posOptionConfigApplySteps") || "단계 저장")}
                                      </Button>
                                    </div>
                                  </div>
                                )
                              })()}
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
                              optionsConfigUseSizePartUi
                                ? !newOptionSize || !newOptionPart
                                : optionsConfigPanelStepGroups.length === 0 ||
                                  optionsConfigPanelStepGroups.some((g) => !(optionsConfigNewStepValues[g] ?? "").trim())
                            }
                            type="button"
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            {t("posOptionAddSingle") || "옵션 추가"}
                          </Button>
                          {!optionsConfigSelectedMenu || !isChickenMenu(optionsConfigSelectedMenu.code) ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8"
                              onClick={handleAddAllOptionsForConfig}
                              disabled={!optionsConfigSelectedMenu || !isSizePartGroups(optionsConfigPanelStepGroups)}
                              title={
                                !optionsConfigSelectedMenu || !isSizePartGroups(optionsConfigPanelStepGroups)
                                  ? (t("posOptionConfigAddAllSizePartOnly") || "size, part 단계일 때만 사용")
                                  : undefined
                              }
                            >
                              {t("posOptionAddAll")}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {optionsConfigSelectedMenu &&
                    !isChickenMenu(optionsConfigSelectedMenu.code) &&
                    optionsConfigPanelStepGroups.length === 0 ? (
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
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-xs font-semibold">
                          {t("posMenuOptions") || "옵션 목록"}{" "}
                          {optionsConfigEffectiveGroupKey && optionsConfigEffectiveGroupKey !== "__default__"
                            ? `(${optionsConfigOptionListBracketLabel})`
                            : ""}
                        </h4>
                        <Button
                          type="button"
                          variant={optionsConfigShowAllOptions ? "default" : "outline"}
                          size="sm"
                          className={`${ADMIN_BTN_XS_CN} text-[11px]`}
                          onClick={() => setOptionsConfigShowAllOptions((prev) => !prev)}
                        >
                          {optionsConfigShowAllOptions
                            ? t("posOptionShowSelectedGroupOnly") || "선택 그룹만 보기"
                            : t("posOptionShowAll") || "전체 보기"}
                        </Button>
                      </div>
                      {!optionsConfigShowAllOptions &&
                      optionsConfigEffectiveGroupKey &&
                      optionsConfigEffectiveGroupKey !== "__default__" &&
                      optionsConfigOptionsOutsideSelectedGroupCount > 0 ? (
                        <p className="mb-2 text-[11px] text-muted-foreground">
                          {(t("posOptionGroupHiddenCountHint") || "선택 그룹과 무관한 {n}개 옵션은 숨김 상태입니다.")
                            .replace("{n}", String(optionsConfigOptionsOutsideSelectedGroupCount))}
                        </p>
                      ) : null}
                      <div className="mb-2 rounded border bg-muted/10 p-2">
                        <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                          {(t("posOptionBulkAddTitle") || "선택 그룹에 값 일괄 추가")} ({optionsConfigEffectiveGroupKey || "-"})
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
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 shrink-0 gap-1 text-xs"
                            disabled={!optionsConfigSelectedMenuId}
                            onClick={() => {
                              setOptionsConfigBulkMenuPickerSearch("")
                              setOptionsConfigBulkMenuPickerChecked({})
                              setOptionsConfigBulkMenuPickerOpen(true)
                            }}
                          >
                            <Search className="h-3.5 w-3.5" aria-hidden />
                            {t("posOptionBulkMenuSearchBtn") || "메뉴 검색·선택"}
                          </Button>
                          <Button type="button" size="sm" className="h-8 text-xs" onClick={() => void handleBulkAddValuesForSelectedGroup()}>
                            {t("posOptionBulkAddBtn") || "값 일괄 추가"}
                          </Button>
                        </div>
                      </div>
                      <div className="max-h-[520px] overflow-y-auto space-y-2 pr-1">
                        {(() => {
                          const optionsToShowRaw =
                            optionsConfigSelectedMenu && isChickenMenu(optionsConfigSelectedMenu.code)
                              ? optionsConfigOptionsInSelectedGroup.filter((o) => !isChickenDefaultOption(o.name))
                              : optionsConfigOptionsInSelectedGroup
                          const optionsToShowSource = optionsConfigShowAllOptions
                            ? optionsConfigSelectedMenu && isChickenMenu(optionsConfigSelectedMenu.code)
                              ? optionsConfigMenuOptions.filter((o) => !isChickenDefaultOption(o.name))
                              : optionsConfigMenuOptions
                            : optionsToShowRaw
                          const optionsToShow = [...optionsToShowSource].sort((a, b) => {
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
                                  : t("posOptionListFilteredEmpty")}
                              </p>
                            )
                          }
                          const chickenSizeStepGrouped =
                            optionsConfigSelectedMenu &&
                            isChickenMenu(optionsConfigSelectedMenu.code) &&
                            isSizePartGroups(optionsConfigPanelStepGroups) &&
                            optionsConfigEffectiveGroupKey === "size" &&
                            !optionsConfigShowAllOptions

                          const chickenPartStepGrouped =
                            optionsConfigSelectedMenu &&
                            isChickenMenu(optionsConfigSelectedMenu.code) &&
                            isSizePartGroups(optionsConfigPanelStepGroups) &&
                            optionsConfigEffectiveGroupKey === "part" &&
                            !optionsConfigShowAllOptions

                          const renderOptionCard = (o: PosMenuOption) => (
                            <OptionItemRowCard
                              key={o.id}
                              option={o}
                              displayCode={resolveOptionCode(o, optionsConfigSelectedMenu?.code)}
                              displayName={optionPartLabel(o.name)}
                              editableName={!!optionsConfigSelectedMenu}
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
                          )

                          if (chickenSizeStepGrouped) {
                            const sections = groupChickenMenuOptionsBySizeValue(optionsToShow)
                            if (sections.length === 0) {
                              return <div className="space-y-2">{optionsToShow.map((o) => renderOptionCard(o))}</div>
                            }
                            return (
                              <div className="space-y-4">
                                <p className="text-[11px] leading-snug text-muted-foreground">
                                  {t("posOptionChickenSizeStepAdminHint")}
                                </p>
                                <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-dashed border-border/60 bg-muted/25 px-2 py-1.5">
                                  <span className="text-[10px] font-medium text-muted-foreground">
                                    {t("posOptionChickenRegisteredSizes")}
                                  </span>
                                  {sections.map(({ sizeValue }) => (
                                    <span
                                      key={sizeValue}
                                      className="rounded-full border border-primary/35 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary"
                                    >
                                      {sizeValue}
                                    </span>
                                  ))}
                                </div>
                                <p className="text-[10px] leading-snug text-muted-foreground">
                                  사이즈 단계는 S/M/L만 선택합니다. 가격·채널 조합 편집은 [부위] 단계에서 진행해 주세요.
                                </p>
                                {sections.map(({ sizeValue, items }) => (
                                  <div key={sizeValue} className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2 border-b border-border/70 pb-1.5">
                                      <span className="text-[11px] font-semibold text-primary">
                                        {t("posOptionGroupSize")}
                                      </span>
                                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums">
                                        {sizeValue}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground">
                                        {(t("posOptionChickenSizeStepComboCount") || "{n}개 조합").replace(
                                          "{n}",
                                          String(items.length)
                                        )}
                                      </span>
                                    </div>
                                    <p className="px-0.5 text-[10px] leading-snug text-muted-foreground">
                                      {(t("posOptionChickenSizeSectionSub") || "").replace("{size}", sizeValue)}
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {Array.from(
                                        new Set(
                                          items
                                            .map((o) => inferChickenOptionPartValue(o))
                                            .filter((x) => String(x).trim())
                                            .map((x) => optionPartLabel(String(x)))
                                        )
                                      ).map((part) => (
                                        <span
                                          key={`${sizeValue}-${part}`}
                                          className="rounded-md border border-border/80 bg-background px-2 py-0.5 text-[11px] text-foreground/90"
                                        >
                                          {part}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )
                          }

                          if (chickenPartStepGrouped) {
                            const sections = groupChickenMenuOptionsByPartValue(optionsToShow)
                            if (sections.length === 0) {
                              return <div className="space-y-2">{optionsToShow.map((o) => renderOptionCard(o))}</div>
                            }
                            return (
                              <div className="space-y-4">
                                <p className="text-[11px] leading-snug text-muted-foreground">
                                  {t("posOptionChickenPartStepAdminHint")}
                                </p>
                                {sections.map(({ partValue, items }) => (
                                  <div key={partValue} className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2 border-b border-border/70 pb-1.5">
                                      <span className="text-[11px] font-semibold text-primary">
                                        {t("posOptionGroupPart")}
                                      </span>
                                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold">
                                        {optionPartLabel(partValue)}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground">
                                        {(t("posOptionChickenSizeStepComboCount") || "{n}개 조합").replace(
                                          "{n}",
                                          String(items.length)
                                        )}
                                      </span>
                                    </div>
                                    <div className="space-y-2">{items.map((o) => renderOptionCard(o))}</div>
                                  </div>
                                ))}
                              </div>
                            )
                          }

                          return optionsToShow.map((o) => renderOptionCard(o))
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
                                  className={`${ADMIN_BTN_XS_CN} text-[11px]`}
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
                                  className={`${ADMIN_BTN_XS_CN} text-[11px]`}
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
