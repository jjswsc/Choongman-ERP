import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  TAX_CLOSE_LOCKS_STORE_PERIOD,
  formatTaxVoucherNo,
  recognizeTaxBook,
  buildTaxBookLedgerSections,
  filterTaxBookLedgerLines,
  resolveTaxBookAsOfRange,
  resolveTaxBookMonthRange,
  taxEntityKeyFromScope,
  taxEntityCodeFromStoreName,
  isTaxBookJournalHead,
  buildTaxBookStatements,
  preferLockedTaxBookProfit,
  taxInventoryCogsLines,
  taxJournalBalanced,
  taxPayrollJournalLines,
  taxVatSummaryLines,
  voucherKindForSourceType,
} from './tax-book'
import { buildTaxManagementBridge } from './tax-management-bridge'
import { getThaiTaxFilingPeriodRange } from './thai-tax-period'
import {
  buildTaxOpeningBalanceLines,
  SJ_GLOBAL_FLOW_INVENTORY_2026_06_30,
  SJ_GLOBAL_FLOW_TB_2026_06_30,
} from './tax-book-opening'
import type { TrialBalanceRow } from './trial-balance-report'

function row(code: string, debit: number, credit: number): TrialBalanceRow {
  return { accountCode: code, accountName: code, debit, credit, netDebit: debit - credit }
}

