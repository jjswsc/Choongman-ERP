'use client'
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from 'react'
import {
  getPosMenus,
  getPosMenuCategories,
  getPosMenuOptions,
  getPosPromoItems,
  getPosPromosWithItems,
  getPosMenuScreenConfig,
  savePosMenuScreenConfig,
  savePosMenu,
  savePosMenuOption,
  syncPosMenuImageCrossChannels,
  uploadPosMenuImage,
  POS_MENU_UPLOAD_TOO_LARGE,
  type PosMenu,
  type PosMenuOption,
  type PosPromoWithItems,
} from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useLang } from '@/lib/lang-context'
import { useT, tr as i18nTr } from '@/lib/i18n'
import { localizeApiMessage } from '@/lib/translate-api-message'
import { cn } from '@/lib/utils'
import { ArrowDown, ArrowLeft, ArrowUp, GripVertical, Pencil, Save, Upload } from 'lucide-react'
import {
  DEFAULT_POS_MENU_SCREEN_CONFIG,
  normalizePosMenuScreenConfig,
  type PosMenuScreenConfig,
} from '@/lib/pos-menu-screen-config'
import { getBanbanFlavorMenuList, isBanbanMenu } from '@/lib/pos-banban-utils'
import {
  PROMOTION_MAIN_CATEGORY,
  normalizePosMainCategoryTabs,
  normalizePromotionCategoryMain,
  normalizePromotionSubcategory,
  promotionSubcategoriesEqual,
  uniqueSubcategoriesForMainMenu,
} from '@/lib/pos-promo-constants'
import { translatePosMenuCategoryLabel } from '@/lib/pos-menu-category-label'
import { isPromoVisibleInContext } from '@/lib/pos-promo-visibility'
import { getPosBusinessDateStr } from '@/lib/pos-business-day'
import { preparePosMenuImageFileForUpload } from '@/lib/pos-menu-image-compress'
import { PosMenuFillImage } from '@/components/pos/pos-menu-image'
import { resolvePromoTileImageSrc } from '@/lib/pos-menu-display-image'
import { loadPosDeliveryMenuImageByMenuId } from '@/lib/load-pos-delivery-menu-images'
import { usePosMenusCatalogLiveRefresh } from '@/lib/offline/use-pos-menus-catalog-live-refresh'
import { getPromoChoiceSlotLabel, splitPromoChoiceGroups, type PromoChoiceGroup } from '@/lib/pos-promo-choice'
import type { CartPanelAddItemPayload } from '@/components/pos/cart-panel'
import {
  posDescriptionChannelFromTerminalType,
  resolvePosMenuDescriptionForChannel,
  resolvePosMenuOptionDescriptionForChannel,
} from '@/lib/pos-menu-display-description'
import { translatePosMenuLineForReceipt, POS_CHICKEN_DEFAULT_OPTION_DISPLAY } from '@/lib/pos-print-translate'
import { resolvePosCartOptionDisplayName } from '@/lib/pos-cart-option-display-name'
import {
  filterFlatChickenMListOptions,
  isChickenDefaultOptionName,
  shouldUseFlatChickenMOptionPicker,
} from '@/lib/pos-chicken-option-inference'
import { shouldUseFlatBarBqChickenOptionPicker } from '@/lib/pos-barbq-option-picker-ui'
import { resolvePosMenuImageUrlPayloadForSave } from '@/lib/pos-menu-image-storage-path'
import {
  collectPosOptionPickerStepValues,
  resolvePosOptionPickerMatch,
} from '@/lib/pos-option-picker-resolve'
import {
  filterOptionSelectionGroupsForAudience,
  filterPosOptionsForVisibleGroups,
  inferOptionSelectionGroupsFromOptions,
  resolveStepAudienceFromOrderType,
} from '@/lib/pos-option-selection-groups'
import { isChickenMenu } from '@/lib/pos-menu-categories'

const isChickenDefaultOption = isChickenDefaultOptionName

export type PosOrderTypeForPrice = 'dine-in' | 'takeout' | 'delivery'

export interface PosTerminalMenuScreenProps {
  /** 선택된 테이블 이름 (상단에 표시) */
  selectedTableName: string
  /** 화면 모드 */
  mode?: 'pos-order' | 'admin-config'
  /** 매장 코드 (화면 구성값 저장/조회용) */
  storeCode?: string | null
  /** 테이블 선택 화면으로 돌아가기 */
  onBack: () => void
  /** 뒤로가기 버튼 라벨 (기본: 테이블 선택) */
  backButtonLabel?: string
  /** 메뉴/옵션 선택 후 장바구니에 추가할 때 (이름·가격은 옵션 반영된 최종값) */
  onAddItem?: (item: CartPanelAddItemPayload) => void
  /** 주문 유형: 홀/포장=홀가격, 배달=배달앱가격 적용 (admin-config 시 무시) */
  orderType?: PosOrderTypeForPrice
  /** 배달 탭에서 선택된 앱 code — 프로모 앱 제한 필터용 */
  deliveryAppCode?: string | null
  /** 하단 화면 구성바 표시 */
  showConfigBar?: boolean
  /** 관리자 설정 화면에서 상단 새로고침 시 증가 → 메뉴·화면구성 재로드 */
  configReloadNonce?: number
  /** 터치 UI 밀도 (모바일: large) */
  touchMode?: 'default' | 'large'
  /**
   * true면 메뉴 목록을 뷰포트 안에서만 스크롤 (하단 고정 장바구니 등과 함께 쓸 때).
   * false(기본)면 large 터치 시 전체 페이지 스크롤 레이아웃(h-auto)을 씀.
   */
  containMenuHeight?: boolean
  className?: string
  /**
   * true면 상단 바(테이블 선택 뒤로가기 + 테이블명)를 숨김.
   * 터미널에서 테이블·뒤로가기를 장바구니로 옮길 때 사용.
   */
  hideTableContextBar?: boolean
  /**
   * 관리자에 등록한 메뉴/옵션 설명(채널별) 표시.
   * 테이블 오더 등 손님 단말에서만 true — 직원 POS는 false.
   */
  showMenuDescriptions?: boolean
}

type PromoChoiceDialogState = {
  promo: PosPromoWithItems
  fixedItems: { menuId: string; optionId: string | null; quantity: number }[]
  groups: PromoChoiceGroup[]
  selectedRowKeysByGroup: Record<string, string[]>
}

