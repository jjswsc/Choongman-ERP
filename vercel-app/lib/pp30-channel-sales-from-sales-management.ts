/**
 * PP.30 채널 매출 — 매출관리(ยอดขายสุทธิ·결제/배달 결산)와 동일 집계.
 * 영업일 + 완료 주문, 결산(pos_settlements) 있으면 결제수단은 결산 우선.
 */
import { sumCompletedPosSalesTotal } from '@/lib/accounting-pos-sales'
import { fetchPosSalesOrdersForBusinessRange, POS_SALES_PAYMENT_ROW_SELECT } from '@/lib/pos-sales-fetch-rows'
import {
  filterCompletedPosSalesRows,
  type PeriodOrderRow,
} from '@/lib/pos-sales-period-aggregate'
import { getPosBusinessDateStrFromConfig } from '@/lib/pos-business-day'
import { resolvePosBusinessHoursFromContext } from '@/lib/pos-business-day-server'
import { isPosSalesBusinessYmdInInclusiveRange } from '@/lib/pos-sales-business-day-range'
import { expandSalesStoreCodesForFilterAsync } from '@/lib/pos-sales-store-filter'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import type { PosSettlementBreakdownRow } from '@/lib/pos-sales-settlement-breakdown-aggregate'

export type Pp30ChannelDay = {
  date: string
  cash: number
  card: number
  qr: number
  deliveryApp: number
  other: number
  total: number
  count: number
}

export type Pp30ChannelTotals = Omit<Pp30ChannelDay, 'date'>

function roundBaht(n: number): number {
  return Math.round(Math.max(0, Number(n) || 0) * 100) / 100
}

function emptyDay(): Omit<Pp30ChannelDay, 'date'> {
  return { cash: 0, card: 0, qr: 0, deliveryApp: 0, other: 0, total: 0, count: 0 }
}

function addDay(
  map: Map<string, Omit<Pp30ChannelDay, 'date'>>,
  date: string,
  patch: Partial<Omit<Pp30ChannelDay, 'date'>>
) {
  if (!date) return
  const cur = map.get(date) || emptyDay()
  cur.cash = roundBaht(cur.cash + (patch.cash || 0))
  cur.card = roundBaht(cur.card + (patch.card || 0))
  cur.qr = roundBaht(cur.qr + (patch.qr || 0))
  cur.deliveryApp = roundBaht(cur.deliveryApp + (patch.deliveryApp || 0))
  cur.other = roundBaht(cur.other + (patch.other || 0))
  cur.total = roundBaht(cur.total + (patch.total || 0))
  cur.count += patch.count || 0
  map.set(date, cur)
}

async function fetchSettlements(
  startStr: string,
  endStr: string,
  expandedStoreCodes: string[]
): Promise<PosSettlementBreakdownRow[]> {
  const filter = [
    `settle_date=gte.${encodeURIComponent(startStr.slice(0, 10))}`,
    `settle_date=lte.${encodeURIComponent(endStr.slice(0, 10))}`,
  ].join('&')
  const rows = (await supabaseSelectFilter('pos_settlements', filter, {
    limit: 10000,
    select:
      'store_code,settle_date,cash_amt,card_amt,qr_amt,other_amt,delivery_app_amt',
  })) as PosSettlementBreakdownRow[] | null

  const storeSet =
    expandedStoreCodes.length > 0
      ? new Set(expandedStoreCodes.map((s) => String(s).trim().toLowerCase()))
      : null

  return (rows || []).filter((r) => {
    if (!storeSet || storeSet.size === 0) return true
    return storeSet.has(String(r.store_code ?? '').trim().toLowerCase())
  })
}

