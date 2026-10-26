/**
 * 결제수단별 매출. pos_orders 기반.
 * 우선 RPC get_pos_sales_analytics_agg → 미배포 시 fetch 폴백(기타 지갑 세부 포함).
 */
import { NextRequest, NextResponse } from 'next/server'
import { parseOrderTypesParam } from '@/lib/pos-sales-order-type-filter'
import { resolveStoresFromParams } from '@/lib/pos-sales-store-filter'
import { resolvePosSalesStoresFromRequest } from '@/lib/pos-sales-request-scope'
import {
  fetchPosSalesOrdersForBusinessRange,
  POS_SALES_PAYMENT_ROW_SELECT,
} from '@/lib/pos-sales-fetch-rows'
import { filterCompletedPosSalesRows } from '@/lib/pos-sales-period-aggregate'
import { accumulatePosOrderPaymentSales, sortPosPaymentSalesRows } from '@/lib/pos-payment-tender-labels'
import {
  isPosSalesAnalyticsRpcTimeoutError,
  respondPosSalesAnalyticsTimeout,
  tryFetchPosSalesAnalyticsAgg,
} from '@/lib/pos-sales-analytics-rpc-server'
import {
  filterPosSalesRowsToPaidBusinessDay,
  patchPosPaymentSummaryCash,
  sumPosSalesPaymentCash,
} from '@/lib/pos-sales-payment-paid-basis'

type PaymentOrderRow = {
  order_type?: string | null
  payment_cash?: number
  payment_card?: number
  payment_qr?: number
  payment_other?: number
  payment_other_breakdown?: unknown
  payment_delivery_app?: number
  payment_crypto?: number
  delivery_payment_channel?: string | null
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')

  try {
    const { searchParams } = new URL(request.url)
    const startStr = searchParams.get('startStr')?.trim()
    const endStr = searchParams.get('endStr')?.trim()
    const pos = searchParams.get('pos')?.trim()
    const stores = await resolvePosSalesStoresFromRequest(
      request,
      resolveStoresFromParams(pos, searchParams.get('stores'))
    )
    const orderTypesAllowed = parseOrderTypesParam(searchParams.get('orderTypes'))

    if (!startStr || !endStr) {
      return NextResponse.json({ success: false, message: 'startStr, endStr 필요' }, { headers })
    }

    const { rows, truncated, bizCtx } = await fetchPosSalesOrdersForBusinessRange({
      request,
      startStr,
      endStr,
      storeCodes: stores.length > 0 ? stores : undefined,
      select: POS_SALES_PAYMENT_ROW_SELECT,
      queryLabel: 'posSalesByPayment',
      ordersDateBasis: 'created',
    })

    if (truncated) headers.set('X-Sales-Truncated', '1')

    const paidRows = filterPosSalesRowsToPaidBusinessDay(
      filterCompletedPosSalesRows(rows, orderTypesAllowed),
      bizCtx,
      startStr,
      endStr
    ) as PaymentOrderRow[]
    const liveCashOpen = sumPosSalesPaymentCash(paidRows)

    if (!truncated) {
      headers.set('X-Pos-Sales-Source', 'fetch-open')
      const result = sortPosPaymentSalesRows(accumulatePosOrderPaymentSales(paidRows)).map(
        ({ paymentKey, sales }) => ({ paymentKey, sales })
      )
      return NextResponse.json(result, { headers })
    }

    const rpcRows = await tryFetchPosSalesAnalyticsAgg({
      request,
      startStr,
      endStr,
      storeCodes: stores.length > 0 ? stores : undefined,
      orderTypes: orderTypesAllowed,
      aggMode: 'payment',
    })

    if (rpcRows) {
      headers.set('X-Pos-Sales-Source', 'rpc+cash-open')
      const result = sortPosPaymentSalesRows(
        patchPosPaymentSummaryCash(
          rpcRows
            .map((r) => ({
              paymentKey: String(r.payment_key ?? r.bucket_key ?? '').trim(),
              sales: Number(r.total ?? 0) || 0,
            }))
            .filter((r) => r.paymentKey && r.sales > 0),
          liveCashOpen
        )
      ).map(({ paymentKey, sales }) => ({ paymentKey, sales }))
      return NextResponse.json(result, { headers })
    }

    headers.set('X-Pos-Sales-Source', 'fetch-open-truncated')
    const result = sortPosPaymentSalesRows(accumulatePosOrderPaymentSales(paidRows)).map(
      ({ paymentKey, sales }) => ({ paymentKey, sales })
    )
    return NextResponse.json(result, { headers })
  } catch (e) {
    if (isPosSalesAnalyticsRpcTimeoutError(e)) return respondPosSalesAnalyticsTimeout(headers)
    console.error('posSalesByPayment:', e)
    return NextResponse.json([], { headers })
  }
}
