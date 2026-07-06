import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { createAccountingStoreScopeMatcher } from '@/lib/accounting-store-scope'
import { buildTaxMonthPostgrestFilter, getThaiTaxFilingPeriodRange } from '@/lib/thai-tax-period'
import type { VatLedgerRow } from '@/lib/vat-ledger-csv'
import { buildRdFilingTxtFilename, rdDigitsOnly } from '@/lib/rd-filing-common'
import { pp30LedgerToRdPrepTxt } from '@/lib/pp30-rd-prep-txt'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

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
  const payerTaxId = String(searchParams.get('payerTaxId') || '').trim()
  const payerBranchNo = String(searchParams.get('payerBranchNo') || '').trim()
  const payerName = String(searchParams.get('payerName') || '').trim()
  const placeOfBusiness = String(searchParams.get('placeOfBusiness') || '').trim()
  const outputNet = Number(searchParams.get('outputNet'))
  const outputVat = Number(searchParams.get('outputVat'))
  const inputNet = Number(searchParams.get('inputNet'))
  const inputVat = Number(searchParams.get('inputVat'))
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
  if (rdDigitsOnly(payerTaxId).length !== 13) {
    return NextResponse.json({ error: 'INVALID_PAYER_TAX_ID' }, { status: 400, headers })
  }
  if (!String(payerName || '').trim()) {
    return NextResponse.json({ error: 'MISSING_PAYER_NAME' }, { status: 400, headers })
  }

  try {
    const period = getThaiTaxFilingPeriodRange({ yearMonth, periodType })
    const monthFilter = buildTaxMonthPostgrestFilter(period.months)
    const storeScope = await createAccountingStoreScopeMatcher(storeFilter)
    const rows = (await supabaseSelectFilterAllPages('vat_ledger_entries', monthFilter, {
      select: '*',
      pageSize: 4000,
      maxRows: 100000,
      order: 'doc_date.asc,id.asc',
    })) as VatLedgerRow[] | null
    const scopedRows = (rows || []).filter((row) => storeScope.matches(String(row.store_name || '')))
    const filteredRows =
      filingStatus === ''
        ? scopedRows
        : scopedRows.filter((row) => normalizeLedgerFilingStatus(row.filing_status) === filingStatus)

    const outputRows = filteredRows.filter((r) => String(r.direction || '').toLowerCase() === 'output')
    const inputRows = filteredRows.filter((r) => String(r.direction || '').toLowerCase() === 'input')
    const sumOutNet = outputRows.reduce((s, r) => s + (Number(r.net_amount) || 0), 0)
    const sumOutVat = outputRows.reduce((s, r) => s + (Number(r.vat_amount) || 0), 0)
    const sumInNet = inputRows.reduce((s, r) => s + (Number(r.net_amount) || 0), 0)
    const sumInVat = inputRows.reduce((s, r) => s + (Number(r.vat_amount) || 0), 0)

    const txt = pp30LedgerToRdPrepTxt(outputRows, inputRows, {
      payerTaxId,
      payerBranchNo,
      payerName,
      placeOfBusiness,
      taxMonth: yearMonth,
      outputNet: Number.isFinite(outputNet) ? outputNet : sumOutNet,
      outputVat: Number.isFinite(outputVat) ? outputVat : sumOutVat,
      inputNet: Number.isFinite(inputNet) ? inputNet : sumInNet,
      inputVat: Number.isFinite(inputVat) ? inputVat : sumInVat,
    })
    const filename = buildRdFilingTxtFilename({
      taxType: 'PP30',
      taxId13: payerTaxId,
      taxMonth: yearMonth,
      branchNo6: payerBranchNo,
    })
    return new NextResponse(txt, {
      status: 200,
      headers: {
        ...Object.fromEntries(headers.entries()),
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e) {
    console.error('exportPp30RdPrepTxt:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
