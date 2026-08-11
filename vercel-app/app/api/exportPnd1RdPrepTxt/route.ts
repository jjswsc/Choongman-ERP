import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { createAccountingStoreScopeMatcher } from '@/lib/accounting-store-scope'
import { buildTaxMonthPostgrestFilter, getThaiTaxFilingPeriodRange } from '@/lib/thai-tax-period'
import { pnd1LedgerToRdPrepTxt, type Pnd1SourceRow } from '@/lib/pnd1-rd-prep-txt'
import { buildPnd1RdPrepReviewWorkbook, buildPnd1RdPrepXlsxFilename } from '@/lib/pnd1-rd-prep-xlsx'
import { writeErpXlsxWorkbookToBuffer } from '@/lib/erp-excel-export'
import { matchesPnd1FilingForm } from '@/lib/withholding-tax-csv'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const { searchParams } = new URL(request.url)
  const userRole = String(authResult.auth.role || '').trim()
  const taxMonth = String(searchParams.get('taxMonth') || '').trim().slice(0, 7)
  const yearMonth = String(searchParams.get('yearMonth') || taxMonth).trim().slice(0, 7)
  const periodTypeRaw = String(searchParams.get('periodType') || 'monthly').trim().toLowerCase()
  const periodType = periodTypeRaw === 'annual' || periodTypeRaw === 'half_year' ? periodTypeRaw : 'monthly'
  const filingStatus = parseFilingStatus(searchParams.get('filingStatus'))
  const requestedStoreFilter = String(searchParams.get('storeFilter') || '').trim()
  const filingForm = normalizeForm(searchParams.get('filingForm'))
  const formatRaw = String(searchParams.get('format') || 'txt').trim().toLowerCase()
  const format = formatRaw === 'xlsx' || formatRaw === 'excel' ? 'xlsx' : 'txt'
  const payerTaxId = String(searchParams.get('payerTaxId') || '').trim()
  const payerBranchNo = String(searchParams.get('payerBranchNo') || '').trim()
  const payerName = String(searchParams.get('payerName') || '').trim()
  const includeHeader = String(searchParams.get('includeHeader') || '').trim() === '1'
  const allowedStores =
    (Array.isArray(authResult.auth.allowedStores) ? authResult.auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(String(authResult.auth.store || '').trim())
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

  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json({ error: 'INVALID_YEAR_MONTH' }, { status: 400, headers })
  }

  try {
    const period = getThaiTaxFilingPeriodRange({ yearMonth, periodType })
    const monthFilter = buildTaxMonthPostgrestFilter(period.months)
    // entity:/taxid: 는 store_name=eq 가 아니라 스코프 매처로 필터 (빈 TXT 원인)
    const storeScope = await createAccountingStoreScopeMatcher(storeFilter)
    const rows = (await supabaseSelectFilterAllPages('withholding_tax_ledger_entries', monthFilter, {
      select: '*',
      pageSize: 4000,
      maxRows: 100000,
      order: 'payment_date.asc,id.asc',
    })) as (Pnd1SourceRow & {
      filing_status?: string | null
      form_hint?: string | null
      store_name?: string | null
    })[] | null

    const filteredRows = (rows || []).filter((row) => {
      if (!storeScope.matches(String(row.store_name || ''))) return false
      const statusOk =
        filingStatus === '' || normalizeLedgerFilingStatus(row.filing_status) === filingStatus
      if (!statusOk) return false
      return matchesPnd1FilingForm(row.form_hint, filingForm)
    })

    if (!filteredRows.length) {
      return NextResponse.json(
        {
          error: 'NO_PND1_ROWS',
          message:
            'No PND1 ledger rows for this scope. Search/sync ledger first, or check entity/store filter.',
        },
        { status: 404, headers }
      )
    }

    const exportOpts = {
      payerTaxId,
      payerBranchNo,
      payerName,
      includeHeader,
    }

    if (format === 'xlsx') {
      const wb = buildPnd1RdPrepReviewWorkbook(filteredRows, exportOpts)
      const buf = await writeErpXlsxWorkbookToBuffer(wb)
      const filename = buildPnd1RdPrepXlsxFilename(period.periodKey, filingForm)
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          ...Object.fromEntries(headers.entries()),
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    const txt = pnd1LedgerToRdPrepTxt(filteredRows, exportOpts)
    return new NextResponse(txt, {
      status: 200,
      headers: {
        ...Object.fromEntries(headers.entries()),
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="pnd1-rd-prep-${filingForm}-${period.periodKey}.txt"`,
      },
    })
  } catch (e) {
    console.error('exportPnd1RdPrepTxt:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
