import { describe, expect, it } from 'vitest'
import { vatSplitFromTaxInvoiceGross } from '@/lib/invoice-backed-input-vat-ledger'

describe('invoice-backed-input-vat-ledger', () => {
  it('splits Thai tax-invoice gross into net and 7% VAT', () => {
    const { net, vat } = vatSplitFromTaxInvoiceGross(107)
    expect(vat).toBe(7)
    expect(net).toBe(100)
    expect(net + vat).toBe(107)
  })

  it('returns zero for zero gross', () => {
    expect(vatSplitFromTaxInvoiceGross(0)).toEqual({ net: 0, vat: 0 })
  })
})
