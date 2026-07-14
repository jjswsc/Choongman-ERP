import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdate,
} from '@/lib/supabase-server'
import { upsertPayableFromBankPurchasePayment, buildBankLinkedPayablePaymentMemo } from '@/lib/receivable-payable'
import {
  deleteJournalEntriesBySource,
  postExpenseAccrualJournal,
  postPayableSettlementJournal,
} from '@/lib/accounting-posting'
import { assertAccountSubjectNotHeader } from '@/lib/account-subject-header-guard'
import { syncExpenseAccrualInvoiceEvidence } from '@/lib/expense-accrual-invoice-sync'
import { vatSplitFromTaxInvoiceGross } from '@/lib/invoice-backed-input-vat-ledger'
import { requireAuth } from '@/lib/verify-auth'
import { canonicalOfficeStore } from '@/lib/office-store-canonical'

type AccountSubjectRow = { id?: number; code?: string; name?: string; name_en?: string }
type BankTxRow = {
  id?: number
  account_id?: number
  trans_date?: string
  trans_type?: string
  amount?: number
  memo?: string | null
  invoice_received?: boolean | null
  invoice_no?: string | null
  invoice_photo_url?: string | null
  store?: string | null
  store_name?: string | null
}

function invoiceFieldsFromBankRow(bankRow: BankTxRow): Record<string, unknown> {
  return {
    invoice_received: Boolean(bankRow.invoice_received),
    invoice_no: String(bankRow.invoice_no || '').trim() || null,
    invoice_photo_url: String(bankRow.invoice_photo_url || '').trim() || null,
  }
}

function resolveVatAmountFromBank(
  bankRow: BankTxRow,
  gross: number,
  body: Record<string, unknown>
): number | undefined {
  const bodyVat = body.vatAmount ?? body.vat_amount
  if (bodyVat != null && !isNaN(Number(bodyVat))) {
    const v = Math.max(0, Number(bodyVat))
    return v > 0 ? v : undefined
  }
  if (Boolean(bankRow.invoice_received) && gross > 0) {
    const { vat } = vatSplitFromTaxInvoiceGross(gross)
    return vat > 0 ? vat : undefined
  }
  return undefined
}

