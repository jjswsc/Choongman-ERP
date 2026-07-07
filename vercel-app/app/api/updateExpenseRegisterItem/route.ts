import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter, supabaseInsert, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { assertAccountSubjectNotHeader } from '@/lib/account-subject-header-guard'
import { assertAccountingDateOpen, deleteJournalEntriesBySource } from '@/lib/accounting-posting'
import { composeBankNoteWithCategoryAndOptionalAccrualPrefix } from '@/lib/bank-transaction-note-meta'
import { assertPurchasePaymentViaExpenseOnly } from '@/lib/bank-purchase-payment-via-expense'
import { parseMoneyAmount } from '@/lib/money-amount'
import { requireAuth } from '@/lib/verify-auth'

type BankTxRow = {
  id?: number
  account_id?: number
  trans_type?: string
  amount?: number
  trans_date?: string
  memo?: string
  note?: string
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
    const authResult = await requireAuth(request, 'office')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      authResult.errorResponse.headers.set('Content-Type', 'application/json')
      return authResult.errorResponse
    }
    const body = await request.json()

    const bankTransactionId = Number(body.bankTransactionId || body.bank_transaction_id || 0)
    const action = String(body.action || '').trim().toLowerCase() // update | delete
    const amount = parseMoneyAmount(body.amount)
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

    const bankRows = (await supabaseSelectFilter(
      'bank_transactions',
      `id=eq.${bankTransactionId}`,
      { limit: 1, select: 'id,account_id,trans_type,amount,trans_date,memo,note' }
    )) as BankTxRow[] | null
    const bankRow = bankRows?.[0]
    if (!bankRow?.id) return NextResponse.json({ success: false, message: '대상 거래를 찾을 수 없습니다.' }, { status: 404, headers })

    const effectiveAccountId = accountId || Number(bankRow.account_id || 0)

    if (action !== 'delete') {
      if (!effectiveAccountId) return NextResponse.json({ success: false, message: '계좌를 선택하세요.' }, { status: 400, headers })
      if (!amount || amount <= 0) return NextResponse.json({ success: false, message: '금액을 입력해 주세요.' }, { status: 400, headers })
      if (!/^\d{4}-\d{2}-\d{2}$/.test(transDate)) return NextResponse.json({ success: false, message: '날짜 형식이 올바르지 않습니다.' }, { status: 400, headers })
    }

    const category = mapToWithdrawalCategory(categoryMain, categorySub || 'normal')
    if (action !== 'delete') {
      if (!category) return NextResponse.json({ success: false, message: '출금 유형을 확인해 주세요.' }, { status: 400, headers })
      const bankCat = mapToBankTransactionCategory(category)
      const purchaseGuard = assertPurchasePaymentViaExpenseOnly(bankCat)
      if (!purchaseGuard.ok) {
        return NextResponse.json({ success: false, message: purchaseGuard.message }, { status: 400, headers })
      }
      if (['expense', 'expense_advance'].includes(category) && !accountSubjectId) {
        return NextResponse.json({ success: false, message: '계정과목을 선택해 주세요.' }, { status: 400, headers })
      }
      if (category === 'transfer' && !accountSubjectId) {
        return NextResponse.json({ success: false, message: '이체 계정과목을 선택해 주세요.' }, { status: 400, headers })
      }
      if (accountSubjectId) {
        const hdr = await assertAccountSubjectNotHeader(accountSubjectId)
        if (!hdr.ok) {
          return NextResponse.json({ success: false, message: hdr.message }, { status: hdr.status, headers })
        }
      }
    }

    const transTypeLower = String(bankRow.trans_type || '').toLowerCase()

    if (action === 'delete') {
      if (!['deposit', 'withdraw'].includes(transTypeLower)) {
        return NextResponse.json({ success: false, message: '입금·출금 거래만 삭제할 수 있습니다.' }, { status: 400, headers })
      }

      const linkedPayables = (await supabaseSelectFilter(
        'payable_transactions',
        `bank_transaction_id=eq.${bankTransactionId}`,
        { limit: 20, select: 'id,expense_accrual_id' }
      )) as PayableRow[] | null

      if ((linkedPayables || []).some((p) => Number(p.expense_accrual_id || 0) > 0)) {
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

      if (transTypeLower === 'deposit') {
        const recvRows = (await supabaseSelectFilter('receivable_transactions', `bank_transaction_id=eq.${bankTransactionId}`, {
          limit: 20,
          select: 'id,ref_type,ref_id',
        })) as { id?: number; ref_type?: string | null; ref_id?: number | null }[] | null
        const blockedRecv = (recvRows || []).some((row) => {
          const rid = Number(row.ref_id || 0)
          if (rid > 0) return true
          const rt = String(row.ref_type || '')
          if (rt === 'Order') return true
          return false
        })
        if (blockedRecv) {
          return NextResponse.json(
            { success: false, message: '주문·기타 원장과 연결된 미수금 입금은 삭제할 수 없습니다.' },
            { status: 400, headers }
          )
        }
      }

      await assertAccountingDateOpen(String(bankRow.trans_date || '').slice(0, 10))
      await supabaseDeleteByFilter('payable_transactions', `bank_transaction_id=eq.${bankTransactionId}&expense_accrual_id=is.null`)
      if (transTypeLower === 'deposit') {
        await supabaseDeleteByFilter('receivable_transactions', `bank_transaction_id=eq.${bankTransactionId}`)
      }
      await deleteJournalEntriesBySource('bank_transaction', bankTransactionId, {
        memoIncludes: ['통장 거래 자동분개'],
      })
      await supabaseDeleteByFilter('bank_transactions', `id=eq.${bankTransactionId}`)
      return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
    }

    if (transTypeLower !== 'withdraw') {
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

    const bankCategory = mapToBankTransactionCategory(category!)
    const existingNote = String(bankRow.note || '')
    const composedNote = composeBankNoteWithCategoryAndOptionalAccrualPrefix(existingNote, memo, category!)
    const patch: Record<string, unknown> = {
      account_id: effectiveAccountId,
      trans_date: transDate,
      amount: -amount,
      memo: memo || null,
      category: bankCategory,
      note: composedNote,
      store: storeName || null,
      expense_date: transDate,
      vendor_code: vendorCode || null,
      account_subject_id: accountSubjectId,
    }
    if (invoiceReceived !== undefined) patch.invoice_received = invoiceReceived
    patch.invoice_no = invoiceNo || null
    patch.invoice_photo_url = invoicePhotoUrl || null
    await supabaseUpdate('bank_transactions', bankTransactionId, patch)

    return NextResponse.json({ success: true, message: '수정되었습니다.' }, { headers })
  } catch (e) {
    console.error('updateExpenseRegisterItem:', e)
    const raw = e instanceof Error ? e.message : '수정 실패'
    const message =
      raw === 'ACCOUNTING_PERIOD_CLOSED' ? '마감된 회계기간의 거래는 삭제할 수 없습니다.' : raw
    return NextResponse.json({ success: false, message }, { status: 500, headers })
  }
}

