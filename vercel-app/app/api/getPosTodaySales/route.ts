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
import { parsePosOrdersDateBasis } from '@/lib/pos-sales-business-day-range'
import { makeCashReconcileBusinessDateForRow } from '@/lib/pos-cash-reconcile-business-date'
import {
  filterCashReconcileRowsByBusinessDateRange,
  summarizeCashOvernightPaidOnDate,
  type CashReconcileDrillOrderInput,
  type CashReconcileOrderRow,
} from '@/lib/pos-cash-reconcile'

const TODAY_SALES_SELECT = `${POS_SALES_ORDER_ROW_SELECT},payment_cash,paid_at`

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
  /** created(기본): 오픈/판매 영업일 — 시재·결산 현금과 동일. paid/either 는 특수 조회용 */
  const ordersDateBasis = parsePosOrdersDateBasis(
    searchParams.get('dateBasis') || searchParams.get('ordersDateBasis')
  )

  try {
    const bizCtx = await loadPosBusinessDaySettingsContext({ storeCode })
    const hours = resolvePosBusinessHoursFromContext(bizCtx, storeCode)
    const todayYmd = getPosBusinessDateStrFromConfig(new Date(), hours)
    const startStr = startStrParam || todayYmd
    const endStr = endStrParam || startStr

    /** RPC 는 created_at 봉투 — paid/either 는 fetch 경로만 */
    if (
      ordersDateBasis === 'created' &&
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
    if (
      ordersDateBasis === 'created' &&
      !forceFetch &&
      storeCodes.length > 1 &&
      startStr === endStr
    ) {
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

    const { rows: rowsRaw, truncated } = await fetchPosSalesOrdersForBusinessRange({
      request,
      startStr,
      endStr,
      storeCodes: storeCodes.length > 0 ? storeCodes : undefined,
      queryLabel: 'getPosTodaySales',
      select: TODAY_SALES_SELECT,
      excludeTestOfficePos: false,
      ordersDateBasis: ordersDateBasis === 'created' ? 'created' : 'either',
    })

    let rows = rowsRaw
    let overnightOrderCount = 0
    let overnightCashSales = 0
    const businessDateForRow = makeCashReconcileBusinessDateForRow(bizCtx)
    if (ordersDateBasis === 'paid') {
      rows = filterCashReconcileRowsByBusinessDateRange(
        rowsRaw as CashReconcileOrderRow[],
        startStr,
        endStr,
        businessDateForRow
      ) as typeof rowsRaw
    }
    if (startStr === endStr) {
      const overnight = summarizeCashOvernightPaidOnDate(rows as CashReconcileDrillOrderInput[], {
        businessDateForRow,
        paidBusinessDate: startStr,
      })
      overnightOrderCount = overnight.orderCount
      overnightCashSales = overnight.cashSales
    }

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
        overnightOrderCount,
        overnightCashSales,
        source: 'posSalesFetchRows' as const,
        truncated,
        dateBasis: ordersDateBasis,
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
