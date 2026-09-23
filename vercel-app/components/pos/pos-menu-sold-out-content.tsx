'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CircleOff, Home, Loader2, RefreshCw, Search } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { getPosMenus, type PosMenu } from '@/lib/api-client/pos-menus'
import { updatePosMenuSoldOut } from '@/lib/api-client/sauces'
import { bangkokTodayYmd } from '@/lib/bangkok-date'
import { appAlert } from '@/lib/app-message'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { translateApiMessage } from '@/lib/translate-api-message'
import { navigatePosOfflineAware } from '@/lib/pos-offline-nav'
import { canAccessPosOrder } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type FilterMode = 'all' | 'selling' | 'soldOut'

/** POS 매장용 당일 품절 토글 — QR·터미널과 동일 sold_out_date */
export function PosMenuSoldOutContent() {
  const { auth, initialized } = useAuth()
  const router = useRouter()
  const t = useT(useLang().lang)
  const storeCode = String(auth?.store || '').trim()

  const [menus, setMenus] = React.useState<PosMenu[]>([])
  const [loading, setLoading] = React.useState(true)
  const [togglingId, setTogglingId] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [filter, setFilter] = React.useState<FilterMode>('all')
  const todayStr = bangkokTodayYmd()

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      let list = await getPosMenus({
        fresh: true,
        storeCode: storeCode || undefined,
      })
      if (!Array.isArray(list) || list.length === 0) {
        list = await getPosMenus({ fresh: true })
      }
      setMenus((Array.isArray(list) ? list : []).filter((m) => m.isActive !== false))
    } catch (e) {
      await appAlert(String(e))
      setMenus([])
    } finally {
      setLoading(false)
    }
  }, [storeCode])

  React.useEffect(() => {
    if (!initialized) return
    if (!canAccessPosOrder(auth?.role || '')) {
      router.replace('/pos')
      return
    }
    void load()
  }, [initialized, auth?.role, router, load])

  const isSoldOutToday = React.useCallback(
    (m: PosMenu) => String(m.soldOutDate || '').slice(0, 10) === todayStr,
    [todayStr]
  )

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return menus
      .filter((m) => {
        const sold = isSoldOutToday(m)
        if (filter === 'selling' && sold) return false
        if (filter === 'soldOut' && !sold) return false
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
        const aSold = isSoldOutToday(a) ? 0 : 1
        const bSold = isSoldOutToday(b) ? 0 : 1
        if (aSold !== bSold) return aSold - bSold
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)
      })
  }, [menus, search, filter, isSoldOutToday])

  const soldOutCount = React.useMemo(
    () => menus.filter((m) => isSoldOutToday(m)).length,
    [menus, isSoldOutToday]
  )

  const handleToggle = async (menu: PosMenu) => {
    const nextSoldOut = !isSoldOutToday(menu)
    setTogglingId(menu.id)
    try {
      const res = await updatePosMenuSoldOut({
        id: menu.id,
        soldOut: nextSoldOut,
        storeCode: storeCode || null,
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
      setMenus((prev) =>
        prev.map((m) => (m.id === menu.id ? { ...m, soldOutDate: nextDate } : m))
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
              <p className="truncate text-xs text-muted-foreground">
                {t('posMenuSoldOutManageHint') ||
                  '당일 품절 시 POS·QR에서 주문 불가. 다음날 자동 해제.'}
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

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('posMenuSoldOutSearchPh') || '메뉴명·코드 검색'}
            className="h-11 pl-9 text-base"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'all' as const, label: t('posMenuSoldOutFilterAll') || '전체' },
              { id: 'selling' as const, label: t('posAvailable') || '판매' },
              {
                id: 'soldOut' as const,
                label: `${t('posSoldOut') || '품절'}${soldOutCount > 0 ? ` (${soldOutCount})` : ''}`,
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
              const sold = isSoldOutToday(menu)
              const busy = togglingId === menu.id
              return (
                <li key={menu.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleToggle(menu)}
                    className={cn(
                      'flex w-full min-h-[72px] items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors touch-manipulation',
                      'active:scale-[0.99] disabled:opacity-60',
                      sold
                        ? 'border-red-200 bg-red-50 hover:bg-red-100/80'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
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
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-3 py-1.5 text-sm font-medium',
                        sold
                          ? 'bg-red-600 text-white'
                          : 'bg-emerald-600 text-white'
                      )}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : sold ? (
                        t('posMenuSoldOutTempOff') || t('posSoldOut') || '일시 판매중지'
                      ) : (
                        t('posAvailable') || '판매'
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
