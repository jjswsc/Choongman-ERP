import { describe, expect, it } from 'vitest'
import { thaiInvoiceTotalsFromRawSubtotal } from '@/lib/invoice-vat-total'

function parseOutboundMatrixYear(raw: string | number | null | undefined): number | null {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim())
  if (!Number.isFinite(n) || n < 2000 || n > 2100) return null
  return Math.floor(n)
}

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

describe('matrix VAT cell rounding', () => {
  it('applies Thai VAT rounding on subtotal', () => {
    const c = thaiInvoiceTotalsFromRawSubtotal(1000)
    expect(c.subtotalRounded).toBe(1000)
    expect(c.vatRounded).toBe(70)
    expect(c.grandTotal).toBe(1070)
  })
})
