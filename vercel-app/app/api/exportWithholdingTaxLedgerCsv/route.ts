import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { appendStoreNameFilter } from '@/lib/accounting-ledger-store-filter'
import { buildMonthInFilter, getThaiTaxFilingPeriodRange } from '@/lib/thai-tax-period'
import { withholdingTaxLedgerToCsv, type WithholdingTaxLedgerRow } from '@/lib/withholding-tax-csv'

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
  const { searchParams } = new URL(request.url)
  const userRole = String(searchParams.get('userRole') || '').trim()
  const taxMonth = String(searchParams.get('taxMonth') || '').trim().slice(0, 7)
  const yearMonth = String(searchParams.get('yearMonth') || taxMonth).trim().slice(0, 7)
  const periodTypeRaw = String(searchParams.get('periodType') || 'monthly').trim().toLowerCase()
  const periodType = periodTypeRaw === 'annual' || periodTypeRaw === 'half_year' ? periodTypeRaw : 'monthly'
  const filingStatus = parseFilingStatus(searchParams.get('filingStatus'))
  const storeFilter = String(searchParams.get('storeFilter') || '').trim()

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
    const monthIn = buildMonthInFilter(period.months)
    const filter = appendStoreNameFilter(`tax_month=in.(${monthIn})`, storeFilter)
    const rows = (await supabaseSelectFilter('withholding_tax_ledger_entries', filter, {
      select: '*',
      limit: 20000,
      order: 'payment_date.asc,id.asc',
    })) as WithholdingTaxLedgerRow[] | null
    const filteredRows =
      filingStatus === ''
        ? rows || []
        : (rows || []).filter((row) => normalizeLedgerFilingStatus(row.filing_status) === filingStatus)

    const csv = withholdingTaxLedgerToCsv(filteredRows)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        ...Object.fromEntries(headers.entries()),
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="withholding-tax-ledger-${period.periodKey}.csv"`,
      },
    })
  } catch (e) {
    console.error('exportWithholdingTaxLedgerCsv:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

