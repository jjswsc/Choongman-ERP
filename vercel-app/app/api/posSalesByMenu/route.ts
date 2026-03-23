/**
 * 메뉴별 매출 (수량·금액). pos_orders 기반. items_json에서 추출.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { bangkokDateRangeToUtc } from '@/lib/attendance-utils'
import { parseOrderTypesParam, rowMatchesOrderFilter } from '@/lib/pos-sales-order-type-filter'

const COMPLETED_STATUSES = ['completed', 'paid', 'ready']

type PosOrderItem = { id?: string; name?: string; price?: number; qty?: number }

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(request.url)
    const startStr = searchParams.get('startStr')?.trim()
    const endStr = searchParams.get('endStr')?.trim()
    const pos = searchParams.get('pos')?.trim()
    const search = searchParams.get('search')?.trim().toLowerCase()
    const orderTypesAllowed = parseOrderTypesParam(searchParams.get('orderTypes'))

    if (!startStr || !endStr) {
      return NextResponse.json({ success: false, message: 'startStr, endStr 필요' }, { headers })
    }

    const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startStr, endStr)
    let filter = `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}`
    if (pos && pos !== 'All') filter += `&store_code=ilike.${encodeURIComponent(pos)}`

    const rows = (await supabaseSelectFilter('pos_orders', filter, {
      limit: 10000,
      select: 'items_json,status,order_type',
    })) as { items_json?: string; status?: string; order_type?: string }[]

    const byMenu: Record<string, { qty: number; sales: number }> = {}
    for (const r of rows) {
      if (!rowMatchesOrderFilter(r.order_type, orderTypesAllowed)) continue
      if (!COMPLETED_STATUSES.includes(String(r.status ?? ''))) continue
      let items: PosOrderItem[] = []
      try {
        const parsed = JSON.parse(r.items_json || '[]')
        items = Array.isArray(parsed) ? parsed : []
      } catch {
        // skip
      }
      for (const it of items) {
        const name = String(it.name ?? '').trim() || '(없음)'
        if (search && !name.toLowerCase().includes(search)) continue
        const qty = Math.max(0, Number(it.qty) || 0)
        const price = Number(it.price) || 0
        const sales = qty * price
        if (!byMenu[name]) byMenu[name] = { qty: 0, sales: 0 }
        byMenu[name].qty += qty
        byMenu[name].sales += sales
      }
    }

    const result = Object.entries(byMenu)
      .map(([name, v]) => ({ name, qty: v.qty, sales: v.sales }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 500)

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('posSalesByMenu:', e)
    return NextResponse.json([], { headers })
  }
}
