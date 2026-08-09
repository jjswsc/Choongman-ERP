import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { NOTICE_LIST_COLS } from '@/lib/postgrest-narrow-select'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import {
  listUnreadNoticesForEmployee,
  type EmpRow,
  type NoticeForAggregation,
} from '@/lib/notice-read-aggregation'
import { bangkokTodayYmd, bangkokYmdRangeToIsoBounds } from '@/lib/bangkok-date'

const NOTICE_READ_STATS_LIMIT = 1200
const IN_CHUNK = 60

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

function isStoreAllowedForAuth(
  store: string,
  auth: { store?: string; allowedStores?: string[] },
  isOffice: boolean
): boolean {
  if (isOffice) return true
  const u = String(auth.store || '').trim()
  const more = (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
    .map((s) => String(s || '').trim())
    .filter(Boolean)
  const cands = new Set([u, ...more])
  for (const a of cands) {
    if (storesMatchForGradeLookup(a, store)) return true
  }
  return false
}

/**
 * GET — 한 직원의 기간 내 미확인 공지 목록 (미확인자 탭 드릴다운)
 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authRes = await requireAuth(request, 'manager')
  if (authRes.errorResponse) {
    const er = authRes.errorResponse
    er.headers.set('Access-Control-Allow-Origin', '*')
    return er
  }
  const auth = authRes.auth

  const { searchParams } = new URL(request.url)
  const store = String(searchParams.get('store') || '').trim()
  const name = String(searchParams.get('name') || '').trim()
  const startStr = String(searchParams.get('startDate') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endDate') || searchParams.get('end') || '').trim()
  const searchTypeParam = (searchParams.get('searchType') || 'all').toLowerCase()
  const searchType: 'all' | 'notice' | 'order' =
    searchTypeParam === 'order' ? 'order' : searchTypeParam === 'notice' ? 'notice' : 'all'
  const minUnreadDays = Math.max(
    0,
    Math.min(90, Math.floor(Number(searchParams.get('minUnreadDays') || 0) || 0))
  )

  if (!store || !name || !startStr || !endStr) {
    return NextResponse.json(
      { success: false, message: 'store·name·시작일·종료일이 필요합니다.', items: [] },
      { status: 400, headers }
    )
  }

  const userRole = (auth.role || '').toLowerCase()
  const isOffice = isOfficeRole(userRole) || isAccountingRole(userRole)
  if (!isStoreAllowedForAuth(store, auth, isOffice)) {
    return NextResponse.json(
      { success: false, message: '해당 매장 조회 권한이 없습니다.', items: [] },
      { status: 403, headers }
    )
  }

  try {
    const { gteIso, lteIso } = bangkokYmdRangeToIsoBounds(startStr, endStr)
    const filter = `id=gte.0&created_at=gte.${gteIso}&created_at=lte.${lteIso}`

    const noticeRows = (await supabaseSelectFilter('notices', filter, {
      order: 'created_at.desc',
      limit: NOTICE_READ_STATS_LIMIT,
      select: NOTICE_LIST_COLS,
    })) as (NoticeForAggregation & {
      title?: string
      content?: string
      sender?: string
      created_at?: string
    })[]

    const truncated = (noticeRows || []).length >= NOTICE_READ_STATS_LIMIT

    const empListRaw = (await supabaseSelectFilter(
      'employees',
      `store=eq.${encodeURIComponent(store)}&name=eq.${encodeURIComponent(name)}`,
      { limit: 5, select: 'store,name,job,role,resign_date' }
    )) as { store?: string; name?: string; job?: string; role?: string; resign_date?: string }[]

    const empHit = (empListRaw || []).find(
      (e) => String(e.store || '').trim() === store && String(e.name || '').trim() === name
    )
    const employee: EmpRow = {
      store,
      name,
      job: String(empHit?.job || empHit?.role || '').trim() || '—',
      role: String(empHit?.role || '').trim(),
      resignDate: String(empHit?.resign_date || '').trim(),
    }

    const noticeIds = (noticeRows || []).map((n) => n.id)
    const readRows: { notice_id: number; store?: string; name?: string; status?: string }[] = []
    for (const part of chunk(noticeIds, IN_CHUNK)) {
      if (part.length === 0) continue
      const rows = (await supabaseSelectFilter(
        'notice_reads',
        `notice_id=in.(${part.join(',')})&store=eq.${encodeURIComponent(store)}&name=eq.${encodeURIComponent(name)}`,
        { limit: 50000, select: 'notice_id,store,name,status' }
      )) as { notice_id: number; store?: string; name?: string; status?: string }[]
      readRows.push(...(rows || []))
    }

    const items = listUnreadNoticesForEmployee(noticeRows || [], employee, readRows, {
      searchType,
      minUnreadDays,
      asOfYmd: bangkokTodayYmd(),
    })

    return NextResponse.json({ success: true, items, truncated }, { headers })
  } catch (e) {
    console.error('getNoticeUnreadForEmployee:', e)
    return NextResponse.json(
      {
        success: false,
        message: '조회 실패: ' + (e instanceof Error ? e.message : String(e)),
        items: [],
        truncated: false,
      },
      { status: 500, headers }
    )
  }
}
