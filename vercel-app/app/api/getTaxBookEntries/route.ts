import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { taxEntityKeyFromScope } from '@/lib/tax-book'
import {
  loadTaxBookJournalHeads,
  loadTaxBookLines,
  summarizeTaxBookTrial,
  toTaxBookEntries,
  toTaxBookLedger,
} from '@/lib/tax-book-server'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  try {
    assertCanManageAccountingCompliance(String(auth.role || ''), String(auth.store || ''))
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }
  const { searchParams } = new URL(request.url)
  const yearMonth = String(searchParams.get('yearMonth') || '').trim()
  const scopeFilter = String(searchParams.get('scopeFilter') || '').trim()
  const view = String(searchParams.get('view') || 'vouchers').trim()
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json({ error: 'INVALID_YEAR_MONTH' }, { status: 400, headers })
  }
  const taxEntityCode = taxEntityKeyFromScope(scopeFilter)
  if (!taxEntityCode) {
    return NextResponse.json({ error: 'NEED_TAX_ENTITY', schemaReady: true, vouchers: [], ledger: [], trial: [] }, { status: 400, headers })
  }
  try {
    const heads = await loadTaxBookJournalHeads({ taxEntityCode, yearMonth })
    if (!heads.schemaReady) {
      return NextResponse.json({ schemaReady: false, vouchers: [], ledger: [], trial: [] }, { headers })
    }
    const lines = await loadTaxBookLines(heads.heads.map((h) => Number(h.id || 0)))
    const trial = summarizeTaxBookTrial(lines)
    return NextResponse.json(
      {
        schemaReady: true,
        taxEntityCode,
        yearMonth,
        vouchers: view === 'ledger' ? [] : toTaxBookEntries(yearMonth, heads.heads, lines),
        ledger: view === 'vouchers' ? [] : toTaxBookLedger(yearMonth, heads.heads, lines),
        trial: trial.rows,
        totalDebit: trial.totalDebit,
        totalCredit: trial.totalCredit,
        diff: Math.round((trial.totalDebit - trial.totalCredit) * 100) / 100,
      },
      { headers }
    )
  } catch (e) {
    console.error('getTaxBookEntries:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers })
  }
}
