import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** POS 결산 데이터 조회 (시스템 매출 + 저장된 결산 입력값) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const settleDate = String(searchParams.get('settleDate') || searchParams.get('date') || '').trim()
  const storeCode = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()

  if (!settleDate) {
    return NextResponse.json({ systemTotal: 0, settlement: null }, { headers })
  }

  try {
    const dayStart = settleDate + 'T00:00:00.000Z'
    const dayEnd = settleDate + 'T23:59:59.999Z'
    const nextDay = new Date(settleDate)
    nextDay.setDate(nextDay.getDate() + 1)
    const nextDayStr = nextDay.toISOString().slice(0, 10) + 'T00:00:00.000Z'

    const orderFilter =
      `created_at=gte.${dayStart}&created_at=lt.${nextDayStr}` +
      (storeCode && storeCode !== 'All' ? `&store_code=ilike.${encodeURIComponent(storeCode)}` : '')

    const orders = (await supabaseSelectFilter('pos_orders', orderFilter, {
      limit: 5000,
      select: 'total,status',
    })) as { total?: number; status?: string }[] | null

    const completedStatuses = ['completed', 'paid', 'ready']
    const systemTotal =
      (orders || []).reduce((sum, o) => {
        if (completedStatuses.includes(o.status || '')) {
          return sum + (Number(o.total) || 0)
        }
        return sum
      }, 0) || 0

    const storeFilter =
      storeCode && storeCode !== 'All'
        ? `store_code=eq.${encodeURIComponent(storeCode)}&settle_date=eq.${settleDate}`
        : `settle_date=eq.${settleDate}`

    const settlements = (await supabaseSelectFilter('pos_settlements', storeFilter, {
      limit: 50,
    })) as {
      id?: number
      store_code?: string
      settle_date?: string
      cash_actual?: number
      card_amt?: number
      qr_amt?: number
      delivery_app_amt?: number
      other_amt?: number
      memo?: string
      closed?: boolean
    }[] | null

    const list = (settlements || []).map((s) => ({
      id: s.id,
      storeCode: String(s.store_code ?? ''),
      settleDate: String(s.settle_date ?? ''),
      cashActual: s.cash_actual != null ? Number(s.cash_actual) : null,
      cardAmt: Number(s.card_amt) ?? 0,
      qrAmt: Number(s.qr_amt) ?? 0,
      deliveryAppAmt: Number(s.delivery_app_amt) ?? 0,
      otherAmt: Number(s.other_amt) ?? 0,
      memo: String(s.memo ?? ''),
      closed: !!s.closed,
    }))

    return NextResponse.json(
      {
        systemTotal,
        settlement: storeCode && storeCode !== 'All' ? list[0] ?? null : list,
      },
      { headers }
    )
  } catch (e) {
    console.error('getPosSettlement:', e)
    return NextResponse.json({ systemTotal: 0, settlement: null }, { headers })
  }
}
