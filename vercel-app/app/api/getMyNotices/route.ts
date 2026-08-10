import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { NOTICE_LIST_COLS, NOTICE_LIST_COLS_LEGACY } from '@/lib/postgrest-narrow-select'
import { parseListPagination, slicePage, DEFAULT_LIST_PAGE_SIZE } from '@/lib/pagination-params'
import { isNoticeReadStatus } from '@/lib/notice-read-status'
import { employeeIsTargetedForRow, findEmployeeContextFromRoster } from '@/lib/broadcast-notice-target'
import { tryVerifyBearerFromRequest } from '@/lib/verify-auth'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
  type SaasTenantScope,
} from '@/lib/saas-tenant-scope'
import { translateTextsRuntime } from '@/lib/translate-runtime'

export interface NoticeItem {
  id: number
  date: string
  title: string
  content: string
  sender: string
  status: string
  attachments: unknown[]
  isUrgent?: boolean
  expiresAt?: string
  scheduledAt?: string
}

const DB_FETCH_LIMIT = 100

export interface MyNoticesPageResult {
  items: NoticeItem[]
  total: number
  page: number
  pageSize: number
  truncated: boolean
}

type ListMode = 'default' | 'unread_or_in_range'

async function getMyNoticesHandler(
  store: string,
  name: string,
  opts: {
    page: number
    pageSize: number
    status: 'all' | 'unread' | 'read'
    dateFrom?: string
    dateTo?: string
    listMode: ListMode
    rangeStart?: string
    rangeEnd?: string
    /** UI 언어 — 있으면 제목/본문을 서버에서 번역 */
    lang?: string
  },
  tenantScope: SaasTenantScope
): Promise<MyNoticesPageResult> {
  if (isSaasTenantQueryBlocked(tenantScope, 'notices')) {
    return emptyResult(opts.page, opts.pageSize)
  }

  let empList: { store?: string; name?: string; job?: string; role?: string }[] = []
  try {
    const empFilter = appendSaasTenantFilter('id=gt.0', tenantScope, 'employees')
    empList = ((await supabaseSelectFilter('employees', empFilter, {
      order: 'id.asc',
      select: 'store,name,job,role',
    })) || []) as typeof empList
  } catch (e) {
    if (isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing('employees')
      empList = ((await supabaseSelect('employees', { order: 'id.asc', select: 'store,name,job,role' })) ||
        []) as typeof empList
    } else {
      throw e
    }
  }
  const { myJob, myRole } = findEmployeeContextFromRoster(empList || [], store, name)

  const readMap: Record<number, string> = {}
  try {
    const readsBase = `store=eq.${encodeURIComponent(store)}&name=eq.${encodeURIComponent(name)}`
    const readsFilter = appendSaasTenantFilter(readsBase, tenantScope, 'notice_reads')
    let readRows: { notice_id: number; status?: string }[] | null = null
    try {
      readRows = (await supabaseSelectFilter('notice_reads', readsFilter, {
        select: 'notice_id,status',
        limit: 5000,
      })) as typeof readRows
    } catch (e) {
      if (isMissingSaasTenantColumnError(e)) {
        markSaasTenantColumnMissing('notice_reads')
        readRows = (await supabaseSelectFilter('notice_reads', readsBase, {
          select: 'notice_id,status',
          limit: 5000,
        })) as typeof readRows
      } else {
        throw e
      }
    }
    for (let i = 0; i < (readRows || []).length; i++) {
      readMap[readRows![i].notice_id] = readRows![i].status || '확인'
    }
  } catch {
    /* ignore */
  }

  const built: NoticeItem[] = []
  let rows: {
    id: number
    title?: string
    content?: string
    sender?: string
    target_store?: string
    target_role?: string
    target_permission_group?: string | null
    target_recipients?: string | null
    created_at?: string
    attachments?: string
    is_urgent?: boolean
    expires_at?: string | null
    scheduled_at?: string | null
  }[] | null

  const noticesBase = 'id=gte.0'
  const noticesFilter = appendSaasTenantFilter(noticesBase, tenantScope, 'notices')
  try {
    rows = (await supabaseSelectFilter('notices', noticesFilter, {
      order: 'created_at.desc',
      limit: DB_FETCH_LIMIT,
      select: NOTICE_LIST_COLS,
    })) as typeof rows
  } catch (e) {
    if (isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing('notices')
      rows = (await supabaseSelectFilter('notices', noticesBase, {
        order: 'created_at.desc',
        limit: DB_FETCH_LIMIT,
        select: NOTICE_LIST_COLS,
      })) as typeof rows
    } else {
      const msg = e instanceof Error ? e.message : String(e)
      if (/is_urgent|expires_at|scheduled_at|column/i.test(msg)) {
        try {
          rows = (await supabaseSelectFilter('notices', noticesFilter, {
            order: 'created_at.desc',
            limit: DB_FETCH_LIMIT,
            select: NOTICE_LIST_COLS_LEGACY,
          })) as typeof rows
        } catch (e2) {
          if (isMissingSaasTenantColumnError(e2)) {
            markSaasTenantColumnMissing('notices')
            rows = (await supabaseSelectFilter('notices', noticesBase, {
              order: 'created_at.desc',
              limit: DB_FETCH_LIMIT,
              select: NOTICE_LIST_COLS_LEGACY,
            })) as typeof rows
          } else {
            throw e2
          }
        }
      } else {
        throw e
      }
    }
  }

  const nowMs = Date.now()

  for (let i = 0; i < (rows || []).length; i++) {
    const row = rows![i]
    if (!employeeIsTargetedForRow(store, name, myJob, myRole, row)) continue

    if (row.expires_at) {
      const ex = new Date(row.expires_at).getTime()
      if (!isNaN(ex) && ex < nowMs) continue
    }
    if (row.scheduled_at) {
      const sch = new Date(row.scheduled_at).getTime()
      if (!isNaN(sch) && sch > nowMs) continue
    }

    let att: unknown[] = []
    if (row.attachments) {
      try {
        att = JSON.parse(row.attachments) as unknown[]
      } catch {
        /* ignore */
      }
    }
    const created = row.created_at
      ? typeof row.created_at === 'string'
        ? row.created_at
        : new Date(row.created_at).toISOString()
      : ''
    const dateStr = created ? created.slice(0, 10) : ''
    built.push({
      id: row.id,
      date: dateStr,
      title: row.title || '',
      content: row.content || '',
      sender: row.sender || '',
      status: readMap[row.id] || 'New',
      attachments: att,
      isUrgent: Boolean(row.is_urgent),
      expiresAt: row.expires_at ? String(row.expires_at) : undefined,
      scheduledAt: row.scheduled_at ? String(row.scheduled_at) : undefined,
    })
  }

  const df = (opts.dateFrom || '').trim().slice(0, 10)
  const dt = (opts.dateTo || '').trim().slice(0, 10)
  const rs = (opts.rangeStart || '').trim().slice(0, 10)
  const re = (opts.rangeEnd || '').trim().slice(0, 10)

  let filtered = built
  if (opts.listMode === 'unread_or_in_range') {
    filtered = built.filter((n) => {
      const d = (n.date || '').slice(0, 10)
      const unread = !isNoticeReadStatus(n.status)
      const inRange = rs && re ? d >= rs && d <= re : true
      return unread || inRange
    })
  } else {
    if (df) filtered = filtered.filter((n) => (n.date || '').slice(0, 10) >= df)
    if (dt) filtered = filtered.filter((n) => (n.date || '').slice(0, 10) <= dt)
    if (opts.status === 'unread') filtered = filtered.filter((n) => !isNoticeReadStatus(n.status))
    else if (opts.status === 'read') filtered = filtered.filter((n) => isNoticeReadStatus(n.status))
  }

  filtered = [...filtered].sort((a, b) => {
    const aUrgent = Boolean(a.isUrgent)
    const bUrgent = Boolean(b.isUrgent)
    if (aUrgent && !bUrgent) return -1
    if (!aUrgent && bUrgent) return 1
    const aUnread = !isNoticeReadStatus(a.status)
    const bUnread = !isNoticeReadStatus(b.status)
    if (aUnread && !bUnread) return -1
    if (!aUnread && bUnread) return 1
    return (b.date || '').localeCompare(a.date || '')
  })

  const total = filtered.length
  const truncated = (rows || []).length >= DB_FETCH_LIMIT
  let items = slicePage(filtered, opts.page, opts.pageSize)

  const lang = String(opts.lang || '').trim()
  if (lang && items.length > 0) {
    try {
      const titles = items.map((n) => n.title || '')
      const contents = items.map((n) => n.content || '')
      const [trTitles, trContents] = await Promise.all([
        translateTextsRuntime(titles, lang),
        translateTextsRuntime(contents, lang),
      ])
      items = items.map((n, i) => ({
        ...n,
        title: trTitles[i] || n.title,
        content: trContents[i] || n.content,
      }))
    } catch (e) {
      console.warn('getMyNotices translate:', e)
    }
  }

  return {
    items,
    total,
    page: opts.page,
    pageSize: opts.pageSize,
    truncated,
  }
}

