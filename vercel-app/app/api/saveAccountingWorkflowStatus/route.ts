import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { workflowStoreScopeFromStoreTb } from '@/lib/accounting-ledger-store-filter'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = await request.json().catch(() => ({}))
    const userRole = String(body.userRole || '').trim()
    const yearMonth = String(body.yearMonth || '').trim().slice(0, 7)
    const filingType = String(body.filingType || '').trim()
    const statusRaw = String(body.status || '').trim().toLowerCase()
    const status = ['todo', 'in_progress', 'review', 'done'].includes(statusRaw) ? statusRaw : 'todo'
    const note = body.note != null ? String(body.note).slice(0, 2000) : null
    const owner = body.owner != null ? String(body.owner).slice(0, 200) : null
    const updatedBy = body.updatedBy != null ? String(body.updatedBy).slice(0, 200) : null
    const storeScope = workflowStoreScopeFromStoreTb(
      body.storeFilter != null ? String(body.storeFilter) : 'All'
    )

    if (!/^\d{4}-\d{2}$/.test(yearMonth) || !filingType) {
      return NextResponse.json({ success: false, error: 'INVALID_BODY' }, { status: 400, headers })
    }

    assertCanManageAccountingCompliance(userRole)

    const exists = (await supabaseSelectFilter(
      'accounting_filing_workflow_status',
      `year_month=eq.${encodeURIComponent(yearMonth)}&filing_type=eq.${encodeURIComponent(filingType)}&store_scope=eq.${encodeURIComponent(storeScope)}`,
      { select: 'id', limit: 1 }
    )) as { id?: number }[] | null
    const row = {
      year_month: yearMonth,
      filing_type: filingType,
      store_scope: storeScope,
      status,
      note,
      owner,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    }
    if (exists?.[0]?.id) {
      await supabaseUpdate('accounting_filing_workflow_status', Number(exists[0].id), row)
      return NextResponse.json({ success: true, id: Number(exists[0].id) }, { headers })
    }
    const inserted = (await supabaseInsert('accounting_filing_workflow_status', row)) as { id?: number }[] | null
    return NextResponse.json({ success: true, id: Number(inserted?.[0]?.id || 0) }, { headers })
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403, headers })
    }
    console.error('saveAccountingWorkflowStatus:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

