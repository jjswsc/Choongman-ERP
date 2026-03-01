import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** 매장·직원 목록 경량 조회 (store,name,nick) */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  try {
    const empList = await supabaseSelect('employees', {
      order: 'id.asc',
      select: 'store,name,nick,job,role,resign_date',
    }) as { store?: string; name?: string; nick?: string; job?: string; role?: string; resign_date?: string | null }[] | null

    const userMap: Record<string, string[]> = {}
    const staffByStore: Record<string, { name: string; nick: string; job?: string; role?: string }[]> = {}
    for (const r of empList || []) {
      const resignDate = String(r.resign_date ?? '').trim()
      if (resignDate) continue
      const store = String(r.store || '').trim()
      const name = String(r.name || '').trim()
      const nick = String(r.nick || r.name || '').trim() || name
      const job = String(r.job || r.role || '').trim() || undefined
      const role = String(r.role || '').trim().toLowerCase() || undefined
      if (store && name) {
        if (!userMap[store]) userMap[store] = []
        userMap[store].push(name)
        if (!staffByStore[store]) staffByStore[store] = []
        staffByStore[store].push({ name, nick, job, role })
      }
    }
    const stores = Object.keys(userMap).filter(Boolean).sort()
    return NextResponse.json({ stores, users: userMap, staffByStore }, { headers })
  } catch (e) {
    console.error('getStoreList:', e)
    return NextResponse.json({ stores: [], users: {} }, { headers })
  }
}
