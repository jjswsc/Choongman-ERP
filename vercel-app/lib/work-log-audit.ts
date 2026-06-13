import 'server-only'

import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import { supabaseInsert, supabaseSelectFilter } from '@/lib/supabase-server'
import type { JwtPayload } from '@/lib/jwt-auth'
import { actorFromJwt, type EmployeeAuditActor } from '@/lib/employee-audit'

export type WorkLogAuditAction = 'insert' | 'update' | 'delete' | 'review' | 'close'

export type WorkLogAuditRow = {
  id?: string
  log_date?: string
  store?: string
  dept?: string
  name?: string
  employee_id?: number | null
  content?: string
  progress?: number
  status?: string
  priority?: string
  manager_check?: string
  manager_comment?: string
}

export async function fetchWorkLogRowById(id: string): Promise<WorkLogAuditRow | null> {
  const sid = String(id || '').trim()
  if (!sid) return null
  const rows = (await supabaseSelectFilter('work_logs', `id=eq.${encodeURIComponent(sid)}`, {
    limit: 1,
  })) as WorkLogAuditRow[]
  return rows?.[0] ?? null
}

export function workLogActorFromAuth(auth: JwtPayload | null, fallbackName?: string): EmployeeAuditActor {
  if (auth) return actorFromJwt(auth, fallbackName)
  return {
    name: fallbackName ? String(fallbackName).trim() : null,
    role: null,
    store: null,
    employeeId: null,
    employeeCode: null,
  }
}

export async function writeWorkLogAudit(params: {
  actionType: WorkLogAuditAction
  workLogId?: string | null
  logDate?: string | null
  employeeId?: number | null
  employeeName?: string | null
  employeeStore?: string | null
  beforeRow?: WorkLogAuditRow | Record<string, unknown> | null
  afterRow?: WorkLogAuditRow | Record<string, unknown> | null
  changeReason?: string | null
  actor: EmployeeAuditActor
}): Promise<void> {
  try {
    await supabaseInsert('work_logs_audit', {
      action_type: params.actionType,
      changed_at: getBangkokDateTimeString(),
      work_log_id: params.workLogId ? String(params.workLogId) : null,
      log_date: params.logDate || null,
      employee_id:
        params.employeeId != null && Number.isFinite(Number(params.employeeId))
          ? Math.floor(Number(params.employeeId))
          : null,
      employee_name: params.employeeName ? String(params.employeeName).trim() : null,
      employee_store: params.employeeStore ? String(params.employeeStore).trim() : null,
      actor_name: params.actor.name,
      actor_role: params.actor.role,
      actor_store: params.actor.store,
      actor_employee_id: params.actor.employeeId,
      change_reason: params.changeReason ? String(params.changeReason).trim() : null,
      before_row: params.beforeRow ?? null,
      after_row: params.afterRow ?? null,
    })
  } catch {
    /* 감사 실패해도 본 작업은 완료 */
  }
}
