'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CircleOff, Home, Loader2, RefreshCw, Search } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import {
  getPosMenus,
  getPosOptionStepSoldOut,
  updatePosOptionStepSoldOut,
  type PosMenu,
  type PosOptionStepSoldOutItem,
} from '@/lib/api-client/pos-menus'
import { updatePosMenuSoldOut } from '@/lib/api-client/sauces'
import { bangkokTodayYmd } from '@/lib/bangkok-date'
import { appAlert } from '@/lib/app-message'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { translateApiMessage } from '@/lib/translate-api-message'
import { navigatePosOfflineAware } from '@/lib/pos-offline-nav'
import { isPosMenuSoldOut, type PosMenuSoldOutScope } from '@/lib/pos-menu-sold-out'
import { canAccessPosOrder } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type FilterMode = 'all' | 'selling' | 'storeOff' | 'allOff'
/** selling = 판매, store = หน้าร้าน만 중지(배달 판매), all = 전 채널 중지 */
type MenuSaleState = 'selling' | PosMenuSoldOutScope
type MainTab = 'menus' | 'parts'

function menuSaleState(menu: PosMenu): MenuSaleState {
  if (!isPosMenuSoldOut(menu.soldOutDate)) return 'selling'
  return menu.soldOutScope === 'store' ? 'store' : 'all'
}

function partLabel(stepValue: string, t: (k: string) => string): string {
  const v = String(stepValue || '').trim()
  const key =
    v === 'Boneless'
      ? 'posOptionPartBoneless'
      : v === 'Wing'
        ? 'posOptionPartWing'
        : v === 'Drumette' || v === 'Drumstick'
          ? 'posOptionPartDrumstick'
          : ''
  if (key) {
    const label = t(key)
    if (label && label !== key) return label
  }
  return v
}

