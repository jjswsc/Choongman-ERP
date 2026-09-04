import { NextRequest, NextResponse } from 'next/server'
import { getPosBusinessDateStrFromConfig } from '@/lib/pos-business-day'
import {
  loadPosBusinessDaySettingsContext,
  resolvePosBusinessHoursFromContext,
} from '@/lib/pos-business-day-server'
import { resolveStoresFromParams } from '@/lib/pos-sales-store-filter'
import { resolvePosSalesStoresFromRequest } from '@/lib/pos-sales-request-scope'
import { fetchPosSalesOrdersForBusinessRange } from '@/lib/pos-sales-fetch-rows'
import {
  aggregateOpenTableTotalsFromRows,
  emptyPosOpenTableTotals,
  POS_OPEN_TABLE_ROW_SELECT,
  POS_OPEN_TABLE_STATUSES,
  type PosOpenTableOrderRow,
} from '@/lib/pos-open-table-totals'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** 실시간 매출 미결제 테이블 — 미결제 홀 주문만 조회해 합산 (레이아웃 스냅샷 N매장 대기 없음) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')
  const { searchParams } = new URL(request.url)
  const requested = resolveStoresFromParams(
    searchParams.get('storeCode') || searchParams.get('store') || searchParams.get('pos'),
    searchParams.get('stores')
  )

  try {
    const stores = await resolvePosSalesStoresFromRequest(request, requested)
    const bizCtx = await loadPosBusinessDaySettingsContext()
    const hours = resolvePosBusinessHoursFromContext(
      bizCtx,
      stores.length === 1 ? stores[0]! : ''
    )
    const todayYmd = getPosBusinessDateStrFromConfig(new Date(), hours)

    const { rows } = await fetchPosSalesOrdersForBusinessRange({
      request,
      startStr: todayYmd,
      endStr: todayYmd,
      storeCodes: stores.length > 0 ? stores : undefined,
      queryLabel: 'getPosOpenTableTotals',
      select: POS_OPEN_TABLE_ROW_SELECT,
      excludeTestOfficePos: true,
      statusIn: [...POS_OPEN_TABLE_STATUSES],
    })

    const grouped = aggregateOpenTableTotalsFromRows(rows as PosOpenTableOrderRow[], stores)
    return NextResponse.json(
      {
        tableTotal: grouped.total.tableTotal,
        expectedAddend: grouped.total.expectedAddend,
        byStore: grouped.byStore,
      },
      { headers }
    )
  } catch (e) {
    console.error('getPosOpenTableTotals:', e)
    const empty = emptyPosOpenTableTotals()
    return NextResponse.json({ ...empty, byStore: {} }, { headers })
  }
}
