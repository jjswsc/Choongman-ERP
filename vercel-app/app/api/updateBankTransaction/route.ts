import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpdate, supabaseSelectFilter, supabaseDeleteByFilter } from '@/lib/supabase-server'
import { assertAccountSubjectNotHeader } from '@/lib/account-subject-header-guard'
import {
  deleteReceivableFromBankReceive,
  syncPayableLedgerAfterBankWithdrawCategoryChange,
  upsertReceivableFromBankReceive,
} from '@/lib/receivable-payable'
import { shouldSkipBankAutoJournal } from '@/lib/bank-expense-via-expense-mgmt'
import { syncTaxWithholdingLedgerForBankTransaction } from '@/lib/tax-ledger-auto-sync'
import {
  extractExpenseAccrualPrefix,
  extractWithdrawalCategoryFromNote,
  mergeWithdrawalCategoryIntoBankNote,
} from '@/lib/bank-transaction-note-meta'
import {
  assertAccountingDateOpen,
  deleteJournalEntriesBySource,
  postBankTransactionJournal,
} from '@/lib/accounting-posting'
import {
  assertBankNotUsedByChannelSettlement,
  assertPosRevenueDepositCategorySafe,
  isBankSettlementGuardError,
} from '@/lib/bank-settlement-guards'

/** 통장 거래 수정 (용도, 계정과목, 상세내용, 인식일, 거래처, 매장 등) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const bankTxId = Number(body.bankTransactionId ?? body.id ?? body.bankTxId)
    const category = body.category
    const accountSubjectId = body.accountSubjectId ?? body.account_subject_id
    const note = body.note
    const salesDate = body.salesDate ?? body.sales_date
    const expenseDate = body.expenseDate ?? body.expense_date
    const vendorCode = body.vendorCode ?? body.vendor_code
    const storeName = body.storeName ?? body.store_name
    const refType = body.refType ?? body.ref_type
    const refId = body.refId ?? body.ref_id
    const withholdingTaxAmount = body.withholdingTaxAmount ?? body.withholding_tax_amount
    const withholdingTaxRate = body.withholdingTaxRate ?? body.withholding_tax_rate

    if (!bankTxId || isNaN(bankTxId)) {
      return NextResponse.json({ success: false, message: '통장 거래 ID가 필요합니다.' }, { status: 400, headers })
    }

    const existing = (await supabaseSelectFilter('bank_transactions', `id=eq.${bankTxId}`, { limit: 1 })) as {
      id?: number
      trans_type?: string
      category?: string
      trans_date?: string
      amount?: number
      memo?: string
      note?: string
      store?: string
      store_name?: string
      user_name?: string
      account_subject_id?: number | null
      vendor_code?: string | null
    }[]
    if (!existing?.length) {
      return NextResponse.json({ success: false, message: '해당 통장 거래가 없습니다.' }, { status: 404, headers })
    }

    const transType = String(existing[0].trans_type || 'withdraw').toLowerCase()
    const transDate = String(existing[0].trans_date || '').slice(0, 10)
    await assertAccountingDateOpen(transDate)
    const depositCategories = ['revenue_delivery', 'revenue_card', 'revenue_qr', 'revenue_cash', 'receivable_receive', 'correction', 'loan', 'advance', 'unclassified']
    const withdrawCategories = ['transfer', 'expense', 'fixed', 'purchase_payment', 'correction', 'loan', 'advance', 'unclassified']
    const prevCategory = String(existing[0].category || '').toLowerCase()

    const patch: Record<string, unknown> = {}

    if (category !== undefined) {
      const requested = String(category).toLowerCase()
      let validCategory = transType === 'deposit'
        ? (depositCategories.includes(String(category).toLowerCase()) ? String(category).toLowerCase() : existing[0].category)
        : (withdrawCategories.includes(String(category).toLowerCase()) ? String(category).toLowerCase() : existing[0].category)
      if (transType === 'withdraw' && validCategory === 'fixed') {
        validCategory = 'expense'
        patch.fixed_expense_id = null
      }
      patch.category = validCategory
    }
    if (accountSubjectId !== undefined) {
      const asid = accountSubjectId ? Number(accountSubjectId) : null
      if (asid && !isNaN(asid)) {
        const hdr = await assertAccountSubjectNotHeader(asid)
        if (!hdr.ok) {
          return NextResponse.json({ success: false, message: hdr.message }, { status: hdr.status, headers })
        }
      }
      patch.account_subject_id = asid && !isNaN(asid) ? asid : null
    }
    if (note !== undefined) {
      const newDisplay = String(note || '').trim()
      const prevNote = String(existing[0].note || '')
      const cat = extractWithdrawalCategoryFromNote(prevNote)
      if (cat) {
        const prefix = extractExpenseAccrualPrefix(prevNote)
        const body = mergeWithdrawalCategoryIntoBankNote(newDisplay, cat)
        patch.note = prefix ? `${prefix}${body}` : body
      } else {
        patch.note = newDisplay || null
      }
    }
    if (transType === 'deposit' && salesDate !== undefined) {
      const sd = String(salesDate || '').slice(0, 10)
      patch.sales_date = /^\d{4}-\d{2}-\d{2}$/.test(sd) ? sd : null
    }
    if (transType === 'withdraw' && expenseDate !== undefined) {
      const ed = String(expenseDate || '').slice(0, 10)
      patch.expense_date = /^\d{4}-\d{2}-\d{2}$/.test(ed) ? ed : null
    }
    const finalCategory = (patch.category as string) ?? existing[0].category
    const finalCategoryLower = String(finalCategory || '').toLowerCase()
    const finalStoreName = storeName !== undefined ? String(storeName || '').trim() || null : (existing[0].store_name ?? null)
    const finalAccountSubjectId =
      patch.account_subject_id !== undefined
        ? (patch.account_subject_id as number | null)
        : (existing[0].account_subject_id ?? null)
    let withdrawHasLinkedPayment = false
    if (transType === 'withdraw' && vendorCode !== undefined && finalCategoryLower !== 'purchase_payment') {
      const linkedRows = (await supabaseSelectFilter(
        'payable_transactions',
        `bank_transaction_id=eq.${bankTxId}&ref_type=eq.Payment`,
        { limit: 1, select: 'id' }
      )) as { id?: number }[]
      withdrawHasLinkedPayment = Boolean(linkedRows?.length)
    }
    if (
      transType === 'withdraw' &&
      vendorCode !== undefined &&
      (finalCategoryLower === 'purchase_payment' || withdrawHasLinkedPayment)
    ) {
      patch.vendor_code = String(vendorCode || '').trim() || null
    }
    if (finalCategory === 'receivable_receive' && storeName !== undefined) {
      patch.store_name = finalStoreName
    }
    if (finalCategoryLower === 'advance') {
      if (storeName !== undefined) {
        patch.store_name = String(storeName || '').trim() || null
      }
      if (vendorCode !== undefined) {
        patch.vendor_code = String(vendorCode || '').trim() || null
      }
    }
    if (refType !== undefined) {
      const rt = String(refType || '').trim()
      patch.ref_type = rt || null
    }
    if (refId !== undefined) {
      const rid = refId != null && refId !== '' && !isNaN(Number(refId)) ? Number(refId) : null
      patch.ref_id = rid != null && rid > 0 ? rid : null
    }
    if (transType === 'deposit' && withholdingTaxAmount !== undefined) {
      const wht = Math.max(0, Number(withholdingTaxAmount) || 0)
      patch.withholding_tax_amount = wht > 0 ? wht : null
    }
    if (transType === 'deposit' && withholdingTaxRate !== undefined) {
      const rate = Number(withholdingTaxRate)
      patch.withholding_tax_rate =
        Number.isFinite(rate) && rate > 0 ? rate : null
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: true, message: '변경 사항 없음' }, { headers })
    }

    if (transType === 'deposit') {
      const nextCat = String(finalCategory || '').toLowerCase()
      try {
        if (nextCat === 'receivable_receive') {
          await assertBankNotUsedByChannelSettlement(bankTxId)
        } else {
          const posStore =
            finalStoreName ||
            String(existing[0].store_name || '').trim() ||
            String(existing[0].store || '').trim()
          await assertPosRevenueDepositCategorySafe({
            storeName: posStore,
            category: nextCat,
            accountSubjectId:
              finalAccountSubjectId != null && Number(finalAccountSubjectId) > 0
                ? Number(finalAccountSubjectId)
                : null,
          })
        }
      } catch (e) {
        if (isBankSettlementGuardError(e)) {
          return NextResponse.json({ success: false, message: e.message, code: e.code }, { status: 409, headers })
        }
        throw e
      }
    }

    await supabaseUpdate('bank_transactions', bankTxId, patch)

    if (transType === 'deposit') {
      try {
        await syncTaxWithholdingLedgerForBankTransaction(bankTxId)
      } catch (whtErr) {
        console.warn('updateBankTransaction WHT sync:', whtErr)
      }
    }

    // 매출 수령(미수금) 연동: receivable_transactions 생성/삭제
    if (transType === 'deposit') {
      const transDate = String((patch.trans_date as string) ?? existing[0].trans_date ?? '').slice(0, 10)
      const amount = Math.abs(Number(existing[0].amount) ?? 0)
      const memo = String(existing[0].memo || '').trim()

      if (prevCategory === 'receivable_receive' && (finalCategory !== 'receivable_receive' || !finalStoreName)) {
        // 매출 수령 → 다른 용도로 변경, 또는 매장 미선택: 기존 미수금 수령 건 삭제
        await deleteReceivableFromBankReceive({
          bankTransactionId: bankTxId,
          storeName: String(existing[0].store_name || '').trim() || finalStoreName || null,
          amountAbs: amount,
          transDate,
          memo: memo ? `통장 수령: ${memo.slice(0, 200)}` : '통장 수령',
        })
      }
      if (finalCategory === 'receivable_receive' && finalStoreName) {
        await upsertReceivableFromBankReceive({
          bankTransactionId: bankTxId,
          storeName: finalStoreName,
          amountAbs: amount,
          transDate,
          memo: memo ? `통장 수령: ${memo.slice(0, 200)}` : '통장 수령',
        })
      }
    }

    // 매입 지급(미지급): purchase_payment·지출관리 연동 통장 모두 거래처 변경 시 payable·지급예정 동기화
    if (transType === 'withdraw') {
      const bankMemo = String(existing[0].memo || '').trim()
      await syncPayableLedgerAfterBankWithdrawCategoryChange({
        bankTransactionId: bankTxId,
        prevCategory: prevCategory,
        nextCategory: finalCategoryLower,
        vendorCode:
          patch.vendor_code !== undefined
            ? String(patch.vendor_code || '').trim() || null
            : String(existing[0].vendor_code || '').trim() || null,
        amountAbs: Math.abs(Number(existing[0].amount) || 0),
        transDate,
        bankMemo,
      })
    }

    try {
      await deleteJournalEntriesBySource('bank_transaction', bankTxId, {
        memoIncludes: ['통장 거래 자동분개'],
      })
      const skipAutoJournal = shouldSkipBankAutoJournal(String(finalCategory || ''), transType)
      if (!skipAutoJournal) {
        await postBankTransactionJournal({
          bankTransactionId: bankTxId,
          transDate,
          transType: transType === 'deposit' ? 'deposit' : 'withdraw',
          amountAbs: Math.abs(Number(existing[0].amount) || 0),
          category: String(finalCategory || ''),
          memo: String(existing[0].memo || '').trim() || String(existing[0].note || '').trim() || undefined,
          storeName: String(existing[0].store || '').trim() || undefined,
          postedBy: String(existing[0].user_name || '').trim() || undefined,
          accountSubjectId: finalAccountSubjectId,
        })
      }
    } catch (postingErr) {
      console.error('updateBankTransaction reposting:', postingErr)
      return NextResponse.json(
        { success: false, message: postingErr instanceof Error ? postingErr.message : '분개 재처리 실패' },
        { status: 500, headers }
      )
    }

    return NextResponse.json({ success: true, message: '저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('updateBankTransaction:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
