import { getThaiTaxFilingPeriodRange } from '@/lib/thai-tax-period'
import { normalizeIncomeScope, type IncomeScopeInput } from '@/lib/accounting-reports'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'

type JournalEntryLite = {
  id?: number
  store_name?: string | null
}

type JournalLineLite = {
  account_code?: string
  side?: string
  amount?: number | string
}

type TaxAdjustmentRow = {
  adjustment_type?: string
  item_name?: string
  amount?: number | string
  memo?: string | null
}

export type CorporateTaxComputation = {
  periodType: 'monthly' | 'half_year' | 'annual'
  filingForm: 'pnd50' | 'pnd51'
  periodKey: string
  months: string[]
  storeFilter: string
  accountingProfit: number
  taxAddBack: number
  taxDeduction: number
  taxableIncome: number
  taxRate: number
  estimatedTax: number
  projectedAnnualTaxableIncome: number
  filingTaxDue: number
  pdfMeta: {
    formCode: 'P.N.D.50' | 'P.N.D.51'
    periodLabel: string
    periodStartMonth: string
    periodEndMonth: string
    generatedAtBangkok: string
    storeScopeLabel: string
  }
  validation: {
    isValid: boolean
    errors: string[]
    warnings: string[]
  }
  adjustments: {
    type: 'add_back' | 'deduction'
    itemName: string
    amount: number
    memo: string | null
  }[]
}

function buildCorporateTaxPeriodLabel(period: {
  periodType: 'monthly' | 'half_year' | 'annual'
  startMonth: string
  endMonth: string
  periodKey: string
}): string {
  if (period.periodType === 'monthly') return period.startMonth
  if (period.periodType === 'half_year') return `${period.periodKey} (${period.startMonth} ~ ${period.endMonth})`
  return `${period.periodKey} (${period.startMonth} ~ ${period.endMonth})`
}

function isStoreMatched(storeName: string | null | undefined, filter: string): boolean {
  if (!filter || filter === 'All') return true
  return String(storeName || '').trim().toLowerCase() === filter.trim().toLowerCase()
}

function toFixed2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

function monthStart(month: string): string {
  return `${month}-01`
}

