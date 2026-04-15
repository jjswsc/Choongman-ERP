import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { computeTrialBalanceReport } from '@/lib/trial-balance-report'
import { buildIncomeExpenseClosingPreview } from '@/lib/income-expense-closing'
import { CHART_OF_ACCOUNTS_BY_CODE } from '@/lib/chart-of-accounts-mapping'
import { supabaseSelectFilter } from '@/lib/supabase-server'

function isMissingClosingRunTableError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('income_expense_closing_runs') || msg.includes('42p01')
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const userRole = String(searchParams.get('userRole') || '').trim()
  const yearMonth = String(searchParams.get('yearMonth') || '').trim()
  const storeFilter = String(searchParams.get('storeFilter') || '').trim() || 'All'
  const userStore = String(searchParams.get('userStore') || '').trim()
  const profitLossAccountCode = String(searchParams.get('profitLossAccountCode') || '3120').trim() || '3120'
  const sourceId = Number(yearMonth.replace('-', ''))

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
    const preview = buildIncomeExpenseClosingPreview({
      trial,
      profitLossAccountCode,
      profitLossAccountName: CHART_OF_ACCOUNTS_BY_CODE[profitLossAccountCode]?.nameKo || '이익잉여금',
    })

    const closedFilter = [
      `source_type=eq.${encodeURIComponent('closing_income_expense')}`,
      `source_id=eq.${encodeURIComponent(String(sourceId))}`,
      `store_name=eq.${encodeURIComponent(storeFilter)}`,
    ].join('&')
    const closedRows = (await supabaseSelectFilter('journal_entries', closedFilter, {
      select: 'id,entry_no,posted_at,posted_by,memo',
      order: 'id.desc',
      limit: 1,
    })) as
      | {
          id?: number
          entry_no?: string | null
          posted_at?: string | null
          posted_by?: string | null
          memo?: string | null
        }[]
      | null
    const closed = (closedRows || [])[0] || null

    let draft: {
      id?: number
      status?: string | null
      memo?: string | null
      created_at?: string | null
      created_by?: string | null
      payload?: unknown
    } | null = null
    let history: {
      id?: number
      store_scope?: string | null
      status?: string | null
      created_at?: string | null
      created_by?: string | null
      memo?: string | null
      journal_entry_id?: number | null
      revenue_total?: number | null
      expense_total?: number | null
      net_income?: number | null
      line_count?: number | null
      payload?: unknown
    }[] = []
    try {
      const yearFilter = `year_month=eq.${encodeURIComponent(yearMonth)}`
      const draftRows = (await supabaseSelectFilter(
        'income_expense_closing_runs',
        `${yearFilter}&store_scope=eq.${encodeURIComponent(storeFilter)}&status=eq.draft`,
        {
        select: 'id,status,memo,created_at,created_by,payload',
        order: 'id.desc',
        limit: 1,
      }
      )) as
        | {
            id?: number
            status?: string | null
            memo?: string | null
            created_at?: string | null
            created_by?: string | null
            payload?: unknown
          }[]
        | null
      draft = (draftRows || [])[0] || null
      const historyRows = (await supabaseSelectFilter('income_expense_closing_runs', yearFilter, {
        select: 'id,store_scope,status,created_at,created_by,memo,journal_entry_id,revenue_total,expense_total,net_income,line_count,payload',
        order: 'id.desc',
        limit: 200,
      })) as typeof history
      const scoped = (historyRows || []).filter((row) => {
        const scope = String(row.store_scope || 'All')
        if (storeFilter === 'All') return true
        return scope === storeFilter || scope === 'All'
      })
      history = scoped.slice(0, 30)
    } catch (e) {
      if (!isMissingClosingRunTableError(e)) throw e
    }

    return NextResponse.json({ preview, closed, draft, history }, { headers })
  } catch (e) {
    console.error('getIncomeExpenseClosingPreview:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
