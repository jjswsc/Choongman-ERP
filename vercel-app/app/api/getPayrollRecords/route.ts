import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { isOfficeStore } from '@/lib/permissions'
import { filterPayrollRowsHidingOffice } from '@/lib/office-payroll-access'
import { resolveCanManageOfficePayrollAuth } from '@/lib/office-payroll-auth-server'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
} from '@/lib/saas-tenant-scope'

export interface PayrollRecordRow {
  month: string
  store: string
  name: string
  employee_id?: number
  employee_code?: string
  dept: string
  role: string
  salary: number
  pos_allow: number
  haz_allow: number
  diligence_allow: number
  birth_bonus: number
  holiday_pay: number
  spl_bonus: number
  ot_15: number
  ot_20: number
  ot_30: number
  ot_amt: number
  late_min: number
  late_ded: number
  early_min?: number
  early_ded?: number
  sso: number
  tax: number
  other_ded: number
  net_pay: number
  status: string
  published_at?: string | null
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const { auth } = authResult

  const tenantScope = await resolveSaasTenantScope({ auth })
  if (isSaasTenantQueryBlocked(tenantScope, 'payroll_records')) {
    return NextResponse.json({ success: true, list: [] }, { headers })
  }

  const { searchParams } = new URL(request.url)
  const monthStr = String(searchParams.get('month') || searchParams.get('monthStr') || '').trim().slice(0, 7)
  let storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const userStore = (auth.store || '').trim()
  const userRole = (auth.role || '').toLowerCase()
  const payrollAuth = await resolveCanManageOfficePayrollAuth(auth)
  const officePayrollAllowed = payrollAuth.canManageOfficePayroll === true
  if (
    storeFilter &&
    storeFilter !== 'All' &&
    storeFilter !== '전체' &&
    isOfficeStore(storeFilter) &&
    !officePayrollAllowed
  ) {
    return NextResponse.json({ success: true, list: [] }, { headers })
  }
  if (userRole.includes('manager') && userStore) storeFilter = userStore

  if (!monthStr || monthStr.length < 7) {
    return NextResponse.json(
      { success: false, list: [], msg: '조회할 월(yyyy-MM)을 선택해주세요.' },
      { status: 400, headers }
    )
  }

  try {
    const isAll = !storeFilter || storeFilter === 'All' || storeFilter === '전체'
    /** Omni: All 이어도 tenant 필터로 회사 범위만 */
    if (tenantScope.enforce && isAll && !tenantScope.tenantId) {
      return NextResponse.json({ success: true, list: [] }, { headers })
    }
    const baseFilter = isAll
      ? `month=eq.${encodeURIComponent(monthStr)}`
      : `month=eq.${encodeURIComponent(monthStr)}&store=eq.${encodeURIComponent(storeFilter)}`
    const filter = appendSaasTenantFilter(baseFilter, tenantScope, 'payroll_records')

    let rows: Record<string, unknown>[] = []
    try {
      rows = ((await supabaseSelectFilter('payroll_records', filter, {
        order: 'store.asc,name.asc',
        limit: 10000,
      })) || []) as Record<string, unknown>[]
    } catch (e) {
      if (isMissingSaasTenantColumnError(e)) {
        markSaasTenantColumnMissing('payroll_records')
        rows = ((await supabaseSelectFilter('payroll_records', baseFilter, {
          order: 'store.asc,name.asc',
          limit: 10000,
        })) || []) as Record<string, unknown>[]
      } else {
        throw e
      }
    }

    const list = rows.map((r) => ({
      month: String(r.month || ''),
      store: String(r.store || ''),
      name: String(r.name || ''),
      employee_id:
        r.employee_id != null && Number.isFinite(Number(r.employee_id)) && Number(r.employee_id) > 0
          ? Math.floor(Number(r.employee_id))
          : undefined,
      employee_code: String(r.employee_code || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 5),
      dept: String(r.dept || ''),
      role: String(r.role || ''),
      salary: Number(r.salary) || 0,
      pos_allow: Number(r.pos_allow) || 0,
      haz_allow: Number(r.haz_allow) || 0,
      diligence_allow: Number(r.diligence_allow) || 0,
      birth_bonus: Number(r.birth_bonus) || 0,
      holiday_pay: Number(r.holiday_pay) ?? 0,
      spl_bonus: Number(r.spl_bonus) || 0,
      ot_15: Number(r.ot_15) || 0,
      ot_20: Number(r.ot_20) || 0,
      ot_30: Number(r.ot_30) || 0,
      ot_amt: Number(r.ot_amt) || 0,
      late_min: Number(r.late_min) || 0,
      late_ded: Number(r.late_ded) || 0,
      early_min: Number(r.early_min) ?? 0,
      early_ded: Number(r.early_ded) ?? 0,
      sso: Number(r.sso) || 0,
      tax: Number(r.tax) || 0,
      other_ded: Number(r.other_ded) || 0,
      net_pay: Number(r.net_pay) || 0,
      status: String(r.status || ''),
      published_at:
        r.published_at != null && String(r.published_at).trim() !== ''
          ? String(r.published_at)
          : null,
    }))

    const filtered = filterPayrollRowsHidingOffice(list, payrollAuth)

    return NextResponse.json({ success: true, list: filtered }, { headers })
  } catch (e) {
    console.error('getPayrollRecords:', e)
    return NextResponse.json(
      { success: false, list: [], msg: '급여 내역 조회 중 오류가 발생했습니다.' },
      { status: 500, headers }
    )
  }
}
