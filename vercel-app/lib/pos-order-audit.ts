import { supabaseInsert } from '@/lib/supabase-server'

type PosOrderAuditActor = {
  name?: string | null
  role?: string | null
  store?: string | null
  employeeCode?: string | null
  employeeId?: number | null
}

type PosOrderAuditPayload = {
  orderId: number
  orderNo?: string | null
  storeCode?: string | null
  actionType: string
  idempotencyKey?: string | null
  actor?: PosOrderAuditActor | null
  source?: string | null
  reason?: string | null
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}

function isMissingAuditTableError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('pos_order_audit_logs') || msg.includes('42p01')
}

function isMissingOrderEventsTableError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('pos_order_events') || msg.includes('42p01')
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

export async function appendPosOrderEvent(payload: PosOrderAuditPayload): Promise<void> {
  const orderId = Math.floor(Number(payload.orderId))
  if (!Number.isFinite(orderId) || orderId <= 0) return
  const before = payload.before || null
  const after = payload.after || null
  const changedFields = buildChangedFields(before, after)
  const actor = payload.actor || null

  try {
    await supabaseInsert('pos_order_events', {
      order_id: orderId,
      order_no: String(payload.orderNo || '').trim() || null,
      store_code: String(payload.storeCode || '').trim() || null,
      event_type: String(payload.actionType || 'unknown').trim().slice(0, 120) || 'unknown',
      actor_name: String(actor?.name || '').trim() || null,
      actor_role: String(actor?.role || '').trim() || null,
      actor_store: String(actor?.store || '').trim() || null,
      actor_employee_code: String(actor?.employeeCode || '').trim() || null,
      actor_employee_id:
        actor?.employeeId != null && Number.isFinite(Number(actor.employeeId))
          ? Math.floor(Number(actor.employeeId))
          : null,
      source: String(payload.source || '').trim().slice(0, 80) || null,
      reason: String(payload.reason || '').trim().slice(0, 500) || null,
      before_json: before,
      after_json: after,
      changed_fields_json: changedFields,
      idempotency_key: String(payload.idempotencyKey || '').trim().slice(0, 200) || null,
      event_at: new Date().toISOString(),
    })
  } catch (e) {
    if (isMissingOrderEventsTableError(e)) return
    throw e
  }
}

export async function writePosOrderAuditTrail(payload: PosOrderAuditPayload): Promise<void> {
  const orderId = Math.floor(Number(payload.orderId))
  if (!Number.isFinite(orderId) || orderId <= 0) return
  const before = payload.before || null
  const after = payload.after || null
  const changedFields = buildChangedFields(before, after)
  const actor = payload.actor || null

  try {
    await appendPosOrderEvent(payload)
  } catch (e) {
    if (!isMissingOrderEventsTableError(e)) throw e
  }

  try {
    await supabaseInsert('pos_order_audit_logs', {
      order_id: orderId,
      order_no: String(payload.orderNo || '').trim() || null,
      store_code: String(payload.storeCode || '').trim() || null,
      action_type: String(payload.actionType || 'unknown').trim().slice(0, 120) || 'unknown',
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
      changed_at: new Date().toISOString(),
    })
  } catch (e) {
    if (isMissingAuditTableError(e)) return
    throw e
  }
}
