/**
 * 매출 필터 옵션 (매장 목록). pos_orders 기준.
 * startStr~endStr: POS 영업일 라벨(매장별 영업시간) 구간 — getPosTodaySales / 매출 리포트와 동일.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { filterRowsByPosSalesBusinessDateRange, posSalesBusinessDateRangeUtcEnvelope } from '@/lib/pos-sales-business-day-range'
import { loadPosBusinessDaySettingsContext } from '@/lib/pos-business-day-server'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800')

  try {
    const { searchParams } = new URL(request.url)
    const startStr = searchParams.get('startStr')?.trim()
    const endStr = searchParams.get('endStr')?.trim()

    if (!startStr || !endStr) {
      return NextResponse.json({ posOptions: [] }, { headers })
    }

    const bizCtx = await loadPosBusinessDaySettingsContext()
    const { startISO, endISOExclusive } = posSalesBusinessDateRangeUtcEnvelope(bizCtx, startStr, endStr)

    const filter = `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}`
    const rowsRaw = (await supabaseSelectFilter('pos_orders', filter, {
      limit: 50000,
      select: 'store_code,created_at',
    })) as { store_code?: string; created_at?: string }[]

    const rows = filterRowsByPosSalesBusinessDateRange(rowsRaw, bizCtx, startStr, endStr)

    const posSet = new Set<string>()
    for (const r of rows) {
      const p = String(r.store_code ?? '').trim()
      if (p) posSet.add(p)
    }
    const posOptions = Array.from(posSet).sort()
    if (rowsRaw.length >= 50000) headers.set('X-Sales-Truncated', '1')

    return NextResponse.json({ posOptions, source: 'select' as const }, { headers })
  } catch (e) {
    console.error('posSalesFilterOptions:', e)
    return NextResponse.json({ posOptions: [] }, { headers })
  }
}
