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
  if (layer === 'bundle') return tr('salesCombinedLayerBundle', '세트 할인')
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

/** 할인 드릴다운 시트 — 유형별 설명 */
export function resolveSalesDiscountDrillExplanation(
  layer: 'bundle' | 'payment',
  kind: string,
  tr: SalesDiscountTr
): string {
  if (layer === 'payment') {
    if (kind === 'platform') {
      return tr(
        'salesDiscountDrillExplainPlatform',
        '배달앱(Grab·Shopee·Line Man 등) API·플랫폼 프로모가 discount_amt에 기록된 주문입니다. POS에서 직원이 수동 입력한 할인과는 별도이며, 세트 내재 할인(정가 대비)과도 별도 층입니다.'
      )
    }
    if (kind === 'manual') {
      return tr(
        'salesDiscountDrillExplainManual',
        'POS 결제·완료 시 직원이 수동으로 입력한 할인 주문입니다.'
      )
    }
    if (kind === 'coupon') {
      return tr(
        'salesDiscountDrillExplainCoupon',
        '회원·프로모 쿠폰이 적용된 주문입니다(coupon_discount_amt·applied_coupons).'
      )
    }
    if (kind === 'collab') {
      return tr(
        'salesDiscountDrillExplainCollab',
        '협업(브랜드·제휴) 할인 사유가 기록된 주문입니다.'
      )
    }
    return tr(
      'salesDiscountDrillExplainPaymentOther',
      '결제 시점 할인(discount_amt·쿠폰)이 있는 완료 주문입니다. 세트 내재 할인과는 별도 층입니다.'
    )
  }
  if (kind === 'set') {
    return tr(
      'salesDiscountDrillExplainBundleSet',
      '세트·프로모 메뉴 줄의 정가 대비 판매가 차이(세트 할인)가 있는 주문입니다.'
    )
  }
  if (kind === 'campaign') {
    return tr(
      'salesDiscountDrillExplainBundleCampaign',
      '캠페인 프로모 줄의 정가 대비 판매가 차이가 있는 주문입니다.'
    )
  }
  return tr(
    'salesDiscountDrillExplainBundleOther',
    '프로모 메뉴 줄의 정가 대비 판매가 차이(세트 할인)가 있는 주문입니다.'
  )
}
