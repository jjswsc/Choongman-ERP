/**
 * 결제수단별 매출. pos_orders 기반. 현금/카드/QR/기타.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { bangkokDateRangeToUtc } from '@/lib/attendance-utils'
import { parseOrderTypesParam, rowMatchesOrderFilter } from '@/lib/pos-sales-order-type-filter'

const COMPLETED_STATUSES = ['completed', 'paid', 'ready']

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(request.url)
    const startStr = searchParams.get('startStr')?.trim()
    const endStr = searchParams.get('endStr')?.trim()
    const pos = searchParams.get('pos')?.trim()
    const orderTypesAllowed = parseOrderTypesParam(searchParams.get('orderTypes'))

    if (!startStr || !endStr) {
      return NextResponse.json({ success: false, message: 'startStr, endStr 필요' }, { headers })
    }

    const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startStr, endStr)
    let filter = `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}`
    if (pos && pos !== 'All') filter += `&store_code=ilike.${encodeURIComponent(pos)}`

    const rows = (await supabaseSelectFilter('pos_orders', filter, {
      limit: 50000,
      select: 'payment_cash,payment_card,payment_qr,payment_other,total,status,order_type',
    })) as {
      payment_cash?: number
      payment_card?: number
      payment_qr?: number
      payment_other?: number
      total?: number
      status?: string
      order_type?: string
    }[]

    const byMethod: Record<string, number> = {}
    for (const r of rows) {
      if (!rowMatchesOrderFilter(r.order_type, orderTypesAllowed)) continue
      if (!COMPLETED_STATUSES.includes(String(r.status ?? ''))) continue
      const cash = Number(r.payment_cash) || 0
      const card = Number(r.payment_card) || 0
      const qr = Number(r.payment_qr) || 0
      const other = Number(r.payment_other) || 0
      if (cash > 0) byMethod.cash = (byMethod.cash || 0) + cash
      if (card > 0) byMethod.card = (byMethod.card || 0) + card
      if (qr > 0) byMethod.qr = (byMethod.qr || 0) + qr
      if (other > 0) byMethod.other = (byMethod.other || 0) + other
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
