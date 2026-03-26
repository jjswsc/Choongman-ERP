/**
 * 기간별 집계 (월/주/일/요일/시간대별). pos_orders 기반. 시간대는 방콕 시각 기준 0–23시.
 * 다중 매장: store_code=in.(...) DB 필터.
 * splitByStore=1 이고 매장 2개 이상이면 { split, series } 반환.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { bangkokDateRangeToUtc } from '@/lib/attendance-utils'
import { parseOrderTypesParam } from '@/lib/pos-sales-order-type-filter'
import { resolveStoresFromParams, appendStoreCodeFilter } from '@/lib/pos-sales-store-filter'
import { aggregatePosSalesByPeriod, type PeriodOrderRow } from '@/lib/pos-sales-period-aggregate'

const FETCH_LIMIT = 50000

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')

  try {
    const { searchParams } = new URL(request.url)
    const startStr = searchParams.get('startStr')?.trim()
    const endStr = searchParams.get('endStr')?.trim()
    const groupBy = searchParams.get('groupBy') || 'day'
    const pos = searchParams.get('pos')?.trim()
    const stores = resolveStoresFromParams(pos, searchParams.get('stores'))
    const splitByStore = searchParams.get('splitByStore') === '1' || searchParams.get('splitByStore') === 'true'
    const orderTypesAllowed = parseOrderTypesParam(searchParams.get('orderTypes'))

    if (!startStr || !endStr) {
      return NextResponse.json({ success: false, message: 'startStr, endStr 필요' }, { headers })
    }

    const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startStr, endStr)
    let filter = `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}`
    filter = appendStoreCodeFilter(filter, stores)

    const rows = (await supabaseSelectFilter('pos_orders', filter, {
      limit: FETCH_LIMIT,
      select:
        'created_at,total,subtotal,vat,discount_amt,coupon_discount_amt,guest_count,store_code,status,order_type',
    })) as PeriodOrderRow[]

    const truncated = rows.length >= FETCH_LIMIT
    if (truncated) headers.set('X-Sales-Truncated', '1')

    if (splitByStore && stores.length >= 2) {
      const series: Record<string, ReturnType<typeof aggregatePosSalesByPeriod>> = {}
      for (const code of stores) {
        const subset = rows.filter((r) => String(r.store_code ?? '').trim() === code)
        series[code] = aggregatePosSalesByPeriod(subset, groupBy, orderTypesAllowed)
      }
      return NextResponse.json({ split: true as const, series, truncated }, { headers })
    }

    const result = aggregatePosSalesByPeriod(rows, groupBy, orderTypesAllowed)
    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('posSalesByPeriod:', e)
    return NextResponse.json([], { headers })
  }
}
