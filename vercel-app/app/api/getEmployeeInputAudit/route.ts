import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { isFranchiseeRole } from '@/lib/permissions'
import { userCanAccessEmployeeStore } from '@/lib/admin-employee-store-access'
import { normalizedAllowedStoresFromJwt } from '@/lib/franchisee-multi-store'
import { buildEmployeeAuditChanges, canViewAllEmployeeAuditStores } from '@/lib/employee-audit'

type AuditRow = {
  id?: number
  action_type?: string
  changed_at?: string
  actor_name?: string | null
  actor_role?: string | null
  actor_store?: string | null
  actor_employee_code?: string | null
  employee_id?: number | null
  employee_code?: string | null
  employee_name?: string | null
  employee_store?: string | null
  change_reason?: string | null
  before_row?: Record<string, unknown> | null
  after_row?: Record<string, unknown> | null
}

function safeObj(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  return v as Record<string, unknown>
}

function parseYmd(raw: string): string | null {
  const s = String(raw || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const userRole = String(auth.role || '').trim()
    const userStore = String(auth.store || '').trim()
    const franchiseeStores =
      isFranchiseeRole(userRole) ? normalizedAllowedStoresFromJwt(auth) : undefined

    const url = new URL(request.url)
    const limitRaw = Number(url.searchParams.get('limit') || 500)
    const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? limitRaw : 500, 3000))
    const startDateRaw = parseYmd(String(url.searchParams.get('startDate') || ''))
    const endDateRaw = parseYmd(String(url.searchParams.get('endDate') || ''))
    const startDate =
      startDateRaw && endDateRaw && startDateRaw > endDateRaw ? endDateRaw : startDateRaw
    const endDate =
      startDateRaw && endDateRaw && startDateRaw > endDateRaw ? startDateRaw : endDateRaw
    const startTs = startDate ? `${startDate} 00:00:00` : ''
    const endTs = endDate ? `${endDate} 23:59:59` : ''
    let filter = 'id=gt.0'
    if (startTs) filter = `changed_at=gte.${encodeURIComponent(startTs)}`
    if (endTs) {
      filter = filter
        ? `${filter}&changed_at=lte.${encodeURIComponent(endTs)}`
        : `changed_at=lte.${encodeURIComponent(endTs)}`
    }

    const audits = (await supabaseSelectFilterAllPages('employees_audit', filter, {
      order: 'changed_at.desc,id.desc',
      select:
        'id,action_type,changed_at,actor_name,actor_role,actor_store,actor_employee_code,employee_id,employee_code,employee_name,employee_store,change_reason,before_row,after_row',
      pageSize: Math.min(1000, limit),
      maxRows: limit,
    }).catch(() => [])) as AuditRow[]

    const top = canViewAllEmployeeAuditStores(userRole)
    const scoped = (audits || []).filter((a) => {
      const store = String(a.employee_store ?? '').trim()
      if (!store) return top
      if (top) return true
      return userCanAccessEmployeeStore(userRole, userStore, store, {
        allowedStores: franchiseeStores && franchiseeStores.length > 0 ? franchiseeStores : undefined,
      })
    })

    const rows = scoped.map((a) => {
      const before = safeObj(a.before_row)
      const after = safeObj(a.after_row)
      const actionType = String(a.action_type ?? '') as 'insert' | 'update' | 'delete'
      const changes = buildEmployeeAuditChanges(
        actionType === 'insert' || actionType === 'update' || actionType === 'delete' ? actionType : 'update',
        before,
        after
      )
      return {
        id: Number(a.id ?? 0) || 0,
        actionType: String(a.action_type ?? ''),
        changedAt: String(a.changed_at ?? ''),
        actorName: String(a.actor_name ?? '').trim() || null,
        actorRole: String(a.actor_role ?? '').trim() || null,
        actorStore: String(a.actor_store ?? '').trim() || null,
        actorEmployeeCode: String(a.actor_employee_code ?? '').trim() || null,
        employeeId: a.employee_id != null ? Number(a.employee_id) : null,
        employeeCode: String(a.employee_code ?? '').trim() || null,
        employeeName: String(a.employee_name ?? '').trim() || null,
        employeeStore: String(a.employee_store ?? '').trim() || null,
        changeReason: String(a.change_reason ?? '').trim() || null,
        changes,
        changeCount: changes.length,
      }
    })

    return NextResponse.json(rows, { headers })
  } catch (e) {
    console.error('getEmployeeInputAudit:', e)
    return NextResponse.json([], { headers })
  }
}
