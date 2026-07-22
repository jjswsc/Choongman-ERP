import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { filterPayrollRowsHidingOffice } from '@/lib/office-payroll-access'
import { resolveCanManageOfficePayrollAuth } from '@/lib/office-payroll-auth-server'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
} from '@/lib/saas-tenant-scope'
export interface SalaryHistoryRow {
  id: number
  employee_id: number
  store: string
  name: string
  old_sal_type: string
  new_sal_type: string
  old_sal_amt: number
  new_sal_amt: number
  old_position_allowance: number
  new_position_allowance: number
  old_haz_allow: number
  new_haz_allow: number
  changed_at: string
  changed_by: string
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
  if (isSaasTenantQueryBlocked(tenantScope, 'employee_salary_history')) {
    return NextResponse.json({ success: true, list: [] }, { headers })
  }

  const { searchParams } = new URL(request.url)
  let storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const nameFilter = String(searchParams.get('nameFilter') || searchParams.get('name') || '').trim()
  const fromDate = String(searchParams.get('fromDate') || '').trim().slice(0, 10)
  const toDate = String(searchParams.get('toDate') || '').trim().slice(0, 10)

  const userStore = (auth.store || '').trim()
  const userRole = (auth.role || '').toLowerCase()
  if (userRole.includes('manager') && userStore) storeFilter = userStore

  try {
    const parts: string[] = []
    if (storeFilter && storeFilter !== 'All' && storeFilter !== '전체') {
      parts.push(`store=eq.${encodeURIComponent(storeFilter)}`)
    }
    if (nameFilter) {
      parts.push(`name=ilike.${encodeURIComponent('*' + nameFilter + '*')}`)
    }
    if (fromDate && fromDate.length >= 10) {
      parts.push(`changed_at=gte.${encodeURIComponent(fromDate + 'T00:00:00Z')}`)
    }
    if (toDate && toDate.length >= 10) {
      parts.push(`changed_at=lte.${encodeURIComponent(toDate + 'T23:59:59Z')}`)
    }
    const baseFilter = parts.length > 0 ? parts.join('&') : 'id=gt.0'
    const filter = appendSaasTenantFilter(baseFilter, tenantScope, 'employee_salary_history')

    let rows: Record<string, unknown>[] = []
    try {
      rows = (await supabaseSelectFilter('employee_salary_history', filter, {
        order: 'changed_at.desc',
        limit: 500,
      })) as Record<string, unknown>[]
    } catch (e) {
      if (isMissingSaasTenantColumnError(e)) {
        markSaasTenantColumnMissing('employee_salary_history')
        rows = (await supabaseSelectFilter('employee_salary_history', baseFilter, {
          order: 'changed_at.desc',
          limit: 500,
        })) as Record<string, unknown>[]
      } else {
        throw e
      }
    }

    const payrollAuth = await resolveCanManageOfficePayrollAuth(auth)

    const list = filterPayrollRowsHidingOffice(
      (rows || []).map((r: Record<string, unknown>) => ({
        id: Number(r.id) || 0,
        employee_id: Number(r.employee_id) || 0,
        store: String(r.store || ''),
        name: String(r.name || ''),
        old_sal_type: String(r.old_sal_type || ''),
        new_sal_type: String(r.new_sal_type || ''),
        old_sal_amt: Number(r.old_sal_amt) || 0,
        new_sal_amt: Number(r.new_sal_amt) || 0,
        old_position_allowance: Number(r.old_position_allowance) || 0,
        new_position_allowance: Number(r.new_position_allowance) || 0,
        old_haz_allow: Number(r.old_haz_allow) || 0,
        new_haz_allow: Number(r.new_haz_allow) || 0,
        changed_at: String(r.changed_at || ''),
        changed_by: String(r.changed_by || ''),
      })),
      payrollAuth
    )

    return NextResponse.json({ success: true, list }, { headers })
  } catch (e) {
    console.error('getEmployeeSalaryHistory:', e)
    return NextResponse.json(
      { success: false, list: [], msg: '급여 변경 내역 조회 중 오류가 발생했습니다.' },
      { status: 500, headers }
    )
  }
}
