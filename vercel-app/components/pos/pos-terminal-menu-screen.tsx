'use client'

import * as React from 'react'
import Image from 'next/image'
import {
  getPosMenus,
  getPosMenuCategories,
  getPosMenuOptions,
  getPosPromosWithItems,
  getPosMenuScreenConfig,
  savePosMenuScreenConfig,
  type PosMenu,
  type PosMenuOption,
  type PosPromoWithItems,
} from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { ArrowLeft, Save } from 'lucide-react'
import {
  DEFAULT_POS_MENU_SCREEN_CONFIG,
  normalizePosMenuScreenConfig,
  type PosMenuScreenConfig,
} from '@/lib/pos-menu-screen-config'

function isChickenDefaultOption(name: string | undefined): boolean {
  if (!name?.trim()) return false
  const n = name.trim()
  return /^S\s*[-]?\s*순살\s*$/i.test(n) || n === 'S 순살' || n === 'S - 순살' || n === 'S-순살'
}

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
  onAddItem?: (item: { id: string; name: string; price: number }) => void
  /** 하단 화면 구성바 표시 */
  showConfigBar?: boolean
  className?: string
}

export function PosTerminalMenuScreen({
  selectedTableName,
  mode = 'pos-order',
  storeCode,
  onBack,
  backButtonLabel,
  onAddItem,
  showConfigBar = true,
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

  React.useEffect(() => {
    setLoading(true)
    Promise.all([
      getPosMenus(),
      getPosMenuCategories(),
      getPosMenuOptions(),
      getPosPromosWithItems(),
    ])
      .then(([list, catRes, opts, promoList]) => {
        setMenus(list || [])
        setPromos(promoList || [])
        setAllOptions(opts || [])
        const mains = catRes.mainCategories ?? []
        setMainCategories(mains)
        setSelectedMainCategory(mains[0] ?? '')
        setSelectedCategory('')
      })
      .catch(() => {
        setMenus([])
        setPromos([])
        setAllOptions([])
      })
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    setConfigLoading(true)
    getPosMenuScreenConfig({ storeCode: storeCode || undefined })
      .then((cfg) => setScreenConfig(normalizePosMenuScreenConfig(cfg, storeCode || null)))
      .catch(() => setScreenConfig(normalizePosMenuScreenConfig(null, storeCode || null)))
      .finally(() => setConfigLoading(false))
  }, [storeCode])

  const optionsByMenuId = React.useMemo(() => {
    const m: Record<string, PosMenuOption[]> = {}
    for (const o of allOptions) {
      if (o.sellHall === false) continue
      const mid = String(o.menuId)
      if (!m[mid]) m[mid] = []
      m[mid].push(o)
    }
    return m
  }, [allOptions])

  const todayStr = React.useMemo(
    () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }),
    []
  )
  const categoriesForSelectedMain = React.useMemo(() => {
    if (!selectedMainCategory) return [] as string[]
    const set = new Set(
      menus
        .filter((m) => (m.categoryMain ?? '') === selectedMainCategory)
        .map((m) => m.category)
        .filter(Boolean)
    )
    return Array.from(set).sort()
  }, [menus, selectedMainCategory])

  React.useEffect(() => {
    if (categoriesForSelectedMain.length > 0 && !categoriesForSelectedMain.includes(selectedCategory)) {
      setSelectedCategory(categoriesForSelectedMain[0])
    }
  }, [categoriesForSelectedMain, selectedCategory])

  React.useEffect(() => {
    setListPage(0)
  }, [selectedMainCategory, selectedCategory, searchKeyword, screenConfig.menuListPageSize])

  const filteredMenus = React.useMemo(() => {
    const active = menus.filter((m) => m.isActive)
    const notSoldOut = active.filter((m) => !m.soldOutDate || m.soldOutDate !== todayStr)
    if (!selectedMainCategory || !selectedCategory) return []
    return notSoldOut.filter(
      (m) =>
        (m.categoryMain ?? '') === selectedMainCategory && m.category === selectedCategory
    )
  }, [menus, selectedCategory, selectedMainCategory, todayStr])

  const filteredPromos = React.useMemo(() => {
    const active = promos.filter((p) => p.isActive)
    if (!selectedCategory) return active
    return active.filter((p) => p.category === selectedCategory)
  }, [promos, selectedCategory])

  const getMenuPrice = (menu: PosMenu) => menu.price
  const getOptionModifier = (opt: PosMenuOption) => opt.priceModifier ?? 0
  const getPromoPrice = (p: PosPromoWithItems) => p.price ?? 0

  const chickenMenusForBanban = React.useMemo(() => {
    return menus.filter(
      (m) =>
        m.isActive &&
        (!m.soldOutDate || m.soldOutDate !== todayStr) &&
        m.code?.trim().toLowerCase().startsWith('c') &&
        !m.isBanban
    )
  }, [menus, todayStr])

  const addWithOption = (menu: PosMenu, opt: PosMenuOption | null, defaultOptionName?: string) => {
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
    const price = Math.round((getMenuPrice(menu1) + getMenuPrice(menu2)) / 2)
    onAddItem?.({ id, name, price })
    setOptionPickerMenu(null)
    setOptionPickerBanbanFirst(null)
  }

  const addPromo = (p: PosPromoWithItems) => {
    onAddItem?.({ id: `promo-${p.id}`, name: p.name, price: getPromoPrice(p) })
  }

  const openMenuPicker = (menu: PosMenu) => {
    if (menu.isBanban) {
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

  const interactive = mode === 'pos-order' && typeof onAddItem === 'function'
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

  if (loading) {
    return (
      <div className={cn('flex h-full items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm', className)}>
        {t('posMenuLoading')}
      </div>
    )
  }

  return (
    <div className={cn('flex h-full flex-col rounded-lg border border-border bg-card overflow-hidden', className)}>
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-muted/30 px-4 py-2">
        <Button variant="ghost" size="sm" className="gap-1.5 h-9" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          {backButtonLabel || t('posBackToTableSelect') || '테이블 선택'}
        </Button>
        <span className="text-sm font-medium text-muted-foreground">
          {t('posTableLabel')}: <span className="text-foreground font-semibold">{selectedTableName}</span>
        </span>
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-1 min-[980px]:grid-cols-[220px_1fr_320px]">
        <section className="min-h-0 border-r bg-muted/20 px-3 py-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">{t('posMainCategory') || '대분류'}</p>
          <div className="grid gap-1.5">
            {mainCategories.map((main) => (
              <button
                key={main}
                type="button"
                onClick={() => {
                  setSelectedMainCategory(main)
                  setSelectedCategory('')
                }}
                className={cn(
                  'rounded-md border px-3 py-2 text-left font-semibold transition',
                  selectedMainCategory === main
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border hover:bg-muted'
                )}
                style={{ fontSize: `${screenConfig.mainCategoryFontSize}px` }}
              >
                {main}
              </button>
            ))}
          </div>
          <p className="mb-2 mt-4 text-xs font-semibold text-muted-foreground">{t('posCategory') || '카테고리'}</p>
          <div className="grid gap-1.5">
            {categoriesForSelectedMain.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-left transition',
                  selectedCategory === cat
                    ? 'bg-sky-500 text-white border-sky-600'
                    : 'bg-background border-border hover:bg-muted'
                )}
                style={{ fontSize: `${screenConfig.categoryFontSize}px` }}
              >
                {cat}
              </button>
            ))}
          </div>
        </section>

        <section className="min-h-0 overflow-y-auto p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {selectedMainCategory || '-'} / {selectedCategory || '-'}
            </div>
            <div className="text-xs text-muted-foreground">{filteredMenus.length + filteredPromos.length} items</div>
          </div>
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${Math.max(2, screenConfig.menuTileCols)}, minmax(0, 1fr))` }}
          >
            {filteredPromos.map((p) => (
              <button
                key={`promo-${p.id}`}
                type="button"
                onClick={() => interactive && addPromo(p)}
                className={cn(
                  'flex min-h-[96px] flex-col overflow-hidden rounded-xl border border-amber-300 bg-amber-50 p-2 text-left transition',
                  interactive ? 'hover:border-amber-400 hover:bg-amber-100 active:scale-[0.98]' : 'opacity-75 cursor-default'
                )}
              >
                <div className="relative flex aspect-square shrink-0 items-center justify-center overflow-hidden rounded-lg bg-amber-100">
                  <span className="text-2xl">🏷️</span>
                </div>
                <div className="mt-2 truncate font-medium text-slate-800" style={{ fontSize: `${screenConfig.menuTileFontSize}px` }}>
                  {p.name}
                </div>
                <div className="text-xs font-bold text-amber-600">{getPromoPrice(p).toLocaleString()} ฿</div>
              </button>
            ))}
            {filteredMenus.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => interactive && openMenuPicker(m)}
                className={cn(
                  'flex min-h-[96px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-2 text-left transition',
                  interactive ? 'hover:border-emerald-400 hover:shadow-md active:scale-[0.98]' : 'opacity-85 cursor-default'
                )}
              >
                <div className="relative aspect-square shrink-0 overflow-hidden rounded-lg bg-slate-100">
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
                <div className="mt-2 truncate font-medium text-slate-800" style={{ fontSize: `${screenConfig.menuTileFontSize}px` }}>
                  {m.name}
                </div>
                <div className="text-xs font-bold text-emerald-600">{getMenuPrice(m).toLocaleString()} ฿</div>
              </button>
            ))}
          </div>
        </section>

        <section className="min-h-0 border-l bg-card p-3">
          <div className="mb-2 flex items-center gap-2">
            <Input
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder={t('search') || '검색'}
              className="h-8 text-xs"
            />
            <span className="text-xs text-muted-foreground">{safePage + 1}/{totalPages}</span>
          </div>
          <div className="h-[calc(100%-76px)] overflow-auto rounded-md border">
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
          <div className="mt-2 flex items-center justify-between">
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={safePage <= 0} onClick={() => setListPage((p) => Math.max(0, p - 1))}>
              {t('prev') || '이전'}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={safePage >= totalPages - 1} onClick={() => setListPage((p) => Math.min(totalPages - 1, p + 1))}>
              {t('next') || '다음'}
            </Button>
          </div>
        </section>
      </div>

      {showConfigBar && (
        <div className="shrink-0 border-t bg-muted/15 px-3 py-2">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[11px] text-muted-foreground">
              POS 메뉴 그룹
              <Input className="mt-1 h-8 w-16 text-xs" type="number" value={screenConfig.mainCategoryFontSize} disabled={configLoading || (!isAdminMode && true)} onChange={(e) => setNumericConfig('mainCategoryFontSize', e.target.value)} />
            </label>
            <label className="text-[11px] text-muted-foreground">
              POS 메뉴
              <Input className="mt-1 h-8 w-16 text-xs" type="number" value={screenConfig.categoryFontSize} disabled={configLoading || (!isAdminMode && true)} onChange={(e) => setNumericConfig('categoryFontSize', e.target.value)} />
            </label>
            <label className="text-[11px] text-muted-foreground">
              메뉴 타일 폰트
              <Input className="mt-1 h-8 w-16 text-xs" type="number" value={screenConfig.menuTileFontSize} disabled={configLoading || (!isAdminMode && true)} onChange={(e) => setNumericConfig('menuTileFontSize', e.target.value)} />
            </label>
            <label className="text-[11px] text-muted-foreground">
              타일 열 수
              <Input className="mt-1 h-8 w-16 text-xs" type="number" value={screenConfig.menuTileCols} disabled={configLoading || (!isAdminMode && true)} onChange={(e) => setNumericConfig('menuTileCols', e.target.value)} />
            </label>
            <label className="text-[11px] text-muted-foreground">
              리스트 폰트
              <Input className="mt-1 h-8 w-16 text-xs" type="number" value={screenConfig.menuListFontSize} disabled={configLoading || (!isAdminMode && true)} onChange={(e) => setNumericConfig('menuListFontSize', e.target.value)} />
            </label>
            <label className="text-[11px] text-muted-foreground">
              페이지 행 수
              <Input className="mt-1 h-8 w-16 text-xs" type="number" value={screenConfig.menuListPageSize} disabled={configLoading || (!isAdminMode && true)} onChange={(e) => setNumericConfig('menuListPageSize', e.target.value)} />
            </label>
            <label className="text-[11px] text-muted-foreground">
              키오스크 그룹
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
        <DialogContent className="max-w-xs sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {optionPickerMenu?.name} — {t('posSelectOption') || '옵션 선택'}
              {optionPickerMenu?.optionSelectionGroups?.length
                ? ` (${(optionPickerStep || 0) + 1}/${optionPickerMenu.optionSelectionGroups.length})`
                : ''}
            </DialogTitle>
          </DialogHeader>
          {optionPickerMenu && (() => {
            if (optionPickerMenu.isBanban) {
              const first = optionPickerBanbanFirst
              const list = chickenMenusForBanban
              return (
                <div className="flex flex-col gap-3 py-2">
                  <p className="text-xs text-muted-foreground">
                    {first
                      ? t('posBanbanSecondHalf') || '2번째 맛'
                      : t('posBanbanFirstHalf') || '1번째 맛'}
                  </p>
                  {first && (
                    <p className="text-xs font-medium text-amber-600">
                      {t('posBanbanFirstSelected') || '1번째'}: {first.name}
                    </p>
                  )}
                  {list.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t('posBanbanNoChicken') || '치킨 메뉴가 없습니다.'}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {list.map((menu) => (
                        <button
                          key={menu.id}
                          type="button"
                          onClick={() => {
                            if (first) {
                              addBanban(optionPickerMenu, first, menu)
                            } else {
                              setOptionPickerBanbanFirst(menu)
                            }
                          }}
                          className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-emerald-400 hover:bg-emerald-50"
                        >
                          <span className="block font-medium text-slate-800">{menu.name}</span>
                          <span className="text-xs text-emerald-600">{getMenuPrice(menu).toLocaleString()} ฿</span>
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
    </div>
  )
}
