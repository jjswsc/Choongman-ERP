import { describe, expect, it } from 'vitest'
import { selectTaxInvoiceHiresRegions, TAX_INV_HIRES_REGIONS } from './purchase-tax-invoice-hires-client'

describe('selectTaxInvoiceHiresRegions', () => {
  it('keeps all regions when the list is empty', () => {
    expect(selectTaxInvoiceHiresRegions()).toEqual(TAX_INV_HIRES_REGIONS)
    expect(selectTaxInvoiceHiresRegions([])).toEqual(TAX_INV_HIRES_REGIONS)
  })

  it('returns only the requested regions', () => {
    expect(selectTaxInvoiceHiresRegions(['tail']).map((r) => r.name)).toEqual(['tail'])
    expect(selectTaxInvoiceHiresRegions(['head-left', 'head-right']).map((r) => r.name)).toEqual([
      'head-left',
      'head-right',
    ])
  })
})
