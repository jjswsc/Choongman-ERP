/**
 * 매출 필터 옵션 (매장 목록). pos_orders 기준. startStr~endStr 기간 내 store_code 목록.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseRpc, supabaseSelectFilter } from '@/lib/supabase-server'
import { bangkokDateRangeToUtc } from '@/lib/attendance-utils'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(request.url)
    const startStr = searchParams.get('startStr')?.trim()
    const endStr = searchParams.get('endStr')?.trim()

    if (!startStr || !endStr) {
      return NextResponse.json({ posOptions: [] }, { headers })
    }

    const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startStr, endStr)

    const rpcRows = (await supabaseRpc<{ store_code?: string }[]>('get_pos_sales_filter_store_codes', {
      p_start_utc: startISO,
      p_end_utc_exclusive: endISOExclusive,
    }).catch(() => null)) as { store_code?: string }[] | null

    if (Array.isArray(rpcRows) && rpcRows.length > 0) {
      const posOptions = rpcRows
        .map((r) => String(r.store_code ?? '').trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
      return NextResponse.json({ posOptions, source: 'rpc' as const }, { headers })
    }

    const filter = `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}`
    const rows = (await supabaseSelectFilter('pos_orders', filter, {
      limit: 50000,
      select: 'store_code',
    })) as { store_code?: string }[]

    const posSet = new Set<string>()
    for (const r of rows) {
      const p = String(r.store_code ?? '').trim()
      if (p) posSet.add(p)
    }
    const posOptions = Array.from(posSet).sort()
    if (rows.length >= 50000) headers.set('X-Sales-Truncated', '1')

    return NextResponse.json({ posOptions, source: 'select' as const }, { headers })
  } catch (e) {
    console.error('posSalesFilterOptions:', e)
    return NextResponse.json({ posOptions: [] }, { headers })
  }
}