function monthEnd(month: string): string {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${month}-${String(d).padStart(2, '0')}`
}

export async function computeCorporateTaxComputation(input: IncomeScopeInput & {
  periodType?: 'monthly' | 'half_year' | 'annual'
  taxRate?: number
}): Promise<CorporateTaxComputation> {
  const scope = normalizeIncomeScope(input)
  const period = getThaiTaxFilingPeriodRange({
    yearMonth: scope.yearMonth,
    periodType: input.periodType || 'monthly',
  })
  const startDate = monthStart(period.startMonth)
  const endDate = monthEnd(period.endMonth)
  const taxRate = Number(input.taxRate)
  const appliedTaxRate = Number.isFinite(taxRate) && taxRate >= 0 ? taxRate : 0.2

  const entries = (await supabaseSelectFilter(
    'journal_entries',
    `accounting_date=gte.${encodeURIComponent(startDate)}&accounting_date=lte.${encodeURIComponent(endDate)}`,
    { select: 'id,store_name', limit: 100000 }
  )) as JournalEntryLite[] | null
  const entryIds = (entries || [])
    .filter((e) => isStoreMatched(e.store_name, scope.storeFilter))
    .map((e) => Number(e.id || 0))
    .filter((id) => id > 0)
  const idList = entryIds.join(',')
  const lines = entryIds.length
    ? ((await supabaseSelectFilter('journal_lines', `journal_entry_id=in.(${idList})`, {
        select: 'account_code,side,amount',
        limit: 300000,
      })) as JournalLineLite[] | null)
    : []

  let revenue = 0
  let expense = 0
  for (const ln of lines || []) {
    const code = String(ln.account_code || '').trim()
    if (!code) continue
    const amt = Math.abs(Number(ln.amount) || 0)
    const side = String(ln.side || '').toLowerCase()
    if (code.startsWith('4')) {
      if (side === 'credit') revenue += amt
      else revenue -= amt
    } else if (code.startsWith('5')) {
      if (side === 'debit') expense += amt
      else expense -= amt
    }
  }
  const accountingProfit = revenue - expense

  let adjustmentRows: TaxAdjustmentRow[] = []
  try {
    const periodKeyOrParts = [
      `period_key.eq.${encodeURIComponent(period.periodKey)}`,
      ...period.months.map((m) => `period_key.eq.${encodeURIComponent(String(m).slice(0, 7))}`),
    ]
    const raw = (await supabaseSelectFilter(
      'corporate_tax_adjustments',
      `period_type=eq.${period.periodType}&or=(${periodKeyOrParts.join(',')})`,
      { select: 'adjustment_type,item_name,amount,memo', limit: 10000 }
    )) as TaxAdjustmentRow[] | null
    adjustmentRows = Array.isArray(raw) ? raw : []
  } catch {
    adjustmentRows = []
  }

  const adjustments: CorporateTaxComputation['adjustments'] = []
  let taxAddBack = 0
  let taxDeduction = 0
  for (const row of adjustmentRows || []) {
    const type = String(row.adjustment_type || '').toLowerCase() === 'deduction' ? 'deduction' : 'add_back'
    const amount = Math.abs(Number(row.amount) || 0)
    adjustments.push({
      type,
      itemName: String(row.item_name || type),
      amount,
      memo: row.memo != null ? String(row.memo) : null,
    })
    if (type === 'add_back') taxAddBack += amount
    else taxDeduction += amount
  }

  const taxableIncome = Math.max(0, accountingProfit + taxAddBack - taxDeduction)
  const projectedAnnualTaxableIncome = period.periodType === 'half_year' ? taxableIncome * 2 : taxableIncome
  const estimatedTax = projectedAnnualTaxableIncome * appliedTaxRate
  const filingTaxDue = period.periodType === 'half_year' ? estimatedTax * 0.5 : estimatedTax
  const filingForm: CorporateTaxComputation['filingForm'] = period.periodType === 'half_year' ? 'pnd51' : 'pnd50'
  const validationErrors: string[] = []
  const validationWarnings: string[] = []
  if (!period.periodKey) validationErrors.push('MISSING_PERIOD_KEY')
  if (!period.startMonth || !period.endMonth) validationErrors.push('MISSING_PERIOD_RANGE')
  if (!Number.isFinite(appliedTaxRate) || appliedTaxRate < 0) validationErrors.push('INVALID_TAX_RATE')
  if (!Number.isFinite(taxableIncome) || taxableIncome < 0) validationErrors.push('INVALID_TAXABLE_INCOME')
  if (!Number.isFinite(filingTaxDue) || filingTaxDue < 0) validationErrors.push('INVALID_FILING_TAX_DUE')
  if (!entryIds.length) validationWarnings.push('NO_JOURNAL_ENTRIES_IN_PERIOD')
  if (period.periodType === 'annual' && period.months.length !== 12) validationWarnings.push('ANNUAL_MONTH_COUNT_MISMATCH')
  if (period.periodType === 'half_year' && period.months.length !== 6) {
    validationWarnings.push('HALF_YEAR_MONTH_COUNT_MISMATCH')
  }

  return {
    periodType: period.periodType,
    filingForm,
    periodKey: period.periodKey,
    months: period.months,
    storeFilter: scope.storeFilter,
    accountingProfit: toFixed2(accountingProfit),
    taxAddBack: toFixed2(taxAddBack),
    taxDeduction: toFixed2(taxDeduction),
    taxableIncome: toFixed2(taxableIncome),
    taxRate: appliedTaxRate,
    estimatedTax: toFixed2(estimatedTax),
    projectedAnnualTaxableIncome: toFixed2(projectedAnnualTaxableIncome),
    filingTaxDue: toFixed2(filingTaxDue),
    pdfMeta: {
      formCode: filingForm === 'pnd51' ? 'P.N.D.51' : 'P.N.D.50',
      periodLabel: buildCorporateTaxPeriodLabel(period),
      periodStartMonth: period.startMonth,
      periodEndMonth: period.endMonth,
      generatedAtBangkok: getBangkokDateTimeString(),
      storeScopeLabel: scope.storeFilter,
    },
    validation: {
      isValid: validationErrors.length === 0,
      errors: validationErrors,
      warnings: validationWarnings,
    },
    adjustments,
  }
}

