import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

const INTERNAL_BANK_SOURCE_MARKER = 'source:expense_internal'

/** 미연결 출금 거래 목록 (지출/매입 관리 연결용) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(request.url)
    const accountId = String(searchParams.get('accountId') || '').trim()
    const startStr = String(searchParams.get('startStr') || '').slice(0, 10)
    const endStr = String(searchParams.get('endStr') || '').slice(0, 10)
    const amount = searchParams.get('amount') ? Number(searchParams.get('amount')) : null
    const transDate = String(searchParams.get('transDate') || '').slice(0, 10)

    if (!accountId || !startStr || !endStr) {
      return NextResponse.json({ list: [] }, { headers })
    }

    const filter = `account_id=eq.${accountId}&trans_type=eq.withdraw&trans_date=gte.${startStr}&trans_date=lte.${endStr}`
    const rows = (await supabaseSelectFilter('bank_transactions', filter, {
      order: 'trans_date.desc,id.desc',
      limit: 10000,
    })) as { id?: number; trans_date?: string; amount?: number; memo?: string; note?: string }[]

    const linkedIds = new Set<number>()
    if (rows?.length) {
      const ptRows = (await supabaseSelectFilter('payable_transactions', 'bank_transaction_id=not.is.null', {
        select: 'bank_transaction_id',
        limit: 50000,
      })) as { bank_transaction_id?: number }[]
      for (const r of ptRows || []) {
        const bid = Number(r.bank_transaction_id)
        if (bid && !isNaN(bid)) linkedIds.add(bid)
      }
    }

    let list = (rows || [])
      .filter((r) => !String(r.note || '').toLowerCase().includes(INTERNAL_BANK_SOURCE_MARKER))
      .filter((r) => !linkedIds.has(Number(r.id || 0)))
      .map((r) => ({
        id: r.id,
        transDate: String(r.trans_date || '').slice(0, 10),
        amount: Math.abs(Number(r.amount || 0)),
        memo: String(r.memo || '').trim(),
      }))

    if (amount != null && !isNaN(amount) && amount > 0) {
      list = list.filter((r) => Math.abs(r.amount - amount) < 0.01)
    }
    if (transDate && /^\d{4}-\d{2}-\d{2}$/.test(transDate)) {
      list = list.filter((r) => r.transDate === transDate)
    }

    return NextResponse.json({ list }, { headers })
  } catch (e) {
    console.error('getUnlinkedBankWithdrawals:', e)
    return NextResponse.json({ list: [] }, { headers })
  }
}
