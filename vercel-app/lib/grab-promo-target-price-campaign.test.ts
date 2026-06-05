import { describe, expect, it } from 'vitest'
import {
  buildGrabCampaignDiscountForTarget,
  buildGrabPromoCampaignName,
  buildGrabTargetPriceCampaignBody,
  buildPutBodyForExistingGrabCampaign,
  calcGrabPercentageOffMajor,
  grabConsumerPriceFromPercentageMajor,
  grabPercentageDiscountMatchesSale,
  classifyGrabCampaignApiError,
  grabCampaignDiscountMatchesTarget,
  grabCampaignNeedsDiscountTypeMigration,
  grabCampaignNeedsFixPriceRoundingMigration,
  isGrabPromoConsumerListPriceAsSaleEnabled,
  resolveGrabCampaignScheduleMs,
  resolveGrabMenuSalePriceMajor,
  resolveGrabPromoMenuItemPriceMinor,
  shouldOmitGrabPromoAdvancedPricingForMenu,
  shouldSendGrabPromoSaleAdvancedPricing,
  shouldSuppressGrabPromoCampaignsForConsumerSale,
} from '@/lib/grab-promo-target-price-campaign'

describe('resolveGrabMenuSalePriceMajor', () => {
  it('prefers menu price_delivery (ERP 배달앱 칸) over promo master', () => {
    expect(
      resolveGrabMenuSalePriceMajor({
        menuPriceDelivery: 111,
        menuPrice: 0,
        promoCut: { salePrice: 179, showCutPrice: true },
      })
    ).toBe(111)
  })
})

describe('calcGrabPercentageOffMajor', () => {
  it('computes percent off for 179 -> 111', () => {
    expect(calcGrabPercentageOffMajor(179, 111)).toBe(38)
  })

  it('189 -> 111 percentage rounds to 112 on Grab (1 baht off)', () => {
    const pct = calcGrabPercentageOffMajor(189, 111)
    expect(pct).toBe(41)
    expect(grabConsumerPriceFromPercentageMajor(189, pct)).toBe(112)
    expect(grabPercentageDiscountMatchesSale(189, 111, pct)).toBe(false)
  })
})

describe('consumer list price mode', () => {
  const envKeys = [
    'GRAB_PROMO_CONSUMER_LIST_PRICE',
    'GRAB_PROMO_CONSUMER_SALE_VIA_ADVANCED',
    'GRAB_PROMO_CAMPAIGN_DISCOUNT_TYPE',
    'GRAB_PROMO_SUPPRESS_CAMPAIGNS_FOR_CONSUMER_SALE',
  ] as const

  function saveEnv(): Record<string, string | undefined> {
    const snap: Record<string, string | undefined> = {}
    for (const k of envKeys) snap[k] = process.env[k]
    return snap
  }

  function restoreEnv(snap: Record<string, string | undefined>) {
    for (const k of envKeys) {
      if (snap[k] === undefined) delete process.env[k]
      else process.env[k] = snap[k]
    }
  }

  it('defaults to item.price=sale and fixPrice campaigns', () => {
    const snap = saveEnv()
    for (const k of envKeys) delete process.env[k]
    expect(isGrabPromoConsumerListPriceAsSaleEnabled()).toBe(true)
    expect(
      resolveGrabPromoMenuItemPriceMinor({
        showCutPrice: true,
        regularMinor: 17900,
        saleMinor: 11100,
      })
    ).toBe(11100)
    expect(shouldSendGrabPromoSaleAdvancedPricing(true)).toBe(true)
    expect(shouldSuppressGrabPromoCampaignsForConsumerSale()).toBe(true)
    expect(buildGrabCampaignDiscountForTarget({
      grabItemId: 'item-1',
      salePriceMajor: 111,
      regularPriceMajor: 179,
    }).type).toBe('fixPrice')
    restoreEnv(snap)
  })

  it('regular list + no advanced when CM-POS-PROMO percentage campaigns enabled', () => {
    const snap = saveEnv()
    process.env.GRAB_PROMO_CONSUMER_LIST_PRICE = 'regular'
    process.env.GRAB_PROMO_SUPPRESS_CAMPAIGNS_FOR_CONSUMER_SALE = '0'
    process.env.GRAB_PROMO_CAMPAIGN_DISCOUNT_TYPE = 'percentage'
    expect(
      resolveGrabPromoMenuItemPriceMinor({
        showCutPrice: true,
        regularMinor: 17900,
        saleMinor: 11100,
      })
    ).toBe(17900)
    expect(shouldSendGrabPromoSaleAdvancedPricing(true)).toBe(false)
    restoreEnv(snap)
  })

  it('regular list + fixPrice campaigns omit advanced (campaign strikethrough)', () => {
    const snap = saveEnv()
    process.env.GRAB_PROMO_CONSUMER_LIST_PRICE = 'regular'
    process.env.GRAB_PROMO_SUPPRESS_CAMPAIGNS_FOR_CONSUMER_SALE = '0'
    process.env.GRAB_PROMO_CAMPAIGN_DISCOUNT_TYPE = 'fixPrice'
    expect(shouldOmitGrabPromoAdvancedPricingForMenu(true)).toBe(true)
    expect(shouldSendGrabPromoSaleAdvancedPricing(true)).toBe(false)
    restoreEnv(snap)
  })

  it('regular list never sends advanced (정가+캠페인이 할인 담당)', () => {
    const snap = saveEnv()
    process.env.GRAB_PROMO_CONSUMER_LIST_PRICE = 'regular'
    process.env.GRAB_PROMO_SUPPRESS_CAMPAIGNS_FOR_CONSUMER_SALE = '1'
    expect(shouldSendGrabPromoSaleAdvancedPricing(true)).toBe(false)
    restoreEnv(snap)
  })
})

