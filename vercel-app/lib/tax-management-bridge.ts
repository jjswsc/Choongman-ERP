import type { TrialBalanceRow } from '@/lib/trial-balance-report'
import {
  TAX_ACCOUNTS,
  recognizeTaxBook,
  roundTaxAmount,
  taxAmountsClose,
  type TaxBookRecognition,
} from '@/lib/tax-book'

export type TaxBridgeLineKey = 'sales' | 'cogs' | 'payroll' | 'outputVat' | 'inputVat' | 'pnd1' | 'net'

export type TaxBridgeReason =
  | 'pos_vs_tax_invoice'
  | 'inventory_vs_purchase_invoice'
  | 'not_on_tax_book'
  | 'payroll_not_posted'
  | 'vat_not_posted'
  | 'wht_not_posted'
  | 'nondeductible_or_limit'

export type TaxBridgeLine = {
  key: TaxBridgeLineKey
  management: number
  journal: number
  filing: number | null
  taxBook: number
  /** 기업회계 − 세무 장부. 세무 장부가 비어 있으면 기업회계 − 현재 분개. */
  diff: number
  hole: boolean
  /** 차이가 오류가 아닌 이유. 구멍이 없으면 null. */
  reason: TaxBridgeReason | null
}

export type TaxBridgeInput = {
  schemaReady: boolean
  management: {
    sales: number
    cogs: number
    payroll: number
    netProfit: number
  }
  journalRows: TrialBalanceRow[]
  taxBookRows: TrialBalanceRow[]
  taxBookDebit: number
  taxBookCredit: number
  taxEntryCount: number
  filing: {
    outputVat: number
    outputNet: number
    /** 매입세금계산서 공급가 */
    inputNet: number
    /** 포스 자동 매출 공급가 */
    posOutputNet: number
    /** 포스 자동을 뺀 매출 공급가(세금계산서 등) */
    taxInvoiceOutputNet: number
    inputVat: number
    payrollWht: number
  }
}

export type TaxBridgeReport = {
  lines: TaxBridgeLine[]
  holes: TaxBridgeLineKey[]
  recognition: TaxBookRecognition
  salesSplit: { posNet: number; taxInvoiceNet: number; purchaseNet: number }
}

function signedBalance(row: TrialBalanceRow | undefined, normal: 'debit' | 'credit'): number {
  if (!row) return 0
  const net = (Number(row.debit) || 0) - (Number(row.credit) || 0)
  return roundTaxAmount(normal === 'debit' ? net : -net)
}

function sumPrefix(rows: TrialBalanceRow[], prefix: string, normal: 'debit' | 'credit'): number {
  let total = 0
  for (const row of rows) {
    if (!String(row.accountCode || '').startsWith(prefix)) continue
    total += signedBalance(row, normal)
  }
  return roundTaxAmount(total)
}

function accountBalance(rows: TrialBalanceRow[], code: string, normal: 'debit' | 'credit'): number {
  const row = rows.find((r) => String(r.accountCode) === code)
  return signedBalance(row, normal)
}

function line(input: {
  key: TaxBridgeLineKey
  management: number
  journal: number
  filing: number | null
  taxBook: number
  schemaReady: boolean
}): TaxBridgeLine {
  const management = roundTaxAmount(input.management)
  const journal = roundTaxAmount(input.journal)
  const taxBook = roundTaxAmount(input.taxBook)
  const filing = input.filing == null ? null : roundTaxAmount(input.filing)
  const compareTo = input.schemaReady ? taxBook : journal
  const diff = roundTaxAmount(management - compareTo)
  const hole =
    !taxAmountsClose(management, journal) ||
    (filing != null && input.schemaReady && !taxAmountsClose(filing, taxBook)) ||
    (input.schemaReady && !taxAmountsClose(management, taxBook) && input.key !== 'outputVat' && input.key !== 'inputVat' && input.key !== 'pnd1')
  return { key: input.key, management, journal, filing, taxBook, diff, hole, reason: null }
}

