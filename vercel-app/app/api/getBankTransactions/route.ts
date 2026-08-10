import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { parseMoneyAmount } from '@/lib/money-amount'
import { requireAuth } from '@/lib/verify-auth'
import { INTERNAL_BANK_SOURCE_MARKER } from '@/lib/bank-transaction-note-meta'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
} from '@/lib/saas-tenant-scope'

const BANK_TX_SUMMARY_SCAN_MAX_ROWS = 1_000_000

/** 통장 거래 목록 + 잔액 검증용 집계 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'private, no-store')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })
  if (
    isSaasTenantQueryBlocked(tenantScope, 'bank_accounts') ||
    isSaasTenantQueryBlocked(tenantScope, 'bank_transactions')
  ) {
    return NextResponse.json({ list: [], summary: null }, { headers })
  }
  const { searchParams } = new URL(request.url)
  const accountId = String(searchParams.get('accountId') || '').trim()
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
  const pageSizeParam = Number(searchParams.get('pageSize') || searchParams.get('limit') || 0)
  const cursorIdParam = Number(searchParams.get('cursorId') || 0)
  const sortParam = String(searchParams.get('sort') || 'asc').toLowerCase()
  const isDesc = sortParam === 'desc'
  const hasPagination = Number.isFinite(pageSizeParam) && pageSizeParam > 0
  const pageSize = hasPagination ? Math.min(1000, Math.max(1, Math.floor(pageSizeParam))) : 20000

  if (!accountId) {
    return NextResponse.json({ list: [], summary: null }, { headers })
  }

  try {
    const accountRows = (await supabaseSelectFilter(
      'bank_accounts',
      appendSaasTenantFilter(`id=eq.${accountId}`, tenantScope, 'bank_accounts'),
      {
      select: 'id,opening_balance,opening_balance_date',
      limit: 1,
      }
    )) as { id?: number; opening_balance?: number; opening_balance_date?: string }[]
    const account = accountRows?.[0]
    const openingBalance = Number(account?.opening_balance) ?? 0

    if (!startStr || !endStr) {
      return NextResponse.json({
        list: [],
        summary: {
          openingBalance,
          periodDeposits: 0,
          periodWithdrawals: 0,
          calculatedBalance: openingBalance,
          actualBalance: null,
          difference: null,
        },
      }, { headers })
    }

    let filter = `account_id=eq.${accountId}&trans_date=gte.${startStr}&trans_date=lte.${endStr}`
    if (hasPagination && Number.isFinite(cursorIdParam) && cursorIdParam > 0) {
      filter += isDesc ? `&id=lt.${Math.floor(cursorIdParam)}` : `&id=gt.${Math.floor(cursorIdParam)}`
    }
    filter = appendSaasTenantFilter(filter, tenantScope, 'bank_transactions')
    const rows = (await supabaseSelectFilter('bank_transactions', filter, {
      order: isDesc ? 'id.desc' : 'id.asc',
      limit: pageSize,
    })) as {
      id?: number
      trans_date?: string
      trans_type?: string
      amount?: number
      memo?: string
      note?: string
      category?: string
      account_subject_id?: number
      sales_date?: string
      expense_date?: string
      vendor_code?: string
      store_name?: string
      invoice_received?: boolean
      invoice_no?: string
      invoice_photo_url?: string
      purchase_order_id?: number
      withholding_tax_amount?: number | null
      withholding_tax_rate?: number | null
    }[]

    const linkedIds = new Set<number>()
    const receivableLinkedIds = new Set<number>()
    const channelSettledIds = new Set<number>()
    const cardLinkedIds = new Set<number>()
    const rowIds = (rows || []).map((r) => Number(r.id)).filter((id) => id && !isNaN(id))
    if (rowIds.length > 0) {
      for (let i = 0; i < rowIds.length; i += 80) {
        const chunk = rowIds.slice(i, i + 80)
        const idList = chunk.join(',')
        // 입금 1건에 인보이스 수금(Receive)이 여러 행일 수 있음 — limit=chunk.length 이면
        // isReceivableLinked 가 잘려 false 로 나와 「미연결」 배지가 유지됨.
        const receivableLinkLimit = Math.min(Math.max(chunk.length * 50, 500), 5000)
        // 통장 1건에 payable 이 여러 행일 수 있음 — limit=chunk.length 이면 isLinked 누락 → 「미연동」 오표시
        const payableLinkLimit = Math.min(Math.max(chunk.length * 10, 500), 5000)
        const [ptRows, recvRows, settleRows, cardRows] = await Promise.all([
          supabaseSelectFilter('payable_transactions', `bank_transaction_id=in.(${idList})`, {
            select: 'bank_transaction_id',
            limit: payableLinkLimit,
          }) as Promise<{ bank_transaction_id?: number }[] | null>,
          supabaseSelectFilter(
            'receivable_transactions',
            `bank_transaction_id=in.(${idList})&ref_type=eq.Receive&ref_id=not.is.null`,
            { select: 'bank_transaction_id', limit: receivableLinkLimit }
          ) as Promise<{ bank_transaction_id?: number }[] | null>,
          supabaseSelectFilter('pos_channel_settlements', `bank_transaction_id=in.(${idList})`, {
            select: 'bank_transaction_id',
            limit: chunk.length,
          }) as Promise<{ bank_transaction_id?: number }[] | null>,
          supabaseSelectFilter('card_transactions', `bank_transaction_id=in.(${idList})`, {
            select: 'bank_transaction_id',
            limit: chunk.length,
          }).catch(() => [] as { bank_transaction_id?: number }[]),
        ])
        for (const r of ptRows || []) {
          const bid = Number(r.bank_transaction_id)
          if (bid && !isNaN(bid)) linkedIds.add(bid)
        }
        for (const r of recvRows || []) {
          const bid = Number(r.bank_transaction_id)
          if (bid && !isNaN(bid)) receivableLinkedIds.add(bid)
        }
        for (const r of settleRows || []) {
          const bid = Number(r.bank_transaction_id)
          if (bid && !isNaN(bid)) channelSettledIds.add(bid)
        }
        for (const r of cardRows || []) {
          const bid = Number(r.bank_transaction_id)
          if (bid && !isNaN(bid)) cardLinkedIds.add(bid)
        }
      }
    }

    const visibleRows = (rows || []).filter((r) => !String(r.note || '').toLowerCase().includes(INTERNAL_BANK_SOURCE_MARKER))
    const list = visibleRows.map((r) => ({
      id: r.id,
      transDate: String(r.trans_date || '').slice(0, 10),
      transType: String(r.trans_type || 'withdraw').toLowerCase(),
      amount: parseMoneyAmount(r.amount),
      memo: String(r.memo || '').trim(),
      note: String(r.note || '').trim(),
      category: String(r.category || 'expense').toLowerCase(),
      accountSubjectId: r.account_subject_id ?? null,
      salesDate: r.sales_date ? String(r.sales_date).slice(0, 10) : undefined,
      expenseDate: r.expense_date ? String(r.expense_date).slice(0, 10) : undefined,
      vendorCode: r.vendor_code ? String(r.vendor_code).trim() : undefined,
      storeName: r.store_name ? String(r.store_name).trim() : undefined,
      invoiceReceived: Boolean(r.invoice_received),
      invoiceNo: r.invoice_no ? String(r.invoice_no).trim() : undefined,
      invoicePhotoUrl: r.invoice_photo_url ? String(r.invoice_photo_url).trim() : undefined,
      purchaseOrderId: r.purchase_order_id ?? undefined,
      withholdingTaxAmount:
        r.withholding_tax_amount != null && Number(r.withholding_tax_amount) > 0
          ? Number(r.withholding_tax_amount)
          : undefined,
      withholdingTaxRate:
        r.withholding_tax_rate != null && Number(r.withholding_tax_rate) > 0
          ? Number(r.withholding_tax_rate)
          : undefined,
      isLinked: linkedIds.has(Number(r.id || 0)),
      isReceivableLinked: receivableLinkedIds.has(Number(r.id || 0)),
      isChannelSettled: channelSettledIds.has(Number(r.id || 0)),
      isCardLinked: cardLinkedIds.has(Number(r.id || 0)),
    }))

    const periodDeposits = list.filter((t) => t.transType === 'deposit').reduce((s, t) => s + t.amount, 0)
    const periodWithdrawals = list.filter((t) => t.transType === 'withdraw').reduce((s, t) => s + Math.abs(t.amount), 0)

    const beforeStartFilter = appendSaasTenantFilter(
      `account_id=eq.${accountId}&trans_date=lt.${startStr}`,
      tenantScope,
      'bank_transactions'
    )
    const beforeRows = (await supabaseSelectFilterAllPages('bank_transactions', beforeStartFilter, {
      select: 'trans_type,amount,note',
      pageSize: 8000,
      maxRows: BANK_TX_SUMMARY_SCAN_MAX_ROWS,
    })) as { trans_type?: string; amount?: number; note?: string }[]
    const visibleBeforeRows = (beforeRows || []).filter((r) => !String(r.note || '').toLowerCase().includes(INTERNAL_BANK_SOURCE_MARKER))
    const beforeDeposits = visibleBeforeRows.filter((r) => (r.trans_type || '').toLowerCase() === 'deposit').reduce((s, r) => s + Number(r.amount || 0), 0)
    const beforeWithdrawals = visibleBeforeRows.filter((r) => (r.trans_type || '').toLowerCase() === 'withdraw').reduce((s, r) => s + Math.abs(Number(r.amount || 0)), 0)

    const beginningBalance = openingBalance + beforeDeposits - beforeWithdrawals
    const endingBalance = beginningBalance + periodDeposits - periodWithdrawals

    const responseBody: {
      list: typeof list
      summary: {
        openingBalance: number
        beginningBalance: number
        periodDeposits: number
        periodWithdrawals: number
        calculatedBalance: number
        actualBalance: null
        difference: null
      }
      pagination?: { pageSize: number; sort: 'asc' | 'desc'; hasMore: boolean; nextCursorId: number | null }
    } = {
      list,
      summary: {
        openingBalance,
        beginningBalance,
        periodDeposits,
        periodWithdrawals,
        calculatedBalance: endingBalance,
        actualBalance: null,
        difference: null,
      },
    }
    if (hasPagination) {
      const lastId = list.length > 0 ? Number(list[list.length - 1]?.id || 0) : 0
      responseBody.pagination = {
        pageSize,
        sort: isDesc ? 'desc' : 'asc',
        hasMore: list.length === pageSize && lastId > 0,
        nextCursorId: list.length === pageSize && lastId > 0 ? lastId : null,
      }
    }

    return NextResponse.json(responseBody, { headers })
  } catch (e) {
    console.error('getBankTransactions:', e)
    if (tenantScope.enforce && isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing('bank_accounts')
      markSaasTenantColumnMissing('bank_transactions')
    }
    return NextResponse.json({ list: [], summary: null }, { headers })
  }
}
