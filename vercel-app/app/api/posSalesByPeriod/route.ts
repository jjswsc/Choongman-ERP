/**
 * 기간별 집계 (연/월/주/일/요일/시간대별). pos_orders 기반.
 * 우선 RPC get_pos_sales_analytics_agg → 미배포 시 fetch 폴백.
 * 요일 필터: RPC 일별 집계 → 요일 필터 → groupBy rollup (주문 풀스캔 회피).
 * 시간대(hour)+요일만 RPC로 불가 → fetch 폴백.
 */
import { NextRequest, NextResponse } from 'next/server'
import { parseOrderTypesParam } from '@/lib/pos-sales-order-type-filter'
import { parseDowsParam } from '@/lib/pos-sales-dow-filter'
import { resolveStoresFromParams } from '@/lib/pos-sales-store-filter'
import { resolvePosSalesStoresFromRequest } from '@/lib/pos-sales-request-scope'
import {
  aggregatePosSalesByPeriod,
  buildPosSalesSplitSeriesByStore,
  rollupPeriodDayRows,
  rollupPeriodDaySeries,
} from '@/lib/pos-sales-period-aggregate'
import { fetchPosSalesOrdersForBusinessRange, POS_SALES_PAYMENT_ROW_SELECT } from '@/lib/pos-sales-fetch-rows'
import { resolvePosBusinessHoursFromContext } from '@/lib/pos-business-day-server'
import {
  buildPeriodSeriesFromAnalyticsAggRows,
  mapAnalyticsAggRowToPeriodRow,
  sortPeriodAggRows,
  tryFetchPosSalesAnalyticsAgg,
} from '@/lib/pos-sales-analytics-rpc-server'
import { canonicalizePeriodSeriesKeys } from '@/lib/pos-sales-analytics-rpc-map'
import { applyPosSalesCacheControl } from '@/lib/pos-sales-response-cache'

/** 다매장·장기 조회 시 fetch 폴백이 길어질 수 있음 */
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  applyPosSalesCacheControl(headers, searchParams)

  try {
    const startStr = searchParams.get('startStr')?.trim()
    const endStr = searchParams.get('endStr')?.trim()
    const groupBy = searchParams.get('groupBy') || 'day'
    const groupByNorm = String(groupBy).toLowerCase()
    const pos = searchParams.get('pos')?.trim()
    const stores = await resolvePosSalesStoresFromRequest(
      request,
      resolveStoresFromParams(pos, searchParams.get('stores'))
    )
    const splitByStore = searchParams.get('splitByStore') === '1' || searchParams.get('splitByStore') === 'true'
    const orderTypesAllowed = parseOrderTypesParam(searchParams.get('orderTypes'))
    const daysOfWeekAllowed = parseDowsParam(searchParams.get('dows'))

    if (!startStr || !endStr) {
      return NextResponse.json({ success: false, message: 'startStr, endStr 필요' }, { headers })
    }

    /** 요일 필터 + 비-hour: RPC day → filter → rollup (풀스캔 금지) */
    const useDowRpcFastPath = daysOfWeekAllowed != null && groupByNorm !== 'hour'
    const rpcRows = useDowRpcFastPath
      ? await tryFetchPosSalesAnalyticsAgg({
          request,
          startStr,
          endStr,
          storeCodes: stores.length > 0 ? stores : undefined,
          orderTypes: orderTypesAllowed,
          aggMode: splitByStore ? 'period_by_store' : 'period',
          periodGroup: 'day',
        })
      : daysOfWeekAllowed == null
        ? await tryFetchPosSalesAnalyticsAgg({
            request,
            startStr,
            endStr,
            storeCodes: stores.length > 0 ? stores : undefined,
            orderTypes: orderTypesAllowed,
            aggMode: splitByStore ? 'period_by_store' : 'period',
            periodGroup: groupBy,
          })
        : null

    if (rpcRows) {
      headers.set('X-Pos-Sales-Source', useDowRpcFastPath ? 'rpc-dow' : 'rpc')
      if (splitByStore) {
        const dayOrGroupSeries = canonicalizePeriodSeriesKeys(
          buildPeriodSeriesFromAnalyticsAggRows(rpcRows, useDowRpcFastPath ? 'day' : groupBy),
          stores.length > 0 ? stores : undefined
        )
        const series = useDowRpcFastPath
          ? rollupPeriodDaySeries(dayOrGroupSeries, groupBy, daysOfWeekAllowed)
          : dayOrGroupSeries
        return NextResponse.json({ split: true as const, series, truncated: false }, { headers })
      }
      if (useDowRpcFastPath) {
        const dayRows = sortPeriodAggRows(
          rpcRows.map((r) => mapAnalyticsAggRowToPeriodRow(r)),
          'day'
        )
        return NextResponse.json(
          rollupPeriodDayRows(dayRows, groupBy, daysOfWeekAllowed),
          { headers }
        )
      }
      const result = sortPeriodAggRows(
        rpcRows.map((r) => mapAnalyticsAggRowToPeriodRow(r)),
        groupBy
      )
      return NextResponse.json(result, { headers })
    }

    const { rows, truncated, bizCtx } = await fetchPosSalesOrdersForBusinessRange({
      request,
      startStr,
      endStr,
      storeCodes: stores.length > 0 ? stores : undefined,
      queryLabel: 'posSalesByPeriod',
      select: POS_SALES_PAYMENT_ROW_SELECT,
    })

    if (truncated) headers.set('X-Sales-Truncated', '1')
    headers.set('X-Pos-Sales-Source', 'fetch')

    const resolveSc = (sc: string) => resolvePosBusinessHoursFromContext(bizCtx, sc)

    if (splitByStore) {
      const series = buildPosSalesSplitSeriesByStore({
        rows,
        stores,
        groupBy,
        orderTypesAllowed,
        resolveBusinessDayStart: resolveSc,
        daysOfWeekAllowed,
      })
      return NextResponse.json({ split: true as const, series, truncated }, { headers })
    }

    const result = aggregatePosSalesByPeriod(
      rows,
      groupBy,
      orderTypesAllowed,
      undefined,
      resolveSc,
      daysOfWeekAllowed
    )
    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('posSalesByPeriod:', e)
    return NextResponse.json([], { headers })
  }
}
