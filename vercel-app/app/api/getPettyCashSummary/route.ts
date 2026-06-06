import { NextRequest, NextResponse } from 'next/server'
import { supabaseRpc, supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { resolvePettyCashEffectiveStore } from '@/lib/petty-cash-store-scope'
import { applyPettyCashClientFilters, computePettyCashPeriodSummary } from '@/lib/petty-cash-search'
import { PETTY_CASH_LIST_COLS } from '@/lib/postgrest-narrow-select'
import type { PettyCashItem } from '@/lib/api-client'

type RpcRow = {
  expense_total?: number
  inflow_total?: number
  net_change?: number
  vat_total?: number
  vat_pending_total?: number
  vat_pending_count?: number
  row_count?: number
}

function mapRpcRow(row: RpcRow | undefined) {
  return {
    expenseTotal: Number(row?.expense_total ?? 0) || 0,
    inflowTotal: Number(row?.inflow_total ?? 0) || 0,
    netChange: Number(row?.net_change ?? 0) || 0,
    vatTotal: Number(row?.vat_total ?? 0) || 0,
    vatPendingTotal: Number(row?.vat_pending_total ?? 0) || 0,
    vatPendingCount: Number(row?.vat_pending_count ?? 0) || 0,
    rowCount: Number(row?.row_count ?? 0) || 0,
    source: 'rpc' as const,
  }
}

function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

async function fallbackSummaryFromSelect(
  startStr: string,
  endStr: string,
  effectiveStore: string,
  departmentFilter: string,
  filterOpts: Parameters<typeof applyPettyCashClientFilters>[1]
) {
  let rows: {
    trans_date?: string
    trans_type?: string
    amount?: number
    memo?: string
    user_name?: string
    account_subject_id?: number
    invoice_received?: boolean
    vat_amount?: number | null
  }[] = []

  if (effectiveStore) {
    if (effectiveStore === 'Office' && !departmentFilter) {
      rows = (await supabaseSelectFilter(
        'petty_cash_transactions',
        'or=(store.eq.Office,store.eq.본사,store.eq.오피스,store.eq.본점,store.ilike.Office-%25)',
        { order: 'trans_date.asc,id.asc', limit: 20000, select: PETTY_CASH_LIST_COLS }
      )) as typeof rows
    } else {
      rows = (await supabaseSelectFilter(
        'petty_cash_transactions',
        'store=eq.' + encodeURIComponent(effectiveStore),
        { order: 'trans_date.asc,id.asc', limit: 20000, select: PETTY_CASH_LIST_COLS }
      )) as typeof rows
    }
  } else {
    rows = (await supabaseSelect('petty_cash_transactions', {
      order: 'trans_date.asc,id.asc',
      limit: 20000,
      select: PETTY_CASH_LIST_COLS,
    })) as typeof rows
  }

  const startD = new Date(startStr + 'T00:00:00')
  const endD = new Date(endStr + 'T23:59:59')
  const inRange: PettyCashItem[] = []
  for (const r of rows || []) {
    const dt = toDateStr(r.trans_date)
    if (!dt) continue
    const dtD = new Date(dt + 'T12:00:00')
    if (dtD < startD || dtD > endD) continue
    inRange.push({
      id: 0,
      store: '',
      trans_date: dt,
      trans_type: String(r.trans_type || 'expense'),
      amount: Number(r.amount) || 0,
      balance_after: 0,
      memo: String(r.memo || ''),
      user_name: String(r.user_name || ''),
      account_subject_id: r.account_subject_id ?? null,
      accountSubjectId: r.account_subject_id ?? null,
      invoiceReceived: Boolean(r.invoice_received),
      vatAmount: Number(r.vat_amount ?? 0) || 0,
    })
  }
  const filtered = applyPettyCashClientFilters(inRange, filterOpts)
  const summary = computePettyCashPeriodSummary(filtered)
  return { ...summary, source: 'fallback' as const, truncated: inRange.length >= 20000 }
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim().slice(0, 10)
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim().slice(0, 10)
  const scopeFilter = String(searchParams.get('scopeFilter') || searchParams.get('scope') || '').trim()
  const storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const departmentFilter = String(searchParams.get('departmentFilter') || searchParams.get('department') || '').trim()
  const filterTransType = String(searchParams.get('filterTransType') || '').trim()
  const filterAccountSubjectId = String(searchParams.get('filterAccountSubjectId') || '').trim()
  const filterAccountSubjectEmpty = searchParams.get('filterAccountSubjectEmpty') === '1'
  const filterMemoKeyword = String(searchParams.get('filterMemoKeyword') || '').trim()
  const filterInvoiceStatus = String(searchParams.get('filterInvoiceStatus') || '').trim()
  const filterPp30VatOnly = searchParams.get('filterPp30VatOnly') === '1'

  const userStore = String(auth.store || '').trim()
  const userRole = String(auth.role || '').toLowerCase()
  const allowedStores =
    (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(userStore)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
    return NextResponse.json({ error: 'INVALID_DATE_RANGE' }, { status: 400, headers })
  }

  const { effectiveStore, forbidden } = resolvePettyCashEffectiveStore({
    scopeFilter,
    storeFilter,
    departmentFilter,
    userStore,
    userRole,
    allowedStores,
  })
  if (forbidden) {
    return NextResponse.json(
      { expenseTotal: 0, inflowTotal: 0, netChange: 0, vatTotal: 0, vatPendingTotal: 0, vatPendingCount: 0, rowCount: 0, source: 'rpc' },
      { status: 403, headers }
    )
  }

  const filterOpts = {
    filterAccountSubjectEmpty,
    filterAccountSubjectId,
    filterPettyTransType: filterTransType,
    filterMemoKeyword,
    filterInvoiceStatus: filterInvoiceStatus as '' | 'all' | 'received' | 'pending',
    filterPp30VatOnly,
  }

  const accountSubjectIdNum = filterAccountSubjectId ? parseInt(filterAccountSubjectId, 10) : null

  try {
    const rows = (await supabaseRpc<RpcRow[]>('get_petty_cash_summary', {
      p_start_date: startStr,
      p_end_date: endStr,
      p_effective_store: effectiveStore || null,
      p_trans_type: filterTransType || null,
      p_account_subject_id: accountSubjectIdNum && !Number.isNaN(accountSubjectIdNum) ? accountSubjectIdNum : null,
      p_account_subject_empty: filterAccountSubjectEmpty,
      p_memo_keyword: filterMemoKeyword || null,
      p_invoice_status: filterInvoiceStatus || null,
      p_pp30_vat_only: filterPp30VatOnly,
    })) as RpcRow[] | null

    const row = Array.isArray(rows) ? rows[0] : rows
    return NextResponse.json({ ...mapRpcRow(row ?? undefined), truncated: false }, { headers })
  } catch (rpcErr) {
    console.warn('getPettyCashSummary RPC fallback:', rpcErr)
    try {
      const fb = await fallbackSummaryFromSelect(
        startStr,
        endStr,
        effectiveStore,
        departmentFilter,
        filterOpts
      )
      return NextResponse.json(fb, { headers })
    } catch (e) {
      console.error('getPettyCashSummary:', e)
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed' },
        { status: 500, headers }
      )
    }
  }
}
