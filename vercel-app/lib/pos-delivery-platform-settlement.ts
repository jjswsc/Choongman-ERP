import {
  defaultPlatformSettlementFeePct,
  normalizeDeliveryAppFeePercent,
} from '@/lib/cost-data'
import type { DeliveryAppCode } from '@/lib/pos-delivery-policy'
import type { PosChannelSettlementChannel } from '@/lib/pos-channel-settlement'
import { roundSettlementMoney } from '@/lib/pos-channel-settlement'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 채널 정산 UI 채널 → 배달앱 코드 (카드는 null) */
export function deliveryAppCodeForSettlementChannel(
  channel: PosChannelSettlementChannel
): DeliveryAppCode | null {
  if (channel === 'grab') return 'grab'
  if (channel === 'lineman') return 'lineman'
  if (channel === 'shopee') return 'shopee'
  return null
}

export async function fetchDeliveryPlatformSettlementFeePct(params: {
  storeCode: string
  appCode: DeliveryAppCode
}): Promise<{ pct: number; source: 'policy' | 'default' }> {
  const storeCode = String(params.storeCode || '').trim()
  const appCode = params.appCode
  if (!storeCode) {
    return { pct: defaultPlatformSettlementFeePct(appCode), source: 'default' }
  }
  try {
    const rows = (await supabaseSelectFilter(
      'pos_delivery_app_policies',
      `store_code=eq.${encodeURIComponent(storeCode)}&app_code=eq.${encodeURIComponent(appCode)}`,
      { limit: 1, select: 'settlement_fee_pct' }
    )) as { settlement_fee_pct?: number | null }[] | null
    const raw = rows?.[0]?.settlement_fee_pct
    if (raw != null && Number.isFinite(Number(raw))) {
      return { pct: normalizeDeliveryAppFeePercent(raw), source: 'policy' }
    }
  } catch {
    /* column 미배포 시 기본값 */
  }
  return { pct: defaultPlatformSettlementFeePct(appCode), source: 'default' }
}

function feeMapKey(storeCode: string, appCode: string): string {
  return `${String(storeCode || '').trim()}\t${String(appCode || '').trim().toLowerCase()}`
}

/**
 * 매장×앱 정산 수수료% 일괄 조회. 없으면 호출측에서 앱 기본값을 씀.
 */
export async function fetchDeliveryPlatformSettlementFeePctMap(storeCodes: string[]): Promise<
  Map<string, { pct: number; source: 'policy' }>
> {
  const map = new Map<string, { pct: number; source: 'policy' }>()
  const unique = [...new Set(storeCodes.map((s) => String(s || '').trim()).filter(Boolean))]
  const filter =
    unique.length > 0
      ? `store_code=in.(${unique.map((c) => encodeURIComponent(c)).join(',')})`
      : ''
  try {
    const rows = (await supabaseSelectFilter('pos_delivery_app_policies', filter, {
      limit: 5000,
      select: 'store_code,app_code,settlement_fee_pct',
    })) as { store_code?: string; app_code?: string; settlement_fee_pct?: number | null }[] | null
    for (const r of rows || []) {
      const store = String(r.store_code ?? '').trim()
      const app = String(r.app_code ?? '').trim().toLowerCase()
      if (!store || !app) continue
      if (r.settlement_fee_pct == null || !Number.isFinite(Number(r.settlement_fee_pct))) continue
      map.set(feeMapKey(store, app), {
        pct: normalizeDeliveryAppFeePercent(r.settlement_fee_pct),
        source: 'policy',
      })
    }
  } catch {
    /* column 미배포 시 빈 맵 */
  }
  return map
}

export function lookupDeliveryPlatformSettlementFeePct(
  map: Map<string, { pct: number; source: 'policy' }>,
  storeCode: string,
  appCode: string
): { pct: number; source: 'policy' } | null {
  return map.get(feeMapKey(storeCode, appCode)) ?? null
}

/**
 * 플랫폼이 매출에서 차감하는 수수료(익일 NET = GROSS - FEE).
 * 본사→가맹 PO 배달 GP(po_billing_settings)와 별도.
 */
export function suggestedPlatformSettlementFee(params: {
  channel: PosChannelSettlementChannel
  gross: number
  feePct: number
}): number | null {
  const gross = roundSettlementMoney(params.gross)
  if (gross <= 0) return null
  const app = deliveryAppCodeForSettlementChannel(params.channel)
  if (!app) return null
  const pct = normalizeDeliveryAppFeePercent(params.feePct)
  if (pct <= 0) return null
  return roundSettlementMoney((gross * pct) / 100)
}
