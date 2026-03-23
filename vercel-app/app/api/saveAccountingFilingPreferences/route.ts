import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpsert } from '@/lib/supabase-server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { normalizeResponsibilities, type ThaiFilingResponsibility, type ThaiFilingType } from '@/lib/thai-filing-scope'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = await request.json().catch(() => ({}))
    const userRole = String(body.userRole || '').trim()
    assertCanManageAccountingCompliance(userRole)

    const raw = body.responsibilities as Record<string, unknown> | undefined
    const responsibilities = normalizeResponsibilities(raw)
    const notes = body.notes != null ? String(body.notes).slice(0, 4000) : null

    await supabaseUpsert(
      'accounting_filing_preferences',
      [
        {
          id: 1,
          responsibilities: responsibilities as unknown as Record<ThaiFilingType, ThaiFilingResponsibility>,
          notes,
          updated_at: new Date().toISOString(),
        },
      ],
      'id'
    )

    return NextResponse.json({ success: true, responsibilities }, { headers })
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403, headers })
    }
    console.error('saveAccountingFilingPreferences:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
