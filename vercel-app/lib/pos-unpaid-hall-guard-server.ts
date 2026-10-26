import { supabaseSelectFilter } from '@/lib/supabase-server'
import { appendSaasTenantFilter, type SaasTenantScope, LEGACY_SAAS_TENANT_SCOPE } from '@/lib/saas-tenant-scope'
import {
  POS_OPEN_TABLE_STATUSES,
  rowCountsTowardOpenTable,
  type PosOpenTableOrderRow,
} from '@/lib/pos-open-table-totals'
import type { UnpaidHallOrderSummary } from '@/lib/pos-unpaid-hall-guard'
import { verifyPassword } from '@/lib/password'
import { isValidPosDrawerPin } from '@/lib/pos-drawer-pin'
import {
  isAccountingRole,
  isFranchiseeRole,
  isManagerRole,
  isOfficeRole,
  isSupervisorRole,
} from '@/lib/permissions'

const UNPAID_HALL_SELECT =
  'id,order_no,table_name,total,status,created_at,store_code,order_type,is_advance,scheduled_at,advance_checked_in_at'

type DbUnpaidRow = PosOpenTableOrderRow & {
  id?: number | string | null
  order_no?: string | null
  created_at?: string | null
}

export function canOverrideUnpaidHallSettlementClose(role: string): boolean {
  return (
    isOfficeRole(role) ||
    isSupervisorRole(role) ||
    isManagerRole(role) ||
    isFranchiseeRole(role) ||
    isAccountingRole(role)
  )
}

/** 매장 전체 — 영업일 무관. 어제 열어 둔 미결제 홀도 마감 차단 대상 */
export async function listUnpaidHallOrdersForStore(params: {
  storeCode: string
  tenantScope?: SaasTenantScope
  limit?: number
}): Promise<UnpaidHallOrderSummary[]> {
  const storeCode = String(params.storeCode || '').trim()
  if (!storeCode) return []
  const tenantScope = params.tenantScope || LEGACY_SAAS_TENANT_SCOPE
  const limit = Math.min(300, Math.max(1, Math.floor(Number(params.limit) || 200)))
  const statusIn = POS_OPEN_TABLE_STATUSES.join(',')
  const base =
    `store_code=ilike.${encodeURIComponent(storeCode)}` +
    `&status=in.(${statusIn})` +
    `&order=created_at.asc`
  const filter = appendSaasTenantFilter(base, tenantScope, 'pos_orders')
  const rows = (await supabaseSelectFilter('pos_orders', filter, {
    limit,
    select: UNPAID_HALL_SELECT,
  })) as DbUnpaidRow[] | null

  const out: UnpaidHallOrderSummary[] = []
  for (const row of rows || []) {
    if (!rowCountsTowardOpenTable(row)) continue
    const id = Number(row.id)
    if (!Number.isFinite(id) || id <= 0) continue
    out.push({
      id,
      orderNo: String(row.order_no ?? '').trim(),
      tableName: String(row.table_name ?? '').trim(),
      total: Math.max(0, Number(row.total) || 0),
      status: String(row.status ?? '').trim(),
      createdAt: String(row.created_at ?? '').trim(),
    })
  }
  return out
}

/**
 * 마감 예외: 사유 필수.
 * 서랍 PIN이 설정된 매장 → PIN 검증.
 * 미설정 → 매니저·본사·회계 등 역할만 허용.
 */
export async function assertUnpaidHallCloseOverrideAllowed(params: {
  storeCode: string
  role: string
  reason: string
  pin: string
}): Promise<{ ok: true } | { ok: false; code: string }> {
  const reason = String(params.reason ?? '').trim()
  if (reason.length < 8) {
    return { ok: false, code: 'unpaid_hall_override_reason_required' }
  }

  const storeCode = String(params.storeCode || '').trim()
  const pin = String(params.pin ?? '').trim()

  const rows = (await supabaseSelectFilter(
    'pos_printer_settings',
    `store_code=eq.${encodeURIComponent(storeCode)}`,
    { limit: 1, select: 'drawer_pin_hash' }
  )) as { drawer_pin_hash?: string | null }[] | null
  const hash = String(rows?.[0]?.drawer_pin_hash ?? '').trim()

  if (hash) {
    if (!isValidPosDrawerPin(pin)) {
      return { ok: false, code: 'unpaid_hall_override_pin_required' }
    }
    const ok = await verifyPassword(pin, hash)
    if (!ok) return { ok: false, code: 'unpaid_hall_override_pin_wrong' }
    return { ok: true }
  }

  if (!canOverrideUnpaidHallSettlementClose(params.role)) {
    return { ok: false, code: 'unpaid_hall_override_role_denied' }
  }
  return { ok: true }
}
