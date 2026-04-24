import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { createAccountingStoreScopeMatcher } from '@/lib/accounting-store-scope'
import { buildTaxMonthPostgrestFilter, getThaiTaxFilingPeriodRange } from '@/lib/thai-tax-period'
import { vatLedgerToCsv, type VatLedgerRow } from '@/lib/vat-ledger-csv'
import { consolidatePosOutputRowsForTaxExport, isPosAutoVatOutputRow } from '@/lib/vat-ledger-pos'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole, isOfficeStore } from '@/lib/permissions'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

function csvCell(v: unknown): string {
  const s = String(v ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function parseFilingStatus(v: unknown): '' | 'draft' | 'submitted' {
  const raw = String(v || '').trim().toLowerCase()
  if (raw === 'draft' || raw === 'submitted') return raw
  return ''
}

function normalizeLedgerFilingStatus(v: unknown): 'draft' | 'submitted' {
  return parseFilingStatus(v) === 'submitted' ? 'submitted' : 'draft'
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
  const consolidatePos = String(searchParams.get('consolidatePos') || '1').trim() !== '0'
  const excludePosAuto = String(searchParams.get('excludePosAuto') || '0').trim() === '1'
  const allowedStores =
    (Array.isArray(authResult.auth.allowedStores) ? authResult.auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(String(authResult.auth.store || '').trim())
  const userStore = String(authResult.auth.store || '').trim()
  const isOfficeLevel =
    isOfficeRole(userRole) ||
    isAccountingRole(userRole) ||
    isOfficeStore(userStore) ||
    isHeadOfficeLikeStoreName(userStore)
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
    assertCanManageAccountingCompliance(userRole, String(authResult.auth.store || ''))
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
    const rows = (await supabaseSelectFilterAllPages('vat_ledger_entries', monthFilter, {
      select: '*',
      order: 'doc_date.asc,id.asc',
      pageSize: 4000,
      maxRows: 100000,
    })) as VatLedgerRow[] | null
    const storeScope = await createAccountingStoreScopeMatcher(storeFilter)
    const storeFilteredRows = (rows || []).filter((row) => storeScope.matches(String(row.store_name || '')))
    const filteredRows =
      filingStatus === ''
        ? storeFilteredRows
        : storeFilteredRows.filter((row) => normalizeLedgerFilingStatus(row.filing_status) === filingStatus)

    const filteredForExport = excludePosAuto
      ? filteredRows.filter((row) => !isPosAutoVatOutputRow(row))
      : filteredRows
    const forCsv = consolidatePos ? consolidatePosOutputRowsForTaxExport(filteredForExport) : filteredForExport
    const outputRows = forCsv.filter((row) => String(row.direction || '').toLowerCase() === 'output')
    const inputRows = forCsv.filter((row) => String(row.direction || '').toLowerCase() === 'input')
    const outputVat = outputRows.reduce((sum, row) => sum + Number(row.vat_amount || 0), 0)
    const inputVat = inputRows.reduce((sum, row) => sum + Number(row.vat_amount || 0), 0)
    const payableVat = outputVat - inputVat
    const summaryLines = [
      ['VAT Summary', 'Value'],
      ['Period', period.periodKey],
      ['Store', storeFilter || 'All'],
      ['Output VAT', Math.round(outputVat)],
      ['Input VAT', Math.round(inputVat)],
      ['Payable VAT (Output-Input)', Math.round(payableVat)],
      ['Status', payableVat >= 0 ? 'Payable' : 'Carry Credit'],
      ['Output Row Count', outputRows.length],
      ['Input Row Count', inputRows.length],
    ].map((cells) => cells.map(csvCell).join(','))
    const detailCsv = vatLedgerToCsv(forCsv)
    const csv = `${summaryLines.join('\r\n')}\r\n\r\n${detailCsv}`
    const out = new NextResponse(csv, {
      status: 200,
      headers: {
        ...Object.fromEntries(headers.entries()),
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="vat-ledger-${period.periodKey}.csv"`,
      },
    })
    return out
  } catch (e) {
    console.error('exportVatLedgerCsv:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
