import { NextRequest, NextResponse } from 'next/server'
import { supabaseRpc } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { resolvePettyCashEffectiveStore } from '@/lib/petty-cash-store-scope'
import { applyPettyCashClientFilters, computePettyCashPeriodSummary } from '@/lib/petty-cash-search'
import type { PettyCashItem } from '@/lib/api-client'
import {
  isMissingSaasTenantColumnError,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
  type SaasTenantScope,
} from '@/lib/saas-tenant-scope'
import {
  fetchPettyCashRowsInPeriod,
  toPettyCashDateStr,
} from '@/lib/petty-cash-ledger-server'

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

const EMPTY_SUMMARY = {
  expenseTotal: 0,
  inflowTotal: 0,
  netChange: 0,
  vatTotal: 0,
  vatPendingTotal: 0,
  vatPendingCount: 0,
  rowCount: 0,
  source: 'rpc' as const,
}

async function fallbackSummaryFromSelect(
  startStr: string,
  endStr: string,
  effectiveStore: string,
  departmentFilter: string,
  filterOpts: Parameters<typeof applyPettyCashClientFilters>[1],
  tenantScope: SaasTenantScope
) {
  const rows = await fetchPettyCashRowsInPeriod({
    startStr,
    endStr,
    effectiveStore,
    departmentFilter,
    tenantScope,
  })

  const inRange: PettyCashItem[] = []
  for (const r of rows || []) {
    const dt = toPettyCashDateStr(r.trans_date)
    if (!dt) continue
    inRange.push({
      id: 0,
      store: String(r.store || ''),
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
  return {
    ...summary,
    source: 'fallback' as const,
    truncated: inRange.length >= 100_000,
  }
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
  const tenantScope = await resolveSaasTenantScope({ auth })
  if (isSaasTenantQueryBlocked(tenantScope, 'petty_cash_transactions')) {
    return NextResponse.json({ ...EMPTY_SUMMARY, truncated: false }, { headers })
  }
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
    return NextResponse.json({ ...EMPTY_SUMMARY }, { status: 403, headers })
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

  // Omni: RPC에 tenant 파라미터가 없어 테넌트 스코프 select fallback 사용
  const useTenantScopedFallback = tenantScope.enforce && !!tenantScope.tenantId

  try {
    if (useTenantScopedFallback) {
      throw new Error('saas_tenant_use_fallback')
    }
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
    if (!(rpcErr instanceof Error && rpcErr.message === 'saas_tenant_use_fallback')) {
      console.warn('getPettyCashSummary RPC fallback:', rpcErr)
    }
    try {
      const fb = await fallbackSummaryFromSelect(
        startStr,
        endStr,
        effectiveStore,
        departmentFilter,
        filterOpts,
        tenantScope
      )
      return NextResponse.json(fb, { headers })
    } catch (e) {
      console.error('getPettyCashSummary:', e)
      if (tenantScope.enforce && isMissingSaasTenantColumnError(e)) {
        markSaasTenantColumnMissing('petty_cash_transactions')
      }
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed' },
        { status: 500, headers }
      )
    }
  }
}
