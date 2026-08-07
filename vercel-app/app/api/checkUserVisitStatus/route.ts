import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { addDayBangkok } from '@/lib/attendance-utils'
import {
  latestOpenVisit,
  pairVisitEventsForPerson,
  type StoreVisitEventRow,
} from '@/lib/store-visit-pairing'

const TZ = 'Asia/Bangkok'

function getBangkokHour(): number {
  const str = new Date().toLocaleTimeString('en-US', { timeZone: TZ, hour: '2-digit', hour12: false })
  return parseInt(str, 10) || 0
}

async function fetchVisitList(userName: string, dateStr: string): Promise<StoreVisitEventRow[]> {
  const rows = (await supabaseSelectFilter(
    'store_visits',
    `visit_date=eq.${dateStr}&name=eq.${encodeURIComponent(userName)}`,
    { order: 'visit_time.asc,created_at.asc', limit: 200 }
  )) as StoreVisitEventRow[]
  return rows || []
}

async function resolveActiveVisit(userName: string): Promise<{
  active: boolean
  storeName?: string
  purpose?: string
}> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  let list = await fetchVisitList(userName, today)
  // 자정 넘김(00:00~07:59 방콕): 전날 방문시작도 조회
  const bangkokHour = getBangkokHour()
  if (bangkokHour >= 0 && bangkokHour <= 7) {
    const yesterday = addDayBangkok(today, -1)
    const yesterdayList = await fetchVisitList(userName, yesterday)
    list = [...yesterdayList, ...list]
  }

  // last-event-wins 폐기: 짝짓기 후 미종료 open이 있으면 active
  const { open } = pairVisitEventsForPerson(list, { personExclusive: true })
  const latest = latestOpenVisit(open)
  if (!latest) return { active: false }
  return {
    active: true,
    storeName: latest.store,
    purpose: latest.purpose,
  }
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
    return NextResponse.json({ active: false }, { headers })
  }

  try {
    const status = await resolveActiveVisit(userName)
    return NextResponse.json(status, { headers })
  } catch (e) {
    console.error('checkUserVisitStatus:', e)
    return NextResponse.json({ active: false }, { headers })
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
      return NextResponse.json({ active: false }, { headers })
    }

    const status = await resolveActiveVisit(userName)
    return NextResponse.json(status, { headers })
  } catch (e) {
    console.error('checkUserVisitStatus:', e)
    return NextResponse.json({ active: false }, { headers })
  }
}
