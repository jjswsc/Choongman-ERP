import { computeIncomeStatementReport } from '@/lib/accounting-reports'
import {
  isPayrollRecordIncludedInPl,
  payrollRecordGrossExpenseBaht,
} from '@/lib/accounting-payroll-pl'
import { supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { buildTaxManagementBridge, type TaxBridgeReport } from '@/lib/tax-management-bridge'
import { roundTaxAmount, taxEntityKeyFromScope } from '@/lib/tax-book'
import { readTaxAccountingPeriod } from '@/lib/tax-book-period-server'
import {
  loadTaxBookJournalHeads,
  loadTaxBookLines,
  summarizeTaxBookTrial,
  taxBookClosingLines,
} from '@/lib/tax-book-server'
import { createTaxStoreScopeMatcher, resolveTaxScopeStoreCodes } from '@/lib/tax-entity-scope'
import { isPosAutoVatOutputRow } from '@/lib/vat-ledger-pos'
import { computeTrialBalanceReport } from '@/lib/trial-balance-report'

export type TaxManagementBridgePayload = {
  yearMonth: string
  scopeFilter: string
  taxEntityCode: string | null
  storeCount: number | null
  schemaReady: boolean
  periodClosed: boolean
  managementNetProfit: number
  report: TaxBridgeReport
  closingNetIncome: number
  closingLineCount: number
}

function emptyBridge(schemaReady: boolean): TaxBridgeReport {
  return buildTaxManagementBridge({
    schemaReady,
    management: { sales: 0, cogs: 0, payroll: 0, netProfit: 0 },
    journalRows: [],
    taxBookRows: [],
    taxBookDebit: 0,
    taxBookCredit: 0,
    taxEntryCount: 0,
    filing: {
      outputVat: 0,
      outputNet: 0,
      inputNet: 0,
      posOutputNet: 0,
      taxInvoiceOutputNet: 0,
      inputVat: 0,
      payrollWht: 0,
    },
  })
}

export async function loadTaxManagementBridge(input: {
  yearMonth: string
  scopeFilter: string
  userRole?: string
  userStore?: string
  allowedStores?: string[]
  tenantId?: string | null
}): Promise<TaxManagementBridgePayload> {
  const yearMonth = String(input.yearMonth || '').slice(0, 7)
  const scopeFilter = String(input.scopeFilter || '').trim() || 'All'
  const taxEntityCode = taxEntityKeyFromScope(scopeFilter)
  const resolved = await resolveTaxScopeStoreCodes(scopeFilter, input.tenantId)
  const storeCodes = resolved.storeCodes
  if (storeCodes && storeCodes.length === 0) {
    const period = taxEntityCode ? await readTaxAccountingPeriod(taxEntityCode, yearMonth) : { schemaReady: true, isClosed: false }
    return {
      yearMonth,
      scopeFilter,
      taxEntityCode,
      storeCount: 0,
      schemaReady: period.schemaReady,
      periodClosed: period.isClosed,
      managementNetProfit: 0,
      report: emptyBridge(period.schemaReady),
      closingNetIncome: 0,
      closingLineCount: 0,
    }
  }

  const storeFilter =
    storeCodes == null ? 'All' : storeCodes.length === 1 ? storeCodes[0]! : storeCodes.join(',')
  const auth = {
    yearMonth,
    storeFilter,
    userRole: input.userRole,
    userStore: input.userStore,
    allowedStores: input.allowedStores,
    tenantId: input.tenantId || undefined,
  }
  const [income, trial, filing, payroll] = await Promise.all([
    computeIncomeStatementReport(auth),
    computeTrialBalanceReport(auth),
    sumVatFiling(yearMonth, scopeFilter, input.tenantId),
    sumPayrollFiling(yearMonth, scopeFilter, input.tenantId),
  ])

  let schemaReady = true
  let taxRows: ReturnType<typeof summarizeTaxBookTrial>['rows'] = []
  let taxDebit = 0
  let taxCredit = 0
  let taxEntryCount = 0
  if (taxEntityCode) {
    const heads = await loadTaxBookJournalHeads({ taxEntityCode, yearMonth })
    schemaReady = heads.schemaReady
    if (schemaReady) {
      const lines = await loadTaxBookLines(heads.heads.map((h) => Number(h.id || 0)))
      const trialTax = summarizeTaxBookTrial(lines)
      taxRows = trialTax.rows
      taxDebit = trialTax.totalDebit
      taxCredit = trialTax.totalCredit
      taxEntryCount = heads.heads.length
    }
  }
  const period = taxEntityCode
    ? await readTaxAccountingPeriod(taxEntityCode, yearMonth)
    : { schemaReady: true, isClosed: false }
  if (!period.schemaReady) schemaReady = false

  const report = buildTaxManagementBridge({
    schemaReady,
    management: {
      sales: income.sales,
      cogs: income.cogs,
      payroll: income.expenseBreakdown?.payrollExpense || 0,
      netProfit: income.netProfit,
    },
    journalRows: trial.rows,
    taxBookRows: taxRows,
    taxBookDebit: taxDebit,
    taxBookCredit: taxCredit,
    taxEntryCount,
    filing: {
      outputVat: filing.outputVat,
      outputNet: filing.outputNet,
      inputNet: filing.inputNet,
      posOutputNet: filing.posOutputNet,
      taxInvoiceOutputNet: filing.taxInvoiceOutputNet,
      inputVat: filing.inputVat,
      payrollWht: payroll.wht,
    },
  })
  const closing = taxBookClosingLines(taxRows)
  return {
    yearMonth,
    scopeFilter,
    taxEntityCode,
    storeCount: storeCodes ? storeCodes.length : null,
    schemaReady,
    periodClosed: period.isClosed,
    managementNetProfit: roundTaxAmount(income.netProfit),
    report,
    closingNetIncome: closing.netIncome,
    closingLineCount: closing.lineCount,
  }
}

async function sumVatFiling(
  yearMonth: string,
  scopeFilter: string,
  tenantId?: string | null
): Promise<{
  outputVat: number
  outputNet: number
  inputVat: number
  inputNet: number
  posOutputNet: number
  taxInvoiceOutputNet: number
}> {
  const matcher = await createTaxStoreScopeMatcher(scopeFilter, tenantId)
  let rows: {
    direction?: string | null
    vat_amount?: number | string | null
    net_amount?: number | string | null
    store_name?: string | null
    vat_status?: string | null
    memo?: string | null
    counterparty_name?: string | null
  }[] = []
  try {
    rows = (await supabaseSelectFilterAllPages(
      'vat_ledger_entries',
      `tax_month=eq.${encodeURIComponent(yearMonth)}`,
      {
        select: 'direction,vat_amount,net_amount,store_name,vat_status,memo,counterparty_name',
        pageSize: 4000,
        maxRows: 200000,
      }
    )) as typeof rows
  } catch {
    rows = []
  }
  let outputVat = 0
  let outputNet = 0
  let inputVat = 0
  let inputNet = 0
  let posOutputNet = 0
  let taxInvoiceOutputNet = 0
  for (const row of rows) {
    const status = String(row.vat_status || '').toLowerCase()
    if (/void|cancel|삭제|취소/.test(status)) continue
    if (!(await matcher({ storeName: row.store_name, storeCode: row.store_name }))) continue
    const vat = Math.abs(Number(row.vat_amount) || 0)
    const net = Math.abs(Number(row.net_amount) || 0)
    const direction = String(row.direction || '').toLowerCase()
    if (direction === 'output') {
      outputVat += vat
      outputNet += net
      if (isPosAutoVatOutputRow(row)) posOutputNet += net
      else taxInvoiceOutputNet += net
    } else if (direction === 'input') {
      inputVat += vat
      inputNet += net
    }
  }
  return {
    outputVat: roundTaxAmount(outputVat),
    outputNet: roundTaxAmount(outputNet),
    inputVat: roundTaxAmount(inputVat),
    inputNet: roundTaxAmount(inputNet),
    posOutputNet: roundTaxAmount(posOutputNet),
    taxInvoiceOutputNet: roundTaxAmount(taxInvoiceOutputNet),
  }
}

async function sumPayrollFiling(
  yearMonth: string,
  scopeFilter: string,
  tenantId?: string | null
): Promise<{ gross: number; wht: number; sso: number }> {
  const matcher = await createTaxStoreScopeMatcher(scopeFilter, tenantId)
  let rows: {
    store?: string | null
    net_pay?: number | null
    sso?: number | null
    tax?: number | null
    status?: string | null
  }[] = []
  try {
    rows = (await supabaseSelectFilterAllPages('payroll_records', `month=eq.${encodeURIComponent(yearMonth)}`, {
      select: 'store,net_pay,sso,tax,status',
      pageSize: 4000,
      maxRows: 200000,
    })) as typeof rows
  } catch {
    rows = []
  }
  let gross = 0
  let wht = 0
  let sso = 0
  for (const row of rows) {
    if (!isPayrollRecordIncludedInPl(row.status)) continue
    if (!(await matcher({ storeName: row.store, storeCode: row.store }))) continue
    gross += payrollRecordGrossExpenseBaht(row)
    wht += Math.max(0, Number(row.tax) || 0)
    sso += Math.max(0, Number(row.sso) || 0)
  }
  return { gross: roundTaxAmount(gross), wht: roundTaxAmount(wht), sso: roundTaxAmount(sso) }
}

export async function loadTaxPayrollTotals(input: {
  yearMonth: string
  scopeFilter: string
  tenantId?: string | null
}): Promise<{ gross: number; wht: number; sso: number }> {
  return sumPayrollFiling(input.yearMonth, input.scopeFilter, input.tenantId)
}
