import { describe, expect, it } from 'vitest'
import {
  digitSequencesFromExpenseFileName,
  parseQuoteAmountFromText,
} from '@/lib/interior-quote-amount-parse'
import { parseExpenseDocumentFromText } from '@/lib/expense-document-parse'

describe('parseQuoteAmountFromText — document number vs amount', () => {
  it('does not treat QO document number as total amount', () => {
    const text = `
ใบเสนอราคา
Quotation No. QO260800139
รายการ Oven cost
ยอดรวม 26,080.00
รวมทั้งสิ้น 26,080.00
`
    const parsed = parseQuoteAmountFromText(text, {
      excludeDigitSequences: digitSequencesFromExpenseFileName('QO260800139.pdf'),
    })
    expect(parsed?.amount).toBe(26080)
    expect(parsed?.method).toBe('keyword')
  })

  it('excludes filename digits even when they are the largest number', () => {
    const text = `
Invoice QO260800139
Amount due 15,500.00
`
    const parsed = parseQuoteAmountFromText(text, {
      excludeDigitSequences: ['260800139'],
    })
    expect(parsed?.amount).toBe(15500)
  })

  it('does not fall back to max of bare document id integers', () => {
    const text = `
Document QO260800139
Some note Oven cost
`
    const parsed = parseQuoteAmountFromText(text, {
      excludeDigitSequences: digitSequencesFromExpenseFileName('QO260800139.pdf'),
    })
    expect(parsed).toBeNull()
  })

  it('prefers money-like total on keyword line over larger id on same line', () => {
    const text = `ยอดรวม Invoice 260800139 Total 8,990.00`
    const parsed = parseQuoteAmountFromText(text)
    expect(parsed?.amount).toBe(8990)
  })
})

describe('parseExpenseDocumentFromText with fileName', () => {
  it('ignores amount matching QO filename digits', () => {
    const text = `
QO260800139
ยอดรวม (รวมภาษี) 12,345.67
`
    const parsed = parseExpenseDocumentFromText(text, { fileName: 'QO260800139.pdf' })
    expect(parsed?.amount).toBe(12345.67)
  })
})
