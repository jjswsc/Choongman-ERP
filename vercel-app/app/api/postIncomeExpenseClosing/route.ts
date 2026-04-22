import { NextRequest, NextResponse } from 'next/server'
import { assertCanApproveAccountingCompliance } from '@/lib/accounting-auth'
import { computeTrialBalanceReport } from '@/lib/trial-balance-report'
import { buildIncomeExpenseClosingPreview } from '@/lib/income-expense-closing'
import { CHART_OF_ACCOUNTS_BY_CODE } from '@/lib/chart-of-accounts-mapping'
import { isAccountingPeriodClosed } from '@/lib/accounting-period-server'
import { writeAccountingComplianceAudit } from '@/lib/accounting-compliance-audit'
import { requireAuth } from '@/lib/verify-auth'
import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseInsertMany,
  supabaseSelectFilter,
  supabaseUpsertMerge,
} from '@/lib/supabase-server'

function isMissingClosingRunTableError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('income_expense_closing_runs') || msg.includes('42p01')
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  let auditUserRole = ''
  let auditActor: string | null = null
  let auditYearMonth = ''
  try {
    const authResult = await requireAuth(request, 'any')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const body = (await request.json().catch(() => ({}))) as {
      postedBy?: string
      yearMonth?: string
      storeFilter?: string
      profitLossAccountCode?: string
      forceReset?: boolean
      autoLockPeriod?: boolean
      memo?: string
    }

    const userRole = String(auth.role || '').trim()
    assertCanApproveAccountingCompliance(userRole)

    const yearMonth = String(body.yearMonth || '').trim()
    const storeFilter = String(body.storeFilter || '').trim() || 'All'
    const userStore = String(auth.store || '').trim()
    const postedBy = String(auth.name || body.postedBy || '').trim() || null
    auditUserRole = userRole
    auditActor = postedBy
    auditYearMonth = yearMonth
    const forceReset = Boolean(body.forceReset)
    const autoLockPeriod = Boolean(body.autoLockPeriod)
    const memo = String(body.memo || '').trim() || null
    const profitLossAccountCode = String(body.profitLossAccountCode || '3120').trim() || '3120'
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      await writeAccountingComplianceAudit({
        actionType: 'income_expense_closing_post',
        userRole,
        actor: postedBy,
        decision: 'deny',
        reasonCode: 'INVALID_YEAR_MONTH',
        yearMonth,
        storeScope: storeFilter,
        targetType: 'closing_income_expense',
      })
      return NextResponse.json({ success: false, error: 'INVALID_YEAR_MONTH' }, { status: 400, headers })
    }
    if (await isAccountingPeriodClosed(yearMonth)) {
      await writeAccountingComplianceAudit({
        actionType: 'income_expense_closing_post',
        userRole,
        actor: postedBy,
        decision: 'deny',
        reasonCode: 'PERIOD_CLOSED',
        yearMonth,
        storeScope: storeFilter,
        targetType: 'closing_income_expense',
      })
      return NextResponse.json({ success: false, error: 'PERIOD_CLOSED' }, { status: 409, headers })
    }

    const sourceId = Number(yearMonth.replace('-', ''))
    const existingFilter = [
      `source_type=eq.${encodeURIComponent('closing_income_expense')}`,
      `source_id=eq.${encodeURIComponent(String(sourceId))}`,
      `store_name=eq.${encodeURIComponent(storeFilter)}`,
    ].join('&')
    const existingRows = (await supabaseSelectFilter('journal_entries', existingFilter, {
      select: 'id',
      order: 'id.desc',
      limit: 50,
    })) as { id?: number }[] | null
    const existingIds = (existingRows || [])
      .map((r) => Number(r.id))
      .filter((n) => Number.isFinite(n) && n > 0)

    if (existingIds.length > 0 && !forceReset) {
      await writeAccountingComplianceAudit({
        actionType: 'income_expense_closing_post',
        userRole,
        actor: postedBy,
        decision: 'deny',
        reasonCode: 'ALREADY_CLOSED',
        yearMonth,
        storeScope: storeFilter,
        targetType: 'closing_income_expense',
      })
      return NextResponse.json({ success: false, error: 'ALREADY_CLOSED' }, { status: 409, headers })
    }
    if (existingIds.length > 0 && forceReset) {
      await supabaseDeleteByFilter('journal_entries', `id=in.(${existingIds.join(',')})`)
      try {
        await supabaseInsert('income_expense_closing_runs', {
          year_month: yearMonth,
          store_scope: storeFilter,
          status: 'reset',
          profit_loss_account_code: profitLossAccountCode,
          revenue_total: 0,
          expense_total: 0,
          net_income: 0,
          line_count: 0,
          payload: { resetCount: existingIds.length },
          journal_entry_id: null,
          memo: `reset previous closings: ${existingIds.join(',')}`,
          created_by: postedBy,
          created_at: new Date().toISOString(),
        })
      } catch (e) {
        if (!isMissingClosingRunTableError(e)) throw e
      }
    }

    const trial = await computeTrialBalanceReport({ yearMonth, storeFilter, userStore, userRole })
    if (Math.abs(Number(trial.diff || 0)) > 0.0001) {
      await writeAccountingComplianceAudit({
        actionType: 'income_expense_closing_post',
        userRole,
        actor: postedBy,
        decision: 'deny',
        reasonCode: 'TRIAL_BALANCE_NOT_BALANCED',
        yearMonth,
        storeScope: storeFilter,
        targetType: 'closing_income_expense',
        payload: { tbDiff: Number(trial.diff || 0) },
      })
      return NextResponse.json({ success: false, error: 'TRIAL_BALANCE_NOT_BALANCED' }, { status: 400, headers })
    }
    const preview = buildIncomeExpenseClosingPreview({
      trial,
      profitLossAccountCode,
      profitLossAccountName: CHART_OF_ACCOUNTS_BY_CODE[profitLossAccountCode]?.nameKo || '이익잉여금',
    })
    if (!preview.lines.length) {
      await writeAccountingComplianceAudit({
        actionType: 'income_expense_closing_post',
        userRole,
        actor: postedBy,
        decision: 'deny',
        reasonCode: 'NOTHING_TO_CLOSE',
        yearMonth,
        storeScope: storeFilter,
        targetType: 'closing_income_expense',
      })
      return NextResponse.json({ success: false, error: 'NOTHING_TO_CLOSE' }, { status: 400, headers })
    }

    const entryNo = `CL-${yearMonth.replace('-', '')}-${Date.now().toString().slice(-6)}`
    const entry = (await supabaseInsert('journal_entries', {
      entry_no: entryNo,
      accounting_date: trial.endStr,
      source_type: 'closing_income_expense',
      source_id: sourceId,
      store_name: storeFilter,
      memo: memo || `Close income/expense for ${yearMonth}`,
      posted_by: postedBy,
      posted_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    })) as { id?: number }[]

    const journalEntryId = Number(entry?.[0]?.id || 0)
    if (!journalEntryId) {
      return NextResponse.json({ success: false, error: 'ENTRY_INSERT_FAILED' }, { status: 500, headers })
    }

    await supabaseInsertMany(
      'journal_lines',
      preview.lines.map((ln, idx) => ({
        journal_entry_id: journalEntryId,
        line_no: idx + 1,
        account_subject_id: null,
        account_code: ln.accountCode,
        account_name: ln.accountName || null,
        side: ln.side,
        amount: ln.amount,
        memo: `Close ${yearMonth}`,
        created_at: new Date().toISOString(),
      }))
    )

    if (autoLockPeriod) {
      const lockedAt = new Date().toISOString()
      await supabaseUpsertMerge('accounting_periods', 'year_month', {
        year_month: yearMonth,
        is_closed: true,
        closed_at: lockedAt,
        closed_by: postedBy,
      })
      try {
        await supabaseInsert('income_expense_closing_runs', {
          year_month: yearMonth,
          store_scope: 'All',
          status: 'period_locked',
          profit_loss_account_code: preview.profitLossAccountCode,
          revenue_total: preview.revenueTotal,
          expense_total: preview.expenseTotal,
          net_income: preview.netIncome,
          line_count: preview.lineCount,
          payload: {
            event: 'lock',
            source: 'closing_auto_lock',
            yearMonth,
            storeScope: storeFilter,
            journalEntryId,
            lockedAt,
          },
          journal_entry_id: journalEntryId,
          memo: 'period locked by closing approval',
          created_by: postedBy,
          created_at: lockedAt,
        })
      } catch (e) {
        if (!isMissingClosingRunTableError(e)) throw e
      }
    }

    try {
      await supabaseInsert('income_expense_closing_runs', {
        year_month: yearMonth,
        store_scope: storeFilter,
        status: 'approved',
        profit_loss_account_code: preview.profitLossAccountCode,
        revenue_total: preview.revenueTotal,
        expense_total: preview.expenseTotal,
        net_income: preview.netIncome,
        line_count: preview.lineCount,
        payload: preview,
        journal_entry_id: journalEntryId,
        memo,
        created_by: postedBy,
        created_at: new Date().toISOString(),
      })
      await supabaseDeleteByFilter(
        'income_expense_closing_runs',
        `year_month=eq.${encodeURIComponent(yearMonth)}&store_scope=eq.${encodeURIComponent(storeFilter)}&status=eq.draft`
      )
    } catch (e) {
      if (!isMissingClosingRunTableError(e)) throw e
    }

    await writeAccountingComplianceAudit({
      actionType: 'income_expense_closing_post',
      userRole,
      actor: postedBy,
      decision: 'allow',
      reasonCode: forceReset ? 'APPROVED_WITH_RESET' : 'APPROVED',
      yearMonth,
      storeScope: storeFilter,
      targetType: 'closing_income_expense',
      targetId: String(journalEntryId),
      payload: {
        forceReset,
        autoLockPeriod,
        lineCount: preview.lineCount,
        netIncome: preview.netIncome,
      },
    })

    return NextResponse.json(
      {
        success: true,
        journalEntryId,
        entryNo,
        preview,
        autoLocked: autoLockPeriod,
      },
      { headers }
    )
  } catch (e) {
    if (e instanceof Error && (e.message === 'ACCOUNTING_FORBIDDEN' || e.message === 'ACCOUNTING_APPROVAL_FORBIDDEN')) {
      await writeAccountingComplianceAudit({
        actionType: 'income_expense_closing_post',
        userRole: auditUserRole,
        actor: auditActor,
        decision: 'deny',
        reasonCode: 'FORBIDDEN_APPROVE',
        yearMonth: auditYearMonth,
        targetType: 'closing_income_expense',
      })
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403, headers })
    }
    try {
      await writeAccountingComplianceAudit({
        actionType: 'income_expense_closing_post',
        userRole: auditUserRole,
        actor: auditActor,
        decision: 'error',
        reasonCode: 'UNHANDLED_ERROR',
        yearMonth: auditYearMonth,
        targetType: 'closing_income_expense',
        payload: { error: e instanceof Error ? e.message : String(e) },
      })
    } catch {}
    console.error('postIncomeExpenseClosing:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
