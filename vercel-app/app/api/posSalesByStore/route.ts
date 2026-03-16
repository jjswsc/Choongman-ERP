/**
 * 매장별 매출 집계. pos_orders 기반.
 * 매장명, 점유수(건수), 공급가액(subtotal), 세금(vat), 매출액(total)
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
      select: 'store_code,subtotal,vat,total,status',
    })) as { store_code?: string; subtotal?: number; vat?: number; total?: number; status?: string }[]

    const byStore: Record<
      string,
      { count: number; subtotal: number; vat: number; total: number }
    > = {}

    for (const r of rows) {
      if (!COMPLETED_STATUSES.includes(String(r.status ?? ''))) continue
      const store = String(r.store_code ?? '').trim() || '(미지정)'
      if (!byStore[store]) byStore[store] = { count: 0, subtotal: 0, vat: 0, total: 0 }
      byStore[store].count += 1
      byStore[store].subtotal += Number(r.subtotal) || 0
      byStore[store].vat += Number(r.vat) || 0
      byStore[store].total += Number(r.total) || 0
    }

    const result = Object.entries(byStore)
      .map(([storeName, v]) => ({
        storeName,
        count: v.count,
        subtotal: v.subtotal,
        vat: v.vat,
        total: v.total,
      }))
      .sort((a, b) => b.total - a.total)

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('posSalesByStore:', e)
    return NextResponse.json([], { headers })
  }
}