function parseMyNoticesQuery(
  searchParams: URLSearchParams,
  body?: Record<string, unknown> | null
): {
  page: number
  pageSize: number
  status: 'all' | 'unread' | 'read'
  dateFrom?: string
  dateTo?: string
  listMode: ListMode
  rangeStart?: string
  rangeEnd?: string
  lang?: string
} {
  const { page, pageSize } = parseListPagination(searchParams, body, 15)
  const fromBody = (k: string): string | undefined => {
    if (!body || typeof body !== 'object') return undefined
    const v = (body as Record<string, unknown>)[k]
    if (v == null) return undefined
    return String(v).trim()
  }
  const statusRaw = (searchParams.get('status') ?? fromBody('status') ?? 'all').toLowerCase()
  const status: 'all' | 'unread' | 'read' =
    statusRaw === 'unread' ? 'unread' : statusRaw === 'read' ? 'read' : 'all'
  const dateFrom = (searchParams.get('dateFrom') ?? searchParams.get('startDate') ?? fromBody('dateFrom') ?? fromBody('startDate') ?? '').trim()
  const dateTo = (searchParams.get('dateTo') ?? searchParams.get('endDate') ?? fromBody('dateTo') ?? fromBody('endDate') ?? '').trim()
  const listModeRaw = (searchParams.get('listMode') ?? fromBody('listMode') ?? 'default').toLowerCase()
  const listMode: ListMode = listModeRaw === 'unread_or_in_range' ? 'unread_or_in_range' : 'default'
  const rangeStart = (searchParams.get('rangeStart') ?? fromBody('rangeStart') ?? '').trim()
  const rangeEnd = (searchParams.get('rangeEnd') ?? fromBody('rangeEnd') ?? '').trim()
  const lang = (searchParams.get('lang') ?? fromBody('lang') ?? '').trim().toLowerCase().slice(0, 2)
  return {
    page,
    pageSize,
    status,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    listMode,
    rangeStart: rangeStart || undefined,
    rangeEnd: rangeEnd || undefined,
    lang: lang || undefined,
  }
}