describe('tax book rules', () => {
  it('maps voucher kinds and document numbers', () => {
    expect(voucherKindForSourceType('tax_manual')).toBe('general')
    expect(voucherKindForSourceType('tax_payroll')).toBe('general')
    expect(voucherKindForSourceType('tax_income_expense_closing')).toBe('closing')
    expect(voucherKindForSourceType('tax_sales_summary')).toBe('sales')
    expect(voucherKindForSourceType('tax_purchase_summary')).toBe('purchase')
    expect(voucherKindForSourceType('pos_order')).toBe('sales')
    expect(formatTaxVoucherNo('sales', '2026-09', 2)).toBe('SV2026090002')
  })

  it('filters vouchers into the five Thai day books', async () => {
    const { voucherMatchesDayBook } = await import('./tax-book')
    expect(voucherMatchesDayBook('sales', 'all')).toBe(true)
    expect(voucherMatchesDayBook('sales', 'sales')).toBe(true)
    expect(voucherMatchesDayBook('sales', 'purchase')).toBe(false)
    expect(voucherMatchesDayBook('closing', 'general')).toBe(true)
    expect(voucherMatchesDayBook('payment', 'payment')).toBe(true)
    expect(voucherMatchesDayBook('receipt', 'receipt')).toBe(true)
    const { voucherKindForDayBookFilter } = await import('./tax-book')
    expect(voucherKindForDayBookFilter('sales')).toBe('sales')
    expect(voucherKindForDayBookFilter('purchase')).toBe('purchase')
    expect(voucherKindForDayBookFilter('payment')).toBe('payment')
    expect(voucherKindForDayBookFilter('receipt')).toBe('receipt')
    expect(voucherKindForDayBookFilter('all')).toBe('general')
    expect(voucherKindForDayBookFilter('general')).toBe('general')
  })

  it('accepts only an entity or 13-digit TIN as the tax book key', () => {
    expect(taxEntityKeyFromScope('entity:omni-foodtech-01')).toBe('omni-foodtech-01')
    expect(taxEntityKeyFromScope('entity:choongman-0105566228126')).toBe('tin:0105566228126')
    expect(taxEntityKeyFromScope('taxid:0105551234567')).toBe('tin:0105551234567')
    expect(taxEntityKeyFromScope('CM True Digital')).toBe('tin:0105566228126')
    expect(taxEntityKeyFromScope('CM Silom')).toBe('tin:0105568080622')
    expect(taxEntityKeyFromScope('CM MBK')).toBe('store:CM MBK')
    expect(taxEntityKeyFromScope('store:CM MBK')).toBe('store:CM MBK')
    expect(taxEntityKeyFromScope('All')).toBeNull()
  })

  it('maps store journals onto the same tax-book keys as Flow openings', () => {
    expect(taxEntityCodeFromStoreName('CM True Digital')).toBe('tin:0105566228126')
    expect(taxEntityCodeFromStoreName('CM MBK')).toBe('store:CM MBK')
    expect(taxEntityCodeFromStoreName('CM Future Park')).toBe('store:CM Future Park')
    expect(taxEntityCodeFromStoreName('CM Ekkamai')).toBe('store:CM Ekkamai')
    expect(taxEntityCodeFromStoreName('CM Office')).toBe('tin:0105566137147')
    expect(taxEntityCodeFromStoreName('Unknown Branch')).toBe('store:Unknown Branch')
    expect(taxEntityCodeFromStoreName('All')).toBeNull()
    expect(isTaxBookJournalHead({ source_type: 'pos_order', book: 'tax' })).toBe(true)
    expect(isTaxBookJournalHead({ source_type: 'pos_order', book: null })).toBe(false)
    expect(isTaxBookJournalHead({ source_type: 'tax_opening', book: null })).toBe(true)
  })

  it('balances payroll and inventory journals', () => {
    const payroll = taxPayrollJournalLines({ gross: 1000, tax: 30, sso: 50 })
    expect(taxJournalBalanced(payroll)).toBe(true)
    expect(payroll.find((l) => l.accountCode === '5310')?.amount).toBe(1000)
    const cogs = taxInventoryCogsLines(250)
    expect(taxJournalBalanced(cogs)).toBe(true)
    expect(taxInventoryCogsLines(0)).toEqual([])
  })

  it('posts filing VAT onto the tax book without copying POS sales', () => {
    const lines = taxVatSummaryLines({ outputVat: 200, inputVat: 80 })
    expect(taxJournalBalanced(lines)).toBe(true)
    expect(lines.find((l) => l.accountCode === '2180')?.amount).toBe(200)
    expect(lines.find((l) => l.accountCode === '1360')?.amount).toBe(80)
    expect(lines.find((l) => l.accountCode === '4110')).toBeUndefined()
    expect(taxVatSummaryLines({ outputVat: 50, inputVat: 50 }).some((l) => l.accountCode === '1395')).toBe(false)
    expect(taxVatSummaryLines({ outputVat: 0, inputVat: 0 })).toEqual([])
  })

  it('builds tax statements from tax-book rows and keeps profit after closing', () => {
    const open = buildTaxBookStatements([
      { accountCode: '1130', accountName: '매출채권', debit: 1000, credit: 0 },
      { accountCode: '4110', accountName: '매출', debit: 0, credit: 1000 },
      { accountCode: '5110', accountName: '원가', debit: 400, credit: 0 },
      { accountCode: '1460', accountName: '재고', debit: 0, credit: 400 },
    ])
    expect(open.netIncome).toBe(600)
    expect(open.revenue).toBe(1000)
    expect(open.balanced).toBe(true)
    const closed = buildTaxBookStatements([
      { accountCode: '1130', accountName: '매출채권', debit: 1000, credit: 0 },
      { accountCode: '1460', accountName: '재고', debit: 0, credit: 400 },
      { accountCode: '3120', accountName: '이익잉여금', debit: 0, credit: 600 },
      { accountCode: '1360', accountName: '매입세액', debit: 80, credit: 0 },
      { accountCode: '1395', accountName: '대체', debit: 120, credit: 0 },
      { accountCode: '2180', accountName: '부가세예수금', debit: 0, credit: 200 },
    ])
    expect(closed.netIncome).toBe(600)
    expect(closed.revenue).toBe(0)
    expect(closed.balanced).toBe(true)
  })

  it('uses locked tax-book profit for CIT only when every month is closed', () => {
    const partial = preferLockedTaxBookProfit({
      journalRevenue: 1000,
      journalExpense: 400,
      journalEntryCount: 3,
      months: [
        { closed: true, schemaReady: true, netIncome: 500, entryCount: 2 },
        { closed: false, schemaReady: true, netIncome: 0, entryCount: 0 },
      ],
    })
    expect(partial.source).toBe('journals')
    expect(partial.partial).toBe(true)
    expect(partial.revenue - partial.expense).toBe(600)
    const locked = preferLockedTaxBookProfit({
      journalRevenue: 1000,
      journalExpense: 400,
      journalEntryCount: 3,
      months: [
        { closed: true, schemaReady: true, netIncome: 500, entryCount: 2 },
        { closed: true, schemaReady: true, netIncome: 100, entryCount: 1 },
      ],
    })
    expect(locked.source).toBe('tax_book')
    expect(locked.revenue - locked.expense).toBe(600)
  })

  it('recognizes a month only when the tax trial balances and VAT ties', () => {
    expect(
      recognizeTaxBook({
        schemaReady: true,
        taxEntryCount: 2,
        totalDebit: 100,
        totalCredit: 100,
        outputVatAccount: 70,
        inputVatAccount: 20,
        filingOutputVat: 70,
        filingInputVat: 20,
      }).recognized
    ).toBe(true)
    expect(
      recognizeTaxBook({
        schemaReady: true,
        taxEntryCount: 1,
        totalDebit: 100,
        totalCredit: 100,
        outputVatAccount: 0,
        inputVatAccount: 0,
        filingOutputVat: 70,
        filingInputVat: 20,
      }).recognized
    ).toBe(false)
  })

  it('resolves a month or a period and rejects a backwards or oversized range', () => {
    const one = resolveTaxBookMonthRange('2026-09', '2026-09')
    expect(one.ok).toBe(true)
    if (one.ok) {
      expect(one.singleMonth).toBe(true)
      expect(one.months).toEqual(['2026-09'])
    }
    const span = resolveTaxBookMonthRange('2026-01', '2026-03')
    expect(span.ok).toBe(true)
    if (span.ok) {
      expect(span.months).toEqual(['2026-01', '2026-02', '2026-03'])
      expect(span.startDate).toBe('2026-01-01')
      expect(span.endDate).toBe('2026-03-31')
    }
    expect(resolveTaxBookMonthRange('2026-04', '2026-02')).toEqual({ ok: false, error: 'RANGE_ORDER' })
    expect(resolveTaxBookMonthRange('2024-01', '2026-02')).toEqual({ ok: false, error: 'RANGE_TOO_LONG' })
    const asOf = resolveTaxBookAsOfRange('2026-08')
    expect(asOf.ok).toBe(true)
    if (asOf.ok) {
      expect(asOf.from).toBe('2026-01')
      expect(asOf.to).toBe('2026-08')
      expect(asOf.startDate).toBe('2026-01-01')
      expect(asOf.endDate).toBe('2026-08-31')
    }
  })

  it('uses a custom filing range when the end month differs', () => {
    const span = getThaiTaxFilingPeriodRange({ yearMonth: '2026-01', periodType: 'monthly', endMonth: '2026-03' })
    expect(span.months).toEqual(['2026-01', '2026-02', '2026-03'])
    const half = getThaiTaxFilingPeriodRange({ yearMonth: '2026-02', periodType: 'half_year' })
    expect(half.months).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'])
    expect(() => getThaiTaxFilingPeriodRange({ yearMonth: '2026-04', endMonth: '2026-02' })).toThrow('RANGE_ORDER')
  })

  it('does not lock the store accounting period', () => {
    expect(TAX_CLOSE_LOCKS_STORE_PERIOD).toBe(false)
  })

  it('builds a balanced S&J opening voucher with ERP inventory override', () => {
    const same = buildTaxOpeningBalanceLines({
      rows: SJ_GLOBAL_FLOW_TB_2026_06_30,
      inventoryAmount: SJ_GLOBAL_FLOW_INVENTORY_2026_06_30,
    })
    expect(taxJournalBalanced(same.lines)).toBe(true)
    expect(same.flowInventory).toBe(SJ_GLOBAL_FLOW_INVENTORY_2026_06_30)
    expect(same.inventoryDelta).toBe(0)
    expect(same.lines.find((l) => l.accountCode === '1460')?.amount).toBe(SJ_GLOBAL_FLOW_INVENTORY_2026_06_30)

    const erp = buildTaxOpeningBalanceLines({
      rows: SJ_GLOBAL_FLOW_TB_2026_06_30,
      inventoryAmount: 5_000_000,
    })
    expect(taxJournalBalanced(erp.lines)).toBe(true)
    expect(erp.inventoryDelta).toBeCloseTo(5_000_000 - SJ_GLOBAL_FLOW_INVENTORY_2026_06_30, 2)
    expect(erp.lines.find((l) => l.accountCode === '1460')?.amount).toBe(5_000_000)
  })
})

