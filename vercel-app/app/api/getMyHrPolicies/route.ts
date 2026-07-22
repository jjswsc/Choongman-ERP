import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { HR_POLICY_LIST_COLS } from '@/lib/postgrest-narrow-select'
import { isHrPolicyReadCurrent } from '@/lib/hr-policy-read-status'
import { isNoticeReadStatus } from '@/lib/notice-read-status'
import { employeeIsTargetedForRow, findEmployeeContextFromRoster } from '@/lib/broadcast-notice-target'
import { parseListPagination, slicePage, DEFAULT_LIST_PAGE_SIZE } from '@/lib/pagination-params'
import { tryVerifyBearerFromRequest } from '@/lib/verify-auth'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
  type SaasTenantScope,
} from '@/lib/saas-tenant-scope'

export const dynamic = 'force-dynamic'

export type HrPolicyListItem = {
  id: number
  date: string
  title: string
  content: string
  status: string
  needsReconfirm: boolean
  attachments: unknown[]
  contentVersion: number
  effectiveAt: string
}

const DB_FETCH_LIMIT = 200

async function getMyHrPoliciesHandler(
  store: string,
  name: string,
  opts: { page: number; pageSize: number; status: 'all' | 'unread' | 'read' },
  tenantScope: SaasTenantScope
) {
  if (isSaasTenantQueryBlocked(tenantScope, 'hr_policies')) {
    return empty(opts.page, opts.pageSize)
  }

  const { myJob, myRole } = findEmployeeContextFromRoster(
    ((await supabaseSelect('employees', { order: 'id.asc', select: 'store,name,job,role' })) || []) as {
      store?: string
      name?: string
      job?: string
      role?: string
    }[],
    store,
    name
  )

  const readData = new Map<
    number,
    { status: string; v: number }
  >()
  try {
    const readsBase = `store=eq.${encodeURIComponent(store)}&name=eq.${encodeURIComponent(name)}`
    const readsFilter = appendSaasTenantFilter(readsBase, tenantScope, 'hr_policy_reads')
    type ReadDbRow = { policy_id: number; status?: string; acknowledged_version?: number }
    let sub: ReadDbRow[] | null = null
    try {
      sub = (await supabaseSelectFilter('hr_policy_reads', readsFilter, {
        select: 'policy_id,status,acknowledged_version',
        limit: 2000,
      })) as ReadDbRow[] | null
    } catch (e) {
      if (isMissingSaasTenantColumnError(e)) {
        markSaasTenantColumnMissing('hr_policy_reads')
        sub = (await supabaseSelectFilter('hr_policy_reads', readsBase, {
          select: 'policy_id,status,acknowledged_version',
          limit: 2000,
        })) as ReadDbRow[] | null
      } else {
        throw e
      }
    }
    for (const r of sub || []) {
      readData.set(r.policy_id, {
        status: r.status || '확인',
        v: Math.max(0, Math.floor(Number(r.acknowledged_version ?? 0)) || 0),
      })
    }
  } catch {
    /* ignore */
  }

  const built: HrPolicyListItem[] = []
  const policiesBase = 'is_active=eq.true'
  const policiesFilter = appendSaasTenantFilter(policiesBase, tenantScope, 'hr_policies')
  let rows: {
    id: number
    title?: string
    content?: string
    target_store?: string
    target_role?: string
    target_permission_group?: string | null
    target_recipients?: string | null
    content_version?: number
    created_at?: string
    effective_at?: string
    attachments?: string
  }[] | null = null
  try {
    rows = (await supabaseSelectFilter('hr_policies', policiesFilter, {
      order: 'created_at.desc',
      limit: DB_FETCH_LIMIT,
      select: HR_POLICY_LIST_COLS,
    })) as typeof rows
  } catch (e) {
    if (isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing('hr_policies')
      rows = (await supabaseSelectFilter('hr_policies', policiesBase, {
        order: 'created_at.desc',
        limit: DB_FETCH_LIMIT,
        select: HR_POLICY_LIST_COLS,
      })) as typeof rows
    } else {
      throw e
    }
  }

  for (let i = 0; i < (rows || []).length; i++) {
    const row = rows![i]
    if (!employeeIsTargetedForRow(store, name, myJob, myRole, row)) continue
    const cv = Math.max(1, Math.floor(Number(row.content_version ?? 1)) || 1)
    const rd = readData.get(row.id)
    const ackV = rd?.v ?? 0
    const st0 = rd?.status || 'New'
    const current = isHrPolicyReadCurrent(String(st0), ackV, cv)
    const needsReconfirm = isNoticeReadStatus(String(st0)) && !current
    const displayStatus: string = current && isNoticeReadStatus(String(st0)) ? String(st0) : current ? '확인' : 'New'

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
    const eff = row.effective_at
      ? typeof row.effective_at === 'string'
        ? row.effective_at.slice(0, 10)
        : new Date(String(row.effective_at)).toISOString().slice(0, 10)
      : ''
    built.push({
      id: row.id,
      date: dateStr,
      title: row.title || '',
      content: row.content || '',
      status: needsReconfirm ? 'New' : displayStatus,
      needsReconfirm: Boolean(needsReconfirm),
      attachments: att,
      contentVersion: cv,
      effectiveAt: eff,
    })
  }

  let filtered = built
  if (opts.status === 'unread') filtered = built.filter((n) => !isNoticeReadStatus(n.status))
  else if (opts.status === 'read') filtered = built.filter((n) => isNoticeReadStatus(n.status))

  filtered = [...filtered].sort((a, b) => {
    const aU = !isNoticeReadStatus(a.status)
    const bU = !isNoticeReadStatus(b.status)
    if (aU && !bU) return -1
    if (!aU && bU) return 1
    return (b.date || '').localeCompare(a.date || '')
  })

  const total = filtered.length
  const truncated = (rows || []).length >= DB_FETCH_LIMIT
  const items = slicePage(filtered, opts.page, opts.pageSize)

  return { items, total, page: opts.page, pageSize: opts.pageSize, truncated }
}

