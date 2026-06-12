import { describe, expect, it } from 'vitest'
import { resolvePosPromoSalesKind } from '@/lib/pos-promo-sales-kind'

describe('resolvePosPromoSalesKind', () => {
  it('classifies campaign-linked promos', () => {
    expect(resolvePosPromoSalesKind({ marketingCampaignId: 12, promoCode: 'X-S01' })).toBe(
      'campaign'
    )
  })

  it('classifies standalone menu sets', () => {
    expect(resolvePosPromoSalesKind({ promoCode: 'SET-3' })).toBe('set')
  })

  it('classifies campaign-style codes without id as campaign', () => {
    expect(resolvePosPromoSalesKind({ promoCode: 'FEST-S02' })).toBe('campaign')
  })
})
