import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpsert } from '@/lib/supabase-server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = await request.json().catch(() => ({}))
    const userRole = String(body.userRole || '').trim()
    assertCanManageAccountingCompliance(userRole)

    const yearMonth = String(body.yearMonth || '').trim().slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json({ success: false, error: 'INVALID_YEAR_MONTH' }, { status: 400, headers })
    }

    const closed = Boolean(body.closed)
    const closedBy = String(body.closedBy || '').trim().slice(0, 200) || null
    const nowIso = new Date().toISOString()

    await supabaseUpsert(
      'accounting_periods',
      [
        {
          year_month: yearMonth,
          is_closed: closed,
          closed_at: closed ? nowIso : null,
          closed_by: closed ? closedBy : null,
        },
      ],
      'year_month'
    )

    return NextResponse.json({ success: true, yearMonth, closed }, { headers })
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403, headers })
    }
    console.error('setAccountingPeriodClosed:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
