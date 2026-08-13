import { describe, expect, it } from 'vitest'
import { buildInquiryEconomicsByPromoId } from '@/lib/pos-promo-inquiry-economics'
import { toPosCostSalesExclVat } from '@/lib/pos-cost-vat'
import type { PosPromoWithItems } from '@/lib/api-client'

const promo = {
  id: '7',
  code: 'S03',
  name: 'Set 3',
  category: 'Set',
  price: 333,
  vatIncluded: true,
  isActive: true,
  sortOrder: 1,
  items: [{ menuId: '10', quantity: 1 }],
} as PosPromoWithItems

const rows = [{ menuId: '10', optionId: null, costHall: 108.9, costDelivery: 124 }]

describe('buildInquiryEconomicsByPromoId vat view', () => {
  it('VAT 포함 보기는 판매가 그대로 분모', () => {
    const out = buildInquiryEconomicsByPromoId([promo], rows, 'included')
    expect(out['7']!.costRateHall).toBeCloseTo((108.9 / 333) * 100, 5)
  })

  it('VAT 제외 보기는 공급가 분모', () => {
    const out = buildInquiryEconomicsByPromoId([promo], rows, 'excluded')
    expect(out['7']!.costRateHall).toBeCloseTo((108.9 / toPosCostSalesExclVat(333, true)) * 100, 5)
  })
})
