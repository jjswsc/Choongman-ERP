import 'server-only'

import type { PosOrderTypeValue } from '@/lib/pos-sales-order-type-filter'
import { loadPosBusinessDaySettingsContext } from '@/lib/pos-business-day-server'
import { posSalesBusinessDateRangeUtcEnvelope } from '@/lib/pos-sales-business-day-range'
import { expandSalesStoreCodesForFilterAsync } from '@/lib/pos-sales-store-filter'
import { buildPosSalesBizHoursRpcPayload } from '@/lib/pos-sales-analytics-rpc-server'
import { supabaseRpc } from '@/lib/supabase-server'

export type PosCancelReasonAggRow = {
  bucket_kind?: string | null
  reason?: string | null
  cancel_count?: number | string | null
  cancel_amount?: number | string | null
}

export type PosCancelReasonSummaryPayload = {
  lineRows: { reason: string; count: number; amount: number }[]
  orderRows: { reason: string; count: number; amount: number }[]
  lineTotalCount: number
  lineTotalAmount: number
  orderTotalCount: number
  orderTotalAmount: number
  truncated: false
}

function num(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

function int(v: unknown): number {
  return Math.max(0, Math.trunc(num(v)))
}

export function mapCancelReasonAggRowsToSummary(
  rows: PosCancelReasonAggRow[]
): PosCancelReasonSummaryPayload {
  const lineBucket = new Map<string, { count: number; amount: number }>()
  const orderBucket = new Map<string, { count: number; amount: number }>()
  let lineTotalCount = 0
  let lineTotalAmount = 0
  let orderTotalCount = 0
  let orderTotalAmount = 0

  for (const r of rows) {
    const kind = String(r.bucket_kind ?? '').trim().toLowerCase()
    const reason = String(r.reason ?? '').trim() || '__POS_CANCEL_REASON_EMPTY__'
    const count = int(r.cancel_count)
    const amount = Math.max(0, num(r.cancel_amount))
    if (kind === 'line') {
      const prev = lineBucket.get(reason) || { count: 0, amount: 0 }
      prev.count += count
      prev.amount += amount
      lineBucket.set(reason, prev)
      lineTotalCount += count
      lineTotalAmount += amount
    } else if (kind === 'order') {
      const prev = orderBucket.get(reason) || { count: 0, amount: 0 }
      prev.count += count
      prev.amount += amount
      orderBucket.set(reason, prev)
      orderTotalCount += count
      orderTotalAmount += amount
    }
  }

  const toRows = (m: Map<string, { count: number; amount: number }>) =>
    Array.from(m.entries())
      .map(([reason, v]) => ({ reason, count: v.count, amount: v.amount }))
      .sort((a, b) => b.count - a.count || b.amount - a.amount)

  return {
    lineRows: toRows(lineBucket),
    orderRows: toRows(orderBucket),
    lineTotalCount,
    lineTotalAmount,
    orderTotalCount,
    orderTotalAmount,
    truncated: false,
  }
}

export async function fetchPosCancelReasonSummaryAgg(params: {
  startStr: string
  endStr: string
  storeCodes?: string[]
  orderTypes?: PosOrderTypeValue[] | null
  request?: import('next/server').NextRequest
}): Promise<PosCancelReasonSummaryPayload> {
  const startStr = params.startStr.trim().slice(0, 10)
  const endStr = params.endStr.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
    return mapCancelReasonAggRowsToSummary([])
  }

  const {
    isSaasTenantQueryBlocked,
    resolveSaasTenantScope,
  } = await import('@/lib/saas-tenant-scope')

  let tenantScope: import('@/lib/saas-tenant-scope').SaasTenantScope | undefined
  if (params.request) {
    const { getVerifiedAuth } = await import('@/lib/verify-auth')
    const auth = await getVerifiedAuth(params.request, { skipSaasGate: true })
    tenantScope = await resolveSaasTenantScope({
      auth,
      storeCode: params.storeCodes?.[0] ?? null,
    })
  }
  if (tenantScope && isSaasTenantQueryBlocked(tenantScope, 'pos_orders')) {
    return mapCancelReasonAggRowsToSummary([])
  }

  const bizCtx = await loadPosBusinessDaySettingsContext()
  const { startISO, endISOExclusive } = posSalesBusinessDateRangeUtcEnvelope(bizCtx, startStr, endStr)
  const expanded =
    params.storeCodes && params.storeCodes.length > 0
      ? await expandSalesStoreCodesForFilterAsync(params.storeCodes)
      : null

  const pTenantId =
    tenantScope?.enforce && tenantScope.tenantId ? tenantScope.tenantId : null

  const rows = (await supabaseRpc<PosCancelReasonAggRow[]>('get_pos_cancel_reason_summary', {
    p_start_utc: startISO,
    p_end_utc_exclusive: endISOExclusive,
    p_start_ymd: startStr,
    p_end_ymd: endStr,
    p_store_codes: expanded && expanded.length > 0 ? expanded : null,
    p_order_types: params.orderTypes?.length ? params.orderTypes : null,
    p_biz_hours: buildPosSalesBizHoursRpcPayload(bizCtx),
    p_tenant_id: pTenantId,
  })) as PosCancelReasonAggRow[] | null

  return mapCancelReasonAggRowsToSummary(Array.isArray(rows) ? rows : [])
}

export async function tryFetchPosCancelReasonSummaryAgg(
  params: Parameters<typeof fetchPosCancelReasonSummaryAgg>[0]
): Promise<PosCancelReasonSummaryPayload | null> {
  try {
    return await fetchPosCancelReasonSummaryAgg(params)
  } catch (e) {
    console.warn('tryFetchPosCancelReasonSummaryAgg:', e instanceof Error ? e.message : e)
    return null
  }
}