describe('tax management bridge', () => {
  it('shows payroll and VAT holes without requiring the books to match', () => {
    const report = buildTaxManagementBridge({
      schemaReady: true,
      management: { sales: 1000, cogs: 400, payroll: 300, netProfit: 200 },
      journalRows: [row('4110', 0, 1000), row('5110', 100, 0)],
      taxBookRows: [],
      taxBookDebit: 0,
      taxBookCredit: 0,
      taxEntryCount: 0,
      filing: {
        outputVat: 70,
        outputNet: 1000,
        inputNet: 80,
        posOutputNet: 900,
        taxInvoiceOutputNet: 100,
        inputVat: 28,
        payrollWht: 30,
      },
    })
    expect(report.holes).toContain('payroll')
    expect(report.holes).toContain('cogs')
    expect(report.holes).toContain('outputVat')
    expect(report.recognition.recognized).toBe(false)
    const sales = report.lines.find((l) => l.key === 'sales')
    expect(sales?.management).toBe(1000)
    expect(sales?.journal).toBe(1000)
    expect(sales?.reason).toBe('not_on_tax_book')
    expect(report.lines.find((l) => l.key === 'cogs')?.reason).toBe('inventory_vs_purchase_invoice')
    expect(report.lines.find((l) => l.key === 'outputVat')?.reason).toBe('vat_not_posted')
    expect(report.salesSplit.posNet).toBe(900)
    const matched = buildTaxManagementBridge({
      schemaReady: true,
      management: { sales: 1000, cogs: 0, payroll: 0, netProfit: 100 },
      journalRows: [row('4110', 0, 1000)],
      taxBookRows: [row('4110', 0, 1000)],
      taxBookDebit: 1000,
      taxBookCredit: 1000,
      taxEntryCount: 1,
      filing: {
        outputVat: 0,
        outputNet: 1000,
        inputNet: 0,
        posOutputNet: 0,
        taxInvoiceOutputNet: 1000,
        inputVat: 0,
        payrollWht: 0,
      },
    })
    expect(matched.lines.find((l) => l.key === 'net')?.reason).toBe('nondeductible_or_limit')
  })
})

