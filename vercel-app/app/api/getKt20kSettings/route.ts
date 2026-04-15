import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const userRole = String(searchParams.get('userRole') || '').trim()
  const year = Number(String(searchParams.get('year') || '').trim())

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'INVALID_YEAR' }, { status: 400, headers })
  }

  try {
    const rows = (await supabaseSelectFilter(
      'thai_workers_comp_settings',
      `effective_year=eq.${year}`,
      { limit: 1, order: 'updated_at.desc' }
    )) as Record<string, unknown>[] | null
    const row = rows?.[0] || {}
    return NextResponse.json(
      {
        success: true,
        year,
        settings: {
          companyTaxId: String(row.company_tax_id || ''),
          companyName: String(row.company_name || ''),
          ssoOfficeProvince: String(row.sso_office_province || ''),
          ssoOfficePhone: String(row.sso_office_phone || ''),
          businessCode5: String(row.business_code_5 || ''),
          fundRatePercent: row.fund_rate_percent != null ? String(row.fund_rate_percent) : '',
          updatedBy: String(row.updated_by || ''),
          updatedAt: String(row.updated_at || ''),
        },
      },
      { headers }
    )
  } catch (e) {
    console.error('getKt20kSettings:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

