import { supabaseInsert, supabaseSelectFilter } from '@/lib/supabase-server'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import type { JwtPayload } from '@/lib/jwt-auth'
import { isAccountingRole } from '@/lib/permissions'

const AUDIT_EXCLUDED_KEYS = new Set(['password'])

/** employees_audit before/after 스냅샷 조회용 (password 제외) */
export const EMPLOYEE_AUDIT_SELECT =
  'id,store,name,name_title,nick,phone,job,birth,nation,join_date,resign_date,employment_status,sal_type,sal_amt,role,email,employee_code,id_number,tax_id,sso_number,sso_exempt,address,bank_name,account_number,position_allowance,haz_allow,attendance_allowance,grade,photo,id_card_photo,extra_stores,deleted_at,deleted_by,delete_reason'

/** 구 DB(일부 컬럼 없음)용 축소 select */
export const EMPLOYEE_AUDIT_SELECT_FALLBACK =
  'id,store,name,name_title,nick,phone,job,birth,nation,join_date,resign_date,sal_type,sal_amt,role,email,employee_code,id_number,tax_id,sso_number,address,bank_name,account_number,position_allowance,haz_allow,grade'

export function canViewAllEmployeeAuditStores(role: string): boolean {
  const r = String(role || '').trim().toLowerCase()
  return (
    ['director', 'secretary', 'officer', 'ceo', 'hr'].some((x) => r.includes(x)) || isAccountingRole(r)
  )
}

export async function fetchEmployeeAuditSnapshot(employeeId: number): Promise<Record<string, unknown> | null> {
  if (!Number.isFinite(employeeId) || employeeId <= 0) return null
  const filter = `id=eq.${Math.floor(employeeId)}`
  for (const select of [EMPLOYEE_AUDIT_SELECT, EMPLOYEE_AUDIT_SELECT_FALLBACK]) {
    try {
      const rows = (await supabaseSelectFilter('employees', filter, {
        limit: 1,
        select,
      })) as Record<string, unknown>[]
      if (rows?.[0]) return rows[0]
    } catch (e) {
      const em = e instanceof Error ? e.message : String(e)
      if (!/42703|column/i.test(em)) throw e
    }
  }
  return null
}

/** DB 컬럼명 → i18n 키 (직원 입력 이력 UI) */
export const EMPLOYEE_AUDIT_FIELD_I18N: Record<string, string> = {
  store: 'emp_label_store',
  name: 'emp_label_name',
  name_title: 'emp_label_nick_title',
  nick: 'emp_label_nickname',
  phone: 'emp_label_phone',
  job: 'emp_label_job',
  birth: 'emp_label_birth',
  nation: 'emp_label_nation',
  join_date: 'emp_label_join_date',
  resign_date: 'emp_label_leave_date',
  employment_status: 'emp_audit_field_employment_status',
  sal_type: 'emp_label_sal_type',
  sal_amt: 'emp_label_sal_amt',
  role: 'emp_label_role',
  email: 'emp_label_email',
  employee_code: 'emp_label_employee_code',
  id_number: 'emp_id_number',
  tax_id: 'emp_tax_id',
  sso_number: 'emp_sso_number',
  sso_exempt: 'emp_sso_exempt_label',
  address: 'emp_address',
  bank_name: 'emp_bank_name',
  account_number: 'emp_account_number',
  position_allowance: 'emp_position_allowance',
  haz_allow: 'emp_risk_allowance',
  attendance_allowance: 'emp_attendance_allowance',
  grade: 'emp_grade',
  photo: 'emp_photo',
  id_card_photo: 'emp_id_card',
  extra_stores: 'emp_franchisee_extra_stores',
  deleted_at: 'emp_audit_deleted_at',
  deleted_by: 'emp_audit_deleted_by',
  delete_reason: 'emp_audit_delete_reason',
}

export type EmployeeAuditActor = {
  name?: string | null
  role?: string | null
  store?: string | null
  employeeCode?: string | null
  employeeId?: number | null
}

export function sanitizeEmployeeAuditRow(row: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!row || typeof row !== 'object') return null
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (AUDIT_EXCLUDED_KEYS.has(k)) continue
    out[k] = v
  }
  return out
}

export function actorFromJwt(auth: JwtPayload, fallbackName?: string): EmployeeAuditActor {
  return {
    name: String(auth.name || fallbackName || '').trim() || null,
    role: String(auth.role || '').trim() || null,
    store: String(auth.store || '').trim() || null,
    employeeCode: auth.employeeCode ? String(auth.employeeCode).trim() : null,
    employeeId:
      auth.employeeId != null && Number.isFinite(Number(auth.employeeId))
        ? Math.floor(Number(auth.employeeId))
        : null,
  }
}

function formatAuditScalar(v: unknown): string {
  if (v == null) return ''
  if (Array.isArray(v)) return v.map((x) => String(x ?? '').trim()).filter(Boolean).join(', ')
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v).trim()
}

export function diffEmployeeAuditRows(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): { field: string; oldValue: string; newValue: string }[] {
  const b = sanitizeEmployeeAuditRow(before) || {}
  const a = sanitizeEmployeeAuditRow(after) || {}
  const keys = new Set([...Object.keys(b), ...Object.keys(a)])
  const skip = new Set(['id'])
  const out: { field: string; oldValue: string; newValue: string }[] = []
  for (const field of keys) {
    if (skip.has(field)) continue
    const oldValue = formatAuditScalar(b[field])
    const newValue = formatAuditScalar(a[field])
    if (oldValue === newValue) continue
    out.push({ field, oldValue, newValue })
  }
  out.sort((x, y) => x.field.localeCompare(y.field))
  return out
}

export function buildEmployeeAuditChanges(
  actionType: 'insert' | 'update' | 'delete',
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): { field: string; oldValue: string; newValue: string }[] {
  if (actionType === 'insert') return diffEmployeeAuditRows(null, after)
  return diffEmployeeAuditRows(before, after)
}

export async function writeEmployeeAudit(params: {
  actionType: 'insert' | 'update' | 'delete'
  employeeId: number | null
  employeeCode?: string | null
  employeeName?: string | null
  employeeStore?: string | null
  beforeRow?: Record<string, unknown> | null
  afterRow?: Record<string, unknown> | null
  changeReason?: string | null
  actor: EmployeeAuditActor
}): Promise<void> {
  try {
    await supabaseInsert('employees_audit', {
      action_type: params.actionType,
      changed_at: getBangkokDateTimeString(),
      actor_name: params.actor.name,
      actor_role: params.actor.role,
      actor_store: params.actor.store,
      actor_employee_code: params.actor.employeeCode,
      actor_employee_id: params.actor.employeeId,
      employee_id: params.employeeId,
      employee_code: params.employeeCode ? String(params.employeeCode).trim() : null,
      employee_name: params.employeeName ? String(params.employeeName).trim() : null,
      employee_store: params.employeeStore ? String(params.employeeStore).trim() : null,
      change_reason: params.changeReason ? String(params.changeReason).trim() : null,
      before_row: sanitizeEmployeeAuditRow(params.beforeRow ?? null),
      after_row: sanitizeEmployeeAuditRow(params.afterRow ?? null),
    })
  } catch {
    // 이력 저장 실패해도 직원 저장은 완료
  }
}
