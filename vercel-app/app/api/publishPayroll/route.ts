import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole, isOfficeStore } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { resolveCanManageOfficePayrollAuth } from '@/lib/office-payroll-auth-server'
import {
  appendSaasTenantFilter,
  assertSaasTenantWritable,
  isMissingSaasTenantColumnError,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
  type SaasTenantScope,
} from '@/lib/saas-tenant-scope'

type PublishTarget = {
  store?: string
  name?: string
  employeeId?: number
}

function normalizeStoreKey(s: unknown): string {
  return String(s || '')
    .trim()
    .toLowerCase()
}

async function findPayrollRowIds(
  monthStr: string,
  targets: PublishTarget[],
  tenantScope: SaasTenantScope
): Promise<number[]> {
  const ids = new Set<number>()
  const eidList = [
    ...new Set(
      targets
        .map((t) => Math.floor(Number(t.employeeId)))
        .filter((n) => Number.isFinite(n) && n > 0)
    ),
  ]

  if (eidList.length > 0) {
    const base = `month=eq.${encodeURIComponent(monthStr)}&employee_id=in.(${eidList.join(',')})`
    const filter = appendSaasTenantFilter(base, tenantScope, 'payroll_records')
    try {
      const rows = (await supabaseSelectFilter('payroll_records', filter, {
        select: 'id,store,employee_id',
        limit: Math.max(200, eidList.length * 4),
      })) as { id?: number; store?: string; employee_id?: number }[] | null
      const targetEidStore = new Set(
        targets
          .filter((t) => t.employeeId != null && Number(t.employeeId) > 0)
          .map((t) => `${normalizeStoreKey(t.store)}|${Math.floor(Number(t.employeeId))}`)
      )
      for (const r of rows || []) {
        const id = Number(r.id)
        if (!Number.isFinite(id) || id <= 0) continue
        const key = `${normalizeStoreKey(r.store)}|${Math.floor(Number(r.employee_id))}`
        // employee_id 만 맞으면 타 매장까지 공개되는 것 방지 — store|eid 일치만
        if (targetEidStore.has(key)) {
          ids.add(id)
        }
      }
    } catch (e) {
      if (isMissingSaasTenantColumnError(e)) {
        markSaasTenantColumnMissing('payroll_records')
      } else if (!/employee_id|42703|column/i.test(e instanceof Error ? e.message : String(e))) {
        throw e
      }
    }
  }

  for (const t of targets) {
    const store = String(t.store || '').trim()
    const name = String(t.name || '').trim()
    if (!store || !name) continue
    if (t.employeeId != null && Number(t.employeeId) > 0) continue
    const base = `month=eq.${encodeURIComponent(monthStr)}&name=eq.${encodeURIComponent(name)}`
    const filter = appendSaasTenantFilter(base, tenantScope, 'payroll_records')
    try {
      const rows = (await supabaseSelectFilter('payroll_records', filter, {
        select: 'id,store',
        limit: 30,
      })) as { id?: number; store?: string }[] | null
      for (const r of rows || []) {
        if (normalizeStoreKey(r.store) !== normalizeStoreKey(store)) continue
        const id = Number(r.id)
        if (Number.isFinite(id) && id > 0) ids.add(id)
      }
    } catch (e) {
      if (isMissingSaasTenantColumnError(e)) {
        markSaasTenantColumnMissing('payroll_records')
        const rows = (await supabaseSelectFilter('payroll_records', base, {
          select: 'id,store',
          limit: 30,
        })) as { id?: number; store?: string }[] | null
        for (const r of rows || []) {
          if (normalizeStoreKey(r.store) !== normalizeStoreKey(store)) continue
          const id = Number(r.id)
          if (Number.isFinite(id) && id > 0) ids.add(id)
        }
      } else {
        throw e
      }
    }
  }

  return [...ids]
}

/**
 * 급여 명세서 직원 앱 공개 (แจ้งประกาศ 시 published_at 설정)
 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const { auth } = authResult

  const tenantScope = await resolveSaasTenantScope({ auth })
  const tenantWriteErr = assertSaasTenantWritable(tenantScope, {
    tableHint: 'payroll_records',
    label: '급여 공개',
  })
  if (tenantWriteErr) {
    return NextResponse.json({ success: false, msg: tenantWriteErr }, { status: 403, headers })
  }

  try {
    const body = await request.json()
    const monthStr = String(body.month || body.monthStr || '').trim().slice(0, 7)
    const targets = (Array.isArray(body.targets) ? body.targets : []) as PublishTarget[]

    if (!/^\d{4}-\d{2}$/.test(monthStr)) {
      return NextResponse.json(
        { success: false, msg: '귀속월(yyyy-MM)을 선택해 주세요.' },
        { status: 400, headers }
      )
    }
    if (targets.length === 0) {
      return NextResponse.json(
        { success: false, msg: '공개할 직원을 선택해 주세요.' },
        { status: 400, headers }
      )
    }

    const userStore = (auth.store || '').trim()
    const userRole = (auth.role || '').toLowerCase()
    const allowedStores = (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(userStore)
    const isScopedRole =
      !isOfficeRole(userRole) &&
      !isAccountingRole(userRole) &&
      (userRole.includes('manager') || userRole.includes('franchisee'))

    let scopedTargets = targets
    if (isScopedRole) {
      scopedTargets = targets.filter((t) =>
        allowedStores.some((s) => storesMatchForGradeLookup(s, String(t.store || '')))
      )
    }

    const payrollAuth = await resolveCanManageOfficePayrollAuth(auth)
    const officePayrollAllowed = payrollAuth.canManageOfficePayroll === true
    const officeRows = scopedTargets.filter((t) => isOfficeStore(String(t.store || '')))
    if (officeRows.length > 0 && !officePayrollAllowed) {
      return NextResponse.json(
        { success: false, msg: '오피스(본사) 급여 공개 권한이 없습니다.' },
        { status: 403, headers }
      )
    }

    const ids = await findPayrollRowIds(monthStr, scopedTargets, tenantScope)
    if (ids.length === 0) {
      return NextResponse.json(
        { success: false, msg: '공개할 급여 기록을 찾지 못했습니다. 먼저 DB에 저장해 주세요.' },
        { status: 404, headers }
      )
    }

    const publishedAt = new Date().toISOString()
    let updated = 0
    try {
      for (const id of ids) {
        await supabaseUpdate('payroll_records', id, { published_at: publishedAt })
        updated++
      }
    } catch (e) {
      const em = e instanceof Error ? e.message : String(e)
      if (/published_at|42703|column/i.test(em)) {
        return NextResponse.json(
          {
            success: false,
            msg: 'published_at 컬럼이 없습니다. sql/payroll_records_published_at.sql 을 먼저 실행해 주세요.',
          },
          { status: 500, headers }
        )
      }
      throw e
    }

    return NextResponse.json(
      {
        success: true,
        published: updated,
        publishedAt,
        msg: `${updated}건의 급여 명세서가 직원 앱에 공개되었습니다.`,
      },
      { headers }
    )
  } catch (e) {
    console.error('publishPayroll:', e)
    return NextResponse.json(
      { success: false, msg: '공개 실패: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
