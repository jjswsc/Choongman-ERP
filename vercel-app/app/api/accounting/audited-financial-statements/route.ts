import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { requireAuth } from '@/lib/verify-auth'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  AUDITED_FS_FY2568,
  type AuditedFinancialStatementSnapshot,
} from '@/lib/audited-financial-statements'

export const runtime = 'nodejs'

type DbRow = {
  tax_id?: string
  tax_entity_code?: string
  entity_name_th?: string
  entity_name_en?: string
  fiscal_year_end?: string
  fiscal_year_be?: number
  period_start?: string
  period_end?: string
  source_label?: string
  bs?: AuditedFinancialStatementSnapshot['bs']
  pl?: AuditedFinancialStatementSnapshot['pl']
  prior_bs?: AuditedFinancialStatementSnapshot['priorBs']
  prior_pl?: AuditedFinancialStatementSnapshot['priorPl']
}

function mapDb(row: DbRow): AuditedFinancialStatementSnapshot {
  return {
    taxId: String(row.tax_id || ''),
    taxEntityCode: String(row.tax_entity_code || ''),
    entityNameTh: String(row.entity_name_th || ''),
    entityNameEn: String(row.entity_name_en || ''),
    fiscalYearEnd: String(row.fiscal_year_end || '').slice(0, 10),
    fiscalYearBe: Number(row.fiscal_year_be) || 0,
    periodStart: String(row.period_start || '').slice(0, 10),
    periodEnd: String(row.period_end || '').slice(0, 10),
    sourceLabel: String(row.source_label || ''),
    bs: row.bs as AuditedFinancialStatementSnapshot['bs'],
    pl: row.pl as AuditedFinancialStatementSnapshot['pl'],
    priorBs: (row.prior_bs ?? null) as AuditedFinancialStatementSnapshot['priorBs'],
    priorPl: (row.prior_pl ?? null) as AuditedFinancialStatementSnapshot['priorPl'],
  }
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }

  try {
    assertCanManageAccountingCompliance(String(authResult.auth.role || ''))
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  const { searchParams } = new URL(request.url)
  const yearEnd = String(searchParams.get('fiscalYearEnd') || '2025-12-31').trim()
  const taxId = String(searchParams.get('taxId') || '').trim()

  try {
    try {
      const parts = [`fiscal_year_end=eq.${encodeURIComponent(yearEnd)}`]
      if (taxId) parts.push(`tax_id=eq.${encodeURIComponent(taxId)}`)
      const rows = (await supabaseSelectFilter('audited_financial_statements', parts.join('&'), {
        select:
          'tax_id,tax_entity_code,entity_name_th,entity_name_en,fiscal_year_end,fiscal_year_be,period_start,period_end,source_label,bs,pl,prior_bs,prior_pl',
        order: 'tax_id.asc',
        limit: 100,
      })) as DbRow[]
      if (Array.isArray(rows) && rows.length > 0) {
        return NextResponse.json({ ok: true, source: 'db', items: rows.map(mapDb) }, { headers })
      }
    } catch {
      // 테이블 미배포 시 코드 시드 폴백
    }

    let items = AUDITED_FS_FY2568.filter((r) => r.fiscalYearEnd === yearEnd)
    if (taxId) items = items.filter((r) => r.taxId === taxId)
    return NextResponse.json({ ok: true, source: 'seed', items }, { headers })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String((e as Error)?.message || e) },
      { status: 500, headers }
    )
  }
}
