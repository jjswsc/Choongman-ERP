import { NextRequest, NextResponse } from 'next/server'
import { assertCanApproveAccountingCompliance, assertCanApproveAccountingPeriodUnlock } from '@/lib/accounting-auth'
import { TAX_CLOSE_LOCKS_STORE_PERIOD, taxEntityKeyFromScope, taxJournalBalanced } from '@/lib/tax-book'
import {
  postTaxAdjustmentJournal,
  postTaxIncomeExpenseClosing,
  postTaxInventoryCogsJournal,
  postTaxPayrollJournal,
  postTaxVatSummaryJournal,
} from '@/lib/tax-book-posting'
import { setTaxAccountingPeriodClosed, TAX_BOOK_SCHEMA_MISSING, TAX_PERIOD_CLOSED } from '@/lib/tax-book-period-server'
import { loadTaxBookJournalHeads, loadTaxBookLines, summarizeTaxBookTrial } from '@/lib/tax-book-server'
import { loadTaxManagementBridge, loadTaxPayrollTotals } from '@/lib/tax-management-bridge-server'
import { requireAuth } from '@/lib/verify-auth'

export const maxDuration = 120

function statusFor(code: string): number {
  if (code === 'NEED_TAX_ENTITY' || code === 'INVALID_YEAR_MONTH' || code === 'UNBALANCED' || code === 'NO_AMOUNT') return 400
  if (code === TAX_PERIOD_CLOSED) return 409
  if (code === TAX_BOOK_SCHEMA_MISSING) return 409
  if (code === 'ACCOUNTING_FORBIDDEN' || code === 'ACCOUNTING_APPROVAL_FORBIDDEN' || code === 'ACCOUNTING_UNLOCK_APPROVAL_FORBIDDEN') return 403
  return 500
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const body = (await request.json().catch(() => ({}))) as {
    action?: string
    yearMonth?: string
    scopeFilter?: string
    memo?: string
    unlockReason?: string
    lines?: { accountCode?: string; accountName?: string; side?: string; amount?: number }[]
  }
  const action = String(body.action || '').trim()
  const yearMonth = String(body.yearMonth || '').trim()
  const scopeFilter = String(body.scopeFilter || '').trim()
  const taxEntityCode = taxEntityKeyFromScope(scopeFilter)
  const actor = String(auth.name || '').trim() || null
  try {
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) throw new Error('INVALID_YEAR_MONTH')
    if (!taxEntityCode) throw new Error('NEED_TAX_ENTITY')

    if (action === 'unlock') {
      assertCanApproveAccountingPeriodUnlock(String(auth.role || ''))
      await setTaxAccountingPeriodClosed({
        taxEntityCode,
        yearMonth,
        isClosed: false,
        actor,
        unlockReason: body.unlockReason || null,
      })
      return NextResponse.json({ success: true, locksStorePeriod: TAX_CLOSE_LOCKS_STORE_PERIOD }, { headers })
    }

    assertCanApproveAccountingCompliance(String(auth.role || ''))

    if (action === 'payroll') {
      const totals = await loadTaxPayrollTotals({ yearMonth, scopeFilter, tenantId: auth.tenantId })
      if (totals.gross <= 0) throw new Error('NO_AMOUNT')
      const id = await postTaxPayrollJournal({
        yearMonth,
        taxEntityCode,
        gross: totals.gross,
        tax: totals.wht,
        sso: totals.sso,
        postedBy: actor,
      })
      return NextResponse.json({ success: true, entryId: id, locksStorePeriod: TAX_CLOSE_LOCKS_STORE_PERIOD }, { headers })
    }

    if (action === 'vat') {
      const bridge = await loadTaxManagementBridge({
        yearMonth,
        scopeFilter,
        userRole: auth.role,
        userStore: auth.store,
        allowedStores: auth.allowedStores,
        tenantId: auth.tenantId,
      })
      const outputVat = bridge.report.lines.find((l) => l.key === 'outputVat')?.filing || 0
      const inputVat = bridge.report.lines.find((l) => l.key === 'inputVat')?.filing || 0
      if (outputVat <= 0 && inputVat <= 0) throw new Error('NO_AMOUNT')
      const id = await postTaxVatSummaryJournal({
        yearMonth,
        taxEntityCode,
        outputVat,
        inputVat,
        postedBy: actor,
      })
      return NextResponse.json({ success: true, entryId: id, locksStorePeriod: TAX_CLOSE_LOCKS_STORE_PERIOD }, { headers })
    }

    if (action === 'inventory') {
      const bridge = await loadTaxManagementBridge({
        yearMonth,
        scopeFilter,
        userRole: auth.role,
        userStore: auth.store,
        allowedStores: auth.allowedStores,
        tenantId: auth.tenantId,
      })
      const cogs = bridge.report.lines.find((l) => l.key === 'cogs')?.management || 0
      if (cogs <= 0) throw new Error('NO_AMOUNT')
      const id = await postTaxInventoryCogsJournal({ yearMonth, taxEntityCode, cogs, postedBy: actor })
      return NextResponse.json({ success: true, entryId: id, locksStorePeriod: TAX_CLOSE_LOCKS_STORE_PERIOD }, { headers })
    }

    if (action === 'adjustment') {
      const lines = (body.lines || [])
        .map((ln) => ({
          accountCode: String(ln.accountCode || '').trim(),
          accountName: String(ln.accountName || ln.accountCode || '').trim(),
          side: String(ln.side || '').toLowerCase() === 'credit' ? ('credit' as const) : ('debit' as const),
          amount: Math.abs(Number(ln.amount) || 0),
        }))
        .filter((ln) => ln.accountCode && ln.amount > 0)
      if (!taxJournalBalanced(lines)) throw new Error('UNBALANCED')
      const id = await postTaxAdjustmentJournal({
        yearMonth,
        taxEntityCode,
        memo: String(body.memo || '').trim(),
        postedBy: actor,
        lines,
      })
      return NextResponse.json({ success: true, entryId: id, locksStorePeriod: TAX_CLOSE_LOCKS_STORE_PERIOD }, { headers })
    }

    if (action === 'closing') {
      const heads = await loadTaxBookJournalHeads({ taxEntityCode, yearMonth })
      if (!heads.schemaReady) throw new Error(TAX_BOOK_SCHEMA_MISSING)
      const rawLines = await loadTaxBookLines(heads.heads.map((h) => Number(h.id || 0)))
      const trial = summarizeTaxBookTrial(rawLines)
      const entryId = await postTaxIncomeExpenseClosing({
        yearMonth,
        taxEntityCode,
        postedBy: actor,
        rows: trial.rows,
      })
      await setTaxAccountingPeriodClosed({
        taxEntityCode,
        yearMonth,
        isClosed: true,
        actor,
      })
      return NextResponse.json(
        { success: true, entryId, locked: true, locksStorePeriod: TAX_CLOSE_LOCKS_STORE_PERIOD },
        { headers }
      )
    }

    return NextResponse.json({ error: 'UNKNOWN_ACTION' }, { status: 400, headers })
  } catch (e) {
    const code = e instanceof Error ? e.message : String(e)
    const status = statusFor(code)
    if (status === 500) console.error('postTaxBookEntry:', e)
    return NextResponse.json({ success: false, error: code, locksStorePeriod: TAX_CLOSE_LOCKS_STORE_PERIOD }, { status, headers })
  }
}
