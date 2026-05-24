/**
 * 기간별 집계 (연/월/주/일/요일/시간대별). pos_orders 기반.
 * 조회 구간·버킷: POS 영업일 라벨(getPosTodaySales / posBizDayScope 와 동일).
 * splitByStore=1 이면 매장별 시리즈: { split, series } (매장 0·1·N 모두).
 * - 매장 2개 이상: 요청 매장 코드별 부분집합 집계
 * - 매장 1개: 해당 매장 행만 집계 (posSalesByStore 합계와 일치)
 * - 매장 0개(전체): 응답 행에 등장한 store_code 기준으로 분해
 */
import { NextRequest, NextResponse } from 'next/server'
import { parseOrderTypesParam } from '@/lib/pos-sales-order-type-filter'
import {
  resolveStoresFromParams,
  rowMatchesSalesStoreSelection,
  canonicalSalesStoreRowKey,
} from '@/lib/pos-sales-store-filter'
import { aggregatePosSalesByPeriod } from '@/lib/pos-sales-period-aggregate'
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
      const series: Record<string, ReturnType<typeof aggregatePosSalesByPeriod>> = {}
      if (stores.length >= 2) {
        for (const code of stores) {
          const subset = rows.filter((r) => rowMatchesSalesStoreSelection(r.store_code, code))
          series[code] = aggregatePosSalesByPeriod(subset, groupBy, orderTypesAllowed, undefined, resolveSc)
        }
      } else if (stores.length === 1) {
        const code = stores[0]!
        const subset = rows.filter((r) => rowMatchesSalesStoreSelection(r.store_code, code))
        series[code] = aggregatePosSalesByPeriod(subset, groupBy, orderTypesAllowed, undefined, resolveSc)
      } else {
        const codes = [
          ...new Set(
            rows.map((r) =>
              canonicalSalesStoreRowKey(String(r.store_code ?? '').trim() || '(미지정)')
            )
          ),
        ].sort((a, b) => a.localeCompare(b))
        for (const code of codes) {
          const subset = rows.filter(
            (r) =>
              canonicalSalesStoreRowKey(String(r.store_code ?? '').trim() || '(미지정)') === code
          )
          series[code] = aggregatePosSalesByPeriod(subset, groupBy, orderTypesAllowed, undefined, resolveSc)
        }
      }
      return NextResponse.json({ split: true as const, series, truncated }, { headers })
    }

    const result = aggregatePosSalesByPeriod(rows, groupBy, orderTypesAllowed, undefined, resolveSc)
    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('posSalesByPeriod:', e)
    return NextResponse.json([], { headers })
  }
}
