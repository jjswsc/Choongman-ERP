import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert } from '@/lib/supabase-server'

/** 통장 거래 등록 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const accountId = Number(body.accountId || body.account_id)
    const transDate = String(body.transDate || body.trans_date || '').slice(0, 10)
    const transType = String(body.transType || body.trans_type || 'withdraw').toLowerCase()
    const amount = Number(body.amount) || 0
    const memo = String(body.memo || '').trim()
    const store = String(body.store || '').trim()
    const userName = String(body.userName || body.user_name || '').trim()
    const category = String(body.category || 'expense').toLowerCase()
    const fixedExpenseId = body.fixedExpenseId ?? body.fixed_expense_id
    const accountSubjectId = body.accountSubjectId ?? body.account_subject_id

    if (!accountId || isNaN(accountId)) {
      return NextResponse.json({ success: false, message: '계좌를 선택하세요.' }, { status: 400, headers })
    }
    if (!transDate) {
      return NextResponse.json({ success: false, message: '날짜를 선택하세요.' }, { status: 400, headers })
    }
    if (amount <= 0) {
      return NextResponse.json({ success: false, message: '금액을 입력하세요.' }, { status: 400, headers })
    }
    if (!['deposit', 'withdraw'].includes(transType)) {
      return NextResponse.json({ success: false, message: '입금 또는 출금을 선택하세요.' }, { status: 400, headers })
    }

    const amt = transType === 'withdraw' ? -Math.abs(amount) : Math.abs(amount)
    const validCategory = ['transfer', 'expense', 'fixed'].includes(category) ? category : 'expense'

    const row: Record<string, unknown> = {
      account_id: accountId,
      trans_date: transDate,
      trans_type: transType,
      amount: amt,
      memo: memo || null,
      store: store || null,
      user_name: userName || null,
      category: validCategory,
    }
    if (validCategory === 'fixed' && fixedExpenseId != null) {
      const fid = Number(fixedExpenseId)
      if (!isNaN(fid)) row.fixed_expense_id = fid
    }
    if (accountSubjectId != null) {
      const asid = Number(accountSubjectId)
      if (!isNaN(asid)) row.account_subject_id = asid
    }
    await supabaseInsert('bank_transactions', row)

    return NextResponse.json({ success: true, message: '등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('addBankTransaction:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
