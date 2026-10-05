/** 세무 장부(법인·연월)와 기업회계(경영 손익)를 나누는 순수 규칙. */

export const TAX_BOOK = 'tax' as const

export const TAX_SOURCE_PREFIX = 'tax_'

export const TAX_ACCOUNTS = {
  inputVat: '1360',
  outputVat: '2180',
  /** 세액만 올릴 때 차대를 맞추는 대체 계정. 손익을 바꾸지 않는다. */
  vatClearing: '1395',
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

/** 일별장부(สมุดรายวัน) UI 필터. closing은 일반분개장에 포함한다. */
export const TAX_DAY_BOOK_FILTERS = ['all', 'general', 'purchase', 'sales', 'payment', 'receipt'] as const
export type TaxDayBookFilter = (typeof TAX_DAY_BOOK_FILTERS)[number]

/** 세무 마감은 매장 accounting_periods를 잠그지 않는다. 기업 손익 집계도 바꾸지 않는다. */
export const TAX_CLOSE_LOCKS_STORE_PERIOD = false

export const TAX_BOOK_AMOUNT_TOLERANCE = 1

export function isTaxBookSourceType(sourceType: string | null | undefined): boolean {
  return String(sourceType || '').startsWith(TAX_SOURCE_PREFIX)
}

/**
 * 전표 종류 → 일별장부.
 * 일반: 기초·VAT요약·급여발생·조정·결산
 * 매입: 매입요약·원가·입고
 * 매출: 매출요약·POS
 * 지급: 시재·카드·은행·채널정산·보증금환불
 * 수취: 보증금수령 등 입금
 */
export function voucherKindForSourceType(sourceType: string | null | undefined): TaxVoucherKind {
  const s = String(sourceType || '').trim()
  if (s === 'tax_income_expense_closing' || s === 'closing_income_expense') return 'closing'
  if (s === 'tax_sales_summary') return 'sales'
  if (s === 'tax_purchase_summary' || s === 'tax_inventory_cogs') return 'purchase'
  if (
    s === 'tax_payroll' ||
    s === 'tax_vat_summary' ||
    s === 'tax_adjustment' ||
    s === 'tax_opening' ||
    s === 'depreciation' ||
    s === 'expense_accrual'
  ) {
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

export function voucherKindsForDayBook(filter: TaxDayBookFilter): TaxVoucherKind[] | null {
  if (filter === 'all') return null
  if (filter === 'general') return ['general', 'closing']
  return [filter]
}

export function voucherMatchesDayBook(kind: TaxVoucherKind, filter: TaxDayBookFilter): boolean {
  const kinds = voucherKindsForDayBook(filter)
  return kinds == null || kinds.includes(kind)
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

/** 본사 매장 선택 시 법인(tin) 세무 장부로 연결 */
const TAX_BOOK_HQ_STORE_TIN: Record<string, string> = {
  'CM True Digital': '0105566228126',
  'CM Silom': '0105568080622',
  'CM Office': '0105566137147',
  'CM Office HQ': '0105566137147',
}

/** entity:code / taxid:13digits / store:매장코드 만 세무 장부 키. All은 법인 마감 대상이 아니다. */
export function taxEntityKeyFromScope(scopeFilter: string | null | undefined): string | null {
  const raw = String(scopeFilter || '').trim()
  const lower = raw.toLowerCase()
  if (lower.startsWith('entity:')) {
    const code = raw.slice(7).trim()
    if (!code) return null
    // UI 법인 스코프(entity:choongman-0105…) → 기초 전표 키 tin:0105…
    const choongmanTin = /^choongman-(\d{13})$/i.exec(code)
    if (choongmanTin) return `tin:${choongmanTin[1]}`
    const bareTin = /^(\d{13})$/.exec(code)
    if (bareTin) return `tin:${bareTin[1]}`
    return code
  }
  if (lower.startsWith('taxid:')) {
    const tin = raw.slice(6).replace(/\D/g, '')
    return tin.length === 13 ? `tin:${tin}` : null
  }
  if (lower.startsWith('store:')) {
    const code = raw.slice(6).trim()
    if (!code) return null
    const hqTin = TAX_BOOK_HQ_STORE_TIN[code]
    return hqTin ? `tin:${hqTin}` : `store:${code}`
  }
  // 매장 코드 단독
  if (raw && raw !== 'All' && raw !== '*' && !raw.includes(':')) {
    const hqTin = TAX_BOOK_HQ_STORE_TIN[raw]
    return hqTin ? `tin:${hqTin}` : `store:${raw}`
  }
  return null
}

export const TAX_BOOK_RANGE_MAX_MONTHS = 24

export type TaxBookMonthRange =
  | { ok: false; error: 'INVALID_YEAR_MONTH' | 'RANGE_ORDER' | 'RANGE_TOO_LONG' }
  | {
      ok: true
      from: string
      to: string
      months: string[]
      startDate: string
      endDate: string
      singleMonth: boolean
    }

function monthEndDate(yearMonth: string): string {
  const y = Number(yearMonth.slice(0, 4))
  const m = Number(yearMonth.slice(5, 7))
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${yearMonth}-${String(d).padStart(2, '0')}`
}

function nextYearMonth(yearMonth: string): string {
  let y = Number(yearMonth.slice(0, 4))
  let m = Number(yearMonth.slice(5, 7)) + 1
  if (m > 12) {
    m = 1
    y += 1
  }
  return `${y}-${String(m).padStart(2, '0')}`
}

/** 장부 조회 기간. 시작·종료가 같으면 한 달이다. */
export function resolveTaxBookMonthRange(fromMonth: string, toMonth?: string): TaxBookMonthRange {
  const from = String(fromMonth || '').trim().slice(0, 7)
  const to = String(toMonth || fromMonth || '').trim().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) return { ok: false, error: 'INVALID_YEAR_MONTH' }
  if (to < from) return { ok: false, error: 'RANGE_ORDER' }
  const months: string[] = []
  let cursor = from
  while (cursor <= to) {
    months.push(cursor)
    if (months.length > TAX_BOOK_RANGE_MAX_MONTHS) return { ok: false, error: 'RANGE_TOO_LONG' }
    cursor = nextYearMonth(cursor)
  }
  return {
    ok: true,
    from,
    to,
    months,
    startDate: `${from}-01`,
    endDate: monthEndDate(to),
    singleMonth: from === to,
  }
}

/**
 * 시산·원장·세무 손익/재무상태용: 해당 연 1월 ~ 종료월(말일)까지 누적.
 * 전표 목록(기간 발생분)과 달리 기초(7/1)가 8월 조회에도 잡힌다.
 */
export function resolveTaxBookAsOfRange(toMonth: string): TaxBookMonthRange {
  const to = String(toMonth || '').trim().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(to)) return { ok: false, error: 'INVALID_YEAR_MONTH' }
  return resolveTaxBookMonthRange(`${to.slice(0, 4)}-01`, to)
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

/** 신고 매출세액·매입세액을 세무 장부 한 장에 올린다. 포스 매출을 다시 넣지 않는다. */
export function taxVatSummaryLines(input: {
  outputVat: number
  inputVat: number
  names?: { input?: string; output?: string; clearing?: string }
}): TaxJournalLineDraft[] {
  const output = roundTaxAmount(Math.max(0, input.outputVat))
  const inputVat = roundTaxAmount(Math.max(0, input.inputVat))
  if (output <= 0 && inputVat <= 0) return []
  const lines: TaxJournalLineDraft[] = []
  if (inputVat > 0) {
    lines.push({
      accountCode: TAX_ACCOUNTS.inputVat,
      accountName: input.names?.input || '매입세액',
      side: 'debit',
      amount: inputVat,
    })
  }
  if (output > 0) {
    lines.push({
      accountCode: TAX_ACCOUNTS.outputVat,
      accountName: input.names?.output || '부가세예수금',
      side: 'credit',
      amount: output,
    })
  }
  const plug = roundTaxAmount(output - inputVat)
  if (plug > 0.009) {
    lines.push({
      accountCode: TAX_ACCOUNTS.vatClearing,
      accountName: input.names?.clearing || '세무부가세대체',
      side: 'debit',
      amount: plug,
    })
  } else if (plug < -0.009) {
    lines.push({
      accountCode: TAX_ACCOUNTS.vatClearing,
      accountName: input.names?.clearing || '세무부가세대체',
      side: 'credit',
      amount: roundTaxAmount(-plug),
    })
  }
  return lines
}

/** 신고 매출 공급가를 세무 장부에 한 장으로 올린다. 포스 건별 복제 금지. */
export function taxSalesSummaryLines(input: {
  netAmount: number
  names?: { receivable?: string; revenue?: string }
}): TaxJournalLineDraft[] {
  const amount = roundTaxAmount(Math.max(0, input.netAmount))
  if (amount <= 0) return []
  return [
    {
      accountCode: '1130',
      accountName: input.names?.receivable || '매출채권',
      side: 'debit',
      amount,
    },
    {
      accountCode: TAX_ACCOUNTS.revenue,
      accountName: input.names?.revenue || '매출',
      side: 'credit',
      amount,
    },
  ]
}

/** 신고 매입 공급가(매입세금계산서)를 세무 장부에 한 장으로 올린다. 원가(5110)가 아니라 재고로 올려 COGS 전기와 겹치지 않는다. */
export function taxPurchaseSummaryLines(input: {
  netAmount: number
  names?: { inventory?: string; payable?: string }
}): TaxJournalLineDraft[] {
  const amount = roundTaxAmount(Math.max(0, input.netAmount))
  if (amount <= 0) return []
  return [
    {
      accountCode: TAX_ACCOUNTS.inventory,
      accountName: input.names?.inventory || '재고자산',
      side: 'debit',
      amount,
    },
    {
      accountCode: TAX_ACCOUNTS.payables,
      accountName: input.names?.payable || '매입채무',
      side: 'credit',
      amount,
    },
  ]
}

export type TaxBookStatementLine = {
  accountCode: string
  accountName: string | null
  amount: number
  section: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
}

export type TaxBookStatements = {
  revenue: number
  expense: number
  /** 미마감이면 수익−비용. 마감 후면 이익잉여금 대체액까지 포함한 순이익. */
  netIncome: number
  retainedEarnings: number
  assets: number
  liabilities: number
  equity: number
  unclosedProfit: number
  balanced: boolean
  incomeLines: TaxBookStatementLine[]
  balanceLines: TaxBookStatementLine[]
}

function statementSection(code: string): TaxBookStatementLine['section'] | null {
  const c = String(code || '').trim()
  if (c.startsWith('1')) return 'asset'
  if (c.startsWith('2')) return 'liability'
  if (c.startsWith('3')) return 'equity'
  if (c.startsWith('4')) return 'revenue'
  if (c.startsWith('5')) return 'expense'
  return null
}

function normalAmount(section: TaxBookStatementLine['section'], debit: number, credit: number): number {
  const netDebit = roundTaxAmount((Number(debit) || 0) - (Number(credit) || 0))
  if (section === 'asset' || section === 'expense') return netDebit
  return roundTaxAmount(-netDebit)
}

/** 세무 손익·재무상태는 book=tax 시산만 사용한다. 기업회계 집계를 읽지 않는다. */
export function buildTaxBookStatements(
  rows: { accountCode: string; accountName?: string | null; debit: number; credit: number }[]
): TaxBookStatements {
  const incomeLines: TaxBookStatementLine[] = []
  const balanceLines: TaxBookStatementLine[] = []
  let revenue = 0
  let expense = 0
  let assets = 0
  let liabilities = 0
  let equity = 0
  let retainedEarnings = 0
  for (const row of rows) {
    const section = statementSection(row.accountCode)
    if (!section) continue
    const amount = normalAmount(section, row.debit, row.credit)
    if (Math.abs(amount) < 0.005) continue
    const line: TaxBookStatementLine = {
      accountCode: row.accountCode,
      accountName: row.accountName ?? null,
      amount,
      section,
    }
    if (section === 'revenue' || section === 'expense') incomeLines.push(line)
    else balanceLines.push(line)
    if (section === 'revenue') revenue += amount
    else if (section === 'expense') expense += amount
    else if (section === 'asset') assets += amount
    else if (section === 'liability') liabilities += amount
    else equity += amount
    if (row.accountCode === TAX_ACCOUNTS.retainedEarnings) retainedEarnings += amount
  }
  revenue = roundTaxAmount(revenue)
  expense = roundTaxAmount(expense)
  assets = roundTaxAmount(assets)
  liabilities = roundTaxAmount(liabilities)
  equity = roundTaxAmount(equity)
  retainedEarnings = roundTaxAmount(retainedEarnings)
  const unclosedProfit = roundTaxAmount(revenue - expense)
  const netIncome = roundTaxAmount(unclosedProfit + retainedEarnings)
  const balanced = taxAmountsClose(assets, liabilities + equity + unclosedProfit, 0.05)
  return {
    revenue,
    expense,
    netIncome,
    retainedEarnings,
    assets,
    liabilities,
    equity,
    unclosedProfit,
    balanced,
    incomeLines,
    balanceLines,
  }
}

export type LockedTaxBookMonth = {
  closed: boolean
  schemaReady: boolean
  netIncome: number
  entryCount: number
}

/** 기간의 달이 모두 세무 마감일 때만 그 순이익을 법인세 출발 금액으로 쓴다. */
export function preferLockedTaxBookProfit(input: {
  journalRevenue: number
  journalExpense: number
  journalEntryCount: number
  months: LockedTaxBookMonth[]
}): {
  revenue: number
  expense: number
  entryCount: number
  source: 'tax_book' | 'journals'
  partial: boolean
} {
  const journals = {
    revenue: roundTaxAmount(input.journalRevenue),
    expense: roundTaxAmount(input.journalExpense),
    entryCount: input.journalEntryCount,
    source: 'journals' as const,
    partial: input.months.some((m) => m.closed),
  }
  if (!input.months.length || !input.months.every((m) => m.schemaReady && m.closed)) return journals
  return {
    revenue: roundTaxAmount(input.months.reduce((s, m) => s + m.netIncome, 0)),
    expense: 0,
    entryCount: input.months.reduce((s, m) => s + m.entryCount, 0),
    source: 'tax_book',
    partial: false,
  }
}

export function taxJournalBalanced(lines: TaxJournalLineDraft[]): boolean {
  const debit = lines.filter((l) => l.side === 'debit').reduce((s, l) => s + l.amount, 0)
  const credit = lines.filter((l) => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
  return lines.length >= 2 && taxAmountsClose(debit, credit, 0.01)
}
