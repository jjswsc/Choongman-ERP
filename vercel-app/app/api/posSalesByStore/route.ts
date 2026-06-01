/**
 * 매장별 매출 집계. pos_orders 기반.
 * 우선 RPC get_pos_sales_analytics_agg (DB 집계, 행 상한 없음) → 미배포 시 fetch 폴백.
 */
import { NextRequest, NextResponse } from 'next/server'
import { parseOrderTypesParam, normalizePosOrderTypeKey } from '@/lib/pos-sales-order-type-filter'
import { resolveStoresFromParams } from '@/lib/pos-sales-store-filter'
import { resolvePosSalesStoresFromRequest } from '@/lib/pos-sales-request-scope'
import { fetchPosSalesOrdersForBusinessRange } from '@/lib/pos-sales-fetch-rows'
import { resolvePosSalesDiscountAmount } from '@/lib/pos-coupon-domain'
import { groupPosSalesRowsByCanonicalStore } from '@/lib/pos-sales-period-aggregate'
import { tryFetchPosSalesAnalyticsAgg } from '@/lib/pos-sales-analytics-rpc-server'
import { mapAnalyticsAggToStoreResults } from '@/lib/pos-sales-analytics-rpc-map'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')

  try {
    const { searchParams } = new URL(request.url)
    const startStr = searchParams.get('startStr')?.trim()
    const endStr = searchParams.get('endStr')?.trim()
    const pos = searchParams.get('pos')?.trim()
    const stores = await resolvePosSalesStoresFromRequest(
      request,
      resolveStoresFromParams(pos, searchParams.get('stores'))
    )
    const orderTypesAllowed = parseOrderTypesParam(searchParams.get('orderTypes'))

    if (!startStr || !endStr) {
      return NextResponse.json({ success: false, message: 'startStr, endStr 필요' }, { headers })
    }

    const rpcRows = await tryFetchPosSalesAnalyticsAgg({
      startStr,
      endStr,
      storeCodes: stores.length > 0 ? stores : undefined,
      orderTypes: orderTypesAllowed,
      aggMode: 'store',
    })

    if (rpcRows) {
      headers.set('X-Pos-Sales-Source', 'rpc')
      return NextResponse.json(mapAnalyticsAggToStoreResults(rpcRows), { headers })
    }

    const { rows, truncated } = await fetchPosSalesOrdersForBusinessRange({
      startStr,
      endStr,
      storeCodes: stores.length > 0 ? stores : undefined,
      queryLabel: 'posSalesByStore',
    })

    if (truncated) headers.set('X-Sales-Truncated', '1')
    headers.set('X-Pos-Sales-Source', 'fetch')

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

    const grouped = groupPosSalesRowsByCanonicalStore(rows, orderTypesAllowed)
    for (const [store, subset] of grouped) {
      for (const r of subset) {
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
        byStore[store].discount += resolvePosSalesDiscountAmount(
          Number(r.discount_amt) || 0,
          Number(r.coupon_discount_amt) || 0
        )
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
