import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { canEditLeaveApprovers } from '@/lib/leave-approval-access'
import { loadLeaveApproverRows } from '@/lib/leave-approval-access-server'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
} from '@/lib/saas-tenant-scope'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const tenantScope = await resolveSaasTenantScope({ auth })
  if (isSaasTenantQueryBlocked(tenantScope, 'leave_approvers')) {
    return NextResponse.json(
      { success: true, canEdit: false, global: [], byStore: {} as Record<string, unknown[]> },
      { headers }
    )
  }

  try {
    const rows = await loadLeaveApproverRows(tenantScope)
    const empIds = [...new Set(rows.map((r) => r.employeeId).filter((id) => id > 0))]
    const empMap: Record<
      number,
      { id: number; name: string; nick: string; store: string; role: string; employeeCode: string }
    > = {}

    if (empIds.length > 0) {
      const idFilter = `id=in.(${empIds.join(',')})`
      const select = 'id,store,name,nick,role,employee_code'
      let emps: {
        id?: number
        store?: string
        name?: string
        nick?: string
        role?: string
        employee_code?: string | null
      }[] = []
      try {
        const filter = appendSaasTenantFilter(idFilter, tenantScope, 'employees')
        emps = (await supabaseSelectFilter('employees', filter, {
          limit: 5000,
          select,
        })) as typeof emps
      } catch (e) {
        if (isMissingSaasTenantColumnError(e)) {
          markSaasTenantColumnMissing('employees')
          emps = (await supabaseSelectFilter('employees', idFilter, {
            limit: 5000,
            select,
          })) as typeof emps
        } else {
          const em = e instanceof Error ? e.message : String(e)
          if (/employee_code|42703|column/i.test(em)) {
            emps = (await supabaseSelectFilter(
              'employees',
              appendSaasTenantFilter(idFilter, tenantScope, 'employees'),
              { limit: 5000, select: 'id,store,name,nick,role' }
            )) as typeof emps
          } else {
            throw e
          }
        }
      }
      for (const e of emps || []) {
        const id = e.id != null ? Math.floor(Number(e.id)) : 0
        if (!(id > 0)) continue
        empMap[id] = {
          id,
          name: String(e.name || '').trim(),
          nick: String(e.nick || '').trim(),
          store: String(e.store || '').trim(),
          role: String(e.role || '').trim(),
          employeeCode: String(e.employee_code || '').trim(),
        }
      }
    }

    const toItem = (employeeId: number) => {
      const e = empMap[employeeId]
      return {
        employeeId,
        name: e?.name || '',
        nick: e?.nick || '',
        store: e?.store || '',
        role: e?.role || '',
        employeeCode: e?.employeeCode || '',
      }
    }

    const global = rows.filter((r) => r.scope === 'all').map((r) => toItem(r.employeeId))
    const byStore: Record<string, ReturnType<typeof toItem>[]> = {}
    for (const r of rows) {
      if (r.scope !== 'store' || !r.store) continue
      const key = r.store
      if (!byStore[key]) byStore[key] = []
      byStore[key].push(toItem(r.employeeId))
    }

    return NextResponse.json(
      {
        success: true,
        canEdit: canEditLeaveApprovers({ role: auth.role, store: auth.store }),
        global,
        byStore,
      },
      { headers }
    )
  } catch (e) {
    console.error('getLeaveApprovers:', e)
    const em = e instanceof Error ? e.message : String(e)
    if (/PGRST205|does not exist|42P01|leave_approvers/i.test(em)) {
      return NextResponse.json(
        {
          success: true,
          canEdit: canEditLeaveApprovers({ role: auth.role, store: auth.store }),
          global: [],
          byStore: {},
          message: 'leave_approvers 테이블이 없습니다. sql/leave_approvers_01_create.sql 을 실행하세요.',
        },
        { headers }
      )
    }
    return NextResponse.json(
      { success: false, message: '조회 실패: ' + em, global: [], byStore: {} },
      { status: 500, headers }
    )
  }
}
