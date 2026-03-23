import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter, supabaseInsert, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { assertAccountSubjectNotHeader } from '@/lib/account-subject-header-guard'

type BankTxRow = {
  id?: number
  trans_type?: string
  amount?: number
}

type PayableRow = {
  id?: number
  expense_accrual_id?: number | null
}

type WithdrawalCategory =
  | 'purchase_payment'
  | 'purchase_advance'
  | 'expense'
  | 'expense_advance'
  | 'fixed_asset'
  | 'transfer'
  | 'transfer_external'
  | 'transfer_to_petty'
  | 'transfer_to_card'
  | 'transfer_from_petty'
  | 'loan_repayment'
  | 'loan_given'
  | 'tax_vat'
  | 'tax_withholding'
  | 'tax_corporate'
  | 'correction'
  | 'dividend'

function mapToWithdrawalCategory(main: string, sub: string): WithdrawalCategory | null {
  const m = main.toLowerCase()
  const s = sub.toLowerCase()
  if (m === 'purchase') return s === 'advance' ? 'purchase_advance' : 'purchase_payment'
  if (m === 'expense') return s === 'advance' ? 'expense_advance' : 'expense'
  if (m === 'fixed_asset') return 'fixed_asset'
  if (m === 'transfer') return 'transfer'
  if (m === 'loan') return s === 'given' ? 'loan_given' : 'loan_repayment'
  if (m === 'tax') {
    if (s === 'vat') return 'tax_vat'
    if (s === 'corporate') return 'tax_corporate'
    return 'tax_withholding'
  }
  if (m === 'correction') return 'correction'
  if (m === 'dividend') return 'dividend'
  return null
}

