import { describe, expect, it } from 'vitest'
import {
  displayTaxBookAccountName,
  formatTaxBookMemoDisplay,
  formatTaxFilingYearMonthLabel,
  resolveTaxBookMemoDisplay,
} from './tax-book-display'

describe('tax book display i18n', () => {
  it('formats year-month labels by language', () => {
    expect(formatTaxFilingYearMonthLabel('2026-07', 'ko')).toBe('2026년 7월')
    expect(formatTaxFilingYearMonthLabel('2026-07', 'th')).toBe('07/2026')
    expect(formatTaxFilingYearMonthLabel('2026-07', 'en')).toBe('2026-07')
  })

  it('localizes COA account names', () => {
    expect(displayTaxBookAccountName('ko', '1360', '매입세액')).toBe('매입세액')
    expect(displayTaxBookAccountName('en', '1360', '매입세액')).toBe('Input VAT')
    expect(displayTaxBookAccountName('th', '1360', '매입세액')).toBe('ภาษีซื้อ')
    expect(displayTaxBookAccountName('th', '9999', '기타')).toBe('기타')
  })

  it('resolves stored English memos to i18n keys', () => {
    const r = resolveTaxBookMemoDisplay(
      'Record VAT from Monthly Tax Filing P.P. 30 for the period of 07/2026',
      { sourceType: 'tax_vat_summary', accountingDate: '2026-07-31' }
    )
    expect(r?.key).toBe('taxBooksMemo_vat')
    expect(r?.ym).toBe('07/2026')
  })

  it('formats memo via translator', () => {
    const t = (k: string) =>
      k === 'taxBooksMemo_vat' ? 'ลง VAT ภ.พ.30 งวด {{ym}}' : k
    expect(
      formatTaxBookMemoDisplay(t, 'Record VAT from Monthly Tax Filing P.P. 30 for the period of 07/2026', {
        sourceType: 'tax_vat_summary',
      })
    ).toBe('ลง VAT ภ.พ.30 งวด 07/2026')
  })
})
