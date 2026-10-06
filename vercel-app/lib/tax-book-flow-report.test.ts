import { describe, expect, it } from 'vitest'
import {
  buildFlowLedgerHtml,
  buildFlowTrialBalanceHtml,
  buildFlowBalanceSheetHtml,
  wrapFlowReportForExcel,
} from './tax-book-flow-report'
import { buildTaxBookLedgerSections, buildTaxBookStatements } from './tax-book'

describe('tax book flow report', () => {
  it('renders trial balance with company header like Flow', () => {
    const html = buildFlowTrialBalanceHtml(
      { companyName: 'Jinwon F&B', asOfLabel: 'As at 2026-07', lang: 'th' },
      [
        { accountCode: '1010', accountName: 'Cash', debit: 100, credit: 0, netDebit: 100 },
        { accountCode: '2110', accountName: 'AP', debit: 0, credit: 100, netDebit: -100 },
      ],
      { debit: 100, credit: 100 }
    )
    expect(html).toContain('Jinwon F&amp;B')
    expect(html).toContain('งบทดลอง')
    expect(html).toContain('1010')
    expect(html).toContain('100.00')
  })

  it('renders one general-ledger section per account with a running balance', () => {
    const sections = buildTaxBookLedgerSections(
      [
        { accountCode: '1111', accountName: 'เงินสด', accountingDate: '2025-12-31', voucherNo: 'OB', memo: '', sourceType: 'tax_opening', debit: 47780.59, credit: 0 },
        { accountCode: '1111', accountName: 'เงินสด', accountingDate: '2026-01-03', voucherNo: 'JV66120006', memo: 'โอน', sourceType: 'bank_transaction', debit: 0, credit: 1256515.99 },
      ],
      { dateFrom: '2026-01-01', dateTo: '2026-01-31', accountFrom: '1111', accountTo: '1111', allBusiness: false }
    )
    const html = buildFlowLedgerHtml(
      { companyName: 'ACT', asOfLabel: '2026-01-01 – 2026-01-31', periodLabel: '1111', lang: 'th' },
      sections,
      {
        title: 'รายงานแยกประเภททั่วไป',
        date: 'วันที่',
        book: 'สมุด',
        voucher: 'ใบสำคัญ',
        description: 'คำอธิบาย',
        debit: 'เดบิต',
        credit: 'เครดิต',
        balance: 'ยอดคงเหลือ',
        total: 'รวม',
        bookLabel: () => 'จ่าย',
      }
    )
    expect(html).toContain('รายงานแยกประเภททั่วไป')
    expect(html).toContain('1111')
    expect(html).toContain('47,780.59')
    expect(html).toContain('03/01/69')
    expect(html).toContain('(1,208,735.40)')
    expect(html).toContain('>รวม<')
    const excel = buildFlowLedgerHtml(
      { companyName: 'ACT', asOfLabel: '2026-01-01 – 2026-01-31', periodLabel: '1111', lang: 'th' },
      sections,
      {
        title: 'รายงานแยกประเภททั่วไป',
        date: 'วันที่',
        book: 'สมุด',
        voucher: 'ใบสำคัญ',
        description: 'คำอธิบาย',
        debit: 'เดบิต',
        credit: 'เครดิต',
        balance: 'ยอดคงเหลือ',
        total: 'รวม',
        bookLabel: () => 'จ่าย',
      },
      { numeric: true }
    )
    expect(excel).toContain('>ใบสำคัญ<')
    expect(excel).toContain('-1208735.40')
    expect(excel).not.toContain('(1,208,735.40)')
    const xls = wrapFlowReportForExcel(html)
    expect(xls).toContain('1111')
  })

  it('wraps excel html', () => {
    const st = buildTaxBookStatements([
      { accountCode: '1130', accountName: 'AR', debit: 50, credit: 0 },
      { accountCode: '4110', accountName: 'Sales', debit: 0, credit: 50 },
    ])
    const inner = buildFlowBalanceSheetHtml({ companyName: 'ACT', asOfLabel: '2026-07', lang: 'th' }, st)
    const xls = wrapFlowReportForExcel(inner)
    expect(xls).toContain('<html')
    expect(xls).toContain('งบฐานะการเงิน')
  })
})
