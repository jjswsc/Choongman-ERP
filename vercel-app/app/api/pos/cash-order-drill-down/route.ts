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
import { getPosBusinessDateStrFromConfig } from '@/lib/pos-business-day'
import { resolvePosBusinessHoursFromContext } from '@/lib/pos-business-day-server'
import { applyPosSalesCacheControl } from '@/lib/pos-sales-response-cache'
import {
  listCashReconcileOrders,
  type CashReconcileDrillOrderInput,
  type CashReconcileOrderRow,
} from '@/lib/pos-cash-reconcile'

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
    })

    const businessDateForRow = (row: CashReconcileOrderRow) => {
      const raw = String(row.created_at ?? '').trim()
      if (!raw) return ''
      const d = new Date(
        raw.includes('T') || /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : raw.replace(' ', 'T')
      )
      if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10)
      const hours = resolvePosBusinessHoursFromContext(bizCtx, String(row.store_code ?? '').trim())
      return getPosBusinessDateStrFromConfig(d, hours)
    }

    const listed = listCashReconcileOrders(rows as CashReconcileDrillOrderInput[], {
      businessDateForRow,
      storeCode: store || undefined,
      date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
      limit,
    })

    if (fetchTruncated || listed.truncated) headers.set('X-Sales-Truncated', '1')

    return NextResponse.json(
      {
        success: true,
        orders: listed.orders,
        orderCount: listed.orderCount,
        cashSales: listed.cashSales,
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
