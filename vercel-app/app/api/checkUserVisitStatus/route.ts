import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

const TZ = 'Asia/Bangkok'

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
    const list = (await supabaseSelectFilter(
      'store_visits',
      `visit_date=eq.${today}&name=eq.${encodeURIComponent(userName)}`,
      { order: 'visit_time.desc', limit: 50 }
    )) as { visit_type?: string; store_name?: string; purpose?: string }[]

    for (const row of list || []) {
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
    const list = (await supabaseSelectFilter(
      'store_visits',
      `visit_date=eq.${today}&name=eq.${encodeURIComponent(userName)}`,
      { order: 'visit_time.desc', limit: 50 }
    )) as { visit_type?: string; store_name?: string; purpose?: string }[]

    for (const row of list || []) {
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
