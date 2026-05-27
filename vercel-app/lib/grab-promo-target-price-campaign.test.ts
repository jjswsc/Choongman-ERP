import { describe, expect, it } from 'vitest'
import {
  buildGrabPromoCampaignName,
  buildGrabTargetPriceCampaignBody,
} from '@/lib/grab-promo-target-price-campaign'

describe('buildGrabTargetPriceCampaignBody', () => {
  it('uses fixPrice discount scoped to grab item id', () => {
    const body = buildGrabTargetPriceCampaignBody({
      merchantID: 'GF-TEST',
      promoId: 12,
      promoName: 'April Set 1',
      grabItemId: 'item-99-set1',
      salePriceMajor: 111,
      validFrom: '2026-05-01',
      validTo: '2026-12-31',
    })
    expect(body.merchantID).toBe('GF-TEST')
    expect((body.discount as { type?: string }).type).toBe('fixPrice')
    expect((body.discount as { value?: number }).value).toBe(111)
    expect((body.discount as { scope?: { objectIDs?: string[] } }).scope?.objectIDs).toEqual([
      'item-99-set1',
    ])
    expect(String(body.name)).toContain(buildGrabPromoCampaignName(12))
  })
})
