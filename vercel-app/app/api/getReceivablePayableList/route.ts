/**
 * 미수금/미지급금 목록 조회
 * - type: receivable | payable
 * - storeFilter / vendorFilter (선택)
 * - startStr, endStr — 기간 열·상세 내역은 startStr~endStr, 누적 잔액·목록 거래처는 종료일까지 전체 이력 기준
 * - receivable: store_name으로 vendors 매칭 → vendorCode, vendorName 포함
 * - payable: 입고·매입 지급·기초이월만 (발주 PO·급여·지출발생 Expense 제외 — 매입채무는 입고 기준)
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import {
  buildPayableListWithCumulative,
  buildPayableListForInvoiceFilter,
  cumulativeBalanceByVendor,
  filterPurchasePayableLedgerRowsAsync,
  isPayableStoreFilterActive,
  loadPayableTransactionsToEnd,
  payableRowsOnOrAfterStart,
  resolvePayableAttributedStore,
  scopePayableLedgerRows,
  type PayableTransactionRow,
} from '@/lib/payable-attributed-store'
import { loadPayableSettlementLinksForTransactionIds } from '@/lib/payable-settlement-link-server'
import {
  buildReceivableListWithCumulative,
  buildReceivableListForInvoiceFilter,
  scopeReceivableLedger,
} from '@/lib/receivable-ledger-scope'
import { fetchBankAccountMetaByTransactionIds } from '@/lib/receivable-unallocated-bank-server'
import {
  applyBankAccountMetaToReceivableGroups,
  collectBankTransactionIdsFromReceivableGroups,
} from '@/lib/receivable-unallocated-bank'
import { resolveSaasTenantScope } from '@/lib/saas-tenant-scope'

function isReceivableStoreFilterActive(storeFilter: string | undefined | null): boolean {
  const s = String(storeFilter || '').trim()
  if (!s) return false
  const lower = s.toLowerCase()
  return lower !== 'all' && lower !== '전체'
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
  const { searchParams } = new URL(request.url)
  const type = String(searchParams.get('type') || 'receivable').trim().toLowerCase()
  let storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const vendorFilter = searchParams.get('vendorFilter') || searchParams.get('vendor') || ''
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim().slice(0, 10)
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim().slice(0, 10)
  const invoiceFilter = String(searchParams.get('invoiceFilter') || searchParams.get('invoice') || '').trim()
  const userStore = String(auth.store || '').trim()
  const userRole = String(auth.role || '').toLowerCase()
  const allowedStores =
    (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(userStore)

  // 본사/회계직원: 매장별 선택 가능. 매니저/가맹점주: receivable만 자기 매장, payable 조회 불가
  const canSelectStores = isOfficeRole(userRole) || isAccountingRole(userRole)
  const isManager = (userRole.includes('manager') || userRole.includes('franchisee')) && !canSelectStores
  if (type === 'receivable' && isManager && userStore) {
    if (!storeFilter || storeFilter === 'All' || storeFilter === '전체') {
      storeFilter = userStore
    } else {
      const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, storeFilter))
      if (!allowed) {
        return NextResponse.json({ error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
      }
    }
  }
  if (type === 'payable' && isManager) {
    return NextResponse.json({ type: 'payable', list: [] }, { headers })
  }

  try {
    if (type === 'payable') {
      const ledgerRows = await filterPurchasePayableLedgerRowsAsync(
        await loadPayableTransactionsToEnd({
          vendorFilter: vendorFilter || undefined,
          endStr: endStr || '',
          tenantScope,
        })
      )
      const payableStoreScope = isPayableStoreFilterActive(storeFilter) ? storeFilter : undefined
      const { maps: attributionMaps, scopedRows } = await scopePayableLedgerRows(ledgerRows, payableStoreScope)
      const cumulativeByVendor = cumulativeBalanceByVendor(scopedRows)
      const rows = payableRowsOnOrAfterStart(scopedRows, startStr || undefined)

      const attachPayableInvoiceInfo = async (sourceRows: PayableTransactionRow[]) => {
        const invoiceByInbound: Record<number, { invoice_received?: boolean; invoice_no?: string | null }> = {}
        const invoiceByPo: Record<number, { invoice_received?: boolean; invoice_no?: string | null }> = {}
        const invoiceByBank: Record<number, { invoice_received?: boolean; invoice_no?: string | null }> = {}

        try {
          const inboundIds = [...new Set((sourceRows || []).filter((r) => r.ref_type === 'Inbound' && r.ref_id).map((r) => Number(r.ref_id!)))]
          const poIds = [...new Set((sourceRows || []).filter((r) => r.ref_type === 'PO' && r.ref_id).map((r) => Number(r.ref_id!)))]
          const bankIds = [...new Set((sourceRows || []).filter((r) => r.bank_transaction_id).map((r) => Number(r.bank_transaction_id!)))]

          if (inboundIds.length > 0) {
            const batches = (await supabaseSelectFilter('inbound_batches', `id=in.(${inboundIds.join(',')})`, {
              limit: 5000,
            })) as { id?: number; invoice_received?: boolean; invoice_no?: string | null }[] | null
            for (const b of batches || []) {
              if (b.id) invoiceByInbound[b.id] = { invoice_received: Boolean(b.invoice_received), invoice_no: b.invoice_no }
            }
          }
          if (poIds.length > 0) {
            const pos = (await supabaseSelectFilter('purchase_orders', `id=in.(${poIds.join(',')})`, {
              limit: 5000,
            })) as { id?: number; invoice_received?: boolean; invoice_no?: string | null }[] | null
            for (const p of pos || []) {
              if (p.id) invoiceByPo[p.id] = { invoice_received: Boolean(p.invoice_received), invoice_no: p.invoice_no }
            }
          }
          if (bankIds.length > 0) {
            const banks = (await supabaseSelectFilter('bank_transactions', `id=in.(${bankIds.join(',')})`, {
              limit: 5000,
            })) as { id?: number; invoice_received?: boolean; invoice_no?: string | null }[] | null
            for (const bt of banks || []) {
              if (bt.id) invoiceByBank[bt.id] = { invoice_received: Boolean(bt.invoice_received), invoice_no: bt.invoice_no }
            }
          }
        } catch (_inv) {
          // invoice 컬럼 미존재 등 시 인보이스 정보 없이 진행
        }

        return (sourceRows || []).map((r) => {
          const attributed_store = resolvePayableAttributedStore(r, attributionMaps) || undefined
          const base = { ...r, attributed_store }
          if (r.ref_type === 'Inbound' && r.ref_id) {
            const inv = invoiceByInbound[Number(r.ref_id)]
            if (inv) {
              ;(base as { invoice_received?: boolean; invoice_no?: string | null }).invoice_received = inv.invoice_received
              ;(base as { invoice_received?: boolean; invoice_no?: string | null }).invoice_no = inv.invoice_no
            }
          } else if (r.ref_type === 'PO' && r.ref_id) {
            const inv = invoiceByPo[Number(r.ref_id)]
            if (inv) {
              ;(base as { invoice_received?: boolean; invoice_no?: string | null }).invoice_received = inv.invoice_received
              ;(base as { invoice_received?: boolean; invoice_no?: string | null }).invoice_no = inv.invoice_no
            }
          } else if (r.bank_transaction_id) {
            const inv = invoiceByBank[Number(r.bank_transaction_id)]
            if (inv) {
              ;(base as { invoice_received?: boolean; invoice_no?: string | null }).invoice_received = inv.invoice_received
              ;(base as { invoice_received?: boolean; invoice_no?: string | null }).invoice_no = inv.invoice_no
            }
          }
          return base
        })
      }

      const invoiceLookupRows = invoiceFilter ? scopedRows : rows
      const rowsWithInvoice = await attachPayableInvoiceInfo(invoiceLookupRows)
      const periodRowsWithInvoice = invoiceFilter
        ? rowsWithInvoice.filter((r) => {
            const d = String(r.trans_date || '').slice(0, 10)
            if (!d) return false
            if (startStr && d < startStr) return false
            return true
          })
        : rowsWithInvoice

      const byVendor: Record<string, { total: number; items: typeof rowsWithInvoice }> = {}
      for (const r of periodRowsWithInvoice) {
        const vc = String(r.vendor_code || '').trim()
        if (!vc) continue
        if (!byVendor[vc]) byVendor[vc] = { total: 0, items: [] }
        byVendor[vc].items.push(r)
        byVendor[vc].total += Number(r.amount ?? 0)
      }

      const list = invoiceFilter
        ? buildPayableListForInvoiceFilter({
            invoiceFilter,
            scopedRows: rowsWithInvoice,
            periodRows: periodRowsWithInvoice,
            cumulativeByVendor,
          })
        : buildPayableListWithCumulative({ cumulativeByVendor, periodByVendor: byVendor })
      const scopedIds = scopedRows
        .map((r) => Number(r.id || 0))
        .filter((id) => id > 0)
      const settlementLinkRows = await loadPayableSettlementLinksForTransactionIds(scopedIds)
      const listWithLinks = list.map((item) => {
        const itemIds = new Set(
          (item.items || []).map((r) => Number(r.id || 0)).filter((id) => id > 0)
        )
        const settlementLinks = settlementLinkRows
          .filter((l) => itemIds.has(l.payment_id) || itemIds.has(l.accrual_id))
          .map((l) => ({ paymentId: l.payment_id, accrualId: l.accrual_id }))
        return settlementLinks.length > 0 ? { ...item, settlementLinks } : item
      })

      return NextResponse.json({ type: 'payable', list: listWithLinks, cumulativeByVendor }, { headers })
    }

    // receivable — 종료일까지 단일 집계 후 기간 분리(목록·누적 일치)
    const receivableScoped = await scopeReceivableLedger({
      endStr,
      startStr,
      storeFilter:
        !isManager && isReceivableStoreFilterActive(storeFilter) ? storeFilter : undefined,
      storeManagerScope: isManager && userStore ? userStore : undefined,
      filterByVendorLink: canSelectStores && !isManager,
      tenantScope,
    })

    const list = invoiceFilter
      ? buildReceivableListForInvoiceFilter({
          invoiceFilter,
          scopedRows: receivableScoped.scopedRows,
          periodRows: receivableScoped.periodRows,
          vendorMaps: receivableScoped.vendorMaps,
          attributionMaps: receivableScoped.attributionMaps,
          cumulativeByStoreGroup: receivableScoped.cumulativeByStoreGroup,
        })
      : buildReceivableListWithCumulative({
          periodRows: receivableScoped.periodRows,
          scopedRows: receivableScoped.scopedRows,
          vendorMaps: receivableScoped.vendorMaps,
          attributionMaps: receivableScoped.attributionMaps,
          cumulativeByStoreGroup: receivableScoped.cumulativeByStoreGroup,
        })

    let listWithBankAccounts = list
    try {
      const bankIds = collectBankTransactionIdsFromReceivableGroups(list)
      const meta = await fetchBankAccountMetaByTransactionIds(bankIds)
      listWithBankAccounts = applyBankAccountMetaToReceivableGroups(list, meta)
    } catch {
      listWithBankAccounts = list
    }

    return NextResponse.json(
      {
        type: 'receivable',
        list: listWithBankAccounts,
        cumulativeByStoreGroup: receivableScoped.cumulativeByStoreGroup,
      },
      { headers }
    )
  } catch (e) {
    console.error('getReceivablePayableList:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed' },
      { status: 500, headers }
    )
  }
}
