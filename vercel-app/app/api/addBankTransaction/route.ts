import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert } from '@/lib/supabase-server'

/** 통장 거래 등록 (매입 대금/매출 수령 시 미지급금/미수금 자동 연동) */
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
    const note = String(body.note || '').trim()
    const store = String(body.store || '').trim()
    const userName = String(body.userName || body.user_name || '').trim()
    const category = String(body.category || 'expense').toLowerCase()
    const fixedExpenseId = body.fixedExpenseId ?? body.fixed_expense_id
    const accountSubjectId = body.accountSubjectId ?? body.account_subject_id
    const salesDate = body.salesDate ?? body.sales_date
    const expenseDate = body.expenseDate ?? body.expense_date
    const vendorCode = String(body.vendorCode || body.vendor_code || '').trim()
    const storeNameForReceivable = String(body.storeName || body.store_name || '').trim()

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
    const depositCategories = ['revenue_delivery', 'revenue_card', 'revenue_qr', 'revenue_cash', 'receivable_receive', 'correction', 'loan', 'advance', 'unclassified']
    const withdrawCategories = ['transfer', 'expense', 'fixed', 'purchase_payment', 'correction', 'loan', 'advance', 'unclassified']
    const validCategory = transType === 'deposit'
      ? (depositCategories.includes(category) ? category : depositCategories[0])
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
    if (validCategory === 'fixed' && fixedExpenseId != null) {
      const fid = Number(fixedExpenseId)
      if (!isNaN(fid)) row.fixed_expense_id = fid
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
    if (validCategory === 'purchase_payment' && vendorCode) row.vendor_code = vendorCode
    if (validCategory === 'receivable_receive' && storeNameForReceivable) row.store_name = storeNameForReceivable

    const inserted = (await supabaseInsert('bank_transactions', row)) as { id?: number }[]
    const bankId = Array.isArray(inserted) && inserted[0] ? inserted[0].id : undefined

    if (bankId && validCategory === 'purchase_payment' && vendorCode) {
      await supabaseInsert('payable_transactions', {
        vendor_code: vendorCode,
        amount: -Math.abs(amount),
        ref_type: 'Payment',
        ref_id: null,
        trans_date: transDate.slice(0, 10),
        memo: memo ? `통장 지급: ${memo.slice(0, 200)}` : '통장 지급',
        bank_transaction_id: bankId,
      })
    }
    if (bankId && validCategory === 'receivable_receive' && storeNameForReceivable) {
      await supabaseInsert('receivable_transactions', {
        store_name: storeNameForReceivable,
        amount: -Math.abs(amount),
        ref_type: 'Receive',
        ref_id: null,
        trans_date: transDate.slice(0, 10),
        memo: memo ? `통장 수령: ${memo.slice(0, 200)}` : '통장 수령',
        bank_transaction_id: bankId,
      })
    }

    return NextResponse.json({ success: true, message: '등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('addBankTransaction:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
