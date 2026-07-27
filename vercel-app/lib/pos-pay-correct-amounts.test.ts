import { describe, expect, it } from 'vitest'
import { computePayCorrectAmountPatch } from '@/lib/pos-pay-correct-amounts'

describe('computePayCorrectAmountPatch', () => {
  it('returns null when total unchanged', () => {
    expect(
      computePayCorrectAmountPatch({
        prevTotal: 230,
        effectiveTotal: 230,
        subtotal: 459,
        discountAmt: 229,
        couponDiscountAmt: 0,
        deliveryFee: 0,
        packagingFee: 0,
        vat: 0,
        collabDiscountAmt: 229,
      })
    ).toBeNull()
  })

  it('keeps subtotal and recalculates discount (Seacon 1→230 style)', () => {
    const patch = computePayCorrectAmountPatch({
      prevTotal: 1,
      effectiveTotal: 230,
      subtotal: 459,
      discountAmt: 458,
      couponDiscountAmt: 0,
      deliveryFee: 0,
      packagingFee: 0,
      vat: 0,
      collabDiscountAmt: 458,
    })
    expect(patch).toEqual({
      subtotal: 459,
      discountAmt: 229,
      couponDiscountAmt: 0,
      deliveryFee: 0,
      packagingFee: 0,
      vat: 0,
      collabDiscountAmt: 229,
      tierDiscountAmt: 0,
    })
  })

  it('does not inflate discount by ratio when prevTotal is tiny', () => {
    const patch = computePayCorrectAmountPatch({
      prevTotal: 1,
      effectiveTotal: 230,
      subtotal: 459,
      discountAmt: 458,
      couponDiscountAmt: 0,
      deliveryFee: 0,
      packagingFee: 0,
      vat: 0,
      collabDiscountAmt: 105_340, // already corrupted collab
    })
    expect(patch?.discountAmt).toBe(229)
    expect(patch?.collabDiscountAmt).toBe(229)
    expect(patch?.subtotal).toBe(459)
  })

  it('preserves smaller collab within new discount room', () => {
    const patch = computePayCorrectAmountPatch({
      prevTotal: 400,
      effectiveTotal: 300,
      subtotal: 500,
      discountAmt: 100,
      couponDiscountAmt: 0,
      deliveryFee: 0,
      packagingFee: 0,
      vat: 0,
      collabDiscountAmt: 80,
    })
    expect(patch?.discountAmt).toBe(200)
    expect(patch?.collabDiscountAmt).toBe(80)
  })

  it('preserves collab when coupon is separate field (not part of discount room)', () => {
    // 합계↑ → discount↓ 시, coupon을 floor에 넣으면 collab room이 0이 되던 버그 회귀 방지
    const patch = computePayCorrectAmountPatch({
      prevTotal: 200,
      effectiveTotal: 300,
      subtotal: 500,
      discountAmt: 200,
      couponDiscountAmt: 100,
      deliveryFee: 0,
      packagingFee: 0,
      vat: 0,
      collabDiscountAmt: 200,
    })
    expect(patch?.discountAmt).toBe(100)
    expect(patch?.couponDiscountAmt).toBe(100)
    expect(patch?.collabDiscountAmt).toBe(100)
  })

  it('sets discount 0 and vat residual when total exceeds undiscounted base', () => {
    const patch = computePayCorrectAmountPatch({
      prevTotal: 100,
      effectiveTotal: 120,
      subtotal: 100,
      discountAmt: 0,
      couponDiscountAmt: 0,
      deliveryFee: 0,
      packagingFee: 0,
      vat: 0,
    })
    expect(patch?.discountAmt).toBe(0)
    expect(patch?.vat).toBe(20)
    expect(patch?.subtotal).toBe(100)
  })
})
