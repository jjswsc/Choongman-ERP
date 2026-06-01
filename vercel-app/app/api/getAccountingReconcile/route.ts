import { NextRequest, NextResponse } from 'next/server'
import { computeIncomeStatementReport } from '@/lib/accounting-reports'
import { getBangkokMonthRange } from '@/lib/bangkok-time'
import { isAccountingStoreScopeForbidden } from '@/lib/accounting-store-scope'
import { supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  try {
    const { searchParams } = new URL(request.url)
    const yearMonth = String(searchParams.get('yearMonth') || '').trim()
    const storeFilter = String(searchParams.get('storeFilter') || '').trim()
    const userStore = String(auth.store || '').trim()
    const userRole = String(auth.role || '').trim()

    const legacy = await computeIncomeStatementReport({
      yearMonth,
      storeFilter,
      userStore,
      userRole,
      allowedStores: auth.allowedStores,
      includeDebug: false,
    })

    const { startStr, endStr } = getBangkokMonthRange(legacy.yearMonth)
    let filter = `accounting_date=gte.${startStr}&accounting_date=lte.${endStr}`
    if (legacy.storeFilter && legacy.storeFilter !== 'All') {
      filter += `&store_name=ilike.${encodeURIComponent(legacy.storeFilter)}`
    }
    const entries = (await supabaseSelectFilterAllPages('journal_entries', filter, {
      select: 'id,store_name',
      pageSize: 8000,
      maxRows: 1_000_000,
    })) as { id?: number }[] | null
    const ids = (entries || []).map((x) => x.id).filter((id): id is number => id != null)

    let journalRevenue = 0
    let journalExpenses = 0
    let journalCogs = 0
    if (ids.length > 0) {
      const chunkSize = 400
      for (let i = 0; i < ids.length; i += chunkSize) {
        const idList = ids.slice(i, i + chunkSize).join(',')
        // 합산에 사용되는 계정(41xx 매출, 5xx 비용)만 조회해 egress를 줄인다.
        const lineFilter = `journal_entry_id=in.(${idList})&or=(account_code.like.41*,account_code.like.5*)`
        const lines = (await supabaseSelectFilterAllPages(
          'journal_lines',
          lineFilter,
          { select: 'account_code,side,amount', pageSize: 8000, maxRows: 1_000_000 }
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
    if (isAccountingStoreScopeForbidden(e)) {
      return NextResponse.json({ error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
    }
    console.error('getAccountingReconcile:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

