import { getBangkokMonthRange } from '@/lib/bangkok-time'
import { accountLine } from '@/lib/chart-of-accounts-mapping'
import { postJournalEntry } from '@/lib/accounting-posting'
import {
  TAX_ACCOUNTS,
  TAX_BOOK,
  TAX_VOUCHER_KINDS,
  taxInventoryCogsLines,
  taxJournalBalanced,
  taxPayrollJournalLines,
  taxPurchaseSummaryLines,
  taxSalesSummaryLines,
  taxVatSummaryLines,
  type TaxJournalLineDraft,
  type TaxVoucherKind,
} from '@/lib/tax-book'
import { assertTaxAccountingPeriodOpen } from '@/lib/tax-book-period-server'
import { deleteTaxBookSource, taxBookClosingLines, taxBookMonthSourceId } from '@/lib/tax-book-server'
import {
  taxBookMemoClosing,
  taxBookMemoInventoryCogs,
  taxBookMemoOpening,
  taxBookMemoPayroll,
  taxBookMemoPurchase,
  taxBookMemoSales,
  taxBookMemoVat,
  taxBookMemoAdjustment,
  taxBookMemoWithStatus,
} from '@/lib/tax-book-voucher-memo'

const TAX_PAYROLL = 'tax_payroll'
const TAX_INVENTORY = 'tax_inventory_cogs'
const TAX_ADJUSTMENT = 'tax_adjustment'
const TAX_OPENING = 'tax_opening'
const TAX_VAT = 'tax_vat_summary'
const TAX_SALES = 'tax_sales_summary'
const TAX_PURCHASE = 'tax_purchase_summary'
const TAX_CLOSING = 'tax_income_expense_closing'
const TAX_MANUAL = 'tax_manual'

async function postTaxLines(input: {
  yearMonth: string
  taxEntityCode: string
  sourceType: string
  sourceId: number | null
  memo: string
  postedBy: string | null
  lines: TaxJournalLineDraft[]
  replace: boolean
  accountingDate?: string
  voucherKind?: string | null
  entryNo?: string | null
}): Promise<number | null> {
  const entity = String(input.taxEntityCode || '').trim()
  const ym = String(input.yearMonth || '').slice(0, 7)
  await assertTaxAccountingPeriodOpen(entity, ym)
  if (!taxJournalBalanced(input.lines)) throw new Error('UNBALANCED')
  if (input.replace && input.sourceId) {
    await deleteTaxBookSource({
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      taxEntityCode: entity,
    })
  }
  const { endStr } = getBangkokMonthRange(ym)
  const accountingDate = String(input.accountingDate || endStr).slice(0, 10)
  return postJournalEntry({
    accountingDate,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    storeName: entity,
    memo: input.memo,
    postedBy: input.postedBy,
    book: TAX_BOOK,
    taxEntityCode: entity,
    voucherKind: input.voucherKind || undefined,
    entryNo: input.entryNo || undefined,
    lines: input.lines.map((ln) => ({
      accountCode: ln.accountCode,
      accountName: ln.accountName,
      side: ln.side,
      amount: ln.amount,
    })),
  })
}

export async function postTaxPayrollJournal(input: {
  yearMonth: string
  taxEntityCode: string
  gross: number
  tax: number
  sso: number
  postedBy: string | null
}): Promise<number | null> {
  const lines = taxPayrollJournalLines({
    gross: input.gross,
    tax: input.tax,
    sso: input.sso,
    salaryName: accountLine(TAX_ACCOUNTS.salary).accountName,
    whtName: accountLine(TAX_ACCOUNTS.wht).accountName,
    ssoName: accountLine(TAX_ACCOUNTS.sso).accountName,
    payableName: accountLine(TAX_ACCOUNTS.payables).accountName,
  })
  if (!lines.length) return null
  return postTaxLines({
    yearMonth: input.yearMonth,
    taxEntityCode: input.taxEntityCode,
    sourceType: TAX_PAYROLL,
    sourceId: taxBookMonthSourceId(input.yearMonth),
    memo: taxBookMemoPayroll(input.yearMonth),
    postedBy: input.postedBy,
    lines,
    replace: true,
  })
}

export async function postTaxInventoryCogsJournal(input: {
  yearMonth: string
  taxEntityCode: string
  cogs: number
  postedBy: string | null
}): Promise<number | null> {
  const lines = taxInventoryCogsLines(input.cogs, {
    cogs: accountLine(TAX_ACCOUNTS.cogs).accountName,
    inventory: accountLine(TAX_ACCOUNTS.inventory).accountName,
  })
  if (!lines.length) return null
  return postTaxLines({
    yearMonth: input.yearMonth,
    taxEntityCode: input.taxEntityCode,
    sourceType: TAX_INVENTORY,
    sourceId: taxBookMonthSourceId(input.yearMonth),
    memo: taxBookMemoInventoryCogs(input.yearMonth),
    postedBy: input.postedBy,
    lines,
    replace: true,
  })
}

export async function postTaxVatSummaryJournal(input: {
  yearMonth: string
  taxEntityCode: string
  outputVat: number
  inputVat: number
  postedBy: string | null
}): Promise<number | null> {
  const lines = taxVatSummaryLines({
    outputVat: input.outputVat,
    inputVat: input.inputVat,
    names: {
      input: accountLine(TAX_ACCOUNTS.inputVat).accountName,
      output: accountLine(TAX_ACCOUNTS.outputVat).accountName,
      clearing: accountLine(TAX_ACCOUNTS.vatClearing).accountName,
    },
  })
  if (!lines.length) return null
  return postTaxLines({
    yearMonth: input.yearMonth,
    taxEntityCode: input.taxEntityCode,
    sourceType: TAX_VAT,
    sourceId: taxBookMonthSourceId(input.yearMonth),
    memo: taxBookMemoVat(input.yearMonth),
    postedBy: input.postedBy,
    lines,
    replace: true,
  })
}

