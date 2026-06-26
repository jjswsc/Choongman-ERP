import { supabaseInsert } from '@/lib/supabase-server'
import type { JwtPayload } from '@/lib/jwt-auth'

export type BankAccountAuditAction = 'create' | 'update' | 'delete' | 'delete_denied'

export type BankAccountAuditDecision = 'allow' | 'deny' | 'error'

export type BankAccountAuditActor = {
  name: string | null
  role: string | null
  store: string | null
  employeeId: number | null
  employeeCode: string | null
}

function cut(v: string | null | undefined, max: number): string | null {
  const s = String(v || '').trim()
  if (!s) return null
  return s.slice(0, max)
}

function isMissingAuditTableError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('bank_account_audit_logs') || msg.includes('42p01')
}

export function actorFromAuth(auth: JwtPayload): BankAccountAuditActor {
  const employeeId =
    auth.employeeId != null && Number.isFinite(Number(auth.employeeId))
      ? Math.floor(Number(auth.employeeId))
      : null
  return {
    name: cut(auth.name, 200),
    role: cut(auth.role, 120),
    store: cut(auth.store, 120),
    employeeId,
    employeeCode: cut(auth.employeeCode, 80),
  }
}

export function formatBankAccountAuditActor(actor: BankAccountAuditActor): string {
  const head = [actor.name, actor.role ? `(${actor.role})` : null].filter(Boolean).join(' ')
  const tail = actor.store ? `@ ${actor.store}` : ''
  const code = actor.employeeCode ? ` · ${actor.employeeCode}` : ''
  return `${head}${tail}${code}`.trim() || '—'
}

export async function writeBankAccountAudit(params: {
  actionType: BankAccountAuditAction
  decision: BankAccountAuditDecision
  auth: JwtPayload
  accountId?: number | null
  accountStore?: string | null
  accountName?: string | null
  bankName?: string | null
  reasonCode?: string | null
  payload?: Record<string, unknown> | null
}): Promise<void> {
  const actor = actorFromAuth(params.auth)
  const row = {
    action_type: cut(params.actionType, 40) || 'unknown',
    decision: params.decision,
    reason_code: cut(params.reasonCode || null, 120),
    account_id: params.accountId != null && params.accountId > 0 ? params.accountId : null,
    account_store: cut(params.accountStore || null, 120),
    account_name: cut(params.accountName || null, 200),
    bank_name: cut(params.bankName || null, 120),
    actor_name: actor.name,
    actor_role: actor.role,
    actor_store: actor.store,
    actor_employee_id: actor.employeeId,
    actor_employee_code: actor.employeeCode,
    payload: params.payload || null,
    created_at: new Date().toISOString(),
  }
  try {
    await supabaseInsert('bank_account_audit_logs', row)
  } catch (e) {
    if (isMissingAuditTableError(e)) {
      console.warn('bank_account_audit_logs table missing — run sql/bank_account_audit_logs.sql')
      return
    }
    throw e
  }
}
