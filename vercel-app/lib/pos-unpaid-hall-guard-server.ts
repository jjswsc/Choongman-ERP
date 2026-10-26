import { supabaseSelectFilter } from '@/lib/supabase-server'
import { supabaseSelectFilterStrippingUnknownColumns } from '@/lib/supabase-pgrst204-retry'
import { appendSaasTenantFilter, type SaasTenantScope, LEGACY_SAAS_TENANT_SCOPE } from '@/lib/saas-tenant-scope'
import {
  POS_OPEN_TABLE_ROW_SELECT,
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
import { posBusinessDateYmdToUtcRange } from '@/lib/pos-business-day'
import {
  loadPosBusinessDaySettingsContext,
  resolvePosBusinessHoursFromContext,
} from '@/lib/pos-business-day-server'

/** 미결제 홀 — is_advance 등 선주문 컬럼은 레거시 DB에 없을 수 있어 열지 않음 (open-table totals 와 동일) */
const UNPAID_HALL_SELECT = `id,order_no,${POS_OPEN_TABLE_ROW_SELECT}`

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

/**
 * 결산일(영업일)에 오픈된 미결제 홀만.
 * 과거 고아 미결제 빌이 오늘 마감을 막지 않도록 created_at 을 해당 영업일 창으로 제한.
 */
export async function listUnpaidHallOrdersForStore(params: {
  storeCode: string
  /** 결산일 YYYY-MM-DD (POS 영업일) */
  settleDate: string
  tenantScope?: SaasTenantScope
  limit?: number
}): Promise<UnpaidHallOrderSummary[]> {
  const storeCode = String(params.storeCode || '').trim()
  const settleDate = String(params.settleDate || '').trim().slice(0, 10)
  if (!storeCode || !/^\d{4}-\d{2}-\d{2}$/.test(settleDate)) return []
  const tenantScope = params.tenantScope || LEGACY_SAAS_TENANT_SCOPE
  const limit = Math.min(300, Math.max(1, Math.floor(Number(params.limit) || 200)))

  const bizCtx = await loadPosBusinessDaySettingsContext({
    tenantId: tenantScope.tenantId,
    storeCode,
  })
  const hours = resolvePosBusinessHoursFromContext(bizCtx, storeCode)
  const { startISO, endISOExclusive } = posBusinessDateYmdToUtcRange(settleDate, hours)

  const statusIn = POS_OPEN_TABLE_STATUSES.join(',')
  const base =
    `store_code=ilike.${encodeURIComponent(storeCode)}` +
    `&status=in.(${statusIn})` +
    `&created_at=gte.${encodeURIComponent(startISO)}` +
    `&created_at=lt.${encodeURIComponent(endISOExclusive)}` +
    `&order=created_at.asc`
  const filter = appendSaasTenantFilter(base, tenantScope, 'pos_orders')
  let rows: DbUnpaidRow[] | null = null
  try {
    rows = (await supabaseSelectFilterStrippingUnknownColumns(
      'pos_orders',
      filter,
      { limit, select: UNPAID_HALL_SELECT },
      'listUnpaidHallOrdersForStore'
    )) as DbUnpaidRow[] | null
  } catch (e) {
    /** 스키마·조회 오류로 마감 전체가 막히지 않게 — 미결제 검사만 스킵 */
    console.error('listUnpaidHallOrdersForStore:', e)
    return []
  }

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
