import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

const INTERNAL_BANK_SOURCE_MARKER = 'source:expense_internal'

/** 통장 거래 목록 + 잔액 검증용 집계 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const accountId = String(searchParams.get('accountId') || '').trim()
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()

  if (!accountId) {
    return NextResponse.json({ list: [], summary: null }, { headers })
  }

  try {
    const accountRows = (await supabaseSelectFilter('bank_accounts', `id=eq.${accountId}`, {
      limit: 1,
    })) as { id?: number; opening_balance?: number; opening_balance_date?: string }[]
    const account = accountRows?.[0]
    const openingBalance = Number(account?.opening_balance) ?? 0
    const openingDate = account?.opening_balance_date ? String(account.opening_balance_date).slice(0, 10) : '1900-01-01'

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

    const filter = `account_id=eq.${accountId}&trans_date=gte.${startStr}&trans_date=lte.${endStr}`
    const rows = (await supabaseSelectFilter('bank_transactions', filter, {
      order: 'id.asc',
      limit: 2000,
    })) as { id?: number; trans_date?: string; trans_type?: string; amount?: number; memo?: string; note?: string; category?: string; account_subject_id?: number; sales_date?: string; expense_date?: string; vendor_code?: string; store_name?: string; invoice_received?: boolean; invoice_no?: string; invoice_photo_url?: string; purchase_order_id?: number }[]

    const linkedIds = new Set<number>()
    const rowIds = (rows || []).map((r) => Number(r.id)).filter((id) => id && !isNaN(id))
    if (rowIds.length > 0) {
      const ptRows = (await supabaseSelectFilter('payable_transactions', 'bank_transaction_id=not.is.null', {
        select: 'bank_transaction_id',
        limit: 10000,
      })) as { bank_transaction_id?: number }[]
      for (const r of ptRows || []) {
        const bid = Number(r.bank_transaction_id)
        if (bid && !isNaN(bid) && rowIds.includes(bid)) linkedIds.add(bid)
      }
    }

    const visibleRows = (rows || []).filter((r) => !String(r.note || '').toLowerCase().includes(INTERNAL_BANK_SOURCE_MARKER))
    const list = visibleRows.map((r) => ({
      id: r.id,
      transDate: String(r.trans_date || '').slice(0, 10),
      transType: String(r.trans_type || 'withdraw').toLowerCase(),
      amount: Number(r.amount) || 0,
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
      isLinked: linkedIds.has(Number(r.id || 0)),
    }))

    const periodDeposits = list.filter((t) => t.transType === 'deposit').reduce((s, t) => s + t.amount, 0)
    const periodWithdrawals = list.filter((t) => t.transType === 'withdraw').reduce((s, t) => s + Math.abs(t.amount), 0)

    const beforeStartFilter = `account_id=eq.${accountId}&trans_date=lt.${startStr}`
    const beforeRows = (await supabaseSelectFilter('bank_transactions', beforeStartFilter, {
      select: 'trans_type,amount,note',
      limit: 5000,
    })) as { trans_type?: string; amount?: number; note?: string }[]
    const visibleBeforeRows = (beforeRows || []).filter((r) => !String(r.note || '').toLowerCase().includes(INTERNAL_BANK_SOURCE_MARKER))
    const beforeDeposits = visibleBeforeRows.filter((r) => (r.trans_type || '').toLowerCase() === 'deposit').reduce((s, r) => s + Number(r.amount || 0), 0)
    const beforeWithdrawals = visibleBeforeRows.filter((r) => (r.trans_type || '').toLowerCase() === 'withdraw').reduce((s, r) => s + Math.abs(Number(r.amount || 0)), 0)

    const beginningBalance = openingBalance + beforeDeposits - beforeWithdrawals
    const endingBalance = beginningBalance + periodDeposits - periodWithdrawals

    return NextResponse.json({
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
    }, { headers })
  } catch (e) {
    console.error('getBankTransactions:', e)
    return NextResponse.json({ list: [], summary: null }, { headers })
  }
}
