'use client'
import { appAlert } from "@/lib/app-message"

import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, ChevronDown, Printer } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/lib/auth-context'
import { useStoreList } from '@/lib/api-client'
import { getPosOrders, getPosMenus, getPosPrinterSettings, type PosOrder, type PosMenu } from '@/lib/api-client'
import { getPosOrdersWithCache } from '@/lib/offline/receipts-offline'
import { useLang } from '@/lib/lang-context'
import { useT, tr as i18nTr } from '@/lib/i18n'
import { useOnlineStatus, onSyncComplete } from '@/lib/offline'
import { isOfficeRole } from '@/lib/permissions'
import { cn, formatBahtNum, escapeHtml } from '@/lib/utils'
import { buildKitchenSlipGroupOpts, buildKitchenSlipGroups } from '@/lib/pos-kitchen-slip-routing'
import { buildKitchenSlipDocumentHtml, resolveKitchenSlipDesign } from '@/lib/pos-kitchen-slip-html'
import { parsePosOrderMemo } from '@/lib/pos-tax-invoice'
import { formatPosDateTimeMedium } from '@/lib/pos-datetime-locale'
import { translatePosMenuLineForReceipt } from '@/lib/pos-print-translate'

function formatBangkokDateTime(value: string | null | undefined) {
  if (!value) return '-'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '-'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(dt)
}

export interface ReceiptsManagementTabProps {
  /** POS용: 오프라인 시 캐시 사용, 온라인 시 API 호출 후 캐시 저장 */
  offlineAware?: boolean
  /** true: 수정/상태변경 비활성화 (POS 매장) */
  readOnly?: boolean
}

