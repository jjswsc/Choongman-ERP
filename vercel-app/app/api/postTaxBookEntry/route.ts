import { NextRequest, NextResponse } from 'next/server'
import { assertCanApproveAccountingCompliance, assertCanApproveAccountingPeriodUnlock } from '@/lib/accounting-auth'
import {
  TAX_CLOSE_LOCKS_STORE_PERIOD,
  TAX_VOUCHER_KINDS,
  resolveTaxBookAsOfRange,
  taxEntityKeyFromScope,
  taxJournalBalanced,
  type TaxVoucherKind,
} from '@/lib/tax-book'
import {
  postTaxAdjustmentJournal,
  postTaxIncomeExpenseClosing,
  postTaxInventoryCogsJournal,
  postTaxManualJournal,
  postTaxOpeningJournal,
  postTaxPayrollJournal,
  postTaxPurchaseSummaryJournal,
  postTaxSalesSummaryJournal,
  postTaxVatSummaryJournal,
} from '@/lib/tax-book-posting'
import {
  buildTaxOpeningBalanceLines,
  SJ_GLOBAL_FLOW_TB_2026_06_30,
  SJ_GLOBAL_OPENING_DATE,
  SJ_GLOBAL_TAX_ENTITY,
  type ExternalTrialBalanceRow,
} from '@/lib/tax-book-opening'
import { loadHqWarehouseInventoryValue } from '@/lib/tax-book-opening-inventory-server'
import { setTaxAccountingPeriodClosed, TAX_BOOK_SCHEMA_MISSING, TAX_PERIOD_CLOSED } from '@/lib/tax-book-period-server'
import { loadTaxBookJournalHeads, loadTaxBookLines, summarizeTaxBookTrial } from '@/lib/tax-book-server'
import { loadTaxManagementBridge, loadTaxPayrollTotals } from '@/lib/tax-management-bridge-server'
import { requireAuth } from '@/lib/verify-auth'

export const maxDuration = 120

function statusFor(code: string): number {
  if (
    code === 'NEED_TAX_ENTITY' ||
    code === 'INVALID_YEAR_MONTH' ||
    code === 'UNBALANCED' ||
    code === 'NO_AMOUNT' ||
    code === 'NEED_INVENTORY_CONFIRM' ||
    code === 'NEED_TRIAL_ROWS'
  ) {
    return 400
  }
  if (code === TAX_PERIOD_CLOSED) return 409
  if (code === TAX_BOOK_SCHEMA_MISSING) return 409
  if (code === 'ACCOUNTING_FORBIDDEN' || code === 'ACCOUNTING_APPROVAL_FORBIDDEN' || code === 'ACCOUNTING_UNLOCK_APPROVAL_FORBIDDEN') return 403
  return 500
}

