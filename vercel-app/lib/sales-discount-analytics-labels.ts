/** 매출 할인 분석 — kind·layer 라벨 (i18n) */
export type SalesDiscountTr = (key: string, fallback: string) => string

export function promoKindLabel(kind: string, tr: SalesDiscountTr): string {
  if (kind === 'set') return tr('salesPromoKindSet', '메뉴 세트')
  if (kind === 'campaign') return tr('salesPromoKindCampaign', '캠페인 프로모')
  return tr('salesPromoKindOther', '기타')
}

export function paymentKindLabel(kind: string, tr: SalesDiscountTr): string {
  if (kind === 'manual') return tr('salesPaymentDiscountKindManual', '수동 할인')
  if (kind === 'collab') return tr('salesPaymentDiscountKindCollab', '협업 할인')
  if (kind === 'coupon') return tr('salesPaymentDiscountKindCoupon', '쿠폰')
  if (kind === 'platform') return tr('salesPaymentDiscountKindPlatform', '배달·플랫폼')
  return tr('salesPaymentDiscountKindOther', '기타')
}

export function combinedLayerLabel(layer: string, tr: SalesDiscountTr): string {
  if (layer === 'bundle') return tr('salesCombinedLayerBundle', '세트·프로모')
  return tr('salesCombinedLayerPayment', '결제 할인')
}

export function combinedKindLabel(
  row: { layer: string; kind: string; label?: string },
  tr: SalesDiscountTr
): string {
  if (row.layer === 'bundle') return promoKindLabel(row.kind, tr)
  return paymentKindLabel(row.kind, tr)
}

export function paymentDiscountRowLabel(
  row: { kind: string; label?: string },
  tr: SalesDiscountTr
): string {
  const custom = String(row.label ?? '').trim()
  if (custom) return custom
  return paymentKindLabel(row.kind, tr)
}
