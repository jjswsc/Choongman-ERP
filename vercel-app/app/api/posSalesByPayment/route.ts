/**
 * 결제수단별 매출. pos_orders 기반. 현금/카드/QR/기타.
 * 조회 구간: POS 영업일 라벨(getPosTodaySales 와 동일).
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { filterRowsByPosSalesBusinessDateRange, posSalesBusinessDateRangeUtcEnvelope } from '@/lib/pos-sales-business-day-range'
import { parseOrderTypesParam, rowMatchesOrderFilter } from '@/lib/pos-sales-order-type-filter'
import { resolveStoresFromParams, appendStoreCodeFilter } from '@/lib/pos-sales-store-filter'
import { parsePaymentOtherBreakdown, sumPaymentOtherBreakdown } from '@/lib/pos-payment-other-breakdown'
import { loadPosBusinessDaySettingsContext } from '@/lib/pos-business-day-server'

const COMPLETED_STATUSES = ['completed', 'paid', 'ready']
const FETCH_LIMIT = 50000

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')

  try {
    const { searchParams } = new URL(request.url)
    const startStr = searchParams.get('startStr')?.trim()
    const endStr = searchParams.get('endStr')?.trim()
    const pos = searchParams.get('pos')?.trim()
    const stores = resolveStoresFromParams(pos, searchParams.get('stores'))
    const orderTypesAllowed = parseOrderTypesParam(searchParams.get('orderTypes'))

    if (!startStr || !endStr) {
      return NextResponse.json({ success: false, message: 'startStr, endStr 필요' }, { headers })
    }

    const bizCtx = await loadPosBusinessDaySettingsContext()
    const { startISO, endISOExclusive } = posSalesBusinessDateRangeUtcEnvelope(bizCtx, startStr, endStr)
    let filter = `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}`
    filter = appendStoreCodeFilter(filter, stores)

    const rowsRaw = (await supabaseSelectFilter('pos_orders', filter, {
      limit: FETCH_LIMIT,
      select:
        'created_at,payment_cash,payment_card,payment_qr,payment_other,payment_other_breakdown,payment_delivery_app,delivery_payment_channel,total,status,order_type,store_code',
    })) as {
      created_at?: string
      payment_cash?: number
      payment_card?: number
      payment_qr?: number
      payment_other?: number
      payment_other_breakdown?: unknown
      payment_delivery_app?: number
      delivery_payment_channel?: string | null
      order_type?: string | null
      total?: number
      status?: string
      store_code?: string
    }[]

    const rows = filterRowsByPosSalesBusinessDateRange(rowsRaw, bizCtx, startStr, endStr)

    if (rowsRaw.length >= FETCH_LIMIT) headers.set('X-Sales-Truncated', '1')

    const byMethod: Record<string, number> = {}
    for (const r of rows) {
      if (!rowMatchesOrderFilter(r.order_type ?? undefined, orderTypesAllowed)) continue
      if (!COMPLETED_STATUSES.includes(String(r.status ?? ''))) continue
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
    console.error('posSalesByPayment:', e)
    return NextResponse.json([], { headers })
  }
}
