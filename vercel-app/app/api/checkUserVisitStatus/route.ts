import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

const TZ = 'Asia/Bangkok'

function getBangkokHour(): number {
  const str = new Date().toLocaleTimeString('en-US', { timeZone: TZ, hour: '2-digit', hour12: false })
  return parseInt(str, 10) || 0
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

async function fetchVisitList(userName: string, dateStr: string): Promise<{ visit_type?: string; store_name?: string; purpose?: string; visit_date?: string; visit_time?: string }[]> {
  const rows = (await supabaseSelectFilter(
    'store_visits',
    `visit_date=eq.${dateStr}&name=eq.${encodeURIComponent(userName)}`,
    { order: 'visit_time.desc', limit: 50 }
  )) as { visit_type?: string; store_name?: string; purpose?: string; visit_date?: string; visit_time?: string }[]
  return rows || []
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const userName = String(searchParams.get('userName') || searchParams.get('name') || '').trim()

  if (!userName) {
    return NextResponse.json({ active: false }, { headers })
  }

  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
    let list = await fetchVisitList(userName, today)
    // 자정 넘김(00:00~06:59 방콕): 전날 방문시작도 조회 (밤에 시작한 방문 → 익일 새벽 종료)
    const bangkokHour = getBangkokHour()
    if (bangkokHour >= 0 && bangkokHour <= 6) {
      const yesterday = addDays(today, -1)
      const yesterdayList = await fetchVisitList(userName, yesterday)
      list = [...yesterdayList, ...list].sort((a, b) => {
        const dA = String(a.visit_date || '') + String(a.visit_time || '')
        const dB = String(b.visit_date || '') + String(b.visit_time || '')
        return dB.localeCompare(dA)
      })
    }

    for (const row of list) {
      if (row.visit_type === '방문시작' || row.visit_type === '강제 방문시작') {
        return NextResponse.json(
          { active: true, storeName: row.store_name, purpose: row.purpose },
          { headers }
        )
      }
      if (row.visit_type === '방문종료' || row.visit_type === '강제 방문종료') {
        return NextResponse.json({ active: false }, { headers })
      }
    }
    return NextResponse.json({ active: false }, { headers })
  } catch (e) {
    console.error('checkUserVisitStatus:', e)
    return NextResponse.json({ active: false }, { headers })
  }
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const data = (await request.json()) as { userName?: string; name?: string }
    const userName = String(data?.userName || data?.name || '').trim()

    if (!userName) {
      return NextResponse.json({ active: false }, { headers })
    }

    const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
    let list = await fetchVisitList(userName, today)
    const bangkokHour = getBangkokHour()
    if (bangkokHour >= 0 && bangkokHour <= 6) {
      const yesterday = addDays(today, -1)
      const yesterdayList = await fetchVisitList(userName, yesterday)
      list = [...yesterdayList, ...list].sort((a, b) => {
        const dA = String(a.visit_date || '') + String(a.visit_time || '')
        const dB = String(b.visit_date || '') + String(b.visit_time || '')
        return dB.localeCompare(dA)
      })
    }

    for (const row of list) {
      if (row.visit_type === '방문시작' || row.visit_type === '강제 방문시작') {
        return NextResponse.json(
          { active: true, storeName: row.store_name, purpose: row.purpose },
          { headers }
        )
      }
      if (row.visit_type === '방문종료' || row.visit_type === '강제 방문종료') {
        return NextResponse.json({ active: false }, { headers })
      }
    }
    return NextResponse.json({ active: false }, { headers })
  } catch (e) {
    console.error('checkUserVisitStatus:', e)
    return NextResponse.json({ active: false }, { headers })
  }
}
