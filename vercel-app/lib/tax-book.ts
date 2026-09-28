/** 세무 장부(법인·연월)와 기업회계(경영 손익)를 나누는 순수 규칙. */

export const TAX_BOOK = 'tax' as const

export const TAX_SOURCE_PREFIX = 'tax_'

export const TAX_ACCOUNTS = {
  inputVat: '1360',
  outputVat: '2180',
  wht: '2190',
  sso: '2195',
  payables: '2110',
  inventory: '1460',
  revenue: '4110',
  cogs: '5110',
  salary: '5310',
  retainedEarnings: '3120',
} as const

export const TAX_VOUCHER_KINDS = ['sales', 'purchase', 'receipt', 'payment', 'general', 'closing'] as const
export type TaxVoucherKind = (typeof TAX_VOUCHER_KINDS)[number]

/** 세무 마감은 매장 accounting_periods를 잠그지 않는다. 기업 손익 집계도 바꾸지 않는다. */
export const TAX_CLOSE_LOCKS_STORE_PERIOD = false

export const TAX_BOOK_AMOUNT_TOLERANCE = 1

export function isTaxBookSourceType(sourceType: string | null | undefined): boolean {
  return String(sourceType || '').startsWith(TAX_SOURCE_PREFIX)
}

export function voucherKindForSourceType(sourceType: string | null | undefined): TaxVoucherKind {
  const s = String(sourceType || '').trim()
  if (s === 'tax_income_expense_closing' || s === 'closing_income_expense') return 'closing'
  if (s === 'tax_payroll' || s === 'tax_inventory_cogs' || s === 'tax_adjustment' || s === 'depreciation' || s === 'expense_accrual') {
    return 'general'
  }
  if (s === 'pos_order' || s === 'pos_day_close' || s === 'pos_order_reversal') return 'sales'
  if (s === 'store_purchase') return 'purchase'
  if (s === 'pos_deposit_receive') return 'receipt'
  if (s === 'pos_deposit_refund' || s === 'pos_deposit_forfeit') return 'payment'
  if (s === 'petty_cash' || s === 'card_transaction') return 'payment'
  if (s === 'bank_transaction' || s === 'pos_channel_settlement') return 'payment'
  return 'general'
}

const VOUCHER_PREFIX: Record<TaxVoucherKind, string> = {
  sales: 'SV',
  purchase: 'PU',
  receipt: 'RC',
  payment: 'PM',
  general: 'JV',
  closing: 'CL',
}

export function formatTaxVoucherNo(kind: TaxVoucherKind, yearMonth: string, seq: number): string {
  const ym = String(yearMonth || '').replace('-', '').slice(0, 6)
  const n = Math.max(1, Math.floor(seq) || 1)
  return `${VOUCHER_PREFIX[kind]}${ym}${String(n).padStart(4, '0')}`
}

/** entity:code / taxid:13digits 만 세무 장부 키. 매장 단건·All은 법인 마감 대상이 아니다. */
export function taxEntityKeyFromScope(scopeFilter: string | null | undefined): string | null {
  const raw = String(scopeFilter || '').trim()
  const lower = raw.toLowerCase()
  if (lower.startsWith('entity:')) {
    const code = raw.slice(7).trim()
    return code || null
  }
  if (lower.startsWith('taxid:')) {
    const tin = raw.slice(6).replace(/\D/g, '')
    return tin.length === 13 ? `tin:${tin}` : null
  }
  return null
}

export function roundTaxAmount(v: number): number {
  return Math.round((Number(v) || 0) * 100) / 100
}

export function taxAmountsClose(a: number, b: number, tolerance = TAX_BOOK_AMOUNT_TOLERANCE): boolean {
  return Math.abs(roundTaxAmount(a) - roundTaxAmount(b)) <= tolerance
}

export type TaxBookRecognitionInput = {
  schemaReady: boolean
  taxEntryCount: number
  totalDebit: number
  totalCredit: number
  outputVatAccount: number
  inputVatAccount: number
  filingOutputVat: number
  filingInputVat: number
}

export type TaxBookRecognition = {
  recognized: boolean
  trialBalanced: boolean
  outputVatTied: boolean
  inputVatTied: boolean
}

/** 합격은 기업 손익과 같은 숫자가 아니라, 세무 시산 차대와 부가세 대사다. */
export function recognizeTaxBook(input: TaxBookRecognitionInput): TaxBookRecognition {
  const trialBalanced = taxAmountsClose(input.totalDebit, input.totalCredit, 0.01)
  const outputVatTied = taxAmountsClose(input.outputVatAccount, input.filingOutputVat)
  const inputVatTied = taxAmountsClose(input.inputVatAccount, input.filingInputVat)
  const recognized =
    input.schemaReady &&
    input.taxEntryCount > 0 &&
    trialBalanced &&
    outputVatTied &&
    inputVatTied
  return { recognized, trialBalanced, outputVatTied, inputVatTied }
}

export type TaxJournalLineDraft = {
  accountCode: string
  accountName: string
  side: 'debit' | 'credit'
  amount: number
}

export function taxPayrollJournalLines(input: {
  gross: number
  tax: number
  sso: number
  salaryName?: string
  whtName?: string
  ssoName?: string
  payableName?: string
}): TaxJournalLineDraft[] {
  const gross = roundTaxAmount(Math.max(0, input.gross))
  const tax = roundTaxAmount(Math.max(0, input.tax))
  const sso = roundTaxAmount(Math.max(0, input.sso))
  if (gross <= 0) return []
  const creditTax = Math.min(tax, gross)
  const creditSso = Math.min(sso, roundTaxAmount(gross - creditTax))
  const netPay = roundTaxAmount(gross - creditTax - creditSso)
  const lines: TaxJournalLineDraft[] = [
    {
      accountCode: TAX_ACCOUNTS.salary,
      accountName: input.salaryName || '급여',
      side: 'debit',
      amount: gross,
    },
  ]
  if (creditTax > 0) {
    lines.push({
      accountCode: TAX_ACCOUNTS.wht,
      accountName: input.whtName || '원천세예수금',
      side: 'credit',
      amount: creditTax,
    })
  }
  if (creditSso > 0) {
    lines.push({
      accountCode: TAX_ACCOUNTS.sso,
      accountName: input.ssoName || '사회보험예수금',
      side: 'credit',
      amount: creditSso,
    })
  }
  if (netPay > 0) {
    lines.push({
      accountCode: TAX_ACCOUNTS.payables,
      accountName: input.payableName || '매입채무',
      side: 'credit',
      amount: netPay,
    })
  }
  return lines
}

export function taxInventoryCogsLines(cogs: number, names?: { cogs?: string; inventory?: string }): TaxJournalLineDraft[] {
  const amount = roundTaxAmount(Math.max(0, cogs))
  if (amount <= 0) return []
  return [
    {
      accountCode: TAX_ACCOUNTS.cogs,
      accountName: names?.cogs || '매출원가',
      side: 'debit',
      amount,
    },
    {
      accountCode: TAX_ACCOUNTS.inventory,
      accountName: names?.inventory || '재고자산',
      side: 'credit',
      amount,
    },
  ]
}

export function taxJournalBalanced(lines: TaxJournalLineDraft[]): boolean {
  const debit = lines.filter((l) => l.side === 'debit').reduce((s, l) => s + l.amount, 0)
  const credit = lines.filter((l) => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
  return lines.length >= 2 && taxAmountsClose(debit, credit, 0.01)
}
