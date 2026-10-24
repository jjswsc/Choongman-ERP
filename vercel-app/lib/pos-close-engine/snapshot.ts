import { supabaseSelectFilter } from '@/lib/supabase-server'
import { posBusinessDateYmdToUtcRange } from '@/lib/pos-business-day'
import { loadPosBusinessHoursForServer } from '@/lib/pos-business-day-server'
import { isPosPaidLikeStatus } from '@/lib/pos-order-policy'
import {
  appendSaasTenantFilter,
  type SaasTenantScope,
  LEGACY_SAAS_TENANT_SCOPE,
} from '@/lib/saas-tenant-scope'
import {
  buildPosSettlementOrdersDateFilters,
  mergeSettlementOrderRowsById,
} from '@/lib/pos-settlement-order-window'
import { shouldExcludeAdvanceFromSalesAggregate } from '@/lib/pos-deposit-domain'

export type PosCloseSnapshot = {
  storeCode: string
  businessDate: string
  systemTotal: number
  settlementTotal: number
  diffTotal: number
  hasSettlement: boolean
  closeStatus: 'locked' | 'draft'
}

/** 결산 화면·getPosSettlement과 동일 — 결제 시각(paid_at) 영업일 UTC 구간 */
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

  const { paidAtFilter, nullPaidCreatedFallbackFilter } = buildPosSettlementOrdersDateFilters(
    startISO,
    endISOExclusive,
    storeCode
  )
  const paidFilter = appendSaasTenantFilter(paidAtFilter, tenantScope, 'pos_orders')
  const nullPaidFilter = appendSaasTenantFilter(
    nullPaidCreatedFallbackFilter,
    tenantScope,
    'pos_orders'
  )

  const paidAtOrders = (await supabaseSelectFilter('pos_orders', paidFilter, {
    limit: 20000,
    select: 'id,total,status,is_advance,scheduled_at',
  })) as {
    id?: number
    total?: number
    status?: string
    is_advance?: boolean | null
    scheduled_at?: string | null
  }[] | null
  const nullPaidOrders = (await supabaseSelectFilter('pos_orders', nullPaidFilter, {
    limit: 20000,
    select: 'id,total,status,is_advance,scheduled_at',
  })) as {
    id?: number
    total?: number
    status?: string
    is_advance?: boolean | null
    scheduled_at?: string | null
  }[] | null
  const orders = mergeSettlementOrderRowsById(paidAtOrders, nullPaidOrders)

  let systemTotal = 0
  for (const o of orders) {
    if (!isPosPaidLikeStatus(String(o.status ?? ''))) continue
    if (shouldExcludeAdvanceFromSalesAggregate(o)) continue
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
