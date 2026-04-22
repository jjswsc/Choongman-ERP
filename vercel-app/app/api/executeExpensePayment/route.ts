import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { postPayableSettlementJournal } from '@/lib/accounting-posting'
import { expenseAccrualNetPayable } from '@/lib/expense-accrual-net'
import { requireAuth } from '@/lib/verify-auth'

const INTERNAL_BANK_SOURCE_MARKER = 'source:expense_internal'

type ExpenseAccrualRow = {
  id?: number
  payee_code?: string
  payee_name?: string
  amount?: number
  withholding_tax_amount?: number | null
  expense_date?: string
  due_date?: string
  memo?: string
  store_name?: string
  account_subject_id?: number
  status?: string
}

type PayableTxRow = {
  amount?: number
  expense_accrual_id?: number
}

type BankTxRow = {
  id?: number
  account_id?: number
  trans_date?: string
  trans_type?: string
  amount?: number
}

function decodePayeeCode(raw: string | undefined): { payeeCode: string; withdrawalCategory: string } {
  const src = String(raw || '').trim()
  const marker = '::wm::'
  const idx = src.lastIndexOf(marker)
  if (idx < 0) return { payeeCode: src, withdrawalCategory: 'expense' }
  const payeeCode = src.slice(0, idx).trim()
  const withdrawalCategory = src.slice(idx + marker.length).trim().toLowerCase() || 'expense'
  return { payeeCode, withdrawalCategory }
}

