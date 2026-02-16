import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 본사 발주용: location별 재고 (stock_logs 합산) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const locationCode = String(searchParams.get('locationCode') || searchParams.get('location') || '').trim()

  if (!locationCode) {
    return NextResponse.json({}, { headers })
  }

  try {
    const enc = encodeURIComponent(locationCode)
    const rows = (await supabaseSelectFilter(
      'stock_logs',
      `location=ilike.${enc}`,
      { limit: 10000 }
    )) as { item_code?: string; qty?: number }[] | null

    const m: Record<string, number> = {}
    for (const row of rows || []) {
      const code = row?.item_code
      if (!code) continue
      m[code] = (m[code] || 0) + Number(row.qty || 0)
    }

    return NextResponse.json(m, { headers })
  } catch (e) {
    console.error('getHqStockByLocation:', e)
    return NextResponse.json({}, { headers })
  }
}