export async function postTaxSalesSummaryJournal(input: {
  yearMonth: string
  taxEntityCode: string
  netAmount: number
  postedBy: string | null
}): Promise<number | null> {
  const lines = taxSalesSummaryLines({
    netAmount: input.netAmount,
    names: {
      receivable: accountLine('1130').accountName,
      revenue: accountLine(TAX_ACCOUNTS.revenue).accountName,
    },
  })
  if (!lines.length) return null
  return postTaxLines({
    yearMonth: input.yearMonth,
    taxEntityCode: input.taxEntityCode,
    sourceType: TAX_SALES,
    sourceId: taxBookMonthSourceId(input.yearMonth),
    memo: taxBookMemoSales(input.yearMonth),
    postedBy: input.postedBy,
    lines,
    replace: true,
  })
}

export async function postTaxPurchaseSummaryJournal(input: {
  yearMonth: string
  taxEntityCode: string
  netAmount: number
  postedBy: string | null
}): Promise<number | null> {
  const lines = taxPurchaseSummaryLines({
    netAmount: input.netAmount,
    names: {
      inventory: accountLine(TAX_ACCOUNTS.inventory).accountName,
      payable: accountLine(TAX_ACCOUNTS.payables).accountName,
    },
  })
  if (!lines.length) return null
  return postTaxLines({
    yearMonth: input.yearMonth,
    taxEntityCode: input.taxEntityCode,
    sourceType: TAX_PURCHASE,
    sourceId: taxBookMonthSourceId(input.yearMonth),
    memo: taxBookMemoPurchase(input.yearMonth),
    postedBy: input.postedBy,
    lines,
    replace: true,
  })
}

export async function postTaxAdjustmentJournal(input: {
  yearMonth: string
  taxEntityCode: string
  memo: string
  postedBy: string | null
  lines: TaxJournalLineDraft[]
}): Promise<number | null> {
  return postTaxLines({
    yearMonth: input.yearMonth,
    taxEntityCode: input.taxEntityCode,
    sourceType: TAX_ADJUSTMENT,
    sourceId: Date.now(),
    memo: taxBookMemoAdjustment(input.yearMonth, input.memo),
    postedBy: input.postedBy,
    lines: input.lines,
    replace: false,
  })
}

export async function postTaxManualJournal(input: {
  yearMonth: string
  taxEntityCode: string
  memo: string
  postedBy: string | null
  lines: TaxJournalLineDraft[]
  voucherKind: TaxVoucherKind
  accountingDate?: string
  entryNo?: string | null
  postingStatus?: 'draft' | 'approved'
}): Promise<number | null> {
  const kind = TAX_VOUCHER_KINDS.includes(input.voucherKind) ? input.voucherKind : 'general'
  const status = input.postingStatus === 'draft' ? 'draft' : 'approved'
  const memo = taxBookMemoWithStatus(
    String(input.memo || '').trim() || taxBookMemoAdjustment(input.yearMonth),
    status
  )
  return postTaxLines({
    yearMonth: input.yearMonth,
    taxEntityCode: input.taxEntityCode,
    sourceType: TAX_MANUAL,
    sourceId: Date.now(),
    memo,
    postedBy: input.postedBy,
    lines: input.lines,
    replace: false,
    accountingDate: input.accountingDate,
    voucherKind: kind,
    entryNo: String(input.entryNo || '').trim() || null,
  })
}

/** 법인 세무 장부 기초(이관) 전표. 같은 법인·기준일은 덮어쓴다. */
export async function postTaxOpeningJournal(input: {
  yearMonth: string
  taxEntityCode: string
  accountingDate: string
  memo: string
  postedBy: string | null
  lines: TaxJournalLineDraft[]
}): Promise<number | null> {
  const ymd = String(input.accountingDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error('INVALID_YEAR_MONTH')
  const sourceId = Number(ymd.replace(/-/g, '')) || taxBookMonthSourceId(input.yearMonth)
  return postTaxLines({
    yearMonth: input.yearMonth,
    taxEntityCode: input.taxEntityCode,
    sourceType: TAX_OPENING,
    sourceId,
    memo: input.memo || taxBookMemoOpening(ymd),
    postedBy: input.postedBy,
    lines: input.lines,
    replace: true,
    accountingDate: ymd,
  })
}

export async function postTaxIncomeExpenseClosing(input: {
  yearMonth: string
  taxEntityCode: string
  postedBy: string | null
  rows: Parameters<typeof taxBookClosingLines>[0]
}): Promise<number | null> {
  const preview = taxBookClosingLines(input.rows)
  if (preview.lines.length < 2) return null
  return postTaxLines({
    yearMonth: input.yearMonth,
    taxEntityCode: input.taxEntityCode,
    sourceType: TAX_CLOSING,
    sourceId: taxBookMonthSourceId(input.yearMonth),
    memo: taxBookMemoClosing(input.yearMonth),
    postedBy: input.postedBy,
    lines: preview.lines.map((ln) => ({
      accountCode: ln.accountCode,
      accountName: ln.accountName || ln.accountCode,
      side: ln.side,
      amount: ln.amount,
    })),
    replace: true,
  })
}