describe('buildGrabCampaignDiscountForTarget', () => {
  it('uses percentage when list price is regular (explicit campaign type)', () => {
    const snap = process.env.GRAB_PROMO_CAMPAIGN_DISCOUNT_TYPE
    const snapList = process.env.GRAB_PROMO_CONSUMER_LIST_PRICE
    process.env.GRAB_PROMO_CONSUMER_LIST_PRICE = 'regular'
    process.env.GRAB_PROMO_CAMPAIGN_DISCOUNT_TYPE = 'percentage'
    const d = buildGrabCampaignDiscountForTarget({
      grabItemId: 'item-1',
      salePriceMajor: 111,
      regularPriceMajor: 179,
    })
    expect(d.type).toBe('percentage')
    if (snap === undefined) delete process.env.GRAB_PROMO_CAMPAIGN_DISCOUNT_TYPE
    else process.env.GRAB_PROMO_CAMPAIGN_DISCOUNT_TYPE = snap
    if (snapList === undefined) delete process.env.GRAB_PROMO_CONSUMER_LIST_PRICE
    else process.env.GRAB_PROMO_CONSUMER_LIST_PRICE = snapList
    expect(d.value).toBe(38)
    expect((d as { cap?: number }).cap).toBe(0)
  })

  it('uses fixPrice when requested', () => {
    const d = buildGrabCampaignDiscountForTarget({
      grabItemId: 'item-1',
      salePriceMajor: 111,
      regularPriceMajor: 179,
      discountType: 'fixPrice',
    })
    expect(d.type).toBe('fixPrice')
    expect(d.value).toBe(111)
  })

  it('uses percentage when requested', () => {
    const d = buildGrabCampaignDiscountForTarget({
      grabItemId: 'item-1',
      salePriceMajor: 111,
      regularPriceMajor: 179,
      discountType: 'percentage',
    })
    expect(d.type).toBe('percentage')
    expect(d.value).toBe(38)
  })

  it('falls back to fixPrice when percentage would be 1 baht off (189 -> 111)', () => {
    const d = buildGrabCampaignDiscountForTarget({
      grabItemId: 'item-2',
      salePriceMajor: 111,
      regularPriceMajor: 189,
      discountType: 'percentage',
    })
    expect(d.type).toBe('fixPrice')
    expect(d.value).toBe(111)
  })
})

describe('grabCampaignNeedsFixPriceRoundingMigration', () => {
  it('detects percentage on Grab when ERP needs fixPrice 111', () => {
    process.env.GRAB_PROMO_CONSUMER_LIST_PRICE = 'regular'
    process.env.GRAB_PROMO_CAMPAIGN_DISCOUNT_TYPE = 'percentage'
    expect(
      grabCampaignNeedsFixPriceRoundingMigration(
        {
          discount: { type: 'percentage', value: 41, scope: { objectIDs: ['item-2'] } },
        },
        {
          grabItemId: 'item-2',
          salePriceMajor: 111,
          regularPriceMajor: 189,
          discountType: 'percentage',
        }
      )
    ).toBe(true)
    delete process.env.GRAB_PROMO_CONSUMER_LIST_PRICE
    delete process.env.GRAB_PROMO_CAMPAIGN_DISCOUNT_TYPE
  })
})