function emptyResult(page: number, pageSize: number): MyNoticesPageResult {
  return { items: [], total: 0, page, pageSize, truncated: false }
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  const { searchParams } = new URL(request.url)
  const store = String(searchParams.get('store') || '').trim()
  const name = String(searchParams.get('name') || '').trim()
  const q = parseMyNoticesQuery(searchParams, null)

  if (!store || !name) {
    return NextResponse.json(emptyResult(1, DEFAULT_LIST_PAGE_SIZE), { headers })
  }

  try {
    const auth = await tryVerifyBearerFromRequest(request)
    const tenantScope = await resolveSaasTenantScope({
      auth: auth ? { tenantId: auth.tenantId, company: auth.company } : null,
      storeCode: store,
    })
    const result = await getMyNoticesHandler(store, name, q, tenantScope)
    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('getMyNotices:', e)
    return NextResponse.json(emptyResult(q.page, q.pageSize), { headers })
  }
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  try {
    const body = (await request.json()) as Record<string, unknown>
    const store = String(body?.store || '').trim()
    const name = String(body?.name || '').trim()
    const q = parseMyNoticesQuery(new URL(request.url).searchParams, body)

    if (!store || !name) {
      return NextResponse.json(emptyResult(1, DEFAULT_LIST_PAGE_SIZE), { headers })
    }

    const auth = await tryVerifyBearerFromRequest(request)
    const tenantScope = await resolveSaasTenantScope({
      auth: auth ? { tenantId: auth.tenantId, company: auth.company } : null,
      storeCode: store,
    })
    const result = await getMyNoticesHandler(store, name, q, tenantScope)
    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('getMyNotices:', e)
    return NextResponse.json(emptyResult(1, DEFAULT_LIST_PAGE_SIZE), { headers })
  }
}
