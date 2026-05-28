import { describe, expect, it } from 'vitest'
import {
  buildGrabPromoCampaignName,
  buildGrabTargetPriceCampaignBody,
  classifyGrabCampaignApiError,
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
    expect(body.quotas).toEqual({ totalCount: 9999, totalCountPerUser: 99 })
    expect(body.customTag).toBeUndefined()
    expect(String(body.name)).toContain(buildGrabPromoCampaignName(12))

    const conditions = body.conditions as { startTime?: string; endTime?: string }
    const startMs = new Date(String(conditions.startTime)).getTime()
    const endMs = new Date(String(conditions.endTime)).getTime()
    expect(endMs - startMs).toBeGreaterThanOrEqual(2 * 60 * 60_000)
    expect(endMs - startMs).toBeLessThanOrEqual(62 * 24 * 60 * 60_000 + 1000)
  })
})

describe('classifyGrabCampaignApiError', () => {
  it('classifies items-not-found errors', () => {
    const err = new Error('Grab API error: 400 {"message":"items not found"}')
    expect(classifyGrabCampaignApiError(err)).toBe('ITEMS_NOT_FOUND')
  })

  it('classifies start-time-too-close errors', () => {
    const err = new Error(
      'Grab API error: 400 {"message":"CAMPAIGN_START_TIME_TOO_CLOSE_TO_NOW:failed to create MFC:"}'
    )
    expect(classifyGrabCampaignApiError(err)).toBe('START_TIME_INVALID')
  })
})
