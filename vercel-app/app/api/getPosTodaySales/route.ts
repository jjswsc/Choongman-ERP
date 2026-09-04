import { NextRequest, NextResponse } from 'next/server'
import { getPosBusinessDateStrFromConfig } from '@/lib/pos-business-day'
import {
  loadPosBusinessDaySettingsContext,
  resolvePosBusinessHoursFromContext,
} from '@/lib/pos-business-day-server'
import {
  canUsePosSalesPeriodSummaryRpc,
  posSalesPeriodSummaryUtcEnvelopeForStore,
  tryFetchPosSalesPeriodSummaryByStores,
  tryFetchPosSalesPeriodSummaryRpc,
} from '@/lib/pos-sales-period-summary-rpc'
import {
  fetchPosSalesOrdersForBusinessRange,
  POS_SALES_ORDER_ROW_SELECT,
} from '@/lib/pos-sales-fetch-rows'
import { resolveStoresFromParams } from '@/lib/pos-sales-store-filter'
import {
  aggregatePosTodaySalesFromRows,
  groupPosTodaySalesByCanonicalStore,
  groupPosTodaySalesByStoreCodes,
  sumPosTodaySalesSummaries,
} from '@/lib/pos-today-sales-aggregate'

const TODAY_SALES_SELECT = `${POS_SALES_ORDER_ROW_SELECT},payment_cash`

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** POS 영업일 매출 요약 (완료 건수, 합계, 현금 매출) — posSalesByStore 와 동일 기준 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')
  const { searchParams } = new URL(request.url)
  const storeCodes = resolveStoresFromParams(
    searchParams.get('storeCode') || searchParams.get('store') || searchParams.get('pos'),
    searchParams.get('stores')
  )
  const storeCode = storeCodes.length === 1 ? storeCodes[0]! : ''
  const startStrParam = String(searchParams.get('startStr') || '').trim()
  const endStrParam = String(searchParams.get('endStr') || '').trim()
  const forceFetch =
    searchParams.get('forceFetch') === '1' || searchParams.get('forceFetch') === 'true'

  try {
    const bizCtx = await loadPosBusinessDaySettingsContext()
    const hours = resolvePosBusinessHoursFromContext(bizCtx, storeCode)
    const todayYmd = getPosBusinessDateStrFromConfig(new Date(), hours)
    const startStr = startStrParam || todayYmd
    const endStr = endStrParam || startStr

    if (
      !forceFetch &&
      storeCodes.length === 1 &&
      canUsePosSalesPeriodSummaryRpc({ startStr, endStr, storeCode })
    ) {
      const { startISO, endISOExclusive } = posSalesPeriodSummaryUtcEnvelopeForStore(
        bizCtx,
        startStr,
        storeCode
      )
      const rpcSummary = await tryFetchPosSalesPeriodSummaryRpc({
        startISO,
        endISOExclusive,
        storeCode,
      })
      if (rpcSummary) {
        return NextResponse.json(
          {
            ...rpcSummary,
            byStore: { [storeCode]: rpcSummary },
            source: 'rpc' as const,
            truncated: false,
          },
          { headers }
        )
      }
    }

    /** 전체·복수 매장: 주문 전량 fetch 대신 매장별 RPC 병렬 집계 (검색 체감) */
    if (!forceFetch && storeCodes.length > 1 && startStr === endStr) {
      const byStoreRpc = await tryFetchPosSalesPeriodSummaryByStores({
        bizCtx,
        businessYmd: startStr,
        storeCodes,
      })
      if (byStoreRpc) {
        const totals = sumPosTodaySalesSummaries(Object.values(byStoreRpc))
        return NextResponse.json(
          {
            ...totals,
            byStore: byStoreRpc,
            source: 'rpc' as const,
            truncated: false,
          },
          { headers }
        )
      }
    }

    const { rows, truncated } = await fetchPosSalesOrdersForBusinessRange({
      request,
      startStr,
      endStr,
      storeCodes: storeCodes.length > 0 ? storeCodes : undefined,
      queryLabel: 'getPosTodaySales',
      select: TODAY_SALES_SELECT,
      excludeTestOfficePos: false,
    })

    const byStore =
      storeCodes.length > 0
        ? groupPosTodaySalesByStoreCodes(rows, storeCodes)
        : groupPosTodaySalesByCanonicalStore(rows)
    const totals =
      storeCodes.length > 0
        ? aggregatePosTodaySalesFromRows(rows)
        : sumPosTodaySalesSummaries(Object.values(byStore))

    return NextResponse.json(
      {
        ...totals,
        byStore,
        source: 'posSalesFetchRows' as const,
        truncated,
      },
      { headers }
    )
  } catch (e) {
    console.error('getPosTodaySales:', e)
    return NextResponse.json(
      { completedCount: 0, completedTotal: 0, completedCash: 0, pendingCount: 0, byStore: {} },
      { headers }
    )
  }
}
