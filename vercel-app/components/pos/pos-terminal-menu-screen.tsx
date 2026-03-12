'use client'

import * as React from 'react'
import Image from 'next/image'
import {
  getPosMenus,
  getPosMenuCategories,
  getPosMenuOptions,
  getPosPromosWithItems,
  type PosMenu,
  type PosMenuOption,
  type PosPromoWithItems,
} from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { ArrowLeft } from 'lucide-react'

function isChickenDefaultOption(name: string | undefined): boolean {
  if (!name?.trim()) return false
  const n = name.trim()
  return /^S\s*[-]?\s*순살\s*$/i.test(n) || n === 'S 순살' || n === 'S - 순살' || n === 'S-순살'
}

export interface PosTerminalMenuScreenProps {
  /** 선택된 테이블 이름 (상단에 표시) */
  selectedTableName: string
  /** 테이블 선택 화면으로 돌아가기 */
  onBack: () => void
  /** 메뉴/옵션 선택 후 장바구니에 추가할 때 (이름·가격은 옵션 반영된 최종값) */
  onAddItem: (item: { id: string; name: string; price: number }) => void
  className?: string
}

export function PosTerminalMenuScreen({
  selectedTableName,
  onBack,
  onAddItem,
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

  const todayStr = new Date().toISOString().slice(0, 10)
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
    onAddItem({ id, name, price })
    setOptionPickerMenu(null)
    setOptionPickerStep(0)
    setOptionPickerSelections({})
  }

  const addBanban = (banbanMenu: PosMenu, menu1: PosMenu, menu2: PosMenu) => {
    const ids = [menu1.id, menu2.id].sort()
    const id = `banban-${ids.join('-')}`
    const name = `${banbanMenu.name} (${menu1.name} / ${menu2.name})`
    const price = Math.round((getMenuPrice(menu1) + getMenuPrice(menu2)) / 2)
    onAddItem({ id, name, price })
    setOptionPickerMenu(null)
    setOptionPickerBanbanFirst(null)
  }

  const addPromo = (p: PosPromoWithItems) => {
    onAddItem({ id: `promo-${p.id}`, name: p.name, price: getPromoPrice(p) })
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

  if (loading) {
    return (
      <div className={cn('flex h-full items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm', className)}>
        {t('posMenuLoading')}
      </div>
    )
  }

  return (
    <div className={cn('flex h-full flex-col rounded-lg border border-border bg-card overflow-hidden', className)}>
      {/* 상단: 테이블 선택으로 돌아가기 + 선택 테이블명 */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-muted/30 px-4 py-2">
        <Button variant="ghost" size="sm" className="gap-1.5 h-9" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          {t('posBackToTableSelect') || '테이블 선택'}
        </Button>
        <span className="text-sm font-medium text-muted-foreground">
          {t('posTableLabel')}: <span className="text-foreground font-semibold">{selectedTableName}</span>
        </span>
      </div>

      {/* 대분류 */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-3 py-2">
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          {t('posMainCategory') || '대분류'}
        </span>
        {mainCategories.map((main) => (
          <button
            key={main}
            type="button"
            onClick={() => {
              setSelectedMainCategory(main)
              setSelectedCategory('')
            }}
            className={cn(
              'shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition',
              selectedMainCategory === main
                ? 'bg-primary text-primary-foreground'
                : 'bg-background border border-border text-foreground hover:bg-muted'
            )}
          >
            {main}
          </button>
        ))}
      </div>

      {/* 카테고리 */}
      {selectedMainCategory && categoriesForSelectedMain.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/10 px-3 py-2">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {t('posCategory') || '카테고리'}
          </span>
          <div className="flex flex-1 gap-2 overflow-x-auto">
            {categoriesForSelectedMain.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setSelectedCategory(c)}
                className={cn(
                  'shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition',
                  selectedCategory === c
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background border border-border text-foreground hover:bg-muted'
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 메뉴 그리드 */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 min-h-0">
        <div className="grid grid-cols-3 gap-2 sm:gap-3 min-[1025px]:grid-cols-4 min-[1200px]:grid-cols-5">
          {filteredPromos.map((p) => (
            <button
              key={`promo-${p.id}`}
              type="button"
              onClick={() => addPromo(p)}
              className="flex min-h-[88px] flex-col overflow-hidden rounded-xl border border-amber-300 bg-amber-50 p-2 text-left transition hover:border-amber-400 hover:bg-amber-100 active:scale-[0.98] touch-manipulation"
            >
              <div className="relative aspect-square shrink-0 overflow-hidden rounded-lg bg-amber-100 flex items-center justify-center">
                <span className="text-3xl">🏷️</span>
              </div>
              <div className="mt-2 truncate text-sm font-medium text-slate-800">{p.name}</div>
              <div className="text-xs font-bold text-amber-600">
                {getPromoPrice(p) > 0 ? `${getPromoPrice(p).toLocaleString()} ฿` : '-'}
              </div>
            </button>
          ))}
          {filteredMenus.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => openMenuPicker(m)}
              className="flex min-h-[88px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-2 text-left transition hover:border-emerald-400 hover:shadow-md active:scale-[0.98] touch-manipulation"
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
                  <div className="flex h-full items-center justify-center text-3xl text-slate-400">🍗</div>
                )}
              </div>
              <div className="mt-2 truncate text-sm font-medium text-slate-800">{m.name}</div>
              <div className="text-xs font-bold text-emerald-600">
                {getMenuPrice(m) > 0 ? `${getMenuPrice(m).toLocaleString()} ฿` : '-'}
              </div>
            </button>
          ))}
        </div>
        {selectedMainCategory && !selectedCategory && categoriesForSelectedMain.length > 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground text-sm">
            {t('posSelectCategoryFirst') || '카테고리를 선택하세요.'}
          </div>
        )}
        {selectedMainCategory && selectedCategory && filteredMenus.length === 0 && filteredPromos.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground text-sm">
            {t('posNoMenus') || '등록된 메뉴가 없습니다.'}
          </div>
        )}
        {!selectedMainCategory && mainCategories.length > 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground text-sm">
            {t('posSelectMainCategoryFirst') || '대분류를 선택하세요.'}
          </div>
        )}
      </div>

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
