import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

async function getLoginDataHandler() {
  const empList = await supabaseSelect('employees', { order: 'id.asc', select: 'store,name' }) as { store?: string; name?: string }[] | null
  const userMap: Record<string, string[]> = {}
  for (let i = 0; i < (empList || []).length; i++) {
    const store = String((empList as { store?: string }[])[i].store || '').trim()
    const name = String((empList as { name?: string }[])[i].name || '').trim()
    if (store && name) {
      if (!userMap[store]) userMap[store] = []
      userMap[store].push(name)
    }
  }
  const vendorRows = (await supabaseSelect('vendors', { order: 'id.asc', select: 'name,gps_name,type' })) as {
    name?: string
    gps_name?: string
    type?: string
  }[] | null
  const vendorList: string[] = []
  const vRows = vendorRows || []
  for (let v = 0; v < vRows.length; v++) {
    const row = vRows[v]
    const gpsName = String(row.gps_name || '').trim()
    const fullName = String(row.name || '').trim()
    const t = String(row.type || '').toLowerCase()
    const isSales = t === 'sales' || t === '매출' || t === '매출처' || t === 'both' || t === '둘 다'
    const n = (isSales && gpsName) ? gpsName : fullName
    if (n) vendorList.push(n)
  }
  return { users: userMap, vendors: vendorList }
}

export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  const url = (process.env.SUPABASE_URL || '').trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !key) {
    const msg = 'SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY 또는 SUPABASE_ANON_KEY가 없습니다. .env를 확인하고 개발 서버를 재시작하세요.'
    console.error('getLoginData:', msg)
    return NextResponse.json(
      { users: {}, vendors: [], error: msg },
      { status: 503, headers }
    )
  }

  try {
    const data = await getLoginDataHandler()
    return NextResponse.json(data, { headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('getLoginData:', e)
    return NextResponse.json(
      { users: {}, vendors: [], error: msg },
      { status: 503, headers }
    )
  }
}
