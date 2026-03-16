import { NextRequest, NextResponse } from 'next/server'
import { computeIncomeStatementReport } from '@/lib/accounting-reports'
import { getBangkokMonthRange } from '@/lib/bangkok-time'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const { searchParams } = new URL(request.url)
    const yearMonth = String(searchParams.get('yearMonth') || '').trim()
    const storeFilter = String(searchParams.get('storeFilter') || '').trim()
    const userStore = String(searchParams.get('userStore') || '').trim()
    const userRole = String(searchParams.get('userRole') || '').trim()

    const legacy = await computeIncomeStatementReport({
      yearMonth,
      storeFilter,
      userStore,
      userRole,
      includeDebug: false,
    })

    const { startStr, endStr } = getBangkokMonthRange(legacy.yearMonth)
    let filter = `accounting_date=gte.${startStr}&accounting_date=lte.${endStr}`
    if (legacy.storeFilter && legacy.storeFilter !== 'All') {
      filter += `&store_name=ilike.${encodeURIComponent(legacy.storeFilter)}`
    }
    const entries = (await supabaseSelectFilter('journal_entries', filter, {
      select: 'id,store_name',
      limit: 50000,
    })) as { id?: number }[] | null
    const ids = (entries || []).map((x) => x.id).filter((id): id is number => id != null)

    let journalRevenue = 0
    let journalExpenses = 0
    let journalCogs = 0
    if (ids.length > 0) {
      const idList = ids.join(',')
      const lines = (await supabaseSelectFilter(
        'journal_lines',
        `journal_entry_id=in.(${idList})`,
        { select: 'account_code,side,amount', limit: 100000 }
      )) as { account_code?: string; side?: string; amount?: number }[] | null
      for (const l of lines || []) {
        const code = String(l.account_code || '')
        const side = String(l.side || '').toLowerCase()
        const amount = Math.abs(Number(l.amount) || 0)
        if (code.startsWith('41') && side === 'credit') journalRevenue += amount
        if (code === '5110' && side === 'debit') journalCogs += amount
        if (code.startsWith('5') && code !== '5110' && side === 'debit') journalExpenses += amount
      }
    }

    const journalNet = journalRevenue - journalCogs - journalExpenses
    return NextResponse.json({
      yearMonth: legacy.yearMonth,
      storeFilter: legacy.storeFilter,
      legacy: {
        sales: legacy.sales,
        cogs: legacy.cogs,
        expenses: legacy.expenses,
        netProfit: legacy.netProfit,
      },
      journal: {
        sales: journalRevenue,
        cogs: journalCogs,
        expenses: journalExpenses,
        netProfit: journalNet,
      },
      diff: {
        sales: legacy.sales - journalRevenue,
        cogs: (legacy.cogs || 0) - journalCogs,
        expenses: legacy.expenses - journalExpenses,
        netProfit: legacy.netProfit - journalNet,
      },
    }, { headers })
  } catch (e) {
    console.error('getAccountingReconcile:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

