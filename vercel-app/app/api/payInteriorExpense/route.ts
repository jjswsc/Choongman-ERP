import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate, supabaseSelectFilter } from '@/lib/supabase-server'

/** 인테리어 비용 결제: bank_transactions 등록 + interior_expense_items paid/balance 갱신 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const expenseId = Number(body.expenseId ?? body.expense_id)
    const accountId = Number(body.accountId ?? body.account_id)
    const transDate = String(body.transDate ?? body.trans_date ?? '').slice(0, 10)
    const amount = Number(body.amount) || 0
    const memo = String(body.memo || '').trim()

    if (!expenseId || isNaN(expenseId)) {
      return NextResponse.json({ success: false, message: '비용 항목 ID가 필요합니다.' }, { status: 400, headers })
    }
    if (!accountId || isNaN(accountId)) {
      return NextResponse.json({ success: false, message: '계좌를 선택하세요.' }, { status: 400, headers })
    }
    if (!transDate || !/^\d{4}-\d{2}-\d{2}$/.test(transDate)) {
      return NextResponse.json({ success: false, message: '날짜를 선택하세요.' }, { status: 400, headers })
    }
    if (amount <= 0) {
      return NextResponse.json({ success: false, message: '금액을 입력하세요.' }, { status: 400, headers })
    }

    const rows = (await supabaseSelectFilter(
      'interior_expense_items',
      `id=eq.${expenseId}`,
      { limit: 1 }
    )) as { id?: number; quote?: number; paid?: number; balance?: number }[]

    const row = rows?.[0]
    if (!row) {
      return NextResponse.json({ success: false, message: '해당 비용 항목을 찾을 수 없습니다.' }, { status: 404, headers })
    }

    const prevPaid = Number(row.paid) ?? 0
    const quote = Number(row.quote) ?? 0
    const newPaid = prevPaid + amount
    const newBalance = quote - newPaid

    const bankRow = {
      account_id: accountId,
      trans_date: transDate,
      trans_type: 'withdraw',
      amount: -Math.abs(amount),
      memo: memo || `인테리어 비용 결제 #${expenseId}`,
      note: `인테리어 비용 결제 (expense_id=${expenseId})`,
      category: 'expense',
      ref_type: 'InteriorExpense',
      ref_id: expenseId,
    }

    const inserted = (await supabaseInsert('bank_transactions', bankRow)) as { id?: number }[]
    const bankId = Array.isArray(inserted) && inserted[0] ? inserted[0].id : undefined

    await supabaseUpdate('interior_expense_items', expenseId, {
      paid: newPaid,
      balance: newBalance,
    })

    return NextResponse.json({
      success: true,
      message: '결제가 등록되었습니다.',
      bankTransactionId: bankId,
    }, { headers })
  } catch (e) {
    console.error('payInteriorExpense:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
