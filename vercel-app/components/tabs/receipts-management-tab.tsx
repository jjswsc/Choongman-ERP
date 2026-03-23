'use client'
import { appAlert } from "@/lib/app-message"

import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Receipt, Search, ChevronDown, Printer } from 'lucide-react'
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
import { useT } from '@/lib/i18n'
import { useOnlineStatus } from '@/lib/offline'
import { isOfficeRole } from '@/lib/permissions'
import { cn, formatBahtNum } from '@/lib/utils'

const orderTypeLabels: Record<string, string> = {
  dine_in: '매장',
  takeout: '포장',
  delivery: '배달',
}

const statusLabels: Record<string, string> = {
  pending: '대기',
  paid: '결제완료',
  cooking: '조리중',
  ready: '준비완료',
  completed: '완료',
  cancelled: '취소',
}

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

export function ReceiptsManagementTab({ offlineAware = false, readOnly = false }: ReceiptsManagementTabProps = {}) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()
  const online = useOnlineStatus()
  const storeCode = auth?.store || stores[0] || ''

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

  const todayStr = new Date().toISOString().slice(0, 10)
  const isToday = startStr === todayStr && endStr === todayStr && statusFilter === 'all'
  const todaySummary = React.useMemo(() => {
    if (!isToday || orders.length === 0) return null
    const completed = orders.filter((o) => ['completed', 'paid', 'ready'].includes(o.status))
    const pending = orders.filter((o) => ['pending', 'cooking'].includes(o.status))
    return {
      completedCount: completed.length,
      completedTotal: completed.reduce((s, o) => s + (o.total ?? 0), 0),
      pendingCount: pending.length,
    }
  }, [isToday, orders, statusFilter])

  const handlePrintKitchenSlip = async (o: PosOrder) => {
    const store = (o.storeCode ?? '').trim()
    if (!store || !o.items?.length) {
      await appAlert(t('posPrintUnavailable') || '인쇄할 수 없습니다.')
      return
    }
    const win = window.open('', '_blank')
    if (!win) {
      await appAlert(t('posPrintBlocked') || '팝업이 차단되었습니다.')
      return
    }
    try {
      const settings = await getPosPrinterSettings({ storeCode: store })
      const categoryByMenuId = Object.fromEntries(menus.map((m) => [String(m.id), m.category]))
      const kitchen1 = settings.kitchen1Categories || []
      const kitchen2 = settings.kitchen2Categories || []
      const mode = settings.kitchenMode || 1
      const items = o.items as { id?: string; name?: string; price?: number; qty?: number }[]

      const toSlips = (): { label: string; items: typeof items }[] => {
        if (mode === 1) return [{ label: t('posKitchenOrder') || '주방 주문서', items }]
        const slip1: typeof items = []
        const slip2: typeof items = []
        for (const it of items) {
          const menuId = String(it.id ?? '').split('-')[0]
          const cat = categoryByMenuId[menuId] ?? ''
          if (kitchen2.includes(cat)) slip2.push(it)
          else slip1.push(it)
        }
        const result: { label: string; items: typeof items }[] = []
        if (slip1.length) result.push({ label: t('posKitchen1') || '주방 1', items: slip1 })
        if (slip2.length) result.push({ label: t('posKitchen2') || '주방 2', items: slip2 })
        return result.length ? result : [{ label: t('posKitchenOrder') || '주방 주문서', items }]
      }
      const slips = toSlips()
      const printOne = (idx: number) => {
        if (idx >= slips.length) return
        const slip = slips[idx]
        const w = idx === 0 ? win : window.open('', '_blank')
        if (!w) return
        const html = `
          <!DOCTYPE html>
          <html><head><title>${slip.label}</title>
          <style>
            body { font-family: sans-serif; font-size: 18px; padding: 20px; max-width: 320px; }
            .k-header { text-align: center; font-size: 22px; font-weight: bold; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px; }
            .k-row { margin: 6px 0; font-size: 18px; }
            .k-memo { margin-top: 8px; padding: 8px; background: #f0f0f0; font-size: 16px; }
          </style></head><body>
          <div class="k-header">${slip.label}</div>
          <div class="k-row"><strong>${o.orderNo}</strong></div>
          <div class="k-row">${store} · ${orderTypeLabels[o.orderType] || o.orderType}${o.tableName ? ` · ${t('posTable') || '테이블'}: ${o.tableName}` : ''}</div>
          <div class="k-row">${o.createdAt ? new Date(o.createdAt).toLocaleString('ko-KR') : '-'}</div>
          <hr style="margin: 10px 0;" />
          ${slip.items.map((it) => `<div class="k-row">${it.name ?? '-'} × ${it.qty ?? 1}</div>`).join('')}
          ${o.memo ? `<div class="k-memo">${t('posCustomerMemo') || '메모'}: ${o.memo}</div>` : ''}
          </body></html>`
        w.document.write(html)
        w.document.close()
        w.focus()
        setTimeout(() => w.print(), 250)
        setTimeout(() => w.close(), 5000)
      }
      printOne(0)
    } catch (e) {
      win.close()
      await appAlert(String(e))
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
                  <th className="px-4 py-3 text-left font-semibold">주문일시</th>
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
                          expandedId === o.id && 'bg-muted/20'
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
                              o.status === 'cancelled' && 'text-muted-foreground',
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
