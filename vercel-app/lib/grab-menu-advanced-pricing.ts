/**
 * Grab Service Based Menu — 배달(Grab 앱) 채널별 할인가.
 * @see GrabFood API v1.1.3 Service Based Menu (`Delivery_OnDemand_GrabApp` 등)
 */
export const GRAB_DELIVERY_ON_APP_PRICING_KEYS = [
  'Delivery_OnDemand_GrabApp',
  'Delivery_Scheduled_GrabApp',
] as const

/** 정가는 item.price, 배달 Grab 앱 주문 시 할인가는 advancedPricing (minor unit). */
export function buildGrabDeliveryAdvancedPricing(salePriceMinor: number): Record<string, number> {
  const price = Math.max(1, Math.round(salePriceMinor))
  const out: Record<string, number> = {}
  for (const key of GRAB_DELIVERY_ON_APP_PRICING_KEYS) {
    out[key] = price
  }
  return out
}
