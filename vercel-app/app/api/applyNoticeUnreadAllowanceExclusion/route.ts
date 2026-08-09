import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseDeleteByFilter,
  supabaseSelectFilter,
  supabaseUpsert,
} from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

type EmpRef = { store: string; name: string; missedCount?: number; noticeIds?: number[] }

function normalizeMonth(raw: string): string {
  const s = String(raw || '').trim()
  if (/^\d{4}-\d{2}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7)
  return ''
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

async function resolveEmployeeId(store: string, name: string): Promise<number | null> {
  try {
    const rows = (await supabaseSelectFilter(
      'employees',
      `store=eq.${encodeURIComponent(store)}&name=eq.${encodeURIComponent(name)}`,
      { limit: 1, select: 'id' }
    )) as { id?: number }[]
    const id = Number(rows?.[0]?.id)
    return id > 0 ? id : null
  } catch {
    return null
  }
}

/** GET — 급여월 제외 대상 목록 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authRes = await requireAuth(request, 'manager')
  if (authRes.errorResponse) {
    authRes.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authRes.errorResponse
  }
  const auth = authRes.auth
  const month = normalizeMonth(String(new URL(request.url).searchParams.get('payrollMonth') || ''))
  if (!month) {
    return NextResponse.json(
      { success: false, message: 'payrollMonth(YYYY-MM)가 필요합니다.', items: [] },
      { status: 400, headers }
    )
  }

  const userRole = (auth.role || '').toLowerCase()
  const isOffice = isOfficeRole(userRole) || isAccountingRole(userRole)

  try {
    const rows = (await supabaseSelectFilter(
      'payroll_allowance_exclusions',
      `payroll_month=eq.${encodeURIComponent(month)}`,
      {
        order: 'store.asc,name.asc',
        limit: 5000,
        select:
          'id,payroll_month,employee_id,store,name,reason,notice_ids,missed_count,period_start,period_end,created_by,created_at',
      }
    )) as Record<string, unknown>[]

    const items = (rows || []).filter((r) =>
      isStoreAllowedForAuth(String(r.store || ''), auth, isOffice)
    )

    return NextResponse.json({ success: true, items, payrollMonth: month }, { headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/does not exist|relation|PGRST/i.test(msg)) {
      return NextResponse.json(
        {
          success: false,
          message:
            'payroll_allowance_exclusions 테이블이 없습니다. sql/payroll_allowance_exclusions.sql 을 적용하세요.',
          items: [],
        },
        { status: 503, headers }
      )
    }
    console.error('applyNoticeUnreadAllowanceExclusion GET:', e)
    return NextResponse.json(
      { success: false, message: msg, items: [] },
      { status: 500, headers }
    )
  }
}

/**
 * POST — 공지 미확인 수당 제외 확정 (upsert)
 * DELETE action: body.action === 'remove' 이면 제외 해제
 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authRes = await requireAuth(request, 'manager')
  if (authRes.errorResponse) {
    authRes.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authRes.errorResponse
  }
  const auth = authRes.auth

  try {
    const body = (await request.json()) as {
      action?: string
      payrollMonth?: string
      periodStart?: string
      periodEnd?: string
      employees?: EmpRef[]
    }
    const month = normalizeMonth(String(body.payrollMonth || ''))
    const employees = Array.isArray(body.employees) ? body.employees : []
    if (!month) {
      return NextResponse.json(
        { success: false, message: 'payrollMonth(YYYY-MM)가 필요합니다.' },
        { status: 400, headers }
      )
    }
    if (employees.length === 0) {
      return NextResponse.json(
        { success: false, message: '대상 직원이 없습니다.' },
        { status: 400, headers }
      )
    }

    const userRole = (auth.role || '').toLowerCase()
    const isOffice = isOfficeRole(userRole) || isAccountingRole(userRole)
    const actor = String(auth.name || '').trim() || 'manager'

    const cleaned: EmpRef[] = []
    for (const e of employees) {
      const store = String(e?.store || '').trim()
      const name = String(e?.name || '').trim()
      if (!store || !name) continue
      if (!isStoreAllowedForAuth(store, auth, isOffice)) {
        return NextResponse.json(
          { success: false, message: `권한 없음: ${store}` },
          { status: 403, headers }
        )
      }
      cleaned.push({
        store,
        name,
        missedCount: Math.max(0, Math.floor(Number(e.missedCount) || 0)),
        noticeIds: Array.isArray(e.noticeIds)
          ? e.noticeIds.map((n) => Number(n)).filter((n) => n > 0)
          : [],
      })
    }
    if (cleaned.length === 0) {
      return NextResponse.json(
        { success: false, message: '유효한 대상이 없습니다.' },
        { status: 400, headers }
      )
    }

    if (body.action === 'remove') {
      let removed = 0
      for (const e of cleaned) {
        await supabaseDeleteByFilter(
          'payroll_allowance_exclusions',
          `payroll_month=eq.${encodeURIComponent(month)}&store=eq.${encodeURIComponent(e.store)}&name=eq.${encodeURIComponent(e.name)}`
        )
        removed += 1
      }
      return NextResponse.json(
        {
          success: true,
          action: 'remove',
          payrollMonth: month,
          count: removed,
          message: `${month} 수당 제외 ${removed}명 해제`,
        },
        { headers }
      )
    }

    const periodStart = String(body.periodStart || '').trim().slice(0, 10) || null
    const periodEnd = String(body.periodEnd || '').trim().slice(0, 10) || null
    const nowIso = new Date().toISOString()

    const rows: Record<string, unknown>[] = []
    for (const e of cleaned) {
      const employeeId = await resolveEmployeeId(e.store, e.name)
      rows.push({
        payroll_month: month,
        employee_id: employeeId,
        store: e.store,
        name: e.name,
        reason: 'notice_unread',
        notice_ids: e.noticeIds || [],
        missed_count: e.missedCount || (e.noticeIds?.length ?? 0),
        period_start: periodStart,
        period_end: periodEnd,
        created_by: actor,
        updated_at: nowIso,
      })
    }

    await supabaseUpsert('payroll_allowance_exclusions', rows, 'payroll_month,store,name')

    return NextResponse.json(
      {
        success: true,
        action: 'apply',
        payrollMonth: month,
        count: rows.length,
        message: `${month} 직책·위험·근면수당 제외 ${rows.length}명 확정 (급여 재계산 시 반영)`,
      },
      { headers }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/does not exist|relation|PGRST/i.test(msg)) {
      return NextResponse.json(
        {
          success: false,
          message:
            'payroll_allowance_exclusions 테이블이 없습니다. sql/payroll_allowance_exclusions.sql 을 적용하세요.',
        },
        { status: 503, headers }
      )
    }
    console.error('applyNoticeUnreadAllowanceExclusion POST:', e)
    return NextResponse.json({ success: false, message: msg }, { status: 500, headers })
  }
}
