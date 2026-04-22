import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { appendStoreNameFilter } from '@/lib/accounting-ledger-store-filter'
import { supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { buildTaxMonthPostgrestFilter, getThaiTaxFilingPeriodRange } from '@/lib/thai-tax-period'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

type WhtRow = {
  id?: number
  payment_date?: string | null
  tax_month?: string | null
  payee_name?: string | null
  payee_tax_id?: string | null
  wht_amount?: number | null
  store_name?: string | null
  certificate_no?: string | null
  form_hint?: string | null
  memo?: string | null
}

function isPayrollWhtRow(row: WhtRow): boolean {
  const form = String(row.form_hint || '').trim().toLowerCase()
  const memo = String(row.memo || '').trim()
  if (memo.includes('[AUTO:PAYROLL_RECORD_WHT:')) return true
  return form.includes('pnd1') || form.includes('ภ.ง.ด.1')
}

function hasTin(v: unknown): boolean {
  const d = String(v || '').replace(/\D/g, '')
  return d.length === 13
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    authResult.errorResponse.headers.set('Cache-Control', 'no-store')
    return authResult.errorResponse
  }
  const auth = authResult.auth

  const { searchParams } = new URL(request.url)
  const userRole = String(auth.role || '').trim()
  const yearMonth = String(searchParams.get('yearMonth') || searchParams.get('taxMonth') || '').trim()
  const periodTypeRaw = String(searchParams.get('periodType') || 'monthly')
    .trim()
    .toLowerCase()
  const periodType = periodTypeRaw === 'annual' || periodTypeRaw === 'half_year' ? periodTypeRaw : 'monthly'
  const requestedStoreFilter = String(searchParams.get('storeFilter') || '').trim()
  const allowedStores =
    (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(String(auth.store || '').trim())
  const isOfficeLevel = isOfficeRole(userRole) || isAccountingRole(userRole)
  let storeFilter = requestedStoreFilter
  if (!isOfficeLevel) {
    if (!requestedStoreFilter || requestedStoreFilter === 'All') {
      storeFilter = String(allowedStores[0] || '').trim()
      if (!storeFilter) {
        return NextResponse.json({ error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
      }
    } else {
      const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, requestedStoreFilter))
      if (!allowed) {
        return NextResponse.json({ error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
      }
    }
  }

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  try {
    const period = getThaiTaxFilingPeriodRange({ yearMonth, periodType })
    const monthFilter = buildTaxMonthPostgrestFilter(period.months)
    const filter = appendStoreNameFilter(monthFilter, storeFilter)

    const rows = (await supabaseSelectFilterAllPages('withholding_tax_ledger_entries', filter, {
      select:
        'id,payment_date,tax_month,payee_name,payee_tax_id,wht_amount,store_name,certificate_no,form_hint,memo',
      order: 'payment_date.asc,id.asc',
      pageSize: 5000,
      maxRows: 120000,
    })) as WhtRow[]

    const payrollRows = (rows || []).filter(isPayrollWhtRow)
    const gapRows = payrollRows
      .filter((r) => !hasTin(r.payee_tax_id))
      .map((r) => ({
        id: Number(r.id || 0) || null,
        paymentDate: String(r.payment_date || '').slice(0, 10),
        taxMonth: String(r.tax_month || '').slice(0, 7),
        payeeName: String(r.payee_name || '').trim(),
        storeName: String(r.store_name || '').trim(),
        whtAmount: Number(r.wht_amount || 0) || 0,
        certificateNo: String(r.certificate_no || '').trim(),
        formHint: String(r.form_hint || '').trim(),
        memo: String(r.memo || '').trim(),
      }))

    const uniqEmployeeSet = new Set(
      gapRows
        .map((r) => `${(r.storeName || '').toLowerCase()}|${(r.payeeName || '').toLowerCase()}`)
        .filter((x) => x !== '|')
    )

    return NextResponse.json(
      {
        period,
        storeFilter: storeFilter || 'All',
        payrollRowCount: payrollRows.length,
        gapRowCount: gapRows.length,
        uniqueEmployeeCount: uniqEmployeeSet.size,
        gaps: gapRows.slice(0, 800),
      },
      { headers }
    )
  } catch (e) {
    console.error('getPayrollWhtTinGaps:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

