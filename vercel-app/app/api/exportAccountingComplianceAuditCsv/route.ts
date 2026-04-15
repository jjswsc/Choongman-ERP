import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { supabaseSelectFilter } from '@/lib/supabase-server'

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

function csvCell(v: unknown): string {
  const raw = v == null ? '' : String(v)
  return `"${raw.replace(/"/g, '""')}"`
}

function decisionLabelKo(v: unknown): string {
  const s = String(v || '').trim().toLowerCase()
  if (s === 'allow') return '허용'
  if (s === 'deny') return '거부'
  if (s === 'error') return '오류'
  return s
}

function toCsv(rows: AuditRow[]): string {
  const head = [
    'created_at',
    'decision',
    'decision_label_ko',
    'action_type',
    'reason_code',
    'year_month',
    'period_type',
    'period_key',
    'store_scope',
    'filing_type',
    'target_type',
    'target_id',
    'actor',
    'user_role',
    'payload_json',
  ]
  const lines = [head.join(',')]
  for (const row of rows) {
    lines.push(
      [
        csvCell(row.created_at || ''),
        csvCell(row.decision || ''),
        csvCell(decisionLabelKo(row.decision)),
        csvCell(row.action_type || ''),
        csvCell(row.reason_code || ''),
        csvCell(row.year_month || ''),
        csvCell(row.period_type || ''),
        csvCell(row.period_key || ''),
        csvCell(row.store_scope || ''),
        csvCell(row.filing_type || ''),
        csvCell(row.target_type || ''),
        csvCell(row.target_id || ''),
        csvCell(row.actor || ''),
        csvCell(row.user_role || ''),
        csvCell(row.payload == null ? '' : JSON.stringify(row.payload)),
      ].join(',')
    )
  }
  return `\uFEFF${lines.join('\n')}`
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const userRole = String(searchParams.get('userRole') || '').trim()
  const yearMonth = String(searchParams.get('yearMonth') || '').trim()
  const storeFilter = String(searchParams.get('storeFilter') || '').trim() || 'All'
  const decision = parseDecision(String(searchParams.get('decision') || ''))
  const periodType = parsePeriodType(String(searchParams.get('periodType') || ''))
  const actionKeyword = String(searchParams.get('actionKeyword') || '').trim().toLowerCase()

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  if (yearMonth && yearMonth !== 'All' && !/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json({ error: 'INVALID_YEAR_MONTH' }, { status: 400, headers })
  }

  const fileMonth = yearMonth && yearMonth !== 'All' ? yearMonth : 'all'

  try {
    const clauses: string[] = []
    if (yearMonth && yearMonth !== 'All') clauses.push(`year_month=eq.${encodeURIComponent(yearMonth)}`)
    if (decision) clauses.push(`decision=eq.${encodeURIComponent(decision)}`)
    if (periodType) clauses.push(`period_type=eq.${encodeURIComponent(periodType)}`)

    const rows = (await supabaseSelectFilter('accounting_compliance_audit_logs', clauses.join('&'), {
      select:
        'id,action_type,user_role,actor,decision,reason_code,year_month,period_type,period_key,store_scope,filing_type,target_type,target_id,payload,created_at',
      order: 'created_at.desc,id.desc',
      limit: 10000,
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

    const csv = toCsv(filtered)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        ...Object.fromEntries(headers.entries()),
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="accounting-compliance-audit-${fileMonth}.csv"`,
      },
    })
  } catch (e) {
    if (isMissingAuditTableError(e)) {
      const csv = toCsv([])
      return new NextResponse(csv, {
        status: 200,
        headers: {
          ...Object.fromEntries(headers.entries()),
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="accounting-compliance-audit-${fileMonth}.csv"`,
        },
      })
    }
    console.error('exportAccountingComplianceAuditCsv:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
