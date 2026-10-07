import { describe, expect, it } from 'vitest'
import {
  canonicalJournalAccountName,
  displayTaxBookAccountName,
  formatTaxBookLedgerDate,
  formatTaxBookLedgerPeriod,
  formatTaxBookMemoDisplay,
  formatTaxFilingYearMonthLabel,
  localizeOperationalJournalMemo,
  resolveTaxBookMemoDisplay,
} from './tax-book-display'
import { taxBookMemoWithStatus, taxBookStatusFromMemo } from './tax-book-voucher-memo'
import { taxBookCompanyNameFromScope } from './tax-entity-scope-label'

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
    expect(displayTaxBookAccountName('th', '9999', '현금및예금')).toBe('เงินสดและเงินฝากธนาคาร')
    expect(displayTaxBookAccountName('th', '1010', 'กสิกรไทย · สำนักงานใหญ่')).toBe('กสิกรไทย · สำนักงานใหญ่')
    expect(displayTaxBookAccountName('th', '1010', '현금및예금')).toBe('เงินสดและเงินฝากธนาคาร')
    expect(canonicalJournalAccountName('2110', 'เจ้าหนี้การค้า')).toBe('매입채무')
    expect(canonicalJournalAccountName('1010', 'K-bank · 166-2-97079-0')).toBe('K-bank · 166-2-97079-0')
  })

  it('formats ledger dates in Buddhist short form for Thai', () => {
    expect(formatTaxBookLedgerDate('2026-01-03', 'th')).toBe('03/01/69')
    expect(formatTaxBookLedgerPeriod('2026-01-01', '2026-12-31', 'th')).toBe('1 ม.ค. 2569 ถึง 31 ธ.ค. 2569')
    expect(formatTaxBookLedgerDate('2026-01-03', 'ko')).toBe('2026.01.03')
  })

  it('translates system journal memos and leaves free text', () => {
    expect(localizeOperationalJournalMemo('POS 매출 자동분개', 'th')).toBe('ขาย POS')
    expect(localizeOperationalJournalMemo('POS 주문 완료 자동분개', 'th')).toBe('ขายจากออเดอร์ POS')
    expect(localizeOperationalJournalMemo('주문 수령(본사정산분) 자동분개', 'en')).toBe('Order receipt (HQ settlement)')
    expect(localizeOperationalJournalMemo('급여 발생(합산) 2026-09 CM Silom', 'th')).toBe('บันทึกเงินเดือนรวม 2026-09 CM Silom')
    expect(localizeOperationalJournalMemo('grab 채권 소거', 'th')).toBe('ตัดลูกหนี้ grab')
    expect(localizeOperationalJournalMemo('패티보충(สาขาเอกมัย)', 'th')).toBe('เติมเงินสดย่อย (สาขาเอกมัย)')
    expect(localizeOperationalJournalMemo('ค่าเช่าสำนักงาน', 'th')).toBeNull()
  })

  it('translates system account aliases and subject master names', () => {
    expect(displayTaxBookAccountName('th', '1130', '결제대기자산')).toBe('ลูกหนี้รอรับชำระ')
    expect(displayTaxBookAccountName('th', '1130', '매출채권')).toBe('ลูกหนี้การค้า')
    expect(displayTaxBookAccountName('th', '5520', '전기요금', [
      { code: '5520', name: '전기요금', nameEn: 'Electricity', nameTh: 'ค่าไฟฟ้า' },
    ])).toBe('ค่าไฟฟ้า')
    expect(displayTaxBookAccountName('th', '1010', 'กสิกรไทย · สำนักงานใหญ่', [
      { code: '1010', name: '현금및예금', nameEn: 'Cash', nameTh: 'เงินสดและเงินฝากธนาคาร' },
    ])).toBe('กสิกรไทย · สำนักงานใหญ่')
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

  it('strips draft prefix from displayed memos', () => {
    const t = (k: string) => k
    expect(
      formatTaxBookMemoDisplay(t, '[Draft] Rent for October', { sourceType: 'tax_manual' })
    ).toBe('Rent for October')
  })

  it('uses the legal entity name on the report header', () => {
    expect(
      taxBookCompanyNameFromScope('entity:0105566228126', [
        { value: 'entity:0105566228126', entityName: 'บริษัท จินวอน เอฟแอนด์บี จำกัด (สำนักงานใหญ่)', stores: ['Jinwon True'] },
      ])
    ).toBe('บริษัท จินวอน เอฟแอนด์บี จำกัด')
    expect(taxBookCompanyNameFromScope('Jinwon True', [
      { value: 'entity:0105566228126', entityName: 'Jinwon F&B', stores: ['Jinwon True'] },
    ])).toBe('Jinwon F&B')
  })

  it('marks draft status from memo prefix', () => {
    expect(taxBookMemoWithStatus('Rent', 'draft')).toBe('[Draft] Rent')
    expect(taxBookMemoWithStatus('[Draft] Rent', 'approved')).toBe('Rent')
    expect(taxBookStatusFromMemo('[Draft] Rent')).toBe('draft')
    expect(taxBookStatusFromMemo('Rent')).toBe('approved')
  })
})
