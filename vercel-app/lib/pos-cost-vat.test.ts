import { describe, expect, it } from 'vitest'
import {
  resolvePosOrderSalesExclVat,
  resolvePosOrderVatExclFactor,
  toPosCostSalesExclVat,
} from '@/lib/pos-cost-vat'

describe('pos-cost-vat', () => {
  it('VAT 포함 금액을 7% 공급가로 환산한다', () => {
    expect(toPosCostSalesExclVat(107)).toBe(100)
    expect(toPosCostSalesExclVat(107, false)).toBe(107)
  })

  it('주문 vat 컬럼이 있으면 total−vat를 쓴다', () => {
    expect(resolvePosOrderSalesExclVat({ total: 107, vat: 7 })).toBe(100)
    expect(resolvePosOrderVatExclFactor({ total: 107, vat: 7 })).toBeCloseTo(100 / 107, 6)
  })

  it('vat가 없으면 7% 역산한다', () => {
    expect(resolvePosOrderSalesExclVat({ total: 107, vat: 0 })).toBe(100)
    expect(resolvePosOrderVatExclFactor({ total: 0, vat: 0 })).toBeCloseTo(100 / 107, 6)
  })
})
