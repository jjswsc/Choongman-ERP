/**
 * 매장별 매출 집계. pos_orders 기반.
 * 매장명, 주문건수, guestSum(홀 guest_count 합), dine_in 전용 건수·매출·손님수, 홀 건당·홀 1인당·건당, 공급가액·세금·할인·서비스처리·매출액
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilterStrippingUnknownColumns } from '@/lib/supabase-pgrst204-retry'
import { bangkokDateRangeToUtc } from '@/lib/attendance-utils'
import {
  normalizePosOrderTypeKey,
  parseOrderTypesParam,
  rowMatchesOrderFilter,
} from '@/lib/pos-sales-order-type-filter'
import {
  resolveStoresFromParams,
  appendStoreCodeFilter,
  canonicalSalesStoreRowKey,
} from '@/lib/pos-sales-store-filter'

const COMPLETED_STATUSES = ['completed', 'paid', 'ready']
const FETCH_LIMIT = 50000

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(request.url)
    const startStr = searchParams.get('startStr')?.trim()
    const endStr = searchParams.get('endStr')?.trim()
    const pos = searchParams.get('pos')?.trim()
    const stores = resolveStoresFromParams(pos, searchParams.get('stores'))
    const orderTypesAllowed = parseOrderTypesParam(searchParams.get('orderTypes'))

    if (!startStr || !endStr) {
      return NextResponse.json({ success: false, message: 'startStr, endStr 필요' }, { headers })
    }

    const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startStr, endStr)
    let filter = `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}`
    filter = appendStoreCodeFilter(filter, stores)

    const rows = (await supabaseSelectFilterStrippingUnknownColumns('pos_orders', filter, {
      limit: FETCH_LIMIT,
      select:
        'store_code,subtotal,vat,total,discount_amt,coupon_discount_amt,service_amt,guest_count,status,order_type',
    }, 'posSalesByStore')) as {
      store_code?: string
      subtotal?: number
      vat?: number
      total?: number
      discount_amt?: number
      coupon_discount_amt?: number
      service_amt?: number
      guest_count?: number
      status?: string
      order_type?: string
    }[]

    if (rows.length >= FETCH_LIMIT) headers.set('X-Sales-Truncated', '1')

    const byStore: Record<
      string,
      {
        count: number
        subtotal: number
        vat: number
        discount: number
        service: number
        total: number
        guestSum: number
        dineInOrderCount: number
        dineInTotal: number
        dineInGuestSum: number
      }
    > = {}

    for (const r of rows) {
      if (!rowMatchesOrderFilter(r.order_type, orderTypesAllowed)) continue
      if (!COMPLETED_STATUSES.includes(String(r.status ?? ''))) continue
      const store = canonicalSalesStoreRowKey(String(r.store_code ?? '').trim() || '(미지정)')
      if (!byStore[store])
        byStore[store] = {
          count: 0,
          subtotal: 0,
          vat: 0,
          discount: 0,
          service: 0,
          total: 0,
          guestSum: 0,
          dineInOrderCount: 0,
          dineInTotal: 0,
          dineInGuestSum: 0,
        }
      byStore[store].count += 1
      byStore[store].subtotal += Number(r.subtotal) || 0
      byStore[store].vat += Number(r.vat) || 0
      byStore[store].discount += (Number(r.discount_amt) || 0) + (Number(r.coupon_discount_amt) || 0)
      byStore[store].service += Number(r.service_amt) || 0
      byStore[store].total += Number(r.total) || 0
      const gc = Math.max(0, Math.trunc(Number(r.guest_count) || 0))
      byStore[store].guestSum += gc
      {
        const k = normalizePosOrderTypeKey(r.order_type)
        if (k === 'dine_in' || k === '') {
          byStore[store].dineInOrderCount += 1
          byStore[store].dineInTotal += Number(r.total) || 0
          byStore[store].dineInGuestSum += gc
        }
      }
    }

    const result = Object.entries(byStore)
      .map(([storeName, v]) => ({
        storeName,
        count: v.count,
        subtotal: v.subtotal,
        vat: v.vat,
        discount: v.discount,
        service: v.service,
        total: v.total,
        guestSum: v.guestSum,
        dineInOrderCount: v.dineInOrderCount,
        dineInTotal: v.dineInTotal,
        dineInGuestSum: v.dineInGuestSum,
        salesPerDineInOrder:
          v.dineInOrderCount > 0 ? Math.round((v.dineInTotal / v.dineInOrderCount) * 100) / 100 : 0,
        salesPerGuest:
          v.dineInGuestSum > 0 ? Math.round((v.dineInTotal / v.dineInGuestSum) * 100) / 100 : 0,
        salesPerOrder: v.count > 0 ? Math.round((v.total / v.count) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.total - a.total)

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('posSalesByStore:', e)
    return NextResponse.json([], { headers })
  }
}
