import { NextRequest, NextResponse } from 'next/server'
import { assertCanApproveAccountingCompliance } from '@/lib/accounting-auth'
import {
  deletePayableSettlementJournals,
  loadPaidBankCreditForExpenseAccrual,
} from '@/lib/paid-bank-credit-server'
import { PAID_BANK_GL_CODE, TRADE_PAYABLES_CODE } from '@/lib/paid-bank-credit'
import { taxAmountsClose, taxEntityKeyFromScope } from '@/lib/tax-book'
import { TAX_BOOK_SCHEMA_MISSING, TAX_PERIOD_CLOSED } from '@/lib/tax-book-period-server'
import { loadTaxBookVoucherDetail, replaceTaxBookVoucherLines } from '@/lib/tax-book-server'
import { requireAuth } from '@/lib/verify-auth'

type LineBody = {
  accountCode?: string
  accountName?: string
  debit?: number
  credit?: number
  memo?: string
}

function statusFor(code: string): number {
  if (code === 'NEED_TAX_ENTITY' || code === 'UNBALANCED' || code === 'NOT_FOUND' || code === 'ONE_SIDE') return 400
  if (code === TAX_PERIOD_CLOSED || code === TAX_BOOK_SCHEMA_MISSING) return 409
  if (code === 'ACCOUNTING_APPROVAL_FORBIDDEN' || code === 'ACCOUNTING_FORBIDDEN') return 403
  return 500
}

/** 세무 장부 팝업에서 Dr./Cr.·계정코드·계정명을 고친다. */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    authResult.errorResponse.headers.set('Content-Type', 'application/json')
    return authResult.errorResponse
  }
  try {
    assertCanApproveAccountingCompliance(String(authResult.auth.role || ''))
    const body = (await request.json().catch(() => ({}))) as {
      entryId?: number
      scopeFilter?: string
      lines?: LineBody[]
    }
    const entryId = Math.floor(Number(body.entryId) || 0)
    const taxEntityCode = taxEntityKeyFromScope(String(body.scopeFilter || ''))
    if (!entryId || !taxEntityCode) throw new Error(entryId ? 'NEED_TAX_ENTITY' : 'NOT_FOUND')
    const before = await loadTaxBookVoucherDetail(entryId, taxEntityCode)
    if (!before) throw new Error('NOT_FOUND')
    const parsed = (body.lines || [])
      .map((ln) => {
        const debit = Math.abs(Number(ln.debit) || 0)
        const credit = Math.abs(Number(ln.credit) || 0)
        return {
          accountCode: String(ln.accountCode || '').trim(),
          accountName: String(ln.accountName || '').trim(),
          debit,
          credit,
          memo: String(ln.memo || '').trim(),
        }
      })
      .filter((ln) => ln.accountCode && (ln.debit > 0 || ln.credit > 0))
    if (parsed.some((ln) => ln.debit > 0.0001 && ln.credit > 0.0001)) throw new Error('ONE_SIDE')
    const lines = parsed.map((ln) => ({
      accountCode: ln.accountCode,
      accountName: ln.accountName || ln.accountCode,
      side: ln.credit > ln.debit ? ('credit' as const) : ('debit' as const),
      amount: ln.credit > ln.debit ? ln.credit : ln.debit,
      memo: ln.memo,
    }))
    await replaceTaxBookVoucherLines({ entryId, taxEntityCode, lines })

    let settlementSkipped = false
    if (before.sourceType === 'expense_accrual' && before.sourceId > 0) {
      const paid = await loadPaidBankCreditForExpenseAccrual(before.sourceId)
      const oldAp = (before.lines || [])
        .filter((ln) => ln.accountCode === TRADE_PAYABLES_CODE && ln.credit > 0)
        .reduce((sum, ln) => sum + ln.credit, 0)
      const newAp = lines
        .filter((ln) => ln.side === 'credit' && ln.accountCode === TRADE_PAYABLES_CODE)
        .reduce((sum, ln) => sum + ln.amount, 0)
      const newBank = lines
        .filter((ln) => ln.side === 'credit' && ln.accountCode === (paid?.accountCode || PAID_BANK_GL_CODE))
        .reduce((sum, ln) => sum + ln.amount, 0)
      if (
        paid &&
        oldAp > 0 &&
        newAp <= 0.02 &&
        taxAmountsClose(oldAp, paid.amount) &&
        taxAmountsClose(newBank, paid.amount)
      ) {
        for (const bankId of paid.bankTransactionIds) {
          const cleared = await deletePayableSettlementJournals(bankId, 'tax', taxEntityCode)
          if (cleared.skippedClosed) settlementSkipped = true
        }
      }
    }

    const after = await loadTaxBookVoucherDetail(entryId, taxEntityCode)
    return NextResponse.json(
      { success: true, lines: after?.lines || [], settlementSkipped },
      { headers }
    )
  } catch (e) {
    const code = e instanceof Error ? e.message : String(e)
    const status = statusFor(code)
    if (status === 500) console.error('updateTaxBookVoucherLines:', e)
    return NextResponse.json({ success: false, error: code }, { status, headers })
  }
}
