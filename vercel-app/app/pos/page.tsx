'use client'

import { appAlert } from '@/lib/app-message'
import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { POSHeader } from '@/components/pos/pos-header'
import { POSMainGrid } from '@/components/pos/pos-main-grid'
import { usePosMainDevice } from '@/hooks/use-pos-main-device'
import { DEFAULT_TILES, POS_SUBMENUS, type POSTile, type POSSubMenuItem } from '@/lib/pos-display'
import { cn } from '@/lib/utils'
import { Circle } from 'lucide-react'
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
import { warmAdminOfflineCache } from '@/lib/offline/pos-offline-warm'
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
export default function POSMainPage() {
  const router = useRouter()
  const { auth, logout, setAuth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()
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
  const warmStoreCodes = useMemo(() => {
    if (isOfficeRole(auth?.role || '')) return stores
    if (auth?.store) return [auth.store]
    return stores.length ? [stores[0]] : []
  }, [auth?.role, auth?.store, stores])
  const [prefetchOfflineBusy, setPrefetchOfflineBusy] = useState(false)
  const handlePrefetchOffline = useCallback(async () => {
    if (!warmStoreCodes.length) return
    setPrefetchOfflineBusy(true)
    const r = await warmAdminOfflineCache({ storeCodes: warmStoreCodes })
    setPrefetchOfflineBusy(false)
    if (r.ok) await appAlert(t('posOfflinePrefetchDone'))
    else
      await appAlert(
        (t('posOfflinePrefetchFail') || '') +
          (r.errors.length ? ` (${r.errors.slice(0, 4).join(', ')})` : '')
      )
  }, [warmStoreCodes, t])

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

  const todayOrders = todaySales?.completedCount ?? 0
  const totalAmount = todaySales?.completedTotal ?? 0

  const visibleTiles = useMemo(() => {
    return DEFAULT_TILES.filter((tile) => {
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
  }, [auth?.role])

  /** 세부 메뉴에서 선택한 항목 실행 (영업/운영 하위) */
  const handleSubAction = useCallback(
    (subType: string) => {
      switch (subType) {
        case 'open':
          router.push('/pos/settlement?mode=open')
          break
        case 'close':
          router.push('/pos/settlement')
          break
        case 'refresh':
          window.location.reload()
          break
        case 'logout':
          logout?.()
          break
        case 'settings':
          router.push('/admin')
          break
        default:
          break
      }
    },
    [router, logout]
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
          router.push('/pos/terminal?type=dine_in')
          break
        case 'takeout':
          router.push('/pos/terminal?type=takeout')
          break
        case 'delivery':
          router.push('/pos/terminal?type=delivery')
          break
        case 'cash':
          router.push('/pos/local/cash')
          break
        case 'petty-cash':
          router.push('/pos/local/petty-cash')
          break
        case 'attendance':
          router.push('/pos/attendance')
          break
        case 'members':
          router.push('/admin/employees')
          break
        case 'sales':
          router.push('/pos/sales')
          break
        case 'receipt':
          router.push('/pos/receipts')
          break
        default:
          break
      }
    },
    [router]
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
    setSwitchStore(auth?.store || '')
    setSwitchName('')
    setSwitchPw('')
    setSwitchUserOpen(true)
    getLoginData()
      .then((d) => setSwitchLoginData(d.users || {}))
      .catch(() => setSwitchLoginData({}))
  }, [auth?.store])

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
    <div
      className={cn(
        'flex flex-col h-full bg-gradient-to-b from-slate-50 to-slate-100 text-slate-800 overflow-hidden select-none'
      )}
    >
      <POSHeader
        title={t('posTerminalTitle')}
        showBackButton={false}
        showAdminNavButton={canNavigateFromPosToAdmin(auth?.role || '')}
        onAdminNav={() => router.push('/admin')}
        canAccessAdmin={canAccessAdmin(auth?.role || '')}
        todayOrders={todayOrders}
        totalAmount={totalAmount}
        isMainPosDevice={isMainPosDevice}
        onMainPosDeviceChange={setIsMainPosDevice}
        onPrefetchOfflineData={warmStoreCodes.length ? handlePrefetchOffline : undefined}
        prefetchOfflineDataBusy={prefetchOfflineBusy}
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
                      {s}
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

      <footer className="flex-shrink-0 h-14 px-4 min-[1025px]:px-6 border-t border-slate-200 flex items-center justify-between bg-white/90 backdrop-blur-sm shadow-[0_-1px_0_0_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Circle className="w-2.5 h-2.5 fill-emerald-500 text-emerald-500 animate-pulse" />
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-mono">
              {t('posOnline')}
            </span>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-slate-100/80 px-3 py-1.5 border border-slate-200">
            <span className="text-slate-500 text-xs font-medium">{t('posSwitchUserStore')}</span>
            <span className="text-sm font-semibold text-slate-800">{storeCode || 'POS'}</span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-500 text-xs font-medium">{t('posCurrentUser')}</span>
            <span className="text-sm font-semibold text-slate-800">{auth?.user || '—'}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openSwitchUser}
            className="h-8 px-3 text-xs font-medium border-emerald-400 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-500"
          >
            {t('posSwitchUser')}
          </Button>
        </div>
        {currentTime && (
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500">{formatDate(currentTime)}</span>
            <span className="text-sm font-mono font-medium tabular-nums text-slate-800">
              {formatTime(currentTime)}
            </span>
          </div>
        )}
      </footer>
    </div>
  )
}