describe('tax book Flow-style voucher memos', () => {
  it('formats Record … descriptions with MM/YYYY', async () => {
    const {
      formatYmSlash,
      taxBookMemoVat,
      taxBookMemoOpening,
      taxBookSourceKindKey,
    } = await import('./tax-book-voucher-memo')
    expect(formatYmSlash('2026-07')).toBe('07/2026')
    expect(taxBookMemoVat('2026-07')).toContain('P.P. 30')
    expect(taxBookMemoVat('2026-07')).toContain('07/2026')
    expect(taxBookMemoOpening('2026-07-01')).toContain('2026-07-01')
    expect(taxBookSourceKindKey('tax_vat_summary')).toBe('vat')
    expect(taxBookSourceKindKey('tax_opening')).toBe('opening')
  })
})

describe('general ledger scope', () => {
  const lines = [
    { accountCode: '1130', accountingDate: '2026-09-30' },
    { accountCode: '4110', accountingDate: '2026-10-02' },
    { accountCode: '4120', accountingDate: '2026-10-15' },
    { accountCode: '5110', accountingDate: '2026-10-20' },
    { accountCode: '5310', accountingDate: '2026-11-01' },
  ]

  it('keeps the date range and every account when the whole business is selected', () => {
    const rows = filterTaxBookLedgerLines(lines, {
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
      accountFrom: '',
      accountTo: '',
      allBusiness: true,
    })
    expect(rows.map((r) => r.accountCode)).toEqual(['4110', '4120', '5110'])
  })

  it('matches one account or a numeric account range', () => {
    const one = filterTaxBookLedgerLines(lines, {
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
      accountFrom: '4110',
      accountTo: '',
      allBusiness: false,
    })
    expect(one.map((r) => r.accountCode)).toEqual(['4110'])

    const range = filterTaxBookLedgerLines(lines, {
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      accountFrom: '4100',
      accountTo: '4199',
      allBusiness: false,
    })
    expect(range.map((r) => r.accountCode)).toEqual(['4110', '4120'])
  })

  it('treats a short account number as a prefix range', () => {
    const rows = filterTaxBookLedgerLines(lines, {
      dateFrom: '',
      dateTo: '',
      accountFrom: '41',
      accountTo: '',
      allBusiness: false,
    })
    expect(rows.map((r) => r.accountCode)).toEqual(['4110', '4120'])
  })
})