export function ReceiptsManagementTab({ offlineAware = false, readOnly: _readOnly = false }: ReceiptsManagementTabProps = {}) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()
  const online = useOnlineStatus()
  const storeCode = auth?.store || stores[0] || ''
  const orderTypeLabels = React.useMemo<Record<string, string>>(
    () => ({
      dine_in: t('posOrderTypeDineIn') || '매장',
      takeout: t('posOrderTypeTakeout') || '포장',
      delivery: t('posOrderTypeDelivery') || '배달',
    }),
    [t]
  )
  const statusLabels = React.useMemo<Record<string, string>>(
    () => ({
      pending: t('posPending') || '대기',
      paid: t('posStatusPaid') || '결제완료',
      cooking: t('posStatusCooking') || '조리중',
      ready: t('posStatusReady') || '준비완료',
      completed: t('done') || '완료',
      cancelled: t('cancel') || '취소',
    }),
    [t]
  )

  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [startStr, setStartStr] = React.useState(today)
  const [endStr, setEndStr] = React.useState(today)
  const [storeFilter, setStoreFilter] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [searchTerm, setSearchTerm] = React.useState('')
  const [appliedSearchTerm, setAppliedSearchTerm] = React.useState('')
  const [orders, setOrders] = React.useState<PosOrder[]>([])
  const [loading, setLoading] = React.useState(false)
  const [expandedId, setExpandedId] = React.useState<number | null>(null)
  const [menus, setMenus] = React.useState<PosMenu[]>([])

  const canSearchAll = isOfficeRole(auth?.role || '')

  const filteredOrders = React.useMemo(() => {
    if (!appliedSearchTerm.trim()) return orders
    const term = appliedSearchTerm.trim().toLowerCase()
    return orders.filter(
      (o) =>
        o.orderNo?.toLowerCase().includes(term) ||
        (o.tableName && o.tableName.toLowerCase().includes(term)) ||
        (o.memo && o.memo.toLowerCase().includes(term)) ||
        o.items?.some(
          (it: { name?: string }) =>
            it.name && String(it.name).toLowerCase().includes(term)
        )
    )
  }, [orders, appliedSearchTerm])

  const loadOrders = React.useCallback(() => {
    if (!startStr || !endStr) return
    setLoading(true)
    const store = canSearchAll ? (storeFilter || undefined) : storeCode
    const fetcher = offlineAware ? getPosOrdersWithCache : getPosOrders
    const params = {
      startStr,
      endStr,
      storeCode: store || undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
    }
    fetcher(params)
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false))
  }, [startStr, endStr, storeFilter, storeCode, statusFilter, canSearchAll, offlineAware])

  React.useEffect(() => {
    loadOrders()
  }, [loadOrders])

  React.useEffect(() => {
    getPosMenus().then(setMenus).catch(() => setMenus([]))
  }, [])

  const prevOnlineRef = React.useRef(online)
  React.useEffect(() => {
    if (offlineAware && !prevOnlineRef.current && online) {
      prevOnlineRef.current = true
      loadOrders()
    }
    prevOnlineRef.current = online
  }, [online, offlineAware, loadOrders])

  React.useEffect(() => {
    if (!offlineAware) return
    return onSyncComplete(() => {
      loadOrders()
    })
  }, [offlineAware, loadOrders])

  const todayStr = new Date().toISOString().slice(0, 10)
  const isToday = startStr === todayStr && endStr === todayStr && statusFilter === 'all'
  const todaySummary = React.useMemo(() => {
    if (!isToday || orders.length === 0) return null
    const completed = orders.filter((o) => ['completed', 'paid', 'ready'].includes(o.status))
    const pending = orders.filter((o) => ['pending', 'cooking'].includes(o.status))
    const cancelled = orders.filter((o) => o.status === 'cancelled')
    return {
      completedCount: completed.length,
      completedTotal: completed.reduce((s, o) => s + (o.total ?? 0), 0),
      pendingCount: pending.length,
      cancelledCount: cancelled.length,
      cancelledTotal: cancelled.reduce((s, o) => s + (o.total ?? 0), 0),
    }
  }, [isToday, orders, statusFilter])

  const handlePrintKitchenSlip = async (o: PosOrder) => {
    const store = (o.storeCode ?? '').trim()
    if (!store || !o.items?.length) {
      await appAlert(t('posPrintUnavailable'))
      return
    }
    const win = window.open('', '_blank')
    if (!win) {
      await appAlert(t('posPrintBlockedBrowser'))
      return
    }
    try {
      const settings = await getPosPrinterSettings({ storeCode: store })
      const items = o.items as { id?: string; name?: string; price?: number; qty?: number }[]
      const kLabels = {
        unified: t('posKitchenOrder') || '주방 주문서',
        kitchen1: `${t('posKitchen1') || '주방 1'}`,
        kitchen2: `${t('posKitchen2') || '주방 2'}`,
        kitchen3: `${t('posKitchen3') || '주방 3'}`,
      }
      const slips = buildKitchenSlipGroups(items, buildKitchenSlipGroupOpts(settings, menus, kLabels))
      if (!slips.length) {
        win.close()
        await appAlert(t('posKitchenNoItemsToPrint'))
        return
      }
      const slipDesign = resolveKitchenSlipDesign(settings)
      const kitchenMemo = parsePosOrderMemo(o.memo).plainMemo
      const memoLine = kitchenMemo.trim()
        ? `${t('posCustomerMemo') || '메모'}: ${kitchenMemo.trim()}`
        : ''
      const dateStr = o.createdAt
        ? formatPosDateTimeMedium(new Date(o.createdAt), lang)
        : '-'
      const printOne = (idx: number) => {
        if (idx >= slips.length) return
        const slip = slips[idx]
        const w = idx === 0 ? win : window.open('', '_blank')
        if (!w) return
        const tablePart = o.tableName ? ` · ${t('posTable') || '테이블'}: ${o.tableName}` : ''
        const html = buildKitchenSlipDocumentHtml({
          label: slip.label,
          orderNo: String(o.orderNo ?? ''),
          storeCode: store,
          orderTypeLabel: orderTypeLabels[o.orderType] || o.orderType,
          tablePart,
          dateStr,
          items: slip.items.map((it) => {
            const row = it as { name?: string; qty?: number; note?: string }
            return {
              name: translatePosMenuLineForReceipt(String(row.name ?? '-'), t),
              qty: Number(row.qty ?? 1),
              note: row.note,
            }
          }),
          memoLine: memoLine || null,
          escapeHtml,
          design: slipDesign,
          printColorAdjust: 'economy',
        })
        w.document.write(html)
        w.document.close()
        w.focus()
        setTimeout(() => w.print(), 250)
        setTimeout(() => w.close(), 5000)
      }
      printOne(0)
    } catch (e) {
      win.close()
      await appAlert(i18nTr(t, 'posUnexpectedErrorDetail', { detail: String(e) }))
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Input
              type="date"
              value={startStr}
              onChange={(e) => setStartStr(e.target.value)}
              className="h-9 w-[140px]"
            />
            <span className="text-slate-500">~</span>
            <Input
              type="date"
              value={endStr}
              onChange={(e) => setEndStr(e.target.value)}
              className="h-9 w-[140px]"
            />
            <Button
              variant={isToday ? 'secondary' : 'outline'}
              size="sm"
              className="h-9 px-3"
              onClick={() => {
                setStartStr(todayStr)
                setEndStr(todayStr)
              }}
            >
              {t('posToday') || '오늘'}
            </Button>
            {canSearchAll && (
              <Select
                value={storeFilter || '__all__'}
                onValueChange={(v) => setStoreFilter(v === '__all__' ? '' : v)}
              >
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue placeholder={t('posStoreSelect') || '매장'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t('posStatusAll') || '전체'}</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[120px]">
                <SelectValue placeholder={t('posStatus') || '상태'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('posStatusAll') || '전체'}</SelectItem>
                {Object.entries(statusLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={loadOrders} disabled={loading}>
              <Search className="mr-1 h-4 w-4" />
              {t('search') || '조회'}
            </Button>
            <Input
              placeholder={t('posSearchPh') || '주문번호, 테이블, 메뉴 검색'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setAppliedSearchTerm(searchTerm)}
              className="h-9 flex-1 min-w-[180px]"
            />
            <Button
              variant="secondary"
              size="sm"
              className="h-9 px-3"
              onClick={() => setAppliedSearchTerm(searchTerm)}
            >
              {t('search') || '검색'}
            </Button>
          </div>

          {loading && (
            <div className="mb-4 flex justify-center py-4">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            </div>
          )}

          {todaySummary && !loading && (
            <div className="mb-4 flex flex-wrap gap-4 rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {t('posTodayCompleted') || '오늘 완료'}:
                </span>
                <span className="font-bold text-amber-600">
                  {todaySummary.completedCount}
                  {t('posCount') || '건'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {t('posInputTotal') || '합계'}:
                </span>
                <span className="font-bold tabular-nums">
                  {formatBahtNum(todaySummary.completedTotal)} ฿
                </span>
              </div>
              {todaySummary.pendingCount > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {t('posPending') || '대기'}: {todaySummary.pendingCount}
                  {t('posCount') || '건'}
                </div>
              )}
              {todaySummary.cancelledCount > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-rose-700">
                  <span>
                    {t('posTodayCancelled') || '오늘 취소'}: {todaySummary.cancelledCount}
                    {t('posCount') || '건'}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    ({todaySummary.cancelledTotal.toLocaleString()} ฿)
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="overflow-auto max-h-[calc(100vh-380px)] min-h-[200px] rounded-xl border bg-card">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-3 text-left font-semibold">{t('posOrderNo') || '주문번호'}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t('posStoreSelect') || '매장'}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t('posOrderType') || '유형'}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t('posTable') || '테이블'}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t('posInputTotal') || '합계'}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t('posStatus') || '상태'}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t('posOrderDateTime')}</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                      {t('itemsNoResults') || '조회된 내역이 없습니다.'}
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((o) => (
                    <React.Fragment key={o.id}>
                      <tr
                        className={cn(
                          'border-b cursor-pointer hover:bg-muted/20 transition',
                          expandedId === o.id && 'bg-muted/20',
                          o.status === 'cancelled' &&
                            'bg-rose-50/60 hover:bg-rose-50/80 dark:bg-rose-950/25 dark:hover:bg-rose-950/35'
                        )}
                        onClick={() => setExpandedId((prev) => (prev === o.id ? null : o.id))}
                      >
                        <td className="px-4 py-3 font-medium">{o.orderNo}</td>
                        <td className="px-4 py-3">{o.storeCode || '-'}</td>
                        <td className="px-4 py-3">
                          {orderTypeLabels[o.orderType] || o.orderType}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {o.orderType === 'dine_in' && o.tableName ? o.tableName : '-'}
                        </td>
                        <td className="px-4 py-3 text-right font-bold tabular-nums">
                          {formatBahtNum(o.total)} ฿
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'rounded px-2 py-0.5 text-xs',
                              o.status === 'completed' && 'bg-emerald-50 text-emerald-700',
                              o.status === 'cancelled' &&
                                'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200',
                              o.status === 'pending' && 'bg-amber-50 text-amber-700'
                            )}
                          >
                            {statusLabels[o.status] ?? o.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {formatBangkokDateTime(o.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 transition',
                              expandedId === o.id && 'rotate-180'
                            )}
                          />
                        </td>
                      </tr>
                      {expandedId === o.id && (
                        <tr className="border-b bg-muted/10">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="space-y-2 text-xs">
                              {(o.tableName || o.memo || (o.discountAmt && o.discountAmt > 0)) && (
                                <div className="mb-2 pb-2 border-b">
                                  {o.tableName && (
                                    <div className="text-muted-foreground">
                                      {t('posTable') || '테이블'}: {o.tableName}
                                    </div>
                                  )}
                                  {o.memo && (
                                    <div className="text-muted-foreground mt-0.5">
                                      {t('posCustomerMemo') || '메모'}: {o.memo}
                                    </div>
                                  )}
                                  {o.discountAmt && o.discountAmt > 0 && (
                                    <div className="text-green-600 mt-0.5">
                                      {t('posDiscount') || '할인'}: -{formatBahtNum(o.discountAmt)} ฿
                                      {o.discountReason && ` (${o.discountReason})`}
                                    </div>
                                  )}
                                </div>
                              )}
                              {o.items?.length ? (
                                <>
                                  <div className="mb-1 text-muted-foreground">
                                    {t('posTableStatusServed') || '서빙'}:{' '}
                                    {o.items.filter((it) => Boolean(it.servedAt)).length}/
                                    {o.items.length}
                                  </div>
                                  {o.items.map((it, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-center justify-between gap-2 text-muted-foreground"
                                    >
                                      <span className="min-w-0 truncate">
                                        {it.name} × {it.qty ?? 1}
                                      </span>
                                      <span className="tabular-nums shrink-0">
                                        {formatBahtNum((it.price ?? 0) * (it.qty ?? 1))} ฿
                                      </span>
                                    </div>
                                  ))}
                                  <div className="pt-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 gap-1 px-2 text-xs"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handlePrintKitchenSlip(o)
                                      }}
                                    >
                                      <Printer className="h-3 w-3" />
                                      {t('posKitchenSlip') || '주방 주문서'}
                                    </Button>
                                  </div>
                                </>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
