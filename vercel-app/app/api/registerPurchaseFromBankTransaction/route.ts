import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { postPayableSettlementJournal } from '@/lib/accounting-posting'

type BankTxRow = { id?: number; account_id?: number; trans_date?: string; trans_type?: string; amount?: number }

/** 통장 출금 거래를 매입 대금 지급으로 등록하고 연결 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const userRole = String(body.userRole || body.user_role || '').toLowerCase()
    const userName = String(body.userName || body.user_name || '').trim()
    const isOffice = ['director', 'officer', 'ceo', 'hr'].some((r) => userRole.includes(r))
    if (!isOffice) {
      return NextResponse.json({ success: false, message: '본사 권한만 등록할 수 있습니다.' }, { status: 403, headers })
    }

    const bankTransactionId = Number(body.bankTransactionId ?? body.bank_transaction_id ?? 0)
    const vendorCode = String(body.vendorCode || body.vendor_code || body.payeeCode || body.payee_code || '').trim()

    if (!bankTransactionId || isNaN(bankTransactionId)) {
      return NextResponse.json({ success: false, message: '통장 거래 ID가 필요합니다.' }, { status: 400, headers })
    }
    if (!vendorCode) {
      return NextResponse.json({ success: false, message: '거래처를 입력해 주세요.' }, { status: 400, headers })
    }

    const bankRows = (await supabaseSelectFilter('bank_transactions', `id=eq.${bankTransactionId}`, { limit: 1 })) as BankTxRow[] | null
    const bankRow = bankRows?.[0]
    if (!bankRow?.id) {
      return NextResponse.json({ success: false, message: '통장 거래를 찾을 수 없습니다.' }, { status: 404, headers })
    }
    if (String(bankRow.trans_type || '').toLowerCase() !== 'withdraw') {
      return NextResponse.json({ success: false, message: '출금 거래만 등록할 수 있습니다.' }, { status: 400, headers })
    }

    const updateExisting = Boolean(body.updateExisting ?? body.update_existing)
    const linkedPayable = (await supabaseSelectFilter('payable_transactions', `bank_transaction_id=eq.${bankTransactionId}`, { limit: 1 })) as { id?: number }[] | null

    if (linkedPayable?.length && !updateExisting) {
      return NextResponse.json({ success: false, message: '이미 연결된 통장 거래입니다.' }, { status: 400, headers })
    }
    if (linkedPayable?.length && updateExisting) {
      await supabaseUpdate('payable_transactions', linkedPayable[0].id!, { vendor_code: vendorCode })
      await supabaseUpdate('bank_transactions', bankTransactionId, {
        vendor_code: vendorCode,
        note: `purchase_payment:${vendorCode}`,
      })
      return NextResponse.json({ success: true, message: '수정되었습니다.' }, { headers })
    }

    const amount = Math.abs(Number(bankRow.amount || 0))
    const transDate = String(bankRow.trans_date || '').slice(0, 10)
    if (!amount || !transDate || !/^\d{4}-\d{2}-\d{2}$/.test(transDate)) {
      return NextResponse.json({ success: false, message: '통장 거래 정보가 올바르지 않습니다.' }, { status: 400, headers })
    }

    await supabaseInsert('payable_transactions', {
      vendor_code: vendorCode,
      amount: -Math.abs(amount),
      ref_type: 'Payment',
      ref_id: null,
      trans_date: transDate,
      memo: `통장 지급(매입): ${vendorCode}`.slice(0, 240),
      bank_transaction_id: bankTransactionId,
    })

    await supabaseUpdate('bank_transactions', bankTransactionId, {
      note: `purchase_payment:${vendorCode}`,
      category: 'purchase_payment',
      vendor_code: vendorCode,
      expense_date: transDate,
    })

    try {
      await postPayableSettlementJournal({
        sourceType: 'bank_transaction',
        sourceId: bankTransactionId,
        accountingDate: transDate,
        amountAbs: amount,
        memo: `매입 대금 지급 ${vendorCode}`,
        postedBy: userName || undefined,
      })
    } catch (postingErr) {
      console.error('registerPurchaseFromBankTransaction posting:', postingErr)
    }

    return NextResponse.json(
      { success: true, message: '매입 대금으로 등록되었습니다.' },
      { headers }
    )
  } catch (e) {
    console.error('registerPurchaseFromBankTransaction:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