describe('general ledger report sections', () => {
  const lines = [
    { accountCode: '1111', accountName: 'Cash', accountingDate: '2025-12-31', voucherNo: 'OB', memo: 'open', sourceType: 'tax_opening', debit: 100, credit: 0 },
    { accountCode: '1111', accountName: 'Cash', accountingDate: '2026-01-03', voucherNo: 'PV1', memo: 'pay', sourceType: 'bank_transaction', debit: 0, credit: 40 },
    { accountCode: '1111', accountName: 'Cash', accountingDate: '2026-01-05', voucherNo: 'RV1', memo: 'recv', sourceType: 'pos_deposit_receive', debit: 10, credit: 0 },
    { accountCode: '4110', accountName: 'Sales', accountingDate: '2025-12-01', voucherNo: 'S0', memo: 'old', sourceType: 'pos_order', debit: 0, credit: 25 },
    { accountCode: '5110', accountName: 'COGS', accountingDate: '2026-02-01', voucherNo: 'C1', memo: 'later', sourceType: 'store_purchase', debit: 5, credit: 0 },
  ]
  const scope = {
    dateFrom: '2026-01-01',
    dateTo: '2026-01-31',
    accountFrom: '',
    accountTo: '',
    allBusiness: true,
  }

  it('carries the opening balance and a running balance per account', () => {
    const [cash, sales] = buildTaxBookLedgerSections(lines, scope)
    expect(cash?.accountCode).toBe('1111')
    expect(cash?.opening).toBe(100)
    expect(cash?.lines.map((ln) => ln.balance)).toEqual([60, 70])
    expect(cash?.periodDebit).toBe(10)
    expect(cash?.periodCredit).toBe(40)
    expect(cash?.closing).toBe(70)
    expect(sales?.accountCode).toBe('4110')
    expect(sales?.opening).toBe(-25)
    expect(sales?.lines).toHaveLength(0)
    expect(sales?.closing).toBe(-25)
    expect(buildTaxBookLedgerSections(lines, scope).some((s) => s.accountCode === '5110')).toBe(false)
  })

  it('keeps only the accounts chosen in the search', () => {
    const sections = buildTaxBookLedgerSections(lines, {
      ...scope,
      accountFrom: '4110',
      accountTo: '4110',
      allBusiness: false,
    })
    expect(sections.map((s) => s.accountCode)).toEqual(['4110'])
  })
})

describe('management reports stay off the tax book', () => {
  it('income statement code does not read tax periods or tax-only journals', () => {
    const src = readFileSync(new URL('./accounting-reports.ts', import.meta.url), 'utf8')
    expect(src.includes('tax_accounting_periods')).toBe(false)
    expect(src.includes('tax_payroll')).toBe(false)
    expect(src.includes("book=eq.tax")).toBe(false)
  })

  it('store trial balance drops tax_ source types', () => {
    const src = readFileSync(new URL('./trial-balance-report.ts', import.meta.url), 'utf8')
    expect(src.includes('isTaxBookJournalHead')).toBe(true)
  })
})
