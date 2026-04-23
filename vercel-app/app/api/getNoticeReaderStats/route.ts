import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { NOTICE_LIST_COLS } from '@/lib/postgrest-narrow-select'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import {
  aggregateNoticeReadStats,
  type EmpRow,
  type NoticeForAggregation,
} from '@/lib/notice-read-aggregation'

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
 * GET 기간·유형(공지/전체)별 — 직원이 수신 대상이었던 공지 수 대비 수신 확인 수·미확인(모바일 수신 확인 기준)
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
  const startStr = String(searchParams.get('startDate') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endDate') || searchParams.get('end') || '').trim()
  const storeFilter = String(searchParams.get('store') || '전체').trim() || '전체'
  const minMissed = Math.max(1, Math.floor(Number(searchParams.get('minMissed') || 1) || 1))
  const searchTypeParam = (searchParams.get('searchType') || 'all').toLowerCase()
  const searchType: 'all' | 'notice' | 'order' =
    searchTypeParam === 'order' ? 'order' : searchTypeParam === 'notice' ? 'notice' : 'all'

  if (!startStr || !endStr) {
    return NextResponse.json(
      { success: false, message: '시작일·종료일이 필요합니다.', items: [] },
      { status: 400, headers }
    )
  }

  const userRole = (auth.role || '').toLowerCase()
  const isOffice = isOfficeRole(userRole) || isAccountingRole(userRole)

  try {
    let filter = 'id=gte.0'
    filter += `&created_at=gte.${startStr}`
    const endPlus = endStr + 'T23:59:59.999Z'
    filter += `&created_at=lte.${endPlus}`

    const noticeRows = (await supabaseSelectFilter('notices', filter, {
      order: 'created_at.desc',
      limit: NOTICE_READ_STATS_LIMIT,
      select: NOTICE_LIST_COLS,
    })) as (NoticeForAggregation & { title?: string; content?: string; created_at?: string })[]

    const truncated = (noticeRows || []).length >= NOTICE_READ_STATS_LIMIT
    const notices = (noticeRows || []) as NoticeForAggregation[]

    const empListRaw = (await supabaseSelect('employees', {
      order: 'id.asc',
      select: 'store,name,job,role,resign_date',
    })) as { store?: string; name?: string; job?: string; role?: string; resign_date?: string }[]

    const employees: EmpRow[] = (empListRaw || [])
      .map((e) => ({
        store: String(e.store || '').trim(),
        name: String(e.name || '').trim(),
        job: String(e.job || e.role || '').trim(),
        role: String(e.role || '').trim(),
        resignDate: String(e.resign_date || '').trim(),
      }))
      .filter((e) => e.name)

    const noticeIds = notices.map((n) => n.id)
    const readRows: { notice_id: number; store?: string; name?: string; status?: string }[] = []
    for (const part of chunk(noticeIds, IN_CHUNK)) {
      if (part.length === 0) continue
      const rows = (await supabaseSelectFilter(
        'notice_reads',
        `notice_id=in.(${part.join(',')})`,
        { limit: 50000, select: 'notice_id,store,name,status' }
      )) as { notice_id: number; store?: string; name?: string; status?: string }[]
      readRows.push(...(rows || []))
    }

    const agg = aggregateNoticeReadStats(notices, employees, readRows, { searchType })

    const items: {
      store: string
      name: string
      job: string
      targeted: number
      confirmed: number
      missed: number
      missRate: number
    }[] = []

    for (const a of agg.values()) {
      if (!isStoreAllowedForAuth(a.store, auth, isOffice)) continue
      if (storeFilter && storeFilter !== '전체' && storeFilter !== 'All') {
        if (a.store !== storeFilter && !storesMatchForGradeLookup(storeFilter, a.store)) continue
      }
      const missed = a.targeted - a.confirmed
      if (missed < minMissed) continue
      const missRate = a.targeted > 0 ? Math.round((1000 * missed) / a.targeted) / 10 : 0
      items.push({
        store: a.store,
        name: a.name,
        job: a.job,
        targeted: a.targeted,
        confirmed: a.confirmed,
        missed,
        missRate,
      })
    }

    items.sort((x, y) => {
      if (y.missed !== x.missed) return y.missed - x.missed
      if (y.missRate !== x.missRate) return y.missRate - x.missRate
      if (x.store !== y.store) return x.store.localeCompare(y.store)
      return x.name.localeCompare(y.name)
    })

    return NextResponse.json(
      { success: true, items, truncated, noticeInRange: noticeIds.length },
      { headers }
    )
  } catch (e) {
    console.error('getNoticeReaderStats:', e)
    return NextResponse.json(
      {
        success: false,
        message: '집계 실패: ' + (e instanceof Error ? e.message : String(e)),
        items: [] as never[],
        truncated: false,
        noticeInRange: 0,
      },
      { status: 500, headers }
    )
  }
}