function mapToBankTransactionCategory(cat: WithdrawalCategory): string {
  const map: Record<WithdrawalCategory, string> = {
    purchase_payment: 'purchase_payment',
    purchase_advance: 'advance',
    expense: 'expense',
    expense_advance: 'advance',
    fixed_asset: 'expense',
    transfer: 'transfer',
    transfer_external: 'transfer',
    transfer_to_petty: 'transfer',
    transfer_to_card: 'transfer',
    transfer_from_petty: 'transfer',
    loan_repayment: 'loan',
    loan_given: 'advance',
    tax_vat: 'expense',
    tax_withholding: 'expense',
    tax_corporate: 'expense',
    correction: 'correction',
    dividend: 'expense',
  }
  return map[cat] || 'expense'
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')
  try {
    const body = await request.json()
    const userRole = String(body.userRole || body.user_role || '').toLowerCase()
    const isOffice = ['director', 'officer', 'ceo', 'hr'].some((r) => userRole.includes(r))
    if (!isOffice) {
      return NextResponse.json({ success: false, message: '본사 권한만 수정할 수 있습니다.' }, { status: 403, headers })
    }

    const bankTransactionId = Number(body.bankTransactionId || body.bank_transaction_id || 0)
    const action = String(body.action || '').trim().toLowerCase() // update | delete
    const amount = Math.abs(Number(body.amount || 0))
    const transDate = String(body.transDate || body.trans_date || '').slice(0, 10)
    const accountId = Number(body.accountId || body.account_id || 0)
    const memo = String(body.memo || '').trim()
    const storeName = String(body.storeName || body.store_name || '').trim()
    const categoryMain = String(body.categoryMain || body.category_main || '').trim().toLowerCase()
    const categorySub = String(body.categorySub || body.category_sub || '').trim().toLowerCase()
    const vendorCode = String(body.vendorCode || body.vendor_code || '').trim()
    const accountSubjectIdRaw = body.accountSubjectId ?? body.account_subject_id
    const accountSubjectId = accountSubjectIdRaw != null && !isNaN(Number(accountSubjectIdRaw))
      ? Number(accountSubjectIdRaw)
      : null
    const invoiceReceived = typeof body.invoiceReceived === 'boolean' ? body.invoiceReceived : undefined
    const invoiceNo = String(body.invoiceNo || '').trim()
    const invoicePhotoUrl = String(body.invoicePhotoUrl || '').trim()

    if (!bankTransactionId) return NextResponse.json({ success: false, message: '거래 ID가 필요합니다.' }, { status: 400, headers })
    if (action !== 'delete') {
      if (!accountId) return NextResponse.json({ success: false, message: '계좌를 선택하세요.' }, { status: 400, headers })
      if (!amount || amount <= 0) return NextResponse.json({ success: false, message: '금액을 입력해 주세요.' }, { status: 400, headers })
      if (!/^\d{4}-\d{2}-\d{2}$/.test(transDate)) return NextResponse.json({ success: false, message: '날짜 형식이 올바르지 않습니다.' }, { status: 400, headers })
    }

    const category = mapToWithdrawalCategory(categoryMain, categorySub || 'normal')
    if (action !== 'delete') {
      if (!category) return NextResponse.json({ success: false, message: '출금 유형을 확인해 주세요.' }, { status: 400, headers })
      if (['purchase_payment', 'purchase_advance'].includes(category) && !vendorCode) {
        return NextResponse.json({ success: false, message: '매입처를 선택해 주세요.' }, { status: 400, headers })
      }
      if (['expense', 'expense_advance'].includes(category) && !accountSubjectId) {
        return NextResponse.json({ success: false, message: '계정과목을 선택해 주세요.' }, { status: 400, headers })
      }
      if (accountSubjectId) {
        const hdr = await assertAccountSubjectNotHeader(accountSubjectId)
        if (!hdr.ok) {
          return NextResponse.json({ success: false, message: hdr.message }, { status: hdr.status, headers })
        }
      }
    }

    const bankRows = (await supabaseSelectFilter(
      'bank_transactions',
      `id=eq.${bankTransactionId}`,
      { limit: 1, select: 'id,trans_type,amount' }
    )) as BankTxRow[] | null
    const bankRow = bankRows?.[0]
    if (!bankRow?.id) return NextResponse.json({ success: false, message: '대상 거래를 찾을 수 없습니다.' }, { status: 404, headers })
    if (String(bankRow.trans_type || '').toLowerCase() !== 'withdraw') {
      return NextResponse.json({ success: false, message: '출금 거래만 수정할 수 있습니다.' }, { status: 400, headers })
    }

    const linkedPayables = (await supabaseSelectFilter(
      'payable_transactions',
      `bank_transaction_id=eq.${bankTransactionId}`,
      { limit: 20, select: 'id,expense_accrual_id' }
    )) as PayableRow[] | null

    if ((linkedPayables || []).some((p) => Number(p.expense_accrual_id || 0) > 0)) {
      return NextResponse.json(
        { success: false, message: '지급예정에서 생성된 지급 건입니다. 지급예정 탭에서 수정해 주세요.' },
        { status: 400, headers }
      )
    }

    if (action === 'delete') {
      if ((linkedPayables || []).some((r) => Number(r.expense_accrual_id || 0) > 0)) {
        return NextResponse.json(
          { success: false, message: '지급예정과 연결된 거래는 삭제할 수 없습니다. 지급예정 탭에서 처리해 주세요.' },
          { status: 400, headers }
        )
      }
      const [linkedInbound, linkedCards] = await Promise.all([
        supabaseSelectFilter('bank_transaction_inbound_links', `bank_transaction_id=eq.${bankTransactionId}`, { limit: 1 }).catch(() => []),
        supabaseSelectFilter('card_transactions', `bank_transaction_id=eq.${bankTransactionId}`, { limit: 1 }).catch(() => []),
      ])
      if ((linkedInbound || []).length > 0) {
        return NextResponse.json({ success: false, message: '입고 연동된 거래는 삭제할 수 없습니다.' }, { status: 400, headers })
      }
      if ((linkedCards || []).length > 0) {
        return NextResponse.json({ success: false, message: '카드 충전과 연결된 거래는 삭제할 수 없습니다.' }, { status: 400, headers })
      }
      await supabaseDeleteByFilter('payable_transactions', `bank_transaction_id=eq.${bankTransactionId}&expense_accrual_id=is.null`)
      await supabaseDeleteByFilter('bank_transactions', `id=eq.${bankTransactionId}`)
      return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
    }

    const bankCategory = mapToBankTransactionCategory(category!)
    const patch: Record<string, unknown> = {
      account_id: accountId,
      trans_date: transDate,
      amount: -amount,
      memo: memo || null,
      category: bankCategory,
      note: `withdrawal_category:${category}`,
      store: storeName || null,
      expense_date: transDate,
      vendor_code: vendorCode || null,
      account_subject_id: accountSubjectId,
    }
    if (invoiceReceived !== undefined) patch.invoice_received = invoiceReceived
    patch.invoice_no = invoiceNo || null
    patch.invoice_photo_url = invoicePhotoUrl || null
    await supabaseUpdate('bank_transactions', bankTransactionId, patch)

    if (category === 'purchase_payment' && vendorCode) {
      if (linkedPayables?.length && linkedPayables[0].id) {
        await supabaseUpdate('payable_transactions', linkedPayables[0].id, {
          vendor_code: vendorCode,
          amount: -amount,
          trans_date: transDate,
          memo: memo ? `통장 지급(매입): ${memo.slice(0, 200)}` : `통장 지급(매입): ${vendorCode}`,
        })
      } else {
        await supabaseInsert('payable_transactions', {
          vendor_code: vendorCode,
          amount: -amount,
          ref_type: 'Payment',
          ref_id: null,
          trans_date: transDate,
          memo: memo ? `통장 지급(매입): ${memo.slice(0, 200)}` : `통장 지급(매입): ${vendorCode}`,
          bank_transaction_id: bankTransactionId,
        })
      }
    } else {
      await supabaseDeleteByFilter('payable_transactions', `bank_transaction_id=eq.${bankTransactionId}&expense_accrual_id=is.null`)
    }

    return NextResponse.json({ success: true, message: '수정되었습니다.' }, { headers })
  } catch (e) {
    console.error('updateExpenseRegisterItem:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '수정 실패' },
      { status: 500, headers }
    )
  }
}

