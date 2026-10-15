"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { UtensilsCrossed, FilePlus, Save, RotateCcw, Plus, LayoutGrid, Layers, Monitor, FolderTree, History, Calculator, ClipboardList, Truck } from "lucide-react"
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
  Dialog,
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
  getGrabPromoCampaigns,
  cancelGrabPromoCampaign,
  type GrabErpPromoForCampaignLookup,
  type GrabPromoCampaign,
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
  deletePosOptionGroupItem,
  savePosMenuIngredient,
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
import { getAutoBanbanFlavorMenuList } from "@/lib/pos-banban-utils"
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
import { PosMenuCategorySettingsDialog } from "@/components/erp/pos-menu-category-settings-dialog"
import { PosSetMenuTabWorkspace } from "@/components/erp/pos-set-menu-tab-workspace"
import { PosSetMenuInquiryTab } from "@/components/erp/pos-set-menu-inquiry-tab"
import { AdminTableSkeleton } from "@/components/erp/admin-table-skeleton"
import { PosStoreFinalPriceSettings } from "@/components/erp/pos-store-final-price-settings"
import { PriceHistoryTab } from "@/components/erp/price-history-tab"
import { PriceScheduleTab } from "@/components/erp/price-schedule-tab"
import { OptionsConfigShell } from "@/components/erp/options-config-shell"
import { OptionGroupListPanel } from "@/components/erp/option-group-list-panel"
import { OptionGroupEditorPanel } from "@/components/erp/option-group-editor-panel"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole } from "@/lib/permissions"
import {
  resolveConfiguredCategoriesForMain,
} from "@/lib/pos-menu-categories"
import {
  GRAB_MENU_MODIFIER_NAME_MAX_LENGTH,
  composeGrabModifierName,
  maxGrabModifierDescriptionChars,
} from "@/lib/grab-menu-limits"
import { resolvePosOptionGroupCode } from "@/lib/pos-option-group-code"
import {
  PROMOTION_MAIN_CATEGORY,
  normalizePromotionCategoryMain,
  normalizePromotionSubcategory,
  promotionSubcategoriesEqual,
  orderPosMainCategoryTabs,
  uniqueSubcategoriesForMainMenu,
} from "@/lib/pos-promo-constants"
import { translatePosMenuCategoryLabel } from "@/lib/pos-menu-category-label"
import { translatePosMenuLineForReceipt, chickenPartDedupeKey, prettyChickenPartLibraryLabel } from "@/lib/pos-print-translate"
import { sortByCode } from "@/lib/sort-utils"
import {
  buildPosMenuExportRows,
  posMenuExportDetailedMenuCols,
  posMenuExportMenuCols,
} from "./pos-menus-excel-rows"
import { isPosMenuSoldOut } from "@/lib/pos-menu-sold-out"
import { isStrictBonelessBbqChickenCode } from "@/lib/pos-bbq-option-guard"
import {
  inferOptionSelectionGroupsFromOptions,
  normalizeOptionGroupsForMenu,
  syncOptionSelectionConfigToGroupKeys,
} from "@/lib/pos-option-selection-groups"
import { resolvePosMenuImageUrlPayloadForSave } from "@/lib/pos-menu-image-storage-path"
import {
  isPosMenuStoreScopeCompatibilityModeForBrand,
  menuHasPersistedStoreScope,
  normalizeMenuScopeStoreCodes,
  resolveEffectiveMenuScopeStoreCodes,
  shouldPersistPosMenuStoreScopeOnSave,
} from "@/lib/pos-menu-store-scope"
import { deleteErpCacheByPrefix } from "@/lib/offline/cache"
import { useAppBrandConfig } from "@/components/app-brand-provider"
import {
  POS_MENUS_EDIT_RESUME_KEY,
  menuScopeStoreCodes,
  storeScopeCodesEqual,
  supportsPosMenuAutoCode,
  OPTION_SIZE_VALUES,
  OPTION_PART_VALUES,
  formatChickenOptionStepDisplayLabel,
  hasCustomGroupLabel,
  applyChickenDeliveryRulesToConfig,
  isChickenMenu,
  parseOptionGroupsFromText,
  isSizePartGroups,
  optionStepOrderAfterSwap,
  inferChickenOptionPartValue,
  shouldInferChickenPartFromName,
  optionStepValueForGroupFilter,
  optionMatchesGroupFilter,
  normalizeOptionSelectionConfig,
  buildOptionCode,
  resolveOptionCode,
  emptyForm,
  isPersistedPosMenuOptionId,
  isDraftPosMenuOptionId,
  optionConfigHasResettableState,
  optionConfigResetTargetGroups,
  optionRowUsesLinkedGroupItem,
  fingerprintDeletedOption,
  filterOptionsExcludingDeleted,
  optionMatchesDeleteFingerprint,
  type OptionDeleteFingerprint,
  pickLinkedOptionGroupItemToDelete,
  type PackagingChecklistDraftRow,
} from './pos-menus-page-helpers'
import { PosMenusBulkMenuPickerDialogContent } from "@/components/erp/pos-menus-bulk-menu-picker-dialog"
import { PosMenuEditInfoTab } from "@/components/erp/pos-menus-edit-info-tab"
import { PosMenuEditOptionsTab } from "@/components/erp/pos-menus-edit-options-tab"
import { PosMenuEditCostTab } from "@/components/erp/pos-menus-edit-cost-tab"
import { PosMenuEditDescriptionTab } from "@/components/erp/pos-menus-edit-description-tab"
import { PosMenuEditPackagingTab } from "@/components/erp/pos-menus-edit-packaging-tab"
import { PosMenuNewForm } from "@/components/erp/pos-menus-new-form"
import { PosMenuListTable } from "@/components/erp/pos-menus-list-table"
import { PosMenuOptionsMenuListPanel } from "@/components/erp/pos-menus-options-menu-list-panel"
import { PosMenuOptionsAddStepSection } from "@/components/erp/pos-menus-options-add-step"
import { PosMenuOptionsImportSection } from "@/components/erp/pos-menus-options-import"
import { PosMenuOptionsRowAddSection } from "@/components/erp/pos-menus-options-row-add"
import { PosMenuOptionsListSection } from "@/components/erp/pos-menus-options-list"
import { PosDeliveryOpsToolbar } from "@/components/erp/pos-menus-delivery-ops-toolbar"
import { PosDeliveryOpsSettings } from "@/components/erp/pos-menus-delivery-ops-settings"
import { PosDeliveryOpsMenuPolicies } from "@/components/erp/pos-menus-delivery-ops-menus"
import { PosGrabCampaignsPanel } from "@/components/erp/pos-menus-grab-campaigns"

