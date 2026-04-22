import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpsert } from '@/lib/supabase-server'
import { assertCanWriteAccountingCompliance } from '@/lib/accounting-auth'
import { normalizeResponsibilities, type ThaiFilingResponsibility, type ThaiFilingType } from '@/lib/thai-filing-scope'
import { writeAccountingComplianceAudit } from '@/lib/accounting-compliance-audit'
import { requireAuth } from '@/lib/verify-auth'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const jwtUserRole = String(authResult.auth.role || '').trim()
  try {
    const body = await request.json().catch(() => ({}))
    const userRole = jwtUserRole
    assertCanWriteAccountingCompliance(userRole)

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

    await writeAccountingComplianceAudit({
      actionType: 'accounting_filing_preferences_save',
      userRole,
      actor: null,
      decision: 'allow',
      reasonCode: 'UPDATED',
      targetType: 'accounting_filing_preferences',
      targetId: '1',
    })

    return NextResponse.json({ success: true, responsibilities }, { headers })
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      try {
        await request.json().catch(() => ({}))
        await writeAccountingComplianceAudit({
          actionType: 'accounting_filing_preferences_save',
          userRole: jwtUserRole,
          actor: null,
          decision: 'deny',
          reasonCode: 'FORBIDDEN_WRITE',
          targetType: 'accounting_filing_preferences',
          targetId: '1',
        })
      } catch {}
      return NextResponse.json({ success: false, error: 'FORBIDDEN_WRITE' }, { status: 403, headers })
    }
    console.error('saveAccountingFilingPreferences:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
