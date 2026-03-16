/**
 * 채널별 매출 (매장/포장/배달). pos_orders 기반. order_type 기준.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { bangkokDateRangeToUtc } from '@/lib/attendance-utils'

const COMPLETED_STATUSES = ['completed', 'paid', 'ready']

const ORDER_LABELS: Record<string, string> = {
  dine_in: '매장',
  takeout: '포장',
  delivery: '배달',
}
const ORDER = ['매장', '포장', '배달']

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

    const byApp: Record<string, number> = {}
    for (const r of rows) {
      if (!COMPLETED_STATUSES.includes(String(r.status ?? ''))) continue
      const label = ORDER_LABELS[String(r.order_type ?? '')] || '기타'
      const amt = Number(r.total) || 0
      byApp[label] = (byApp[label] || 0) + amt
    }
    const total = Object.values(byApp).reduce((a, b) => a + b, 0)
    const result = ORDER.filter((k) => byApp[k] != null).map((label) => ({
      label,
      sales: byApp[label] || 0,
      pct: total > 0 ? ((byApp[label] || 0) / total) * 100 : 0,
    }))

    return NextResponse.json({ items: result, total }, { headers })
  } catch (e) {
    console.error('posSalesByDeliveryApp:', e)
    return NextResponse.json({ items: [], total: 0 }, { headers })
  }
}