function monthEndAsOf(yearMonth: string): string {
  const y = Number(yearMonth.slice(0, 4))
  const m = Number(yearMonth.slice(5, 7))
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${yearMonth}-${String(d).padStart(2, '0')}`
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
    inventoryAmount?: number
    inventoryConfirmed?: boolean
    accountingDate?: string
    trialBalanceRows?: ExternalTrialBalanceRow[]
    lines?: { accountCode?: string; accountName?: string; side?: string; amount?: number }[]
    voucherKind?: string
    entryNo?: string
    postingStatus?: string
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

    if (action === 'inventoryPreview') {
      const asOfDate = monthEndAsOf(yearMonth)
      const inv = await loadHqWarehouseInventoryValue({
        asOfDate,
        tenantId: auth.tenantId,
      })
      const bridge = await loadTaxManagementBridge({
        yearMonth,
        scopeFilter,
        userRole: auth.role,
        userStore: auth.store,
        allowedStores: auth.allowedStores,
        tenantId: auth.tenantId,
      })
      const cogs = bridge.report.lines.find((l) => l.key === 'cogs')?.management || 0
      return NextResponse.json(
        {
          success: true,
          inventoryAmount: inv.amount,
          asOfDate: inv.asOfDate,
          locationCount: inv.locationCount,
          cogsPreview: cogs,
          locksStorePeriod: TAX_CLOSE_LOCKS_STORE_PERIOD,
        },
        { headers }
      )
    }

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

    if (action === 'ensureFiling') {
      // 거래별 자동 분개가 세무 장부에 들어가므로 월 요약(매출·매입·VAT·급여)을 검색 때 다시 올리지 않는다.
      return NextResponse.json(
        { success: true, posted: [], skipped: 'txn_journals', locksStorePeriod: TAX_CLOSE_LOCKS_STORE_PERIOD },
        { headers }
      )
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

    if (action === 'sales') {
      const bridge = await loadTaxManagementBridge({
        yearMonth,
        scopeFilter,
        userRole: auth.role,
        userStore: auth.store,
        allowedStores: auth.allowedStores,
        tenantId: auth.tenantId,
      })
      // 매출관리(ยอดขายสุทธิ)와 동일 POS 공급가 — 세금계산서만이 아님
      const managementSales = Number(
        bridge.report.lines.find((l) => l.key === 'sales')?.management || 0
      )
      const netAmount =
        managementSales > 0
          ? managementSales
          : bridge.report.salesSplit.posNet || bridge.report.salesSplit.taxInvoiceNet || 0
      if (netAmount <= 0) throw new Error('NO_AMOUNT')
      const id = await postTaxSalesSummaryJournal({
        yearMonth,
        taxEntityCode,
        netAmount,
        postedBy: actor,
      })
      return NextResponse.json({ success: true, entryId: id, locksStorePeriod: TAX_CLOSE_LOCKS_STORE_PERIOD }, { headers })
    }

    if (action === 'purchase') {
      const bridge = await loadTaxManagementBridge({
        yearMonth,
        scopeFilter,
        userRole: auth.role,
        userStore: auth.store,
        allowedStores: auth.allowedStores,
        tenantId: auth.tenantId,
      })
      const netAmount = bridge.report.salesSplit.purchaseNet || 0
      if (netAmount <= 0) throw new Error('NO_AMOUNT')
      const id = await postTaxPurchaseSummaryJournal({
        yearMonth,
        taxEntityCode,
        netAmount,
        postedBy: actor,
      })
      return NextResponse.json({ success: true, entryId: id, locksStorePeriod: TAX_CLOSE_LOCKS_STORE_PERIOD }, { headers })
    }

    if (action === 'inventory') {
      if (body.inventoryConfirmed !== true) throw new Error('NEED_INVENTORY_CONFIRM')
      const confirmed = Number(body.inventoryAmount)
      if (!Number.isFinite(confirmed) || confirmed < 0) throw new Error('NEED_INVENTORY_CONFIRM')
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
      return NextResponse.json(
        {
          success: true,
          entryId: id,
          inventoryAmount: confirmed,
          cogs,
          locksStorePeriod: TAX_CLOSE_LOCKS_STORE_PERIOD,
        },
        { headers }
      )
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

    if (action === 'manual') {
      const lines = (body.lines || [])
        .map((ln) => ({
          accountCode: String(ln.accountCode || '').trim(),
          accountName: String(ln.accountName || ln.accountCode || '').trim(),
          side: String(ln.side || '').toLowerCase() === 'credit' ? ('credit' as const) : ('debit' as const),
          amount: Math.abs(Number(ln.amount) || 0),
        }))
        .filter((ln) => ln.accountCode && ln.amount > 0)
      if (!taxJournalBalanced(lines)) throw new Error('UNBALANCED')
      const kindRaw = String(body.voucherKind || 'general').trim() as TaxVoucherKind
      const voucherKind = ((TAX_VOUCHER_KINDS as readonly string[]).includes(kindRaw) ? kindRaw : 'general') as TaxVoucherKind
      const id = await postTaxManualJournal({
        yearMonth,
        taxEntityCode,
        memo: String(body.memo || '').trim(),
        postedBy: actor,
        lines,
        voucherKind,
        accountingDate: body.accountingDate,
        entryNo: String(body.entryNo || '').trim() || null,
        postingStatus: String(body.postingStatus || '').toLowerCase() === 'draft' ? 'draft' : 'approved',
      })
      return NextResponse.json({ success: true, entryId: id, locksStorePeriod: TAX_CLOSE_LOCKS_STORE_PERIOD }, { headers })
    }

    if (action === 'opening') {
      const uploaded = Array.isArray(body.trialBalanceRows) ? body.trialBalanceRows : []
      const usePreset = taxEntityCode === SJ_GLOBAL_TAX_ENTITY && uploaded.length === 0
      if (!usePreset && uploaded.length === 0) throw new Error('NEED_TRIAL_ROWS')
      const openingDate = String(
        body.accountingDate || (usePreset ? SJ_GLOBAL_OPENING_DATE : `${yearMonth}-01`)
      ).slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(openingDate)) throw new Error('INVALID_YEAR_MONTH')
      if (body.inventoryConfirmed !== true && !(Number.isFinite(Number(body.inventoryAmount)) && Number(body.inventoryAmount) >= 0)) {
        // 미리보기만 쓰려면 inventoryPreview. 전기 시에는 금액 확정 필요.
      }
      let inventoryAmount = Number(body.inventoryAmount)
      let inventorySource: 'body' | 'erp' = 'body'
      if (!Number.isFinite(inventoryAmount) || inventoryAmount < 0) {
        if (body.inventoryConfirmed !== true) throw new Error('NEED_INVENTORY_CONFIRM')
        const asOf = openingDate < '2026-07-01' ? openingDate : '2026-06-30'
        const inv = await loadHqWarehouseInventoryValue({
          asOfDate: usePreset ? '2026-06-30' : asOf,
          tenantId: auth.tenantId,
        })
        inventoryAmount = inv.amount
        inventorySource = 'erp'
      }
      const rows: ExternalTrialBalanceRow[] = usePreset
        ? SJ_GLOBAL_FLOW_TB_2026_06_30
        : uploaded.map((r) => ({
            code: String(r.code || '').trim(),
            endDebit: Math.max(0, Number(r.endDebit) || 0),
            endCredit: Math.max(0, Number(r.endCredit) || 0),
          }))
      const built = buildTaxOpeningBalanceLines({
        rows,
        inventoryAmount,
      })
      const id = await postTaxOpeningJournal({
        yearMonth: openingDate.slice(0, 7),
        taxEntityCode,
        accountingDate: openingDate,
        memo:
          String(body.memo || '').trim() ||
          `FlowAccount→세무 기초 ${openingDate} (재고 ${inventoryAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })})`,
        postedBy: actor,
        lines: built.lines,
      })
      return NextResponse.json(
        {
          success: true,
          entryId: id,
          locksStorePeriod: TAX_CLOSE_LOCKS_STORE_PERIOD,
          inventoryAmount,
          inventorySource,
          flowInventory: built.flowInventory,
          inventoryDelta: built.inventoryDelta,
          lineCount: built.lines.length,
        },
        { headers }
      )
    }

    if (action === 'closing') {
      const asOf = resolveTaxBookAsOfRange(yearMonth)
      if (!asOf.ok) throw new Error(asOf.error)
      const heads = await loadTaxBookJournalHeads({
        taxEntityCode,
        fromMonth: asOf.from,
        toMonth: asOf.to,
      })
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
