/**
 * 기간별 집계 (연/월/주/일/요일/시간대별). pos_orders 기반. 버킷은 방콕 달력 기준.
 * splitByStore=1 이면 매장별 시리즈: { split, series } (매장 0·1·N 모두).
 * - 매장 2개 이상: 요청 매장 코드별 부분집합 집계
 * - 매장 1개: 해당 필터 행 전체를 한 키로 집계
 * - 매장 0개(전체): 응답 행에 등장한 store_code 기준으로 분해
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseRpc, supabaseSelectFilter } from '@/lib/supabase-server'
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
    let rows: PeriodOrderRow[] = []
    let usedRpc = false
    try {
      const rpcRows = (await supabaseRpc<PeriodOrderRow[]>('get_pos_sales_period_rows', {
        p_start_utc: startISO,
        p_end_utc_exclusive: endISOExclusive,
        p_store_codes: stores.length > 0 ? stores : null,
        p_limit: FETCH_LIMIT,
      })) as PeriodOrderRow[]
      if (Array.isArray(rpcRows)) {
        rows = rpcRows
        usedRpc = true
      }
    } catch {
      usedRpc = false
    }
    if (!usedRpc) {
      rows = (await supabaseSelectFilter('pos_orders', filter, {
        limit: FETCH_LIMIT,
        select:
          'created_at,total,subtotal,vat,discount_amt,coupon_discount_amt,guest_count,store_code,status,order_type',
      })) as PeriodOrderRow[]
    }

    const truncated = rows.length >= FETCH_LIMIT
    if (truncated) headers.set('X-Sales-Truncated', '1')
    headers.set('X-Pos-Sales-Source', usedRpc ? 'rpc' : 'select')

    if (splitByStore) {
      const series: Record<string, ReturnType<typeof aggregatePosSalesByPeriod>> = {}
      if (stores.length >= 2) {
        for (const code of stores) {
          const subset = rows.filter((r) => String(r.store_code ?? '').trim() === code)
          series[code] = aggregatePosSalesByPeriod(subset, groupBy, orderTypesAllowed)
        }
      } else if (stores.length === 1) {
        const code = stores[0]
        series[code] = aggregatePosSalesByPeriod(rows, groupBy, orderTypesAllowed)
      } else {
        const codes = [
          ...new Set(rows.map((r) => String(r.store_code ?? '').trim()).filter(Boolean)),
        ].sort((a, b) => a.localeCompare(b))
        for (const code of codes) {
          const subset = rows.filter((r) => String(r.store_code ?? '').trim() === code)
          series[code] = aggregatePosSalesByPeriod(subset, groupBy, orderTypesAllowed)
        }
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