export default function PosMenusPage() {
  const { auth } = useAuth()
  const brand = useAppBrandConfig()
  const storeScopeCompatMode = isPosMenuStoreScopeCompatibilityModeForBrand(brand.key)
  /** Omni: 빈 스코프 = POS 미노출 → 저장 시 매장 스코프를 반드시 보냄 */
  const storeScopeStrictPersist = !storeScopeCompatMode
  const { posStores: stores, storeLabels, formatStoreLabel } = useStoreList()
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
  const [menuImportProgress, setMenuImportProgress] = React.useState<{ done: number; total: number } | null>(null)
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
  const bangkokTodayStr = React.useMemo(
    () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }),
    []
  )
  const menusById = React.useMemo(() => {
    const map = new Map<string, PosMenu>()
    for (const menu of menus) {
      const id = String(menu.id || "").trim()
      if (id) map.set(id, menu)
    }
    return map
  }, [menus])
  const banbanFlavorDraftMenu = React.useMemo<PosMenu>(() => ({
    id: editingId || "__draft_banban__",
    code: formData.code,
    name: formData.name || "Banban Chicken",
    categoryMain: formData.categoryMain,
    category: formData.category,
    price: Number(formData.price || 0),
    priceDelivery: formData.priceDelivery.trim() === "" ? null : Number(formData.priceDelivery),
    imageUrl: formData.imageUrl,
    descriptionDefault: formData.descriptionDefault,
    descriptionDelivery: formData.descriptionDelivery || null,
    descriptionTable: formData.descriptionTable || null,
    vatIncluded: formData.vatIncluded,
    isActive: formData.isActive,
    sortOrder: 0,
    isBanban: true,
    banbanFlavorMenuIds: formData.banbanFlavorMenuIds,
    sellHall: formData.sellHall,
    sellDelivery: formData.sellDelivery,
    sellPackaging: formData.sellPackaging,
    sellMember: formData.sellMember,
  }), [editingId, formData])
  const banbanFlavorAutoMenus = React.useMemo(() => {
    if (!formData.isBanban) return []
    return getAutoBanbanFlavorMenuList(menus, banbanFlavorDraftMenu, {
      todayStr: bangkokTodayStr,
      includeSoldOut: true,
    })
  }, [bangkokTodayStr, banbanFlavorDraftMenu, formData.isBanban, menus])
  const banbanSelectedMenuIdSet = React.useMemo(
    () => new Set(formData.banbanFlavorMenuIds.map((id) => String(id || "").trim()).filter(Boolean)),
    [formData.banbanFlavorMenuIds]
  )
  const banbanFlavorSelectableMenus = React.useMemo(() => {
    if (!formData.isBanban) return [] as PosMenu[]
    const out: PosMenu[] = []
    const seen = new Set<string>()
    const selfId = String(banbanFlavorDraftMenu.id || "").trim()
    const push = (menu: PosMenu | undefined) => {
      if (!menu) return
      const id = String(menu.id || "").trim()
      if (!id || id === selfId || seen.has(id)) return
      seen.add(id)
      out.push(menu)
    }
    banbanFlavorAutoMenus.forEach(push)
    formData.banbanFlavorMenuIds.forEach((id) => push(menusById.get(String(id || "").trim())))
    return out
  }, [banbanFlavorAutoMenus, banbanFlavorDraftMenu.id, formData.banbanFlavorMenuIds, formData.isBanban, menusById])
  React.useEffect(() => {
    const tab = String(searchParams.get("tab") || "").trim()
    if (tab === "optionsConfig") setMainTab("optionsConfig")
    else if (tab === "deliveryOps") setMainTab("deliveryOps")
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
  // Omni(엄격): 미저장 스코프는 “전 매장 체크”로 위장하지 않고, 로그인/기본 매장을 제안한다.
  const getEditorScopeStoreCodes = React.useCallback(
    (menu?: PosMenu | null): string[] => {
      const persisted = menu ? menuScopeStoreCodes(menu) : []
      const effective = resolveEffectiveMenuScopeStoreCodes(
        persisted,
        availableScopeStores,
        storeScopeCompatMode
      )
      if (effective.length > 0) return effective
      if (menu && !menuHasPersistedStoreScope(persisted) && storeScopeStrictPersist) {
        return defaultScopeStoreCodes
      }
      return effective
    },
    [availableScopeStores, defaultScopeStoreCodes, storeScopeCompatMode, storeScopeStrictPersist]
  )
  const editingMenuForScope = editingId ? menus.find((m) => m.id === editingId) : null
  const showStoreScopeUnscopedHint =
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
      {showStoreScopeUnscopedHint && (
        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
          {storeScopeStrictPersist
            ? t("posMenuVisibleStoresUnscopedStrictHint") ||
              "매장 지정이 DB에 없어 POS에 표시되지 않습니다. 매장을 선택한 뒤 저장하세요."
            : t("posMenuVisibleStoresCompatHint")}
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
  const optionsConfigDeletedRef = React.useRef<OptionDeleteFingerprint[]>([])
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
  /** 드롭다운 선택값 — [조회] 전까지 화면 데이터(deliveryOpsStoreCode)와 분리 */
  const [deliveryOpsStoreDraft, setDeliveryOpsStoreDraft] = React.useState("")
  const [deliveryOpsAppCode, setDeliveryOpsAppCode] = React.useState<DeliveryAppCode>("grab")
  const [deliveryOpsLoading, setDeliveryOpsLoading] = React.useState(false)
  const [deliveryOpsSaving, setDeliveryOpsSaving] = React.useState(false)
  const [deliveryOpsImageUploadingMenuId, setDeliveryOpsImageUploadingMenuId] = React.useState<string | null>(null)
  const [deliveryOpsCopySourceStore, setDeliveryOpsCopySourceStore] = React.useState("")
  const [deliveryOpsCopying, setDeliveryOpsCopying] = React.useState(false)
  const [deliveryOpsApplyingAll, setDeliveryOpsApplyingAll] = React.useState(false)
  const [grabCampaignsLoading, setGrabCampaignsLoading] = React.useState(false)
  const [grabCampaignsRows, setGrabCampaignsRows] = React.useState<GrabPromoCampaign[] | null>(null)
  const [grabCampaignsMeta, setGrabCampaignsMeta] = React.useState<{
    merchantIDs: string[]
    hint: string
    campaignsSuppressed?: boolean
    consumerListPriceMode?: string
    erpGrabPromos: GrabErpPromoForCampaignLookup[]
  } | null>(null)
  const [grabCampaignCopiedId, setGrabCampaignCopiedId] = React.useState<string | null>(null)
  const [grabCampaignCancellingId, setGrabCampaignCancellingId] = React.useState<string | null>(null)

  const resolveNewOptionChannelPayload = React.useCallback(() => {
    const hall = Number(newOptionModifier) || 0
    const deliveryInput = newOptionModifierDelivery !== "" ? Number(newOptionModifierDelivery) : null
    if (newOptionChannelScope === "hall") {
      return {
        sellHall: true,
        sellDelivery: false,
        sellPackaging: true,
        sellMember: true,
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
        sellMember: false,
        priceModifier: hall,
        priceModifierDelivery: deliveryInput ?? hall,
        priceModifierPackaging: null as number | null,
      }
    }
    return {
      sellHall: true,
      sellDelivery: true,
      sellPackaging: true,
      sellMember: true,
      priceModifier: hall,
      priceModifierDelivery: deliveryInput,
      priceModifierPackaging: null as number | null,
    }
  }, [newOptionChannelScope, newOptionModifier, newOptionModifierDelivery])
  const [deliveryOpsSearch, setDeliveryOpsSearch] = React.useState("")
  const [deliveryOpsBulkSellStart, setDeliveryOpsBulkSellStart] = React.useState("")
  const [deliveryOpsBulkSellEnd, setDeliveryOpsBulkSellEnd] = React.useState("")
  const [deliveryOpsAppPolicy, setDeliveryOpsAppPolicy] = React.useState<PosDeliveryAppPolicy>({
    storeCode: "",
    appCode: "grab",
    enabled: true,
    orderAcceptanceMode: "manual",
    autoAcceptEnabled: false,
    settlementFeePct: null,
    packCompleteMarksGrabReady: true,
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
      setDeliveryOpsStoreDraft(stores[0])
    } else if (!canSearchAllStores && auth?.store) {
      setDeliveryOpsStoreCode(auth.store)
      setDeliveryOpsStoreDraft(auth.store)
    }
  }, [canSearchAllStores, stores, auth?.store, deliveryOpsStoreCode])

  React.useEffect(() => {
    setDeliveryOpsStoreDraft(deliveryOpsStoreCode)
  }, [deliveryOpsStoreCode])

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
      const storeForSoldOut =
        !canSearchAllStores && auth?.store
          ? String(auth.store).trim()
          : String(effectivePricingStore || "").trim() || undefined
      const [list, catRes, config] = await Promise.all([
        getPosMenus({ fresh: true, storeCode: storeForSoldOut || undefined }),
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
  }, [t, canSearchAllStores, auth?.store, effectivePricingStore])

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
      setMenuImportProgress(null)
      try {
        const storeCodesForImport =
          selectedStoreCodes.length > 0
            ? selectedStoreCodes
            : defaultScopeStoreCodes
        if (storeCodesForImport.length === 0) {
          await appAlert(
            t("posMenuImportNeedStores") ||
              t("posMenuVisibleStoresRequiredNewMenu") ||
              "신규 메뉴는 노출 매장을 1개 이상 선택해야 합니다."
          )
          return
        }
        const { parsePosMenuImportWorkbook } = await import("@/lib/pos-menu-import-xlsx")
        const menus = await parsePosMenuImportWorkbook(file)
        if (menus.length === 0) {
          await appAlert(
            t("posMenuImportNoValidRows") ||
              "업로드할 유효한 행이 없습니다. 첫 행은 양식과 동일한 영문 헤더(code, name, …)인지 확인해 주세요."
          )
          return
        }
        const confirmMsg = (
          t("posMenuImportConfirm") ||
          "총 {count}행을 반영합니다. 노출 매장: {stores}. 동일 메뉴 코드는 덮어씁니다. 프로모션 연동 메뉴는 건너뜁니다. 계속할까요?"
        )
          .replace("{count}", String(menus.length))
          .replace("{stores}", storeCodesForImport.join(", "))
        const ok = await appConfirm(confirmMsg)
        if (!ok) return
        const r = await importPosMenus(menus, {
          storeCodes: storeCodesForImport,
          onProgress: setMenuImportProgress,
        })
        await refreshPosMenusCatalogCache()
        await loadMenusAndCategories()
        const summary = (
          t("posMenuImportSummary") ||
          "신규 {inserted}건, 갱신 {updated}건, 건너뜀·실패 {skipped}건"
        )
          .replace("{inserted}", String(r.inserted ?? 0))
          .replace("{updated}", String(r.updated ?? 0))
          .replace("{skipped}", String(r.skipped ?? 0))
        const rowErrors = (r.errorDetails?.length ? r.errorDetails : null)
          ? r.errorDetails!.slice(0, 20).map((ed) => {
              const detail = translateApiMessage(ed.message, t) || ed.message
              if (ed.code) {
                return (
                  t("posMenuImportRowErrorWithCode") ||
                  "{line}행 ({code}): {detail}"
                )
                  .replace("{line}", String(ed.line))
                  .replace("{code}", ed.code)
                  .replace("{detail}", detail)
              }
              return (t("posMenuImportRowError") || "{line}행: {detail}")
                .replace("{line}", String(ed.line))
                .replace("{detail}", detail)
            })
          : (r.errors || []).slice(0, 20).map((line) => translateApiMessage(line, t) || line)
        const detailLines = [
          summary,
          ...(rowErrors.length ? ["", ...rowErrors] : []),
          r.errorsTruncated
            ? `\n${t("posMenuImportErrorsTruncated") || "… (오류 일부만 표시)"}`
            : "",
        ].join("\n")
        const title = r.success
          ? t("posMenuImportDone") || "일괄 반영이 완료되었습니다."
          : t("posMenuImportPartial") || "일부 행만 반영되었거나 모두 건너뛰었습니다."
        await appAlert(`${title}\n\n${detailLines}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await appAlert(translateApiMessage(msg, t) || msg)
      } finally {
        setMenuImportBusy(false)
        setMenuImportProgress(null)
      }
    },
    [t, loadMenusAndCategories, selectedStoreCodes, defaultScopeStoreCodes]
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

  const selectedOptionForDesc = React.useMemo(
    () => menuOptions.find((o) => o.id === selectedOptionDescId),
    [menuOptions, selectedOptionDescId]
  )
  const grabModifierDescMaxLen = React.useMemo(
    () => maxGrabModifierDescriptionChars(selectedOptionForDesc?.name ?? ""),
    [selectedOptionForDesc?.name]
  )
  const grabModifierEffectiveDesc =
    optionDescDeliveryDraft.trim() || optionDescDefaultDraft.trim()
  const grabModifierPreview = React.useMemo(
    () =>
      selectedOptionForDesc
        ? composeGrabModifierName(selectedOptionForDesc.name, grabModifierEffectiveDesc)
        : "",
    [selectedOptionForDesc, grabModifierEffectiveDesc]
  )
  const grabModifierDescTooLong =
    !!grabModifierEffectiveDesc && grabModifierEffectiveDesc.length > grabModifierDescMaxLen
  const grabModifierNameTooLong =
    composeGrabModifierName(selectedOptionForDesc?.name ?? "", "").length >=
    GRAB_MENU_MODIFIER_NAME_MAX_LENGTH

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
    const next = filterOptionsExcludingDeleted(Array.isArray(raw) ? raw : [], optionsConfigDeletedRef.current)
    setOptionsConfigMenuOptions(next)
    setOptionsConfigOriginalOptions(next)
  }, [])

  React.useEffect(() => {
    optionsConfigDeletedRef.current = []
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
    if (supportsPosMenuAutoCode(filter)) {
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
          buffetIncludable: m.buffetIncludable ?? false,
          banbanFlavorMenuIds: m.banbanFlavorMenuIds ?? [],
          sellHall: m.sellHall !== false,
          sellDelivery: m.sellDelivery !== false,
          sellPackaging: m.sellPackaging !== false,
          sellMember: m.sellMember !== false,
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

  const isPromoLinkedMenuEdit = React.useMemo(() => {
    if (!editingId) return false
    const menu = menus.find((x) => x.id === editingId)
    if (!menu) return false
    if (menu.promoId?.trim()) return true
    return normalizePromotionCategoryMain(menu.categoryMain ?? "") === PROMOTION_MAIN_CATEGORY
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
    let code = formData.code.trim()
    const name = formData.name.trim()
    /** 자동 코드 대분류인데 아직 code가 비어 있으면(비동기 실패·오프라인 등) 저장 직전에 한 번 더 발급 시도 */
    const mainTrim = formData.categoryMain.trim()
    if (!editingId && !code && supportsPosMenuAutoCode(mainTrim)) {
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
    if (!formData.sellHall && !formData.sellDelivery && !formData.sellPackaging) {
      await appAlert(t("posSetTabChannelsRequired"))
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
    const shouldPersistStoreScope = shouldPersistPosMenuStoreScopeOnSave({
      isNewMenu: !editingId,
      storeScopeDirty,
      hasPersistedScope: menuHasPersistedStoreScope(persistedScope),
      strictPersist: storeScopeStrictPersist,
    })
    const scopeForSave = shouldPersistStoreScope
      ? normalizeMenuScopeStoreCodes(
          (() => {
            if (!editingMenu || storeScopeDirty) return selectedStoreCodes
            if (selectedStoreCodes.length > 0) return selectedStoreCodes
            return persistedScope.length > 0 ? persistedScope : selectedStoreCodes
          })()
        )
      : []
    if (shouldPersistStoreScope && scopeForSave.length === 0) {
      await appAlert(t("posMenuVisibleStoresPickAtLeastOne"))
      return
    }
    /** 프로모션 연동 메뉴: 설명·이미지·매장 노출은 이 화면에서 저장 (이름·가격 등은 프로모션 관리) */
    if (isPromoLinkedMenuEdit && editingId) {
      const imageSave = resolvePosMenuImageUrlPayloadForSave(formData.imageUrl.trim(), editingId, {
        isEdit: true,
        existingImageUrl: editingMenu?.imageUrl,
      })
      const promoSavePayload: Parameters<typeof savePosMenu>[0] = {
        id: editingId,
        descriptionOnly: true,
        descriptionDefault: formData.descriptionDefault.trim(),
        descriptionDelivery: formData.descriptionDelivery.trim() || null,
        descriptionTable: formData.descriptionTable.trim() || null,
      }
      if (imageSave.includeImageUrl) {
        promoSavePayload.imageUrl = imageSave.imageUrl
      }
      if (shouldPersistStoreScope) {
        promoSavePayload.storeCodes = scopeForSave
      }
      const promoRes = await savePosMenu(promoSavePayload)
      if (!promoRes.success) {
        await appAlert(translateApiMessage(promoRes.message, t) || t("msg_save_fail_detail"))
        return
      }
      setMenus((prev) =>
        prev.map((m) =>
          m.id === editingId
            ? {
                ...m,
                descriptionDefault: formData.descriptionDefault.trim(),
                descriptionDelivery: formData.descriptionDelivery.trim() || null,
                descriptionTable: formData.descriptionTable.trim() || null,
                ...(imageSave.includeImageUrl ? { imageUrl: imageSave.imageUrl } : {}),
                ...(shouldPersistStoreScope ? { storeCodes: scopeForSave } : {}),
              }
            : m
        )
      )
      if (shouldPersistStoreScope) {
        const scopeTargets = Array.from(new Set(scopeForSave.map((x) => String(x || "").trim()).filter(Boolean)))
        if (scopeTargets.length > 0) {
          await Promise.all(scopeTargets.map((sc) => refreshPosMenusCatalogCache({ storeCode: sc })))
        }
        setStoreScopeDirty(false)
      }
      if (!(await saveSelectedOptionDescriptionIfAny())) return
      if (imageSave.mismatchMessage) {
        await appAlert(
          `${t("posMenuSavedWithoutImageMismatch") || "메뉴 정보는 저장했습니다. 다만 사진 URL이 다른 메뉴용이라 사진은 그대로 두었습니다."}\n\n${imageSave.mismatchMessage}\n\n${t("posMenuImageUploadHint") || "이 메뉴에서 사진을 다시 업로드해 주세요."}`
        )
      } else {
        await appAlert(t("itemsAlertUpdated"))
      }
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
      buffetIncludable: formData.buffetIncludable,
      banbanFlavorMenuIds: formData.isBanban ? formData.banbanFlavorMenuIds : [],
      sellHall: formData.sellHall,
      sellDelivery: formData.sellDelivery,
      sellPackaging: formData.sellPackaging,
      sellMember: formData.sellMember,
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
      buffetIncludable: formData.buffetIncludable,
      banbanFlavorMenuIds: formData.isBanban ? formData.banbanFlavorMenuIds : [],
      storeCodes: scopeForSave,
      sellHall: formData.sellHall,
      sellDelivery: formData.sellDelivery,
      sellPackaging: formData.sellPackaging,
      sellMember: formData.sellMember,
    }
    if (editingId) {
      setMenus((prev) => prev.map((m) => (m.id === editingId ? { ...newMenu, id: editingId } : m)))
      if (!(await saveSelectedOptionDescriptionIfAny())) return
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
      buffetIncludable: menu.buffetIncludable ?? false,
      banbanFlavorMenuIds: menu.banbanFlavorMenuIds ?? [],
      sellHall: menu.sellHall !== false,
      sellDelivery: menu.sellDelivery !== false,
      sellPackaging: menu.sellPackaging !== false,
      sellMember: menu.sellMember !== false,
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
      sellMember: channelPayload.sellMember,
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

  /** 설명 탭 하단「저장」과 함께 호출 — 캐시 재조회 없이 로컬 상태만 갱신(즉시 사라짐 방지) */
  const saveSelectedOptionDescriptionIfAny = async (): Promise<boolean> => {
    if (!editingId || !selectedOptionDescId) return true
    const opt = menuOptions.find((o) => o.id === selectedOptionDescId)
    if (!opt) return true
    const descDefault = optionDescDefaultDraft.trim()
    const descDelivery = optionDescDeliveryDraft.trim() || null
    const descTable = optionDescTableDraft.trim() || null
    if (
      descDefault === (opt.descriptionDefault ?? "") &&
      (descDelivery ?? "") === (opt.descriptionDelivery ?? "") &&
      (descTable ?? "") === (opt.descriptionTable ?? "")
    ) {
      return true
    }
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
      descriptionDefault: descDefault,
      descriptionDelivery: descDelivery,
      descriptionTable: descTable,
    })
    if (!res.success) {
      await appAlert(translateApiMessage(res.message, t) || t("msg_save_fail"))
      return false
    }
    setMenuOptions((prev) =>
      prev.map((o) =>
        o.id === selectedOptionDescId
          ? {
              ...o,
              descriptionDefault: descDefault,
              descriptionDelivery: descDelivery,
              descriptionTable: descTable,
            }
          : o
      )
    )
    return true
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
      if (
        isChickenMenu(optionsConfigSelectedMenu?.code) &&
        isSizePartGroups(optionsConfigPanelStepGroups) &&
        !hasCustomGroupLabel(row as PosOptionSelectionGroupConfig, t)
      ) {
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
      sellMember: channelPayload.sellMember,
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
        sellMember: channelPayload.sellMember,
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
        sellMember: channelPayload.sellMember,
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
          sellPackaging: channelPayload.sellPackaging,
          sellMember: channelPayload.sellMember,
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
        sellPackaging: o.sellPackaging ?? true,
        priceModifierPackaging: null,
      }))
      const originalMap = new Map(optionsConfigOriginalOptions.map((o) => [String(o.id), o]))
      const changed = normalizedCurrentOptions.filter((o) => {
        const prev = originalMap.get(String(o.id))
        if (!prev) return true
        return !areOptionsEqualForSave(o, prev)
      })
      const persistableChanged = changed.filter(
        (o) => isPersistedPosMenuOptionId(o.id) || isDraftPosMenuOptionId(o.id)
      )
      if (persistableChanged.length === 0 && deletedNumericIds.length === 0) {
        await deleteErpCacheByPrefix("erp:posCatalog:options")
        const refreshed = await getPosMenuOptions({ menuId: optionsConfigSelectedMenuId, fresh: true })
        applyLoadedOptionsForConfig(Array.isArray(refreshed) ? refreshed : [])
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

      if (persistableChanged.length === 0) {
        await deleteErpCacheByPrefix("erp:posCatalog:options")
        const refreshed = await getPosMenuOptions({ menuId: optionsConfigSelectedMenuId, fresh: true })
        applyLoadedOptionsForConfig(Array.isArray(refreshed) ? refreshed : [])
        await appAlert(t("msg_save_success") || "저장되었습니다.")
        return
      }

      const res = await savePosMenuOptionsBulk({
        options: persistableChanged.map((o) => ({
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
      await deleteErpCacheByPrefix("erp:posCatalog:options")
      const refreshed = await getPosMenuOptions({ menuId: optionsConfigSelectedMenuId, fresh: true })
      applyLoadedOptionsForConfig(Array.isArray(refreshed) ? refreshed : [])
      await appAlert(t("msg_save_success") || "저장되었습니다.")
    } catch (e) {
      console.error("handleSaveOptionsForConfig:", e)
      await appAlert(e instanceof Error ? e.message : String(e))
    } finally {
      setOptionsConfigSaving(false)
    }
  }

  const handleDeleteOptionForConfig = async (opt: PosMenuOption) => {
    const name = String(opt.name ?? "").trim() || String(opt.id ?? "")
    if (
      !(await appConfirm(
        (t("posOptionDeleteConfirm") || '옵션 "{name}"을(를) 삭제할까요?').replace("{name}", name)
      ))
    ) {
      return
    }
    const id = String(opt.id ?? "")
    const selectedKey =
      optionsConfigEffectiveGroupKey && optionsConfigEffectiveGroupKey !== "__default__"
        ? optionsConfigEffectiveGroupKey
        : undefined
    const fp = fingerprintDeletedOption(opt)
    optionsConfigDeletedRef.current = [...optionsConfigDeletedRef.current, fp]

    const dropFromLocalLists = (ref?: { groupId: number; itemId: number }) => {
      const gone = (row: PosMenuOption) => {
        if (String(row.id) === id) return true
        if (ref && optionRowUsesLinkedGroupItem(row.id, ref)) return true
        return optionMatchesDeleteFingerprint(row, fp)
      }
      setOptionsConfigOriginalOptions((prev) => prev.filter((row) => !gone(row)))
      setOptionsConfigMenuOptions((prev) => prev.filter((row) => !gone(row)))
    }

    if (isDraftPosMenuOptionId(id)) {
      dropFromLocalLists()
      return
    }

    let groups = optionsConfigLibraryGroups
    const fetched = (await getPosOptionGroups()) as PosOptionGroup[]
    if (Array.isArray(fetched) && fetched.length > 0) {
      groups = fetched
      setOptionsConfigLibraryGroups(fetched)
    }
    let pick = pickLinkedOptionGroupItemToDelete(id, groups, selectedKey)
    if (!pick && selectedKey) {
      const group = groups.find((g) => String(g.key ?? "").trim().toLowerCase() === selectedKey.toLowerCase())
      const value = (fp.stepValues[selectedKey] || fp.name).trim()
      const item = (group?.items || []).find((it) => String(it.itemName ?? "").trim() === value)
      if (group && item) {
        pick = { groupId: Number(group.id), itemId: Number(item.id) }
      }
    }
    if (pick) {
      const delGroup = await deletePosOptionGroupItem({ id: String(pick.itemId) })
      if (!delGroup.success) {
        await appAlert(
          translateApiMessage(delGroup.message, t) || delGroup.message || t("msg_delete_fail_detail") || "삭제 실패"
        )
        optionsConfigDeletedRef.current = optionsConfigDeletedRef.current.filter((x) => x.id !== fp.id)
        return
      }
      setOptionsConfigLibraryGroups((prev) =>
        prev.map((g) =>
          Number(g.id) === pick!.groupId
            ? { ...g, items: (g.items || []).filter((it) => Number(it.id) !== pick!.itemId) }
            : g
        )
      )
    }

    const delMenu = await deletePosMenuOption({
      id: isPersistedPosMenuOptionId(id) ? id : undefined,
      menuId: optionsConfigSelectedMenuId ?? undefined,
      name: fp.name,
      optionStepValues: fp.stepValues,
    })
    if (!delMenu.success) {
      await appAlert(delMenu.message || t("msg_delete_fail_detail") || "삭제 실패")
      optionsConfigDeletedRef.current = optionsConfigDeletedRef.current.filter((x) => x.id !== fp.id)
      return
    }

    await deleteErpCacheByPrefix("erp:posCatalog:options")
    dropFromLocalLists(pick ?? undefined)
  }

  const handleResetOptionsForConfig = async () => {
    if (!optionsConfigSelectedMenuId || !optionsConfigSelectedMenu) return
    if (optionsConfigSelectedMenu.promoId?.trim()) {
      await appAlert(t("posMenuPromoLinkedEdit") || "프로모션과 연동된 메뉴는 마케팅 > 프로모션 관리에서 수정하세요.")
      return
    }
    if (
      !optionConfigHasResettableState(
        optionsConfigMenuOptions.length,
        optionsConfigPanelStepGroups,
        optionsConfigSelectedMenu.code
      )
    ) {
      return
    }
    if (!await appConfirm(t("posMenuOptionsConfigResetConfirm") || "선택한 메뉴의 모든 옵션을 삭제합니다. 계속하시겠습니까?")) return
    const menuIdNum = Number(optionsConfigSelectedMenuId)
    try {
      setOptionsConfigSaving(true)
      if (Number.isFinite(menuIdNum) && menuIdNum > 0) {
        const unlinkRes = await savePosMenuOptionGroupLinks({
          menuId: menuIdNum,
          links: [],
        })
        if (!unlinkRes.success) {
          await appAlert(translateApiMessage(unlinkRes.message, t) || unlinkRes.message || t("msg_save_fail_detail"))
          return
        }
      }
      for (const o of optionsConfigMenuOptions) {
        if (!isPersistedPosMenuOptionId(o.id)) continue
        const res = await deletePosMenuOption({ id: o.id })
        if (!res.success) {
          await appAlert(res.message)
          return
        }
      }
      const emptyGroups = optionConfigResetTargetGroups(optionsConfigSelectedMenu.code)
      const emptyConfig = applyChickenDeliveryRulesToConfig(
        emptyGroups,
        normalizeOptionSelectionConfig(emptyGroups, []),
        optionsConfigSelectedMenu.code,
        t
      )
      const menuRes = await savePosMenu({
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
        optionSelectionGroups: emptyGroups,
        optionSelectionConfig: emptyConfig,
        isBanban: optionsConfigSelectedMenu.isBanban ?? false,
      })
      if (!menuRes.success) {
        await appAlert(translateApiMessage(menuRes.message, t) || menuRes.message || t("msg_save_fail_detail"))
        return
      }
      setMenus((prev) =>
        prev.map((m) =>
          m.id === optionsConfigSelectedMenuId
            ? { ...m, optionSelectionGroups: emptyGroups, optionSelectionConfig: emptyConfig }
            : m
        )
      )
      setOptionsConfigGroupsDraft(emptyGroups.join(", "))
      setOptionsConfigGroupRulesDraft(emptyConfig)
      const refreshed = await getPosMenuOptions({ menuId: optionsConfigSelectedMenuId, fresh: true })
      applyLoadedOptionsForConfig(Array.isArray(refreshed) ? refreshed : [])
      await appAlert(t("posMenuOptionsConfigResetDone") || "초기화되었습니다.")
    } catch (e) {
      console.error("handleResetOptionsForConfig:", e)
      await appAlert(e instanceof Error ? e.message : String(e))
    } finally {
      setOptionsConfigSaving(false)
    }
  }

  const handleMarkUnused = async (menu: PosMenu) => {
    const nextActive = !menu.isActive
    if (menu.isActive) {
      if (!await appConfirm(`"${menu.name}" ${t("posMenuConfirmUnused")}`)) return
    }
    const res = await savePosMenu({ id: menu.id, isActive: nextActive })
    if (!res.success) {
      await appAlert(translateApiMessage(res.message, t) || t("msg_save_fail_detail"))
      return
    }
    setMenus((prev) => prev.map((m) => (m.id === menu.id ? { ...m, isActive: nextActive } : m)))
    if (editingId === menu.id) {
      setFormData((p) => ({ ...p, isActive: nextActive }))
    }
    await appAlert(nextActive ? t("posMenuUseAgainDone") : t("posMenuUnusedDone"))
  }

  const todayStr = bangkokTodayStr
  const handleSoldOutToggle = async (menu: PosMenu) => {
    const isSoldOut = isPosMenuSoldOut(menu.soldOutDate)
    setSoldOutTogglingId(menu.id)
    try {
      const res = await updatePosMenuSoldOut({
        id: menu.id,
        soldOut: !isSoldOut,
        storeCode: String(auth?.store || effectivePricingStore || "").trim() || null,
      })
      if (res.success) {
        const nextDate =
          res.soldOutDate != null
            ? String(res.soldOutDate).slice(0, 10)
            : !isSoldOut
              ? todayStr
              : null
        setMenus((prev) =>
          prev.map((m) =>
            m.id === menu.id
              ? { ...m, soldOutDate: nextDate }
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
      const isSoldOut = isPosMenuSoldOut(m.soldOutDate)
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
      const sheetUnified = (t("posMenuExportSheetUnified") || "메뉴+옵션(통합)").slice(0, 31)
      const allOptions = await getPosMenuOptions({ fresh: true }).catch(() => [])
      const unifiedRows = buildPosMenuExportRows(filteredMenus, allOptions, t, posMenuExportMenuCols)

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
      const { writeErpXlsxWorkbook } = await import("@/lib/erp-excel-export")
      await writeErpXlsxWorkbook(wb, `pos-menus-${bangkokDate}.xlsx`)
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
      const sheetUnified = (t("posMenuExportSheetUnified") || "메뉴+옵션(통합)").slice(0, 31)
      const allOptions = await getPosMenuOptions({ fresh: true }).catch(() => [])
      const unifiedRows = buildPosMenuExportRows(sortedMenus, allOptions, t, posMenuExportDetailedMenuCols)

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
      const { writeErpXlsxWorkbook } = await import("@/lib/erp-excel-export")
      await writeErpXlsxWorkbook(wb, `pos-menus-all-detailed-${bangkokDate}.xlsx`)
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
    const presetFromConfig = new Set(
      Object.values(categoriesConfig?.categoriesByMain || {})
        .flat()
        .filter((c): c is string => typeof c === "string")
    )
    const fromMenus = new Set(menus.map((m) => m.category).filter((c): c is string => typeof c === "string" && c !== ""))
    const fromDb = new Set(allCategories)
    return Array.from(new Set([...presetFromConfig, ...fromDb, ...fromMenus]))
      .filter((c): c is string => typeof c === "string")
      .sort()
  }, [menus, allCategories, categoriesConfig])

  const mainCategories = React.useMemo(() => {
    const preset = new Set(
      (categoriesConfig?.mainCategories || []).filter((c): c is string => typeof c === "string")
    )
    const fromMenus = new Set(menus.map((m) => m.categoryMain).filter((c): c is string => typeof c === "string" && c !== ""))
    const fromDb = new Set(allMainCategories)
    const names = Array.from(new Set([...preset, ...fromDb, ...fromMenus])).filter(
      (c): c is string => typeof c === "string"
    )
    const savedMains = categoriesConfig?.tabOrder?.mains
    if (savedMains && savedMains.length > 0) return orderPosMainCategoryTabs(names, savedMains)
    return names.sort()
  }, [menus, allMainCategories, categoriesConfig])

  const categoriesByMain = React.useMemo(() => {
    const main = formData.categoryMain?.trim() || null
    if (!main) return categories.filter((c): c is string => typeof c === "string")
    const preset = resolveConfiguredCategoriesForMain(main, categoriesConfig?.categoriesByMain)
    const fromMenus = menus
      .filter((m) => (m.categoryMain ?? "") === main)
      .map((m) => m.category)
      .filter((c): c is string => typeof c === "string" && c !== "")
    const raw = Array.from(new Set([...preset, ...fromMenus])).filter((c): c is string => typeof c === "string")
    return uniqueSubcategoriesForMainMenu(main, raw, categoriesConfig?.tabOrder?.subsByMain?.[main])
  }, [formData.categoryMain, menus, categories, categoriesConfig])

  /** 옵션 구성 탭: 대분류 선택 시 해당 대분류에 속한 소분류만 */
  const optionsConfigCategoriesByMain = React.useMemo(() => {
    const main = mainCategoryFilter === "all" ? null : mainCategoryFilter?.trim() || null
    if (!main) return categories.filter((c): c is string => typeof c === "string")
    const preset = resolveConfiguredCategoriesForMain(main, categoriesConfig?.categoriesByMain)
    const fromMenus = menus
      .filter((m) => (m.categoryMain ?? "") === main)
      .map((m) => m.category)
      .filter((c): c is string => typeof c === "string" && c !== "")
    const raw = Array.from(new Set([...preset, ...fromMenus])).filter((c): c is string => typeof c === "string")
    return uniqueSubcategoriesForMainMenu(main, raw, categoriesConfig?.tabOrder?.subsByMain?.[main])
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
        settlementFeePct:
          res.appPolicy?.settlementFeePct != null ? Number(res.appPolicy.settlementFeePct) : null,
        packCompleteMarksGrabReady: res.appPolicy?.packCompleteMarksGrabReady !== false,
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

  const handleQueryDeliveryOps = React.useCallback(() => {
    const next = String(deliveryOpsStoreDraft || "").trim()
    if (!next) return
    if (next !== String(deliveryOpsStoreCode || "").trim()) {
      setDeliveryOpsStoreCode(next)
      return
    }
    void loadDeliveryOpsPolicy()
  }, [deliveryOpsStoreDraft, deliveryOpsStoreCode, loadDeliveryOpsPolicy])

  const deliveryOpsStoreDraftPending =
    String(deliveryOpsStoreDraft || "").trim() !== String(deliveryOpsStoreCode || "").trim()

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

  const handleApplyBulkSellTimes = React.useCallback(async () => {
    const start = String(deliveryOpsBulkSellStart ?? "").trim() || null
    const end = String(deliveryOpsBulkSellEnd ?? "").trim() || null
    if ((start && !end) || (!start && end)) {
      await appAlert(
        t("posDeliveryOpsBulkSellBothRequired") || "판매 시작·종료 시간을 모두 입력하거나, 둘 다 비워 두세요(종일 판매)."
      )
      return
    }
    const q = deliveryOpsSearch.trim()
    const targets = q ? deliveryOpsVisibleMenus : menus
    if (!targets.length) {
      await appAlert(t("posDeliveryOpsBulkSellNoMenus") || "적용할 메뉴가 없습니다.")
      return
    }
    if (q) {
      const ok = await appConfirm(
        (t("posDeliveryOpsBulkSellFilteredConfirm") || "검색 결과 {{n}}개 메뉴에만 판매 시간을 적용할까요?").replace(
          "{{n}}",
          String(targets.length)
        )
      )
      if (!ok) return
    }
    for (const m of targets) {
      upsertDeliveryMenuPolicy(String(m.id), { sellStartTime: start, sellEndTime: end })
    }
    const msg = start && end
      ? (t("posDeliveryOpsBulkSellApplied") || "{{n}}개 메뉴에 {{start}}~{{end}} 적용했습니다. 저장 후 Grab에 반영됩니다.")
          .replace("{{n}}", String(targets.length))
          .replace("{{start}}", start)
          .replace("{{end}}", end)
      : (t("posDeliveryOpsBulkSellCleared") || "{{n}}개 메뉴 판매 시간을 비웠습니다(종일 판매). 저장 후 Grab에 반영됩니다.").replace(
          "{{n}}",
          String(targets.length)
        )
    await appAlert(msg)
  }, [
    deliveryOpsBulkSellStart,
    deliveryOpsBulkSellEnd,
    deliveryOpsSearch,
    deliveryOpsVisibleMenus,
    menus,
    upsertDeliveryMenuPolicy,
    t,
  ])

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
          autoAcceptEnabled: Boolean(deliveryOpsAppPolicy.autoAcceptEnabled),
          settlementFeePct: deliveryOpsAppPolicy.settlementFeePct,
          ...(deliveryOpsAppCode === "grab"
            ? { packCompleteMarksGrabReady: deliveryOpsAppPolicy.packCompleteMarksGrabReady !== false }
            : {}),
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
            autoAcceptEnabled: Boolean(deliveryOpsAppPolicy.autoAcceptEnabled),
            settlementFeePct: deliveryOpsAppPolicy.settlementFeePct,
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

  const handleLoadGrabCampaigns = React.useCallback(async () => {
    const storeCode = String(deliveryOpsStoreCode || "").trim()
    if (!storeCode) {
      await appAlert(t("posDeliveryOpsStoreRequired") || "매장을 먼저 선택해 주세요.")
      return
    }
    setGrabCampaignsLoading(true)
    try {
      const res = await getGrabPromoCampaigns({ storeCode })
      if (res?.success === false) {
        await appAlert(translateApiMessage(String(res.message ?? "load_failed"), t))
        return
      }
      const merchantIDs = res.resolvedMerchantIDs ?? []
      setGrabCampaignsRows(res.grabCampaigns ?? [])
      setGrabCampaignsMeta({
        merchantIDs,
        hint: String(res.hint ?? ""),
        campaignsSuppressed: res.campaignsSuppressed,
        consumerListPriceMode: res.consumerListPriceMode,
        erpGrabPromos: res.erpGrabPromos ?? [],
      })
      if (merchantIDs.length === 0 && (res.hint || (res as { hintTh?: string }).hintTh)) {
        const hintTh = String((res as { hintTh?: string }).hintTh ?? "")
        await appAlert(hintTh || res.hint || "")
      }
    } catch (e) {
      await appAlert(translateApiMessage(String(e ?? "load_failed"), t))
    } finally {
      setGrabCampaignsLoading(false)
    }
  }, [deliveryOpsStoreCode, t])

  const handleCopyGrabCampaignId = React.useCallback(async (id: string) => {
    const value = String(id || "").trim()
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setGrabCampaignCopiedId(value)
      window.setTimeout(() => setGrabCampaignCopiedId((prev) => (prev === value ? null : prev)), 1500)
    } catch {
      // clipboard 권한이 없으면 무시 — 사용자가 직접 선택·복사
    }
  }, [])

  const handleCancelGrabCampaign = React.useCallback(
    async (row: GrabPromoCampaign) => {
      const campaignId = String(row.id || "").trim()
      const merchantID = String(row.merchantID || "").trim()
      if (!campaignId || !merchantID) return
      const ok = await appConfirm(
        `${t("posGrabCampaignCancelConfirm") || "이 Grab 캠페인을 취소할까요?\n\n새 프로모가 안 바뀌면 예전 캠페인을 먼저 취소한 뒤 메뉴를 다시 보내야 합니다."}\n\n${row.name || campaignId}`
      )
      if (!ok) return
      setGrabCampaignCancellingId(`${merchantID}:${campaignId}`)
      try {
        const res = await cancelGrabPromoCampaign({ merchantID, campaignId })
        if (res?.success === false) {
          await appAlert(translateApiMessage(String(res.message ?? "cancel_failed"), t))
          return
        }
        await appAlert(
          t("posGrabCampaignCancelDone") || "캠페인을 취소했고, Grab 메뉴 업데이트를 보냈습니다."
        )
        await handleLoadGrabCampaigns()
      } catch (e) {
        await appAlert(translateApiMessage(String(e ?? "cancel_failed"), t))
      } finally {
        setGrabCampaignCancellingId(null)
      }
    },
    [handleLoadGrabCampaigns, t]
  )

  const buildGrabSupportReplyText = React.useCallback(() => {
    const mid = grabCampaignsMeta?.merchantIDs?.join(", ") || ""
    const promos = grabCampaignsMeta?.erpGrabPromos ?? []
    const promoLines = promos
      .slice(0, 12)
      .map(
        (p) =>
          `- ${p.campaignNameRef} | Grab menu item: ${p.grabMenuItemId} | ${p.name} | sale ฿${p.salePrice}${p.regularPrice > p.salePrice ? ` (was ฿${p.regularPrice})` : ""}`
      )
      .join("\n")
    if (grabCampaignsMeta?.campaignsSuppressed) {
      return (
        `สวัสดีครับ/ค่ะ\n\n` +
        `ร้าน merchantID: ${mid}\n` +
        `ขณะนี้เราส่งราคาโปรโมชันผ่าน Grab Menu API (ราคาเมนู item.price) ไม่ได้ใช้ Grab Partner Campaign API จึงไม่มี Campaign ID ในระบบ Grab ครับ/ค่ะ\n\n` +
        `โปรโมชันอ้างอิง (ERP):\n${promoLines || "(ไม่มีโปรโมชัน Grab ใน ERP)"}\n\n` +
        `หากทาง Grab ต้องการ Campaign ID จาก Partner Campaign โปรดแจ้งกลับ — เราจะเปิดโหมด Campaign sync ใหม่ครับ/ค่ะ`
      )
    }
    return (
      `สวัสดีครับ/ค่ะ\n\n` +
      `ร้าน merchantID: ${mid}\n` +
      `ขณะนี้ไม่มี Campaign ที่ active ใน Grab (CM-POS-PROMO 0 รายการ)\n\n` +
      `โปรโมชันใน ERP:\n${promoLines || "(ไม่มี)"}\n\n` +
      `กำลัง sync Campaign ใหม่ — ได้ Campaign ID แล้วจะส่งให้อีกครั้งครับ/ค่ะ`
    )
  }, [grabCampaignsMeta])

  React.useEffect(() => {
    setGrabCampaignsRows(null)
    setGrabCampaignsMeta(null)
  }, [deliveryOpsStoreCode, deliveryOpsAppCode])


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
          <PosMenusBulkMenuPickerDialogContent
            t={t}
            optionsConfigBulkMenuPickerSearch={optionsConfigBulkMenuPickerSearch}
            setOptionsConfigBulkMenuPickerSearch={setOptionsConfigBulkMenuPickerSearch}
            optionsConfigBulkMenuPickerList={optionsConfigBulkMenuPickerList}
            optionsConfigBulkMenuPickerChecked={optionsConfigBulkMenuPickerChecked}
            setOptionsConfigBulkMenuPickerChecked={setOptionsConfigBulkMenuPickerChecked}
            appendOptionsConfigBulkLabels={appendOptionsConfigBulkLabels}
            setOptionsConfigBulkMenuPickerOpen={setOptionsConfigBulkMenuPickerOpen}
            optionsConfigBulkMenuPickerSelectedCount={optionsConfigBulkMenuPickerSelectedCount}
            menus={menus}
          />
        </Dialog>

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
                  <Truck className={adminTabsIconCn} aria-hidden />
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
              {isPromoLinkedMenuEdit && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {t("posMenuPromoLinkedBanner") ||
                    "프로모션 연동 메뉴입니다. 이름·가격·분류·활성은 마케팅 > 프로모션 관리에서 수정하고, 설명은 이 화면 설명 탭에서 수정할 수 있습니다."}
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
                  <PosMenuEditInfoTab
                    t={t}
                    formData={formData}
                    setFormData={setFormData}
                    isPromoLinkedMenuEdit={isPromoLinkedMenuEdit}
                    categoryMainOpen={categoryMainOpen}
                    setCategoryMainOpen={setCategoryMainOpen}
                    mainCategories={mainCategories}
                    categoryOpen={categoryOpen}
                    setCategoryOpen={setCategoryOpen}
                    categoriesByMain={categoriesByMain}
                    renderMenuStoreScopePicker={renderMenuStoreScopePicker}
                    banbanFlavorAutoMenus={banbanFlavorAutoMenus}
                    banbanFlavorSelectableMenus={banbanFlavorSelectableMenus}
                    banbanSelectedMenuIdSet={banbanSelectedMenuIdSet}
                    menuOptions={menuOptions}
                    optionPartLabel={optionPartLabel}
                    setFormTab={setFormTab}
                    setMainTab={setMainTab}
                    setOptionsConfigSelectedMenuId={setOptionsConfigSelectedMenuId}
                    editingId={editingId}
                    baseMenuCost={baseMenuCost}
                    selectedStoreCodes={selectedStoreCodes}
                  />
                  <PosMenuEditOptionsTab
                    t={t}
                    formData={formData}
                    menuOptions={menuOptions}
                    optionPartLabel={optionPartLabel}
                    menus={menus}
                    newOptionName={newOptionName}
                    setNewOptionName={setNewOptionName}
                    handleAddOption={handleAddOption}
                    newOptionType={newOptionType}
                    setNewOptionType={setNewOptionType}
                    currentMenuGroups={currentMenuGroups}
                    newOptionStepValues={newOptionStepValues}
                    setNewOptionStepValues={setNewOptionStepValues}
                    newOptionSourceMenuId={newOptionSourceMenuId}
                    setNewOptionSourceMenuId={setNewOptionSourceMenuId}
                    additiveMenusForOptions={additiveMenusForOptions}
                    newOptionQuantity={newOptionQuantity}
                    setNewOptionQuantity={setNewOptionQuantity}
                    newOptionChannelScope={newOptionChannelScope}
                    setNewOptionChannelScope={setNewOptionChannelScope}
                    newOptionModifier={newOptionModifier}
                    setNewOptionModifier={setNewOptionModifier}
                    newOptionModifierDelivery={newOptionModifierDelivery}
                    setNewOptionModifierDelivery={setNewOptionModifierDelivery}
                  />
                  <PosMenuEditCostTab
                    formData={formData}
                    menuOptions={menuOptions}
                    t={t}
                    selectedIngredientOptionId={selectedIngredientOptionId}
                    setSelectedIngredientOptionId={setSelectedIngredientOptionId}
                    optionPartLabel={optionPartLabel}
                    menuIngredients={menuIngredients}
                    handleDeleteIngredient={handleDeleteIngredient}
                    newIngredientType={newIngredientType}
                    setNewIngredientType={setNewIngredientType}
                    newIngredientCode={newIngredientCode}
                    setNewIngredientCode={setNewIngredientCode}
                    items={items}
                    newIngredientQty={newIngredientQty}
                    setNewIngredientQty={setNewIngredientQty}
                    newIngredientLossRate={newIngredientLossRate}
                    setNewIngredientLossRate={setNewIngredientLossRate}
                    handleAddIngredient={handleAddIngredient}
                    menuCost={menuCost}
                    baseMenuCost={baseMenuCost}
                  />
                  <PosMenuEditDescriptionTab
                    t={t}
                    formData={formData}
                    setFormData={setFormData}
                    menuOptions={menuOptions}
                    selectedOptionDescId={selectedOptionDescId}
                    setSelectedOptionDescId={setSelectedOptionDescId}
                    optionPartLabel={optionPartLabel}
                    optionDescDefaultDraft={optionDescDefaultDraft}
                    setOptionDescDefaultDraft={setOptionDescDefaultDraft}
                    optionDescDeliveryDraft={optionDescDeliveryDraft}
                    grabModifierDescMaxLen={grabModifierDescMaxLen}
                    setOptionDescDeliveryDraft={setOptionDescDeliveryDraft}
                    selectedOptionForDesc={selectedOptionForDesc}
                    grabModifierDescTooLong={grabModifierDescTooLong}
                    grabModifierNameTooLong={grabModifierNameTooLong}
                    grabModifierPreview={grabModifierPreview}
                    optionDescTableDraft={optionDescTableDraft}
                    setOptionDescTableDraft={setOptionDescTableDraft}
                  />
                  <PosMenuEditPackagingTab
                    t={t}
                    setPackagingChecklistRows={setPackagingChecklistRows}
                    handleSavePackagingChecklist={handleSavePackagingChecklist}
                    packagingChecklistSaving={packagingChecklistSaving}
                    packagingChecklistLoading={packagingChecklistLoading}
                    packagingChecklistRows={packagingChecklistRows}
                    handlePackagingChecklistRowPatch={handlePackagingChecklistRowPatch}
                  />
                </Tabs>
                    <div className="flex gap-3 pt-2">
                      <Button className="flex-1" onClick={handleSave}><Save className="mr-2 h-4 w-4" />{t("itemsBtnSave")}</Button>
                      <Button variant="outline" onClick={handleReset}><RotateCcw className="mr-2 h-4 w-4" />{t("itemsBtnReset")}</Button>
                    </div>
                </>
              ) : (
                <PosMenuNewForm
                  t={t}
                  categoryMainOpen={categoryMainOpen}
                  setCategoryMainOpen={setCategoryMainOpen}
                  formData={formData}
                  setFormData={setFormData}
                  mainCategories={mainCategories}
                  categoryOpen={categoryOpen}
                  setCategoryOpen={setCategoryOpen}
                  categoriesByMain={categoriesByMain}
                  renderMenuStoreScopePicker={renderMenuStoreScopePicker}
                  handleSave={handleSave}
                  handleReset={handleReset}
                />
              )}
            </div>
          </div>
          </div>

          {/* Table */}
          {loading ? (
            <AdminTableSkeleton columns={7} rows={12} />
          ) : (
          <PosMenuListTable
            t={t}
            menuImportInputRef={menuImportInputRef}
            handlePosMenuImportFileChange={handlePosMenuImportFileChange}
            handleDownloadFilteredMenusExcel={handleDownloadFilteredMenusExcel}
            handleDownloadAllMenusDetailedExcel={handleDownloadAllMenusDetailedExcel}
            menuImportBusy={menuImportBusy}
            handleDownloadPosMenuTemplate={handleDownloadPosMenuTemplate}
            menuImportProgress={menuImportProgress}
            refreshLoading={refreshLoading}
            loadMenusAndCategories={loadMenusAndCategories}
            setRefreshLoading={setRefreshLoading}
            mainCategoryFilter={mainCategoryFilter}
            setMainCategoryFilter={setMainCategoryFilter}
            setCategoryFilter={setCategoryFilter}
            mainCategories={mainCategories}
            categoryFilter={categoryFilter}
            optionsConfigCategoriesByMain={optionsConfigCategoriesByMain}
            soldOutFilter={soldOutFilter}
            setSoldOutFilter={setSoldOutFilter}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            filteredMenus={filteredMenus}
            editingId={editingId}
            expandedMenuId={expandedMenuId}
            expandedMenuData={expandedMenuData}
            optionPartLabel={optionPartLabel}
            handleSoldOutToggleOption={handleSoldOutToggleOption}
            soldOutTogglingOptionId={soldOutTogglingOptionId}
            handleEditOptionInList={handleEditOptionInList}
            handleExpandMenu={handleExpandMenu}
            handleSoldOutToggle={handleSoldOutToggle}
            soldOutTogglingId={soldOutTogglingId}
            handleEdit={handleEdit}
            handleMarkUnused={handleMarkUnused}
          />
          )}
        </div>
          </TabsContent>
          <TabsContent value="optionsConfig" className={adminTabsContentCn}>
            <OptionsConfigShell
              menuListPanel={
                <PosMenuOptionsMenuListPanel
                  t={t}
                  optionsConfigListLoading={optionsConfigListLoading}
                  loadMenusAndCategories={loadMenusAndCategories}
                  setOptionsConfigListLoading={setOptionsConfigListLoading}
                  optionsConfigSelectedMenuId={optionsConfigSelectedMenuId}
                  applyLoadedOptionsForConfig={applyLoadedOptionsForConfig}
                  mainCategoryFilter={mainCategoryFilter}
                  setMainCategoryFilter={setMainCategoryFilter}
                  setOptionsConfigCategoryFilter={setOptionsConfigCategoryFilter}
                  mainCategories={mainCategories}
                  optionsConfigCategoryFilter={optionsConfigCategoryFilter}
                  optionsConfigCategoriesByMain={optionsConfigCategoriesByMain}
                  optionsConfigSearchTerm={optionsConfigSearchTerm}
                  setOptionsConfigSearchTerm={setOptionsConfigSearchTerm}
                  optionsConfigFilteredMenus={optionsConfigFilteredMenus}
                  optionsConfigMenuOptions={optionsConfigMenuOptions}
                  setOptionsConfigSelectedMenuId={setOptionsConfigSelectedMenuId}
                />
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
                  resetDisabled={
                    optionsConfigSaving ||
                    !!optionsConfigSelectedMenu?.promoId?.trim() ||
                    !optionConfigHasResettableState(
                      optionsConfigMenuOptions.length,
                      optionsConfigPanelStepGroups,
                      optionsConfigSelectedMenu?.code
                    )
                  }
                >
                  <div className="space-y-4">
                    <p className="text-[11px] text-muted-foreground">
                      {t("posOptionResetHint") || "기존 옵션을 지우고 새로 적용하려면 먼저 [초기화]를 누른 뒤 옵션을 추가하세요."}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {t("posOptionSaveIncludesStepsHint") ||
                        "상단 [저장]은 옵션 항목·가격·판매 채널과 함께 왼쪽 단계의 채널(홀/배달) 설정도 DB에 반영합니다. 단계 순서·추가만 바꾼 경우 [단계 저장]을 눌러 주세요."}
                    </p>
                    <PosMenuOptionsAddStepSection
                      t={t}
                      optionsConfigNewGroupKeyInput={optionsConfigNewGroupKeyInput}
                      setOptionsConfigNewGroupKeyInput={setOptionsConfigNewGroupKeyInput}
                      optionsConfigSelectedMenuId={optionsConfigSelectedMenuId}
                      optionsConfigSelectedMenu={optionsConfigSelectedMenu}
                      handleAppendOptionStepKey={handleAppendOptionStepKey}
                    />
                    <PosMenuOptionsImportSection
                      t={t}
                      optionsConfigCopySourceMenuId={optionsConfigCopySourceMenuId}
                      setOptionsConfigCopySourceMenuId={setOptionsConfigCopySourceMenuId}
                      optionsConfigSelectedMenuId={optionsConfigSelectedMenuId}
                      optionsConfigCopying={optionsConfigCopying}
                      optionsConfigCopySourceMenus={optionsConfigCopySourceMenus}
                      handleImportOptionsFromExistingMenu={handleImportOptionsFromExistingMenu}
                      optionsConfigLibrarySearchTerm={optionsConfigLibrarySearchTerm}
                      setOptionsConfigLibrarySearchTerm={setOptionsConfigLibrarySearchTerm}
                      optionsConfigLibraryFilter={optionsConfigLibraryFilter}
                      setOptionsConfigLibraryFilter={setOptionsConfigLibraryFilter}
                      optionsConfigLibraryLoading={optionsConfigLibraryLoading}
                      optionsConfigLibraryItems={optionsConfigLibraryItems}
                      handleUseOptionTemplateFromLibrary={handleUseOptionTemplateFromLibrary}
                    />

                    <PosMenuOptionsRowAddSection
                      t={t}
                      optionsConfigNewOptionTitle={optionsConfigNewOptionTitle}
                      setOptionsConfigNewOptionTitle={setOptionsConfigNewOptionTitle}
                      optionsConfigUseSizePartUi={optionsConfigUseSizePartUi}
                      newOptionSize={newOptionSize}
                      setNewOptionSize={setNewOptionSize}
                      newOptionPart={newOptionPart}
                      setNewOptionPart={setNewOptionPart}
                      optionsConfigPanelStepGroups={optionsConfigPanelStepGroups}
                      optionsConfigEffectiveGroupKey={optionsConfigEffectiveGroupKey}
                      optionsConfigGroupPanelItems={optionsConfigGroupPanelItems}
                      optionsConfigNewStepValues={optionsConfigNewStepValues}
                      setOptionsConfigNewStepValues={setOptionsConfigNewStepValues}
                      optionsConfigStepChannelScope={optionsConfigStepChannelScope}
                      handleOptionsConfigStepChannelScope={handleOptionsConfigStepChannelScope}
                      optionsConfigSelectedMenuId={optionsConfigSelectedMenuId}
                      optionsConfigGroupRulesDraft={optionsConfigGroupRulesDraft}
                      optionsConfigSelectedMenu={optionsConfigSelectedMenu}
                      handleOptionGroupRuleFieldChange={handleOptionGroupRuleFieldChange}
                      handleApplyOptionGroupsForConfig={handleApplyOptionGroupsForConfig}
                      optionsConfigApplyingGroups={optionsConfigApplyingGroups}
                      newOptionModifier={newOptionModifier}
                      setNewOptionModifier={setNewOptionModifier}
                      newOptionModifierDelivery={newOptionModifierDelivery}
                      setNewOptionModifierDelivery={setNewOptionModifierDelivery}
                      handleAddOptionForConfig={handleAddOptionForConfig}
                      handleAddAllOptionsForConfig={handleAddAllOptionsForConfig}
                    />

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

                    <PosMenuOptionsListSection
                      t={t}
                      optionsConfigEffectiveGroupKey={optionsConfigEffectiveGroupKey}
                      optionsConfigOptionListBracketLabel={optionsConfigOptionListBracketLabel}
                      optionsConfigShowAllOptions={optionsConfigShowAllOptions}
                      setOptionsConfigShowAllOptions={setOptionsConfigShowAllOptions}
                      optionsConfigOptionsOutsideSelectedGroupCount={optionsConfigOptionsOutsideSelectedGroupCount}
                      optionsConfigBulkValuesInput={optionsConfigBulkValuesInput}
                      setOptionsConfigBulkValuesInput={setOptionsConfigBulkValuesInput}
                      optionsConfigBulkHallPrice={optionsConfigBulkHallPrice}
                      setOptionsConfigBulkHallPrice={setOptionsConfigBulkHallPrice}
                      optionsConfigBulkDeliveryPrice={optionsConfigBulkDeliveryPrice}
                      setOptionsConfigBulkDeliveryPrice={setOptionsConfigBulkDeliveryPrice}
                      optionsConfigSelectedMenuId={optionsConfigSelectedMenuId}
                      setOptionsConfigBulkMenuPickerSearch={setOptionsConfigBulkMenuPickerSearch}
                      setOptionsConfigBulkMenuPickerChecked={setOptionsConfigBulkMenuPickerChecked}
                      setOptionsConfigBulkMenuPickerOpen={setOptionsConfigBulkMenuPickerOpen}
                      handleBulkAddValuesForSelectedGroup={handleBulkAddValuesForSelectedGroup}
                      optionsConfigSelectedMenu={optionsConfigSelectedMenu}
                      optionsConfigOptionsInSelectedGroup={optionsConfigOptionsInSelectedGroup}
                      optionsConfigMenuOptions={optionsConfigMenuOptions}
                      optionsConfigPanelStepGroups={optionsConfigPanelStepGroups}
                      optionPartLabel={optionPartLabel}
                      handleOptionNameChangeForConfig={handleOptionNameChangeForConfig}
                      handlePriceChangeForConfig={handlePriceChangeForConfig}
                      handleOptionChannelsChangeForConfig={handleOptionChannelsChangeForConfig}
                      handleDeleteOptionForConfig={handleDeleteOptionForConfig}
                      optionsConfigSaving={optionsConfigSaving}
                      setOptionsConfigDraggingOptionId={setOptionsConfigDraggingOptionId}
                      optionsConfigDraggingOptionId={optionsConfigDraggingOptionId}
                      handleOptionReorderForConfig={handleOptionReorderForConfig}
                    />
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
              <PosDeliveryOpsToolbar
                t={t}
                canSearchAllStores={canSearchAllStores}
                deliveryOpsCopySourceStore={deliveryOpsCopySourceStore}
                setDeliveryOpsCopySourceStore={setDeliveryOpsCopySourceStore}
                stores={stores}
                deliveryOpsStoreCode={deliveryOpsStoreCode}
                handleCopyDeliveryOpsFromStore={handleCopyDeliveryOpsFromStore}
                deliveryOpsCopying={deliveryOpsCopying}
                handleApplyDeliveryOpsToAllStores={handleApplyDeliveryOpsToAllStores}
                deliveryOpsApplyingAll={deliveryOpsApplyingAll}
                handleSaveDeliveryOpsPolicy={handleSaveDeliveryOpsPolicy}
                deliveryOpsSaving={deliveryOpsSaving}
              />

              <PosDeliveryOpsSettings
                t={t}
                deliveryOpsStoreDraft={deliveryOpsStoreDraft}
                setDeliveryOpsStoreDraft={setDeliveryOpsStoreDraft}
                canSearchAllStores={canSearchAllStores}
                stores={stores}
                auth={auth}
                storeLabels={storeLabels}
                handleQueryDeliveryOps={handleQueryDeliveryOps}
                deliveryOpsLoading={deliveryOpsLoading}
                deliveryOpsStoreCode={deliveryOpsStoreCode}
                deliveryOpsStoreDraftPending={deliveryOpsStoreDraftPending}
                formatStoreLabel={formatStoreLabel}
                deliveryOpsAppCode={deliveryOpsAppCode}
                setDeliveryOpsAppCode={setDeliveryOpsAppCode}
                deliveryOpsAppPolicy={deliveryOpsAppPolicy}
                setDeliveryOpsAppPolicy={setDeliveryOpsAppPolicy}
              />
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

              <PosDeliveryOpsMenuPolicies
                t={t}
                deliveryOpsSearch={deliveryOpsSearch}
                setDeliveryOpsSearch={setDeliveryOpsSearch}
                deliveryOpsBulkSellStart={deliveryOpsBulkSellStart}
                setDeliveryOpsBulkSellStart={setDeliveryOpsBulkSellStart}
                deliveryOpsBulkSellEnd={deliveryOpsBulkSellEnd}
                setDeliveryOpsBulkSellEnd={setDeliveryOpsBulkSellEnd}
                handleApplyBulkSellTimes={handleApplyBulkSellTimes}
                deliveryOpsVisibleMenus={deliveryOpsVisibleMenus}
                deliveryOpsMenuPolicyMap={deliveryOpsMenuPolicyMap}
                deliveryOpsStoreCode={deliveryOpsStoreCode}
                deliveryOpsAppCode={deliveryOpsAppCode}
                upsertDeliveryMenuPolicy={upsertDeliveryMenuPolicy}
                deliveryOpsImageInputRefs={deliveryOpsImageInputRefs}
                handleUploadDeliveryMenuImage={handleUploadDeliveryMenuImage}
                deliveryOpsImageUploadingMenuId={deliveryOpsImageUploadingMenuId}
              />

              {deliveryOpsAppCode === "grab" && (
                <PosGrabCampaignsPanel
                  t={t}
                  handleLoadGrabCampaigns={handleLoadGrabCampaigns}
                  grabCampaignsLoading={grabCampaignsLoading}
                  deliveryOpsStoreCode={deliveryOpsStoreCode}
                  grabCampaignsMeta={grabCampaignsMeta}
                  grabCampaignsRows={grabCampaignsRows}
                  buildGrabSupportReplyText={buildGrabSupportReplyText}
                  setGrabCampaignCopiedId={setGrabCampaignCopiedId}
                  grabCampaignCopiedId={grabCampaignCopiedId}
                  handleCopyGrabCampaignId={handleCopyGrabCampaignId}
                  grabCampaignCancellingId={grabCampaignCancellingId}
                  handleCancelGrabCampaign={handleCancelGrabCampaign}
                />
              )}

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
