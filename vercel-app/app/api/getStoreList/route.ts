import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** 매장·직원 목록 경량 조회 (store,name만) - getLoginData보다 가벼움 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  try {
    const empList = await supabaseSelect('employees', {
      order: 'id.asc',
      select: 'store,name',
    }) as { store?: string; name?: string }[] | null

    const userMap: Record<string, string[]> = {}
    for (const r of empList || []) {
      const store = String(r.store || '').trim()
      const name = String(r.name || '').trim()
      if (store && name) {
        if (!userMap[store]) userMap[store] = []
        userMap[store].push(name)
      }
    }
    const stores = Object.keys(userMap).filter(Boolean).sort()
    return NextResponse.json({ stores, users: userMap }, { headers })
  } catch (e) {
    console.error('getStoreList:', e)
    return NextResponse.json({ stores: [], users: {} }, { headers })
  }
}
