import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { computeTrialBalanceReport } from '@/lib/trial-balance-report'
import { computeIncomeStatementReport, computeBalanceSheetReport } from '@/lib/accounting-reports'
import { buildIncomeExpenseClosingPreview } from '@/lib/income-expense-closing'
import { CHART_OF_ACCOUNTS_BY_CODE } from '@/lib/chart-of-accounts-mapping'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const { searchParams } = new URL(request.url)
  const userRole = String(auth.role || '').trim()
  const userStore = String(auth.store || '').trim()
  const yearMonth = String(searchParams.get('yearMonth') || '').trim().slice(0, 7)
  const storeFilter = String(searchParams.get('storeFilter') || '').trim() || 'All'
  const profitLossAccountCode = String(searchParams.get('profitLossAccountCode') || '3120').trim() || '3120'

  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json({ error: 'INVALID_YEAR_MONTH' }, { status: 400, headers })
  }

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  try {
    const trial = await computeTrialBalanceReport({ yearMonth, storeFilter, userStore, userRole })
    const income = await computeIncomeStatementReport({ yearMonth, storeFilter, userStore, userRole })
    const balanceSheet = await computeBalanceSheetReport({ yearMonth, storeFilter, userStore, userRole })
    const closingPreview = buildIncomeExpenseClosingPreview({
      trial,
      profitLossAccountCode,
      profitLossAccountName: CHART_OF_ACCOUNTS_BY_CODE[profitLossAccountCode]?.nameKo || '이익잉여금',
    })

    const tbRevenue = (trial.rows || [])
      .filter((r) => String(r.accountCode || '').startsWith('4'))
      .reduce((s, r) => s + Math.max(0, Number(r.credit || 0) - Number(r.debit || 0)), 0)
    const tbExpense = (trial.rows || [])
      .filter((r) => String(r.accountCode || '').startsWith('5'))
      .reduce((s, r) => s + Math.max(0, Number(r.debit || 0) - Number(r.credit || 0)), 0)
    const tbNetIncome = tbRevenue - tbExpense
    const incomeNetProfit = Number(income?.netProfit || 0)
    const bsCurrentPeriodProfit = Number(balanceSheet?.equity?.currentPeriodProfit || 0)
    const closingPreviewNetIncome = Number(closingPreview?.netIncome || 0)
    const netDiff = tbNetIncome - incomeNetProfit
    const bsDiff = tbNetIncome - bsCurrentPeriodProfit
    const closingDiff = tbNetIncome - closingPreviewNetIncome

    return NextResponse.json(
      {
        yearMonth,
        storeFilter,
        profitLossAccountCode,
        summary: {
          tbRevenue,
          tbExpense,
          tbNetIncome,
          tbDiff: Number(trial.diff || 0),
          incomeNetProfit,
          bsCurrentPeriodProfit,
          closingPreviewNetIncome,
          netDiff,
          bsDiff,
          closingDiff,
        },
        mismatch: {
          trialUnbalanced: Math.abs(Number(trial.diff || 0)) > 0.0001,
          tbVsIncome: Math.abs(netDiff) > 0.0001,
          tbVsBalanceSheet: Math.abs(bsDiff) > 0.0001,
          tbVsClosingPreview: Math.abs(closingDiff) > 0.0001,
        },
      },
      { headers }
    )
  } catch (e) {
    console.error('getAccountingReconciliation:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers })
  }
}
