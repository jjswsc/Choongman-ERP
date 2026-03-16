/**
 * 결제수단별 매출. pos_orders 기반. 현금/카드/QR/기타.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { bangkokDateRangeToUtc } from '@/lib/attendance-utils'

const COMPLETED_STATUSES = ['completed', 'paid', 'ready']

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(request.url)
    const startStr = searchParams.get('startStr')?.trim()
    const endStr = searchParams.get('endStr')?.trim()
    const pos = searchParams.get('pos')?.trim()

    if (!startStr || !endStr) {
      return NextResponse.json({ success: false, message: 'startStr, endStr 필요' }, { headers })
    }

    const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startStr, endStr)
    let filter = `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}`
    if (pos && pos !== 'All') filter += `&store_code=ilike.${encodeURIComponent(pos)}`

    const rows = (await supabaseSelectFilter('pos_orders', filter, {
      limit: 50000,
      select: 'payment_cash,payment_card,payment_qr,payment_other,total,status',
    })) as {
      payment_cash?: number
      payment_card?: number
      payment_qr?: number
      payment_other?: number
      total?: number
      status?: string
    }[]

    const byMethod: Record<string, number> = {}
    for (const r of rows) {
      if (!COMPLETED_STATUSES.includes(String(r.status ?? ''))) continue
      const cash = Number(r.payment_cash) || 0
      const card = Number(r.payment_card) || 0
      const qr = Number(r.payment_qr) || 0
      const other = Number(r.payment_other) || 0
      if (cash > 0) byMethod['현금'] = (byMethod['현금'] || 0) + cash
      if (card > 0) byMethod['카드'] = (byMethod['카드'] || 0) + card
      if (qr > 0) byMethod['QR'] = (byMethod['QR'] || 0) + qr
      if (other > 0) byMethod['기타'] = (byMethod['기타'] || 0) + other
    }

    const result = Object.entries(byMethod)
      .filter(([, v]) => v > 0)
      .map(([label, sales]) => ({ label, sales }))
      .sort((a, b) => b.sales - a.sales)

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('posSalesByPayment:', e)
    return NextResponse.json([], { headers })
  }
}
