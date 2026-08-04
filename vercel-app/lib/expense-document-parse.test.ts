import { describe, expect, it } from 'vitest'
import {
  digitSequencesFromExpenseFileName,
  parseQuoteAmountFromText,
} from '@/lib/interior-quote-amount-parse'
import {
  estimateVatFromGrossInclusive,
  normalizeExpenseCalendarDate,
  parseExpenseDateFromText,
  parseExpenseDocumentFromText,
  parseInvoiceNoFromFileName,
  parseInvoiceNoFromText,
  sanitizeVatAgainstGross,
  sanitizeWhtAgainstGross,
} from '@/lib/expense-document-parse'
import { parseVendorNameHintFromText, suggestAccountSubjectId } from '@/lib/expense-ocr-suggestions'

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

  it('prefers grand total over subtotal', () => {
    const text = `
Subtotal 10,000.00
รวมทั้งสิ้น 10,700.00
`
    const parsed = parseQuoteAmountFromText(text)
    expect(parsed?.amount).toBe(10700)
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

describe('dates — Buddhist Era and Thai months', () => {
  it('converts พ.ศ. year to Gregorian', () => {
    expect(normalizeExpenseCalendarDate(2569, 8, 4)).toBe('2026-08-04')
  })

  it('parses Thai abbreviated month with BE year', () => {
    expect(parseExpenseDateFromText('วันที่ 4 ส.ค. 2569')).toBe('2026-08-04')
  })

  it('parses DD/MM/YYYY CE', () => {
    expect(parseExpenseDateFromText('Date: 08/04/2026')).toBe('2026-04-08')
  })

  it('prefers date keyword line', () => {
    expect(parseExpenseDateFromText('เลขที่ QO1\nวันที่ 15/06/2026\nอื่น 01/01/2020')).toBe('2026-06-15')
  })
})

describe('invoice / quotation number', () => {
  it('reads QO from filename', () => {
    expect(parseInvoiceNoFromFileName('QO260800139.pdf')).toBe('QO260800139')
  })

  it('reads QO from body text', () => {
    expect(parseInvoiceNoFromText('Quotation No. QO260800139\nTotal 100')).toBe('QO260800139')
  })

  it('falls back to filename when body has no number', () => {
    expect(parseInvoiceNoFromText('ยอดรวม 1,000.00', 'QO260800139.pdf')).toBe('QO260800139')
  })
})

describe('VAT / WHT sanitization', () => {
  it('does not treat rate 7 as VAT amount', () => {
    const text = `
ยอดรวม 10,700.00
VAT 7% 700.00
`
    const parsed = parseExpenseDocumentFromText(text)
    expect(parsed?.amount).toBe(10700)
    expect(parsed?.vatAmount).toBe(700)
  })

  it('replaces rate-only VAT with estimate from gross', () => {
    expect(sanitizeVatAgainstGross(10700, 7)).toBe(estimateVatFromGrossInclusive(10700))
  })

  it('rejects tiny WHT rate integers', () => {
    expect(sanitizeWhtAgainstGross(10000, 3)).toBeUndefined()
  })
})

describe('vendor + subject hints', () => {
  it('parses Thai company vendor line', () => {
    const hint = parseVendorNameHintFromText('ผู้ขาย: บริษัท ตัวอย่าง จำกัด\nยอดรวม 100')
    expect(hint).toMatch(/ตัวอย่าง/)
  })

  it('suggests equipment subject from oven memo', () => {
    const sid = suggestAccountSubjectId(
      [
        { id: 1, code: '5530', name: 'Repair' },
        { id: 2, code: '5510', name: 'Rent' },
      ],
      { memo: 'Oven cost' }
    )
    expect(sid).toBe(1)
  })
})

describe('parseExpenseDocumentFromText integration', () => {
  it('fills amount, date, invoice from quote-like PDF text + filename', () => {
    const text = `
ใบเสนอราคา QO260800139
บริษัท เตาอบดี จำกัด
วันที่ 4 ส.ค. 2569
รายการ Oven cost
ภาษีมูลค่าเพิ่ม 1,820.00
รวมทั้งสิ้น 27,900.00
`
    const parsed = parseExpenseDocumentFromText(text, { fileName: 'QO260800139.pdf' })
    expect(parsed?.amount).toBe(27900)
    expect(parsed?.expenseDate).toBe('2026-08-04')
    expect(parsed?.invoiceNo).toBe('QO260800139')
    expect(parsed?.vatAmount).toBe(1820)
    expect(parsed?.vendorNameHint).toMatch(/เตาอบดี|บริษัท/)
  })
})
