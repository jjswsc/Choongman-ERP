import { describe, expect, it } from 'vitest'
import { resolvePayableVendorCodeForMarketing } from './marketing-expense-accrual-sync'

describe('marketing expense accrual vendor fallback', () => {
  it('uses explicit vendor when provided', () => {
    expect(resolvePayableVendorCodeForMarketing('V001', 'mkt_material_1')).toBe('V001')
  })

  it('falls back to marketing payee code when vendor is empty', () => {
    expect(resolvePayableVendorCodeForMarketing('', 'mkt_material_1749')).toBe('mkt_material_1749')
  })
})
