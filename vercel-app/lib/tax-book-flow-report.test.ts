import { describe, expect, it } from 'vitest'
import {
  buildFlowTrialBalanceHtml,
  buildFlowBalanceSheetHtml,
  wrapFlowReportForExcel,
} from './tax-book-flow-report'
import { buildTaxBookStatements } from './tax-book'

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
