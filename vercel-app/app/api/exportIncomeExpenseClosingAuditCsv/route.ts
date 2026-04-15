import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { supabaseSelectFilter } from '@/lib/supabase-server'

type ClosingAuditRow = {
  id?: number
  year_month?: string | null
  store_scope?: string | null
  status?: string | null
  created_at?: string | null
  created_by?: string | null
  memo?: string | null
  journal_entry_id?: number | null
  revenue_total?: number | null
  expense_total?: number | null
  net_income?: number | null
  line_count?: number | null
  payload?: unknown
}

function isMissingClosingRunTableError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('income_expense_closing_runs') || msg.includes('42p01')
}

function csvCell(v: unknown): string {
  const raw = v == null ? '' : String(v)
  const escaped = raw.replace(/"/g, '""')
  return `"${escaped}"`
}

function statusLabelKo(status: unknown): string {
  const key = String(status || '').trim().toLowerCase()
  if (key === 'draft') return '임시저장'
  if (key === 'approved') return '마감승인'
  if (key === 'reset') return '재실행(초기화)'
  if (key === 'period_locked') return '기간잠금'
  if (key === 'unlock_request') return '잠금해제요청'
  if (key === 'unlock_approved') return '잠금해제승인'
  return key || ''
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {}
  return payload as Record<string, unknown>
}

function toCsv(rows: ClosingAuditRow[]): string {
  const head = [
    'created_at',
    'status',
    'status_label_ko',
    'year_month',
    'store_scope',
    'created_by',
    'unlock_reason',
    'unlock_approved_by',
    'lock_source',
    'memo',
    'journal_entry_id',
    'revenue_total',
    'expense_total',
    'net_income',
    'line_count',
    'payload_json',
  ]
  const lines = [head.join(',')]
  for (const row of rows) {
    const payload = payloadRecord(row.payload)
    const unlockReason =
      String(payload.reason || '').trim() ||
      (String(row.memo || '').toLowerCase().includes('unlock') ? String(row.memo || '') : '')
    const unlockApprovedBy = String(payload.approvedBy || '').trim()
    const lockSource = String(payload.source || '').trim()
    lines.push(
      [
        csvCell(row.created_at || ''),
        csvCell(row.status || ''),
        csvCell(statusLabelKo(row.status)),
        csvCell(row.year_month || ''),
        csvCell(row.store_scope || ''),
        csvCell(row.created_by || ''),
        csvCell(unlockReason),
        csvCell(unlockApprovedBy),
        csvCell(lockSource),
        csvCell(row.memo || ''),
        csvCell(row.journal_entry_id ?? ''),
        csvCell(row.revenue_total ?? ''),
        csvCell(row.expense_total ?? ''),
        csvCell(row.net_income ?? ''),
        csvCell(row.line_count ?? ''),
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
  const yearMonth = String(searchParams.get('yearMonth') || '').trim().slice(0, 7)
  const storeFilter = String(searchParams.get('storeFilter') || '').trim() || 'All'

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json({ error: 'INVALID_YEAR_MONTH' }, { status: 400, headers })
  }

  try {
    const rows = (await supabaseSelectFilter('income_expense_closing_runs', `year_month=eq.${encodeURIComponent(yearMonth)}`, {
      select: 'id,year_month,store_scope,status,created_at,created_by,memo,journal_entry_id,revenue_total,expense_total,net_income,line_count,payload',
      order: 'created_at.asc,id.asc',
      limit: 5000,
    })) as ClosingAuditRow[] | null

    const filtered =
      storeFilter === 'All'
        ? rows || []
        : (rows || []).filter((row) => {
            const scope = String(row.store_scope || 'All')
            return scope === 'All' || scope === storeFilter
          })
    const csv = toCsv(filtered)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        ...Object.fromEntries(headers.entries()),
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="income-expense-closing-audit-${yearMonth}.csv"`,
      },
    })
  } catch (e) {
    if (isMissingClosingRunTableError(e)) {
      const csv = toCsv([])
      return new NextResponse(csv, {
        status: 200,
        headers: {
          ...Object.fromEntries(headers.entries()),
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="income-expense-closing-audit-${yearMonth}.csv"`,
        },
      })
    }
    console.error('exportIncomeExpenseClosingAuditCsv:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
