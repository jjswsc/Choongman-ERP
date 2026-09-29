import { getBangkokMonthRange } from '@/lib/bangkok-time'
import { accountLine } from '@/lib/chart-of-accounts-mapping'
import { postJournalEntry } from '@/lib/accounting-posting'
import {
  TAX_ACCOUNTS,
  TAX_BOOK,
  taxInventoryCogsLines,
  taxJournalBalanced,
  taxPayrollJournalLines,
  taxVatSummaryLines,
  type TaxJournalLineDraft,
} from '@/lib/tax-book'
import { assertTaxAccountingPeriodOpen } from '@/lib/tax-book-period-server'
import { deleteTaxBookSource, taxBookClosingLines, taxBookMonthSourceId } from '@/lib/tax-book-server'

const TAX_PAYROLL = 'tax_payroll'
const TAX_INVENTORY = 'tax_inventory_cogs'
const TAX_ADJUSTMENT = 'tax_adjustment'
const TAX_VAT = 'tax_vat_summary'
const TAX_CLOSING = 'tax_income_expense_closing'

async function postTaxLines(input: {
  yearMonth: string
  taxEntityCode: string
  sourceType: string
  sourceId: number | null
  memo: string
  postedBy: string | null
  lines: TaxJournalLineDraft[]
  replace: boolean
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
  return postJournalEntry({
    accountingDate: endStr,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    storeName: entity,
    memo: input.memo,
    postedBy: input.postedBy,
    book: TAX_BOOK,
    taxEntityCode: entity,
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
    memo: `세무 장부 급여 ${input.yearMonth}`,
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
    memo: `세무 장부 매출원가 ${input.yearMonth}`,
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
    memo: `세무 장부 부가세 ${input.yearMonth}`,
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
    memo: input.memo || `세무 조정 ${input.yearMonth}`,
    postedBy: input.postedBy,
    lines: input.lines,
    replace: false,
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
    memo: `세무 결산 ${input.yearMonth}`,
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
