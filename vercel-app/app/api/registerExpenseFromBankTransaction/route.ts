import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { postExpenseAccrualJournal, postPayableSettlementJournal } from '@/lib/accounting-posting'
import { assertAccountSubjectNotHeader } from '@/lib/account-subject-header-guard'

type AccountSubjectRow = { id?: number; code?: string; name?: string; name_en?: string }
type BankTxRow = { id?: number; account_id?: number; trans_date?: string; trans_type?: string; amount?: number }

/** 통장 출금 거래를 지출 발생으로 등록하고 연결 */
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
    const payeeCode = String(body.payeeCode || body.payee_code || body.vendorCode || body.vendor_code || '').trim()
    const payeeName = String(body.payeeName || body.payee_name || '').trim() || payeeCode
    const accountSubjectId = body.accountSubjectId ?? body.account_subject_id
    const memo = body.memo != null ? String(body.memo || '').trim().slice(0, 500) || null : null
    const storeName = String(body.storeName || body.store_name || '').trim()

    if (!bankTransactionId || isNaN(bankTransactionId)) {
      return NextResponse.json({ success: false, message: '통장 거래 ID가 필요합니다.' }, { status: 400, headers })
    }
    if (!payeeCode) {
      return NextResponse.json({ success: false, message: '지급처를 입력해 주세요.' }, { status: 400, headers })
    }

    if (accountSubjectId != null && !isNaN(Number(accountSubjectId))) {
      const hdr = await assertAccountSubjectNotHeader(Number(accountSubjectId))
      if (!hdr.ok) {
        return NextResponse.json({ success: false, message: hdr.message }, { status: hdr.status, headers })
      }
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
    const linkedPayable = (await supabaseSelectFilter('payable_transactions', `bank_transaction_id=eq.${bankTransactionId}`, { limit: 1 })) as { id?: number; expense_accrual_id?: number }[] | null

    if (linkedPayable?.length && !updateExisting) {
      return NextResponse.json({ success: false, message: '이미 연결된 통장 거래입니다.' }, { status: 400, headers })
    }
    if (linkedPayable?.length && updateExisting) {
      const accrualId = Number(linkedPayable[0].expense_accrual_id || 0)
      if (!accrualId) {
        return NextResponse.json({ success: false, message: '연결된 지출 정보를 찾을 수 없습니다.' }, { status: 404, headers })
      }
      await supabaseUpdate('expense_accruals', accrualId, {
        payee_code: payeeCode,
        payee_name: payeeName || payeeCode,
        account_subject_id: accountSubjectId != null && !isNaN(Number(accountSubjectId)) ? Number(accountSubjectId) : null,
        memo: memo ?? undefined,
      })
      const allPayables = (await supabaseSelectFilter('payable_transactions', `expense_accrual_id=eq.${accrualId}`, { limit: 10 })) as { id?: number }[]
      for (const p of allPayables || []) {
        if (p.id) await supabaseUpdate('payable_transactions', p.id, { vendor_code: payeeCode })
      }
      await supabaseUpdate('bank_transactions', bankTransactionId, {
        vendor_code: payeeCode,
        account_subject_id: accountSubjectId != null && !isNaN(Number(accountSubjectId)) ? Number(accountSubjectId) : null,
        note: memo,
      })
      return NextResponse.json({ success: true, message: '수정되었습니다.' }, { headers })
    }

    const amount = Math.abs(Number(bankRow.amount || 0))
    const expenseDate = String(bankRow.trans_date || '').slice(0, 10)
    if (!amount || !expenseDate || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
      return NextResponse.json({ success: false, message: '통장 거래 정보가 올바르지 않습니다.' }, { status: 400, headers })
    }

    const accrualRow: Record<string, unknown> = {
      payee_code: payeeCode,
      payee_name: payeeName || payeeCode,
      amount,
      expense_date: expenseDate,
      due_date: expenseDate,
      memo: memo || null,
      store_name: storeName || null,
      created_by: userName || null,
      status: 'done',
    }
    let subjectCode = '5520'
    let subjectName = '기타경비'
    if (accountSubjectId != null && !isNaN(Number(accountSubjectId))) {
      const asId = Number(accountSubjectId)
      accrualRow.account_subject_id = asId
      const subject = (await supabaseSelectFilter(
        'account_subjects',
        `id=eq.${asId}`,
        { select: 'id,code,name,name_en', limit: 1 }
      )) as AccountSubjectRow[] | null
      const first = subject?.[0]
      if (first?.code) subjectCode = String(first.code)
      if (first?.name) subjectName = String(first.name)
    }

    const inserted = (await supabaseInsert('expense_accruals', accrualRow)) as { id?: number }[]
    const expenseAccrualId = Number(inserted?.[0]?.id || 0)
    if (!expenseAccrualId) {
      return NextResponse.json({ success: false, message: '지출 발생 등록에 실패했습니다.' }, { status: 500, headers })
    }

    await supabaseInsert('payable_transactions', {
      vendor_code: payeeCode,
      amount: Math.abs(amount),
      ref_type: 'Expense',
      ref_id: null,
      trans_date: expenseDate,
      memo: '지출발생(통장연결)',
      expense_accrual_id: expenseAccrualId,
      account_subject_id: accountSubjectId != null && !isNaN(Number(accountSubjectId)) ? Number(accountSubjectId) : null,
      expense_date: expenseDate,
      due_date: expenseDate,
    })

    await supabaseInsert('payable_transactions', {
      vendor_code: payeeCode,
      amount: -Math.abs(amount),
      ref_type: 'Payment',
      ref_id: null,
      trans_date: expenseDate,
      memo: `통장 지급: ${payeeName || payeeCode}`.slice(0, 240),
      expense_accrual_id: expenseAccrualId,
      bank_transaction_id: bankTransactionId,
      expense_date: expenseDate,
    })

    await supabaseUpdate('bank_transactions', bankTransactionId, {
      note: memo || null,
      category: 'expense',
      vendor_code: payeeCode,
      expense_date: expenseDate,
      store: storeName || null,
      account_subject_id: accountSubjectId != null && !isNaN(Number(accountSubjectId)) ? Number(accountSubjectId) : null,
    })

    try {
      await postExpenseAccrualJournal({
        expenseAccrualId,
        accountingDate: expenseDate,
        amountAbs: amount,
        expenseAccountCode: subjectCode,
        expenseAccountName: subjectName,
        expenseAccountSubjectId:
          accountSubjectId != null && !isNaN(Number(accountSubjectId)) ? Number(accountSubjectId) : null,
        memo: `지출 발생(통장연결) ${payeeName || payeeCode}`,
        storeName: storeName || undefined,
        postedBy: userName || undefined,
      })
      await postPayableSettlementJournal({
        sourceType: 'bank_transaction',
        sourceId: bankTransactionId,
        accountingDate: expenseDate,
        amountAbs: amount,
        memo: `지출 지급 ${payeeName || payeeCode}`,
        storeName: storeName || undefined,
        postedBy: userName || undefined,
      })
    } catch (postingErr) {
      console.error('registerExpenseFromBankTransaction posting:', postingErr)
    }

    return NextResponse.json(
      { success: true, message: '지출 발생으로 등록되었습니다.', id: expenseAccrualId },
      { headers }
    )
  } catch (e) {
    console.error('registerExpenseFromBankTransaction:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
