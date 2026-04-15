import type { TrialBalanceReport, TrialBalanceRow } from '@/lib/trial-balance-report'

export type IncomeExpenseClosingLine = {
  accountCode: string
  accountName: string | null
  side: 'debit' | 'credit'
  amount: number
}

export type IncomeExpenseClosingPreview = {
  yearMonth: string
  storeFilter: string
  profitLossAccountCode: string
  profitLossAccountName: string
  revenueTotal: number
  expenseTotal: number
  netIncome: number
  lineCount: number
  lines: IncomeExpenseClosingLine[]
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function positive(v: number): number {
  const n = Number(v) || 0
  return n > 0 ? n : 0
}

function byCodeAsc(a: TrialBalanceRow, b: TrialBalanceRow): number {
  return a.accountCode.localeCompare(b.accountCode)
}

export function buildIncomeExpenseClosingPreview(input: {
  trial: TrialBalanceReport
  profitLossAccountCode: string
  profitLossAccountName?: string
}): IncomeExpenseClosingPreview {
  const trial = input.trial
  const profitLossAccountCode = String(input.profitLossAccountCode || '').trim() || '3120'
  const profitLossAccountName = String(input.profitLossAccountName || '').trim() || '이익잉여금'
  const lines: IncomeExpenseClosingLine[] = []

  let revenueTotal = 0
  let expenseTotal = 0
  const rows = [...(trial.rows || [])].sort(byCodeAsc)

  // Revenue(4xxx): normal credit balance -> close by debit.
  for (const row of rows) {
    if (!String(row.accountCode || '').startsWith('4')) continue
    const closingAmount = positive((row.credit || 0) - (row.debit || 0))
    if (closingAmount <= 0) continue
    revenueTotal += closingAmount
    lines.push({
      accountCode: row.accountCode,
      accountName: row.accountName || null,
      side: 'debit',
      amount: round2(closingAmount),
    })
  }

  // Expense(5xxx): normal debit balance -> close by credit.
  for (const row of rows) {
    if (!String(row.accountCode || '').startsWith('5')) continue
    const closingAmount = positive((row.debit || 0) - (row.credit || 0))
    if (closingAmount <= 0) continue
    expenseTotal += closingAmount
    lines.push({
      accountCode: row.accountCode,
      accountName: row.accountName || null,
      side: 'credit',
      amount: round2(closingAmount),
    })
  }

  const revenueToPl = round2(revenueTotal)
  const expenseToPl = round2(expenseTotal)
  if (revenueToPl > 0) {
    lines.push({
      accountCode: profitLossAccountCode,
      accountName: profitLossAccountName,
      side: 'credit',
      amount: revenueToPl,
    })
  }
  if (expenseToPl > 0) {
    lines.push({
      accountCode: profitLossAccountCode,
      accountName: profitLossAccountName,
      side: 'debit',
      amount: expenseToPl,
    })
  }

  return {
    yearMonth: trial.yearMonth,
    storeFilter: trial.storeFilter,
    profitLossAccountCode,
    profitLossAccountName,
    revenueTotal: revenueToPl,
    expenseTotal: expenseToPl,
    netIncome: round2(revenueToPl - expenseToPl),
    lineCount: lines.length,
    lines,
  }
}
