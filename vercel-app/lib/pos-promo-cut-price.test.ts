import { describe, expect, it } from 'vitest'
import {
  buildPromoRegularPriceById,
  calcPromoRegularPriceForGrabCut,
  isPromoEligibleForGrabDeliveryApp,
  resolvePromoCutPrice,
} from '@/lib/pos-promo-cut-price'

describe('resolvePromoCutPrice', () => {
  it('shows cut price when regular is higher than sale', () => {
    const cut = resolvePromoCutPrice({ salePrice: 111, regularPrice: 169 })
    expect(cut.showCutPrice).toBe(true)
    expect(cut.salePrice).toBe(111)
    expect(cut.regularPrice).toBe(169)
  })

  it('hides cut price when regular is not higher', () => {
    const cut = resolvePromoCutPrice({ salePrice: 169, regularPrice: 169 })
    expect(cut.showCutPrice).toBe(false)
  })
})

describe('calcPromoRegularPriceForGrabCut', () => {
  it('uses hall component sum when higher than delivery (Grab cut price)', () => {
    const regular = calcPromoRegularPriceForGrabCut({
      items: [{ menuId: '10', optionId: null, quantity: 1 }],
      menus: [{ id: '10', price: 258, priceDelivery: 179 }],
      optionsByMenuId: {},
    })
    expect(regular).toBe(258)
    const cut = resolvePromoCutPrice({ salePrice: 179, regularPrice: regular })
    expect(cut.showCutPrice).toBe(true)
    expect(cut.regularPrice).toBe(258)
    expect(cut.salePrice).toBe(179)
  })

  it('uses delivery sum when hall is lower', () => {
    const regular = calcPromoRegularPriceForGrabCut({
      items: [{ menuId: '10', optionId: '20', quantity: 1 }],
      menus: [{ id: '10', price: 150, priceDelivery: 160 }],
      optionsByMenuId: {
        '10': [{ id: '20', priceModifier: 9, priceModifierDelivery: 9 }],
      },
    })
    expect(regular).toBe(169)
  })
})

describe('buildPromoRegularPriceById', () => {
  it('sums menu and option prices for promo lines', () => {
    const map = buildPromoRegularPriceById({
      promos: [
        {
          id: '5',
          items: [{ menuId: '10', optionId: '20', quantity: 1 }],
        },
      ],
      menus: [{ id: '10', price: 150, priceDelivery: 160 }],
      optionsByMenuId: {
        '10': [{ id: '20', priceModifier: 9, priceModifierDelivery: 9 }],
      },
      channel: 'delivery',
    })
    expect(map.get('5')).toBe(169)
  })
})

describe('isPromoEligibleForGrabDeliveryApp', () => {
  it('allows empty app list', () => {
    expect(isPromoEligibleForGrabDeliveryApp(null)).toBe(true)
    expect(isPromoEligibleForGrabDeliveryApp([])).toBe(true)
  })

  it('requires grab when apps are restricted', () => {
    expect(isPromoEligibleForGrabDeliveryApp(['grab'])).toBe(true)
    expect(isPromoEligibleForGrabDeliveryApp(['lineman'])).toBe(false)
  })
})
