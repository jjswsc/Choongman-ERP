import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { buildPnd91AnnualSummary } from '@/lib/pnd91-annual-summary'
import { pnd91AnnualToCsv } from '@/lib/pnd91-annual-csv'
import { supabaseSelect, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'

function normalizeEmployeeName(name: string): string {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function pickEmployeeTin(row: {
  tax_id?: string | null
  id_number?: string | null
}): string | null {
  const tax = String(row.tax_id || '').replace(/\D/g, '')
  if (tax.length === 13) return tax
  const idn = String(row.id_number || '').replace(/\D/g, '')
  if (idn.length === 13) return idn
  return null
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'any')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const userRole = String(authResult.auth.role || '').trim()
  const { searchParams } = new URL(request.url)
  const yearRaw = String(searchParams.get('year') || '').trim()
  const storeFilter = String(searchParams.get('storeFilter') || 'All').trim()
  const checklistRaw = String(searchParams.get('checklistJson') || '').trim()

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  const year = Number(yearRaw)
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'INVALID_YEAR' }, { status: 400, headers })
  }

  let checklistByEmployeeKey: Record<string, { status: string; note?: string }> = {}
  if (checklistRaw) {
    try {
      const parsed = JSON.parse(checklistRaw) as Record<string, { status?: string; note?: string }>
      if (parsed && typeof parsed === 'object') {
        checklistByEmployeeKey = Object.fromEntries(
          Object.entries(parsed).map(([k, v]) => [
            k,
            { status: String(v?.status || 'pending'), note: v?.note ? String(v.note) : undefined },
          ])
        )
      }
    } catch {
      /* ignore malformed checklist payload */
    }
  }

  try {
    const start = `${year}-01`
    const end = `${year}-12`
    const payrollFilters = [`month=gte.${encodeURIComponent(start)}`, `month=lte.${encodeURIComponent(end)}`]
    if (storeFilter && storeFilter !== 'All' && storeFilter !== '전체') {
      payrollFilters.push(`store=eq.${encodeURIComponent(storeFilter)}`)
    }
    const whtFilters = [`tax_month=gte.${encodeURIComponent(start)}`, `tax_month=lte.${encodeURIComponent(end)}`]
    if (storeFilter && storeFilter !== 'All' && storeFilter !== '전체') {
      whtFilters.push(`store_name=eq.${encodeURIComponent(storeFilter)}`)
    }

    const [payrollRows, whtRows, empRows] = await Promise.all([
      supabaseSelectFilterAllPages('payroll_records', payrollFilters.join('&'), {
        select:
          'month,store,name,employee_id,status,salary,pos_allow,haz_allow,diligence_allow,birth_bonus,spl_bonus,ot_amt,holiday_pay,tax,sso,net_pay',
        pageSize: 4000,
        maxRows: 200000,
        order: 'month.asc,store.asc,name.asc',
      }),
      supabaseSelectFilterAllPages('withholding_tax_ledger_entries', whtFilters.join('&'), {
        select: 'tax_month,store_name,payee_name,wht_amount,gross_amount,memo,form_hint',
        pageSize: 4000,
        maxRows: 200000,
        order: 'tax_month.asc,payee_name.asc',
      }),
      supabaseSelect('employees', {
        select: 'id,name,store,tax_id,id_number',
        order: 'id.asc',
        limit: 15000,
      }),
    ])

    const taxIdByEmployeeId = new Map<number, string>()
    const taxIdByStoreName = new Map<string, string>()
    for (const e of (empRows || []) as {
      id?: number
      name?: string
      store?: string
      tax_id?: string | null
      id_number?: string | null
    }[]) {
      const tin = pickEmployeeTin(e)
      if (!tin) continue
      const eid = Math.floor(Number(e.id) || 0)
      if (eid > 0 && !taxIdByEmployeeId.has(eid)) taxIdByEmployeeId.set(eid, tin)
      const key = `${String(e.store || '').trim().toLowerCase()}|${normalizeEmployeeName(String(e.name || ''))}`
      if (key !== '|' && !taxIdByStoreName.has(key)) taxIdByStoreName.set(key, tin)
    }

    const summary = buildPnd91AnnualSummary({
      year,
      storeFilter,
      payrollRows: (payrollRows || []) as Parameters<typeof buildPnd91AnnualSummary>[0]['payrollRows'],
      whtRows: (whtRows || []) as Parameters<typeof buildPnd91AnnualSummary>[0]['whtRows'],
      taxIdByEmployeeId,
      taxIdByStoreName,
    })

    const csv = pnd91AnnualToCsv(summary, checklistByEmployeeKey)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        ...Object.fromEntries(headers.entries()),
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="pnd91-${year}-${storeFilter === 'All' ? 'all' : storeFilter}.csv"`,
      },
    })
  } catch (e) {
    console.error('exportPnd91AnnualCsv:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
