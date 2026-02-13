import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** 재고 현황용 매장 목록 - stock_logs location만 (거래처 제외, 주문 승인처럼 매장만) */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const logs = (await supabaseSelect('stock_logs', { limit: 5000 })) as { location?: string }[] | null

    const fromLogs = new Set<string>()
    for (const row of logs || []) {
      const loc = String(row.location || '').trim()
      if (loc) fromLogs.add(loc)
    }
    const list = Array.from(fromLogs).filter(Boolean).sort()
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getStockStores:', e)
    return NextResponse.json([], { headers })
  }
}
