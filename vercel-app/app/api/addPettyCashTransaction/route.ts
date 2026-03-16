import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert } from '@/lib/supabase-server'
import { postPettyCashJournal, postPayableSettlementJournal } from '@/lib/accounting-posting'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const store = String(body.store || '').trim()
    const transDate = String(body.transDate || body.trans_date || '').slice(0, 10)
    const transType = String(body.transType || body.trans_type || 'expense').toLowerCase()
    const amount = Number(body.amount) || 0
    const memo = String(body.memo || '').trim()
    const receiptUrl = body.receiptUrl || body.receipt_url ? String(body.receiptUrl || body.receipt_url).trim() : ''
    const accountSubjectId = body.accountSubjectId ?? body.account_subject_id
    const category = String(body.category || '').toLowerCase()
    const vendorCode = String(body.vendorCode || body.vendor_code || '').trim()
    const expenseAccrualId = Number(body.expenseAccrualId || body.expense_accrual_id || 0) || null
    const userName = String(body.userName || body.user_name || '').trim()
    const userStore = String(body.userStore || body.user_store || '').trim()
    const userRole = String(body.userRole || body.user_role || '').toLowerCase()

    if (!store) {
      return NextResponse.json({ success: false, message: '매장을 선택하세요.' }, { status: 400, headers })
    }
    if (!transDate) {
      return NextResponse.json({ success: false, message: '날짜를 선택하세요.' }, { status: 400, headers })
    }
    if (amount === 0) {
      return NextResponse.json({ success: false, message: '금액을 입력하세요.' }, { status: 400, headers })
    }

    const isOffice = ['director', 'officer', 'ceo', 'hr'].some((r) => userRole.includes(r))
    if (!isOffice && userStore && store !== userStore) {
      return NextResponse.json({ success: false, message: '해당 매장만 등록할 수 있습니다.' }, { status: 403, headers })
    }

    let amt = amount
    if (transType === 'expense') amt = -Math.abs(amt)

    const row: Record<string, unknown> = {
      store,
      trans_date: transDate,
      trans_type: transType,
      amount: amt,
      memo,
      user_name: userName,
    }
    if (receiptUrl) row.receipt_url = receiptUrl
    if (accountSubjectId != null) {
      const asid = Number(accountSubjectId)
      if (!isNaN(asid)) row.account_subject_id = asid
    }
    const inserted = (await supabaseInsert('petty_cash_transactions', row)) as { id?: number }[]
    const pettyCashId = Array.isArray(inserted) && inserted[0] ? inserted[0].id : undefined

    if (transType === 'expense' && category === 'purchase_payment' && vendorCode) {
      await supabaseInsert('payable_transactions', {
        vendor_code: vendorCode,
        amount: -Math.abs(amount),
        ref_type: 'Payment',
        ref_id: null,
        trans_date: transDate.slice(0, 10),
        memo: memo ? `패티 지급: ${memo.slice(0, 200)}` : '패티 지급',
        petty_cash_transaction_id: pettyCashId || null,
        expense_accrual_id: expenseAccrualId,
      })
      try {
        await postPayableSettlementJournal({
          sourceType: 'petty_cash',
          sourceId: pettyCashId,
          accountingDate: transDate.slice(0, 10),
          amountAbs: Math.abs(amount),
          memo: memo || '패티 지급',
          storeName: store,
          postedBy: userName || undefined,
        })
      } catch (postingErr) {
        console.error('addPettyCashTransaction payable posting:', postingErr)
      }
    } else {
      try {
        await postPettyCashJournal({
          pettyCashId,
          transDate: transDate.slice(0, 10),
          transType,
          amountAbs: Math.abs(amount),
          memo,
          storeName: store,
          postedBy: userName || undefined,
        })
      } catch (postingErr) {
        console.error('addPettyCashTransaction posting:', postingErr)
      }
    }

    return NextResponse.json({ success: true, message: '등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('addPettyCashTransaction:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
