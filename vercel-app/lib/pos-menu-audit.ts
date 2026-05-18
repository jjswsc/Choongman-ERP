import { supabaseInsert } from '@/lib/supabase-server'

type PosMenuAuditActor = {
  name?: string | null
  role?: string | null
  store?: string | null
  employeeCode?: string | null
  employeeId?: number | null
}

type PosMenuAuditPayload = {
  menuId: number
  menuCode?: string | null
  actionType: 'create' | 'update'
  actor?: PosMenuAuditActor | null
  source?: string | null
  reason?: string | null
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  detail?: Record<string, unknown> | null
}

function isMissingAuditTableError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('pos_menu_audit_logs') || msg.includes('42p01')
}

function normalizeComparableValue(v: unknown): string {
  if (v == null) return '__NULL__'
  if (typeof v === 'string') return `str:${v}`
  if (typeof v === 'number') return Number.isFinite(v) ? `num:${v}` : '__NAN__'
  if (typeof v === 'boolean') return `bool:${v ? '1' : '0'}`
  try {
    return `json:${JSON.stringify(v)}`
  } catch {
    return `str:${String(v)}`
  }
}

function buildChangedFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): Array<{ field: string; before: unknown; after: unknown }> {
  const b = before || {}
  const a = after || {}
  const keys = new Set<string>([...Object.keys(b), ...Object.keys(a)])
  const out: Array<{ field: string; before: unknown; after: unknown }> = []
  keys.forEach((k) => {
    const bv = b[k]
    const av = a[k]
    if (normalizeComparableValue(bv) === normalizeComparableValue(av)) return
    out.push({ field: k, before: bv ?? null, after: av ?? null })
  })
  return out
}

export async function writePosMenuAuditTrail(payload: PosMenuAuditPayload): Promise<void> {
  const menuId = Math.floor(Number(payload.menuId))
  if (!Number.isFinite(menuId) || menuId <= 0) return
  const before = payload.before || null
  const after = payload.after || null
  const changedFields = buildChangedFields(before, after)
  const actor = payload.actor || null

  try {
    await supabaseInsert('pos_menu_audit_logs', {
      menu_id: menuId,
      menu_code: String(payload.menuCode || '').trim() || null,
      action_type: String(payload.actionType || 'update').trim().slice(0, 40),
      changed_by: String(actor?.name || '').trim() || null,
      changed_by_role: String(actor?.role || '').trim() || null,
      changed_by_store: String(actor?.store || '').trim() || null,
      changed_by_employee_code: String(actor?.employeeCode || '').trim() || null,
      changed_by_employee_id:
        actor?.employeeId != null && Number.isFinite(Number(actor.employeeId))
          ? Math.floor(Number(actor.employeeId))
          : null,
      change_source: String(payload.source || '').trim().slice(0, 80) || null,
      reason: String(payload.reason || '').trim().slice(0, 500) || null,
      before_json: before,
      after_json: after,
      changed_fields_json: changedFields,
      detail_json: payload.detail && Object.keys(payload.detail).length > 0 ? payload.detail : null,
      changed_at: new Date().toISOString(),
    })
  } catch (e) {
    if (isMissingAuditTableError(e)) return
    throw e
  }
}
