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
import { getPosBusinessDateStrFromConfig } from '@/lib/pos-business-day'
import { resolvePosBusinessHoursFromContext } from '@/lib/pos-business-day-server'
import { applyPosSalesCacheControl } from '@/lib/pos-sales-response-cache'
import {
  aggregateCashReconcileRows,
  applyCashBankDepositsToRows,
  buildCashReconcileResult,
  type CashReconcileOrderRow,
} from '@/lib/pos-cash-reconcile'
import {
  aggregateCashBankDeposits,
  cashBankDepositQueryTransDateWindow,
  CASH_BANK_GL_CODE,
  type CashBankDepositInput,
} from '@/lib/pos-cash-bank-deposit'
import { supabaseSelectFilterAllPagesStrippingUnknownColumns } from '@/lib/supabase-pgrst204-retry'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  appendSaasTenantFilter,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
  isMissingSaasTenantColumnError,
} from '@/lib/saas-tenant-scope'

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

type BankTxRow = {
  id?: number
  trans_date?: string
  sales_date?: string | null
  trans_type?: string
  amount?: number
  memo?: string | null
  note?: string | null
  category?: string | null
  store_name?: string | null
  account_subject_id?: number | null
}

async function loadCashGlSubjectId(): Promise<number | null> {
  try {
    const rows = (await supabaseSelectFilter('account_subjects', `code=eq.${CASH_BANK_GL_CODE}`, {
      select: 'id,code',
      limit: 5,
    })) as { id?: number; code?: string }[] | null
    const id = Number(rows?.[0]?.id) || 0
    return id || null
  } catch {
    return null
  }
}

function mapBankTxRow(r: BankTxRow, cashSubjectId: number | null): CashBankDepositInput {
  const sid = Number(r.account_subject_id) || 0
  return {
    transDate: r.trans_date,
    salesDate: r.sales_date,
    transType: r.trans_type,
    amount: r.amount,
    memo: r.memo,
    note: r.note,
    category: r.category,
    storeName: r.store_name,
    accountSubjectCode: cashSubjectId && sid === cashSubjectId ? CASH_BANK_GL_CODE : null,
  }
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

  const tenantScope = await resolvePosSalesTenantScopeFromRequest(params.request)
  if (isSaasTenantQueryBlocked(tenantScope, 'bank_transactions')) return empty

  const window = cashBankDepositQueryTransDateWindow(start, end)
  const select =
    'id,trans_date,sales_date,trans_type,amount,memo,note,category,store_name,account_subject_id'

  const load = async (filter: string) =>
    (await supabaseSelectFilterAllPagesStrippingUnknownColumns(
      'bank_transactions',
      appendSaasTenantFilter(filter, tenantScope, 'bank_transactions'),
      { select, order: 'id.asc', maxRows: 20_000 },
      'posCashReconcile.bankDeposits'
    )) as BankTxRow[]

  try {
    const cashSubjectId = await loadCashGlSubjectId()
    const catBase = `trans_type=eq.deposit&category=eq.revenue_cash`
    const bySalesDate = `${catBase}&sales_date=gte.${encodeURIComponent(start)}&sales_date=lte.${encodeURIComponent(end)}`
    const byTransDate = `${catBase}&trans_date=gte.${encodeURIComponent(window.from)}&trans_date=lte.${encodeURIComponent(window.to)}`

    const seen = new Set<number>()
    const rows: BankTxRow[] = []
    const pushUnique = (list: BankTxRow[] | null | undefined) => {
      for (const r of list || []) {
        const id = Number(r.id) || 0
        if (id && seen.has(id)) continue
        if (id) seen.add(id)
        rows.push(r)
      }
    }

    try {
      const [a, b] = await Promise.all([load(bySalesDate), load(byTransDate)])
      pushUnique(a)
      pushUnique(b)
    } catch {
      pushUnique(await load(byTransDate))
    }

    if (cashSubjectId) {
      const glBase = `trans_type=eq.deposit&account_subject_id=eq.${cashSubjectId}`
      const glBySales = `${glBase}&sales_date=gte.${encodeURIComponent(start)}&sales_date=lte.${encodeURIComponent(end)}`
      const glByTrans = `${glBase}&trans_date=gte.${encodeURIComponent(window.from)}&trans_date=lte.${encodeURIComponent(window.to)}`
      try {
        const [c, d] = await Promise.all([load(glBySales), load(glByTrans)])
        pushUnique(c)
        pushUnique(d)
      } catch {
        /* GL 보조 조회 실패 시 category 행만 사용 */
      }
    }

    return aggregateCashBankDeposits({
      rows: rows.map((r) => mapBankTxRow(r, cashSubjectId)),
      startStr: start,
      endStr: end,
      storeCodes: params.storeCodes,
      fallbackStoreCode: params.storeCodes.length === 1 ? params.storeCodes[0] : undefined,
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

    const aggregated = aggregateCashReconcileRows(rows as CashReconcileOrderRow[], {
      businessDateForRow: (row) => {
        const raw = String(row.created_at ?? '').trim()
        if (!raw) return ''
        const d = new Date(
          raw.includes('T') || /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : raw.replace(' ', 'T')
        )
        if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10)
        const hours = resolvePosBusinessHoursFromContext(bizCtx, String(row.store_code ?? '').trim())
        return getPosBusinessDateStrFromConfig(d, hours)
      },
    })

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
