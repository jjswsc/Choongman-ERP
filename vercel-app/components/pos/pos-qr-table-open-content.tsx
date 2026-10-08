'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Home, Loader2, Minus, Plus, Printer, QrCode, RefreshCw } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useStoreList } from '@/lib/api-client'
import { getPosTableLayout, type PosFloorLabels, type PosTableItem } from '@/lib/api-client/pos-table-printer'
import {
  qrTableAdminGet,
  qrTableStaffEnqueuePrintTableQr,
  qrTableStaffOpenSession,
  qrTableStaffSessionsMap,
} from '@/lib/api-client/qr-table'
import { appAlert } from '@/lib/app-message'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { navigatePosOfflineAware } from '@/lib/pos-offline-nav'
import { canAccessPosOrder } from '@/lib/permissions'
import { buffetTierDisplayName, defaultQrOrderStoreSettings } from '@/lib/qr-table-types'
import type { QrBuffetTier, QrOrderStoreSettings } from '@/lib/qr-table-types'
import { resolvePosFloorDisplayLabel } from '@/lib/pos-table-layout-payload'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

type OpenSessionRow = {
  tableName: string
  status: string
  entryPaid: boolean
}

function sessionKey(name: string): string {
  return String(name || '').trim().toLowerCase()
}

function defaultGuests(table: PosTableItem): number {
  const seats = Math.floor(Number(table.seats) || 0)
  if (seats >= 1 && seats <= 20) return seats
  return 2
}

