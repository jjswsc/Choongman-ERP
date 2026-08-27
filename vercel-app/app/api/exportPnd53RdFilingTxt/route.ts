import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { createAccountingStoreScopeMatcher } from '@/lib/accounting-store-scope'
import { buildTaxMonthPostgrestFilter, getThaiTaxFilingPeriodRange } from '@/lib/thai-tax-period'
import { normalizePndFormHint, type WithholdingTaxLedgerRow } from '@/lib/withholding-tax-csv'
import { buildRdFilingTxtFilename, rdDigitsOnly } from '@/lib/rd-filing-common'
import {
  buildPnd353RdPrepSoftFilename,
  pnd53LedgerToRdFilingTxt,
  pnd53LedgerToRdPrepSoftTxt,
} from '@/lib/pnd53-rd-filing-txt'
import { enrichRdPrepLedgerPayeeAddresses } from '@/lib/rd-prep-payee-address-server'
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
  const formHint = normalizePndFormHint(searchParams.get('formHint'))
  const payerTaxId = String(searchParams.get('payerTaxId') || '').trim()
  const payerBranchNo = String(searchParams.get('payerBranchNo') || '').trim()
  const rdUserId = String(searchParams.get('rdUserId') || '').trim()
  const deptName = String(searchParams.get('deptName') || '').trim()
  /** soft(기본)=빈칸 소프트 매핑, official=Format กลาง H/D */
  const layoutRaw = String(searchParams.get('layout') || 'soft').trim().toLowerCase()
  const layout = layoutRaw === 'official' || layoutRaw === 'format' ? 'official' : 'soft'
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
  if (layout === 'official' && rdDigitsOnly(payerTaxId).length !== 13) {
    return NextResponse.json({ error: 'INVALID_PAYER_TAX_ID' }, { status: 400, headers })
  }

  try {
    const period = getThaiTaxFilingPeriodRange({ yearMonth, periodType })
    const monthFilter = buildTaxMonthPostgrestFilter(period.months)
    const storeScope = await createAccountingStoreScopeMatcher(storeFilter)
    const rows = (await supabaseSelectFilterAllPages('withholding_tax_ledger_entries', monthFilter, {
      select: '*',
      pageSize: 4000,
      maxRows: 100000,
      order: 'payment_date.asc,id.asc',
    })) as WithholdingTaxLedgerRow[] | null
    const scopedRows = (rows || []).filter((row) => storeScope.matches(String(row.store_name || '')))
    const statusFiltered =
      filingStatus === ''
        ? scopedRows
        : scopedRows.filter((row) => normalizeLedgerFilingStatus(row.filing_status) === filingStatus)
    // Format กลาง에는 주소 칸이 없음. ใบแนบ(soft)만 거래처·직원 주소 보강.
    let filteredRows = statusFiltered
    if (layout !== 'official') {
      try {
        filteredRows = await enrichRdPrepLedgerPayeeAddresses(statusFiltered)
      } catch (e) {
        console.warn('exportPnd53RdFilingTxt: payee address enrich skipped', e)
      }
    }

    const txt =
      layout === 'official'
        ? pnd53LedgerToRdFilingTxt(
            filteredRows,
            {
              payerTaxId,
              payerBranchNo,
              deptName,
              rdUserId,
              taxMonth: yearMonth,
            },
            formHint
          )
        : pnd53LedgerToRdPrepSoftTxt(filteredRows, formHint, { includeHeader })
    const filename =
      layout === 'official'
        ? buildRdFilingTxtFilename({
            taxType: formHint === 'PND3' ? 'PND3' : 'PND53',
            taxId13: payerTaxId,
            taxMonth: yearMonth,
            branchNo6: payerBranchNo,
          })
        : buildPnd353RdPrepSoftFilename(formHint, period.periodKey)
    return new NextResponse(txt, {
      status: 200,
      headers: {
        ...Object.fromEntries(headers.entries()),
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e) {
    console.error('exportPnd53RdFilingTxt:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
