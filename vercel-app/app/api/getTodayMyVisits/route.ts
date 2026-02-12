import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

const TZ = 'Asia/Bangkok'

function formatVisitTime(visitTime: string | null | undefined): string {
  let t = String(visitTime != null ? visitTime : '').trim()
  if (t.length >= 5) {
    if (t.indexOf('T') >= 0) {
      const iso = t.substring(t.indexOf('T') + 1)
      return iso.length >= 5 ? iso.substring(0, 5) : iso.substring(0, 8)
    }
    return t.length >= 8 ? t.substring(0, 5) : t.substring(0, 5)
  }
  return ''
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const userName = String(searchParams.get('userName') || searchParams.get('name') || '').trim()

  if (!userName) {
    return NextResponse.json([], { headers })
  }

  try {
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
    const list = (await supabaseSelectFilter(
      'store_visits',
      `visit_date=eq.${todayStr}&name=eq.${encodeURIComponent(userName)}`,
      { order: 'visit_time.desc', limit: 20 }
    )) as { visit_time?: string; store_name?: string; visit_type?: string; duration_min?: number }[]

    const result = (list || []).map((row) => ({
      time: formatVisitTime(row.visit_time) || String(row.visit_time || ''),
      store: row.store_name,
      type: row.visit_type,
      duration: row.duration_min ?? 0,
    }))
    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('getTodayMyVisits:', e)
    return NextResponse.json([], { headers })
  }
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const data = (await request.json()) as { userName?: string }
    const userName = String(data?.userName || data?.name || '').trim()

    if (!userName) {
      return NextResponse.json([], { headers })
    }

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
    const list = (await supabaseSelectFilter(
      'store_visits',
      `visit_date=eq.${todayStr}&name=eq.${encodeURIComponent(userName)}`,
      { order: 'visit_time.desc', limit: 20 }
    )) as { visit_time?: string; store_name?: string; visit_type?: string; duration_min?: number }[]

    const result = (list || []).map((row) => ({
      time: formatVisitTime(row.visit_time) || String(row.visit_time || ''),
      store: row.store_name,
      type: row.visit_type,
      duration: row.duration_min ?? 0,
    }))
    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('getTodayMyVisits:', e)
    return NextResponse.json([], { headers })
  }
}
