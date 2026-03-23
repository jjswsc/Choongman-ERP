'use client'
import { appAlert } from "@/lib/app-message"

import * as React from 'react'
import Image from 'next/image'
import {
  getPosMenus,
  getPosMenuCategories,
  getPosMenuOptions,
  getPosPromosWithItems,
  getPosMenuScreenConfig,
  savePosMenuScreenConfig,
  savePosMenu,
  uploadPosMenuImage,
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
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { ArrowDown, ArrowLeft, ArrowUp, GripVertical, Pencil, Save, Upload } from 'lucide-react'
import {
  DEFAULT_POS_MENU_SCREEN_CONFIG,
  normalizePosMenuScreenConfig,
  type PosMenuScreenConfig,
} from '@/lib/pos-menu-screen-config'
import { getBanbanFlavorMenuList, isBanbanMenu } from '@/lib/pos-banban-utils'
import { PROMOTION_MAIN_CATEGORY } from '@/lib/pos-promo-constants'
import { isPromoVisibleInContext } from '@/lib/pos-promo-visibility'
import { getPosBusinessDateStr } from '@/lib/pos-business-day'
import type { CartPanelAddItemPayload } from '@/components/pos/cart-panel'

function isChickenDefaultOption(name: string | undefined): boolean {
  if (!name?.trim()) return false
  const n = name.trim()
  return /^S\s*[-]?\s*순살\s*$/i.test(n) || n === 'S 순살' || n === 'S - 순살' || n === 'S-순살'
}

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
  /** 터치 UI 밀도 (모바일: large) */
  touchMode?: 'default' | 'large'
  className?: string
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
  className,
}: PosTerminalMenuScreenProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [menus, setMenus] = React.useState<PosMenu[]>([])
  const [promos, setPromos] = React.useState<PosPromoWithItems[]>([])
  const [mainCategories, setMainCategories] = React.useState<string[]>([])
  const [selectedMainCategory, setSelectedMainCategory] = React.useState('')
  const [selectedCategory, setSelectedCategory] = React.useState('')
  const [allOptions, setAllOptions] = React.useState<PosMenuOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [optionPickerMenu, setOptionPickerMenu] = React.useState<PosMenu | null>(null)
  const [optionPickerStep, setOptionPickerStep] = React.useState(0)
  const [optionPickerSelections, setOptionPickerSelections] = React.useState<Record<string, string>>({})
  const [optionPickerBanbanFirst, setOptionPickerBanbanFirst] = React.useState<PosMenu | null>(null)
  const [searchKeyword, setSearchKeyword] = React.useState('')
  const [listPage, setListPage] = React.useState(0)
  const [screenConfig, setScreenConfig] = React.useState<PosMenuScreenConfig>(DEFAULT_POS_MENU_SCREEN_CONFIG)
  const [configLoading, setConfigLoading] = React.useState(true)
  const [configSaving, setConfigSaving] = React.useState(false)
  const [configMessage, setConfigMessage] = React.useState<string>('')
  const isAdminMode = mode === 'admin-config'
  const [menuEditOpen, setMenuEditOpen] = React.useState(false)
  const [menuEditSaving, setMenuEditSaving] = React.useState(false)
  const [menuEditTargetId, setMenuEditTargetId] = React.useState<string | null>(null)
  const [menuEditTab, setMenuEditTab] = React.useState<'menu' | 'general' | 'item'>('menu')
  const [imageUploading, setImageUploading] = React.useState(false)
  const menuListRef = React.useRef<HTMLDivElement | null>(null)
  const categoryPanelRef = React.useRef<HTMLElement | null>(null)
  const menuGridRef = React.useRef<HTMLDivElement | null>(null)
  const imageInputRef = React.useRef<HTMLInputElement>(null)
  const debugLog = React.useCallback((runId: string, hypothesisId: string, location: string, message: string, data: Record<string, unknown>) => {
    // #region agent log
    fetch('http://127.0.0.1:7383/ingest/f85ce2e6-3f30-4dec-a500-2fe4222a00ab',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0d4853'},body:JSON.stringify({sessionId:'0d4853',runId,hypothesisId,location,message,data,timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }, [])
  const [menuEditForm, setMenuEditForm] = React.useState<{
    code: string
    name: string
    categoryMain: string
    category: string
    price: string
    priceDelivery: string
    imageUrl: string
    kitchenPrinter: 'none' | '1' | '2'
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
    const [list, catRes, opts, promoList] = await Promise.all([
      getPosMenus(),
      getPosMenuCategories(),
      getPosMenuOptions(),
      getPosPromosWithItems(),
    ])
    setMenus(list || [])
    setPromos(promoList || [])
    setAllOptions(opts || [])
    const mains = [...new Set([...(catRes.mainCategories ?? []), PROMOTION_MAIN_CATEGORY])].sort()
    setMainCategories(mains)
    setSelectedMainCategory(mains[0] ?? '')
    setSelectedCategory('')
  }, [])

  React.useEffect(() => {
    setLoading(true)
    loadMenuData()
      .catch(() => {
        setMenus([])
        setPromos([])
        setAllOptions([])
      })
      .finally(() => setLoading(false))
  }, [loadMenuData])

  React.useEffect(() => {
    setConfigLoading(true)
    getPosMenuScreenConfig({ storeCode: storeCode || undefined })
      .then((cfg) => setScreenConfig(normalizePosMenuScreenConfig(cfg, storeCode || null)))
      .catch(() => setScreenConfig(normalizePosMenuScreenConfig(null, storeCode || null)))
      .finally(() => setConfigLoading(false))
  }, [storeCode])

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
  const tileFontPx = isAdminMode ? screenConfig.menuTileFontSize : 13
  const categoriesForSelectedMain = React.useMemo(() => {
    if (!selectedMainCategory) return [] as string[]
    const fromMain = menus
      .filter((m) => (m.categoryMain ?? '') === selectedMainCategory)
      .map((m) => m.category)
      .filter(Boolean)
    const set = new Set(fromMain)
    const arr = Array.from(set).sort()
    if (arr.length > 0) return arr
    const fromCategory = menus.filter((m) => (m.category ?? '') === selectedMainCategory)
    if (fromCategory.length > 0) return [selectedMainCategory]
    return []
  }, [menus, selectedMainCategory])

  React.useEffect(() => {
    if (categoriesForSelectedMain.length > 0 && !categoriesForSelectedMain.includes(selectedCategory)) {
      setSelectedCategory(categoriesForSelectedMain[0])
    }
  }, [categoriesForSelectedMain, selectedCategory])

  React.useEffect(() => {
    setListPage(0)
  }, [selectedMainCategory, selectedCategory, searchKeyword, screenConfig.menuListPageSize])

  React.useEffect(() => {
    debugLog('pre-fix', 'H4', 'pos-terminal-menu-screen.tsx:state', 'menu screen state snapshot', {
      mode,
      selectedTableName,
      selectedMainCategory,
      selectedCategory,
      filteredMenusLen: filteredMenus.length,
      filteredPromosLen: filteredPromos.length,
      searchKeyword,
      href: typeof window !== 'undefined' ? window.location.href : '',
    })
  }, [debugLog, mode, selectedTableName, selectedMainCategory, selectedCategory, menus.length, promos.length, searchKeyword])

  React.useLayoutEffect(() => {
    const panelRect = categoryPanelRef.current?.getBoundingClientRect()
    const sectionRect = menuListRef.current?.getBoundingClientRect()
    const gridRect = menuGridRef.current?.getBoundingClientRect()
    const firstCard = menuGridRef.current?.querySelector('[data-menu-card]') as HTMLElement | null
    const firstCardRect = firstCard?.getBoundingClientRect()
    const scrollTop = menuListRef.current?.scrollTop ?? 0
    const scrollHeight = menuListRef.current?.scrollHeight ?? 0
    const clientHeight = menuListRef.current?.clientHeight ?? 0
    debugLog('pre-fix', 'H1,H2,H3', 'pos-terminal-menu-screen.tsx:layout', 'layout measurements', {
      selectedMainCategory,
      selectedCategory,
      filteredMenusLen: filteredMenus.length,
      filteredPromosLen: filteredPromos.length,
      scrollTop,
      scrollHeight,
      clientHeight,
      sectionTop: sectionRect?.top ?? null,
      sectionBottom: sectionRect?.bottom ?? null,
      panelBottom: panelRect?.bottom ?? null,
      gridTop: gridRect?.top ?? null,
      gapSectionToGrid: sectionRect && gridRect ? Math.round(gridRect.top - sectionRect.top) : null,
      gapCategoryToGrid: panelRect && gridRect ? Math.round(gridRect.top - panelRect.bottom) : null,
      firstCardTop: firstCardRect?.top ?? null,
      gapGridToFirstCard: firstCardRect && gridRect ? Math.round(firstCardRect.top - gridRect.top) : null,
      firstCardExists: Boolean(firstCard),
      gridChildCount: menuGridRef.current?.children.length ?? 0,
    })
  }, [debugLog, selectedMainCategory, selectedCategory, menus.length, promos.length])

  React.useLayoutEffect(() => {
    const sectionEl = menuListRef.current
    const gridEl = menuGridRef.current
    if (!sectionEl || !gridEl) return

    const logComputed = (phase: string) => {
      const sectionStyle = window.getComputedStyle(sectionEl)
      const gridStyle = window.getComputedStyle(gridEl)
      const firstChild = gridEl.querySelector('[data-menu-card]') as HTMLElement | null
      const firstChildStyle = firstChild ? window.getComputedStyle(firstChild) : null
      debugLog('pre-fix', 'H5,H6,H7,H8', 'pos-terminal-menu-screen.tsx:computed', `computed styles (${phase})`, {
        selectedMainCategory,
        selectedCategory,
        sectionPaddingTop: sectionStyle.paddingTop,
        sectionDisplay: sectionStyle.display,
        sectionOverflowY: sectionStyle.overflowY,
        gridAlignContent: gridStyle.alignContent,
        gridAutoRows: gridStyle.gridAutoRows,
        gridTemplateRows: gridStyle.gridTemplateRows,
        gridRowGap: gridStyle.rowGap,
        firstChildDisplay: firstChildStyle?.display ?? null,
        firstChildVisibility: firstChildStyle?.visibility ?? null,
        firstChildOpacity: firstChildStyle?.opacity ?? null,
      })
    }

    logComputed('layout')
    const raf1 = window.requestAnimationFrame(() => {
      logComputed('raf1')
      const raf2 = window.requestAnimationFrame(() => logComputed('raf2'))
      // #region agent log
      fetch('http://127.0.0.1:7383/ingest/f85ce2e6-3f30-4dec-a500-2fe4222a00ab',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0d4853'},body:JSON.stringify({sessionId:'0d4853',runId:'pre-fix',hypothesisId:'H8',location:'pos-terminal-menu-screen.tsx:raf-chain',message:'raf chain scheduled',data:{selectedMainCategory,selectedCategory},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      ;(sectionEl as HTMLElement & { __raf2?: number }).__raf2 = raf2
    })
    ;(sectionEl as HTMLElement & { __raf1?: number }).__raf1 = raf1

    return () => {
      const s = sectionEl as HTMLElement & { __raf1?: number; __raf2?: number }
      if (s.__raf1) window.cancelAnimationFrame(s.__raf1)
      if (s.__raf2) window.cancelAnimationFrame(s.__raf2)
    }
  }, [debugLog, selectedMainCategory, selectedCategory, menus.length, promos.length])

  const filteredMenus = React.useMemo(() => {
    const active = menus.filter((m) => m.isActive)
    const notSoldOut = active.filter((m) => !m.soldOutDate || m.soldOutDate !== todayStr)
    if (!selectedMainCategory || !selectedCategory) return []
    const byMainAndSub = notSoldOut.filter(
      (m) =>
        (m.categoryMain ?? '') === selectedMainCategory && m.category === selectedCategory
    )
    if (byMainAndSub.length > 0) return byMainAndSub
    return notSoldOut.filter((m) => (m.category ?? '') === selectedCategory)
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

  const filteredPromos = React.useMemo(() => {
    const ot = orderType === 'dine-in' ? 'dine_in' : orderType === 'delivery' ? 'delivery' : 'takeout'
    return promos.filter((p) => {
      if (!p.isActive) return false
      if (linkedPromoIds.has(p.id)) return false
      const cm = (p.categoryMain || PROMOTION_MAIN_CATEGORY).trim()
      const sub = (p.category || '').trim()
      if (selectedMainCategory && cm !== selectedMainCategory) return false
      if (selectedCategory && sub !== selectedCategory) return false
      return isPromoVisibleInContext(p, {
        businessDateYmd,
        orderType: ot,
        deliveryAppCode: deliveryAppCode || null,
      })
    })
  }, [
    promos,
    selectedCategory,
    selectedMainCategory,
    linkedPromoIds,
    businessDateYmd,
    orderType,
    deliveryAppCode,
  ])

  React.useEffect(() => {
    const sectionEl = menuListRef.current
    const gridEl = menuGridRef.current
    if (!sectionEl || !gridEl) return

    const snapshot = (phase: string) => {
      const panelRect = categoryPanelRef.current?.getBoundingClientRect()
      const sectionRect = sectionEl.getBoundingClientRect()
      const gridRect = gridEl.getBoundingClientRect()
      const cards = Array.from(gridEl.querySelectorAll('[data-menu-card]')) as HTMLElement[]
      const firstThree = cards.slice(0, 3).map((el, idx) => {
        const r = el.getBoundingClientRect()
        return {
          idx,
          top: Math.round(r.top),
          height: Math.round(r.height),
          display: window.getComputedStyle(el).display,
          visibility: window.getComputedStyle(el).visibility,
          opacity: window.getComputedStyle(el).opacity,
        }
      })
      debugLog('pre-fix', 'H9,H10', 'pos-terminal-menu-screen.tsx:observer', `observer snapshot (${phase})`, {
        selectedMainCategory,
        selectedCategory,
        filteredMenusLen: filteredMenus.length,
        filteredPromosLen: filteredPromos.length,
        sectionTop: Math.round(sectionRect.top),
        sectionBottom: Math.round(sectionRect.bottom),
        panelBottom: panelRect ? Math.round(panelRect.bottom) : null,
        gridTop: Math.round(gridRect.top),
        gapCategoryToGrid: panelRect ? Math.round(gridRect.top - panelRect.bottom) : null,
        gridChildCount: cards.length,
        firstThree,
      })
    }

    snapshot('effect-start')

    const resizeObserver = new ResizeObserver(() => snapshot('resize'))
    resizeObserver.observe(sectionEl)
    resizeObserver.observe(gridEl)

    const mutationObserver = new MutationObserver(() => snapshot('mutation'))
    mutationObserver.observe(gridEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] })

    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [debugLog, selectedMainCategory, selectedCategory, filteredMenus.length, filteredPromos.length])

  const getMenuPrice = (menu: PosMenu) =>
    orderType === 'delivery' && menu.priceDelivery != null ? menu.priceDelivery : menu.price
  const getOptionModifier = (opt: PosMenuOption) => {
    if (orderType === 'delivery' && opt.priceModifierDelivery != null) return opt.priceModifierDelivery
    if (orderType === 'takeout' && opt.priceModifierPackaging != null) return opt.priceModifierPackaging
    return opt.priceModifier ?? 0
  }
  const getPromoPrice = (p: PosPromoWithItems) =>
    orderType === 'delivery' && p.priceDelivery != null ? p.priceDelivery : (p.price ?? 0)

  /** 반반 맛 선택 목록 (열린 메뉴 기준, 후보 0개일 때 대분류·코드 기반 폴백) */
  const banbanFlavorList = React.useMemo(() => {
    if (!optionPickerMenu || !isBanbanMenu(optionPickerMenu)) return []
    return getBanbanFlavorMenuList(menus, optionPickerMenu, todayStr)
  }, [menus, optionPickerMenu, todayStr])

  const addWithOption = (menu: PosMenu, opt: PosMenuOption | null, defaultOptionName?: string) => {
    const mirrorPid = menu.promoId?.trim()
    if (mirrorPid && !opt) {
      const pr = promos.find((x) => x.id === mirrorPid)
      const ot = orderType === 'dine-in' ? 'dine_in' : orderType === 'delivery' ? 'delivery' : 'takeout'
      if (
        pr &&
        isPromoVisibleInContext(pr, {
          businessDateYmd,
          orderType: ot,
          deliveryAppCode: deliveryAppCode || null,
        })
      ) {
        addPromo(pr)
        return
      }
    }
    const id = opt ? `${menu.id}-${opt.id}` : menu.id
    const name = opt
      ? `${menu.name} (${opt.name})`
      : defaultOptionName
        ? `${menu.name} (${defaultOptionName})`
        : menu.name
    const price = getMenuPrice(menu) + (opt ? getOptionModifier(opt) : 0)
    onAddItem?.({ id, name, price })
    setOptionPickerMenu(null)
    setOptionPickerStep(0)
    setOptionPickerSelections({})
  }

  const addBanban = (banbanMenu: PosMenu, menu1: PosMenu, menu2: PosMenu) => {
    const ids = [menu1.id, menu2.id].sort()
    const id = `banban-${ids.join('-')}`
    const name = `${banbanMenu.name} (${menu1.name} / ${menu2.name})`
    const price = getMenuPrice(banbanMenu)
    onAddItem?.({ id, name, price })
    setOptionPickerMenu(null)
    setOptionPickerBanbanFirst(null)
  }

  const addPromo = (p: PosPromoWithItems) => {
    onAddItem?.({
      id: `promo-${p.id}`,
      name: p.name,
      price: getPromoPrice(p),
      promoId: p.id,
      promoCode: p.code,
      promoItems: p.items || [],
    })
  }

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
    addWithOption(menu, null)
  }

  // 실제 담기 가능 여부는 콜백 존재로 판단 (모드 문자열 불일치로 클릭이 막히는 케이스 방지)
  const interactive = typeof onAddItem === 'function'
  const isExpandedMobileList = !isAdminMode && touchMode === 'large'
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
      const res = await savePosMenuScreenConfig({
        ...screenConfig,
        storeCode: storeCode || null,
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
      kitchenPrinter: menu.kitchenPrinter === 1 ? '1' : menu.kitchenPrinter === 2 ? '2' : 'none',
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
      const res = await savePosMenu({
        id: menuEditTargetId,
        code,
        name,
        categoryMain: menuEditForm.categoryMain.trim(),
        category: menuEditForm.category.trim(),
        price: Number(menuEditForm.price || 0),
        priceDelivery: menuEditForm.priceDelivery.trim() === '' ? null : Number(menuEditForm.priceDelivery),
        imageUrl: menuEditForm.imageUrl.trim(),
        vatIncluded: menuEditForm.vatIncluded,
        isActive: menuEditForm.isActive,
        kitchenPrinter: menuEditForm.kitchenPrinter === 'none' ? null : Number(menuEditForm.kitchenPrinter) as 1 | 2,
        cookingTimeMin: menuEditForm.cookingTimeMin.trim() === '' ? null : Number(menuEditForm.cookingTimeMin),
        optionSelectionGroups: optionSelectionGroups.length > 0 ? Array.from(new Set(optionSelectionGroups)) : [],
        isBanban: menuEditForm.isBanban,
      })
      if (!res?.success) {
        await appAlert(res?.message || (t('posSaveFail') || '저장 실패'))
        return
      }
      await loadMenuData()
      setMenuEditOpen(false)
    } catch (e) {
      await appAlert(String(e))
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
    const set = new Set(
      menus
        .filter((m) => (m.categoryMain ?? '') === menuEditForm.categoryMain)
        .map((m) => m.category)
        .filter(Boolean)
    )
    return Array.from(set).sort()
  }, [menus, menuEditForm.categoryMain])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageUploading(true)
    try {
      const res = await uploadPosMenuImage({ file })
      if (res?.success && res?.url) {
        setMenuEditForm((p) => ({ ...p, imageUrl: res.url! }))
      } else {
        await appAlert(res?.message || t('msg_upload_fail') || '업로드 실패')
      }
    } catch (err) {
      await appAlert(String(err))
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

  if (loading) {
    return (
      <div className={cn('flex h-full items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm', className)}>
        {t('posMenuLoading')}
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col rounded-lg border border-border bg-card overflow-hidden', isExpandedMobileList ? 'h-auto' : 'h-full', className)}>
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-muted/30 px-4 py-2">
        <Button variant="ghost" size="sm" className="gap-1.5 h-9" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          {backButtonLabel || t('posBackToTableSelect') || '테이블 선택'}
        </Button>
        <span className="text-sm font-medium text-muted-foreground">
          {t('posTableLabel')}: <span className="text-foreground font-semibold">{selectedTableName}</span>
        </span>
      </div>
      <div
        className={cn(
          isExpandedMobileList ? 'flex-none min-h-fit flex flex-col' : 'flex-1 min-h-0 flex flex-col',
          isAdminMode && 'min-[980px]:grid min-[980px]:grid-cols-[220px_1fr_320px] min-[980px]:grid-rows-[minmax(0,1fr)]'
        )}
      >
        <section
          ref={categoryPanelRef}
          className={cn(
            'bg-muted/20 px-3 py-3',
            isAdminMode ? 'min-[980px]:min-h-0 min-[980px]:overflow-hidden border-r' : 'flex-shrink-0 border-b px-2 py-1'
          )}
        >
          <p className={cn('font-semibold text-muted-foreground', isAdminMode ? 'mb-2 text-xs' : 'mb-0.5 text-[10px]')}>{t('posMainCategory') || '대분류'}</p>
          <div className={cn(isAdminMode ? 'grid gap-1.5' : 'flex gap-1 overflow-x-auto')}>
            {mainCategories.map((main) => (
              <button
                key={main}
                type="button"
                onClick={() => {
                  debugLog('pre-fix', 'H1', 'pos-terminal-menu-screen.tsx:onMainCategoryClick', 'main category clicked', {
                    nextMain: main,
                    prevMain: selectedMainCategory,
                    prevCategory: selectedCategory,
                    prevScrollTop: menuListRef.current?.scrollTop ?? null,
                  })
                  setSelectedMainCategory(main)
                  setSelectedCategory('')
                }}
                className={cn(
                  'rounded-md border px-3 py-2 text-left font-semibold transition whitespace-nowrap leading-none',
                  selectedMainCategory === main
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border hover:bg-muted',
                  !isAdminMode && 'h-8 px-3 py-0 text-sm'
                )}
                style={{ fontSize: `${mainCategoryFontPx}px` }}
              >
                {main}
              </button>
            ))}
          </div>
          <p className={cn('font-semibold text-muted-foreground', isAdminMode ? 'mb-2 mt-4 text-xs' : 'mb-0.5 mt-1.5 text-[10px]')}>{t('posCategory') || '카테고리'}</p>
          <div className={cn(isAdminMode ? 'grid gap-1.5' : 'flex gap-1 overflow-x-auto')}>
            {categoriesForSelectedMain.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  debugLog('pre-fix', 'H1', 'pos-terminal-menu-screen.tsx:onCategoryClick', 'category clicked', {
                    nextCategory: cat,
                    prevCategory: selectedCategory,
                    currentMain: selectedMainCategory,
                    prevScrollTop: menuListRef.current?.scrollTop ?? null,
                  })
                  setSelectedCategory(cat)
                }}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-left transition whitespace-nowrap leading-none',
                  selectedCategory === cat
                    ? 'bg-sky-500 text-white border-sky-600'
                    : 'bg-background border-border hover:bg-muted',
                  !isAdminMode && 'h-8 px-3 py-0 text-sm'
                )}
                style={{ fontSize: `${categoryFontPx}px` }}
              >
                {cat}
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
                {selectedMainCategory || '-'} / {selectedCategory || '-'}
              </div>
              <div className="text-xs text-muted-foreground">{filteredMenus.length + filteredPromos.length} items</div>
            </div>
          )}
          <div
            ref={menuGridRef}
            className={cn(
              'grid content-start gap-2',
              !isAdminMode && 'auto-rows-[162px]'
            )}
            style={{
              gridTemplateColumns: `repeat(${Math.max(2, screenConfig.menuTileCols)}, minmax(0, 1fr))`,
              alignContent: 'start',
              justifyContent: 'start',
              placeContent: 'start',
            }}
          >
            {filteredPromos.map((p) => (
              <button
                key={`promo-${p.id}`}
                type="button"
                onClick={() => interactive && addPromo(p)}
                className={cn(
                  'flex h-full flex-col overflow-hidden rounded-xl border border-amber-300 bg-amber-50 p-1.5 text-left transition',
                  interactive ? 'hover:border-amber-400 hover:bg-amber-100 active:scale-[0.98]' : 'opacity-75 cursor-default'
                )}
                data-menu-card="promo"
              >
                <div className="relative flex h-[92px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-amber-100">
                  <span className="text-2xl">🏷️</span>
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
            ))}
            {filteredMenus.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => interactive && openMenuPicker(m)}
                className={cn(
                  'flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-left transition',
                  interactive ? 'hover:border-emerald-400 hover:shadow-md active:scale-[0.98]' : 'opacity-85 cursor-default'
                )}
                data-menu-card="menu"
              >
                <div className="relative h-[92px] shrink-0 overflow-hidden rounded-lg bg-slate-100">
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
                  {m.imageUrl ? (
                    <Image
                      src={m.imageUrl}
                      alt={m.name}
                      fill
                      className="object-cover"
                      unoptimized
                      onError={(e) => {
                        const tgt = e.target as HTMLImageElement
                        if (tgt) tgt.style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-2xl text-slate-400">🍗</div>
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
                  {m.name}
                </div>
                <div className="mt-auto text-xs font-bold text-emerald-600">{getMenuPrice(m).toLocaleString()} ฿</div>
              </button>
            ))}
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
                          {row.rowType === 'promo' ? `[Promo] ${row.name}` : row.name}
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
                            if (row.rowType === 'promo' && row.promo) addPromo(row.promo)
                            if (row.rowType === 'menu' && row.menu) openMenuPicker(row.menu)
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
                      {list.map((menu) => (
                        <button
                          key={menu.id}
                          type="button"
                          disabled={!!first && first.id === menu.id}
                          onClick={() => {
                            if (first) {
                              addBanban(optionPickerMenu, first, menu)
                            } else {
                              setOptionPickerBanbanFirst(menu)
                            }
                          }}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition",
                            first?.id === menu.id
                              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                              : "border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50"
                          )}
                        >
                          <span className="flex-1 min-w-0 text-left font-medium text-slate-800 break-words">
                            {menu.name}
                          </span>
                          {first?.id === menu.id ? (
                            <span className="rounded bg-slate-200 px-2 py-1 text-[11px] shrink-0">선택됨</span>
                          ) : (
                            <span className="rounded bg-emerald-100 px-2 py-1 text-[11px] text-emerald-700 shrink-0 whitespace-nowrap">
                              {first ? (t('posSelect') || '선택') : (t('posBanbanFirstHalf') || '1번째 맛')}
                            </span>
                          )}
                        </button>
                      ))}
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
            const optsToShow = isChickenBase ? opts.filter((o) => !isChickenDefaultOption(o.name)) : opts
            const groups = optionPickerMenu.optionSelectionGroups || []
            const optsWithSteps = opts.filter(
              (o) =>
                o.optionType === 'substitution' &&
                o.optionStepValues &&
                Object.keys(o.optionStepValues).length > 0
            )
            const optsWithStepsToShow = isChickenBase
              ? optsWithSteps.filter((o) => !isChickenDefaultOption(o.name))
              : optsWithSteps
            const useMultiStep = groups.length > 0 && optsWithStepsToShow.length > 0
            const defaultBtn = isChickenBase && (
              <button
                type="button"
                onClick={() => addWithOption(optionPickerMenu, null, 'S 순살')}
                className="mb-3 flex w-full justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-left transition hover:border-amber-400 hover:bg-amber-100"
              >
                <span className="font-medium text-slate-800">{t('posOptionDefault') || '기본 (S 순살)'}</span>
                <span className="font-bold text-amber-600">{getMenuPrice(optionPickerMenu).toLocaleString()} ฿</span>
              </button>
            )
            if (useMultiStep) {
              const groupKey = groups[optionPickerStep]
              const values = [
                ...new Set(
                  optsWithStepsToShow.map((o) => o.optionStepValues?.[groupKey]).filter(Boolean)
                ),
              ] as string[]
              const handleStepSelect = (value: string) => {
                const next = { ...optionPickerSelections, [groupKey]: value }
                setOptionPickerSelections(next)
                if (optionPickerStep >= groups.length - 1) {
                  const match = optsWithStepsToShow.find((o) =>
                    groups.every((g) => o.optionStepValues?.[g] === next[g])
                  )
                  if (match) addWithOption(optionPickerMenu, match)
                } else {
                  setOptionPickerStep((s) => s + 1)
                }
              }
              const groupLabels: Record<string, string> = {
                size: '사이즈',
                part: '부위',
                topping: '토핑',
                bone: '뼈/순살',
                type: '타입',
              }
              return (
                <div className="flex flex-col gap-3 py-2">
                  {defaultBtn}
                  <p className="text-xs text-muted-foreground">{groupLabels[groupKey] || groupKey}</p>
                  <div className="flex flex-wrap gap-2">
                    {values.map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => handleStepSelect(val)}
                        className="rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:border-emerald-400 hover:bg-emerald-50 text-slate-800"
                      >
                        {val}
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
                      ← {t('posBack') || '이전'}
                    </Button>
                  )}
                </div>
              )
            }
            return (
              <div className="flex flex-col gap-2 py-2">
                {defaultBtn}
                {optsToShow.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => addWithOption(optionPickerMenu, opt)}
                    className="flex justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-emerald-400 hover:bg-emerald-50"
                  >
                    <span className="text-slate-800">{opt.name}</span>
                    <span className="font-bold text-emerald-600">
                      {(getMenuPrice(optionPickerMenu) + getOptionModifier(opt)).toLocaleString()} ฿
                    </span>
                  </button>
                ))}
              </div>
            )
          })()}
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
                          <SelectItem key={c} value={c}>{c}</SelectItem>
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
                          {menuEditForm.imageUrl ? (
                            <Image src={menuEditForm.imageUrl} alt="menu-preview" fill className="object-cover" unoptimized />
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
                      onChange={(e) => setMenuEditForm((p) => ({ ...p, kitchenPrinter: e.target.value as 'none' | '1' | '2' }))}
                    >
                      <option value="none">{t('posMenuKitchenPrinterAuto') || '자동(카테고리 기준)'}</option>
                      <option value="1">{t('posKitchen1') || '주방1'}</option>
                      <option value="2">{t('posKitchen2') || '주방2'}</option>
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
