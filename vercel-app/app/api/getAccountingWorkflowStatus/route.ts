import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { workflowStoreScopeFromStoreTb } from '@/lib/accounting-ledger-store-filter'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const userRole = String(searchParams.get('userRole') || '').trim()
  const yearMonth = String(searchParams.get('yearMonth') || '').trim().slice(0, 7)
  const storeFilter = String(searchParams.get('storeFilter') || '').trim()
  const storeScope = workflowStoreScopeFromStoreTb(storeFilter || 'All')
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
    const rows = await supabaseSelectFilter(
      'accounting_filing_workflow_status',
      `year_month=eq.${encodeURIComponent(yearMonth)}&store_scope=eq.${encodeURIComponent(storeScope)}`,
      {
        select: 'id,year_month,filing_type,status,note,owner,updated_by,updated_at,store_scope',
        limit: 200,
        order: 'filing_type.asc',
      }
    )
    return NextResponse.json({ rows: rows || [] }, { headers })
  } catch (e) {
    console.error('getAccountingWorkflowStatus:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

