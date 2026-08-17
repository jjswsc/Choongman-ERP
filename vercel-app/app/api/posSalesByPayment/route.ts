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
import { parsePaymentOtherBreakdown, sumPaymentOtherBreakdown } from '@/lib/pos-payment-other-breakdown'
import {
  isPosSalesAnalyticsRpcTimeoutError,
  respondPosSalesAnalyticsTimeout,
  tryFetchPosSalesAnalyticsAgg,
} from '@/lib/pos-sales-analytics-rpc-server'

type PaymentOrderRow = {
  order_type?: string | null
  payment_cash?: number
  payment_card?: number
  payment_qr?: number
  payment_other?: number
  payment_other_breakdown?: unknown
  payment_delivery_app?: number
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

    const rpcRows = await tryFetchPosSalesAnalyticsAgg({
      request,
      startStr,
      endStr,
      storeCodes: stores.length > 0 ? stores : undefined,
      orderTypes: orderTypesAllowed,
      aggMode: 'payment',
    })

    if (rpcRows) {
      headers.set('X-Pos-Sales-Source', 'rpc')
      const result = rpcRows
        .map((r) => ({
          paymentKey: String(r.payment_key ?? r.bucket_key ?? '').trim(),
          sales: Number(r.total ?? 0) || 0,
        }))
        .filter((r) => r.paymentKey && r.sales > 0)
        .sort((a, b) => b.sales - a.sales)
      return NextResponse.json(result, { headers })
    }

    const { rows, truncated } = await fetchPosSalesOrdersForBusinessRange({
      request,
      startStr,
      endStr,
      storeCodes: stores.length > 0 ? stores : undefined,
      select: POS_SALES_PAYMENT_ROW_SELECT,
      queryLabel: 'posSalesByPayment',
    })

    if (truncated) headers.set('X-Sales-Truncated', '1')
    headers.set('X-Pos-Sales-Source', 'fetch')

    const byMethod: Record<string, number> = {}
    for (const r of filterCompletedPosSalesRows(rows, orderTypesAllowed) as PaymentOrderRow[]) {
      const cash = Number(r.payment_cash) || 0
      const card = Number(r.payment_card) || 0
      const qr = Number(r.payment_qr) || 0
      const other = Number(r.payment_other) || 0
      const deliveryApp = Number(r.payment_delivery_app) || 0
      const deliveryCh = String(r.delivery_payment_channel ?? '').trim().toLowerCase()
      const orderType = String(r.order_type ?? '').trim().toLowerCase()
      if (cash > 0) byMethod.cash = (byMethod.cash || 0) + cash
      if (card > 0) byMethod.card = (byMethod.card || 0) + card
      if (qr > 0) byMethod.qr = (byMethod.qr || 0) + qr
      if (other > 0) {
        const bo = parsePaymentOtherBreakdown(r.payment_other_breakdown)
        if (bo && Math.abs(sumPaymentOtherBreakdown(bo) - other) <= 0.02) {
          const add = (key: string, n: number) => {
            if (n > 0.005) byMethod[key] = (byMethod[key] || 0) + n
          }
          add('other_truemoney', Number(bo.trueMoney) || 0)
          add('other_wechat', Number(bo.weChat) || 0)
          add('other_alipay', Number(bo.alipay) || 0)
          add('other_unionpay', Number(bo.unionPay) || 0)
          add('other_linepay', Number(bo.linePay) || 0)
          add('other_shopeepay', Number(bo.shopeePay) || 0)
          add('other_misc', Number(bo.misc) || 0)
          if (bo.admin && typeof bo.admin === 'object') {
            for (const [id, rawAmt] of Object.entries(bo.admin)) {
              const nk = String(id || '').trim()
              if (!nk) continue
              add(`other_wallet_${nk.replace(/[^a-zA-Z0-9_-]/g, '_')}`, Number(rawAmt) || 0)
            }
          }
        } else {
          byMethod.other = (byMethod.other || 0) + other
        }
      }
      if (deliveryApp > 0) {
        byMethod.delivery_app = (byMethod.delivery_app || 0) + deliveryApp
        if (orderType === 'dine_in' || deliveryCh === 'dine_in') {
          byMethod.delivery_dine_in = (byMethod.delivery_dine_in || 0) + deliveryApp
        } else if (deliveryCh === 'grab') byMethod.delivery_grab = (byMethod.delivery_grab || 0) + deliveryApp
        else if (deliveryCh === 'lineman') byMethod.delivery_lineman = (byMethod.delivery_lineman || 0) + deliveryApp
        else if (deliveryCh === 'shopee') byMethod.delivery_shopee = (byMethod.delivery_shopee || 0) + deliveryApp
        else byMethod.delivery_unknown = (byMethod.delivery_unknown || 0) + deliveryApp
      }
    }

    const result = Object.entries(byMethod)
      .filter(([, v]) => v > 0)
      .map(([paymentKey, sales]) => ({ paymentKey, sales }))
      .sort((a, b) => b.sales - a.sales)

    return NextResponse.json(result, { headers })
  } catch (e) {
    if (isPosSalesAnalyticsRpcTimeoutError(e)) return respondPosSalesAnalyticsTimeout(headers)
    console.error('posSalesByPayment:', e)
    return NextResponse.json([], { headers })
  }
}
