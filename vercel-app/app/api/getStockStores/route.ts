import { NextRequest, NextResponse } from 'next/server'
import { supabaseRpc, supabaseSelect } from '@/lib/supabase-server'
import { getVerifiedAuth } from '@/lib/verify-auth'

/** 재고 현황용 매장 목록 - stock_logs location만. 매니저는 자기 매장만 반환 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const auth = await getVerifiedAuth(request)
  const userRole = (auth?.role || '').toLowerCase()
  const isManager = userRole.includes('manager') || userRole.includes('franchisee')
  const userStore = (auth?.store || '').trim()

  if (isManager && userStore) {
    return NextResponse.json([userStore], { headers })
  }

  try {
    const rows = (await supabaseRpc<{ location: string }[]>('get_distinct_stock_locations', {})) as { location?: string }[] | null
    const list = (rows || [])
      .map((r) => String(r.location || '').trim())
      .filter(Boolean)
      .sort()
    return NextResponse.json(list, { headers })
  } catch (rpcErr) {
    // RPC 미배포 시 fallback: 기존 select 방식
    const logs = (await supabaseSelect('stock_logs', { limit: 50000, select: 'location' })) as { location?: string }[] | null
    const fromLogs = new Set<string>()
    for (const row of logs || []) {
      const loc = String(row.location || '').trim()
      if (loc) fromLogs.add(loc)
    }
    const list = Array.from(fromLogs).filter(Boolean).sort()
    return NextResponse.json(list, { headers })
  }
}