describe('buildGrabTargetPriceCampaignBody', () => {
  it('uses fixPrice discount scoped to grab item id', () => {
    const body = buildGrabTargetPriceCampaignBody({
      merchantID: 'GF-TEST',
      promoId: 12,
      promoName: 'April Set 1',
      grabItemId: 'item-99-set1',
      salePriceMajor: 111,
      regularPriceMajor: 179,
      validFrom: '2026-05-01',
      validTo: '2026-12-31',
      discountType: 'fixPrice',
    })
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
  it('returns true when percentage and item id match', () => {
    expect(
      grabCampaignDiscountMatchesTarget(
        {
          discount: { type: 'percentage', value: 38, scope: { objectIDs: ['item-99'] } },
        },
        {
          grabItemId: 'item-99',
          salePriceMajor: 111,
          regularPriceMajor: 179,
          discountType: 'percentage',
        }
      )
    ).toBe(true)
  })

  it('returns false when percentage rounds 1 baht off (189 -> 111 at 41%)', () => {
    process.env.GRAB_PROMO_CONSUMER_LIST_PRICE = 'regular'
    process.env.GRAB_PROMO_CAMPAIGN_DISCOUNT_TYPE = 'percentage'
    expect(
      grabCampaignDiscountMatchesTarget(
        {
          discount: { type: 'percentage', value: 41, scope: { objectIDs: ['item-99'] } },
        },
        {
          grabItemId: 'item-99',
          salePriceMajor: 111,
          regularPriceMajor: 189,
          discountType: 'percentage',
        }
      )
    ).toBe(false)
    delete process.env.GRAB_PROMO_CONSUMER_LIST_PRICE
    delete process.env.GRAB_PROMO_CAMPAIGN_DISCOUNT_TYPE
  })

  it('returns false when old fixPrice campaign still on Grab', () => {
    expect(
      grabCampaignDiscountMatchesTarget(
        {
          discount: { type: 'fixPrice', value: 111, scope: { objectIDs: ['item-99'] } },
        },
        {
          grabItemId: 'item-99',
          salePriceMajor: 111,
          regularPriceMajor: 179,
          discountType: 'percentage',
        }
      )
    ).toBe(false)
  })

  it('returns false when discount value differs', () => {
    expect(
      grabCampaignDiscountMatchesTarget(
        {
          discount: { type: 'percentage', value: 30, scope: { objectIDs: ['item-99'] } },
        },
        {
          grabItemId: 'item-99',
          salePriceMajor: 111,
          regularPriceMajor: 179,
          discountType: 'percentage',
        }
      )
    ).toBe(false)
  })
})

describe('buildPutBodyForExistingGrabCampaign', () => {
  it('strips startTime for ongoing campaigns', () => {
    const fresh = buildGrabTargetPriceCampaignBody({
      merchantID: 'GF-1',
      promoId: 1,
      promoName: 'Set',
      grabItemId: 'item-1',
      salePriceMajor: 111,
      regularPriceMajor: 179,
      discountType: 'percentage',
    })
    const out = buildPutBodyForExistingGrabCampaign(
      fresh,
      {
        conditions: {
          startTime: '2026-06-01T11:00:00.000Z',
          endTime: '2026-07-30T11:00:00.000Z',
        },
      },
      'ongoing'
    )
    const cond = out.conditions as Record<string, unknown>
    expect(cond.startTime).toBeUndefined()
    expect(cond.endTime).toBeUndefined()
    expect((out.discount as { type?: string }).type).toBe('percentage')
  })
})

describe('grabCampaignNeedsDiscountTypeMigration', () => {
  it('detects fixPrice on Grab when percentage is expected', () => {
    expect(
      grabCampaignNeedsDiscountTypeMigration({
        discount: { type: 'fixPrice', value: 111, scope: { objectIDs: ['item-99'] } },
      })
    ).toBe(true)
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
      startLeadMinutes: 5,
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

  it('uses grab campaign start time BKK on valid_from day', () => {
    const nowMs = new Date('2026-06-04T03:00:00.000Z').getTime()
    const { startMs } = resolveGrabCampaignScheduleMs({
      validFrom: '2026-06-04',
      validTo: '2026-12-31',
      grabCampaignStartTimeBkk: '12:00',
      startLeadMinutes: 5,
      nowMs,
    })
    expect(startMs).toBe(new Date('2026-06-04T05:00:00.000Z').getTime())
  })

  it('uses grab campaign end time BKK on valid_to day', () => {
    const nowMs = new Date('2026-06-04T03:00:00.000Z').getTime()
    const { endMs } = resolveGrabCampaignScheduleMs({
      validFrom: '2026-06-04',
      validTo: '2026-06-30',
      grabCampaignEndTimeBkk: '22:00',
      startLeadMinutes: 5,
      nowMs,
    })
    expect(endMs).toBe(new Date('2026-06-30T15:00:00.000Z').getTime())
  })
})

describe('classifyGrabCampaignApiError', () => {
  it('classifies items-not-found errors', () => {
    const err = new Error('Grab API error: 400 {"message":"items not found"}')
    expect(classifyGrabCampaignApiError(err)).toBe('ITEMS_NOT_FOUND')
  })

  it('classifies start-time-too-close errors', () => {
    expect(
      classifyGrabCampaignApiError(
        new Error(
          'Grab API error: 400 {"message":"CAMPAIGN_START_TIME_TOO_CLOSE_TO_NOW:failed to create MFC:"}'
        )
      )
    ).toBe('START_TIME_INVALID')
    expect(
      classifyGrabCampaignApiError(
        new Error('campaign start time too close for now | invalid_argument')
      )
    ).toBe('START_TIME_INVALID')
  })
})
