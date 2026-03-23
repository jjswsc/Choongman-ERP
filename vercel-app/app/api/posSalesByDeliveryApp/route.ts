/**
 * 채널별 매출 (매장/포장/배달). pos_orders 기반. order_type 기준.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { bangkokDateRangeToUtc } from '@/lib/attendance-utils'
import { parseOrderTypesParam, rowMatchesOrderFilter } from '@/lib/pos-sales-order-type-filter'

const COMPLETED_STATUSES = ['completed', 'paid', 'ready']

const ORDER_KEYS = ['dine_in', 'takeout', 'delivery'] as const

function bucketOrderType(raw: string): (typeof ORDER_KEYS)[number] | 'unknown' {
  const t = String(raw ?? '').trim()
  if (t === 'dine_in' || t === 'takeout' || t === 'delivery') return t
  return 'unknown'
}

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
      select: 'order_type,total,status',
    })) as { order_type?: string; total?: number; status?: string }[]

    const byApp: Record<string, number> = {}
    for (const r of rows) {
      if (!rowMatchesOrderFilter(r.order_type, orderTypesAllowed)) continue
      if (!COMPLETED_STATUSES.includes(String(r.status ?? ''))) continue
      const k = bucketOrderType(String(r.order_type ?? ''))
      const amt = Number(r.total) || 0
      byApp[k] = (byApp[k] || 0) + amt
    }
    const total = Object.values(byApp).reduce((a, b) => a + b, 0)
    const result: { channelKey: string; sales: number; pct: number }[] = []
    for (const channelKey of ORDER_KEYS) {
      const s = byApp[channelKey] || 0
      if (s > 0) {
        result.push({
          channelKey,
          sales: s,
          pct: total > 0 ? (s / total) * 100 : 0,
        })
      }
    }
    const u = byApp.unknown || 0
    if (u > 0) {
      result.push({
        channelKey: 'unknown',
        sales: u,
        pct: total > 0 ? (u / total) * 100 : 0,
      })
    }

    return NextResponse.json({ items: result, total }, { headers })
  } catch (e) {
    console.error('posSalesByDeliveryApp:', e)
    return NextResponse.json({ items: [], total: 0 }, { headers })
  }
}
