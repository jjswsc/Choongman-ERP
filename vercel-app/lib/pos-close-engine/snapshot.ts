import { supabaseSelectFilter } from '@/lib/supabase-server'
import { posBusinessDateYmdToUtcRange } from '@/lib/pos-business-day'
import { loadPosBusinessHoursForServer } from '@/lib/pos-business-day-server'
import { isPosPaidLikeStatus } from '@/lib/pos-order-policy'
import {
  appendSaasTenantFilter,
  type SaasTenantScope,
  LEGACY_SAAS_TENANT_SCOPE,
} from '@/lib/saas-tenant-scope'

export type PosCloseSnapshot = {
  storeCode: string
  businessDate: string
  systemTotal: number
  settlementTotal: number
  diffTotal: number
  hasSettlement: boolean
  closeStatus: 'locked' | 'draft'
}

/** 결산 화면·getPosSettlement과 동일 — 영업일 UTC 구간 기준 */
export async function computePosCloseSnapshot(params: {
  storeCode: string
  businessDate: string
  tenantScope?: SaasTenantScope
}): Promise<PosCloseSnapshot> {
  const storeCode = String(params.storeCode || '').trim()
  const businessDate = String(params.businessDate || '').trim().slice(0, 10)
  const tenantScope = params.tenantScope || LEGACY_SAAS_TENANT_SCOPE
  const hours = await loadPosBusinessHoursForServer(storeCode)
  const { startISO, endISOExclusive } = posBusinessDateYmdToUtcRange(businessDate, hours)

  const orderFilter = appendSaasTenantFilter(
    `created_at=gte.${encodeURIComponent(startISO)}` +
      `&created_at=lt.${encodeURIComponent(endISOExclusive)}` +
      `&store_code=ilike.${encodeURIComponent(storeCode)}`,
    tenantScope,
    'pos_orders'
  )

  const orders = (await supabaseSelectFilter('pos_orders', orderFilter, {
    limit: 20000,
    select: 'total,status',
  })) as { total?: number; status?: string }[] | null

  let systemTotal = 0
  for (const o of orders || []) {
    if (!isPosPaidLikeStatus(String(o.status ?? ''))) continue
    systemTotal += Number(o.total) || 0
  }

  const settlementFilter = appendSaasTenantFilter(
    `store_code=eq.${encodeURIComponent(storeCode)}&settle_date=eq.${encodeURIComponent(businessDate)}`,
    tenantScope,
    'pos_settlements'
  )
  const settlements = (await supabaseSelectFilter('pos_settlements', settlementFilter, {
    limit: 1,
    select: 'cash_amt,card_amt,qr_amt,delivery_app_amt,dine_in_delivery_amt,other_amt,closed',
  })) as
    | {
        cash_amt?: number
        card_amt?: number
        qr_amt?: number
        delivery_app_amt?: number
        dine_in_delivery_amt?: number
        other_amt?: number
        closed?: boolean
      }[]
    | null

  const settlement = settlements?.[0]
  const settlementTotal = settlement
    ? (Number(settlement.cash_amt) || 0) +
      (Number(settlement.card_amt) || 0) +
      (Number(settlement.qr_amt) || 0) +
      (Number(settlement.delivery_app_amt) || 0) +
      (Number(settlement.dine_in_delivery_amt) || 0) +
      (Number(settlement.other_amt) || 0)
    : 0

  return {
    storeCode,
    businessDate,
    systemTotal,
    settlementTotal,
    diffTotal: systemTotal - settlementTotal,
    hasSettlement: settlement != null,
    closeStatus: settlement?.closed ? 'locked' : 'draft',
  }
}