/** 메인 POS가 아닌 오더 태블릿·직원 휴대폰에서 테이블 QR 세션을 연다. */
export function PosQrTableOpenContent() {
  const { auth, initialized } = useAuth()
  const { posStores, formatStoreLabel } = useStoreList()
  const router = useRouter()
  const { lang } = useLang()
  const t = useT(lang)
  const storeCode = String(auth?.store || posStores[0] || '').trim()

  const [loading, setLoading] = React.useState(true)
  const [tables, setTables] = React.useState<PosTableItem[]>([])
  const [floorLabels, setFloorLabels] = React.useState<PosFloorLabels>({})
  const [settings, setSettings] = React.useState<QrOrderStoreSettings>(defaultQrOrderStoreSettings(''))
  const [tiers, setTiers] = React.useState<QrBuffetTier[]>([])
  const [sessions, setSessions] = React.useState<Record<string, OpenSessionRow>>({})
  const [guests, setGuests] = React.useState<Record<string, number>>({})
  const [tierId, setTierId] = React.useState('')
  const [floor, setFloor] = React.useState<number | 'all'>('all')
  const [openingId, setOpeningId] = React.useState<string | null>(null)
  const [printingId, setPrintingId] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState('')

  const isAlaCarte = settings.mode === 'a_la_carte'
  const activeTiers = tiers.filter((tier) => tier.active)

  const load = React.useCallback(async () => {
    if (!storeCode) {
      setTables([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [layout, adminRes, mapRes] = await Promise.all([
        getPosTableLayout({ storeCode, forceNetwork: true }),
        qrTableAdminGet(storeCode),
        qrTableStaffSessionsMap(storeCode),
      ])
      const nextTables = (layout?.layout || []).filter((row) => String(row.name || '').trim())
      setTables(nextTables)
      setFloorLabels(layout?.floorLabels || {})
      setGuests((prev) => {
        const next = { ...prev }
        for (const row of nextTables) {
          if (next[row.id] == null) next[row.id] = defaultGuests(row)
        }
        return next
      })
      if (adminRes.settings) {
        setSettings(adminRes.settings)
      } else if (mapRes.success) {
        setSettings((prev) => ({ ...prev, storeCode, enabled: mapRes.enabled !== false }))
      }
      const nextTiers = (adminRes.tiers || []).filter((tier) => tier.active)
      setTiers(nextTiers)
      setTierId((prev) => {
        if (adminRes.settings?.mode === 'a_la_carte') return ''
        if (prev && nextTiers.some((tier) => String(tier.id) === prev)) return prev
        return nextTiers[0] ? String(nextTiers[0].id) : ''
      })
      const nextSessions: Record<string, OpenSessionRow> = {}
      for (const row of mapRes.sessions || []) {
        const key = sessionKey(row.tableName)
        if (!key) continue
        nextSessions[key] = {
          tableName: row.tableName,
          status: row.status,
          entryPaid: row.entryPaid,
        }
      }
      setSessions(nextSessions)
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : String(e))
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

  const floors = React.useMemo(() => {
    const set = new Set<number>()
    for (const row of tables) {
      const n = Math.floor(Number(row.floor) || 1)
      if (n >= 1 && n <= 3) set.add(n)
    }
    return [...set].sort((a, b) => a - b)
  }, [tables])

  const visibleTables = React.useMemo(() => {
    return tables
      .filter((row) => floor === 'all' || Math.floor(Number(row.floor) || 1) === floor)
      .slice()
      .sort((a, b) => {
        const fa = Math.floor(Number(a.floor) || 1) - Math.floor(Number(b.floor) || 1)
        if (fa) return fa
        return String(a.name).localeCompare(String(b.name), undefined, { numeric: true })
      })
  }, [tables, floor])

  async function printTableQr(table: PosTableItem) {
    const name = String(table.name || '').trim()
    if (!storeCode || !name || printingId) return
    setPrintingId(table.id)
    try {
      const res = await qrTableStaffEnqueuePrintTableQr({
        storeCode,
        tableName: name,
        storeLabel: formatStoreLabel(storeCode),
        scanTh: t('qrTableScanTh') || 'สแกนเพื่อสั่งอาหาร',
        scanEn: t('qrTableScanEn') || 'Scan to order from your phone',
      })
      if (!res.success) {
        const msg = String(res.message || '')
        await appAlert(
          msg === 'qr_print_no_token'
            ? t('qrTablePrintNoToken') ||
                '이 테이블 QR이 없습니다. 관리자 화면에서 레이아웃 기준 생성을 먼저 해 주세요.'
            : t('qrTablePrintFailed') || 'QR 인쇄에 실패했습니다.'
        )
        return
      }
      setNotice(
        t('qrTablePrintQueuedMain') ||
          '메인 POS 영수증 프린터로 인쇄 요청을 보냈습니다. 메인 POS가 켜져 있는지 확인해 주세요.'
      )
    } finally {
      setPrintingId(null)
    }
  }

  async function openTable(table: PosTableItem) {
    const name = String(table.name || '').trim()
    if (!storeCode || !name || openingId) return
    if (!isAlaCarte && !tierId) {
      await appAlert(t('posQrTableOpenNeedPackage') || '패키지를 선택해 주세요.')
      return
    }
    const guestCount = Math.min(99, Math.max(1, Math.floor(Number(guests[table.id]) || defaultGuests(table))))
    setOpeningId(table.id)
    try {
      const res = await qrTableStaffOpenSession({
        storeCode,
        tableName: name,
        guestCount,
        tierId: isAlaCarte ? 0 : Number(tierId || 0),
        entryPaymentChoice: 'postpay',
        extrasPaymentChoice: 'postpay',
      })
      if (!res.success || !res.session) {
        const msg = String(res.message || '')
        const text =
          msg === 'table_busy'
            ? t('posQrTableOpenBusy') || '이미 열린 테이블입니다.'
            : msg === 'tier_required'
              ? t('posQrTableOpenNeedPackage') || '패키지를 선택해 주세요.'
              : msg === 'store_disabled'
                ? t('posQrTableOpenDisabled') || '이 매장은 QR 테이블오더가 꺼져 있습니다.'
                : t('posQrTableOpenFailed') || '테이블을 열지 못했습니다.'
        await appAlert(text)
        if (msg === 'table_busy') void load()
        return
      }
      setSessions((prev) => ({
        ...prev,
        [sessionKey(name)]: {
          tableName: name,
          status: res.session?.status || 'active',
          entryPaid: Boolean(res.session?.entryPaid),
        },
      }))
      setNotice((t('posQrTableOpenDone') || '{name} 테이블을 열었습니다.').replace('{name}', name))
    } finally {
      setOpeningId(null)
    }
  }

  function statusLabel(row: OpenSessionRow | undefined): string {
    if (!row) return t('posQrTableOpenClosed') || '아직 안 열림'
    if (row.status === 'active' && row.entryPaid) return t('qrTableSessionOrdering') || 'QR 주문중'
    return t('qrTableSessionAwaitConfirm') || '입장 후불 확정 필요'
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 truncate text-xl font-bold tracking-tight">
            <QrCode className="h-5 w-5 shrink-0" aria-hidden />
            {t('posQrTableOpenTile') || 'QR 테이블 오픈'}
          </h1>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {t('posQrTableOpenHint') ||
              '메인 POS가 아니어도 됩니다. 오더 태블릿과 직원 휴대폰에서 테이블을 열고 QR 인쇄를 누르면, 메인 POS 영수증 프린터로 나갑니다.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 gap-1.5 touch-manipulation"
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="hidden sm:inline">{t('posRefresh') || '새로고침'}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 gap-1.5 touch-manipulation"
            title={t('posHome') || '포스 첫 화면'}
            onClick={() => navigatePosOfflineAware('/pos', (p) => router.push(p))}
          >
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">{t('posHome') || '홈'}</span>
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {!storeCode ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {t('qrTableSelectStore') || '매장을 선택해 주세요.'}
          </p>
        ) : loading ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          </div>
        ) : !settings.enabled ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {t('posQrTableOpenDisabled') || '이 매장은 QR 테이블오더가 꺼져 있습니다.'}
          </p>
        ) : (
          <>
            {notice ? (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900" role="status">
                {notice}
              </p>
            ) : null}

            {!isAlaCarte ? (
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-slate-700">{t('qrTableSessionTier') || '패키지'}</span>
                <Select value={tierId} onValueChange={setTierId}>
                  <SelectTrigger className="h-11 bg-white text-base">
                    <SelectValue placeholder={t('qrTableSessionSelectTier') || '선택'} />
                  </SelectTrigger>
                  <SelectContent>
                    {activeTiers.map((tier) => (
                      <SelectItem key={tier.id} value={String(tier.id)}>
                        {buffetTierDisplayName(tier, lang)} (฿{tier.pricePerPerson})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ) : (
              <p className="text-sm text-muted-foreground">{t('qrTableSessionAlaCarte') || '메뉴별 주문'}</p>
            )}

            {floors.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={floor === 'all' ? 'default' : 'outline'}
                  className="h-10 touch-manipulation"
                  onClick={() => setFloor('all')}
                >
                  {t('posStatusAll') || '전체'}
                </Button>
                {floors.map((n) => (
                  <Button
                    key={n}
                    type="button"
                    size="sm"
                    variant={floor === n ? 'default' : 'outline'}
                    className="h-10 touch-manipulation"
                    onClick={() => setFloor(n)}
                  >
                    {resolvePosFloorDisplayLabel(n as 1 | 2 | 3, floorLabels, 'Floor {n}')}
                  </Button>
                ))}
              </div>
            ) : null}

            {visibleTables.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {t('qrTableNoTables') || '테이블 레이아웃에 테이블이 없습니다.'}
              </p>
            ) : (
              <ul className="space-y-2 pb-6">
                {visibleTables.map((table) => {
                  const open = sessions[sessionKey(table.name)]
                  const count = guests[table.id] ?? defaultGuests(table)
                  const busy = openingId === table.id
                  const printBusy = printingId === table.id
                  return (
                    <li
                      key={table.id}
                      className={cn(
                        'flex flex-wrap items-center gap-3 rounded-xl border px-3 py-3',
                        open ? 'border-emerald-200 bg-emerald-50/70' : 'border-slate-200 bg-white'
                      )}
                    >
                      <div className="min-w-[5.5rem] flex-1">
                        <p className="text-lg font-bold leading-none">{table.name}</p>
                        <p className={cn('mt-1 text-xs', open ? 'font-semibold text-emerald-800' : 'text-slate-500')}>
                          {statusLabel(open)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="sr-only">{t('qrTableSessionGuests') || '인원'}</span>
                        <button
                          type="button"
                          className="inline-flex h-11 w-11 items-center justify-center rounded-full border bg-white text-lg disabled:opacity-50"
                          disabled={busy || Boolean(open)}
                          onClick={() =>
                            setGuests((prev) => ({
                              ...prev,
                              [table.id]: Math.max(1, (prev[table.id] ?? count) - 1),
                            }))
                          }
                          aria-label="−"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-8 text-center text-base font-semibold tabular-nums">{count}</span>
                        <button
                          type="button"
                          className="inline-flex h-11 w-11 items-center justify-center rounded-full border bg-white text-lg disabled:opacity-50"
                          disabled={busy || Boolean(open)}
                          onClick={() =>
                            setGuests((prev) => ({
                              ...prev,
                              [table.id]: Math.min(99, (prev[table.id] ?? count) + 1),
                            }))
                          }
                          aria-label="+"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 gap-1 touch-manipulation"
                        disabled={printBusy || Boolean(printingId)}
                        title={
                          t('qrTableSessionPrintQrHint') ||
                          '메인 POS 영수증 프린터로 테이블 QR을 출력합니다.'
                        }
                        onClick={() => void printTableQr(table)}
                      >
                        {printBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Printer className="h-4 w-4" aria-hidden />
                        )}
                        <span className="hidden sm:inline">{t('qrTableSessionPrintQr') || 'QR 인쇄'}</span>
                      </Button>
                      <Button
                        type="button"
                        className="h-11 min-w-[5.5rem] touch-manipulation"
                        disabled={busy || Boolean(open) || (!isAlaCarte && !tierId)}
                        onClick={() => void openTable(table)}
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          t('qrTableSessionOpen') || 'QR 세션 오픈'
                        )}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  )
}
