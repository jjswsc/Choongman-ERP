import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** 재고 현황용 매장 목록 - stock_logs location + vendors name */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const logs = (await supabaseSelect('stock_logs', { limit: 5000 })) as { location?: string }[] | null
    const vendors = (await supabaseSelect('vendors', { limit: 500 })) as { name?: string; gps_name?: string }[] | null

    const fromLogs = new Set<string>()
    for (const row of logs || []) {
      const loc = String(row.location || '').trim()
      if (loc) fromLogs.add(loc)
    }
    for (const v of vendors || []) {
      const gps = String(v.gps_name || '').trim()
      const name = String(v.name || '').trim()
      if (gps) fromLogs.add(gps)
      else if (name) fromLogs.add(name)
    }
    const list = Array.from(fromLogs).filter(Boolean).sort()
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getStockStores:', e)
    return NextResponse.json([], { headers })
  }
}