/** 통장 출금 거래를 지출 발생으로 등록하고 연결 */
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

  try {
    const body = await request.json()
    const userName = String(authResult.auth.name || body.userName || body.user_name || '').trim()

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

    const bankRows = (await supabaseSelectFilter('bank_transactions', `id=eq.${bankTransactionId}`, {
      limit: 1,
      select:
        'id,account_id,trans_date,trans_type,amount,memo,invoice_received,invoice_no,invoice_photo_url,store,store_name',
    })) as BankTxRow[] | null
    const bankRow = bankRows?.[0]
    if (!bankRow?.id) {
      return NextResponse.json({ success: false, message: '통장 거래를 찾을 수 없습니다.' }, { status: 404, headers })
    }
    if (String(bankRow.trans_type || '').toLowerCase() !== 'withdraw') {
      return NextResponse.json({ success: false, message: '출금 거래만 등록할 수 있습니다.' }, { status: 400, headers })
    }

    const updateExisting = Boolean(body.updateExisting ?? body.update_existing)
    const linkedPayable = (await supabaseSelectFilter('payable_transactions', `bank_transaction_id=eq.${bankTransactionId}`, {
      limit: 5,
      select: 'id,expense_accrual_id',
    })) as { id?: number; expense_accrual_id?: number }[] | null

    if (linkedPayable?.length && !updateExisting) {
      return NextResponse.json({ success: false, message: '이미 연결된 통장 거래입니다.' }, { status: 400, headers })
    }
    if (linkedPayable?.length && updateExisting) {
      const accrualId = Number(linkedPayable.find((p) => Number(p.expense_accrual_id || 0) > 0)?.expense_accrual_id || 0)
      if (accrualId) {
        const linkedAmount = Math.abs(Number(bankRow.amount || 0))
        const linkedVat = resolveVatAmountFromBank(bankRow, linkedAmount, body)
        const asId =
          accountSubjectId != null && !isNaN(Number(accountSubjectId)) ? Number(accountSubjectId) : null
        let subjectCode = '5520'
        let subjectName = '기타경비'
        if (asId) {
          const subject = (await supabaseSelectFilter('account_subjects', `id=eq.${asId}`, {
            select: 'id,code,name',
            limit: 1,
          })) as AccountSubjectRow[] | null
          if (subject?.[0]?.code) subjectCode = String(subject[0].code)
          if (subject?.[0]?.name) subjectName = String(subject[0].name)
        }
        const accrualRows = (await supabaseSelectFilter('expense_accruals', `id=eq.${accrualId}`, {
          select: 'id,store_name,expense_date,memo,payee_name,created_by,amount',
          limit: 1,
        })) as {
          id?: number
          store_name?: string | null
          expense_date?: string
          memo?: string | null
          payee_name?: string | null
          created_by?: string | null
          amount?: number
        }[] | null
        const accrualRow = accrualRows?.[0]
        const expenseDate = String(accrualRow?.expense_date || bankRow.trans_date || '').slice(0, 10)
        await supabaseUpdate('expense_accruals', accrualId, {
          payee_code: `${payeeCode}::wm::expense`,
          payee_name: payeeName || payeeCode,
          account_subject_id: asId,
          memo: memo ?? undefined,
          status: 'done',
          ...invoiceFieldsFromBankRow(bankRow),
          ...(linkedVat != null ? { vat_amount: linkedVat } : {}),
        })
        const allPayables = (await supabaseSelectFilter('payable_transactions', `expense_accrual_id=eq.${accrualId}`, {
          limit: 20,
        })) as { id?: number }[]
        for (const p of allPayables || []) {
          if (p.id) {
            await supabaseUpdate('payable_transactions', p.id, {
              vendor_code: payeeCode,
              account_subject_id: asId,
            })
          }
        }
        await supabaseUpdate('bank_transactions', bankTransactionId, {
          vendor_code: payeeCode,
          category: 'expense',
          account_subject_id: asId,
          note: memo,
        })
        try {
          await deleteJournalEntriesBySource('expense_accrual', accrualId)
          await postExpenseAccrualJournal({
            expenseAccrualId: accrualId,
            accountingDate: expenseDate,
            amountAbs: Math.abs(Number(accrualRow?.amount || linkedAmount)),
            expenseAccountCode: subjectCode,
            expenseAccountName: subjectName,
            expenseAccountSubjectId: asId,
            memo: memo || String(accrualRow?.memo || '') || `지출 발생 ${payeeName || payeeCode}`,
            storeName: String(accrualRow?.store_name || bankRow.store_name || bankRow.store || '').trim() || undefined,
            postedBy: String(accrualRow?.created_by || userName || '').trim() || undefined,
          })
          await syncExpenseAccrualInvoiceEvidence(accrualId)
        } catch (syncErr) {
          console.warn('registerExpenseFromBankTransaction updateExisting VAT/journal sync:', syncErr)
        }
        return NextResponse.json({ success: true, message: '수정되었습니다.' }, { headers })
      }
      // 매입대금 등: Payment만 있고 지출발생이 없음 → 연결 해제 후 경비로 신규 전환
      await supabaseDeleteByFilter(
        'payable_transactions',
        `bank_transaction_id=eq.${bankTransactionId}&expense_accrual_id=is.null`
      )
      try {
        await deleteJournalEntriesBySource('bank_transaction', bankTransactionId, {
          memoIncludes: ['통장 거래 자동분개', '매입', '지급'],
        })
      } catch (journalErr) {
        console.warn('registerExpenseFromBankTransaction convert clear journals:', journalErr)
      }
      // fall through: 신규 경비 등록과 동일
    }

    const amount = Math.abs(Number(bankRow.amount || 0))
    const expenseDate = String(bankRow.trans_date || '').slice(0, 10)
    const effectiveStoreName = canonicalOfficeStore(
      storeName || String(bankRow.store_name || bankRow.store || '').trim()
    ) || null
    const vatAmount = resolveVatAmountFromBank(bankRow, amount, body)
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
      store_name: effectiveStoreName,
      created_by: userName || null,
      status: 'done',
      ...invoiceFieldsFromBankRow(bankRow),
      ...(vatAmount != null ? { vat_amount: vatAmount } : {}),
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

    await upsertPayableFromBankPurchasePayment({
      bankTransactionId,
      vendorCode: payeeCode,
      amountAbs: amount,
      transDate: expenseDate,
      memo: buildBankLinkedPayablePaymentMemo({
        bankMemo: bankRow.memo,
        fallbackDetail: payeeName || payeeCode,
      }),
      expenseAccrualId,
      expenseDate,
      dueDate: expenseDate,
      accountSubjectId:
        accountSubjectId != null && !isNaN(Number(accountSubjectId)) ? Number(accountSubjectId) : null,
    })

    await supabaseUpdate('bank_transactions', bankTransactionId, {
      note: memo || null,
      category: 'expense',
      vendor_code: payeeCode,
      expense_date: expenseDate,
      store: effectiveStoreName,
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
        storeName: effectiveStoreName || undefined,
        postedBy: userName || undefined,
      })
      await postPayableSettlementJournal({
        sourceType: 'bank_transaction',
        sourceId: bankTransactionId,
        accountingDate: expenseDate,
        amountAbs: amount,
        memo: `지출 지급 ${payeeName || payeeCode}`,
        storeName: effectiveStoreName || undefined,
        postedBy: userName || undefined,
      })
      await syncExpenseAccrualInvoiceEvidence(expenseAccrualId)
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
