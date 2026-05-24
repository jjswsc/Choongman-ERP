/**
 * 기간별 집계 (연/월/주/일/요일/시간대별). pos_orders 기반.
 * 조회 구간·버킷: POS 영업일 라벨(getPosTodaySales / posBizDayScope 와 동일).
 * splitByStore=1 이면 매장별 시리즈: { split, series } — 키는 canonicalSalesStoreRowKey (posSalesByStore 와 동일).
 */
import { NextRequest, NextResponse } from 'next/server'
import { parseOrderTypesParam } from '@/lib/pos-sales-order-type-filter'
import { resolveStoresFromParams } from '@/lib/pos-sales-store-filter'
import {
  aggregatePosSalesByPeriod,
  buildPosSalesSplitSeriesByStore,
} from '@/lib/pos-sales-period-aggregate'
import { fetchPosSalesOrdersForBusinessRange } from '@/lib/pos-sales-fetch-rows'
import { resolvePosBusinessHoursFromContext } from '@/lib/pos-business-day-server'

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

    const { rows, truncated, bizCtx } = await fetchPosSalesOrdersForBusinessRange({
      startStr,
      endStr,
      storeCodes: stores.length > 0 ? stores : undefined,
      queryLabel: 'posSalesByPeriod',
    })

    if (truncated) headers.set('X-Sales-Truncated', '1')
    headers.set('X-Pos-Sales-Source', 'posSalesFetchRows')

    const resolveSc = (sc: string) => resolvePosBusinessHoursFromContext(bizCtx, sc)

    if (splitByStore) {
      const series = buildPosSalesSplitSeriesByStore({
        rows,
        stores,
        groupBy,
        orderTypesAllowed,
        resolveBusinessDayStart: resolveSc,
      })
      return NextResponse.json({ split: true as const, series, truncated }, { headers })
    }

    const result = aggregatePosSalesByPeriod(rows, groupBy, orderTypesAllowed, undefined, resolveSc)
    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('posSalesByPeriod:', e)
    return NextResponse.json([], { headers })
  }
}
