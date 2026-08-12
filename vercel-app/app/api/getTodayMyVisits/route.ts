import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import {
  addDayBangkok,
  attendanceBusinessDateStrBangkok,
} from '@/lib/attendance-utils'

const TZ = 'Asia/Bangkok'

function formatVisitTime(visitTime: string | null | undefined, createdAt?: string | null): string {
  const t = String(visitTime != null ? visitTime : '').trim()
  if (t.length >= 5) {
    if (t.indexOf('T') >= 0) {
      const iso = t.substring(t.indexOf('T') + 1)
      return iso.length >= 5 ? iso.substring(0, 5) : iso.substring(0, 8).replace(/[^0-9:]/g, '').substring(0, 5)
    }
    return t.substring(0, 5)
  }
  if (createdAt && typeof createdAt === 'string' && createdAt.indexOf('T') >= 0) {
    const timePart = createdAt.substring(createdAt.indexOf('T') + 1)
    return timePart.length >= 5 ? timePart.substring(0, 5) : timePart.substring(0, 8).replace(/[^0-9:]/g, '').substring(0, 5)
  }
  return ''
}

async function fetchTodayMyVisits(userName: string) {
  /** 관리자 당일 스냅샷·근태와 동일: 근무일 기준 (+ 짝 맞춤용 전날) */
  const businessToday = attendanceBusinessDateStrBangkok(Date.now())
  const yesterday = addDayBangkok(businessToday, -1)
  const list = (await supabaseSelectFilter(
    'store_visits',
    `visit_date=gte.${yesterday}&visit_date=lte.${businessToday}&name=eq.${encodeURIComponent(userName)}`,
    { order: 'visit_time.desc,created_at.desc', limit: 40 }
  )) as {
    visit_date?: string
    visit_time?: string
    store_name?: string
    visit_type?: string
    duration_min?: number | string
    created_at?: string
  }[]

  const calendarToday = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const result = (list || [])
    .filter((row) => {
      const vd = String(row.visit_date || '').slice(0, 10)
      // 근무일·달력 오늘에 찍힌 행만 (새벽 전날 근무일 포함)
      return vd === businessToday || vd === calendarToday || vd === yesterday
    })
    .slice(0, 20)
    .map((row) => ({
      time: formatVisitTime(row.visit_time, row.created_at) || String(row.visit_time || ''),
      store: row.store_name,
      type: row.visit_type,
      duration: Math.max(0, Math.floor(Number(row.duration_min ?? 0)) || 0),
    }))
  return result
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'any')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const { searchParams } = new URL(request.url)
  const userName = String(auth.name || searchParams.get('userName') || searchParams.get('name') || '').trim()

  if (!userName) {
    return NextResponse.json([], { headers })
  }

  try {
    return NextResponse.json(await fetchTodayMyVisits(userName), { headers })
  } catch (e) {
    console.error('getTodayMyVisits:', e)
    return NextResponse.json([], { headers })
  }
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const authResult = await requireAuth(request, 'any')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const data = (await request.json()) as { userName?: string; name?: string }
    const userName = String(auth.name || data?.userName || data?.name || '').trim()

    if (!userName) {
      return NextResponse.json([], { headers })
    }

    return NextResponse.json(await fetchTodayMyVisits(userName), { headers })
  } catch (e) {
    console.error('getTodayMyVisits:', e)
    return NextResponse.json([], { headers })
  }
}
