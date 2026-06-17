/**
 * 미수금/미지급금 잔액 요약
 * - type: receivable | payable
 * - DB RPC로 집계 (limit 없음, store/vendor별 1행만 반환)
 * - receivable: store_name으로 vendors 매칭(gps_name/name) → vendorCode, vendorName 포함
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseRpc, supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import {
  aggregatePayableBalancesByVendor,
  isPayableStoreFilterActive,
  loadPayableTransactionsToEnd,
  scopePayableLedgerRows,
  type PayableTransactionRow,
} from '@/lib/payable-attributed-store'
import { groupReceivableRowsByStore, scopeReceivableLedger } from '@/lib/receivable-ledger-scope'

function isReceivableStoreFilterActive(storeFilter: string | undefined | null): boolean {
  const s = String(storeFilter || '').trim()
  if (!s) return false
  const lower = s.toLowerCase()
  return lower !== 'all' && lower !== '전체'
}

async function buildReceivableSummaryList(params: {
  endStr: string
  storeFilter?: string
  filterByVendorLink: boolean
}) {
  const scoped = await scopeReceivableLedger({
    endStr: params.endStr,
    storeFilter: params.storeFilter,
    filterByVendorLink: params.filterByVendorLink,
  })
  const grouped = groupReceivableRowsByStore(
    scoped.scopedRows,
    scoped.vendorMaps,
    scoped.attributionMaps,
    scoped.cumulativeByStoreGroup
  )
  const list = grouped
    .map((g) => ({
      storeName: g.storeName,
      vendorCode: g.vendorCode,
      vendorName: g.vendorName,
      balance: g.cumulativeBalance,
      count: g.items.length,
    }))
    .filter((x) => x.storeName)
    .sort((a, b) => b.balance - a.balance)
  const totalAmount = list.reduce((sum, i) => sum + (i.balance ?? 0), 0)
  return { list, totalAmount }
}

async function getPayableSummaryWithStoreFilter(params: {
  vendorFilter: string
  endStr: string
  storeFilter: string
}): Promise<{ list: { vendorCode: string; balance: number; count: number }[]; totalAmount: number }> {
  const { vendorFilter, endStr, storeFilter } = params
  const ledgerRows = await loadPayableTransactionsToEnd({
    vendorFilter: vendorFilter || undefined,
    endStr,
  })
  const { scopedRows } = await scopePayableLedgerRows(ledgerRows, storeFilter)
  const list = aggregatePayableBalancesByVendor(scopedRows)
  const totalAmount = list.reduce((sum, i) => sum + (i.balance ?? 0), 0)
  return { list, totalAmount }
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
  const type = String(searchParams.get('type') || 'receivable').trim().toLowerCase()
  const userStore = String(auth.store || '').trim()
  const userRole = String(auth.role || '').toLowerCase()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim().slice(0, 10)
  const requestedStoreFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const vendorFilter = String(searchParams.get('vendorFilter') || searchParams.get('vendor') || '').trim()
  const payableStoreFilterActive =
    type === 'payable' && isPayableStoreFilterActive(requestedStoreFilter)
  const allowedStores =
    (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(userStore)

  const canSelectStores = isOfficeRole(userRole) || isAccountingRole(userRole)
  const isManager = (userRole.includes('manager') || userRole.includes('franchisee')) && !canSelectStores
  if (type === 'payable' && isManager) {
    return NextResponse.json({ type: 'payable', list: [] }, { headers })
  }

  try {
    if (type === 'payable') {
      if (payableStoreFilterActive) {
        const scoped = await getPayableSummaryWithStoreFilter({
          vendorFilter,
          endStr,
          storeFilter: requestedStoreFilter,
        })
        return NextResponse.json({ type: 'payable', list: scoped.list, totalAmount: scoped.totalAmount }, { headers })
      }

      const rows = (await supabaseRpc<{ vendor_code: string; balance: number; item_count: number }[]>(
        'get_payable_summary',
        {
          p_vendor_filter: vendorFilter || null,
          p_end_str: endStr || null,
        }
      )) as { vendor_code?: string; balance?: number; item_count?: number }[] | null

      const list = (rows || [])
        .map((r) => ({
          vendorCode: String(r.vendor_code ?? '').trim(),
          balance: Number(r.balance ?? 0),
          count: Number(r.item_count ?? 0),
        }))
        .filter((x) => x.vendorCode)
        .sort((a, b) => b.balance - a.balance)
      const totalAmount = list.reduce((sum, i) => sum + (i.balance ?? 0), 0)
      return NextResponse.json({ type: 'payable', list, totalAmount }, { headers })
    }

    // receivable — 목록 API와 동일 scope·Receive 귀속 규칙
    let storeFilterVal = requestedStoreFilter
    if (!canSelectStores) {
      if (!requestedStoreFilter || requestedStoreFilter === 'All' || requestedStoreFilter === '전체') {
        storeFilterVal = String(allowedStores[0] || '').trim()
      } else {
        const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, requestedStoreFilter))
        if (!allowed) {
          return NextResponse.json({ error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
        }
      }
    }
    const receivableSummary = await buildReceivableSummaryList({
      endStr,
      storeFilter: isReceivableStoreFilterActive(storeFilterVal) ? storeFilterVal : undefined,
      filterByVendorLink: canSelectStores,
    })
    return NextResponse.json(
      { type: 'receivable', list: receivableSummary.list, totalAmount: receivableSummary.totalAmount },
      { headers }
    )
  } catch (_rpcErr) {
    try {
      if (type === 'payable') {
        const pParts: string[] = []
        if (vendorFilter) pParts.push(`vendor_code=ilike.${encodeURIComponent(vendorFilter)}`)
        if (endStr) pParts.push(`trans_date=lte.${endStr}`)
        const pFilter = pParts.length ? pParts.join('&') : 'id=gt.0'
        let payableRows = (await supabaseSelectFilter('payable_transactions', pFilter, {
          order: 'trans_date.desc',
          limit: 20000,
        })) as PayableTransactionRow[]
        if (payableStoreFilterActive) {
          const scoped = await scopePayableLedgerRows(payableRows, requestedStoreFilter)
          payableRows = scoped.scopedRows
        }
        const list = aggregatePayableBalancesByVendor(payableRows)
        const totalAmount = list.reduce((sum, i) => sum + (i.balance ?? 0), 0)
        return NextResponse.json({ type: 'payable', list, totalAmount }, { headers })
      }

      let fallbackStoreFilter = requestedStoreFilter
      if (!canSelectStores) {
        fallbackStoreFilter =
          !requestedStoreFilter || requestedStoreFilter === 'All' || requestedStoreFilter === '전체'
            ? String(allowedStores[0] || '').trim()
            : requestedStoreFilter
      }
      const receivableSummary = await buildReceivableSummaryList({
        endStr,
        storeFilter: isReceivableStoreFilterActive(fallbackStoreFilter) ? fallbackStoreFilter : undefined,
        filterByVendorLink: canSelectStores,
      })
      return NextResponse.json(
        { type: 'receivable', list: receivableSummary.list, totalAmount: receivableSummary.totalAmount },
        { headers }
      )
    } catch (e) {
      console.error('getReceivablePayableSummary:', e)
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed' },
        { status: 500, headers }
      )
    }
  }
}