export function PosTerminalMenuScreen({
  selectedTableName,
  mode = 'pos-order',
  storeCode,
  onBack,
  backButtonLabel,
  onAddItem,
  orderType = 'dine-in',
  deliveryAppCode = null,
  showConfigBar = true,
  touchMode = 'default',
  containMenuHeight = false,
  className,
  hideTableContextBar = false,
  showMenuDescriptions = false,
  configReloadNonce = 0,
}: PosTerminalMenuScreenProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const translateChickenPartLabel = React.useCallback(
    (name: string | undefined): string => translatePosMenuLineForReceipt(String(name || ''), t),
    [t]
  )
  const [menus, setMenus] = React.useState<PosMenu[]>([])
  const { lastSyncedAtMs } = usePosMenusCatalogLiveRefresh(
    React.useCallback((list) => setMenus(list), []),
    storeCode || null
  )
  const [promos, setPromos] = React.useState<PosPromoWithItems[]>([])
  const [deliveryMenuImageByMenuId, setDeliveryMenuImageByMenuId] = React.useState<Record<string, string>>({})
  const [mainCategories, setMainCategories] = React.useState<string[]>([])
  const [selectedMainCategory, setSelectedMainCategory] = React.useState('')
  const [selectedCategory, setSelectedCategory] = React.useState('')
  const [allOptions, setAllOptions] = React.useState<PosMenuOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [optionPickerMenu, setOptionPickerMenu] = React.useState<PosMenu | null>(null)
  const [optionPickerStep, setOptionPickerStep] = React.useState(0)
  const [optionPickerSelections, setOptionPickerSelections] = React.useState<Record<string, string>>({})
  const [optionPickerBanbanFirst, setOptionPickerBanbanFirst] = React.useState<PosMenu | null>(null)
  const [promoChoiceDialog, setPromoChoiceDialog] = React.useState<PromoChoiceDialogState | null>(null)
  /**
   * 세트 구성품 API가 순간적으로 빈 배열을 줄 때를 대비한 메모리 캐시.
   * - POS 화면에서 "세트 구성이 안 보임" 체감을 줄인다.
   */
  const promoItemsFallbackCacheRef = React.useRef<
    Map<string, PosPromoWithItems['items']>
  >(new Map())
  const [searchKeyword, setSearchKeyword] = React.useState('')
  const [listPage, setListPage] = React.useState(0)
  const [screenConfig, setScreenConfig] = React.useState<PosMenuScreenConfig>(DEFAULT_POS_MENU_SCREEN_CONFIG)
  const [configLoading, setConfigLoading] = React.useState(true)
  const [configSaving, setConfigSaving] = React.useState(false)
  const [configMessage, setConfigMessage] = React.useState<string>('')
  const isAdminMode = mode === 'admin-config'
  const descriptionChannel = posDescriptionChannelFromTerminalType(orderType)
  const [menuEditOpen, setMenuEditOpen] = React.useState(false)
  const [menuEditSaving, setMenuEditSaving] = React.useState(false)
  const [setTemplateApplying, setSetTemplateApplying] = React.useState(false)
  const [menuEditTargetId, setMenuEditTargetId] = React.useState<string | null>(null)
  const [menuEditTab, setMenuEditTab] = React.useState<'menu' | 'general' | 'item'>('menu')
  const [imageUploading, setImageUploading] = React.useState(false)
  const posCatalogSyncLabel = React.useMemo(() => {
    if (!lastSyncedAtMs) return t('posCatalogSyncWaiting') || '메뉴 동기화 대기'
    const hhmmss = new Date(lastSyncedAtMs).toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Bangkok',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    return `${t('posCatalogSyncLabel') || '메뉴 동기화'} ${hhmmss}`
  }, [lastSyncedAtMs, t])
  const menuListRef = React.useRef<HTMLDivElement | null>(null)
  const categoryPanelRef = React.useRef<HTMLElement | null>(null)
  const menuGridRef = React.useRef<HTMLDivElement | null>(null)
  const imageInputRef = React.useRef<HTMLInputElement>(null)
  const [menuEditForm, setMenuEditForm] = React.useState<{
    code: string
    name: string
    categoryMain: string
    category: string
    price: string
    priceDelivery: string
    imageUrl: string
    kitchenPrinter: 'none' | '0' | '1' | '2' | '3'
    cookingTimeMin: string
    optionSelectionGroupsText: string
    isActive: boolean
    vatIncluded: boolean
    isBanban: boolean
  }>({
    code: '',
    name: '',
    categoryMain: '',
    category: '',
    price: '',
    priceDelivery: '',
    imageUrl: '',
    kitchenPrinter: 'none',
    cookingTimeMin: '',
    optionSelectionGroupsText: '',
    isActive: true,
    vatIncluded: true,
    isBanban: false,
  })

  const loadMenuData = React.useCallback(async () => {
    const emptyCats = { categories: [] as string[], mainCategories: [] as string[] }
    const [r0, r1, r2, r3] = await Promise.allSettled([
      getPosMenus({ fresh: true, storeCode: storeCode || undefined }),
      getPosMenuCategories(),
      getPosMenuOptions({ fresh: true }),
      getPosPromosWithItems(),
    ])
    const list = r0.status === 'fulfilled' ? r0.value || [] : []
    const catRes = r1.status === 'fulfilled' ? r1.value || emptyCats : emptyCats
    const opts = r2.status === 'fulfilled' ? r2.value || [] : []
    const promoList = r3.status === 'fulfilled' ? r3.value || [] : []
    const derivedCats = Array.from(new Set(list.map((m) => String(m.category || '').trim()).filter(Boolean)))
    const derivedMains = Array.from(
      new Set(list.map((m) => String(m.categoryMain || '').trim()).filter(Boolean))
    )
    const finalCats = (catRes.categories || []).length > 0 ? (catRes.categories || []) : derivedCats
    const finalMains = (catRes.mainCategories || []).length > 0 ? (catRes.mainCategories || []) : derivedMains
    setMenus(list)
    setPromos(promoList)
    setAllOptions(opts)
    const mains = normalizePosMainCategoryTabs([...finalMains, PROMOTION_MAIN_CATEGORY])
    setMainCategories(mains)
    setSelectedMainCategory(mains[0] ?? '')
    const firstSub =
      mains[0] === PROMOTION_MAIN_CATEGORY
        ? normalizePromotionSubcategory(
            Array.from(new Set((promoList || []).map((p) => String(p.category || '').trim()).filter(Boolean)))[0] || ''
          )
        : finalCats.find((c) => {
            const hit = list.some(
              (m) => String(m.categoryMain || '').trim() === mains[0] && String(m.category || '').trim() === c
            )
            return hit
          }) || ''
    setSelectedCategory(firstSub)
  }, [storeCode])

  React.useEffect(() => {
    if (!String(storeCode || '').trim()) {
      setDeliveryMenuImageByMenuId({})
      return
    }
    let cancelled = false
    void loadPosDeliveryMenuImageByMenuId(String(storeCode).trim()).then((map) => {
      if (!cancelled) setDeliveryMenuImageByMenuId(map)
    })
    return () => {
      cancelled = true
    }
  }, [storeCode, configReloadNonce])

  React.useEffect(() => {
    setLoading(true)
    loadMenuData().finally(() => setLoading(false))
  }, [loadMenuData, configReloadNonce])

  React.useEffect(() => {
    const scope = orderType === 'delivery' ? 'delivery' : orderType === 'takeout' ? 'takeout' : 'dine-in'
    setConfigLoading(true)
    getPosMenuScreenConfig({ storeCode: storeCode || undefined, scope })
      .then((cfg) => setScreenConfig(normalizePosMenuScreenConfig(cfg, storeCode || null)))
      .catch(() => setScreenConfig(normalizePosMenuScreenConfig(null, storeCode || null)))
      .finally(() => setConfigLoading(false))
  }, [storeCode, configReloadNonce, orderType])

  const optionsByMenuId = React.useMemo(() => {
    const sellKey = orderType === 'dine-in' ? 'sellHall' : orderType === 'delivery' ? 'sellDelivery' : 'sellPackaging'
    const m: Record<string, PosMenuOption[]> = {}
    for (const o of allOptions) {
      const sell = o[sellKey as keyof PosMenuOption]
      if (sell === false) continue
      const mid = String(o.menuId)
      if (!m[mid]) m[mid] = []
      m[mid].push(o)
    }
    return m
  }, [allOptions, orderType])

  const todayStr = React.useMemo(
    () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }),
    []
  )
  const mainCategoryFontPx = isAdminMode ? screenConfig.mainCategoryFontSize : 12
  const categoryFontPx = isAdminMode ? screenConfig.categoryFontSize : 12
  /** POS 터미널: 대분류·소분류 버튼 가독성 (관리자 화면 구성 폰트와 별도) */
  const posMainBtnFontPx = touchMode === 'large' ? 14 : 13
  const posCategoryBtnFontPx = touchMode === 'large' ? 13 : 12
  const tileFontPx = isAdminMode ? screenConfig.menuTileFontSize : 13
  const categoriesForSelectedMain = React.useMemo(() => {
    if (!selectedMainCategory) return [] as string[]
    const fromMain = menus
      .filter((m) => (m.categoryMain ?? '') === selectedMainCategory)
      .map((m) => m.category)
      .filter(Boolean) as string[]
    const arr = uniqueSubcategoriesForMainMenu(selectedMainCategory, fromMain)
    if (arr.length > 0) return arr
    const fromCategory = menus.filter((m) => (m.category ?? '') === selectedMainCategory)
    if (fromCategory.length > 0) return [selectedMainCategory]
    return []
  }, [menus, selectedMainCategory])

  React.useEffect(() => {
    if (categoriesForSelectedMain.length === 0) return
    const valid =
      categoriesForSelectedMain.includes(selectedCategory) ||
      (selectedMainCategory === PROMOTION_MAIN_CATEGORY &&
        categoriesForSelectedMain.some((c) => promotionSubcategoriesEqual(c, selectedCategory)))
    if (!valid) setSelectedCategory(categoriesForSelectedMain[0])
  }, [categoriesForSelectedMain, selectedCategory, selectedMainCategory])

  React.useEffect(() => {
    setListPage(0)
  }, [selectedMainCategory, selectedCategory, searchKeyword, screenConfig.menuListPageSize])

  const linkedPromoIds = React.useMemo(() => {
    const s = new Set<string>()
    for (const m of menus) {
      const pid = m.promoId?.trim()
      if (pid) s.add(pid)
    }
    return s
  }, [menus])

  const businessDateYmd = getPosBusinessDateStr()
  const promoVisibilityById = React.useMemo(() => {
    const ot = orderType === 'dine-in' ? 'dine_in' : orderType === 'delivery' ? 'delivery' : 'takeout'
    const out = new Map<string, boolean>()
    for (const p of promos) {
      out.set(
        p.id,
        isPromoVisibleInContext(p, {
          businessDateYmd,
          orderType: ot,
          deliveryAppCode: deliveryAppCode || null,
        })
      )
    }
    return out
  }, [promos, businessDateYmd, orderType, deliveryAppCode])

  const filteredMenus = React.useMemo(() => {
    const active = menus.filter((m) => m.isActive)
    const notSoldOut = active.filter((m) => !m.soldOutDate || m.soldOutDate !== todayStr)
    const visibleByPromoChannel = notSoldOut.filter((m) => {
      const pid = m.promoId?.trim()
      if (!pid) return true
      // 미러 세트 메뉴는 원본 프로모 채널/기간 가시성과 동일하게 노출한다.
      const visible = promoVisibilityById.get(pid)
      return visible == null ? true : visible
    })
    if (!selectedMainCategory || !selectedCategory) return []
    const subOk = (cat: string | undefined) =>
      selectedMainCategory === PROMOTION_MAIN_CATEGORY
        ? promotionSubcategoriesEqual(cat, selectedCategory)
        : (cat ?? '').trim() === selectedCategory
    const byMainAndSub = visibleByPromoChannel.filter(
      (m) => (m.categoryMain ?? '') === selectedMainCategory && subOk(m.category)
    )
    if (byMainAndSub.length > 0) return byMainAndSub
    return visibleByPromoChannel.filter((m) => subOk(m.category))
  }, [menus, selectedCategory, selectedMainCategory, todayStr, promoVisibilityById])

  const filteredPromos = React.useMemo(() => {
    return promos.filter((p) => {
      if (!p.isActive) return false
      if (linkedPromoIds.has(p.id)) return false
      const cm = (p.categoryMain || PROMOTION_MAIN_CATEGORY).trim()
      const sub = (p.category || '').trim()
      if (selectedMainCategory && cm !== selectedMainCategory) return false
      if (selectedCategory) {
        if (selectedMainCategory === PROMOTION_MAIN_CATEGORY) {
          if (!promotionSubcategoriesEqual(sub, selectedCategory)) return false
        } else if (sub !== selectedCategory) {
          return false
        }
      }
      return promoVisibilityById.get(p.id) ?? false
    })
  }, [
    promos,
    selectedCategory,
    selectedMainCategory,
    linkedPromoIds,
    promoVisibilityById,
  ])

  React.useEffect(() => {
    const cache = promoItemsFallbackCacheRef.current
    for (const p of promos) {
      const pid = String(p.id ?? '').trim()
      if (!pid) continue
      if (Array.isArray(p.items) && p.items.length > 0) {
        cache.set(
          pid,
          p.items
            .map((it) => ({
              menuId: String(it.menuId ?? '').trim(),
              optionId: it.optionId != null ? String(it.optionId).trim() || null : null,
              quantity: Math.max(1, Number(it.quantity) || 1),
              choiceGroup: it.choiceGroup != null ? String(it.choiceGroup).trim() || null : null,
              choicePickCount:
                it.choicePickCount != null && Number.isFinite(Number(it.choicePickCount))
                  ? Math.max(1, Math.floor(Number(it.choicePickCount)))
                  : null,
            }))
            .filter((it) => it.menuId)
        )
      }
    }
  }, [promos])

  const getMenuPrice = (menu: PosMenu) =>
    orderType === 'delivery' && menu.priceDelivery != null ? menu.priceDelivery : menu.price
  const getOptionModifier = (opt: PosMenuOption) => {
    const hall = Number.isFinite(Number(opt.priceModifier)) ? Number(opt.priceModifier) : 0
    const delivery = opt.priceModifierDelivery
    const packaging = opt.priceModifierPackaging
    if (orderType === 'delivery' && opt.priceModifierDelivery != null) return opt.priceModifierDelivery
    if (orderType === 'takeout' && opt.priceModifierPackaging != null) return opt.priceModifierPackaging
    // 홀 기본값이 0으로 남고 배달/포장만 세팅된 레거시 옵션 보정
    if (orderType === 'dine-in' && hall === 0) {
      if (delivery != null && Number.isFinite(Number(delivery))) return Number(delivery)
      if (packaging != null && Number.isFinite(Number(packaging))) return Number(packaging)
    }
    return hall
  }
  const getPromoPrice = (p: PosPromoWithItems) =>
    orderType === 'delivery' && p.priceDelivery != null ? p.priceDelivery : (p.price ?? 0)

  /** 반반 맛 선택 목록 (열린 메뉴 기준, 후보 0개일 때 대분류·코드 기반 폴백) */
  const banbanFlavorList = React.useMemo(() => {
    if (!optionPickerMenu || !isBanbanMenu(optionPickerMenu)) return []
    return getBanbanFlavorMenuList(menus, optionPickerMenu, todayStr)
  }, [menus, optionPickerMenu, todayStr])

  const addWithOption = async (menu: PosMenu, opt: PosMenuOption | null, defaultOptionName?: string) => {
    const mirrorPid = menu.promoId?.trim()
    if (mirrorPid && !opt) {
      const pr = promos.find((x) => x.id === mirrorPid)
      if (pr) {
        void addPromo(pr)
        return
      }
      const rows = await getPosPromoItems({ promoId: mirrorPid }).catch(() => [])
      if (rows.length > 0) {
        const fallbackPromo: PosPromoWithItems = {
          id: mirrorPid,
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
            menuId: String(r.menuId ?? ''),
            optionId: r.optionId ? String(r.optionId) : null,
            quantity: Math.max(1, Number(r.quantity) || 1),
            choiceGroup: String(r.choiceGroup ?? '').trim() || null,
            choicePickCount:
              r.choicePickCount != null && Number.isFinite(Number(r.choicePickCount))
                ? Math.max(1, Math.floor(Number(r.choicePickCount)))
                : null,
          })),
        }
        void addPromo(fallbackPromo)
        return
      }
    }
    const id = opt ? `${menu.id}-${opt.id}` : menu.id
    const optBracket = opt ? resolvePosCartOptionDisplayName(menu, opt) : ''
    const name = opt
      ? `${menu.name} (${optBracket})`
      : defaultOptionName
        ? `${menu.name} (${defaultOptionName})`
        : menu.name
    const price = getMenuPrice(menu) + (opt ? getOptionModifier(opt) : 0)
    onAddItem?.({
      id,
      name,
      price,
      menuId: menu.id,
      ...(opt ? { optionId: opt.id, optionCode: opt.optionCode ?? null } : {}),
    })
    setOptionPickerMenu(null)
    setOptionPickerStep(0)
    setOptionPickerSelections({})
  }

  const addBanban = (banbanMenu: PosMenu, menu1: PosMenu, menu2: PosMenu) => {
    const ids = [menu1.id, menu2.id].sort()
    const id = `banban-${ids.join('-')}`
    const name = `${banbanMenu.name} (${menu1.name} / ${menu2.name})`
    const price = getMenuPrice(banbanMenu)
    onAddItem?.({ id, name, price, menuId: banbanMenu.id })
    setOptionPickerMenu(null)
    setOptionPickerBanbanFirst(null)
  }

  const addResolvedPromo = React.useCallback((resolvedPromo: PosPromoWithItems) => {
    /** 카트 라인에 옵션 이름을 미리 캐시 — 카트 패널은 sell 채널 필터·옵션 캐시 누락 시 lookup이 실패할 수 있다. */
    const normalizedItems = (resolvedPromo.items || []).map((x) => {
      const optId = x.optionId ? String(x.optionId) : null
      const option = optId ? allOptions.find((o) => String(o.id) === optId) : null
      const menu = menus.find((m) => String(m.id) === String(x.menuId))
      const optName = optId
        ? option && menu
          ? resolvePosCartOptionDisplayName(menu, option) || String(option.name ?? '').trim()
          : (option?.name?.trim() || '')
        : isChickenMenu(menu?.code)
          ? POS_CHICKEN_DEFAULT_OPTION_DISPLAY
          : ''
      const menuName = (menu?.name ?? '').trim()
      return {
        menuId: String(x.menuId),
        optionId: optId,
        ...(option?.optionCode ? { optionCode: option.optionCode } : {}),
        quantity: Math.max(1, Number(x.quantity) || 1),
        ...(menuName ? { menuName } : {}),
        ...(optName ? { optionName: optName } : {}),
      }
    })
    const signature = normalizedItems
      .map((x) => `${x.menuId}:${x.optionId || '-'}:${x.quantity}`)
      .join('|')
    onAddItem?.({
      id: `promo-${resolvedPromo.id}-${signature || 'base'}`,
      name: resolvedPromo.name,
      price: getPromoPrice(resolvedPromo),
      promoId: resolvedPromo.id,
      promoCode: resolvedPromo.code,
      promoItems: normalizedItems,
    })
  }, [allOptions, getPromoPrice, menus, onAddItem])

  const addPromo = async (p: PosPromoWithItems) => {
    const freshItems = await getPosPromoItems({ promoId: p.id }).catch(() => null)
    const fallbackCache = promoItemsFallbackCacheRef.current.get(String(p.id))
    const resolvedItemsRaw =
      Array.isArray(freshItems) && freshItems.length > 0
        ? freshItems
        : Array.isArray(p.items) && p.items.length > 0
          ? p.items
          : Array.isArray(fallbackCache)
            ? fallbackCache
            : []
    const resolvedItems = resolvedItemsRaw
      .map((it) => ({
        menuId: String(it.menuId ?? '').trim(),
        optionId: it.optionId != null ? String(it.optionId).trim() || null : null,
        quantity: Math.max(1, Number(it.quantity) || 1),
        choiceGroup: it.choiceGroup != null ? String(it.choiceGroup).trim() || null : null,
        choicePickCount:
          it.choicePickCount != null && Number.isFinite(Number(it.choicePickCount))
            ? Math.max(1, Math.floor(Number(it.choicePickCount)))
            : null,
      }))
      .filter((it) => it.menuId)
    if (resolvedItems.length > 0) {
      promoItemsFallbackCacheRef.current.set(String(p.id), resolvedItems)
    }
    const resolvedPromo: PosPromoWithItems = { ...p, items: resolvedItems }
    const { fixedItems, groups } = splitPromoChoiceGroups((resolvedPromo.items || []).map((it) => ({
      menuId: String(it.menuId ?? ''),
      optionId: it.optionId ? String(it.optionId) : null,
      quantity: Math.max(1, Number(it.quantity) || 1),
      choiceGroup: String(it.choiceGroup ?? '').trim() || null,
      choicePickCount:
        it.choicePickCount != null && Number.isFinite(Number(it.choicePickCount))
          ? Math.max(1, Math.floor(Number(it.choicePickCount)))
          : null,
    })))
    if (groups.length === 0) {
      if (fixedItems.length === 0) {
        await appAlert(t('msg_save_fail_detail') || '세트 구성 메뉴를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
        return
      }
      addResolvedPromo({ ...resolvedPromo, items: fixedItems })
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
        await appAlert(i18nTr(t, 'posPromoGroupPickCount', { group: g.key, count: g.pickCount }))
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
    addResolvedPromo({
      ...state.promo,
      items: [...state.fixedItems, ...selectedItems],
    })
    setPromoChoiceDialog(null)
  }, [addResolvedPromo, promoChoiceDialog, t])

  const openMenuPicker = (menu: PosMenu) => {
    if (isBanbanMenu(menu)) {
      setOptionPickerBanbanFirst(null)
      setOptionPickerMenu(menu)
      return
    }
    const opts = optionsByMenuId[menu.id]
    if (opts?.length) {
      setOptionPickerMenu(menu)
      setOptionPickerStep(0)
      setOptionPickerSelections({})
      return
    }
    void addWithOption(menu, null)
  }

  // 실제 담기 가능 여부는 콜백 존재로 판단 (모드 문자열 불일치로 클릭이 막히는 케이스 방지)
  const interactive = typeof onAddItem === 'function'
  const fireMenuAction = React.useCallback((fn: () => void, ev?: { preventDefault?: () => void; stopPropagation?: () => void }) => {
    ev?.preventDefault?.()
    ev?.stopPropagation?.()
    fn()
  }, [])
  const isExpandedMobileList = !isAdminMode && touchMode === 'large' && !containMenuHeight
  const combinedRows = React.useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase()
    const promoRows = filteredPromos.map((p) => ({
      rowType: 'promo' as const,
      id: `promo-${p.id}`,
      name: p.name,
      price: getPromoPrice(p),
      promo: p,
      menu: null as PosMenu | null,
    }))
    const menuRows = filteredMenus.map((m) => ({
      rowType: 'menu' as const,
      id: m.id,
      name: m.name,
      price: getMenuPrice(m),
      promo: null as PosPromoWithItems | null,
      menu: m,
    }))
    const merged = [...promoRows, ...menuRows]
    if (!keyword) return merged
    return merged.filter((r) => r.name.toLowerCase().includes(keyword))
  }, [filteredMenus, filteredPromos, searchKeyword])
  const pageSize = Math.max(1, screenConfig.menuListPageSize)
  const totalPages = Math.max(1, Math.ceil(combinedRows.length / pageSize))
  const safePage = Math.min(listPage, totalPages - 1)
  const pagedRows = combinedRows.slice(safePage * pageSize, safePage * pageSize + pageSize)

  const saveConfig = async () => {
    if (!isAdminMode || configSaving) return
    setConfigSaving(true)
    setConfigMessage('')
    try {
      const scope = orderType === 'delivery' ? 'delivery' : orderType === 'takeout' ? 'takeout' : 'dine-in'
      const res = await savePosMenuScreenConfig({
        ...screenConfig,
        storeCode: storeCode || null,
        scope,
      })
      if (!res?.success) {
        setConfigMessage(res?.message || (t('posSaveFail') || '저장 실패'))
      } else {
        setConfigMessage(t('saved') || '저장됨')
      }
    } catch (e) {
      setConfigMessage(String(e))
    } finally {
      setConfigSaving(false)
    }
  }

  const setNumericConfig = (key: keyof PosMenuScreenConfig, raw: string) => {
    const n = Number(raw)
    const next = normalizePosMenuScreenConfig(
      { ...screenConfig, [key]: Number.isFinite(n) ? n : screenConfig[key] as number },
      storeCode || null
    )
    setScreenConfig(next)
  }

  const openMenuEdit = (menu: PosMenu) => {
    if (!isAdminMode) return
    setMenuEditTab('menu')
    setMenuEditTargetId(menu.id)
    setMenuEditForm({
      code: menu.code || '',
      name: menu.name || '',
      categoryMain: menu.categoryMain || '',
      category: menu.category || '',
      price: String(menu.price ?? ''),
      priceDelivery: menu.priceDelivery == null ? '' : String(menu.priceDelivery),
      imageUrl: menu.imageUrl || '',
      kitchenPrinter:
        menu.kitchenPrinter === 0
          ? '0'
          : menu.kitchenPrinter === 1
            ? '1'
            : menu.kitchenPrinter === 2
              ? '2'
              : menu.kitchenPrinter === 3
                ? '3'
                : 'none',
      cookingTimeMin: menu.cookingTimeMin == null ? '' : String(menu.cookingTimeMin),
      optionSelectionGroupsText: Array.isArray(menu.optionSelectionGroups) ? menu.optionSelectionGroups.join(', ') : '',
      isActive: menu.isActive !== false,
      vatIncluded: menu.vatIncluded !== false,
      isBanban: menu.isBanban === true,
    })
    setMenuEditOpen(true)
  }

  const saveMenuEdit = async () => {
    if (!menuEditTargetId) return
    const name = menuEditForm.name.trim()
    const code = menuEditForm.code.trim()
    if (!name || !code) {
      await appAlert((t('msg_fill_required') || '필수 항목을 입력해 주세요.'))
      return
    }
    setMenuEditSaving(true)
    try {
      const optionSelectionGroups = menuEditForm.optionSelectionGroupsText
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
      const dedupedGroups = optionSelectionGroups.length > 0 ? Array.from(new Set(optionSelectionGroups)) : []
      const targetMenu = menus.find((m) => m.id === menuEditTargetId)
      const prevCfgMap = new Map(
        (targetMenu?.optionSelectionConfig || [])
          .map((cfg) => [String(cfg?.key ?? '').trim(), cfg] as const)
          .filter(([key]) => !!key)
      )
      const optionSelectionConfig = dedupedGroups.map((key) => {
        const prev = prevCfgMap.get(key)
        const required = prev?.required !== false
        return {
          key,
          label: String(prev?.label ?? key).trim() || key,
          required,
          minSelect: required ? 1 : 0,
          maxSelect: 1,
        }
      })
      const cm = menuEditForm.categoryMain.trim()
      let cat = menuEditForm.category.trim()
      if (normalizePromotionCategoryMain(cm) === PROMOTION_MAIN_CATEGORY) {
        cat = normalizePromotionSubcategory(cat)
      }
      const imageSave = resolvePosMenuImageUrlPayloadForSave(
        menuEditForm.imageUrl.trim(),
        menuEditTargetId,
        { isEdit: true }
      )
      const savePayload: Parameters<typeof savePosMenu>[0] = {
        id: menuEditTargetId,
        code,
        name,
        categoryMain: cm,
        category: cat,
        price: Number(menuEditForm.price || 0),
        priceDelivery: menuEditForm.priceDelivery.trim() === '' ? null : Number(menuEditForm.priceDelivery),
        vatIncluded: menuEditForm.vatIncluded,
        isActive: menuEditForm.isActive,
        kitchenPrinter:
          menuEditForm.kitchenPrinter === 'none'
            ? null
            : menuEditForm.kitchenPrinter === '0'
              ? 0
              : (Number(menuEditForm.kitchenPrinter) as 1 | 2 | 3),
        cookingTimeMin: menuEditForm.cookingTimeMin.trim() === '' ? null : Number(menuEditForm.cookingTimeMin),
        optionSelectionGroups: dedupedGroups,
        optionSelectionConfig,
        isBanban: menuEditForm.isBanban,
      }
      if (imageSave.includeImageUrl) {
        savePayload.imageUrl = imageSave.imageUrl
      }
      const res = await savePosMenu(savePayload)
      if (!res?.success) {
        await appAlert(localizeApiMessage(res?.message, t, t('posSaveFail') || '저장 실패', lang))
        return
      }
      if (imageSave.mismatchMessage) {
        await appAlert(
          `${t('posMenuSavedWithoutImageMismatch') || '메뉴 정보는 저장했습니다. 다만 사진 URL이 다른 메뉴용이라 사진은 그대로 두었습니다.'}\n\n${imageSave.mismatchMessage}\n\n${t('posMenuImageUploadHint') || '이 메뉴에서 사진을 다시 업로드해 주세요.'}`
        )
      }
      await loadMenuData()
      setMenuEditOpen(false)
    } catch (e) {
      await appAlert(i18nTr(t, 'posUnexpectedErrorDetail', { detail: String(e) }))
    } finally {
      setMenuEditSaving(false)
    }
  }

  const parseOptionGroups = React.useCallback((raw: string) => {
    return raw
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
  }, [])

  const selectedOptionGroups = React.useMemo(() => {
    return parseOptionGroups(menuEditForm.optionSelectionGroupsText)
  }, [menuEditForm.optionSelectionGroupsText, parseOptionGroups])

  const categoriesForEditForm = React.useMemo(() => {
    if (!menuEditForm.categoryMain) return [] as string[]
    const fromMenus = menus
      .filter((m) => (m.categoryMain ?? '') === menuEditForm.categoryMain)
      .map((m) => m.category)
      .filter(Boolean) as string[]
    return uniqueSubcategoriesForMainMenu(menuEditForm.categoryMain, fromMenus)
  }, [menus, menuEditForm.categoryMain])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageUploading(true)
    try {
      let toSend = file
      try {
        toSend = await preparePosMenuImageFileForUpload(file)
      } catch (prepErr) {
        const pmsg = String(prepErr)
        if (pmsg.includes('POS_MENU_IMAGE_DECODE_FAIL')) {
          await appAlert(t('posMenuImageDecodeFail') || '이미지를 열 수 없습니다. JPG·PNG·WebP 등으로 저장 후 다시 시도해 주세요.')
        } else {
          await appAlert(pmsg)
        }
        return
      }
      const uploadMenuId = String(menuEditTargetId ?? '').trim()
      if (!uploadMenuId) {
        await appAlert(
          t('posMenuSaveBeforeImageUpload') ||
            '메뉴를 먼저 저장한 뒤 사진을 올려 주세요. (사진 파일명에 메뉴 id가 들어가야 합니다.)'
        )
        return
      }
      const res = await uploadPosMenuImage({ file: toSend, menuId: uploadMenuId })
      if (res?.success && res?.url) {
        const newUrl = res.url
        setMenuEditForm((p) => ({ ...p, imageUrl: newUrl }))
        /**
         * 프로모션과 연동된 메뉴(promoId)는 일반 저장 경로가 막혀 있어
         * 사진만 즉시 DB에 반영해 둔다. 마케팅 화면을 거치지 않고도
         * 운영자가 메뉴 화면에서 사진을 갱신할 수 있어야 하기 때문.
         */
        const targetMenu = menus.find((m) => m.id === uploadMenuId) ?? null
        if (targetMenu) {
          try {
            const saveRes = await savePosMenu({
              id: targetMenu.id,
              code: targetMenu.code || '',
              name: targetMenu.name || '',
              imageUrl: newUrl,
              imageOnly: true,
            })
            if (saveRes?.success) {
              const scopedStore = String(storeCode || '').trim()
              if (scopedStore) {
                const syncRes = await syncPosMenuImageCrossChannels({
                  storeCode: scopedStore,
                  menuId: targetMenu.id,
                  menuCode: targetMenu.code || '',
                  imageUrl: newUrl,
                  source: 'menu-screen',
                })
                if (!syncRes?.success) {
                  await appAlert(
                    localizeApiMessage(
                      syncRes?.message,
                      t,
                      t('posSaveFail') || '저장 실패',
                      lang
                    )
                  )
                }
              }
              await loadMenuData()
            } else {
              await appAlert(localizeApiMessage(saveRes?.message, t, t('posSaveFail') || '저장 실패', lang))
            }
          } catch (autoErr) {
            await appAlert(i18nTr(t, 'posUnexpectedErrorDetail', { detail: String(autoErr) }))
          }
        }
      } else {
        const msg =
          res?.message === POS_MENU_UPLOAD_TOO_LARGE
            ? t('posMenuImageUploadTooLarge') ||
              '파일이 너무 큽니다. 더 작은 사진을 선택하거나, 이미지 주소(URL)로 등록해 주세요.'
            : res?.message || t('msg_upload_fail') || '업로드 실패'
        await appAlert(msg)
      }
    } catch (err) {
      await appAlert(i18nTr(t, 'posUnexpectedErrorDetail', { detail: String(err) }))
    } finally {
      setImageUploading(false)
      e.target.value = ''
    }
  }

  const setSelectedOptionGroups = (next: string[]) => {
    const deduped = Array.from(new Set(next.map((v) => v.trim()).filter(Boolean)))
    setMenuEditForm((p) => ({ ...p, optionSelectionGroupsText: deduped.join(', ') }))
  }

  const moveOptionGroup = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return
    if (fromIdx >= selectedOptionGroups.length || toIdx >= selectedOptionGroups.length) return
    const copy = [...selectedOptionGroups]
    const [moved] = copy.splice(fromIdx, 1)
    copy.splice(toIdx, 0, moved)
    setSelectedOptionGroups(copy)
  }

  const applySetChoiceTemplate = async () => {
    if (setTemplateApplying) return
    setSelectedOptionGroups(['set_main', 'drink'])
    const targetId = menuEditTargetId ? String(menuEditTargetId).trim() : ''
    const targetMenuId = Number(targetId)
    if (!targetId || !Number.isFinite(targetMenuId) || targetMenuId <= 0) {
      await appAlert(t('posMenuEditSetTemplateStepsOnly'))
      return
    }
    const hasExistingSubstitution = allOptions.some(
      (o) =>
        String(o.menuId) === targetId &&
        (o.optionType == null || o.optionType === 'substitution')
    )
    if (hasExistingSubstitution) {
      await appAlert(t('posMenuEditSetTemplateStepsSkipSamples'))
      return
    }
    const confirmed = await appConfirm(t('posMenuEditSetTemplateConfirm'))
    if (!confirmed) return

    setSetTemplateApplying(true)
    try {
      const samples: Array<{ name: string; step: Record<string, string> }> = [
        { name: t('posSetTemplateEx1n'), step: { set_main: t('posSetTemplateEx1m'), drink: t('posSetTemplateEx1d') } },
        { name: t('posSetTemplateEx2n'), step: { set_main: t('posSetTemplateEx2m'), drink: t('posSetTemplateEx2d') } },
        { name: t('posSetTemplateEx3n'), step: { set_main: t('posSetTemplateEx3m'), drink: t('posSetTemplateEx3d') } },
        { name: t('posSetTemplateEx4n'), step: { set_main: t('posSetTemplateEx4m'), drink: t('posSetTemplateEx4d') } },
      ]
      for (let i = 0; i < samples.length; i++) {
        const row = samples[i]
        const res = await savePosMenuOption(
          {
            menuId: targetMenuId,
            name: row.name,
            optionType: 'substitution',
            sortOrder: i + 1,
            priceModifier: 0,
            optionStepValues: row.step,
          },
          { requireOnline: true }
        )
        if (!res?.success) {
          throw new Error(res?.message || t('posMenuEditSetTemplateOptionFail'))
        }
      }
      await loadMenuData()
      await appAlert(t('posMenuEditSetTemplateDone'))
    } catch (e) {
      await appAlert(i18nTr(t, 'posUnexpectedErrorDetail', { detail: String(e) }))
    } finally {
      setSetTemplateApplying(false)
    }
  }

  if (loading) {
    return (
      <div className={cn('flex h-full items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm', className)}>
        {t('posMenuLoading')}
      </div>
    )
  }

  return (
    <div
      data-tour={!isAdminMode && mode === 'pos-order' ? 'pos-tour-menu' : undefined}
      className={cn('flex flex-col rounded-lg border border-border bg-card overflow-hidden', isExpandedMobileList ? 'h-auto' : 'h-full', className)}
    >
      {!hideTableContextBar && (
        <div className="flex shrink-0 items-center gap-3 border-b border-border bg-muted/30 px-4 py-2">
          <Button variant="ghost" size="sm" className="gap-1.5 h-9" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            {backButtonLabel || t('posBackToTableSelect') || '테이블 선택'}
          </Button>
          <span className="text-sm font-medium text-muted-foreground">
            {t('posTableLabel')}: <span className="text-foreground font-semibold">{selectedTableName}</span>
          </span>
          <span className="ml-auto text-[11px] text-muted-foreground">{posCatalogSyncLabel}</span>
        </div>
      )}
      <div
        className={cn(
          isExpandedMobileList ? 'flex-none min-h-fit flex flex-col' : 'flex-1 min-h-0 flex flex-col',
          isAdminMode && 'min-[980px]:grid min-[980px]:grid-cols-[220px_1fr_320px] min-[980px]:grid-rows-[minmax(0,1fr)]'
        )}
      >
        <section
          ref={categoryPanelRef}
          className={cn(
            isAdminMode
              ? 'bg-muted/20 px-3 py-3 min-[980px]:min-h-0 min-[980px]:overflow-hidden border-r'
              : 'flex shrink-0 flex-col gap-2 border-b border-border/50 bg-muted/25 px-2 py-2'
          )}
        >
          {isAdminMode && (
            <p className="mb-2 font-semibold text-xs text-muted-foreground">{t('posMainCategory') || '대분류'}</p>
          )}
          <div
            className={cn(
              isAdminMode ? 'grid gap-1.5' : 'flex gap-2 overflow-x-auto scroll-smooth [-webkit-overflow-scrolling:touch]'
            )}
            role="group"
            aria-label={t('posMainCategory') || '대분류'}
          >
            {mainCategories.map((main) => (
              <button
                key={main}
                type="button"
                onClick={() => {
                  setSelectedMainCategory(main)
                  setSelectedCategory('')
                }}
                className={cn(
                  isAdminMode
                    ? cn(
                        'rounded-md border px-3 py-2 text-left font-semibold transition whitespace-nowrap leading-none',
                        selectedMainCategory === main
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background hover:bg-muted'
                      )
                    : cn(
                        'touch-manipulation shrink-0 rounded-lg border px-3 py-1.5 text-left font-semibold leading-snug whitespace-nowrap transition-all',
                        'min-h-10 min-w-[2.75rem] active:scale-[0.98]',
                        selectedMainCategory === main
                          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                          : 'border-border/80 bg-background text-foreground hover:border-primary/40 hover:bg-muted/70'
                      )
                )}
                style={{
                  fontSize: `${isAdminMode ? mainCategoryFontPx : posMainBtnFontPx}px`,
                }}
              >
                {main}
              </button>
            ))}
          </div>
          {isAdminMode && (
            <p className="mb-2 mt-4 font-semibold text-xs text-muted-foreground">{t('posCategory') || '카테고리'}</p>
          )}
          {!isAdminMode && categoriesForSelectedMain.length > 0 && (
            <div className="mx-0.5 h-px shrink-0 bg-border/50" aria-hidden />
          )}
          <div
            className={cn(
              isAdminMode ? 'grid gap-1.5' : 'flex gap-2 overflow-x-auto scroll-smooth [-webkit-overflow-scrolling:touch]'
            )}
            role="group"
            aria-label={t('posCategory') || '카테고리'}
          >
            {categoriesForSelectedMain.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  isAdminMode
                    ? cn(
                        'rounded-md border px-3 py-1.5 text-left transition whitespace-nowrap leading-none',
                        selectedCategory === cat
                          ? 'border-sky-600 bg-sky-500 text-white'
                          : 'border-border bg-background hover:bg-muted'
                      )
                    : cn(
                        'touch-manipulation shrink-0 rounded-lg border px-3 py-1.5 text-left font-medium leading-snug whitespace-nowrap transition-all',
                        'min-h-10 min-w-[2.75rem] active:scale-[0.98]',
                        selectedCategory === cat
                          ? 'border-sky-600 bg-sky-500 text-white shadow-sm'
                          : 'border-border/80 bg-background text-foreground hover:border-sky-400/60 hover:bg-sky-50/70 dark:hover:bg-sky-950/30'
                      )
                )}
                style={{
                  fontSize: `${isAdminMode ? categoryFontPx : posCategoryBtnFontPx}px`,
                }}
              >
                {translatePosMenuCategoryLabel(cat, t)}
              </button>
            ))}
          </div>
        </section>

        <section
          ref={menuListRef}
          className={cn(
            isExpandedMobileList
              ? 'flex-none overflow-visible p-1'
              : 'min-h-0 flex-1 overflow-y-scroll overflow-x-hidden',
            isAdminMode && 'min-[980px]:min-h-0 p-3'
          )}
        >
          {isAdminMode && (
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {selectedMainCategory || '-'} /{' '}
                {selectedCategory ? translatePosMenuCategoryLabel(selectedCategory, t) : '-'}
              </div>
              <div className="text-xs text-muted-foreground">{filteredMenus.length + filteredPromos.length} items</div>
            </div>
          )}
          <div
            ref={menuGridRef}
            className={cn(
              'grid content-start',
              isAdminMode ? 'gap-2' : 'gap-2.5 auto-rows-[162px]'
            )}
            style={{
              gridTemplateColumns: `repeat(${Math.max(2, screenConfig.menuTileCols)}, minmax(0, 1fr))`,
              alignContent: 'start',
              justifyContent: 'start',
              placeContent: 'start',
            }}
          >
            {filteredPromos.map((p) => {
              const promoImageSrc = resolvePromoTileImageSrc(p, menus, {
                deliveryImageByMenuId: deliveryMenuImageByMenuId,
              })
              return (
              <button
                key={`promo-${p.id}`}
                type="button"
                onClick={() => interactive && fireMenuAction(() => { void addPromo(p) })}
                className={cn(
                  'touch-manipulation flex h-full flex-col overflow-hidden rounded-xl border border-amber-300 bg-amber-50 p-1.5 text-left transition',
                  !isAdminMode &&
                    'rounded-2xl border-amber-400/50 bg-gradient-to-b from-amber-50 to-amber-100/90 shadow-md shadow-amber-900/10 ring-1 ring-amber-500/20',
                  interactive
                    ? 'hover:border-amber-500 hover:bg-amber-100 hover:shadow-lg active:scale-[0.98]'
                    : 'opacity-75 cursor-default'
                )}
                data-menu-card="promo"
              >
                <div className="relative flex h-[92px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-amber-100">
                  {promoImageSrc ? (
                    <PosMenuFillImage src={promoImageSrc} alt={p.name} />
                  ) : (
                    <span className="font-pos-emoji text-2xl">🏷️</span>
                  )}
                </div>
                <div
                  className="mt-1 overflow-hidden break-words font-medium leading-tight text-slate-800"
                  style={{
                    fontSize: `${tileFontPx}px`,
                    lineHeight: '1.2',
                    height: '3.6em',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {p.name}
                </div>
                <div className="mt-auto text-xs font-bold text-amber-600">{getPromoPrice(p).toLocaleString()} ฿</div>
              </button>
              )
            })}
            {filteredMenus.map((m) => {
              const menuDesc = showMenuDescriptions
                ? resolvePosMenuDescriptionForChannel(m, descriptionChannel)
                : ''
              return (
              <button
                key={m.id}
                type="button"
                onClick={() => interactive && fireMenuAction(() => openMenuPicker(m))}
                className={cn(
                  'touch-manipulation flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-left transition',
                  !isAdminMode &&
                    'rounded-2xl border-border/90 bg-card shadow-md shadow-black/[0.06] ring-1 ring-border/50 dark:shadow-black/30',
                  interactive
                    ? 'hover:border-emerald-500/70 hover:shadow-lg hover:ring-emerald-500/25 active:scale-[0.98]'
                    : 'opacity-85 cursor-default'
                )}
                data-menu-card="menu"
              >
                <div className="relative h-[80px] w-full shrink-0 overflow-hidden rounded-lg bg-slate-100 min-[400px]:h-[92px]">
                  {isAdminMode && (
                    <span
                      role="button"
                      tabIndex={0}
                      className="absolute right-1 top-1 z-10 flex cursor-pointer rounded bg-background/90 p-1 text-slate-700 shadow border hover:bg-background"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        openMenuEdit(m)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                          openMenuEdit(m)
                        }
                      }}
                      title={t('itemsBtnEdit') || '수정'}
                    >
                      <Pencil className="h-3 w-3" />
                    </span>
                  )}
                  <PosMenuFillImage src={m.imageUrl || ''} alt={m.name} />
                </div>
                <div className="mt-1 flex min-h-0 flex-1 flex-col gap-0.5">
                  <div
                    className="overflow-hidden break-words font-medium leading-tight text-slate-800"
                    style={{
                      fontSize: `${tileFontPx}px`,
                      lineHeight: '1.2',
                      maxHeight: '3.6em',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {m.name}
                  </div>
                  {menuDesc ? (
                    <p
                      className="line-clamp-2 text-[10px] leading-snug text-slate-500"
                      style={{ fontSize: `${Math.max(9, tileFontPx - 3)}px` }}
                      title={menuDesc}
                    >
                      {menuDesc}
                    </p>
                  ) : null}
                </div>
                <div className="mt-auto text-xs font-bold text-emerald-600">{getMenuPrice(m).toLocaleString()} ฿</div>
              </button>
            )
            })}
          </div>
        </section>

        {isAdminMode && (
          <section className="min-h-0 flex min-[980px]:min-h-0 flex-col overflow-hidden border-l bg-card p-3">
            <div className="mb-2 flex shrink-0 items-center gap-2">
              <Input
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder={t('search') || '검색'}
                className="h-8 text-xs"
              />
              <span className="text-xs text-muted-foreground">{safePage + 1}/{totalPages}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-scroll overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="px-2 py-1 text-left">{t('menu') || '메뉴'}</th>
                    <th className="px-2 py-1 text-right">{t('price') || '단가'}</th>
                    <th className="px-2 py-1 text-center">{t('add') || '추가'}</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="px-2 py-1.5">
                        <span style={{ fontSize: `${screenConfig.menuListFontSize}px` }}>
                          {row.rowType === 'promo'
                            ? `[Promo] ${translatePosMenuLineForReceipt(row.name, t)}`
                            : translatePosMenuLineForReceipt(row.name, t)}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{row.price.toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          disabled={!interactive}
                          onClick={() => {
                            if (!interactive) return
                            fireMenuAction(() => {
                              if (row.rowType === 'promo' && row.promo) void addPromo(row.promo)
                              if (row.rowType === 'menu' && row.menu) openMenuPicker(row.menu)
                            })
                          }}
                        >
                          +
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {pagedRows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-2 py-6 text-center text-muted-foreground">
                        {t('posNoMenus') || '등록된 메뉴가 없습니다.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex shrink-0 items-center justify-between">
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={safePage <= 0} onClick={() => setListPage((p) => Math.max(0, p - 1))}>
                {t('prev') || '이전'}
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={safePage >= totalPages - 1} onClick={() => setListPage((p) => Math.min(totalPages - 1, p + 1))}>
                {t('next') || '다음'}
              </Button>
            </div>
          </section>
        )}
      </div>

      {showConfigBar && isAdminMode && (
        <div className="shrink-0 border-t bg-muted/15 px-3 py-2">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[11px] text-muted-foreground">
              {t('posScreenConfigMainCategoryFont') || 'POS 메뉴 그룹'}
              <Input className="mt-1 h-8 w-16 text-xs" type="number" value={screenConfig.mainCategoryFontSize} disabled={configLoading || (!isAdminMode && true)} onChange={(e) => setNumericConfig('mainCategoryFontSize', e.target.value)} />
            </label>
            <label className="text-[11px] text-muted-foreground">
              {t('posScreenConfigCategoryFont') || 'POS 메뉴'}
              <Input className="mt-1 h-8 w-16 text-xs" type="number" value={screenConfig.categoryFontSize} disabled={configLoading || (!isAdminMode && true)} onChange={(e) => setNumericConfig('categoryFontSize', e.target.value)} />
            </label>
            <label className="text-[11px] text-muted-foreground">
              {t('posScreenConfigMenuTileFont') || '메뉴 타일 폰트'}
              <Input className="mt-1 h-8 w-16 text-xs" type="number" value={screenConfig.menuTileFontSize} disabled={configLoading || (!isAdminMode && true)} onChange={(e) => setNumericConfig('menuTileFontSize', e.target.value)} />
            </label>
            <label className="text-[11px] text-muted-foreground">
              {t('posScreenConfigMenuTileCols') || '타일 열 수'}
              <Input className="mt-1 h-8 w-16 text-xs" type="number" value={screenConfig.menuTileCols} disabled={configLoading || (!isAdminMode && true)} onChange={(e) => setNumericConfig('menuTileCols', e.target.value)} />
            </label>
            <label className="text-[11px] text-muted-foreground">
              {t('posScreenConfigMenuListFont') || '리스트 폰트'}
              <Input className="mt-1 h-8 w-16 text-xs" type="number" value={screenConfig.menuListFontSize} disabled={configLoading || (!isAdminMode && true)} onChange={(e) => setNumericConfig('menuListFontSize', e.target.value)} />
            </label>
            <label className="text-[11px] text-muted-foreground">
              {t('posScreenConfigMenuListPageSize') || '페이지 행 수'}
              <Input className="mt-1 h-8 w-16 text-xs" type="number" value={screenConfig.menuListPageSize} disabled={configLoading || (!isAdminMode && true)} onChange={(e) => setNumericConfig('menuListPageSize', e.target.value)} />
            </label>
            <label className="text-[11px] text-muted-foreground">
              {t('posScreenConfigKioskGroupFont') || '키오스크 그룹'}
              <Input className="mt-1 h-8 w-16 text-xs" type="number" value={screenConfig.kioskGroupFontSize} disabled={configLoading || (!isAdminMode && true)} onChange={(e) => setNumericConfig('kioskGroupFontSize', e.target.value)} />
            </label>
            {isAdminMode ? (
              <Button className="h-8 gap-1.5 text-xs" onClick={saveConfig} disabled={configLoading || configSaving}>
                <Save className="h-3.5 w-3.5" />
                {configSaving ? (t('saving') || '저장중') : (t('save') || '저장')}
              </Button>
            ) : (
              <span className="rounded-md bg-background px-2 py-1 text-[11px] text-muted-foreground border">
                {t('posScreenConfigTabMenus') || '메뉴 화면 구성'} 적용값
              </span>
            )}
            {configMessage && <span className="text-[11px] text-muted-foreground">{configMessage}</span>}
          </div>
        </div>
      )}

      {/* 옵션 선택 모달 */}
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
        <DialogContent className="max-w-md sm:max-w-lg w-[min(95vw,28rem)]">
          <DialogHeader>
            <DialogTitle>
              {optionPickerMenu?.name} — {t('posSelectOption') || '옵션 선택'}
              {optionPickerMenu?.optionSelectionGroups?.length
                ? ` (${(optionPickerStep || 0) + 1}/${optionPickerMenu.optionSelectionGroups.length})`
                : ''}
            </DialogTitle>
            {showMenuDescriptions && optionPickerMenu
              ? (() => {
                  const md = resolvePosMenuDescriptionForChannel(optionPickerMenu, descriptionChannel)
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
                  <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <div>
                      <p className="text-[11px] text-muted-foreground">{t('price') || '단가'}</p>
                      <p className="text-sm font-bold text-amber-700">{getMenuPrice(optionPickerMenu).toLocaleString()} ฿</p>
                    </div>
                    <p className="text-xs text-muted-foreground text-right">
                      {first
                        ? (t('posBanbanSecondHalf') || '2번째 맛')
                        : (t('posBanbanFirstHalf') || '1번째 맛')}
                    </p>
                  </div>
                  {first && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
                      <p className="font-semibold text-emerald-700">{t('posBanbanFirstSelected') || '1번째 선택'}</p>
                      <p className="mt-0.5 text-emerald-900 break-words">{first.name}</p>
                    </div>
                  )}
                  {list.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t('posBanbanNoChicken') || '치킨 메뉴가 없습니다.'}</p>
                  ) : (
                    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                      {list.map((menu) => {
                        const banDesc = showMenuDescriptions
                          ? resolvePosMenuDescriptionForChannel(menu, descriptionChannel)
                          : ''
                        return (
                        <button
                          key={menu.id}
                          type="button"
                          disabled={!!first && first.id === menu.id}
                          onClick={() => {
                            fireMenuAction(() => {
                              if (first) {
                                addBanban(optionPickerMenu, first, menu)
                              } else {
                                setOptionPickerBanbanFirst(menu)
                              }
                            })
                          }}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition",
                            first?.id === menu.id
                              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                              : "border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50"
                          )}
                        >
                          <span className="min-w-0 flex-1 text-left break-words">
                            <span className="block font-medium text-slate-800">{menu.name}</span>
                            {banDesc ? (
                              <span className="mt-0.5 block line-clamp-2 text-[11px] text-muted-foreground" title={banDesc}>
                                {banDesc}
                              </span>
                            ) : null}
                          </span>
                          {first?.id === menu.id ? (
                            <span className="rounded bg-slate-200 px-2 py-1 text-[11px] shrink-0">
                              {t('posSelected')}
                            </span>
                          ) : (
                            <span className="rounded bg-emerald-100 px-2 py-1 text-[11px] text-emerald-700 shrink-0 whitespace-nowrap">
                              {first ? (t('posSelect') || '선택') : (t('posBanbanFirstHalf') || '1번째 맛')}
                            </span>
                          )}
                        </button>
                        )
                      })}
                    </div>
                  )}
                  {first && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => setOptionPickerBanbanFirst(null)}
                    >
                      ← {t('posBack') || '이전'}
                    </Button>
                  )}
                </div>
              )
            }
            const opts = optionsByMenuId[optionPickerMenu.id] || []
            const isChickenBase =
              (optionPickerMenu.categoryMain ?? '') === 'Chicken' ||
              optionPickerMenu.code?.trim().toLowerCase().startsWith('c')
            const groupConfigMap = new Map(
              (optionPickerMenu.optionSelectionConfig || [])
                .map((cfg) => [String(cfg?.key ?? '').trim(), cfg] as const)
                .filter(([k]) => !!k)
            )
            const stepAudience = resolveStepAudienceFromOrderType(orderType)
            const fallbackGroups = inferOptionSelectionGroupsFromOptions(opts, optionPickerMenu.code)
            const configuredGroups =
              (optionPickerMenu.optionSelectionGroups || []).length > 0
                ? optionPickerMenu.optionSelectionGroups || []
                : fallbackGroups
            const groups = filterOptionSelectionGroupsForAudience(
              configuredGroups,
              groupConfigMap,
              stepAudience
            )
            const visibleGroupKeys = new Set(groups)
            const optsFilteredByGroup = filterPosOptionsForVisibleGroups(opts, visibleGroupKeys)
            const optsToShow = isChickenBase
              ? optsFilteredByGroup.filter((o) => !isChickenDefaultOption(o.name))
              : optsFilteredByGroup
            const optsWithSteps = opts.filter(
              (o) =>
                o.optionType === 'substitution' &&
                o.optionStepValues &&
                Object.keys(o.optionStepValues).length > 0
            )
            const optsWithStepsToShow = isChickenBase
              ? optsWithSteps.filter((o) => !isChickenDefaultOption(o.name))
              : optsWithSteps
            const useFlatBarBqList = shouldUseFlatBarBqChickenOptionPicker({
              menu: optionPickerMenu,
              options: opts,
            })
            const useFlatChickenMList =
              isChickenBase &&
              shouldUseFlatChickenMOptionPicker({
                menuCode: optionPickerMenu.code,
                groups,
                options: opts,
                optionsWithSteps: optsWithStepsToShow,
              })
            const useMultiStep =
              groups.length > 0 &&
              optsWithStepsToShow.length > 0 &&
              !useFlatBarBqList &&
              !useFlatChickenMList
            const flatChickenMOpts = useFlatChickenMList
              ? filterFlatChickenMListOptions(
                  optsToShow.filter((o) => o.optionType === 'substitution')
                )
              : optsToShow
            const defaultBtn = isChickenBase && (
              <button
                type="button"
                onClick={() => fireMenuAction(() => { void addWithOption(optionPickerMenu, null, POS_CHICKEN_DEFAULT_OPTION_DISPLAY) })}
                className="mb-3 flex w-full justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-left transition hover:border-amber-400 hover:bg-amber-100"
              >
                <span className="font-medium text-slate-800">{t('posOptionDefault') || '기본 (S Boneless)'}</span>
                <span className="font-bold text-amber-600">{getMenuPrice(optionPickerMenu).toLocaleString()} ฿</span>
              </button>
            )
            if (useMultiStep) {
              const groupKey = groups[optionPickerStep]
              const groupCfg = groupConfigMap.get(groupKey)
              const groupRequired = groupCfg?.required !== false
              const values = collectPosOptionPickerStepValues({
                groupKey,
                groups,
                menuCode: optionPickerMenu.code,
                options: opts,
                optionsWithSteps: optsWithStepsToShow,
                isChickenMenu: isChickenBase,
              })
              // 전매장 데이터 이슈(옵션 단계 키와 option_step_values 불일치) 시
              // 다단계 값 버튼이 0개가 되어 모달이 빈 화면처럼 보일 수 있다.
              // 이 경우 단일 옵션 목록으로 폴백해 주문이 막히지 않게 한다.
              if (values.length === 0) {
                return (
                  <div className="flex flex-col gap-2 py-2">
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {t('posOptionStepMismatchFallback') || '옵션 단계 설정이 맞지 않아 일반 옵션 목록으로 표시합니다.'}
                    </p>
                    {defaultBtn}
                    {(useFlatChickenMList ? flatChickenMOpts : optsToShow).length > 0 ? (
                      (useFlatChickenMList ? flatChickenMOpts : optsToShow).map((opt) => {
                        const optDesc = showMenuDescriptions
                          ? resolvePosMenuOptionDescriptionForChannel(opt, descriptionChannel)
                          : ''
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => fireMenuAction(() => { void addWithOption(optionPickerMenu, opt) })}
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
                              {(getMenuPrice(optionPickerMenu) + getOptionModifier(opt)).toLocaleString()} ฿
                            </span>
                          </button>
                        )
                      })
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => fireMenuAction(() => { void addWithOption(optionPickerMenu, null) })}
                      >
                        {t('posAddWithoutOption') || '옵션 없이 담기'}
                      </Button>
                    )}
                  </div>
                )
              }
              const handleStepSelect = (value: string) => {
                const next = { ...optionPickerSelections, [groupKey]: value }
                setOptionPickerSelections(next)
                if (optionPickerStep >= groups.length - 1) {
                  const match = resolvePosOptionPickerMatch({
                    menuCode: optionPickerMenu.code,
                    groups,
                    selections: next,
                    optionsWithSteps: optsWithStepsToShow,
                    allOptions: opts,
                    groupConfigByKey: groupConfigMap,
                  })
                  if (match) addWithOption(optionPickerMenu, match)
                } else {
                  setOptionPickerStep((s) => s + 1)
                }
              }
              const groupLabels: Record<string, string> = {
                size: t('posOptionGroupSize') || '사이즈',
                part: t('posOptionGroupPart') || '부위',
                topping: t('posOptionGroupTopping') || '토핑',
                bone: t('posOptionGroupBone') || 'Bone / Boneless',
                type: t('posOptionGroupType') || '타입',
                set_main: t('posOptionGroupSetMain') || '세트 메인',
                side: t('posOptionGroupSide') || '사이드',
                drink: t('posOptionGroupDrink') || '음료',
                soup: t('posOptionGroupSoup') || '스프',
                rice: t('posOptionGroupRice') || '밥',
              }
              return (
                <div className="flex flex-col gap-3 py-2">
                  {defaultBtn}
                  <p className="text-xs text-muted-foreground">
                    {(String(groupCfg?.label ?? '').trim() || groupLabels[groupKey] || groupKey) +
                      (groupRequired ? '' : ` (${t('optional') || '선택'})`)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {values.map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => fireMenuAction(() => handleStepSelect(val))}
                        className="rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:border-emerald-400 hover:bg-emerald-50 text-slate-800"
                      >
                        {translateChickenPartLabel(val)}
                      </button>
                    ))}
                  </div>
                  {!groupRequired && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => fireMenuAction(() => {
                        const next = { ...optionPickerSelections }
                        delete next[groupKey]
                        setOptionPickerSelections(next)
                        if (optionPickerStep >= groups.length - 1) {
                          const match = resolvePosOptionPickerMatch({
                            menuCode: optionPickerMenu.code,
                            groups,
                            selections: next,
                            optionsWithSteps: optsWithStepsToShow,
                            allOptions: opts,
                            groupConfigByKey: groupConfigMap,
                          })
                          if (match) void addWithOption(optionPickerMenu, match)
                          else void addWithOption(optionPickerMenu, null)
                        } else {
                          setOptionPickerStep((s) => s + 1)
                        }
                      })}
                    >
                      {t('skip') || '건너뛰기'}
                    </Button>
                  )}
                  {optionPickerStep > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => setOptionPickerStep((s) => s - 1)}
                    >
                      ← {t('posBack') || '이전'}
                    </Button>
                  )}
                </div>
              )
            }
            return (
              <div className="flex flex-col gap-2 py-2">
                {defaultBtn}
                {(useFlatChickenMList ? flatChickenMOpts : optsToShow).map((opt) => {
                  const optDesc = showMenuDescriptions
                    ? resolvePosMenuOptionDescriptionForChannel(opt, descriptionChannel)
                    : ''
                  return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => fireMenuAction(() => { void addWithOption(optionPickerMenu, opt) })}
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
                      {(getMenuPrice(optionPickerMenu) + getOptionModifier(opt)).toLocaleString()} ฿
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
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setPromoChoiceDialog(null)}>
                  취소
                </Button>
                <Button type="button" onClick={() => void confirmPromoChoice()}>
                  담기
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={menuEditOpen} onOpenChange={setMenuEditOpen}>
        <DialogContent className="max-w-5xl p-0">
          <DialogHeader>
            <DialogTitle className="border-b px-6 py-4 text-sky-600">{t('itemsBtnEdit') || 'POS 메뉴 관리'}</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6">
            <div className="mb-4 mt-2 flex items-end gap-1 border-b">
              <button
                type="button"
                className={cn(
                  'rounded-t-md border border-b-0 px-4 py-2 text-sm font-medium',
                  menuEditTab === 'menu' ? 'bg-sky-500 text-white border-sky-500' : 'bg-white text-sky-600 border-sky-200'
                )}
                onClick={() => setMenuEditTab('menu')}
              >
                {t('posMenuEditTabMenu') || '메뉴 정보'}
              </button>
              <button
                type="button"
                className={cn(
                  'rounded-t-md border border-b-0 px-4 py-2 text-sm font-medium',
                  menuEditTab === 'general' ? 'bg-sky-500 text-white border-sky-500' : 'bg-white text-sky-600 border-sky-200'
                )}
                onClick={() => setMenuEditTab('general')}
              >
                {t('posMenuEditTabGeneral') || '일반 메뉴'}
              </button>
              <button
                type="button"
                className={cn(
                  'rounded-t-md border border-b-0 px-4 py-2 text-sm font-medium',
                  menuEditTab === 'item' ? 'bg-sky-500 text-white border-sky-500' : 'bg-white text-sky-600 border-sky-200'
                )}
                onClick={() => setMenuEditTab('item')}
              >
                {t('posMenuEditTabItem') || '아이템'}
              </button>
            </div>

            {menuEditTab === 'menu' ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                    <label className="text-sm font-semibold text-rose-600">{t('posMenuCategoryMain') || '대분류'}</label>
                    <Select value={menuEditForm.categoryMain || '__empty__'} onValueChange={(v) => setMenuEditForm((p) => ({ ...p, categoryMain: v === '__empty__' ? '' : v, category: '' }))}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder={t('posMenuCategoryMainSelect') || '선택'} />
                      </SelectTrigger>
                      <SelectContent>
                        {mainCategories.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                    <label className="text-sm font-semibold text-rose-600">{t('posMenuCategory') || '소분류(주방명칭)'}</label>
                    <Select value={menuEditForm.category || '__empty__'} onValueChange={(v) => setMenuEditForm((p) => ({ ...p, category: v === '__empty__' ? '' : v }))}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder={t('posMenuCategoryMainSelect') || '선택'} />
                      </SelectTrigger>
                      <SelectContent>
                        {categoriesForEditForm.map((c) => (
                          <SelectItem key={c} value={c}>{translatePosMenuCategoryLabel(c, t)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                    <label className="text-sm font-semibold text-rose-600">{t('posMenuName') || '메뉴명'}</label>
                    <Input className="h-9" value={menuEditForm.name} onChange={(e) => setMenuEditForm((p) => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                    <label className="text-sm font-semibold">{t('posMenuCode') || '바코드'}</label>
                    <Input className="h-9" value={menuEditForm.code} onChange={(e) => setMenuEditForm((p) => ({ ...p, code: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                    <label className="text-sm font-semibold text-rose-600">{t('posMenuPriceHall') || '가격'}</label>
                    <Input type="number" className="h-9 text-right" value={menuEditForm.price} onChange={(e) => setMenuEditForm((p) => ({ ...p, price: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                    <label className="text-sm font-semibold text-rose-600">{t('posMenuPriceDelivery') || '배달 가격'}</label>
                    <Input className="h-9 text-right" value={menuEditForm.priceDelivery} onChange={(e) => setMenuEditForm((p) => ({ ...p, priceDelivery: e.target.value }))} />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                    <label className="text-sm font-semibold">{t('posMenuEditBtnColor') || '버튼 컬러'}</label>
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-7 w-7 rounded border bg-white" />
                      <span className="inline-block h-7 w-7 rounded border bg-slate-300" />
                      <span className="inline-block h-7 w-7 rounded border bg-sky-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                    <label className="text-sm font-semibold">{t('posMenuEditFontColor') || '폰트 컬러'}</label>
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-7 w-7 rounded border bg-black" />
                      <span className="inline-block h-7 w-7 rounded border bg-white" />
                    </div>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] items-start gap-2">
                    <label className="pt-2 text-sm font-semibold">{t('posMenuImage') || '기본 이미지'}</label>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded border bg-slate-100">
                          {menuEditForm.imageUrl.trim() ? (
                            <PosMenuFillImage
                              src={menuEditForm.imageUrl}
                              alt="menu-preview"
                              variant="preview"
                              className="object-contain"
                              previewErrorLabel={t('posMenuImageLoadFailed') || '불러올 수 없음'}
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">{t('posMenuImagePreview') || '미리보기'}</div>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col gap-1.5">
                          <input
                            ref={imageInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/gif,image/webp"
                            className="hidden"
                            onChange={handleImageUpload}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            disabled={imageUploading}
                            onClick={() => imageInputRef.current?.click()}
                          >
                            <Upload className="h-3.5 w-3.5" />
                            {imageUploading ? (t('loading') || '업로드 중...') : (t('posMenuImageUpload') || '파일 업로드')}
                          </Button>
                          <Input className="h-9 text-xs" placeholder={t('posMenuImageUrlPlaceholder') || '또는 이미지 URL 입력'} value={menuEditForm.imageUrl} onChange={(e) => setMenuEditForm((p) => ({ ...p, imageUrl: e.target.value }))} />
                          <p className="text-[11px] text-muted-foreground">
                            {t('posMenuImageUploadHint') || '다른 메뉴에서 업로드한 URL은 저장이 거부될 수 있습니다. 이 메뉴에서 다시 업로드해 주세요.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                    <label className="text-sm font-semibold">{t('posMenuCookingTimeMin') || '조리 시간'}</label>
                    <Input type="number" className="h-9" value={menuEditForm.cookingTimeMin} onChange={(e) => setMenuEditForm((p) => ({ ...p, cookingTimeMin: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                    <label className="text-sm font-semibold">{t('posMenuEditTopping') || '토핑 메뉴'}</label>
                    <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">{t('posMenuEditToppingHint') || '탭: 아이템에서 설정'}</div>
                  </div>
                </div>
              </div>
            ) : menuEditTab === 'general' ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                    <label className="text-sm font-semibold text-rose-600">{t('posMenuEditStockControl') || '재고관리 여부'}</label>
                    <div className="grid grid-cols-2 overflow-hidden rounded-md border">
                      <button
                        type="button"
                        className={cn('h-9 text-sm', menuEditForm.isActive ? 'bg-sky-500 text-white' : 'bg-white')}
                        onClick={() => setMenuEditForm((p) => ({ ...p, isActive: true }))}
                      >
                        {t('yes') || '예'}
                      </button>
                      <button
                        type="button"
                        className={cn('h-9 text-sm border-l', !menuEditForm.isActive ? 'bg-sky-500 text-white' : 'bg-white')}
                        onClick={() => setMenuEditForm((p) => ({ ...p, isActive: false }))}
                      >
                        {t('no') || '아니요'}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                    <label className="text-sm font-semibold">{t('posMenuEditVatLabel') || '세금 포함'}</label>
                    <div className="grid grid-cols-2 overflow-hidden rounded-md border">
                      <button
                        type="button"
                        className={cn('h-9 text-sm', menuEditForm.vatIncluded ? 'bg-sky-500 text-white' : 'bg-white')}
                        onClick={() => setMenuEditForm((p) => ({ ...p, vatIncluded: true }))}
                      >
                        {t('posMenuEditVatIncluded') || '포함'}
                      </button>
                      <button
                        type="button"
                        className={cn('h-9 text-sm border-l', !menuEditForm.vatIncluded ? 'bg-sky-500 text-white' : 'bg-white')}
                        onClick={() => setMenuEditForm((p) => ({ ...p, vatIncluded: false }))}
                      >
                        {t('posMenuEditVatExcluded') || '미포함'}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                    <label className="text-sm font-semibold">{t('posMenuKitchenPrinter') || '주방 프린터'}</label>
                    <select
                      className="h-9 w-full rounded-md border px-2 text-sm bg-background"
                      value={menuEditForm.kitchenPrinter}
                      onChange={(e) =>
                        setMenuEditForm((p) => ({
                          ...p,
                          kitchenPrinter: e.target.value as 'none' | '0' | '1' | '2' | '3',
                        }))
                      }
                    >
                      <option value="none">{t('posMenuKitchenPrinterAuto') || '자동(카테고리 기준)'}</option>
                      <option value="0">{t('posKitchenSkipPrint') || '주방 미인쇄'}</option>
                      <option value="1">{t('posKitchen1') || '주방1'}</option>
                      <option value="2">{t('posKitchen2') || '주방2'}</option>
                      <option value="3">{t('posKitchen3') || '주방3'}</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                    <label className="text-sm font-semibold">{t('posMenuCookingTimeMin') || '조리 시간'}</label>
                    <Input type="number" className="h-9" value={menuEditForm.cookingTimeMin} onChange={(e) => setMenuEditForm((p) => ({ ...p, cookingTimeMin: e.target.value }))} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                    <label className="text-sm font-semibold">{t('posMenuBanban') || '반반 메뉴'}</label>
                    <div className="grid grid-cols-2 overflow-hidden rounded-md border">
                      <button
                        type="button"
                        className={cn('h-9 text-sm', menuEditForm.isBanban ? 'bg-sky-500 text-white' : 'bg-white')}
                        onClick={() => setMenuEditForm((p) => ({ ...p, isBanban: true }))}
                      >
                        {t('posMenuEditUse') || '사용'}
                      </button>
                      <button
                        type="button"
                        className={cn('h-9 text-sm border-l', !menuEditForm.isBanban ? 'bg-sky-500 text-white' : 'bg-white')}
                        onClick={() => setMenuEditForm((p) => ({ ...p, isBanban: false }))}
                      >
                        {t('posMenuEditNoUse') || '미사용'}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-[120px_1fr] items-start gap-2">
                    <label className="pt-2 text-sm font-semibold">{t('posMenuEditOptionStep') || '옵션 단계'}</label>
                    <div className="space-y-2">
                      <Input
                        className="h-9"
                        placeholder={t('posMenuEditOptionStepPlaceholder') || '예: size, bone, topping'}
                        value={menuEditForm.optionSelectionGroupsText}
                        onChange={(e) => setMenuEditForm((p) => ({ ...p, optionSelectionGroupsText: e.target.value }))}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={setTemplateApplying}
                          onClick={() => void applySetChoiceTemplate()}
                        >
                          {setTemplateApplying ? t('posMenuEditSetTemplateApplying') : t('posMenuEditSetTemplateButton')}
                        </Button>
                        <span className="text-[11px] text-muted-foreground">
                          {t('posMenuEditSetTemplateHint')}
                        </span>
                      </div>
                      {selectedOptionGroups.length > 0 && (
                        <div className="space-y-2 rounded-md border bg-muted/20 p-2">
                          {selectedOptionGroups.map((group, idx) => (
                            <div
                              key={`${group}-${idx}`}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', String(idx))
                              }}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                const from = Number(e.dataTransfer.getData('text/plain'))
                                if (Number.isFinite(from)) moveOptionGroup(from, idx)
                              }}
                              className="flex items-center justify-between rounded border bg-white px-2 py-1.5 text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="font-medium">{group}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  className="rounded border p-1 hover:bg-muted disabled:opacity-40"
                                  disabled={idx === 0}
                                  onClick={() => moveOptionGroup(idx, idx - 1)}
                                  title={t('posMenuEditMoveUp') || '위로'}
                                >
                                  <ArrowUp className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  className="rounded border p-1 hover:bg-muted disabled:opacity-40"
                                  disabled={idx === selectedOptionGroups.length - 1}
                                  onClick={() => moveOptionGroup(idx, idx + 1)}
                                  title={t('posMenuEditMoveDown') || '아래로'}
                                >
                                  <ArrowDown className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  className="rounded border px-1.5 py-0.5 text-[11px] hover:bg-rose-50 hover:text-rose-600"
                                  onClick={() => setSelectedOptionGroups(selectedOptionGroups.filter((_, i) => i !== idx))}
                                  title={t('delete') || '삭제'}
                                >
                                  삭제
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {['size', 'part', 'topping', 'bone', 'type'].map((key) => {
                          const on = selectedOptionGroups.includes(key)
                          return (
                            <button
                              key={key}
                              type="button"
                              className={cn('rounded border px-2 py-1 text-xs', on ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-200')}
                              onClick={() => {
                                const next = on
                                  ? selectedOptionGroups.filter((v) => v !== key)
                                  : [...selectedOptionGroups, key]
                                setSelectedOptionGroups(next)
                              }}
                            >
                              {key}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => setMenuEditOpen(false)}>
                {t('cancel') || '취소'}
              </Button>
              <Button className="bg-emerald-500 hover:bg-emerald-600" onClick={saveMenuEdit} disabled={menuEditSaving}>
                {menuEditSaving ? (t('saving') || '저장중') : (t('save') || '저장')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
