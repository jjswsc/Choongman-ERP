import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { appendStoreNameFilter } from '@/lib/accounting-ledger-store-filter'
import { buildTaxMonthPostgrestFilter, getThaiTaxFilingPeriodRange } from '@/lib/thai-tax-period'
import { validatePnd1Rows, type Pnd1SourceRow } from '@/lib/pnd1-rd-prep-txt'
import { requireAuth } from '@/lib/verify-auth'

function parseFilingStatus(v: unknown): '' | 'draft' | 'submitted' {
  const raw = String(v || '').trim().toLowerCase()
  if (raw === 'draft' || raw === 'submitted') return raw
  return ''
}

function normalizeLedgerFilingStatus(v: unknown): 'draft' | 'submitted' {
  return parseFilingStatus(v) === 'submitted' ? 'submitted' : 'draft'
}

function normalizeForm(v: unknown): 'pnd1' | 'pnd1a' | 'all' {
  const raw = String(v || '').trim().toLowerCase()
  if (raw === 'all') return 'all'
  if (raw === 'pnd1a' || raw === 'ภ.ง.ด.1ก') return 'pnd1a'
  return 'pnd1'
}

function normalizeRowFormHint(v: unknown): 'pnd1' | 'pnd1a' | 'other' {
  const raw = String(v || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
  if (!raw) return 'other'
  if (raw.includes('1ก') || raw.includes('pnd1a') || raw.includes('ภ.ง.ด.1ก')) return 'pnd1a'
  if (raw.includes('pnd1') || raw.includes('ภ.ง.ด.1') || raw === '1') return 'pnd1'
  return 'other'
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
  const taxMonth = String(searchParams.get('taxMonth') || '').trim().slice(0, 7)
  const yearMonth = String(searchParams.get('yearMonth') || taxMonth).trim().slice(0, 7)
  const periodTypeRaw = String(searchParams.get('periodType') || 'monthly').trim().toLowerCase()
  const periodType = periodTypeRaw === 'annual' || periodTypeRaw === 'half_year' ? periodTypeRaw : 'monthly'
  const filingStatus = parseFilingStatus(searchParams.get('filingStatus'))
  const storeFilter = String(searchParams.get('storeFilter') || '').trim()
  const filingForm = normalizeForm(searchParams.get('filingForm'))

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
    const period = getThaiTaxFilingPeriodRange({ yearMonth, periodType })
    const monthFilter = buildTaxMonthPostgrestFilter(period.months)
    const filter = appendStoreNameFilter(monthFilter, storeFilter)
    const rows = (await supabaseSelectFilter('withholding_tax_ledger_entries', filter, {
      select: '*',
      limit: 20000,
      order: 'payment_date.asc,id.asc',
    })) as (Pnd1SourceRow & { filing_status?: string | null; form_hint?: string | null })[] | null

    const filteredRows = (rows || []).filter((row) => {
      const statusOk =
        filingStatus === '' || normalizeLedgerFilingStatus(row.filing_status) === filingStatus
      if (!statusOk) return false
      if (filingForm === 'all') return true
      return normalizeRowFormHint(row.form_hint) === filingForm
    })

    const summary = validatePnd1Rows(filteredRows)
    return NextResponse.json(
      {
        period,
        filingForm,
        ...summary,
      },
      { headers }
    )
  } catch (e) {
    console.error('validatePnd1RdPrep:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
