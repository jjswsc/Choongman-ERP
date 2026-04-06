import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { appendStoreNameFilter } from '@/lib/accounting-ledger-store-filter'
import { withholdingTaxLedgerToCsv, type WithholdingTaxLedgerRow } from '@/lib/withholding-tax-csv'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const userRole = String(searchParams.get('userRole') || '').trim()
  const taxMonth = String(searchParams.get('taxMonth') || '').trim().slice(0, 7)
  const storeFilter = String(searchParams.get('storeFilter') || '').trim()

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  if (!/^\d{4}-\d{2}$/.test(taxMonth)) {
    return NextResponse.json({ error: 'INVALID_TAX_MONTH' }, { status: 400, headers })
  }

  try {
    const filter = appendStoreNameFilter(`tax_month=eq.${encodeURIComponent(taxMonth)}`, storeFilter)
    const rows = (await supabaseSelectFilter('withholding_tax_ledger_entries', filter, {
      select: '*',
      limit: 5000,
      order: 'payment_date.asc,id.asc',
    })) as WithholdingTaxLedgerRow[] | null

    const csv = withholdingTaxLedgerToCsv(rows || [])
    return new NextResponse(csv, {
      status: 200,
      headers: {
        ...Object.fromEntries(headers.entries()),
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="withholding-tax-ledger-${taxMonth}.csv"`,
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