function parseQuery(
  sp: URLSearchParams,
  body: Record<string, unknown> | null
): { page: number; pageSize: number; status: 'all' | 'unread' | 'read' } {
  const { page, pageSize } = parseListPagination(sp, body, 15)
  const fromBody = (k: string): string | undefined => {
    if (!body) return undefined
    const v = (body as Record<string, unknown>)[k]
    if (v == null) return undefined
    return String(v).trim()
  }
  const statusRaw = (sp.get('status') ?? fromBody('status') ?? 'all').toLowerCase()
  const status: 'all' | 'unread' | 'read' =
    statusRaw === 'unread' ? 'unread' : statusRaw === 'read' ? 'read' : 'all'
  return { page, pageSize, status }
}

function empty(page: number, pageSize: number) {
  return { items: [] as HrPolicyListItem[], total: 0, page, pageSize, truncated: false }
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')
  const { searchParams } = new URL(request.url)
  const store = String(searchParams.get('store') || '').trim()
  const name = String(searchParams.get('name') || '').trim()
  const q = parseQuery(searchParams, null)
  if (!store || !name) {
    return NextResponse.json(empty(1, DEFAULT_LIST_PAGE_SIZE), { headers })
  }
  try {
    const auth = await tryVerifyBearerFromRequest(request)
    const tenantScope = await resolveSaasTenantScope({
      auth: auth ? { tenantId: auth.tenantId, company: auth.company } : null,
      storeCode: store,
    })
    const r = await getMyHrPoliciesHandler(store, name, q, tenantScope)
    return NextResponse.json(r, { headers })
  } catch (e) {
    console.error('getMyHrPolicies:', e)
    return NextResponse.json(empty(q.page, q.pageSize), { headers })
  }
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')
  try {
    const body = (await request.json()) as Record<string, unknown>
    const store = String(body?.store || '').trim()
    const name = String(body?.name || '').trim()
    const q = parseQuery(new URL(request.url).searchParams, body)
    if (!store || !name) {
      return NextResponse.json(empty(1, DEFAULT_LIST_PAGE_SIZE), { headers })
    }
    const auth = await tryVerifyBearerFromRequest(request)
    const tenantScope = await resolveSaasTenantScope({
      auth: auth ? { tenantId: auth.tenantId, company: auth.company } : null,
      storeCode: store,
    })
    const r = await getMyHrPoliciesHandler(store, name, q, tenantScope)
    return NextResponse.json(r, { headers })
  } catch (e) {
    console.error('getMyHrPolicies:', e)
    return NextResponse.json(empty(1, DEFAULT_LIST_PAGE_SIZE), { headers })
  }
}
