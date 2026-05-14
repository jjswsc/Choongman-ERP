/**
 * 기간별 집계 (연/월/주/일/요일/시간대별). pos_orders 기반.
 * 조회 구간·버킷: POS 영업일 라벨(getPosTodaySales / posBizDayScope 와 동일).
 * splitByStore=1 이면 매장별 시리즈: { split, series } (매장 0·1·N 모두).
 * - 매장 2개 이상: 요청 매장 코드별 부분집합 집계
 * - 매장 1개: 해당 필터 행 전체를 한 키로 집계
 * - 매장 0개(전체): 응답 행에 등장한 store_code 기준으로 분해
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseRpc } from '@/lib/supabase-server'
import {
  supabaseSelectFilterAllPagesStrippingUnknownColumns,
} from '@/lib/supabase-pgrst204-retry'
import { filterRowsByPosSalesBusinessDateRange, posSalesBusinessDateRangeUtcEnvelope } from '@/lib/pos-sales-business-day-range'
import { parseOrderTypesParam } from '@/lib/pos-sales-order-type-filter'
import {
  resolveStoresFromParams,
  appendStoreCodeFilter,
  expandSalesStoreCodesForFilter,
  rowMatchesSalesStoreSelection,
  canonicalSalesStoreRowKey,
} from '@/lib/pos-sales-store-filter'
import { aggregatePosSalesByPeriod, type PeriodOrderRow } from '@/lib/pos-sales-period-aggregate'
import {
  loadPosBusinessDaySettingsContext,
  resolvePosBusinessHoursFromContext,
} from '@/lib/pos-business-day-server'

const FETCH_LIMIT = 50000
/** RPC·단일 limit(5만) 초과 시 기간 말일 누락 방지 — 전체 페이지 상한 */
const PERIOD_FETCH_MAX_ROWS = 500_000
const PERIOD_PAGE_SIZE = 8000

const PERIOD_ORDER_SELECT =
  'created_at,total,subtotal,vat,discount_amt,coupon_discount_amt,service_amt,guest_count,store_code,status,order_type'

async function loadPeriodOrderRows(filter: string): Promise<PeriodOrderRow[]> {
  return (await supabaseSelectFilterAllPagesStrippingUnknownColumns(
    'pos_orders',
    filter,
    {
      select: PERIOD_ORDER_SELECT,
      order: 'created_at.asc',
      pageSize: PERIOD_PAGE_SIZE,
      maxRows: PERIOD_FETCH_MAX_ROWS,
    },
    'posSalesByPeriod'
  )) as PeriodOrderRow[]
}

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
    const expandedStores = expandSalesStoreCodesForFilter(stores)
    const splitByStore = searchParams.get('splitByStore') === '1' || searchParams.get('splitByStore') === 'true'
    const orderTypesAllowed = parseOrderTypesParam(searchParams.get('orderTypes'))

    if (!startStr || !endStr) {
      return NextResponse.json({ success: false, message: 'startStr, endStr 필요' }, { headers })
    }

    const bizCtx = await loadPosBusinessDaySettingsContext()
    const { startISO, endISOExclusive } = posSalesBusinessDateRangeUtcEnvelope(bizCtx, startStr, endStr)
    let filter = `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}`
    filter = appendStoreCodeFilter(filter, stores)
    let rows: PeriodOrderRow[] = []
    let usedRpc = false
    try {
      const rpcRows = (await supabaseRpc<PeriodOrderRow[]>('get_pos_sales_period_rows', {
        p_start_utc: startISO,
        p_end_utc_exclusive: endISOExclusive,
        p_store_codes: expandedStores.length > 0 ? expandedStores : null,
        p_limit: FETCH_LIMIT,
      })) as PeriodOrderRow[]
      if (Array.isArray(rpcRows) && rpcRows.length > 0 && rpcRows.length < FETCH_LIMIT) {
        const hasServiceColumn = rpcRows.some((r) =>
          Object.prototype.hasOwnProperty.call(r, 'service_amt')
        )
        if (hasServiceColumn) {
          rows = rpcRows
          usedRpc = true
        }
      }
    } catch {
      usedRpc = false
    }
    if (!usedRpc) {
      rows = await loadPeriodOrderRows(filter)
    }
    const preFilterRowCount = rows.length
    rows = filterRowsByPosSalesBusinessDateRange(rows, bizCtx, startStr, endStr)
    const truncated =
      preFilterRowCount >= PERIOD_FETCH_MAX_ROWS || (usedRpc && preFilterRowCount >= FETCH_LIMIT)
    if (truncated) headers.set('X-Sales-Truncated', '1')
    headers.set('X-Pos-Sales-Source', usedRpc ? 'rpc' : 'select-all-pages')

    const resolveSc = (sc: string) => resolvePosBusinessHoursFromContext(bizCtx, sc)

    if (splitByStore) {
      const series: Record<string, ReturnType<typeof aggregatePosSalesByPeriod>> = {}
      if (stores.length >= 2) {
        for (const code of stores) {
          const subset = rows.filter((r) => rowMatchesSalesStoreSelection(r.store_code, code))
          series[code] = aggregatePosSalesByPeriod(subset, groupBy, orderTypesAllowed, undefined, resolveSc)
        }
      } else if (stores.length === 1) {
        const code = stores[0]
        series[code] = aggregatePosSalesByPeriod(rows, groupBy, orderTypesAllowed, undefined, resolveSc)
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
