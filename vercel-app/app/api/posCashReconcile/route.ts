/**
 * 채널 확인 — 당일 POS payment_cash vs 통장 현금입금(revenue_cash / 4140).
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoresFromParams } from '@/lib/pos-sales-store-filter'
import {
  resolvePosSalesStoresFromRequest,
  resolvePosSalesTenantScopeFromRequest,
} from '@/lib/pos-sales-request-scope'
import {
  fetchPosSalesOrdersForBusinessRange,
  POS_SALES_PAYMENT_ROW_SELECT,
} from '@/lib/pos-sales-fetch-rows'
import { applyPosSalesCacheControl } from '@/lib/pos-sales-response-cache'
import {
  aggregateCashReconcileRows,
  applyCashBankDepositsToRows,
  buildCashReconcileResult,
  filterCashReconcileRowsByBusinessDateRange,
  type CashReconcileOrderRow,
} from '@/lib/pos-cash-reconcile'
import { makeCashReconcileBusinessDateForRow } from '@/lib/pos-cash-reconcile-business-date'
import {
  aggregateCashBankDeposits,
  cashBankDepositQueryTransDateWindow,
} from '@/lib/pos-cash-bank-deposit'
import {
  CHANNEL_BANK_GL_CODES,
  fetchStoreAccountDeposits,
  ledgerRowToBankDepositInput,
} from '@/lib/pos-channel-bank-ledger'
import { isMissingSaasTenantColumnError, markSaasTenantColumnMissing } from '@/lib/saas-tenant-scope'

export const maxDuration = 60

const CASH_BANK_FETCH_TIMEOUT_MS = 12_000

function withTimeoutFallback<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    p.then((v) => {
      clearTimeout(timer)
      resolve(v)
    }).catch(() => {
      clearTimeout(timer)
      resolve(fallback)
    })
  })
}

async function fetchCashBankDeposits(params: {
  request: NextRequest
  storeCodes: string[]
  startStr: string
  endStr: string
}): Promise<ReturnType<typeof aggregateCashBankDeposits>> {
  const empty = { byStore: new Map<string, number>(), byStoreDate: new Map<string, number>() }
  const start = params.startStr.slice(0, 10)
  const end = params.endStr.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return empty

  try {
    const tenantScope = await resolvePosSalesTenantScopeFromRequest(params.request)
    const rows = await fetchStoreAccountDeposits({
      tenantScope,
      storeCodes: params.storeCodes,
      startStr: start,
      endStr: end,
      transDateWindow: cashBankDepositQueryTransDateWindow(start, end),
      glCodes: [CHANNEL_BANK_GL_CODES.cash],
      queryLabel: 'posCashReconcile.bankDeposits',
    })
    return aggregateCashBankDeposits({
      rows: rows.map(ledgerRowToBankDepositInput),
      startStr: start,
      endStr: end,
      storeCodes: params.storeCodes,
    })
  } catch (e) {
    if (isMissingSaasTenantColumnError(e)) markSaasTenantColumnMissing('bank_transactions')
    return empty
  }
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  applyPosSalesCacheControl(headers, searchParams)

  try {
    const startStr = searchParams.get('startStr')?.trim()
    const endStr = searchParams.get('endStr')?.trim()
    const pos = searchParams.get('pos')?.trim()
    const stores = await resolvePosSalesStoresFromRequest(
      request,
      resolveStoresFromParams(pos, searchParams.get('stores'))
    )

    if (!startStr || !endStr) {
      return NextResponse.json({ success: false, message: 'startStr, endStr 필요' }, { headers })
    }

    const emptyBank = { byStore: new Map<string, number>(), byStoreDate: new Map<string, number>() }
    const [{ rows, truncated, bizCtx }, bankAgg] = await Promise.all([
      fetchPosSalesOrdersForBusinessRange({
        request,
        startStr,
        endStr,
        storeCodes: stores.length > 0 ? stores : undefined,
        select: POS_SALES_PAYMENT_ROW_SELECT,
        queryLabel: 'posCashReconcile',
        /** 전날 오픈·당일 결제 포함 → 아래에서 결제 영업일로 재필터 */
        ordersDateBasis: 'either',
      }),
      withTimeoutFallback(
        fetchCashBankDeposits({
          request,
          storeCodes: stores,
          startStr,
          endStr,
        }),
        CASH_BANK_FETCH_TIMEOUT_MS,
        emptyBank
      ),
    ])

    if (truncated) headers.set('X-Sales-Truncated', '1')
    headers.set('X-Pos-Sales-Source', 'fetch')

    const businessDateForRow = makeCashReconcileBusinessDateForRow(bizCtx)
    const cashRows = filterCashReconcileRowsByBusinessDateRange(
      rows as CashReconcileOrderRow[],
      startStr,
      endStr,
      businessDateForRow
    )
    const aggregated = aggregateCashReconcileRows(cashRows, { businessDateForRow })

    const withBank = applyCashBankDepositsToRows(aggregated, bankAgg)
    const result = buildCashReconcileResult(withBank)
    return NextResponse.json({ success: true, ...result, truncated }, { headers })
  } catch (e) {
    console.error('posCashReconcile:', e)
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : 'pos_cash_reconcile_error',
        rows: [],
        kpi: { orderCount: 0, cashSales: 0, bankDepositAmt: 0, storeCount: 0 },
      },
      { status: 500, headers }
    )
  }
}
