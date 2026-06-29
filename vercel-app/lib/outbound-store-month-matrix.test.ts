import { describe, expect, it } from 'vitest'
import { thaiInvoiceTotalsFromRawSubtotal } from '@/lib/invoice-vat-total'
import {
  parseOutboundMatrixMonth,
  parseOutboundMatrixYear,
} from '@/lib/outbound-store-month-matrix'

describe('parseOutboundMatrixYear', () => {
  it('accepts valid years', () => {
    expect(parseOutboundMatrixYear('2025')).toBe(2025)
    expect(parseOutboundMatrixYear(2024)).toBe(2024)
  })

  it('rejects invalid years', () => {
    expect(parseOutboundMatrixYear('')).toBeNull()
    expect(parseOutboundMatrixYear('1999')).toBeNull()
    expect(parseOutboundMatrixYear('abc')).toBeNull()
  })
})

describe('parseOutboundMatrixMonth', () => {
  it('accepts 1–12 and all/empty as null', () => {
    expect(parseOutboundMatrixMonth('6')).toBe(6)
    expect(parseOutboundMatrixMonth(12)).toBe(12)
    expect(parseOutboundMatrixMonth('all')).toBeNull()
    expect(parseOutboundMatrixMonth('')).toBeNull()
  })

  it('rejects invalid months', () => {
    expect(parseOutboundMatrixMonth('0')).toBeNull()
    expect(parseOutboundMatrixMonth('13')).toBeNull()
  })
})

describe('matrix VAT cell rounding', () => {
  it('applies Thai VAT rounding on subtotal', () => {
    const c = thaiInvoiceTotalsFromRawSubtotal(1000)
    expect(c.subtotalRounded).toBe(1000)
    expect(c.vatRounded).toBe(70)
    expect(c.grandTotal).toBe(1070)
  })
})
