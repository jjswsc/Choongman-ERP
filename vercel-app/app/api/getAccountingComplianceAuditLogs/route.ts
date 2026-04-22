import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'

type AuditDecision = 'allow' | 'deny' | 'error'

type AuditRow = {
  id?: number
  action_type?: string | null
  user_role?: string | null
  actor?: string | null
  decision?: AuditDecision | null
  reason_code?: string | null
  year_month?: string | null
  period_type?: string | null
  period_key?: string | null
  store_scope?: string | null
  filing_type?: string | null
  target_type?: string | null
  target_id?: string | null
  payload?: unknown
  created_at?: string | null
}

function isMissingAuditTableError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('accounting_compliance_audit_logs') || msg.includes('42p01')
}

function parseDecision(v: string): AuditDecision | '' {
  const s = v.trim().toLowerCase()
  if (s === 'allow' || s === 'deny' || s === 'error') return s
  return ''
}

function parsePeriodType(v: string): 'monthly' | 'half_year' | 'annual' | '' {
  const s = v.trim().toLowerCase()
  if (s === 'monthly' || s === 'half_year' || s === 'annual') return s
  return ''
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'any')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const { searchParams } = new URL(request.url)
  const userRole = String(auth.role || '').trim()
  const yearMonth = String(searchParams.get('yearMonth') || '').trim()
  const storeFilter = String(searchParams.get('storeFilter') || '').trim() || 'All'
  const decision = parseDecision(String(searchParams.get('decision') || ''))
  const periodType = parsePeriodType(String(searchParams.get('periodType') || ''))
  const actionKeyword = String(searchParams.get('actionKeyword') || '').trim().toLowerCase()
  const limitRaw = Number(searchParams.get('limit') || 300)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 5000) : 300

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN', rows: [] }, { status: 403, headers })
    }
    throw e
  }

  if (yearMonth && yearMonth !== 'All' && !/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json({ success: false, error: 'INVALID_YEAR_MONTH', rows: [] }, { status: 400, headers })
  }

  try {
    const clauses: string[] = []
    if (yearMonth && yearMonth !== 'All') clauses.push(`year_month=eq.${encodeURIComponent(yearMonth)}`)
    if (decision) clauses.push(`decision=eq.${encodeURIComponent(decision)}`)
    if (periodType) clauses.push(`period_type=eq.${encodeURIComponent(periodType)}`)

    const rows = (await supabaseSelectFilter('accounting_compliance_audit_logs', clauses.join('&'), {
      select:
        'id,action_type,user_role,actor,decision,reason_code,year_month,period_type,period_key,store_scope,filing_type,target_type,target_id,payload,created_at',
      order: 'created_at.desc,id.desc',
      limit,
    })) as AuditRow[] | null

    const filtered = (rows || []).filter((row) => {
      if (storeFilter !== 'All') {
        const scope = String(row.store_scope || '')
        if (scope !== '' && scope !== 'All' && scope !== storeFilter) return false
      }
      if (actionKeyword) {
        const action = String(row.action_type || '').toLowerCase()
        const reason = String(row.reason_code || '').toLowerCase()
        if (!action.includes(actionKeyword) && !reason.includes(actionKeyword)) return false
      }
      return true
    })
    return NextResponse.json({ success: true, rows: filtered, fallbackUsed: false }, { headers })
  } catch (e) {
    if (isMissingAuditTableError(e)) {
      return NextResponse.json({ success: true, rows: [], fallbackUsed: true }, { headers })
    }
    console.error('getAccountingComplianceAuditLogs:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e), rows: [] },
      { status: 500, headers }
    )
  }
}
