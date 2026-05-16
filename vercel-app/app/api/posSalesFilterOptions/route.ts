/**
 * 매출 필터 옵션 (매장 목록). pos_orders 기준.
 * startStr~endStr: POS 영업일 라벨 구간에 맞춘 UTC 봉투(posSalesBusinessDateRangeUtcEnvelope)와 동일.
 *
 * 우선 RPC `get_pos_sales_filter_store_codes`: DB에서 DISTINCT만 반환해 PostgREST·Node 메모리 부담을 줄임.
 * RPC 미배포 시 기존 select + filterRowsByPosSalesBusinessDateRange 폴백(영업일 라벨 2차 필터 유지).
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseRpc, supabaseSelectFilter } from '@/lib/supabase-server'
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

    try {
      const rpcRows = (await supabaseRpc<{ store_code?: string | null }[]>('get_pos_sales_filter_store_codes', {
        p_start_utc: startISO,
        p_end_utc_exclusive: endISOExclusive,
      })) as { store_code?: string | null }[] | null
      const posSet = new Set<string>()
      for (const r of rpcRows || []) {
        const p = String(r.store_code ?? '').trim()
        if (p) posSet.add(p)
      }
      const posOptions = Array.from(posSet).sort()
      return NextResponse.json({ posOptions, source: 'rpc' as const }, { headers })
    } catch (_rpcErr) {
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
    }
  } catch (e) {
    console.error('posSalesFilterOptions:', e)
    return NextResponse.json({ posOptions: [] }, { headers })
  }
}
