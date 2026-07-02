import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert } from '@/lib/supabase-server'
import { postBankTransactionJournal } from '@/lib/accounting-posting'
import { assertAccountSubjectNotHeader } from '@/lib/account-subject-header-guard'
import { reserveRequestIdempotencyKey } from '@/lib/request-idempotency'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { requireAuth } from '@/lib/verify-auth'
import {
  upsertPayableFromBankPurchasePayment,
  upsertReceivableFromBankReceive,
} from '@/lib/receivable-payable'
import { syncTaxWithholdingLedgerForBankTransaction } from '@/lib/tax-ledger-auto-sync'
import {
  assertPosRevenueDepositCategorySafe,
  isBankSettlementGuardError,
} from '@/lib/bank-settlement-guards'

function isMissingIdentityColumnError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('user_employee_id') || msg.includes('user_employee_code')
}

function stripIdentityColumns<T extends Record<string, unknown>>(row: T): T {
  const next = { ...row }
  delete next.user_employee_id
  delete next.user_employee_code
  return next
}

/** 통장 거래 등록 (매입 대금/매출 수령 시 미지급금/미수금 자동 연동) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      authResult.errorResponse.headers.set('Content-Type', 'application/json')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const body = await request.json()
    const userRole = String(auth.role || '').trim()
    const userStore = String(auth.store || '').trim()
    const allowedStores = Array.from(
      new Set(
        [...(Array.isArray(auth.allowedStores) ? auth.allowedStores : []), userStore]
          .map((s) => String(s || '').trim())
          .filter(Boolean)
      )
    )
    const isScopedRole = !isOfficeRole(userRole) && !isAccountingRole(userRole)
    if (isScopedRole && allowedStores.length === 0) {
      return NextResponse.json({ success: false, message: '접근 가능한 매장 정보가 없습니다.' }, { status: 403, headers })
    }
    const idempotencyKey = String(
      request.headers.get('x-idempotency-key') ??
        body.idempotencyKey ??
        body.idempotency_key ??
        ''
    ).trim()
    if (idempotencyKey) {
      const duplicate = await reserveRequestIdempotencyKey({
        scope: 'addBankTransaction',
        key: idempotencyKey,
        payload: {
          accountId: body.accountId ?? body.account_id ?? null,
          transDate: body.transDate ?? body.trans_date ?? null,
          amount: body.amount ?? null,
          transType: body.transType ?? body.trans_type ?? null,
        },
      })
      if (duplicate) {
        return NextResponse.json(
          { success: true, duplicate: true, message: '이미 처리된 요청입니다.' },
          { headers }
        )
      }
    }

    const accountId = Number(body.accountId || body.account_id)
    const transDate = String(body.transDate || body.trans_date || '').slice(0, 10)
    const transType = String(body.transType || body.trans_type || 'withdraw').toLowerCase()
    const amount = Number(body.amount) || 0
    const memo = String(body.memo || '').trim()
    const note = String(body.note || '').trim()
    const requestedStore = String(body.store || '').trim()
    const store = requestedStore || userStore
    if (
      isScopedRole &&
      store &&
      !allowedStores.some((s) => storesMatchForGradeLookup(s, store))
    ) {
      return NextResponse.json({ success: false, message: '허용되지 않은 매장입니다.' }, { status: 403, headers })
    }
    const userName = String(auth.name || body.userName || body.user_name || '').trim()
    const userEmployeeId =
      auth.employeeId != null && Number.isFinite(Number(auth.employeeId))
        ? Math.floor(Number(auth.employeeId))
        : null
    const userEmployeeCode = String(auth.employeeCode || '').trim() || null
    const category = String(body.category || 'expense').toLowerCase()
    const accountSubjectId = body.accountSubjectId ?? body.account_subject_id
    const salesDate = body.salesDate ?? body.sales_date
    const expenseDate = body.expenseDate ?? body.expense_date
    const vendorCode = String(body.vendorCode || body.vendor_code || '').trim()
    let storeNameForReceivable = String(body.storeName || body.store_name || '').trim()
    if (
      isScopedRole &&
      category === 'receivable_receive' &&
      storeNameForReceivable &&
      !allowedStores.some((s) => storesMatchForGradeLookup(s, storeNameForReceivable))
    ) {
      return NextResponse.json({ success: false, message: '허용되지 않은 미수금 매장입니다.' }, { status: 403, headers })
    }
    const refType = body.refType ?? body.ref_type
    const refId = body.refId ?? body.ref_id
    const withholdingTaxAmount = body.withholdingTaxAmount ?? body.withholding_tax_amount
    const withholdingTaxRate = body.withholdingTaxRate ?? body.withholding_tax_rate

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
    let validCategory = transType === 'deposit'
      ? (depositCategories.includes(category) ? category : depositCategories[0])
      : (withdrawCategories.includes(category) ? category : 'expense')
    if (transType === 'withdraw' && validCategory === 'fixed') validCategory = 'expense'

    if (validCategory === 'purchase_payment' && !vendorCode) {
      return NextResponse.json({ success: false, message: '매입 대금은 거래처를 선택해 주세요.' }, { status: 400, headers })
    }

    if (transType === 'deposit' && validCategory !== 'receivable_receive') {
      try {
        const posStore = storeNameForReceivable || store || userStore
        await assertPosRevenueDepositCategorySafe({
          storeName: posStore,
          category: validCategory,
          accountSubjectId:
            accountSubjectId != null && !isNaN(Number(accountSubjectId))
              ? Number(accountSubjectId)
              : null,
        })
      } catch (e) {
        if (isBankSettlementGuardError(e)) {
          if (e.code === 'POS_REVENUE_DEPOSIT_DOUBLE_RISK') {
            validCategory = 'receivable_receive'
            storeNameForReceivable = storeNameForReceivable || store || userStore
          } else {
            return NextResponse.json({ success: false, message: e.message, code: e.code }, { status: 409, headers })
          }
        } else {
          throw e
        }
      }
    }

    if (transType === 'deposit' && validCategory === 'receivable_receive') {
      storeNameForReceivable = storeNameForReceivable || store || userStore
      if (!storeNameForReceivable) {
        return NextResponse.json(
          { success: false, message: '매출 수령 입금은 매장(store)을 지정해 주세요.' },
          { status: 400, headers }
        )
      }
    }

    const row: Record<string, unknown> = {
      account_id: accountId,
      trans_date: transDate,
      trans_type: transType,
      amount: amt,
      memo: memo || null,
      note: note || null,
      store: store || null,
      user_name: userName || null,
      user_employee_id: userEmployeeId,
      user_employee_code: userEmployeeCode,
      category: validCategory,
    }
    if (accountSubjectId != null && validCategory !== 'receivable_receive') {
      const asid = Number(accountSubjectId)
      if (!isNaN(asid)) {
        const hdr = await assertAccountSubjectNotHeader(asid)
        if (!hdr.ok) {
          return NextResponse.json({ success: false, message: hdr.message }, { status: hdr.status, headers })
        }
        row.account_subject_id = asid
      }
    }
    if (transType === 'deposit' && validCategory !== 'receivable_receive' && salesDate) {
      const sd = String(salesDate).slice(0, 10)
      if (/^\d{4}-\d{2}-\d{2}$/.test(sd)) row.sales_date = sd
    }
    if (transType === 'withdraw' && expenseDate) {
      const ed = String(expenseDate).slice(0, 10)
      if (/^\d{4}-\d{2}-\d{2}$/.test(ed)) row.expense_date = ed
    }
    if (validCategory === 'receivable_receive' && storeNameForReceivable) row.store_name = storeNameForReceivable
    if (validCategory === 'purchase_payment' && vendorCode) row.vendor_code = vendorCode
    if (refType) row.ref_type = refType
    if (refId != null && !isNaN(Number(refId))) row.ref_id = Number(refId)
    if (transType === 'deposit' && withholdingTaxAmount !== undefined) {
      const wht = Math.max(0, Number(withholdingTaxAmount) || 0)
      row.withholding_tax_amount = wht > 0 ? wht : null
    }
    if (transType === 'deposit' && withholdingTaxRate !== undefined) {
      const rate = Number(withholdingTaxRate)
      row.withholding_tax_rate = Number.isFinite(rate) && rate > 0 ? rate : null
    }

    let inserted: { id?: number }[] = []
    try {
      inserted = (await supabaseInsert('bank_transactions', row)) as { id?: number }[]
    } catch (e) {
      if (!isMissingIdentityColumnError(e)) throw e
      inserted = (await supabaseInsert('bank_transactions', stripIdentityColumns(row))) as { id?: number }[]
    }
    const bankId = Array.isArray(inserted) && inserted[0] ? inserted[0].id : undefined

    if (bankId && validCategory === 'receivable_receive' && storeNameForReceivable) {
      await upsertReceivableFromBankReceive({
        bankTransactionId: bankId,
        storeName: storeNameForReceivable,
        amountAbs: Math.abs(amount),
        transDate,
        memo: memo ? `통장 수령: ${memo.slice(0, 200)}` : '통장 수령',
      })
    }

    if (bankId && transType === 'withdraw' && validCategory === 'purchase_payment' && vendorCode) {
      await upsertPayableFromBankPurchasePayment({
        bankTransactionId: bankId,
        vendorCode,
        amountAbs: Math.abs(amount),
        transDate,
        memo: memo ? `통장 지급: ${memo.slice(0, 200)}` : '통장 지급',
      })
    }

    if (bankId && transType === 'deposit') {
      try {
        await syncTaxWithholdingLedgerForBankTransaction(bankId)
      } catch (whtErr) {
        console.warn('addBankTransaction WHT sync:', whtErr)
      }
    }

    const journalAccountSubjectId =
      accountSubjectId != null && !isNaN(Number(accountSubjectId)) ? Number(accountSubjectId) : null

    // 복식부기 1차: 통장 거래 자동 분개 (실패해도 원거래는 유지)
    try {
      await postBankTransactionJournal({
        bankTransactionId: bankId,
        transDate: transDate.slice(0, 10),
        transType: transType as 'deposit' | 'withdraw',
        amountAbs: Math.abs(amount),
        category: validCategory,
        memo,
        storeName: store || undefined,
        postedBy: userName || undefined,
        accountSubjectId: journalAccountSubjectId,
      })
    } catch (postingErr) {
      console.error('addBankTransaction posting:', postingErr)
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