/** POS 매장용 품절 토글 — sold_out_date 있으면 수동 해제 전까지 유지 (QR·터미널 공통) */
export function PosMenuSoldOutContent() {
  const { auth, initialized } = useAuth()
  const router = useRouter()
  const t = useT(useLang().lang)
  const storeCode = String(auth?.store || '').trim()

  const [mainTab, setMainTab] = React.useState<MainTab>('menus')
  const [menus, setMenus] = React.useState<PosMenu[]>([])
  const [parts, setParts] = React.useState<PosOptionStepSoldOutItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [togglingId, setTogglingId] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [filter, setFilter] = React.useState<FilterMode>('all')
  const todayStr = bangkokTodayYmd()

  const loadMenus = React.useCallback(async () => {
    let list = await getPosMenus({
      fresh: true,
      storeCode: storeCode || undefined,
    })
    if (!Array.isArray(list) || list.length === 0) {
      list = await getPosMenus({ fresh: true })
    }
    setMenus((Array.isArray(list) ? list : []).filter((m) => m.isActive !== false))
  }, [storeCode])

  const loadParts = React.useCallback(async () => {
    if (!storeCode) {
      setParts([])
      return
    }
    const res = await getPosOptionStepSoldOut({ storeCode })
    if (!res.success) {
      throw new Error(res.message || t('msg_save_fail_detail') || 'load failed')
    }
    setParts(Array.isArray(res.items) ? res.items : [])
  }, [storeCode, t])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      if (mainTab === 'menus') {
        await loadMenus()
      } else {
        await loadParts()
      }
    } catch (e) {
      await appAlert(String(e))
      if (mainTab === 'menus') setMenus([])
      else setParts([])
    } finally {
      setLoading(false)
    }
  }, [mainTab, loadMenus, loadParts])

  React.useEffect(() => {
    if (!initialized) return
    if (!canAccessPosOrder(auth?.role || '')) {
      router.replace('/pos')
      return
    }
    void load()
  }, [initialized, auth?.role, router, load])

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    const rank: Record<MenuSaleState, number> = { all: 0, store: 1, selling: 2 }
    return menus
      .filter((m) => {
        const state = menuSaleState(m)
        if (filter === 'selling' && state !== 'selling') return false
        if (filter === 'storeOff' && state !== 'store') return false
        if (filter === 'allOff' && state !== 'all') return false
        if (!q) return true
        return (
          m.name.toLowerCase().includes(q) ||
          m.code.toLowerCase().includes(q) ||
          String(m.category || '')
            .toLowerCase()
            .includes(q)
        )
      })
      .sort((a, b) => {
        const diff = rank[menuSaleState(a)] - rank[menuSaleState(b)]
        if (diff !== 0) return diff
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)
      })
  }, [menus, search, filter])

  const filteredParts = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return parts
      .filter((p) => {
        if (!q) return true
        const label = partLabel(p.stepValue, t).toLowerCase()
        return label.includes(q) || p.stepValue.toLowerCase().includes(q)
      })
      .sort((a, b) => {
        if (a.soldOut !== b.soldOut) return a.soldOut ? -1 : 1
        return a.stepValue.localeCompare(b.stepValue)
      })
  }, [parts, search, t])

  const counts = React.useMemo(() => {
    let store = 0
    let all = 0
    for (const m of menus) {
      const state = menuSaleState(m)
      if (state === 'store') store += 1
      else if (state === 'all') all += 1
    }
    return { store, all }
  }, [menus])

  const partSoldOutCount = React.useMemo(
    () => parts.filter((p) => p.soldOut).length,
    [parts]
  )

  const handleSetState = async (menu: PosMenu, next: MenuSaleState) => {
    if (menuSaleState(menu) === next) return
    const nextSoldOut = next !== 'selling'
    setTogglingId(menu.id)
    try {
      const res = await updatePosMenuSoldOut({
        id: menu.id,
        soldOut: nextSoldOut,
        storeCode: storeCode || null,
        soldOutScope: nextSoldOut ? next : undefined,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || res.message || t('msg_save_fail_detail'))
        return
      }
      const nextDate =
        res.soldOutDate != null
          ? String(res.soldOutDate).slice(0, 10)
          : nextSoldOut
            ? todayStr
            : null
      const nextScope: PosMenuSoldOutScope | null = nextDate
        ? res.soldOutScope ?? (next === 'store' ? 'store' : 'all')
        : null
      setMenus((prev) =>
        prev.map((m) =>
          m.id === menu.id ? { ...m, soldOutDate: nextDate, soldOutScope: nextScope } : m
        )
      )
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setTogglingId(null)
    }
  }

  const partSaleState = (item: PosOptionStepSoldOutItem): MenuSaleState => {
    if (!item.soldOut) return 'selling'
    return item.soldOutScope === 'store' ? 'store' : 'all'
  }

  const handlePartSetState = async (item: PosOptionStepSoldOutItem, next: MenuSaleState) => {
    if (!storeCode || partSaleState(item) === next) return
    const nextSoldOut = next !== 'selling'
    const toggleKey = `${item.stepKey}:${item.stepValue}`
    setTogglingId(toggleKey)
    try {
      const res = await updatePosOptionStepSoldOut({
        storeCode,
        stepKey: item.stepKey,
        stepValue: item.stepValue,
        soldOut: nextSoldOut,
        soldOutScope: nextSoldOut ? next : undefined,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || res.message || t('msg_save_fail_detail'))
        return
      }
      const nextDate = nextSoldOut
        ? String(res.soldOutDate || todayStr).slice(0, 10)
        : null
      const nextScope: PosMenuSoldOutScope | null = nextDate
        ? res.soldOutScope ?? (next === 'store' ? 'store' : 'all')
        : null
      setParts((prev) =>
        prev.map((p) =>
          p.stepKey === item.stepKey && p.stepValue === item.stepValue
            ? {
                ...p,
                soldOut: nextSoldOut,
                soldOutDate: nextDate,
                soldOutScope: nextScope,
              }
            : p
        )
      )
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setTogglingId(null)
    }
  }

  if (!initialized || !auth || !canAccessPosOrder(auth.role || '')) {
    return (
      <div className="flex min-h-[40vh] flex-1 items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    )
  }

  const stateOptions: { id: MenuSaleState; label: string; activeCn: string }[] = [
    { id: 'selling', label: t('posAvailable') || '판매', activeCn: 'bg-emerald-600 text-white border-emerald-600' },
    {
      id: 'store',
      label: t('posMenuSoldOutScopeStore') || '매장만 중지',
      activeCn: 'bg-amber-500 text-white border-amber-500',
    },
    {
      id: 'all',
      label: t('posMenuSoldOutScopeAll') || '전체 중지',
      activeCn: 'bg-red-600 text-white border-red-600',
    },
  ]

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-6">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <CircleOff className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight">
                {t('posMenuSoldOutManage') || '메뉴 품절'}
              </h1>
              <p className="text-xs text-muted-foreground">
                {mainTab === 'parts'
                  ? t('posOptionPartSoldOutHint') ||
                    '매장만 중지 = POS·QR만. 전체 중지 = Grab 배달 포함. 전체 중지 후 배달앱 메뉴 동기화를 한 번 해 주세요. 다시 열 때까지 유지.'
                  : t('posMenuSoldOutManageHint') ||
                    '매장만 중지 = POS·QR만 막고 Grab 배달은 판매. 전체 중지 = Grab 포함 전부. 다시 열 때까지 유지.'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              disabled={loading}
              onClick={() => void load()}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">{t('posRefresh') || '새로고침'}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              title={t('posHome') || '포스 첫 화면'}
              onClick={() => navigatePosOfflineAware('/pos', (p) => router.push(p))}
            >
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">{t('posHome') || '홈'}</span>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={mainTab === 'menus' ? 'default' : 'outline'}
            className="h-9"
            onClick={() => {
              setSearch('')
              setMainTab('menus')
            }}
          >
            {t('posMenuSoldOutTabMenus') || '메뉴'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mainTab === 'parts' ? 'default' : 'outline'}
            className="h-9"
            onClick={() => {
              setSearch('')
              setMainTab('parts')
            }}
          >
            {`${t('posMenuSoldOutTabParts') || '부위'}${partSoldOutCount > 0 ? ` (${partSoldOutCount})` : ''}`}
          </Button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              mainTab === 'parts'
                ? t('posOptionPartSoldOutSearchPh') || '부위명 검색'
                : t('posMenuSoldOutSearchPh') || '메뉴명·코드 검색'
            }
            className="h-11 pl-9 text-base"
          />
        </div>

        {mainTab === 'menus' ? (
          <>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'all' as const, label: t('posMenuSoldOutFilterAll') || '전체' },
                  { id: 'selling' as const, label: t('posAvailable') || '판매' },
                  {
                    id: 'storeOff' as const,
                    label: `${t('posMenuSoldOutScopeStore') || '매장만 중지'}${counts.store > 0 ? ` (${counts.store})` : ''}`,
                  },
                  {
                    id: 'allOff' as const,
                    label: `${t('posMenuSoldOutScopeAll') || '전체 중지'}${counts.all > 0 ? ` (${counts.all})` : ''}`,
                  },
                ] as const
              ).map((tab) => (
                <Button
                  key={tab.id}
                  type="button"
                  size="sm"
                  variant={filter === tab.id ? 'default' : 'outline'}
                  className="h-9"
                  onClick={() => setFilter(tab.id)}
                >
                  {tab.label}
                </Button>
              ))}
            </div>

            {loading ? (
              <div className="flex min-h-[30vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {t('posMenuEmpty') || '메뉴가 없습니다.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {filtered.map((menu) => {
                  const state = menuSaleState(menu)
                  const busy = togglingId === menu.id
                  return (
                    <li
                      key={menu.id}
                      className={cn(
                        'flex min-h-[72px] flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center',
                        state === 'all'
                          ? 'border-red-200 bg-red-50'
                          : state === 'store'
                            ? 'border-amber-200 bg-amber-50'
                            : 'border-slate-200 bg-white'
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-semibold text-slate-900">
                          {menu.name}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {menu.code}
                          {menu.category ? ` · ${menu.category}` : ''}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {busy ? (
                          <Loader2 className="mx-2 h-4 w-4 animate-spin text-muted-foreground" />
                        ) : null}
                        {stateOptions.map((opt) => {
                          const active = state === opt.id
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              disabled={busy}
                              aria-pressed={active}
                              onClick={() => void handleSetState(menu, opt.id)}
                              className={cn(
                                'min-h-[40px] rounded-full border px-3 py-1.5 text-sm font-medium transition-colors touch-manipulation',
                                'active:scale-[0.98] disabled:opacity-60',
                                active
                                  ? opt.activeCn
                                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                              )}
                            >
                              {opt.label}
                            </button>
                          )
                        })}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        ) : loading ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          </div>
        ) : !storeCode ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {t('posOptionPartSoldOutNeedStore') || '매장 코드가 필요합니다. POS에 매장으로 로그인해 주세요.'}
          </p>
        ) : filteredParts.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {t('posOptionPartSoldOutEmpty') || '부위 옵션이 없습니다.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {filteredParts.map((item) => {
              const busy = togglingId === `${item.stepKey}:${item.stepValue}`
              const label = partLabel(item.stepValue, t)
              const state = partSaleState(item)
              return (
                <li
                  key={`${item.stepKey}:${item.stepValue}`}
                  className={cn(
                    'flex min-h-[72px] flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center',
                    state === 'all'
                      ? 'border-red-200 bg-red-50'
                      : state === 'store'
                        ? 'border-amber-200 bg-amber-50'
                        : 'border-slate-200 bg-white'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-semibold text-slate-900">{label}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {item.stepValue}
                      {item.soldOut && item.soldOutDate
                        ? ` · ${t('posMenuSoldOutTempOff') || '일시 판매중지'} ${item.soldOutDate}`
                        : ''}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {busy ? (
                      <Loader2 className="mx-2 h-4 w-4 animate-spin text-muted-foreground" />
                    ) : null}
                    {stateOptions.map((opt) => {
                      const active = state === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={busy}
                          aria-pressed={active}
                          onClick={() => void handlePartSetState(item, opt.id)}
                          className={cn(
                            'min-h-[40px] rounded-full border px-3 py-1.5 text-sm font-medium transition-colors touch-manipulation',
                            'active:scale-[0.98] disabled:opacity-60',
                            active
                              ? opt.activeCn
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          )}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