function mapWithdrawalCategoryToBankCategory(withdrawalCategory: string): string {
  const c = String(withdrawalCategory || '').toLowerCase()
  if (c === 'purchase_payment') return 'purchase_payment'
  if (c.includes('transfer')) return 'transfer'
  if (c.includes('loan')) return 'loan'
  if (c === 'correction') return 'correction'
  if (c.includes('advance')) return 'advance'
  return 'expense'
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')
  const authResult = await requireAuth(request, 'office')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    authResult.errorResponse.headers.set('Content-Type', 'application/json')
    return authResult.errorResponse
  }
  const auth = authResult.auth

  try {
    const body = await request.json()
    const userName = String(auth.name || body.userName || body.user_name || '').trim()

    const expenseAccrualId = Number(body.expenseAccrualId || body.expense_accrual_id || 0)
    const paymentMethod = String(body.paymentMethod || body.payment_method || '').toLowerCase() // bank | petty
    const bankTransactionId = body.bankTransactionId ?? body.bank_transaction_id
    const amount = Math.abs(Number(body.amount || 0))
    const transDate = String(body.transDate || body.trans_date || getBangkokTodayDateString()).slice(0, 10)
    const memo = String(body.memo || '').trim()
    const store = String(body.store || '').trim()

    if (!expenseAccrualId) {
      return NextResponse.json({ success: false, message: '지출 발생 ID가 필요합니다.' }, { status: 400, headers })
    }
    if (amount <= 0) {
      return NextResponse.json({ success: false, message: '지급 금액을 입력해 주세요.' }, { status: 400, headers })
    }
    if (!['bank', 'petty'].includes(paymentMethod)) {
      return NextResponse.json({ success: false, message: '지급 수단은 bank 또는 petty 이어야 합니다.' }, { status: 400, headers })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transDate)) {
      return NextResponse.json({ success: false, message: '지급일 형식이 올바르지 않습니다.' }, { status: 400, headers })
    }

    const accrual = (await supabaseSelectFilter('expense_accruals', `id=eq.${expenseAccrualId}`, {
      select: 'id,payee_code,payee_name,amount,withholding_tax_amount,expense_date,due_date,memo,store_name,account_subject_id,status',
      limit: 1,
    })) as ExpenseAccrualRow[] | null
    const source = accrual?.[0]
    if (!source?.id) {
      return NextResponse.json({ success: false, message: '지출 발생 데이터를 찾을 수 없습니다.' }, { status: 404, headers })
    }
    const accrualStatus = String(source.status || '').toLowerCase()
    if (accrualStatus === 'rejected') {
      return NextResponse.json({ success: false, message: '반려된 지급 예정은 집행할 수 없습니다.' }, { status: 400, headers })
    }
    if (accrualStatus === 'planned') {
      return NextResponse.json({ success: false, message: '관리자 승인 후 집행할 수 있습니다.' }, { status: 400, headers })
    }
    if (accrualStatus === 'paid' || accrualStatus === 'done') {
      return NextResponse.json({ success: false, message: '이미 지급 완료된 건입니다.' }, { status: 400, headers })
    }
    if (accrualStatus !== 'approved' && accrualStatus !== 'partial') {
      return NextResponse.json({ success: false, message: '승인 상태를 확인할 수 없습니다.' }, { status: 400, headers })
    }

    const paidRows = (await supabaseSelectFilter(
      'payable_transactions',
      `expense_accrual_id=eq.${expenseAccrualId}`,
      { select: 'amount,expense_accrual_id', limit: 5000 }
    )) as PayableTxRow[] | null
    const paidAmount = (paidRows || []).reduce((sum, r) => {
      const a = Number(r.amount || 0)
      return sum + (a < 0 ? Math.abs(a) : 0)
    }, 0)
    const wht = Math.max(0, Math.abs(Number(source.withholding_tax_amount ?? 0) || 0))
    const plannedAmount = expenseAccrualNetPayable(Number(source.amount || 0), wht)
    const remaining = Math.max(0, plannedAmount - paidAmount)
    if (Math.abs(amount - remaining) > 0.01) {
      return NextResponse.json(
        { success: false, message: `부분 지급은 허용되지 않습니다. 잔액과 동일 금액으로 처리해 주세요. (잔액: ${remaining.toLocaleString()})` },
        { status: 400, headers }
      )
    }

    let bankId: number | null = null
    let pettyId: number | null = null

    const decoded = decodePayeeCode(source.payee_code)
    const payeeCode = decoded.payeeCode
    const withdrawalCategory = decoded.withdrawalCategory
    const bankCategory = mapWithdrawalCategoryToBankCategory(withdrawalCategory)
    const note = `expense_accrual_id:${expenseAccrualId};withdrawal_category:${withdrawalCategory}`
    const vendorCode = payeeCode && !payeeCode.startsWith('auto_') ? payeeCode : null
    const paymentMemo = memo || `지출 지급(${source.payee_name || payeeCode})`

    if (paymentMethod === 'bank') {
      const existingBankId = bankTransactionId != null ? Number(bankTransactionId) : null
      if (existingBankId && !isNaN(existingBankId)) {
        const bankRows = (await supabaseSelectFilter('bank_transactions', `id=eq.${existingBankId}`, { limit: 1 })) as BankTxRow[] | null
        const bankRow = bankRows?.[0]
        if (!bankRow?.id) {
          return NextResponse.json({ success: false, message: '선택한 통장 거래를 찾을 수 없습니다.' }, { status: 404, headers })
        }
        if (String(bankRow.trans_type || '').toLowerCase() !== 'withdraw') {
          return NextResponse.json({ success: false, message: '출금 거래만 연결할 수 있습니다.' }, { status: 400, headers })
        }
        const bankAmount = Math.abs(Number(bankRow.amount || 0))
        const bankDate = String(bankRow.trans_date || '').slice(0, 10)
        if (Math.abs(bankAmount - amount) > 0.01) {
          return NextResponse.json({ success: false, message: `금액이 일치하지 않습니다. (통장: ${bankAmount.toLocaleString()}, 지급: ${amount.toLocaleString()})` }, { status: 400, headers })
        }
        if (bankDate !== transDate) {
          return NextResponse.json({ success: false, message: `날짜가 일치하지 않습니다. (통장: ${bankDate}, 지급: ${transDate})` }, { status: 400, headers })
        }
        const linkedPayable = (await supabaseSelectFilter('payable_transactions', `bank_transaction_id=eq.${existingBankId}`, { limit: 1 })) as { id?: number }[] | null
        if (linkedPayable?.length) {
          return NextResponse.json({ success: false, message: '이미 다른 지출/매입과 연결된 통장 거래입니다.' }, { status: 400, headers })
        }
        bankId = existingBankId
        await supabaseUpdate('bank_transactions', bankId, {
          note,
          category: bankCategory,
          vendor_code: vendorCode,
          expense_date: transDate,
          store: store || source.store_name || null,
        })
        try {
          await postPayableSettlementJournal({
            sourceType: 'bank_transaction',
            sourceId: bankId,
            accountingDate: transDate,
            amountAbs: amount,
            memo: paymentMemo,
            storeName: store || source.store_name || undefined,
            postedBy: userName || undefined,
          })
        } catch (postingErr) {
          console.error('executeExpensePayment bank link posting:', postingErr)
        }
      } else {
        const accountId = Number(body.accountId || body.account_id || 0)
        if (!accountId) {
          return NextResponse.json({ success: false, message: '통장 지급은 계좌를 선택해 주세요.' }, { status: 400, headers })
        }
        const inserted = (await supabaseInsert('bank_transactions', {
          account_id: accountId,
          trans_date: transDate,
          trans_type: 'withdraw',
          amount: -Math.abs(amount),
          memo: paymentMemo,
          note: `${note};${INTERNAL_BANK_SOURCE_MARKER}`,
          store: store || source.store_name || null,
          user_name: userName || null,
          category: bankCategory,
          vendor_code: vendorCode,
          expense_date: transDate,
        })) as { id?: number }[]
        bankId = Number(inserted?.[0]?.id || 0) || null
        try {
          await postPayableSettlementJournal({
            sourceType: 'bank_transaction',
            sourceId: bankId || undefined,
            accountingDate: transDate,
            amountAbs: amount,
            memo: paymentMemo,
            storeName: store || source.store_name || undefined,
            postedBy: userName || undefined,
          })
        } catch (postingErr) {
          console.error('executeExpensePayment bank posting:', postingErr)
        }
      }
    } else {
      const pettyStore = store || String(source.store_name || '').trim()
      if (!pettyStore) {
        return NextResponse.json({ success: false, message: '패티 지급은 매장을 선택해 주세요.' }, { status: 400, headers })
      }
      const inserted = (await supabaseInsert('petty_cash_transactions', {
        store: pettyStore,
        trans_date: transDate,
        trans_type: 'expense',
        amount: -Math.abs(amount),
        memo: paymentMemo,
        user_name: userName || null,
      })) as { id?: number }[]
      pettyId = Number(inserted?.[0]?.id || 0) || null
      try {
        await postPayableSettlementJournal({
          sourceType: 'petty_cash',
          sourceId: pettyId || undefined,
          accountingDate: transDate,
          amountAbs: amount,
          memo: paymentMemo,
          storeName: pettyStore,
          postedBy: userName || undefined,
        })
      } catch (postingErr) {
        console.error('executeExpensePayment petty posting:', postingErr)
      }
    }

    await supabaseInsert('payable_transactions', {
      vendor_code: vendorCode,
      amount: -Math.abs(amount),
      ref_type: 'Payment',
      ref_id: null,
      trans_date: transDate,
      memo: `${paymentMethod === 'bank' ? '통장' : '패티'} 지급: ${paymentMemo}`.slice(0, 240),
      expense_accrual_id: expenseAccrualId,
      bank_transaction_id: bankId,
      petty_cash_transaction_id: pettyId,
      expense_date: source.expense_date || transDate,
      due_date: source.due_date || null,
    })

    const nextRemaining = Math.max(0, remaining - amount)
    await supabaseUpdate('expense_accruals', expenseAccrualId, {
      status: nextRemaining <= 0 ? 'paid' : 'approved',
      updated_at: new Date().toISOString(),
    })

    return NextResponse.json(
      {
        success: true,
        message: '지급 처리되었습니다.',
        bankTransactionId: bankId,
        pettyCashTransactionId: pettyId,
        remainingAmount: nextRemaining,
      },
      { headers }
    )
  } catch (e) {
    console.error('executeExpensePayment:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
