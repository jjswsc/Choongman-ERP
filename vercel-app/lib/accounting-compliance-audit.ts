import { supabaseInsert } from '@/lib/supabase-server'

type AccountingComplianceAuditEvent = {
  actionType: string
  userRole: string
  actor: string | null
  decision: 'allow' | 'deny' | 'error'
  reasonCode?: string | null
  yearMonth?: string | null
  periodType?: 'monthly' | 'half_year' | 'annual' | null
  periodKey?: string | null
  storeScope?: string | null
  filingType?: string | null
  targetType?: string | null
  targetId?: string | null
  payload?: Record<string, unknown> | null
}

function isMissingAuditTableError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('accounting_compliance_audit_logs') || msg.includes('42p01')
}

function cut(v: string | null | undefined, max: number): string | null {
  const s = String(v || '').trim()
  if (!s) return null
  return s.slice(0, max)
}

export async function writeAccountingComplianceAudit(event: AccountingComplianceAuditEvent): Promise<void> {
  const row = {
    action_type: cut(event.actionType, 120) || 'unknown',
    user_role: cut(event.userRole, 120) || 'unknown',
    actor: cut(event.actor, 200),
    decision: event.decision,
    reason_code: cut(event.reasonCode || null, 120),
    year_month: cut(event.yearMonth || null, 7),
    period_type: cut(event.periodType || null, 20),
    period_key: cut(event.periodKey || null, 32),
    store_scope: cut(event.storeScope || null, 120),
    filing_type: cut(event.filingType || null, 120),
    target_type: cut(event.targetType || null, 120),
    target_id: cut(event.targetId || null, 120),
    payload: event.payload || null,
    created_at: new Date().toISOString(),
  }
  try {
    await supabaseInsert('accounting_compliance_audit_logs', row)
  } catch (e) {
    if (isMissingAuditTableError(e)) return
    throw e
  }
}
