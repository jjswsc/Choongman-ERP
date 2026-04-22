import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { normalizeResponsibilities, THAI_FILING_DEFINITIONS } from '@/lib/thai-filing-scope'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const userRole = String(authResult.auth.role || '').trim()

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  try {
    const rows = (await supabaseSelectFilter('accounting_filing_preferences', 'id=eq.1', {
      select: 'responsibilities,notes,updated_at',
      limit: 1,
    })) as { responsibilities?: Record<string, unknown>; notes?: string | null; updated_at?: string }[] | null

    const row = rows?.[0]
    const responsibilities = normalizeResponsibilities(row?.responsibilities)

    return NextResponse.json(
      {
        definitions: THAI_FILING_DEFINITIONS,
        responsibilities,
        notes: row?.notes ?? null,
        updatedAt: row?.updated_at ?? null,
      },
      { headers }
    )
  } catch {
    return NextResponse.json(
      {
        definitions: THAI_FILING_DEFINITIONS,
        responsibilities: normalizeResponsibilities(null),
        notes: null,
        updatedAt: null,
      },
      { headers }
    )
  }
}
