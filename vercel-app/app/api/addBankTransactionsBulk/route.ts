import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert } from '@/lib/supabase-server'

/** 통장 거래 일괄 등록 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const accountId = Number(body.accountId || body.account_id)
    const store = String(body.store || '').trim()
    const userName = String(body.userName || body.user_name || '').trim()
    const items = Array.isArray(body.items) ? body.items : []

    if (!accountId || isNaN(accountId)) {
      return NextResponse.json({ success: false, message: '계좌를 선택하세요.' }, { status: 400, headers })
    }
    if (items.length === 0) {
      return NextResponse.json({ success: false, message: '등록할 거래가 없습니다.' }, { status: 400, headers })
    }

    let inserted = 0
    for (const item of items) {
      const transDate = String(item.transDate || item.trans_date || '').slice(0, 10)
      const transType = String(item.transType || item.trans_type || 'deposit').toLowerCase()
      const amount = Number(item.amount) || 0
      const memo = String(item.memo || '').trim()
      const note = String(item.note || '').trim()
      const category = String(item.category || 'expense').toLowerCase()
      const accountSubjectId = item.accountSubjectId ?? item.account_subject_id
      const salesDate = item.salesDate ?? item.sales_date
      const expenseDate = item.expenseDate ?? item.expense_date

      if (!transDate || amount <= 0) continue
      if (!['deposit', 'withdraw'].includes(transType)) continue

      const amt = transType === 'withdraw' ? -Math.abs(amount) : Math.abs(amount)
      const depositCategories = ['revenue_delivery', 'revenue_card', 'revenue_qr', 'revenue_cash', 'correction', 'loan', 'advance', 'unclassified']
      const withdrawCategories = ['transfer', 'expense', 'fixed', 'correction', 'loan', 'advance', 'unclassified']
      const validCategory = transType === 'deposit'
        ? (depositCategories.includes(category) ? category : 'revenue_delivery')
        : (withdrawCategories.includes(category) ? category : 'expense')

      const row: Record<string, unknown> = {
        account_id: accountId,
        trans_date: transDate,
        trans_type: transType,
        amount: amt,
        memo: memo || null,
        note: note || null,
        store: store || null,
        user_name: userName || null,
        category: validCategory,
      }
      if (accountSubjectId != null) {
        const asid = Number(accountSubjectId)
        if (!isNaN(asid)) row.account_subject_id = asid
      }
      if (transType === 'deposit' && salesDate) {
        const sd = String(salesDate).slice(0, 10)
        if (/^\d{4}-\d{2}-\d{2}$/.test(sd)) row.sales_date = sd
      }
      if (transType === 'withdraw' && expenseDate) {
        const ed = String(expenseDate).slice(0, 10)
        if (/^\d{4}-\d{2}-\d{2}$/.test(ed)) row.expense_date = ed
      }

      await supabaseInsert('bank_transactions', row)
      inserted++
    }

    return NextResponse.json({ success: true, inserted, message: `${inserted}건 등록되었습니다.` }, { headers })
  } catch (e) {
    console.error('addBankTransactionsBulk:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
