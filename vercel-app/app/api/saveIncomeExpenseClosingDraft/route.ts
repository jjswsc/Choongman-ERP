import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { computeTrialBalanceReport } from '@/lib/trial-balance-report'
import { buildIncomeExpenseClosingPreview } from '@/lib/income-expense-closing'
import { CHART_OF_ACCOUNTS_BY_CODE } from '@/lib/chart-of-accounts-mapping'
import { supabaseDeleteByFilter, supabaseInsert } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'

function isMissingClosingRunTableError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('income_expense_closing_runs') || msg.includes('42p01')
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const authResult = await requireAuth(request, 'any')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const body = (await request.json().catch(() => ({}))) as {
      createdBy?: string
      yearMonth?: string
      storeFilter?: string
      profitLossAccountCode?: string
      memo?: string
    }
    const userRole = String(auth.role || '').trim()
    assertCanManageAccountingCompliance(userRole)

    const yearMonth = String(body.yearMonth || '').trim()
    const storeFilter = String(body.storeFilter || '').trim() || 'All'
    const userStore = String(auth.store || '').trim()
    const createdBy = String(auth.name || body.createdBy || '').trim() || null
    const memo = String(body.memo || '').trim() || null
    const profitLossAccountCode = String(body.profitLossAccountCode || '3120').trim() || '3120'
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json({ success: false, error: 'INVALID_YEAR_MONTH' }, { status: 400, headers })
    }

    const trial = await computeTrialBalanceReport({ yearMonth, storeFilter, userStore, userRole })
    const preview = buildIncomeExpenseClosingPreview({
      trial,
      profitLossAccountCode,
      profitLossAccountName: CHART_OF_ACCOUNTS_BY_CODE[profitLossAccountCode]?.nameKo || '이익잉여금',
    })

    try {
      await supabaseDeleteByFilter(
        'income_expense_closing_runs',
        `year_month=eq.${encodeURIComponent(yearMonth)}&store_scope=eq.${encodeURIComponent(storeFilter)}&status=eq.draft`
      )
      const inserted = (await supabaseInsert('income_expense_closing_runs', {
        year_month: yearMonth,
        store_scope: storeFilter,
        status: 'draft',
        profit_loss_account_code: preview.profitLossAccountCode,
        revenue_total: preview.revenueTotal,
        expense_total: preview.expenseTotal,
        net_income: preview.netIncome,
        line_count: preview.lineCount,
        payload: preview,
        journal_entry_id: null,
        memo,
        created_by: createdBy,
        created_at: new Date().toISOString(),
      })) as { id?: number }[]
      return NextResponse.json(
        {
          success: true,
          id: Number(inserted?.[0]?.id || 0),
          preview,
        },
        { headers }
      )
    } catch (e) {
      if (isMissingClosingRunTableError(e)) {
        return NextResponse.json({ success: true, id: 0, preview, warning: 'HISTORY_TABLE_MISSING' }, { headers })
      }
      throw e
    }
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403, headers })
    }
    console.error('saveIncomeExpenseClosingDraft:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
