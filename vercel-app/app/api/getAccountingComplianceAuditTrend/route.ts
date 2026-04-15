import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { supabaseRpc, supabaseSelectFilter } from '@/lib/supabase-server'

type TrendRow = {
  year_month?: string | null
  total?: number | null
  allow_count?: number | null
  deny_count?: number | null
  error_count?: number | null
  deny_rate?: number | null
  error_rate?: number | null
}

function parsePeriodType(v: string): 'monthly' | 'half_year' | 'annual' | '' {
  const s = v.trim().toLowerCase()
  if (s === 'monthly' || s === 'half_year' || s === 'annual') return s
  return ''
}

function parseDecision(v: string): 'allow' | 'deny' | 'error' | '' {
  const s = v.trim().toLowerCase()
  if (s === 'allow' || s === 'deny' || s === 'error') return s
  return ''
}

function shiftYearMonth(ym: string, deltaMonths: number): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ''
  const y = Number(ym.slice(0, 4))
  const m = Number(ym.slice(5, 7))
  const d = new Date(y, m - 1 + deltaMonths, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function isMissingRpcError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('get_accounting_compliance_audit_trend') || msg.includes('42883')
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const userRole = String(searchParams.get('userRole') || '').trim()
  const yearMonth = String(searchParams.get('yearMonth') || '').trim().slice(0, 7)
  const monthsRaw = Number(searchParams.get('months') || 3)
  const months = Number.isFinite(monthsRaw) ? Math.min(Math.max(Math.floor(monthsRaw), 1), 12) : 3
  const storeFilter = String(searchParams.get('storeFilter') || '').trim() || 'All'
  const periodType = parsePeriodType(String(searchParams.get('periodType') || ''))
  const decision = parseDecision(String(searchParams.get('decision') || ''))
  const actionKeyword = String(searchParams.get('actionKeyword') || '').trim()

  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json({ success: false, error: 'INVALID_YEAR_MONTH', rows: [] }, { status: 400, headers })
  }

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN', rows: [] }, { status: 403, headers })
    }
    throw e
  }

  try {
    const rows = await supabaseRpc<TrendRow[]>('get_accounting_compliance_audit_trend', {
      p_base_year_month: yearMonth,
      p_months: months,
      p_store_scope: storeFilter,
      p_period_type: periodType,
      p_decision: decision,
      p_action_keyword: actionKeyword,
    })
    return NextResponse.json({ success: true, rows: rows || [], fallbackUsed: false }, { headers })
  } catch (e) {
    if (!isMissingRpcError(e)) {
      console.error('getAccountingComplianceAuditTrend rpc:', e)
      return NextResponse.json(
        { success: false, error: e instanceof Error ? e.message : String(e), rows: [] },
        { status: 500, headers }
      )
    }

    try {
      const out: TrendRow[] = []
      for (let i = 0; i < months; i++) {
        const ym = shiftYearMonth(yearMonth, -i)
        if (!ym) continue
        const clauses: string[] = [`year_month=eq.${encodeURIComponent(ym)}`]
        if (periodType) clauses.push(`period_type=eq.${encodeURIComponent(periodType)}`)
        if (decision) clauses.push(`decision=eq.${encodeURIComponent(decision)}`)
        const rows = (await supabaseSelectFilter('accounting_compliance_audit_logs', clauses.join('&'), {
          select: 'decision,store_scope,action_type,reason_code',
          limit: 5000,
        })) as { decision?: string | null; store_scope?: string | null; action_type?: string | null; reason_code?: string | null }[] | null

        const filtered = (rows || []).filter((row) => {
          if (storeFilter !== 'All') {
            const scope = String(row.store_scope || '')
            if (scope !== '' && scope !== 'All' && scope !== storeFilter) return false
          }
          if (actionKeyword) {
            const a = String(row.action_type || '').toLowerCase()
            const r = String(row.reason_code || '').toLowerCase()
            if (!a.includes(actionKeyword.toLowerCase()) && !r.includes(actionKeyword.toLowerCase())) return false
          }
          return true
        })
        const total = filtered.length
        const allowCount = filtered.filter((r) => String(r.decision || '') === 'allow').length
        const denyCount = filtered.filter((r) => String(r.decision || '') === 'deny').length
        const errorCount = filtered.filter((r) => String(r.decision || '') === 'error').length
        out.push({
          year_month: ym,
          total,
          allow_count: allowCount,
          deny_count: denyCount,
          error_count: errorCount,
          deny_rate: total > 0 ? Number(((denyCount / total) * 100).toFixed(1)) : 0,
          error_rate: total > 0 ? Number(((errorCount / total) * 100).toFixed(1)) : 0,
        })
      }
      return NextResponse.json({ success: true, rows: out, fallbackUsed: true }, { headers })
    } catch (fallbackErr) {
      console.error('getAccountingComplianceAuditTrend fallback:', fallbackErr)
      return NextResponse.json(
        { success: false, error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr), rows: [] },
        { status: 500, headers }
      )
    }
  }
}
