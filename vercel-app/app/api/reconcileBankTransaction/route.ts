import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpdate } from '@/lib/supabase-server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'

export async function PATCH(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = await request.json().catch(() => ({}))
    const userRole = String(body.userRole || '').trim()
    assertCanManageAccountingCompliance(userRole)

    const id = Number(body.id || 0)
    if (!id) {
      return NextResponse.json({ success: false, error: 'INVALID_ID' }, { status: 400, headers })
    }

    const reconciled = Boolean(body.reconciled)
    const by = String(body.reconciledBy || body.userName || '').trim().slice(0, 200) || null
    const note = body.reconciliationNote != null ? String(body.reconciliationNote).slice(0, 500) : null
    const nowIso = new Date().toISOString()

    await supabaseUpdate('bank_transactions', id, {
      reconciled_at: reconciled ? nowIso : null,
      reconciled_by: reconciled ? by : null,
      reconciliation_note: reconciled ? note : null,
    })

    return NextResponse.json({ success: true, id, reconciled }, { headers })
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403, headers })
    }
    console.error('reconcileBankTransaction:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
