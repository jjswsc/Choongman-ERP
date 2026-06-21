import { describe, expect, it } from 'vitest'
import {
  isDeliveryPlatformDiscountOrder,
  isKnownDeliveryAppCode,
  isPlatformDiscountReasonText,
  resolvePlatformDiscountReasonBackfillPatch,
  resolvePlatformDiscountReasonForSave,
} from '@/lib/pos-platform-discount-reason'

describe('resolvePlatformDiscountReasonForSave', () => {
  it('returns empty when no discount', () => {
    expect(resolvePlatformDiscountReasonForSave('grab', 0)).toBe('')
  })

  it('returns Grab label when discount exists', () => {
    expect(resolvePlatformDiscountReasonForSave('grab', 23)).toBe('Grab platform promo')
    expect(resolvePlatformDiscountReasonForSave('shopee', 10)).toBe('Shopee platform promo')
  })
})

describe('isPlatformDiscountReasonText', () => {
  it('matches API save labels', () => {
    expect(isPlatformDiscountReasonText('Grab platform promo')).toBe(true)
    expect(isPlatformDiscountReasonText('Shopee platform promo')).toBe(true)
  })
})

describe('isDeliveryPlatformDiscountOrder', () => {
  it('detects Grab delivery with discount and no reason', () => {
    expect(
      isDeliveryPlatformDiscountOrder({
        order_type: 'delivery',
        delivery_app_code: 'grab',
        discount_amt: 50,
        coupon_discount_amt: 0,
      })
    ).toBe(true)
  })

  it('ignores hall orders', () => {
    expect(
      isDeliveryPlatformDiscountOrder({
        order_type: 'dine_in',
        delivery_app_code: 'grab',
        discount_amt: 50,
      })
    ).toBe(false)
  })

  it('ignores delivery without discount', () => {
    expect(
      isDeliveryPlatformDiscountOrder({
        order_type: 'delivery',
        delivery_app_code: 'grab',
        discount_amt: 0,
      })
    ).toBe(false)
  })
})

describe('isKnownDeliveryAppCode', () => {
  it('recognizes major apps', () => {
    expect(isKnownDeliveryAppCode('grab')).toBe(true)
    expect(isKnownDeliveryAppCode('SHOPEE')).toBe(true)
    expect(isKnownDeliveryAppCode('')).toBe(false)
  })
})

describe('resolvePlatformDiscountReasonBackfillPatch', () => {
  it('returns patch when reason empty on Grab delivery order', () => {
    expect(
      resolvePlatformDiscountReasonBackfillPatch({
        order_type: 'delivery',
        delivery_app_code: 'grab',
        discount_amt: 23,
        discount_reason: '',
      })
    ).toBe('Grab platform promo')
  })

  it('skips when reason already normalized', () => {
    expect(
      resolvePlatformDiscountReasonBackfillPatch({
        order_type: 'delivery',
        delivery_app_code: 'grab',
        discount_amt: 23,
        discount_reason: 'Grab platform promo',
      })
    ).toBeNull()
  })

  it('detects Grab from memo when delivery_app_code missing', () => {
    expect(
      resolvePlatformDiscountReasonBackfillPatch({
        order_type: 'delivery',
        discount_amt: 10,
        memo: 'grab_order:GF-123',
        discount_reason: '',
      })
    ).toBe('Grab platform promo')
  })
})
