import { describe, expect, it } from 'vitest'
import {
  manualDiscountSeedFromCheckoutSnapshot,
  resolveEffectivePosOrderDiscountAmt,
} from '@/lib/pos-existing-order-checkout-discount'

describe('resolveEffectivePosOrderDiscountAmt', () => {
  it('uses explicit discount_amt when set', () => {
    expect(
      resolveEffectivePosOrderDiscountAmt({
        snapshot: { discountAmt: 30, total: 129, subtotal: 159 },
        items: [{ price: 159, qty: 1 }],
      })
    ).toBe(30)
  })

  it('infers platform discount when discount_amt is zero but total is lower', () => {
    expect(
      resolveEffectivePosOrderDiscountAmt({
        snapshot: { discountAmt: 0, total: 129, subtotal: 159 },
        items: [{ price: 159, qty: 1 }],
      })
    ).toBe(30)
  })
})

describe('manualDiscountSeedFromCheckoutSnapshot', () => {
  it('returns amount seed for checkout modal', () => {
    const seed = manualDiscountSeedFromCheckoutSnapshot({
      snapshot: { discountAmt: 0, total: 129, subtotal: 159, discountReason: 'ShopeeFood' },
      items: [{ price: 159, qty: 1 }],
    })
    expect(seed.discountValue).toBe(30)
    expect(seed.discountReason).toBe('ShopeeFood')
  })
})
