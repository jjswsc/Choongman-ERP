/**
 * 채널별 매출 (매장/포장/배달). pos_orders 기반. pos 필터 지원.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { bangkokDateRangeToUtc } from '@/lib/attendance-utils'

const COMPLETED_STATUSES = ['completed', 'paid', 'ready']

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: '매장',
  takeout: '포장',
  delivery: '배달',
}

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
      select: 'order_type,total,status',
    })) as { order_type?: string; total?: number; status?: string }[]

    const byChannel: Record<string, number> = {}
    for (const r of rows) {
      if (!COMPLETED_STATUSES.includes(String(r.status ?? ''))) continue
      const ch = ORDER_TYPE_LABELS[String(r.order_type ?? '')] || String(r.order_type ?? '').trim() || '(없음)'
      const amt = Number(r.total) || 0
      byChannel[ch] = (byChannel[ch] || 0) + amt
    }

    const result = Object.entries(byChannel)
      .map(([label, sales]) => ({ label, sales }))
      .sort((a, b) => b.sales - a.sales)

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('posSalesByChannel:', e)
    return NextResponse.json([], { headers })
  }
}
