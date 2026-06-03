import { describe, expect, it } from 'vitest'
import {
  buildItemScopePayload,
  formatCouponItemScopeSummary,
  itemScopeFromCoupon,
} from '@/lib/crm-coupon-item-scope'

describe('crm-coupon-item-scope', () => {
  it('round-trips coupon item scope', () => {
    const scope = itemScopeFromCoupon({
      code: 'A',
      discountType: 'fixed',
      discountValue: 10,
      itemScope: { menuIds: ['12', '34'], categoryCodes: ['CHICKEN'] },
    })
    expect(scope.menuIds).toEqual(['12', '34'])
    expect(scope.categoryCodes).toEqual(['CHICKEN'])
    expect(buildItemScopePayload(scope)).toEqual({
      menuIds: ['12', '34'],
      categoryCodes: ['CHICKEN'],
    })
  })

  it('summarizes scope labels', () => {
    expect(formatCouponItemScopeSummary({ menuIds: [], categoryCodes: [] })).toBe('전체 메뉴')
    expect(
      formatCouponItemScopeSummary(
        { menuIds: ['1'], categoryCodes: ['DRINK'] },
        new Map([['1', { id: '1', code: 'D1', name: '콜라', category: '', price: 0, imageUrl: '', vatIncluded: true, isActive: true, sortOrder: 0 }]])
      )
    ).toContain('콜라')
  })
})
