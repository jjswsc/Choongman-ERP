import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { resolveTaxBookAsOfRange, resolveTaxBookMonthRange, taxEntityKeyFromScope } from '@/lib/tax-book'
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
  const fromMonth = String(searchParams.get('fromMonth') || yearMonth).trim()
  const toMonth = String(searchParams.get('toMonth') || yearMonth).trim()
  const scopeFilter = String(searchParams.get('scopeFilter') || '').trim()
  const view = String(searchParams.get('view') || 'vouchers').trim()
  const accountCode = String(searchParams.get('accountCode') || '').trim()
  const range = resolveTaxBookMonthRange(fromMonth, toMonth)
  if (!range.ok) {
    return NextResponse.json({ error: range.error }, { status: 400, headers })
  }
  const taxEntityCode = taxEntityKeyFromScope(scopeFilter)
  if (!taxEntityCode) {
    return NextResponse.json({ error: 'NEED_TAX_ENTITY', schemaReady: true, vouchers: [], ledger: [], trial: [] }, { status: 400, headers })
  }
  try {
    // 전표 목록 = 선택 기간 발생분. 시산·원장·세무 FS = 연초~종료월 누적(as-of).
    const activity = range
    const asOf = resolveTaxBookAsOfRange(range.to)
    if (!asOf.ok) {
      return NextResponse.json({ error: asOf.error }, { status: 400, headers })
    }
    const headsRange = view === 'vouchers' ? activity : asOf
    const heads = await loadTaxBookJournalHeads({
      taxEntityCode,
      fromMonth: headsRange.from,
      toMonth: headsRange.to,
    })
    if (!heads.schemaReady) {
      return NextResponse.json({ schemaReady: false, vouchers: [], ledger: [], trial: [] }, { headers })
    }
    const lines = await loadTaxBookLines(heads.heads.map((h) => Number(h.id || 0)))
    const trial = summarizeTaxBookTrial(lines)
    const ledgerAll = view === 'vouchers' ? [] : toTaxBookLedger(asOf.from, heads.heads, lines)
    const ledger = accountCode
      ? ledgerAll.filter((ln) => String(ln.accountCode || '') === accountCode)
      : ledgerAll
    // 전표 목록은 선택 기간만. trial 뷰에서도 checklist용으로 같은 기간 전표를 내려준다.
    let voucherHeads = heads.heads
    let voucherLines = lines
    if (view !== 'vouchers') {
      const activityHeads = await loadTaxBookJournalHeads({
        taxEntityCode,
        fromMonth: activity.from,
        toMonth: activity.to,
      })
      voucherHeads = activityHeads.heads
      voucherLines = await loadTaxBookLines(voucherHeads.map((h) => Number(h.id || 0)))
    }
    return NextResponse.json(
      {
        schemaReady: true,
        taxEntityCode,
        yearMonth: range.from,
        fromMonth: range.from,
        toMonth: range.to,
        asOfFromMonth: asOf.from,
        accountCode: accountCode || null,
        vouchers: view === 'ledger' ? [] : toTaxBookEntries(activity.from, voucherHeads, voucherLines),
        ledger,
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