export function buildTaxManagementBridge(input: TaxBridgeInput): TaxBridgeReport {
  const journalSales = sumPrefix(input.journalRows, '4', 'credit')
  const taxSales = sumPrefix(input.taxBookRows, '4', 'credit')
  const journalCogs = accountBalance(input.journalRows, TAX_ACCOUNTS.cogs, 'debit')
  const taxCogs = accountBalance(input.taxBookRows, TAX_ACCOUNTS.cogs, 'debit')
  const journalPayroll = accountBalance(input.journalRows, TAX_ACCOUNTS.salary, 'debit')
  const taxPayroll = accountBalance(input.taxBookRows, TAX_ACCOUNTS.salary, 'debit')
  const journalOutputVat = accountBalance(input.journalRows, TAX_ACCOUNTS.outputVat, 'credit')
  const taxOutputVat = accountBalance(input.taxBookRows, TAX_ACCOUNTS.outputVat, 'credit')
  const journalInputVat = accountBalance(input.journalRows, TAX_ACCOUNTS.inputVat, 'debit')
  const taxInputVat = accountBalance(input.taxBookRows, TAX_ACCOUNTS.inputVat, 'debit')
  const journalWht = accountBalance(input.journalRows, TAX_ACCOUNTS.wht, 'credit')
  const taxWht = accountBalance(input.taxBookRows, TAX_ACCOUNTS.wht, 'credit')
  const journalNet = roundTaxAmount(journalSales - sumPrefix(input.journalRows, '5', 'debit'))
  const taxNet = roundTaxAmount(taxSales - sumPrefix(input.taxBookRows, '5', 'debit'))

  const lines: TaxBridgeLine[] = [
    line({
      key: 'sales',
      management: input.management.sales,
      journal: journalSales,
      filing: input.filing.outputNet,
      taxBook: taxSales,
      schemaReady: input.schemaReady,
    }),
    line({
      key: 'cogs',
      management: input.management.cogs,
      journal: journalCogs,
      filing: input.filing.inputNet,
      taxBook: taxCogs,
      schemaReady: input.schemaReady,
    }),
    line({
      key: 'payroll',
      management: input.management.payroll,
      journal: journalPayroll,
      filing: null,
      taxBook: taxPayroll,
      schemaReady: input.schemaReady,
    }),
    line({
      key: 'outputVat',
      management: 0,
      journal: journalOutputVat,
      filing: input.filing.outputVat,
      taxBook: taxOutputVat,
      schemaReady: input.schemaReady,
    }),
    line({
      key: 'inputVat',
      management: 0,
      journal: journalInputVat,
      filing: input.filing.inputVat,
      taxBook: taxInputVat,
      schemaReady: input.schemaReady,
    }),
    line({
      key: 'pnd1',
      management: 0,
      journal: journalWht,
      filing: input.filing.payrollWht,
      taxBook: taxWht,
      schemaReady: input.schemaReady,
    }),
    line({
      key: 'net',
      management: input.management.netProfit,
      journal: journalNet,
      filing: null,
      taxBook: taxNet,
      schemaReady: input.schemaReady,
    }),
  ]

  const outputLine = lines.find((l) => l.key === 'outputVat')!
  const inputLine = lines.find((l) => l.key === 'inputVat')!
  outputLine.hole = input.schemaReady ? !taxAmountsClose(outputLine.filing || 0, outputLine.taxBook) : !taxAmountsClose(outputLine.filing || 0, outputLine.journal)
  inputLine.hole = input.schemaReady ? !taxAmountsClose(inputLine.filing || 0, inputLine.taxBook) : !taxAmountsClose(inputLine.filing || 0, inputLine.journal)
  outputLine.diff = roundTaxAmount((outputLine.filing || 0) - (input.schemaReady ? outputLine.taxBook : outputLine.journal))
  inputLine.diff = roundTaxAmount((inputLine.filing || 0) - (input.schemaReady ? inputLine.taxBook : inputLine.journal))

  const pnd = lines.find((l) => l.key === 'pnd1')!
  pnd.hole = input.schemaReady ? !taxAmountsClose(pnd.filing || 0, pnd.taxBook) : !taxAmountsClose(pnd.filing || 0, pnd.journal)
  pnd.diff = roundTaxAmount((pnd.filing || 0) - (input.schemaReady ? pnd.taxBook : pnd.journal))

  attachBridgeReasons(lines)

  const recognition = recognizeTaxBook({
    schemaReady: input.schemaReady,
    taxEntryCount: input.taxEntryCount,
    totalDebit: input.taxBookDebit,
    totalCredit: input.taxBookCredit,
    outputVatAccount: taxOutputVat,
    inputVatAccount: taxInputVat,
    filingOutputVat: input.filing.outputVat,
    filingInputVat: input.filing.inputVat,
  })

  return {
    lines,
    holes: lines.filter((l) => l.hole).map((l) => l.key),
    recognition,
    salesSplit: {
      posNet: roundTaxAmount(input.filing.posOutputNet || 0),
      taxInvoiceNet: roundTaxAmount(input.filing.taxInvoiceOutputNet || 0),
      purchaseNet: roundTaxAmount(input.filing.inputNet || 0),
    },
  }
}

function attachBridgeReasons(lines: TaxBridgeLine[]): void {
  const byKey = new Map(lines.map((ln) => [ln.key, ln]))
  for (const ln of lines) {
    if (!ln.hole) {
      ln.reason = null
      continue
    }
    if (ln.key === 'sales') {
      ln.reason = taxAmountsClose(ln.management, ln.filing ?? ln.management) ? 'not_on_tax_book' : 'pos_vs_tax_invoice'
    } else if (ln.key === 'cogs') {
      ln.reason = taxAmountsClose(ln.management, ln.filing ?? ln.management) ? 'not_on_tax_book' : 'inventory_vs_purchase_invoice'
    } else if (ln.key === 'payroll') {
      ln.reason = 'payroll_not_posted'
    } else if (ln.key === 'outputVat' || ln.key === 'inputVat') {
      ln.reason = 'vat_not_posted'
    } else if (ln.key === 'pnd1') {
      ln.reason = 'wht_not_posted'
    } else if (ln.key === 'net') {
      const explained = Boolean(byKey.get('sales')?.hole || byKey.get('cogs')?.hole || byKey.get('payroll')?.hole)
      ln.reason = explained ? null : 'nondeductible_or_limit'
    }
  }
}
