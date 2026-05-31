'use client'

import { useState, useCallback, useEffect, useMemo, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { navigatePosOfflineAware, prefersPosSessionHardNavigation } from '@/lib/pos-offline-nav'
import { isBrowserOnline } from '@/lib/offline/network'
import { POSHeader } from '@/components/pos/pos-header'
import { POSMainGrid } from '@/components/pos/pos-main-grid'
import { usePosMainDevice } from '@/hooks/use-pos-main-device'
import { DEFAULT_TILES, POS_SUBMENUS, type POSTile, type POSSubMenuItem } from '@/lib/pos-display'
import { cn } from '@/lib/utils'
import { Circle, PlayCircle, RefreshCw } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { ADMIN_UI_LANG_OPTIONS, useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { useStoreList, getPosTodaySales, getLoginData, loginCheck, getPosPrinterSettings } from '@/lib/api-client'
import { translateApiMessage } from '@/lib/translate-api-message'
import type { Store } from '@/lib/pos-types'
import {
  canAccessPosSettlement,
  canAccessPosPrinters,
  canAccessAdmin,
  canAccessPosOrder,
  canNavigateFromPosToAdmin,
  isFranchiseeRole,
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
import { appAlert } from '@/lib/app-message'
import {
  drawerOpenOptionFromPrinterSettings,
  formatPosCashDrawerFailureMessage,
  shouldWarnPosCashDrawerFailure,
} from '@/lib/pos-cash-drawer'
import { usePosCashDrawerOpen } from '@/components/pos/pos-drawer-pin-provider'
import { PosDrawerPinSettingsDialog } from '@/components/pos/pos-drawer-pin-settings-dialog'

/** POS 첫 화면: 주문(매장/포장/배달), 영수증, 결산, 근태 등 타일 */
function POSMainPageInner() {
  const searchParams = useSearchParams()
  const isPosDemo = isPosDemoFromQuery(searchParams)
  const tourScenarioId = getPosTourScenarioIdFromQuery(searchParams, DEFAULT_POS_HOME_TOUR_SCENARIO_ID)
  const requestedScenarioId = String(searchParams.get('scenario') || '').trim()
  const router = useRouter()
  const { auth, logout, setAuth } = useAuth()
  const { lang, setLang } = useLang()
  const t = useT(lang)
  const { stores, formatStoreLabel, resolveStoreKey } = useStoreList()
  const preferredStoreFromQuery = useMemo(
    () => String(searchParams.get('store') || '').trim(),
    [searchParams]
  )
  const queryStoreAppliedRef = useRef('')

  const selectableStoreCodes = useMemo(() => {
    const list = stores
    const role = String(auth?.role || '')
    if (isOfficeRole(role)) {
      if (list.length > 0) return list
      return auth?.store ? [auth.store] : []
    }
    if (isFranchiseeRole(role) && auth?.allowedStores && auth.allowedStores.length > 0) {
      const allowed = auth.allowedStores.map((x) => String(x || '').trim()).filter(Boolean)
      if (list.length > 0) {
        const filtered = list.filter((code) =>
          allowed.some((a) => resolveStoreKey(a) === resolveStoreKey(code))
        )
        if (filtered.length > 0) return filtered
      }
      return [...allowed].sort((a, b) => a.localeCompare(b))
    }
    if (auth?.store) return [auth.store]
    return list
  }, [stores, auth?.role, auth?.store, auth?.allowedStores, resolveStoreKey])

  const posHomeHeaderStores = useMemo((): Store[] => {
    return selectableStoreCodes.map((id) => ({
      id,
      name: formatStoreLabel(id),
      tables: [],
      gridCols: 0,
      gridRows: 0,
    }))
  }, [selectableStoreCodes, formatStoreLabel])
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
  const [demoIntroAccepted, setDemoIntroAccepted] = useState(false)
  const showDemoIntro = isPosDemo && !requestedScenarioId && !demoIntroAccepted
  const isDemoTourEnabled = isPosDemo && !showDemoIntro
  const businessNavDrawerWarnedRef = useRef(false)
  const [drawerPinSettingsOpen, setDrawerPinSettingsOpen] = useState(false)
  const { openPosCashDrawerSecure, invalidateDrawerPinCache } = usePosCashDrawerOpen()
  const canManageDrawerPin = canAccessPosPrinters(auth?.role || '') || canAccessPosSettlement(auth?.role || '')
  const navigateWatchdogRef = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (navigateWatchdogRef.current != null) {
        window.clearTimeout(navigateWatchdogRef.current)
        navigateWatchdogRef.current = null
      }
    },
    []
  )

  const pushPosRouteWithFallback = useCallback(
    (target: string) => {
      const currentUrl =
        typeof window === 'undefined'
          ? ''
          : `${window.location.pathname || ''}${window.location.search || ''}`
      navigatePosOfflineAware(target, (p) => router.push(p))
      // 오프라인에서 라우트 청크가 캐시에 없으면 push가 no-op인 사례가 있어, 동일 URL에 머물면 하드 네비 1회 재시도.
      if (typeof window === 'undefined' || !target.startsWith('/pos/')) return
      const shouldWatchdogFallback =
        !isBrowserOnline() || prefersPosSessionHardNavigation()
      if (!shouldWatchdogFallback) return
      if (navigateWatchdogRef.current != null) {
        window.clearTimeout(navigateWatchdogRef.current)
        navigateWatchdogRef.current = null
      }
      navigateWatchdogRef.current = window.setTimeout(() => {
        const now = `${window.location.pathname || ''}${window.location.search || ''}`
        if (now === currentUrl) window.location.assign(target)
        navigateWatchdogRef.current = null
      }, 850)
    },
    [router]
  )

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

  const storeCode = useMemo(() => {
    const list = selectableStoreCodes
    const a = (auth?.store || '').trim()
    if (!list.length) return a || stores[0] || ''
    const found = list.find((s) => s === a || resolveStoreKey(s) === resolveStoreKey(a))
    return found || list[0] || a || ''
  }, [selectableStoreCodes, auth?.store, stores, resolveStoreKey])
  const [isMainPosDevice, setIsMainPosDevice] = usePosMainDevice(storeCode || null)

  useEffect(() => {
    const preferred = preferredStoreFromQuery
    if (!auth || !preferred) return
    if (queryStoreAppliedRef.current === preferred) return
    const targetStore = selectableStoreCodes.find(
      (s) => s === preferred || resolveStoreKey(s) === resolveStoreKey(preferred)
    )
    if (!targetStore) return
    queryStoreAppliedRef.current = preferred
    if ((auth.store || '').trim() === targetStore) return
    setAuth({ ...auth, store: targetStore })
  }, [auth, preferredStoreFromQuery, selectableStoreCodes, resolveStoreKey, setAuth])

  const handlePosHomeStoreChange = useCallback(
    (nextId: string) => {
      if (!auth) return
      setAuth({ ...auth, store: nextId })
    },
    [auth, setAuth]
  )
  const handlePosHomeHeaderRefresh = useCallback(() => {
    if (storeCode) {
      return getPosTodaySales({ storeCode, forceNetwork: true })
        .then(setTodaySales)
        .catch(() => setTodaySales(null))
    }
    window.location.reload()
  }, [storeCode])

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
          // 직원(staff/pos_staff)도 영업 시작/마감 화면을 사용할 수 있게 허용
          return canAccessPosSettlement(auth?.role || '') || canAccessPosOrder(auth?.role || '')
        case 'cash':
          // 직원(staff/pos_staff)도 Pay In/Pay Out(시재) 화면을 사용 가능해야 함
          return canAccessPosSettlement(auth?.role || '') || canAccessPosOrder(auth?.role || '')
        case 'petty-cash':
          return isManagerOrFranchiseeRole(auth?.role || '') || isOfficeRole(auth?.role || '')
        case 'operations':
          return true
        default:
          return true
      }
    })
  }, [auth?.role, isPosDemo])

  const kickDrawerThenNavigate = useCallback(
    async (mode: 'open' | 'close', path: string) => {
      if (!isPosDemo && storeCode) {
        const hw = await getPosPrinterSettings({ storeCode }).catch(() => null)
        const dr = await openPosCashDrawerSecure({
          reason: mode === 'open' ? 'business_open_nav' : 'business_close_nav',
          source: mode === 'open' ? 'business_open_nav' : 'business_close_nav',
          storeCode,
          userName: auth?.user,
          drawerOpenOption: drawerOpenOptionFromPrinterSettings(hw),
        })
        if (dr.success) {
          // 성공하면 경고 플래그를 풀어 이후 실제 실패를 다시 감지한다.
          businessNavDrawerWarnedRef.current = false
        }
        if (!dr.success && shouldWarnPosCashDrawerFailure(dr.error) && !businessNavDrawerWarnedRef.current) {
          businessNavDrawerWarnedRef.current = true
          await appAlert(
            formatPosCashDrawerFailureMessage(t, dr.error)
          )
        }
      }
      pushPosRouteWithFallback(path)
    },
    [isPosDemo, storeCode, auth?.user, t, pushPosRouteWithFallback, openPosCashDrawerSecure]
  )

  /** 세부 메뉴에서 선택한 항목 실행 (영업/운영 하위) */
  const handleSubAction = useCallback(
    (subType: string) => {
      switch (subType) {
        case 'open':
          void kickDrawerThenNavigate(
            'open',
            isPosDemo ? POS_DEMO_ROUTES.businessOpen : '/pos/settlement?mode=open'
          )
          break
        case 'close':
          void kickDrawerThenNavigate(
            'close',
            isPosDemo ? POS_DEMO_ROUTES.businessClose : '/pos/settlement'
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
        case 'drawer-pin':
          setSubmenuParent(null)
          setDrawerPinSettingsOpen(true)
          break
        default:
          break
      }
    },
    [router, logout, isPosDemo, kickDrawerThenNavigate]
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
          pushPosRouteWithFallback(
            isPosDemo ? getPosDemoTerminalRoute('dine_in') : '/pos/terminal?type=dine_in'
          )
          break
        case 'takeout':
          pushPosRouteWithFallback(
            isPosDemo ? getPosDemoTerminalRoute('takeout') : '/pos/terminal?type=takeout'
          )
          break
        case 'delivery':
          pushPosRouteWithFallback(
            isPosDemo ? getPosDemoTerminalRoute('delivery') : '/pos/terminal?type=delivery'
          )
          break
        case 'cash':
          pushPosRouteWithFallback(isPosDemo ? POS_DEMO_ROUTES.cashManagement : '/pos/local/cash')
          break
        case 'petty-cash':
          pushPosRouteWithFallback('/pos/local/petty-cash')
          break
        case 'attendance':
          pushPosRouteWithFallback('/pos/attendance')
          break
        case 'members':
          navigatePosOfflineAware('/admin/employees', (p) => router.push(p))
          break
        case 'sales':
          pushPosRouteWithFallback('/pos/sales')
          break
        case 'receipt':
          pushPosRouteWithFallback('/pos/receipts')
          break
        default:
          break
      }
    },
    [isPosDemo, pushPosRouteWithFallback, router]
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
    <PosTourProvider isDemo={isDemoTourEnabled} scenarioId={tourScenarioId}>
      <PosTourOverlay />
      {showDemoIntro ? (
        <div className="relative flex h-full min-h-[200px] flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_15%_20%,rgba(16,185,129,0.18),transparent_38%),radial-gradient(circle_at_85%_80%,rgba(59,130,246,0.2),transparent_42%),linear-gradient(140deg,#020617,#0f172a_45%,#111827)] p-6 text-slate-100">
          <div className="pointer-events-none absolute -left-14 top-10 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="pointer-events-none absolute -right-12 bottom-6 h-52 w-52 rounded-full bg-blue-400/10 blur-3xl" />
          <div className="relative w-full max-w-2xl rounded-3xl border border-white/15 bg-black/30 p-7 shadow-2xl backdrop-blur-xl sm:p-9">
            <p className="inline-flex rounded-full border border-emerald-300/35 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
              {t('posDemoIntroBadge')}
            </p>
            <h1 className="mt-4 text-3xl font-bold leading-tight text-white sm:text-5xl">
              {t('posDemoIntroTitle')}
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-200/90 sm:text-base">
              {t('posDemoLanguageGateTitle')}
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-medium">
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-slate-100">{t('posDemoIntroTagOrderFlow')}</span>
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-slate-100">{t('posDemoIntroTagSettlement')}</span>
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-slate-100">{t('posDemoIntroTagCashControl')}</span>
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-slate-100">{t('posDemoIntroTagTerminalTour')}</span>
            </div>
            <div className="mt-6 max-w-xs">
              <Label className="mb-1.5 block text-xs font-medium text-slate-200/90">{t('posLanguage')}</Label>
              <Select
                value={lang}
                onValueChange={(v) => {
                  if (v) setLang(v as typeof lang)
                }}
              >
                <SelectTrigger className="h-11 border-white/25 bg-white/10 text-white placeholder:text-slate-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADMIN_UI_LANG_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="mt-7">
              <Button
                type="button"
                size="lg"
                className="h-12 min-w-44 gap-2 bg-emerald-500 px-7 text-base font-semibold text-black hover:bg-emerald-400"
                onClick={() => setDemoIntroAccepted(true)}
              >
                <PlayCircle className="h-5 w-5" aria-hidden />
                {t('posDemoLanguageGateStart')}
              </Button>
            </div>
          </div>
        </div>
      ) : (
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
          stores={posHomeHeaderStores}
          currentStoreId={storeCode}
          onStoreChange={handlePosHomeStoreChange}
          onRefresh={handlePosHomeHeaderRefresh}
          canChangeStore={selectableStoreCodes.length > 0}
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
      <PosDrawerPinSettingsDialog
        open={drawerPinSettingsOpen}
        onOpenChange={setDrawerPinSettingsOpen}
        storeCode={storeCode}
        canManage={canManageDrawerPin}
        onSaved={() => invalidateDrawerPinCache(storeCode)}
      />
    </div>
      )}
    </PosTourProvider>
  )
}

function PosPageLoadingFallback() {
  const { lang } = useLang()
  const t = useT(lang)
  return (
    <div className="flex h-full min-h-[200px] flex-1 items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 text-slate-600">
      {t("loading")}
    </div>
  )
}

export default function POSMainPage() {
  return (
    <Suspense fallback={<PosPageLoadingFallback />}>
      <POSMainPageInner />
    </Suspense>
  )
}
