import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { resolveTaxBookAsOfRange, resolveTaxBookMonthRange, taxEntityKeyFromScope } from '@/lib/tax-book'
import {
  loadTaxBookJournalHeads,
  loadTaxBookLines,
  loadTaxBookVoucherLines,
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
  const entryId = Number(searchParams.get('entryId') || 0)
  if (entryId > 0) {
    const detailScope = String(searchParams.get('scopeFilter') || '').trim()
    const detailEntity = taxEntityKeyFromScope(detailScope)
    if (!detailEntity) {
      return NextResponse.json({ error: 'NEED_TAX_ENTITY', lines: [] }, { status: 400, headers })
    }
    try {
      const lines = await loadTaxBookVoucherLines(entryId, detailEntity)
      if (lines == null) {
        return NextResponse.json({ error: 'NOT_FOUND', lines: [] }, { status: 404, headers })
      }
      return NextResponse.json({ schemaReady: true, lines }, { headers })
    } catch (e) {
      console.error('getTaxBookEntries detail:', e)
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers })
    }
  }
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
    const activity = range
    const asOf = resolveTaxBookAsOfRange(range.to)
    if (!asOf.ok) {
      return NextResponse.json({ error: asOf.error }, { status: 400, headers })
    }

    // 시산·원장·세무 FS는 항상 연초~종료월 누적. 전표 목록은 선택 기간 발생분.
    const [asOfHeads, activityHeads] = await Promise.all([
      loadTaxBookJournalHeads({
        taxEntityCode,
        fromMonth: asOf.from,
        toMonth: asOf.to,
      }),
      loadTaxBookJournalHeads({
        taxEntityCode,
        fromMonth: activity.from,
        toMonth: activity.to,
      }),
    ])
    if (!asOfHeads.schemaReady || !activityHeads.schemaReady) {
      return NextResponse.json({ schemaReady: false, vouchers: [], ledger: [], trial: [] }, { headers })
    }

    const [asOfLines, activityLines] = await Promise.all([
      loadTaxBookLines(asOfHeads.heads.map((h) => Number(h.id || 0))),
      loadTaxBookLines(activityHeads.heads.map((h) => Number(h.id || 0))),
    ])
    const trial = summarizeTaxBookTrial(asOfLines)
    const ledgerAll =
      view === 'vouchers' ? [] : toTaxBookLedger(asOf.from, asOfHeads.heads, asOfLines)
    const ledger = accountCode
      ? ledgerAll.filter((ln) => String(ln.accountCode || '') === accountCode)
      : ledgerAll

    return NextResponse.json(
      {
        schemaReady: true,
        taxEntityCode,
        yearMonth: range.from,
        fromMonth: range.from,
        toMonth: range.to,
        asOfFromMonth: asOf.from,
        accountCode: accountCode || null,
        // 체크리스트·전표 탭용: 선택 기간 발생분 (ledger 뷰에서도 유지)
        vouchers: toTaxBookEntries(activity.from, activityHeads.heads, activityLines),
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
