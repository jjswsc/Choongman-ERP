/**
 * 직원 CSV → 추가·수정. 기존 직원은 지우지 않는다.
 * 화면에서 받은 CSV(Employee code, Store, Name, …)와 DB 컬럼명 CSV를 둘 다 받는다.
 * PIN은 CSV에 값이 있을 때만 바꾸고, 없으면 기존 PIN을 유지한다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsertMany, supabaseSelectFilter } from '@/lib/supabase-server'
import { supabaseSelectFilterStrippingUnknownColumns, supabaseUpdateByFilterWithPgrst204Fallback } from '@/lib/supabase-pgrst204-retry'
import { hashPassword, isHashed } from '@/lib/password'
import { requireAuth } from '@/lib/verify-auth'
import { resolveHrImportTenantScope, stampEmployeeRowsForTenant } from '@/lib/hr-tenant-import'
import { appendSaasTenantFilter } from '@/lib/saas-tenant-scope'
import { assertSaasStaffRegistrationAllowed } from '@/lib/saas/saas-staff-limit-server'
import {
  assertSaasManagerRegistrationAllowed,
  roleCountsAsManagerSeat,
} from '@/lib/saas/saas-manager-limit-server'
import { pickNextEmployeeCode } from '@/lib/employee-code'
import {
  parseEmployeeCsv,
  planEmployeeCsvMerge,
  type ExistingEmployeeForCsv,
} from '@/lib/employee-csv-import'

async function hashPinIfNeeded(raw: unknown): Promise<string> {
  const password = String(raw ?? '').trim()
  if (!password) return ''
  if (isHashed(password)) return password
  return hashPassword(password)
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const authResult = await requireAuth(request, 'office')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const { scope, error: tenantError } = await resolveHrImportTenantScope(authResult.auth)
    if (tenantError) {
      return NextResponse.json({ success: false, message: tenantError }, { status: 403, headers })
    }

    let csvText = ''
    const ct = request.headers.get('content-type') || ''
    if (ct.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('file') as File | null
      if (!file) {
        return NextResponse.json({ success: false, message: 'file 필드가 없습니다.' }, { headers })
      }
      csvText = await file.text()
    } else {
      const body = (await request.json()) as { csv?: string }
      csvText = String(body.csv || '')
    }
    if (!csvText.trim()) {
      return NextResponse.json({ success: false, message: 'CSV 내용이 비어 있습니다.' }, { headers })
    }

    const parsed = parseEmployeeCsv(csvText)
    if (parsed.error) {
      return NextResponse.json({ success: false, message: parsed.error }, { headers })
    }

    let existingRows: ExistingEmployeeForCsv[] = []
    try {
      const raw = (await supabaseSelectFilterStrippingUnknownColumns(
        'employees',
        appendSaasTenantFilter('id=gt.0', scope, 'employees'),
        {
          select: 'id,store,name,name_title,employee_code,role,deleted_at',
          limit: 5000,
          order: 'id.asc',
        },
        'importEmployeesFromCsv.existing'
      )) as {
        id?: number
        store?: string | null
        name?: string | null
        name_title?: string | null
        employee_code?: string | null
        role?: string | null
        deleted_at?: string | null
      }[]
      existingRows = (raw || []).map((r) => ({
        id: Number(r.id) || 0,
        store: String(r.store || '').trim(),
        name: String(r.name || '').trim(),
        nameTitle: String(r.name_title || '').trim(),
        employeeCode: String(r.employee_code || '').trim(),
        role: String(r.role || '').trim(),
        deleted: !!String(r.deleted_at || '').trim(),
      }))
    } catch (e) {
      const em = e instanceof Error ? e.message : String(e)
      if (!/42703|column/i.test(em)) throw e
      const raw = (await supabaseSelectFilter(
        'employees',
        appendSaasTenantFilter('id=gt.0', scope, 'employees'),
        { select: 'id,store,name,role', limit: 5000, order: 'id.asc' }
      )) as { id?: number; store?: string | null; name?: string | null; role?: string | null }[]
      existingRows = (raw || []).map((r) => ({
        id: Number(r.id) || 0,
        store: String(r.store || '').trim(),
        name: String(r.name || '').trim(),
        nameTitle: '',
        employeeCode: '',
        role: String(r.role || '').trim(),
        deleted: false,
      }))
    }

    const plan = planEmployeeCsvMerge(parsed.rows, existingRows)
    const byId = new Map(existingRows.map((e) => [e.id, e]))

    let addingManagers = 0
    for (const u of plan.updates) {
      const prev = byId.get(u.id)
      const nextRole = String(u.patch.role || prev?.role || '')
      if (roleCountsAsManagerSeat(nextRole) && !roleCountsAsManagerSeat(String(prev?.role || ''))) {
        addingManagers += 1
      }
    }
    for (const row of plan.inserts) {
      if (roleCountsAsManagerSeat(String(row.role || ''))) addingManagers += 1
    }

    if (scope.enforce) {
      const staffLimit = await assertSaasStaffRegistrationAllowed({
        tenantId: scope.tenantId,
        addingCount: plan.inserts.length,
      })
      if (!staffLimit.ok) {
        return NextResponse.json(
          { success: false, code: staffLimit.code, message: staffLimit.message },
          { status: 403, headers }
        )
      }
      const mgrLimit = await assertSaasManagerRegistrationAllowed({
        tenantId: scope.tenantId,
        addingManagerSeats: addingManagers,
      })
      if (!mgrLimit.ok) {
        return NextResponse.json(
          { success: false, code: mgrLimit.code, message: mgrLimit.message },
          { status: 403, headers }
        )
      }
    }

    const codePool: { store?: string | null; employee_code?: string | null }[] = existingRows.map((e) => ({
      store: e.store,
      employee_code: e.employeeCode,
    }))
    for (const u of plan.updates) {
      const code = String(u.patch.employee_code || '').trim()
      if (!code) continue
      const prev = byId.get(u.id)
      codePool.push({ store: String(u.patch.store || prev?.store || ''), employee_code: code })
    }
    for (const row of plan.inserts) {
      if (!String(row.employee_code || '').trim()) {
        row.employee_code = pickNextEmployeeCode(String(row.store || ''), codePool)
      }
      codePool.push({ store: String(row.store || ''), employee_code: String(row.employee_code || '') })
      if (row.password) row.password = await hashPinIfNeeded(row.password)
    }

    let updated = 0
    for (const u of plan.updates) {
      const patch = { ...u.patch }
      if (patch.password) patch.password = await hashPinIfNeeded(patch.password)
      else delete patch.password
      await supabaseUpdateByFilterWithPgrst204Fallback(
        'employees',
        appendSaasTenantFilter(`id=eq.${u.id}`, scope, 'employees'),
        patch,
        'importEmployeesFromCsv.update'
      )
      updated += 1
    }

    const stamped = stampEmployeeRowsForTenant(plan.inserts, scope)
    const chunkSize = 100
    for (let j = 0; j < stamped.length; j += chunkSize) {
      await supabaseInsertMany('employees', stamped.slice(j, j + chunkSize))
    }

    return NextResponse.json(
      {
        success: true,
        added: plan.inserts.length,
        updated,
        skippedCodes: plan.skippedCodes,
        skippedRows: plan.skippedRows,
        count: plan.inserts.length + updated,
      },
      { headers }
    )
  } catch (e) {
    console.error('importEmployeesFromCsv:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '가져오기 실패' },
      { headers }
    )
  }
}
