/**
 * 채널 확인·시재 — POS 현금(payment_cash > 0) 주문 목록 드릴다운
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoresFromParams } from '@/lib/pos-sales-store-filter'
import { resolvePosSalesStoresFromRequest } from '@/lib/pos-sales-request-scope'
import {
  fetchPosSalesOrdersForBusinessRange,
  POS_SALES_CASH_DRILL_ROW_SELECT,
} from '@/lib/pos-sales-fetch-rows'
import { applyPosSalesCacheControl } from '@/lib/pos-sales-response-cache'
import {
  filterCashReconcileRowsByBusinessDateRange,
  listCashReconcileOrders,
  summarizeCashOvernightPaidOnDate,
  type CashReconcileDrillOrderInput,
  type CashReconcileOrderRow,
} from '@/lib/pos-cash-reconcile'
import { makeCashReconcileBusinessDateForRow } from '@/lib/pos-cash-reconcile-business-date'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  applyPosSalesCacheControl(headers, searchParams)

  try {
    const startStr = searchParams.get('startStr')?.trim()
    const endStr = searchParams.get('endStr')?.trim()
    const pos = searchParams.get('pos')?.trim()
    const store = searchParams.get('store')?.trim() || ''
    const date = searchParams.get('date')?.trim() || ''
    const limitRaw = Number(searchParams.get('limit') ?? 200)
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.trunc(limitRaw))) : 200

    if (!startStr || !endStr) {
      return NextResponse.json({ success: false, message: 'startStr, endStr 필요' }, { headers })
    }

    const fromParams = resolveStoresFromParams(pos, searchParams.get('stores'))
    const fetchStoreCodes =
      fromParams.length > 0 ? fromParams : store ? [store] : []
    const stores = await resolvePosSalesStoresFromRequest(request, fetchStoreCodes)

    const { rows, truncated: fetchTruncated, bizCtx } = await fetchPosSalesOrdersForBusinessRange({
      request,
      startStr,
      endStr,
      storeCodes: stores.length > 0 ? stores : undefined,
      select: POS_SALES_CASH_DRILL_ROW_SELECT,
      queryLabel: 'posCashOrderDrillDown',
      ordersDateBasis: 'either',
    })

    const businessDateForRow = makeCashReconcileBusinessDateForRow(bizCtx)
    const dayFilter = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined
    const rangeLo = dayFilter || startStr
    const rangeHi = dayFilter || endStr
    const cashRows = filterCashReconcileRowsByBusinessDateRange(
      rows as CashReconcileOrderRow[],
      rangeLo,
      rangeHi,
      businessDateForRow
    ) as CashReconcileDrillOrderInput[]
    const listed = listCashReconcileOrders(cashRows, {
      businessDateForRow,
      storeCode: store || undefined,
      date: dayFilter,
      limit,
    })
    const overnightPaidDate = dayFilter || (startStr === endStr ? startStr : '')
    const overnight =
      overnightPaidDate && /^\d{4}-\d{2}-\d{2}$/.test(overnightPaidDate)
        ? summarizeCashOvernightPaidOnDate(cashRows, {
            businessDateForRow,
            paidBusinessDate: overnightPaidDate,
          })
        : { orderCount: 0, cashSales: 0 }

    if (fetchTruncated || listed.truncated) headers.set('X-Sales-Truncated', '1')

    return NextResponse.json(
      {
        success: true,
        orders: listed.orders,
        orderCount: listed.orderCount,
        cashSales: listed.cashSales,
        overnightOrderCount: overnight.orderCount,
        overnightCashSales: overnight.cashSales,
        truncated: fetchTruncated || listed.truncated,
        store: store || null,
        date: date || null,
      },
      { headers }
    )
  } catch (e) {
    console.error('pos/cash-order-drill-down:', e)
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : 'pos_cash_order_drill_down_error',
        orders: [],
        orderCount: 0,
        cashSales: 0,
        truncated: false,
      },
      { status: 500, headers }
    )
  }
}
