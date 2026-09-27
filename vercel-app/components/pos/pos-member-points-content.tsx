'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Home, Loader2, RefreshCw, Search, Users } from 'lucide-react'
import { appAlert, appConfirm } from '@/lib/app-message'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth-context'
import {
  attachPosOrderMember,
  getMembers,
  getPosBusinessDaySettings,
  getPosOrders,
  type Member,
  type PosOrder,
} from '@/lib/api-client'
import { useLang } from '@/lib/lang-context'
import { tr as i18nTr, useT } from '@/lib/i18n'
import { addDaysYmd, getPosBusinessDateStr, setPosBusinessHoursClient } from '@/lib/pos-business-day'
import { isPosOrderMergedAbsorbRow } from '@/lib/pos-order-merge'
import { resolveAttachMemberAfterPayEligibility } from '@/lib/pos-attach-member-after-pay'
import { formatMemberPointsDisplay } from '@/lib/member-points-math'
import { navigatePosOfflineAware } from '@/lib/pos-offline-nav'
import { canAccessAdmin, isManagerOrFranchiseeRole, isOfficeRole } from '@/lib/permissions'
import { useOnlineStatus } from '@/lib/offline'
import { cn } from '@/lib/utils'

function memberDisplayName(row: Pick<Member, 'fullName' | 'name' | 'memberNo'>): string {
  return String(row.fullName || row.name || row.memberNo || '').trim()
}

function eligibilityForOrder(order: PosOrder) {
  const createdAt = order.createdAt ? new Date(order.createdAt) : null
  const orderBd =
    createdAt && !Number.isNaN(createdAt.getTime()) ? getPosBusinessDateStr(createdAt) : ''
  const todayBd = getPosBusinessDateStr(new Date())
  return resolveAttachMemberAfterPayEligibility({
    status: order.status,
    total: order.total,
    paymentCash: order.paymentCash,
    paymentCard: order.paymentCard,
    paymentQr: order.paymentQr,
    paymentOther: order.paymentOther,
    paymentDeliveryApp: order.paymentDeliveryApp,
    memberId: order.memberId,
    memberNo: order.memberNo,
    pointEarned: order.pointEarned,
    pointUsed: order.pointUsed,
    mergedAbsorb: isPosOrderMergedAbsorbRow(order),
    orderBusinessDay: orderBd,
    todayBusinessDay: todayBd,
    yesterdayBusinessDay: todayBd ? addDaysYmd(todayBd, -1) : '',
  })
}

function formatBillWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', {
    timeZone: 'Asia/Bangkok',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatBillAmount(amount: number): string {
  return Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

function orderKindLabel(order: PosOrder, t: (k: string) => string): string {
  const table = String(order.tableName || '').trim()
  if (table) return table
  const kind = String(order.orderType || '').trim().toLowerCase()
  if (kind === 'dine_in' || kind === 'dine-in') return t('posOrderTypeDineIn')
  if (kind === 'takeout' || kind === 'take_out') return t('posOrderTypeTakeout')
  if (kind === 'delivery') return t('posOrderTypeDelivery')
  return String(order.orderType || '').trim()
}

function resolveEarnError(code: string, t: (k: string) => string): string {
  if (code === 'today_only' || code === 'outside_window') return t('posReceiptAttachMemberTodayOnly')
  if (code === 'status' || code === 'status_not_correctable' || code === 'not_paid') {
    return t('posReceiptAttachMemberStatus')
  }
  if (code === 'already_earned') return t('posReceiptAttachMemberAlready')
  if (code === 'already_member') return t('posReceiptAttachMemberAlreadyLinked')
  if (code === 'member_inactive') return t('posReceiptAttachMemberInactive')
  if (code === 'member_not_found') return t('posReceiptAttachMemberNotFound')
  if (code === 'member_required' || code === 'id_required') return t('posReceiptAttachMemberNeedPick')
  if (code === 'forbidden_store') return t('posReceiptPayCorrectForbidden')
  if (code === 'Unauthorized' || code.includes('인증이 필요합니다')) {
    return t('posReceiptPayCorrectUnauthorized')
  }
  if (code === 'merged') return t('posOrderStatusMergedAbsorb')
  return code
}

/** POS 홈 「회원」 — 전 직원이 오늘·어제 영수증에 회원을 연결해 결제 금액만큼 적립 */
export function PosMemberPointsContent() {
  const { auth, initialized } = useAuth()
  const router = useRouter()
  const t = useT(useLang().lang)
  const online = useOnlineStatus()
  const storeCode = String(auth?.store || '').trim()
  const canAdjustWithoutReceipt =
    isManagerOrFranchiseeRole(auth?.role || '') || isOfficeRole(auth?.role || '')

  const [keyword, setKeyword] = React.useState('')
  const [searching, setSearching] = React.useState(false)
  const [searchEmpty, setSearchEmpty] = React.useState(false)
  const [results, setResults] = React.useState<Member[]>([])
  const [member, setMember] = React.useState<Member | null>(null)
  const [orders, setOrders] = React.useState<PosOrder[]>([])
  const [billsLoading, setBillsLoading] = React.useState(false)
  const [bizToday, setBizToday] = React.useState('')
  const [savingId, setSavingId] = React.useState<number | null>(null)
  const [billQuery, setBillQuery] = React.useState('')

  const visibleOrders = React.useMemo(() => {
    const q = billQuery.trim().toLowerCase()
    if (!q) return orders
    return orders.filter((order) => {
      const hay = [order.orderNo, order.tableName, order.memberNo, String(order.id)]
        .map((part) => String(part || '').toLowerCase())
        .join(' ')
      return hay.includes(q)
    })
  }, [billQuery, orders])

  const loadBills = React.useCallback(async () => {
    if (!storeCode) {
      setOrders([])
      setBizToday('')
      return
    }
    setBillsLoading(true)
    try {
      const hours = await getPosBusinessDaySettings(storeCode).catch(() => null)
      if (hours) {
        setPosBusinessHoursClient({
          start: { hour: hours.hour, minute: hours.minute },
          end: { hour: hours.endHour, minute: hours.endMinute },
        })
      }
      const todayBd = getPosBusinessDateStr(new Date())
      const yesterdayBd = todayBd ? addDaysYmd(todayBd, -1) : ''
      setBizToday(todayBd)
      const rows = await getPosOrders({
        startStr: yesterdayBd || todayBd,
        endStr: todayBd,
        posBizDayScope: true,
        storeCode,
        strictStore: true,
        limit: 1000,
        orderBy: 'created_at.desc',
      })
      setOrders(
        (Array.isArray(rows) ? rows : []).filter((order) => {
          const eligibility = eligibilityForOrder(order)
          return eligibility.canAttach || eligibility.canRetry
        })
      )
    } catch (err) {
      setOrders([])
      await appAlert(i18nTr(t, 'posUnexpectedErrorDetail', { detail: String(err) }))
    } finally {
      setBillsLoading(false)
    }
  }, [storeCode, t])

  React.useEffect(() => {
    if (!initialized) return
    if (!canAccessAdmin(auth?.role || '')) {
      router.replace('/pos')
      return
    }
    void loadBills()
  }, [initialized, auth?.role, router, loadBills])

  const searchMembers = async () => {
    const q = keyword.trim()
    if (!q) {
      setResults([])
      setSearchEmpty(false)
      return
    }
    if (!online) {
      await appAlert(t('posReceiptPayCorrectOffline'))
      return
    }
    setSearching(true)
    try {
      const rows = await getMembers({ q, limit: 12 })
      const list = Array.isArray(rows) ? rows : []
      setResults(list)
      setSearchEmpty(list.length === 0)
      setMember(list.length === 1 ? list[0] : null)
    } catch (err) {
      setResults([])
      setSearchEmpty(true)
      setMember(null)
      await appAlert(i18nTr(t, 'posUnexpectedErrorDetail', { detail: String(err) }))
    } finally {
      setSearching(false)
    }
  }

  const earnOnOrder = async (order: PosOrder) => {
    if (!online) {
      await appAlert(t('posReceiptPayCorrectOffline'))
      return
    }
    const eligibility = eligibilityForOrder(order)
    const linkedId = Number(order.memberId || 0)
    const memberId = eligibility.canRetry ? linkedId : Number(member?.id || 0)
    if (memberId <= 0) {
      await appAlert(t('posMemberPointsNeedMember'))
      return
    }
    const total = formatBillAmount(Number(order.total || 0))
    const orderNo = String(order.orderNo || order.id)
    const ok = await appConfirm(
      eligibility.canRetry
        ? i18nTr(t, 'posMemberPointsRetryConfirm', { orderNo, total })
        : i18nTr(t, 'posMemberPointsConfirm', {
            name: memberDisplayName(member || { name: '', memberNo: '' }),
            orderNo,
            total,
          })
    )
    if (!ok) return
    setSavingId(order.id)
    try {
      const res = await attachPosOrderMember({ id: order.id, memberId })
      if (!res.success) {
        await appAlert(resolveEarnError(String(res.message || ''), t))
        return
      }
      const points = formatMemberPointsDisplay(res.pointEarned || 0)
      const name = String(res.memberName || memberDisplayName(member || { name: '', memberNo: '' })).trim()
      if (member && Number(member.id) === memberId) {
        setMember({
          ...member,
          pointBalance: Number(member.pointBalance || 0) + Number(res.pointEarned || 0),
        })
      }
      await appAlert(
        Number(res.pointEarned || 0) > 0
          ? i18nTr(t, 'posReceiptAttachMemberSaved', { name: name || res.memberNo || '', points })
          : i18nTr(t, 'posReceiptAttachMemberSavedZero', { name: name || res.memberNo || '' })
      )
      await loadBills()
    } catch (err) {
      await appAlert(i18nTr(t, 'posUnexpectedErrorDetail', { detail: String(err) }))
    } finally {
      setSavingId(null)
    }
  }

  if (!initialized || !auth || !canAccessAdmin(auth.role || '')) {
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
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight">{t('posMemberPointsTitle')}</h1>
              <p className="text-xs text-muted-foreground">{t('posMemberPointsHint')}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              disabled={billsLoading}
              onClick={() => void loadBills()}
            >
              {billsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">{t('posRefresh')}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              title={t('posHome')}
              onClick={() => navigatePosOfflineAware('/pos', (p) => router.push(p))}
            >
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">{t('posHome')}</span>
            </Button>
          </div>
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void searchMembers()
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={t('posMemberPointsSearchPh')}
              className="h-11 pl-9"
              autoComplete="off"
            />
          </div>
          <Button type="submit" className="h-11 shrink-0" disabled={searching}>
            {searching ? t('posMemberPointsSearching') : t('posMemberPointsSearchBtn')}
          </Button>
        </form>

        {member ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-muted-foreground">{t('posMemberPointsSelected')}</p>
              <p className="truncate text-base font-semibold">{memberDisplayName(member)}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[member.memberNo, member.phone].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] font-medium text-muted-foreground">{t('posMemberPointsBalance')}</p>
              <p className="text-lg font-extrabold tabular-nums text-emerald-600">
                {formatMemberPointsDisplay(member.pointBalance || 0)}
              </p>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setMember(null)}>
                {t('posMemberPointsChange')}
              </Button>
            </div>
          </div>
        ) : null}

        {!member && results.length > 0 ? (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {results.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-muted/60"
                  onClick={() => setMember(row)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{memberDisplayName(row)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[row.memberNo, row.phone].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-600">
                    {formatMemberPointsDisplay(row.pointBalance || 0)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {searchEmpty && !searching ? (
          <p className="text-sm text-muted-foreground">{t('posMemberPointsEmpty')}</p>
        ) : null}

        <div className="space-y-2">
          <h2 className="text-sm font-semibold">{t('posMemberPointsBillsTitle')}</h2>
          {storeCode && orders.length > 0 ? (
            <Input
              value={billQuery}
              onChange={(e) => setBillQuery(e.target.value)}
              placeholder={t('posMemberPointsBillSearchPh')}
              className="h-11"
              autoComplete="off"
            />
          ) : null}
          {!storeCode ? <p className="text-sm text-muted-foreground">{t('posMemberPointsNoStore')}</p> : null}
          {storeCode && billsLoading && orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('posMemberPointsBillsLoading')}</p>
          ) : null}
          {storeCode && !billsLoading && visibleOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('posMemberPointsBillsEmpty')}</p>
          ) : null}
          <ul className="space-y-2">
            {visibleOrders.map((order) => {
              const eligibility = eligibilityForOrder(order)
              const createdAt = order.paidAt || order.createdAt
              const orderBd = createdAt ? getPosBusinessDateStr(new Date(createdAt)) : ''
              const dayLabel =
                bizToday && orderBd === bizToday
                  ? t('posMemberPointsToday')
                  : t('posMemberPointsYesterday')
              const saving = savingId === order.id
              return (
                <li
                  key={order.id}
                  className="flex items-center justify-between gap-3 rounded-xl border bg-card px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {dayLabel} · {order.orderNo || order.id}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[formatBillWhen(createdAt), orderKindLabel(order, t), formatBillAmount(order.total)]
                        .filter(Boolean)
                        .join(' · ')}
                      {eligibility.canRetry
                        ? ` · ${t('posMemberPointsLinked')}${order.memberNo ? ` ${order.memberNo}` : ''}`
                        : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    className={cn('h-11 shrink-0', eligibility.canRetry && 'bg-secondary text-secondary-foreground')}
                    variant={eligibility.canRetry ? 'secondary' : 'default'}
                    disabled={saving || savingId != null}
                    onClick={() => void earnOnOrder(order)}
                  >
                    {saving ? '...' : t('posMemberPointsEarn')}
                  </Button>
                </li>
              )
            })}
          </ul>
        </div>

        {canAdjustWithoutReceipt ? (
          <Button
            type="button"
            variant="link"
            className="h-auto px-0 text-sm"
            onClick={() => navigatePosOfflineAware('/admin/members', (p) => router.push(p))}
          >
            {t('posMemberPointsManagerAdjust')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
