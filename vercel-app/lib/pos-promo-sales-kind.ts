/** 매출 리포트 — 세트(메뉴관리) vs 마케팅 캠페인 vs 배달앱 플랫폼 프로모 */
export type PosPromoSalesKind = 'set' | 'campaign' | 'platform' | 'other'

export function resolvePosPromoSalesKind(params: {
  marketingCampaignId?: string | number | null
  promoCode?: string
}): PosPromoSalesKind {
  const campaignId = String(params.marketingCampaignId ?? '').trim()
  if (campaignId) return 'campaign'

  const code = String(params.promoCode ?? '').trim().toUpperCase()
  if (!code) return 'other'
  if (/^SET-\d+$/i.test(code)) return 'set'
  /** 캠페인 프로모 코드 패턴 ({base}-S01). 캠페인 id가 없어도 프로모로 분류 */
  if (/-S\d+$/i.test(code)) return 'campaign'
  return 'other'
}