export async function loadPp30ChannelSalesFromSalesManagement(params: {
  startStr: string
  endStr: string
  storeCodes?: string[] | null
  tenantId?: string | null
}): Promise<{
  dailySales: Pp30ChannelDay[]
  totals: Pp30ChannelTotals
  netSalesTotal: number
  source: 'sales_management'
}> {
  const startStr = String(params.startStr || '').slice(0, 10)
  const endStr = String(params.endStr || '').slice(0, 10)
  const storeCodes = (params.storeCodes || []).map((s) => String(s || '').trim()).filter(Boolean)
  const expanded = await expandSalesStoreCodesForFilterAsync(storeCodes)

  const storeFilter =
    storeCodes.length === 0 ? 'All' : storeCodes.length === 1 ? storeCodes[0]! : storeCodes.join(',')

  const { resolveSaasTenantScope } = await import('@/lib/saas-tenant-scope')
  const tenantScope = await resolveSaasTenantScope({
    auth: params.tenantId ? { tenantId: params.tenantId } : null,
    storeCode: storeCodes.length === 1 ? storeCodes[0]! : null,
  })

  const [posSum, { rows, bizCtx }, settlements] = await Promise.all([
    sumCompletedPosSalesTotal({
      startStr,
      endStr,
      storeFilter,
      tenantId: params.tenantId || undefined,
    }),
    fetchPosSalesOrdersForBusinessRange({
      startStr,
      endStr,
      storeCodes: storeCodes.length > 0 ? storeCodes : undefined,
      select: POS_SALES_PAYMENT_ROW_SELECT,
      queryLabel: 'pp30ChannelSalesSalesManagement',
      tenantScope,
    }),
    fetchSettlements(startStr, endStr, expanded),
  ])

  const byDay = new Map<string, Omit<Pp30ChannelDay, 'date'>>()
  const settlementStoreDays = new Set<string>()

  for (const s of settlements) {
    const date = String(s.settle_date || '').slice(0, 10)
    if (!isPosSalesBusinessYmdInInclusiveRange(date, startStr, endStr)) continue
    const store = String(s.store_code || '').trim().toLowerCase()
    if (store) settlementStoreDays.add(`${store}|${date}`)
    const cash = roundBaht(Number(s.cash_amt) || 0)
    const card = roundBaht(Number(s.card_amt) || 0)
    const qr = roundBaht(Number(s.qr_amt) || 0)
    const deliveryApp = roundBaht(Number(s.delivery_app_amt) || 0)
    const other = roundBaht(Number(s.other_amt) || 0)
    const total = roundBaht(cash + card + qr + deliveryApp + other)
    addDay(byDay, date, { cash, card, qr, deliveryApp, other, total, count: total > 0.005 ? 1 : 0 })
  }

  const completed = filterCompletedPosSalesRows(rows as PeriodOrderRow[], null)
  const resolveHours = (storeCode: string) => resolvePosBusinessHoursFromContext(bizCtx, storeCode)

  for (const r of completed as Array<Record<string, unknown>>) {
    const storeCode = String(r.store_code || '').trim()
    const bizDate = getPosBusinessDateStrFromConfig(r as never, resolveHours(storeCode))
    if (!isPosSalesBusinessYmdInInclusiveRange(bizDate, startStr, endStr)) continue
    const storeKey = storeCode.toLowerCase()
    if (storeKey && settlementStoreDays.has(`${storeKey}|${bizDate}`)) continue

    const cash = roundBaht(Number(r.payment_cash) || 0)
    const card = roundBaht(Number(r.payment_card) || 0)
    const qr = roundBaht(Number(r.payment_qr) || 0)
    const deliveryApp = roundBaht(Number(r.payment_delivery_app) || 0)
    const otherPay = roundBaht(Number(r.payment_other) || 0)
    const crypto = roundBaht(Number(r.payment_crypto) || 0)
    const orderTotal = roundBaht(Number(r.total) || 0)
    const allocated = cash + card + qr + deliveryApp + otherPay + crypto
    const other = roundBaht(otherPay + crypto + Math.max(0, orderTotal - allocated))
    addDay(byDay, bizDate, {
      cash,
      card,
      qr,
      deliveryApp,
      other,
      total: orderTotal > 0.005 ? orderTotal : roundBaht(cash + card + qr + deliveryApp + other),
      count: 1,
    })
  }

  // 결산만 있고 주문 total과 어긋나면, 매출관리 순매출(total)을 일자 비율로 맞춰 표시 합을 맞춤
  const dailySales = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({ date, ...d }))

  const channelSum = roundBaht(dailySales.reduce((s, d) => s + d.total, 0))
  const netSalesTotal = roundBaht(posSum.total)
  if (netSalesTotal > 0.005 && channelSum > 0.005 && Math.abs(netSalesTotal - channelSum) > 1) {
    const scale = netSalesTotal / channelSum
    for (const d of dailySales) {
      d.cash = roundBaht(d.cash * scale)
      d.card = roundBaht(d.card * scale)
      d.qr = roundBaht(d.qr * scale)
      d.deliveryApp = roundBaht(d.deliveryApp * scale)
      d.other = roundBaht(d.other * scale)
      d.total = roundBaht(d.total * scale)
    }
  } else if (dailySales.length === 0 && posSum.salesByDay.length > 0) {
    for (const day of posSum.salesByDay) {
      dailySales.push({
        date: day.key,
        cash: 0,
        card: 0,
        qr: 0,
        deliveryApp: 0,
        other: roundBaht(day.amount),
        total: roundBaht(day.amount),
        count: 0,
      })
    }
  }

  const totals = emptyDay()
  for (const d of dailySales) {
    totals.cash = roundBaht(totals.cash + d.cash)
    totals.card = roundBaht(totals.card + d.card)
    totals.qr = roundBaht(totals.qr + d.qr)
    totals.deliveryApp = roundBaht(totals.deliveryApp + d.deliveryApp)
    totals.other = roundBaht(totals.other + d.other)
    totals.total = roundBaht(totals.total + d.total)
    totals.count += d.count
  }
  if (netSalesTotal > 0.005) totals.total = netSalesTotal

  return {
    dailySales,
    totals,
    netSalesTotal,
    source: 'sales_management',
  }
}
