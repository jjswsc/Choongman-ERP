'use client'

import { useState, useCallback, useEffect, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { navigatePosOfflineAware } from '@/lib/pos-offline-nav'
import { POSHeader } from '@/components/pos/pos-header'
import { POSMainGrid } from '@/components/pos/pos-main-grid'
import { usePosMainDevice } from '@/hooks/use-pos-main-device'
import { DEFAULT_TILES, POS_SUBMENUS, type POSTile, type POSSubMenuItem } from '@/lib/pos-display'
import { cn } from '@/lib/utils'
import { Circle, RefreshCw } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { useStoreList, getPosTodaySales, getLoginData, loginCheck } from '@/lib/api-client'
import { translateApiMessage } from '@/lib/translate-api-message'
import {
  canAccessPosSettlement,
  canAccessAdmin,
  canAccessPosOrder,
  canNavigateFromPosToAdmin,
  isManagerOrFranchiseeRole,
  isOfficeRole,
} from '@/lib/permissions'
import {
  DEFAULT_POS_HOME_TOUR_SCENARIO_ID,
  getPosDemoShortcutTargetByScenario,
  getPosDemoTerminalRoute,
  getPosTourScenarioIdFromQuery,
  isPosDemoFromQuery,
  POS_DEMO_ROUTES,
  PosTourOverlay,
  PosTourProvider,
} from '@/lib/pos-tour'
import { formatPosClockDate, formatPosClockTime } from '@/lib/pos-datetime-locale'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/** POS 첫 화면: 주문(매장/포장/배달), 영수증, 결산, 근태 등 타일 */
function POSMainPageInner() {
  const searchParams = useSearchParams()
  const isPosDemo = isPosDemoFromQuery(searchParams)
  const tourScenarioId = getPosTourScenarioIdFromQuery(searchParams, DEFAULT_POS_HOME_TOUR_SCENARIO_ID)
  const requestedScenarioId = String(searchParams.get('scenario') || '').trim()
  const router = useRouter()
  const { auth, logout, setAuth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores, formatStoreLabel, resolveStoreKey } = useStoreList()
  const [switchUserOpen, setSwitchUserOpen] = useState(false)
  const [switchLoginData, setSwitchLoginData] = useState<Record<string, string[]>>({})
  const [switchStore, setSwitchStore] = useState('')
  const [switchName, setSwitchName] = useState('')
  const [switchPw, setSwitchPw] = useState('')
  const [switchLoading, setSwitchLoading] = useState(false)
  const [switchError, setSwitchError] = useState('')
  const [todaySales, setTodaySales] = useState<{
    completedCount: number
    completedTotal: number
    pendingCount: number
  } | null>(null)
  const [currentTime, setCurrentTime] = useState<Date | null>(null)
  const [hybridPosShell, setHybridPosShell] = useState(false)
  useEffect(() => {
    setHybridPosShell(
      typeof window !== 'undefined' &&
        typeof (window as Window & { cmPosShell?: { resetCacheAndReload?: unknown } }).cmPosShell
          ?.resetCacheAndReload === 'function'
    )
  }, [])

  const handleResetCacheReload = useCallback(async () => {
    const shell = (window as Window & { cmPosShell?: { resetCacheAndReload?: () => Promise<unknown> } })
      .cmPosShell
    if (typeof shell?.resetCacheAndReload !== 'function') return
    await shell.resetCacheAndReload()
  }, [])

  const storeCode = auth?.store || stores[0] || ''
  const [isMainPosDevice, setIsMainPosDevice] = usePosMainDevice(storeCode || null)

  useEffect(() => {
    setCurrentTime(new Date())
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!storeCode) return
    getPosTodaySales({ storeCode }).then(setTodaySales).catch(() => setTodaySales(null))
  }, [storeCode])

  /**
   * POS 홈(`/pos`)으로 들어와도 `scenario` 바로가기를 타면
   * 해당 실습 화면(영업 시작/결산/시재/터미널)으로 즉시 이동시킵니다.
   */
  useEffect(() => {
    if (!isPosDemo || !requestedScenarioId) return
    const target = getPosDemoShortcutTargetByScenario(requestedScenarioId)
    if (!target) return
    navigatePosOfflineAware(target, (p) => router.replace(p))
  }, [isPosDemo, requestedScenarioId, router])

  const todayOrders = todaySales?.completedCount ?? 0
  const totalAmount = todaySales?.completedTotal ?? 0

  const visibleTiles = useMemo(() => {
    return DEFAULT_TILES.filter((tile) => {
      if (isPosDemo) {
        // 데모 홈 투어(h8/h9)가 역할 권한에 막혀 사라지지 않도록
        // 영업/시재/운영 타일은 항상 노출합니다.
        if (tile.type === 'business' || tile.type === 'cash' || tile.type === 'operations') return true
      }
      switch (tile.type) {
        case 'sales':
        case 'receipt':
        case 'members':
          return canAccessAdmin(auth?.role || '')
        case 'attendance':
          return canAccessPosOrder(auth?.role || '')
        case 'business':
          return canAccessPosSettlement(auth?.role || '')
        case 'cash':
        case 'petty-cash':
          return isManagerOrFranchiseeRole(auth?.role || '') || isOfficeRole(auth?.role || '')
        case 'operations':
          return true
        default:
          return true
      }
    })
  }, [auth?.role, isPosDemo])

  /** 세부 메뉴에서 선택한 항목 실행 (영업/운영 하위) */
  const handleSubAction = useCallback(
    (subType: string) => {
      switch (subType) {
        case 'open':
          navigatePosOfflineAware(
            isPosDemo ? POS_DEMO_ROUTES.businessOpen : '/pos/settlement?mode=open',
            (p) => router.push(p)
          )
          break
        case 'close':
          navigatePosOfflineAware(
            isPosDemo ? POS_DEMO_ROUTES.businessClose : '/pos/settlement',
            (p) => router.push(p)
          )
          break
        case 'refresh':
          window.location.reload()
          break
        case 'logout':
          logout?.()
          break
        case 'settings':
          navigatePosOfflineAware('/admin', (p) => router.push(p))
          break
        default:
          break
      }
    },
    [router, logout, isPosDemo]
  )

  const [submenuParent, setSubmenuParent] = useState<'business' | 'operations' | null>(null)
  const submenuOpen = submenuParent != null

  const submenuItems = useMemo((): POSSubMenuItem[] => {
    if (!submenuParent) return []
    const items = POS_SUBMENUS[submenuParent]
    if (submenuParent !== 'operations') return items
    return items.filter((item) => item.type !== 'settings' || canAccessAdmin(auth?.role || ''))
  }, [submenuParent, auth?.role])

  const handleTileClick = useCallback(
    (tile: POSTile) => {
      if (tile.type === 'business' || tile.type === 'operations') {
        setSubmenuParent(tile.type)
        return
      }
      switch (tile.type) {
        case 'dine-in':
          navigatePosOfflineAware(isPosDemo ? getPosDemoTerminalRoute('dine_in') : '/pos/terminal?type=dine_in', (p) => router.push(p))
          break
        case 'takeout':
          navigatePosOfflineAware(isPosDemo ? getPosDemoTerminalRoute('takeout') : '/pos/terminal?type=takeout', (p) => router.push(p))
          break
        case 'delivery':
          navigatePosOfflineAware(isPosDemo ? getPosDemoTerminalRoute('delivery') : '/pos/terminal?type=delivery', (p) => router.push(p))
          break
        case 'cash':
          navigatePosOfflineAware(
            isPosDemo ? POS_DEMO_ROUTES.cashManagement : '/pos/local/cash',
            (p) => router.push(p)
          )
          break
        case 'petty-cash':
          navigatePosOfflineAware('/pos/local/petty-cash', (p) => router.push(p))
          break
        case 'attendance':
          navigatePosOfflineAware('/pos/attendance', (p) => router.push(p))
          break
        case 'members':
          navigatePosOfflineAware('/admin/employees', (p) => router.push(p))
          break
        case 'sales':
          navigatePosOfflineAware('/pos/sales', (p) => router.push(p))
          break
        case 'receipt':
          navigatePosOfflineAware('/pos/receipts', (p) => router.push(p))
          break
        default:
          break
      }
    },
    [router, isPosDemo]
  )

  const onSubmenuSelect = useCallback(
    (item: POSSubMenuItem) => {
      setSubmenuParent(null)
      handleSubAction(item.type)
    },
    [handleSubAction]
  )

  const openSwitchUser = useCallback(() => {
    setSwitchError('')
    setSwitchStore(resolveStoreKey((auth?.store || '').trim()))
    setSwitchName('')
    setSwitchPw('')
    setSwitchUserOpen(true)
    getLoginData()
      .then((d) => setSwitchLoginData(d.users || {}))
      .catch(() => setSwitchLoginData({}))
  }, [auth?.store, resolveStoreKey])

  const handleSwitchUser = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!switchStore || !switchName) {
        setSwitchError(t('msg_select_store_name'))
        return
      }
      setSwitchLoading(true)
      setSwitchError('')
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setSwitchError(t('msg_login_need_network'))
        setSwitchLoading(false)
        return
      }
      try {
        const res = await loginCheck({
          store: switchStore,
          name: switchName,
          pw: switchPw,
          isAdminPage: false,
        })
        if (res.success && res.storeName && res.userName) {
          setAuth({
            store: res.storeName,
            user: res.userName,
            role: res.role || '',
            token: res.token,
            ...(res.employeeId != null && res.employeeId > 0 ? { employeeId: res.employeeId } : {}),
            ...(res.employeeCode ? { employeeCode: String(res.employeeCode).trim() } : {}),
          })
          setSwitchUserOpen(false)
          setSwitchPw('')
        } else {
          setSwitchError(translateApiMessage(res.message, t) || res.message || t('msg_login_failed'))
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const friendly =
          msg.includes('fetch') || msg.includes('Failed') || msg.includes('Network') || msg.includes('연결')
            ? t('msg_login_need_network')
            : t('msg_server_error_prefix') + msg
        setSwitchError(friendly)
      } finally {
        setSwitchLoading(false)
      }
    },
    [switchStore, switchName, switchPw, t, setAuth]
  )

  const switchStores = useMemo(
    () => Object.keys(switchLoginData).sort((a, b) => a.localeCompare(b)),
    [switchLoginData]
  )
  const switchUsers = switchStore ? (switchLoginData[switchStore] || []) : []

  const formatDate = (date: Date) => formatPosClockDate(date, lang)
  const formatTime = (date: Date) => formatPosClockTime(date, lang)

  return (
    <PosTourProvider isDemo={isPosDemo} scenarioId={tourScenarioId}>
      <PosTourOverlay />
      <div
        className={cn(
          'flex flex-col h-full bg-gradient-to-b from-slate-50 to-slate-100 text-slate-800 overflow-hidden select-none'
        )}
      >
        {isPosDemo && (
          <div
            className="shrink-0 border-b border-amber-200/80 bg-amber-50 px-3 py-2 text-center text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
            role="status"
          >
            {t('posDemoBanner')}
          </div>
        )}
        <POSHeader
          dataTour={isPosDemo ? 'pos-tour-header' : undefined}
          title={t('posTerminalTitle')}
          showBackButton={false}
          showAdminNavButton={canNavigateFromPosToAdmin(auth?.role || '')}
          onAdminNav={() => navigatePosOfflineAware('/admin', (p) => router.push(p))}
          canAccessAdmin={canAccessAdmin(auth?.role || '')}
          todayOrders={todayOrders}
          totalAmount={totalAmount}
          isMainPosDevice={isMainPosDevice}
          onMainPosDeviceChange={setIsMainPosDevice}
        />

        <POSMainGrid tiles={visibleTiles} onTileClick={handleTileClick} isKorean={lang === 'ko'} />

      <Dialog open={submenuOpen} onOpenChange={(open) => !open && setSubmenuParent(null)}>
        <DialogContent className="max-w-xs sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {submenuParent && t(submenuParent === 'business' ? 'posBusinessManage' : 'posOperationsManage')}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            {submenuItems.map((item) => (
              <Button
                key={item.type}
                variant="outline"
                className="w-full justify-start h-11 text-left"
                onClick={() => onSubmenuSelect(item)}
              >
                {t(item.labelKey)}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={switchUserOpen} onOpenChange={(open) => !open && setSwitchUserOpen(false)}>
        <DialogContent className="max-w-xs sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('posSwitchUserTitle')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSwitchUser} className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label className="text-sm">{t('posSwitchUserStore')}</Label>
              <Select
                value={switchStore}
                onValueChange={(v) => {
                  setSwitchStore(v)
                  setSwitchName('')
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {switchStores.map((s) => (
                    <SelectItem key={s} value={s}>
                      {formatStoreLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">{t('posSwitchUserName')}</Label>
              <Select value={switchName} onValueChange={setSwitchName} disabled={!switchStore}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {switchUsers.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">{t('posSwitchUserPin')}</Label>
              <Input
                type="password"
                value={switchPw}
                onChange={(e) => setSwitchPw(e.target.value)}
                placeholder="PIN"
                autoComplete="off"
                className="w-full"
              />
            </div>
            {switchError && (
              <p className="text-sm text-destructive">{switchError}</p>
            )}
            <Button type="submit" disabled={switchLoading || !switchStore || !switchName}>
              {switchLoading ? '...' : t('posSwitchUserBtn')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <footer className="flex-shrink-0 border-t border-slate-200 bg-white/90 px-2 py-2 backdrop-blur-sm shadow-[0_-1px_0_0_rgba(0,0,0,0.05)] min-[1025px]:px-6 sm:px-4 flex flex-col gap-2 min-[520px]:flex-row min-[520px]:items-center min-[520px]:justify-between min-[520px]:py-1.5 min-[520px]:min-h-14">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-3">
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Circle className="w-2.5 h-2.5 fill-emerald-500 text-emerald-500 animate-pulse" />
            <span className="text-[9px] uppercase tracking-widest text-slate-500 font-mono sm:text-[10px]">
              {t('posOnline')}
            </span>
          </div>
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-slate-200 bg-slate-100/80 px-2 py-1 sm:gap-x-3 sm:px-3 sm:py-1.5">
            <span className="shrink-0 text-slate-500 text-[11px] font-medium sm:text-xs">{t('posSwitchUserStore')}</span>
            <span className="min-w-0 truncate text-xs font-semibold text-slate-800 sm:text-sm">{storeCode || 'POS'}</span>
            <span className="hidden text-slate-300 sm:inline">|</span>
            <span className="shrink-0 text-slate-500 text-[11px] font-medium sm:text-xs">{t('posCurrentUser')}</span>
            <span className="min-w-0 max-w-[42vw] break-words text-xs font-semibold leading-tight text-slate-800 min-[520px]:max-w-[12rem] sm:text-sm md:max-w-none">
              {auth?.user || '—'}
            </span>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-tour={isPosDemo ? 'pos-tour-switch-user' : undefined}
              onClick={openSwitchUser}
              className="h-8 whitespace-nowrap px-2 text-[11px] font-medium border-emerald-400 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-500 sm:px-3 sm:text-xs"
            >
              {t('posSwitchUser')}
            </Button>
            {hybridPosShell ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleResetCacheReload()}
                title={t('posResetCacheReloadTitle') || ''}
                className="h-8 gap-1 px-2 text-[11px] font-medium border-amber-300/80 text-amber-900 hover:bg-amber-50 hover:border-amber-400 sm:gap-1.5 sm:px-3 sm:text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="hidden sm:inline">{t('posResetCacheReload')}</span>
              </Button>
            ) : null}
          </div>
        </div>
        {currentTime && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 pt-2 min-[520px]:border-t-0 min-[520px]:pt-0 sm:gap-4">
            <span className="whitespace-nowrap text-[11px] text-slate-500 sm:text-xs">{formatDate(currentTime)}</span>
            <span className="whitespace-nowrap text-xs font-mono font-medium tabular-nums text-slate-800 sm:text-sm">
              {formatTime(currentTime)}
            </span>
          </div>
        )}
      </footer>
    </div>
    </PosTourProvider>
  )
}

export default function POSMainPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-[200px] flex-1 items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 text-slate-600">
          Loading...
        </div>
      }
    >
      <POSMainPageInner />
    </Suspense>
  )
}
