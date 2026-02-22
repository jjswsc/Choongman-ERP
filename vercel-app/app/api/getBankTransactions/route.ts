import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

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
      order: 'trans_date.asc,id.asc',
      limit: 2000,
    }    )) as { id?: number; trans_date?: string; trans_type?: string; amount?: number; memo?: string; note?: string; category?: string; account_subject_id?: number; sales_date?: string }[]

    const list = (rows || []).map((r) => ({
      id: r.id,
      transDate: String(r.trans_date || '').slice(0, 10),
      transType: String(r.trans_type || 'withdraw').toLowerCase(),
      amount: Number(r.amount) || 0,
      memo: String(r.memo || '').trim(),
      note: String(r.note || '').trim(),
      category: String(r.category || 'expense').toLowerCase(),
      accountSubjectId: r.account_subject_id ?? null,
      salesDate: r.sales_date ? String(r.sales_date).slice(0, 10) : undefined,
    }))

    const periodDeposits = list.filter((t) => t.transType === 'deposit').reduce((s, t) => s + t.amount, 0)
    const periodWithdrawals = list.filter((t) => t.transType === 'withdraw').reduce((s, t) => s + Math.abs(t.amount), 0)

    const beforeStartFilter = `account_id=eq.${accountId}&trans_date=lt.${startStr}`
    const beforeRows = (await supabaseSelectFilter('bank_transactions', beforeStartFilter, {
      select: 'trans_type,amount',
      limit: 5000,
    })) as { trans_type?: string; amount?: number }[]
    const beforeDeposits = (beforeRows || []).filter((r) => (r.trans_type || '').toLowerCase() === 'deposit').reduce((s, r) => s + Number(r.amount || 0), 0)
    const beforeWithdrawals = (beforeRows || []).filter((r) => (r.trans_type || '').toLowerCase() === 'withdraw').reduce((s, r) => s + Math.abs(Number(r.amount || 0)), 0)

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
