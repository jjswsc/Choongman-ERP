import { NextRequest, NextResponse } from 'next/server'
import { supabaseRpc, supabaseSelectFilter } from '@/lib/supabase-server'
import { bangkokDateRangeToUtc } from '@/lib/attendance-utils'
import { getPosBusinessDateStrFromConfig, posBusinessDateYmdToUtcRange } from '@/lib/pos-business-day'
import { loadPosBusinessDayStartForServer } from '@/lib/pos-business-day-server'

const COMPLETED_STATUSES = ['completed', 'paid', 'ready']
export const dynamic = 'force-dynamic'

/** POS 영업일 매출 요약 (완료 건수, 합계, 현금 매출) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')
  const { searchParams } = new URL(request.url)
  const storeCode = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()
  const startStr = String(searchParams.get('startStr') || '').trim()
  const endStr = String(searchParams.get('endStr') || '').trim()

  const bizStart = await loadPosBusinessDayStartForServer(
    storeCode && storeCode !== 'All' ? storeCode : null
  )
  const { startISO, endISOExclusive } =
    startStr && endStr
      ? bangkokDateRangeToUtc(startStr, endStr)
      : posBusinessDateYmdToUtcRange(getPosBusinessDateStrFromConfig(new Date(), bizStart), bizStart)

  try {
    const rpcRows = (await supabaseRpc<
      {
        completed_count?: number
        completed_total?: number
        completed_cash?: number
        pending_count?: number
      }[]
    >('get_pos_sales_period_summary', {
      p_start_utc: startISO,
      p_end_utc_exclusive: endISOExclusive,
      p_store_codes: storeCode && storeCode !== 'All' ? [storeCode] : null,
    }).catch(() => null)) as
      | {
          completed_count?: number
          completed_total?: number
          completed_cash?: number
          pending_count?: number
        }[]
      | null

    if (rpcRows?.length) {
      const row = rpcRows[0] ?? {}
      return NextResponse.json(
        {
          completedCount: Number(row.completed_count ?? 0) || 0,
          completedTotal: Number(row.completed_total ?? 0) || 0,
          completedCash: Number(row.completed_cash ?? 0) || 0,
          pendingCount: Number(row.pending_count ?? 0) || 0,
          source: 'rpc',
        },
        { headers }
      )
    }

    const filter =
      `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}` +
      (storeCode && storeCode !== 'All' ? `&store_code=ilike.${encodeURIComponent(storeCode)}` : '')

    const rows = (await supabaseSelectFilter('pos_orders', filter, {
      limit: 20000,
      select: 'total,status,payment_cash',
    })) as { total?: number; status?: string; payment_cash?: number }[] | null

    let completedCount = 0
    let completedTotal = 0
    let completedCash = 0
    let pendingCount = 0

    for (const r of rows || []) {
      const status = String(r.status ?? '')
      const total = Number(r.total) ?? 0
      if (COMPLETED_STATUSES.includes(status)) {
        completedCount++
        completedTotal += total
        completedCash += Number(r.payment_cash) ?? 0
      } else if (status === 'pending' || status === 'cooking') {
        pendingCount++
      }
    }

    return NextResponse.json(
      {
        completedCount,
        completedTotal,
        completedCash,
        pendingCount,
        source: 'fallback',
      },
      { headers }
    )
  } catch (e) {
    console.error('getPosTodaySales:', e)
    return NextResponse.json(
      { completedCount: 0, completedTotal: 0, completedCash: 0, pendingCount: 0 },
      { headers }
    )
  }
}
