import { describe, expect, it } from 'vitest'
import {
  buildGrabPromoCampaignName,
  buildGrabTargetPriceCampaignBody,
  classifyGrabCampaignApiError,
  grabCampaignDiscountMatchesTarget,
  resolveGrabCampaignScheduleMs,
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
    expect(endMs - startMs).toBeLessThanOrEqual(59 * 24 * 60 * 60_000 + 1000)
  })
})

describe('grabCampaignDiscountMatchesTarget', () => {
  it('returns true when fixPrice and item id match', () => {
    expect(
      grabCampaignDiscountMatchesTarget(
        {
          discount: { type: 'fixPrice', value: 258, scope: { objectIDs: ['item-356-260457-s03'] } },
        },
        { grabItemId: 'item-356-260457-s03', salePriceMajor: 258 }
      )
    ).toBe(true)
  })

  it('returns false when sale price differs', () => {
    expect(
      grabCampaignDiscountMatchesTarget(
        {
          discount: { type: 'fixPrice', value: 111, scope: { objectIDs: ['item-99'] } },
        },
        { grabItemId: 'item-99', salePriceMajor: 258 }
      )
    ).toBe(false)
  })
})

describe('resolveGrabCampaignScheduleMs', () => {
  it('starts today when valid_from is tomorrow and clampValidFromToToday', () => {
    const nowMs = new Date('2026-06-01T08:00:00.000Z').getTime()
    const { startMs, fromYmd } = resolveGrabCampaignScheduleMs({
      validFrom: '2026-06-02',
      validTo: '2026-12-31',
      startLeadMinutes: 5,
      nowMs,
      clampValidFromToToday: true,
    })
    expect(fromYmd).toBe('2026-06-01')
    expect(startMs).toBe(nowMs + 5 * 60_000)
  })

  it('starts tomorrow when valid_from is tomorrow without clamp', () => {
    const nowMs = new Date('2026-06-01T08:00:00.000Z').getTime()
    const { startMs, fromYmd } = resolveGrabCampaignScheduleMs({
      validFrom: '2026-06-02',
      validTo: '2026-12-31',
      startLeadMinutes: 65,
      nowMs,
    })
    expect(fromYmd).toBe('2026-06-02')
    expect(startMs).toBeGreaterThanOrEqual(new Date('2026-06-02T00:00:00.000+07:00').getTime() - 1000)
  })

  it('uses now+lead when valid_from is today', () => {
    const nowMs = new Date('2026-06-01T08:00:00.000Z').getTime()
    const { startMs } = resolveGrabCampaignScheduleMs({
      validFrom: '2026-06-01',
      validTo: '2026-12-31',
      startLeadMinutes: 10,
      nowMs,
    })
    expect(startMs).toBe(nowMs + 10 * 60_000)
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
