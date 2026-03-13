import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { bangkokDateToUtcRange } from '@/lib/attendance-utils'
import { getPosBusinessDateStr } from '@/lib/pos-business-day'

const COMPLETED_STATUSES = ['completed', 'paid', 'ready']

/** POS 영업일 매출 요약 (완료 건수, 합계) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeCode = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()

  const businessDate = getPosBusinessDateStr()
  const { startISO, endISOExclusive } = bangkokDateToUtcRange(businessDate)

  try {
    const filter =
      `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}` +
      (storeCode && storeCode !== 'All' ? `&store_code=ilike.${encodeURIComponent(storeCode)}` : '')

    const rows = (await supabaseSelectFilter('pos_orders', filter, {
      limit: 2000,
      select: 'total,status',
    })) as { total?: number; status?: string }[] | null

    let completedCount = 0
    let completedTotal = 0
    let pendingCount = 0

    for (const r of rows || []) {
      const status = String(r.status ?? '')
      const total = Number(r.total) ?? 0
      if (COMPLETED_STATUSES.includes(status)) {
        completedCount++
        completedTotal += total
      } else if (status === 'pending' || status === 'cooking') {
        pendingCount++
      }
    }

    return NextResponse.json(
      {
        completedCount,
        completedTotal,
        pendingCount,
      },
      { headers }
    )
  } catch (e) {
    console.error('getPosTodaySales:', e)
    return NextResponse.json(
      { completedCount: 0, completedTotal: 0, pendingCount: 0 },
      { headers }
    )
  }
}
