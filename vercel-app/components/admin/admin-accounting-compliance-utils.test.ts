import { describe, expect, it } from 'vitest'
import { mergeWhtAmountPatch, withheldFromGrossAndRate } from './admin-accounting-compliance-utils'

describe('withheldFromGrossAndRate', () => {
  it('matches PND.3 rent/service examples', () => {
    expect(withheldFromGrossAndRate('170000', '5')).toBe('8500')
    expect(withheldFromGrossAndRate('5000', '0.9')).toBe('45')
  })

  it('recalculates withheld when gross or rate changes', () => {
    const row = { gross_amount: '1000', wht_rate: '3', wht_amount: '30', payee_name: 'A' }
    expect(mergeWhtAmountPatch(row, { gross_amount: '2000' }).wht_amount).toBe('60')
    expect(mergeWhtAmountPatch(row, { wht_rate: '5' }).wht_amount).toBe('50')
    expect(mergeWhtAmountPatch(row, { wht_amount: '12' }).wht_amount).toBe('12')
  })
})
