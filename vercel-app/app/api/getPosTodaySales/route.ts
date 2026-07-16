import { NextRequest, NextResponse } from 'next/server'
import { getPosBusinessDateStrFromConfig } from '@/lib/pos-business-day'
import {
  loadPosBusinessDaySettingsContext,
  resolvePosBusinessHoursFromContext,
} from '@/lib/pos-business-day-server'
import {
  canUsePosSalesPeriodSummaryRpc,
  posSalesPeriodSummaryUtcEnvelopeForStore,
  tryFetchPosSalesPeriodSummaryRpc,
} from '@/lib/pos-sales-period-summary-rpc'
import {
  fetchPosSalesOrdersForBusinessRange,
  POS_SALES_ORDER_ROW_SELECT,
} from '@/lib/pos-sales-fetch-rows'

const COMPLETED_STATUSES = new Set(['completed', 'paid', 'ready'])
const PENDING_STATUSES = new Set(['pending', 'cooking'])

const TODAY_SALES_SELECT = `${POS_SALES_ORDER_ROW_SELECT},payment_cash`

export const dynamic = 'force-dynamic'

async function aggregateTodaySalesFromFetchedRows(
  rows: Awaited<ReturnType<typeof fetchPosSalesOrdersForBusinessRange>>['rows']
) {
  let completedCount = 0
  let completedTotal = 0
  let completedCash = 0
  let pendingCount = 0

  for (const r of rows) {
    const status = String(r.status ?? '').toLowerCase()
    const total = Number(r.total) || 0
    if (COMPLETED_STATUSES.has(status)) {
      completedCount += 1
      completedTotal += total
      completedCash += Number((r as { payment_cash?: number }).payment_cash) || 0
    } else if (PENDING_STATUSES.has(status)) {
      pendingCount += 1
    }
  }

  return { completedCount, completedTotal, completedCash, pendingCount }
}

/** POS 영업일 매출 요약 (완료 건수, 합계, 현금 매출) — posSalesByStore 와 동일 기준 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')
  const { searchParams } = new URL(request.url)
  const storeCode = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()
  const startStrParam = String(searchParams.get('startStr') || '').trim()
  const endStrParam = String(searchParams.get('endStr') || '').trim()
  const forceFetch =
    searchParams.get('forceFetch') === '1' || searchParams.get('forceFetch') === 'true'

  try {
    const bizCtx = await loadPosBusinessDaySettingsContext()
    const hours = resolvePosBusinessHoursFromContext(
      bizCtx,
      storeCode && storeCode !== 'All' ? storeCode : ''
    )
    const todayYmd = getPosBusinessDateStrFromConfig(new Date(), hours)
    const startStr = startStrParam || todayYmd
    const endStr = endStrParam || startStr

    if (
      !forceFetch &&
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
      storeCodes: storeCode && storeCode !== 'All' ? [storeCode] : undefined,
      queryLabel: 'getPosTodaySales',
      select: TODAY_SALES_SELECT,
      excludeTestOfficePos: false,
    })

    const totals = await aggregateTodaySalesFromFetchedRows(rows)

    return NextResponse.json(
      {
        ...totals,
        source: 'posSalesFetchRows' as const,
        truncated,
      },
      { headers }
    )
  } catch (e) {
    console.error('getPosTodaySales:', e)
    return NextResponse.json(
      { completedCount: 0, completedTotal: 0, completedCash: 0, pendingCount: 0 },
      { headers }
    )
  }
}
