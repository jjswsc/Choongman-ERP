import type { PosDeliveryApp } from '@/lib/api-client'
import { DEFAULT_DELIVERY_KEYS } from '@/lib/pos-payment-default-keys'

/** 결산 JSON·매출 집계와 맞추기 위한 고정 키 (POS delivery_payment_channel === dine_in) */
export const POS_SETTLEMENT_DINE_IN_CODE = 'dine_in'

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

/** 결제 관리/배달앱 설정 이름이 매장 Dine in 채널인지 */
export function deliverySettlementKeyIsDineIn(key: string, apps: PosDeliveryApp[]): boolean {
  const k = key.trim()
  if (!k) return false
  if (norm(k) === 'dinein' || norm(k) === POS_SETTLEMENT_DINE_IN_CODE) return true
  for (const a of apps) {
    if (a.code === POS_SETTLEMENT_DINE_IN_CODE) {
      if (a.name === k || a.name.trim().toLowerCase() === k.toLowerCase()) return true
    }
  }
  return false
}

/**
 * 결산 입력: 배달 플랫폼(Grab 등) vs 매장 홀에서 배달앱 탭(Dine in) 분리.
 * apps가 비어 있으면 이름 휴리스틱만 사용.
 */
export function splitDeliveryKeysForSettlement(
  deliveryKeys: string[],
  apps: PosDeliveryApp[]
): { platformKeys: string[]; dineInKeys: string[] } {
  const platform: string[] = []
  const dineIn: string[] = []
  for (const key of deliveryKeys) {
    if (deliverySettlementKeyIsDineIn(key, apps)) dineIn.push(key)
    else platform.push(key)
  }
  if (dineIn.length === 0) {
    dineIn.push(POS_SETTLEMENT_DINE_IN_CODE)
  }
  return { platformKeys: platform, dineInKeys: dineIn }
}

/** 결산 폼·loadData에서 동일하게 쓰는 플랫폼 / Dine in 키 목록 */
export function computeSettlementDeliveryKeys(
  deliveryAppKeys: string[],
  apps: PosDeliveryApp[]
): { platformKeys: string[]; dineInKeys: string[] } {
  const keys = deliveryAppKeys.length > 0 ? deliveryAppKeys : [...DEFAULT_DELIVERY_KEYS]
  const s = splitDeliveryKeysForSettlement(keys, apps)
  const platform =
    s.platformKeys.length > 0
      ? s.platformKeys
      : DEFAULT_DELIVERY_KEYS.filter((k) => !deliverySettlementKeyIsDineIn(k, apps))
  return { platformKeys: platform, dineInKeys: s.dineInKeys }
}
