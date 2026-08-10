import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter, supabaseInsert, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { postPayableSettlementJournal } from '@/lib/accounting-posting'
import { expenseAccrualNetPayable } from '@/lib/expense-accrual-net'
import { evaluatePayeeBankMemoMatch } from '@/lib/expense-accrual-bank-memo-match'
import {
  isOrphanPaidExpenseAccrualStatus,
  isSettledExpensePayment,
  settledPaidAbsFromPayableRows,
} from '@/lib/expense-accrual-settlement'
import { moneyEqual, parseMoneyAmount } from '@/lib/money-amount'
import { propagateExpenseAccrualInvoiceToLinkedBank } from '@/lib/expense-accrual-invoice-sync'
import { propagateExpenseAccrualInvoiceToLinkedPetty } from '@/lib/petty-cash-invoice-sync'
import {
  buildBankLinkedPayablePaymentMemo,
  buildPettyLinkedPayablePaymentMemo,
  dedupePayablePaymentsForBankTransaction,
  dedupePayablePaymentsForExpenseAccrual,
  upsertPayableFromBankPurchasePayment,
} from '@/lib/receivable-payable'
import { registerPettyReplenishFromBankTransaction, collectLinkedBankTransactionIds } from '@/lib/petty-bank-expense-link-server'
import { registerCardExpenseFromBankTransaction } from '@/lib/card-bank-expense-link-server'
import { isPrepaymentAccrualCategory, parseCardAccountIdFromPayeeCode } from '@/lib/prepayment-accrual-categories'
import { requireAuth } from '@/lib/verify-auth'
import { resolveVendorCodeLoose } from '@/lib/vendor-code-policy'
import {
  INTERNAL_BANK_SOURCE_MARKER,
  bankCategoryForWithdrawalCategory,
  composeBankNoteForExpenseAccrualLink,
} from '@/lib/bank-transaction-note-meta'
import { allocateExpenseDocumentNo } from '@/lib/expense-document-no-server'

function isMissingIdentityColumnError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return (
    msg.includes('user_employee_id') ||
    msg.includes('user_employee_code')
  )
}

function stripIdentityColumns<T extends Record<string, unknown>>(row: T): T {
  const next = { ...row }
  delete next.user_employee_id
  delete next.user_employee_code
  return next
}

async function insertBankTransactionWithIdentityFallback(row: Record<string, unknown>) {
  try {
    return (await supabaseInsert('bank_transactions', row)) as { id?: number }[]
  } catch (e) {
    if (!isMissingIdentityColumnError(e)) throw e
    return (await supabaseInsert('bank_transactions', stripIdentityColumns(row))) as { id?: number }[]
  }
}

async function insertPettyTransactionWithIdentityFallback(row: Record<string, unknown>) {
  try {
    return (await supabaseInsert('petty_cash_transactions', row)) as { id?: number }[]
  } catch (e) {
    if (!isMissingIdentityColumnError(e)) throw e
    return (await supabaseInsert('petty_cash_transactions', stripIdentityColumns(row))) as { id?: number }[]
  }
}

async function updateBankTransactionWithIdentityFallback(id: number, row: Record<string, unknown>) {
  try {
    await supabaseUpdate('bank_transactions', id, row)
  } catch (e) {
    if (!isMissingIdentityColumnError(e)) throw e
    await supabaseUpdate('bank_transactions', id, stripIdentityColumns(row))
  }
}

type ExpenseAccrualRow = {
  id?: number
  payee_code?: string
  payee_name?: string
  amount?: number
  withholding_tax_amount?: number | null
  vat_amount?: number | null
  expense_date?: string
  due_date?: string
  memo?: string
  store_name?: string
  account_subject_id?: number
  status?: string
  invoice_received?: boolean | null
  invoice_no?: string | null
  invoice_photo_url?: string | null
  document_no?: string | null
  document_type?: string | null
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
  memo?: string
  note?: string
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
  const taxBank = bankCategoryForWithdrawalCategory(c)
  if (taxBank) return taxBank
  if (c === 'purchase_payment') return 'purchase_payment'
  if (c.includes('transfer')) return 'transfer'
  if (c.includes('loan')) return 'loan'
  if (c === 'correction') return 'correction'
  if (c.includes('advance')) return 'advance'
  return 'expense'
}

function resolveAccrualAccountSubjectId(source: ExpenseAccrualRow): number | null {
  const sid = source.account_subject_id != null ? Number(source.account_subject_id) : NaN
  return Number.isFinite(sid) && sid > 0 ? sid : null
}

/** bank_transactions에는 vat_amount 컬럼 없음 — 패티만 includeVatAmount: true */
function invoiceFieldsFromAccrual(
  source: ExpenseAccrualRow,
  options?: { includeVatAmount?: boolean }
): Record<string, unknown> {
  const vat = Math.max(0, Math.abs(Number(source.vat_amount ?? 0) || 0))
  const payeeCode = String(source.payee_code || '').split('::wm::')[0]?.trim()
  const documentType = String(source.document_type || '').trim() || null
  return {
    invoice_received: Boolean(source.invoice_received),
    invoice_no: String(source.invoice_no || '').trim() || null,
    invoice_photo_url: String(source.invoice_photo_url || '').trim() || null,
    ...(documentType ? { document_type: documentType } : {}),
    ...(options?.includeVatAmount && vat > 0 ? { vat_amount: vat } : {}),
    ...(payeeCode && !payeeCode.startsWith('auto_') ? { vendor_code: payeeCode } : {}),
  }
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')
  const authResult = await requireAuth(request, 'any')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    authResult.errorResponse.headers.set('Content-Type', 'application/json')
    return authResult.errorResponse
  }
  const auth = authResult.auth

  try {
    const body = await request.json()
    const userName = String(auth.name || body.userName || body.user_name || '').trim()
    const userEmployeeId =
      auth.employeeId != null && Number.isFinite(Number(auth.employeeId))
        ? Math.floor(Number(auth.employeeId))
        : null
    const userEmployeeCode = String(auth.employeeCode || '').trim() || null

    const expenseAccrualId = Number(body.expenseAccrualId || body.expense_accrual_id || 0)
    const paymentMethod = String(body.paymentMethod || body.payment_method || '').toLowerCase() // bank | petty
    const bankTransactionId = body.bankTransactionId ?? body.bank_transaction_id
    const amount = parseMoneyAmount(body.amount)
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
      select: 'id,payee_code,payee_name,amount,withholding_tax_amount,vat_amount,expense_date,due_date,memo,store_name,account_subject_id,status,invoice_received,invoice_no,invoice_photo_url,document_no,document_type',
      limit: 1,
    })) as ExpenseAccrualRow[] | null
    const source = accrual?.[0]
    if (!source?.id) {
      return NextResponse.json({ success: false, message: '지출 발생 데이터를 찾을 수 없습니다.' }, { status: 404, headers })
    }
    let documentNo = String(source.document_no || '').trim() || null
    if (!documentNo) {
      try {
        documentNo = await allocateExpenseDocumentNo(source.expense_date || transDate)
        await supabaseUpdate('expense_accruals', expenseAccrualId, { document_no: documentNo })
      } catch (docErr) {
        console.error('executeExpensePayment document_no:', docErr)
      }
    }
    const accrualStatus = String(source.status || '').toLowerCase()
    if (accrualStatus === 'rejected') {
      return NextResponse.json({ success: false, message: '반려된 지급 예정은 집행할 수 없습니다.' }, { status: 400, headers })
    }
    if (accrualStatus === 'planned') {
      return NextResponse.json({ success: false, message: '관리자 승인 후 집행할 수 있습니다.' }, { status: 400, headers })
    }

    const existingPaymentRows = (await supabaseSelectFilter(
      'payable_transactions',
      `expense_accrual_id=eq.${expenseAccrualId}&ref_type=eq.Payment`,
      { select: 'id,amount,bank_transaction_id,petty_cash_transaction_id', limit: 50 }
    )) as {
      id?: number
      amount?: number
      bank_transaction_id?: number | null
      petty_cash_transaction_id?: number | null
    }[] | null

    const settledExisting = (existingPaymentRows || []).filter((row) => isSettledExpensePayment(row))
    if (settledExisting.length > 0) {
      return NextResponse.json(
        { success: false, message: '이미 미지급에 지급(Payment) 행이 등록된 지급예정입니다. 중복 집행할 수 없습니다.' },
        { status: 400, headers }
      )
    }

    // 통장·패티 없이 paid 만 찍힌 고아 건은 재연결 허용. 고아 Payment 행은 정리.
    if (accrualStatus === 'paid' || accrualStatus === 'done') {
      if (!isOrphanPaidExpenseAccrualStatus(accrualStatus, settledExisting.length > 0)) {
        return NextResponse.json({ success: false, message: '이미 지급 완료된 건입니다.' }, { status: 400, headers })
      }
    } else if (accrualStatus !== 'approved' && accrualStatus !== 'partial') {
      return NextResponse.json({ success: false, message: '승인 상태를 확인할 수 없습니다.' }, { status: 400, headers })
    }

    for (const row of existingPaymentRows || []) {
      const id = Number(row.id || 0)
      if (id <= 0 || isSettledExpensePayment(row)) continue
      await supabaseDeleteByFilter('payable_transactions', `id=eq.${id}`)
    }

    const paidRows = (await supabaseSelectFilter(
      'payable_transactions',
      `expense_accrual_id=eq.${expenseAccrualId}`,
      { select: 'amount,expense_accrual_id,bank_transaction_id,petty_cash_transaction_id', limit: 5000 }
    )) as {
      amount?: number
      expense_accrual_id?: number
      bank_transaction_id?: number | null
      petty_cash_transaction_id?: number | null
    }[] | null
    const paidAmount = settledPaidAbsFromPayableRows(paidRows || [])
    const wht = Math.max(0, Math.abs(Number(source.withholding_tax_amount ?? 0) || 0))
    const plannedAmount = expenseAccrualNetPayable(parseMoneyAmount(source.amount), wht)
    const remaining = Math.max(0, plannedAmount - paidAmount)
    if (!moneyEqual(amount, remaining)) {
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
    const isPrepay = isPrepaymentAccrualCategory(withdrawalCategory)
    if (isPrepay && paymentMethod !== 'bank') {
      return NextResponse.json(
        { success: false, message: '전도금 보충·카드 대금 청구는 통장 연동으로만 집행할 수 있습니다.' },
        { status: 400, headers }
      )
    }
    const bankCategory = mapWithdrawalCategoryToBankCategory(withdrawalCategory)
    const note = `expense_accrual_id:${expenseAccrualId};withdrawal_category:${withdrawalCategory}`
    let vendorCode =
      payeeCode && !payeeCode.startsWith('auto_') && !payeeCode.startsWith('card_') ? payeeCode.trim() : ''
    if (!isPrepay) {
      if (!vendorCode) {
        vendorCode =
          (await resolveVendorCodeLoose(payeeCode)) ||
          (await resolveVendorCodeLoose(source.payee_name))
      }
      if (!vendorCode) {
        return NextResponse.json(
          {
            success: false,
            message:
              '거래처 코드가 없습니다. 지급 예정의 지급처를 거래처 마스터에 등록·연결한 뒤 다시 시도해 주세요.',
          },
          { status: 400, headers }
        )
      }
    } else {
      vendorCode = String(source.store_name || payeeCode || '').trim() || `prepay_${withdrawalCategory}`
    }
    const paymentMemo = memo || `지출 지급(${source.payee_name || payeeCode})`
    const accrualAccountSubjectId = resolveAccrualAccountSubjectId(source)
    /** 기존 통장 출금 연결 시 은행 적요 — 미지급 지급 행 표시 기준 */
    let linkedBankMemo = ''

    if (paymentMethod === 'bank') {
      const existingBankId = bankTransactionId != null ? Number(bankTransactionId) : null

      if (withdrawalCategory === 'transfer_to_petty') {
        const pettyStore = store || String(source.store_name || '').trim()
        if (!pettyStore) {
          return NextResponse.json({ success: false, message: '패티캐시 매장을 선택해 주세요.' }, { status: 400, headers })
        }
        if (existingBankId && !isNaN(existingBankId)) {
          const bankRows = (await supabaseSelectFilter('bank_transactions', `id=eq.${existingBankId}`, { limit: 1 })) as BankTxRow[] | null
          const bankRow = bankRows?.[0]
          if (!bankRow?.id) {
            return NextResponse.json({ success: false, message: '선택한 통장 거래를 찾을 수 없습니다.' }, { status: 404, headers })
          }
          if (String(bankRow.trans_type || '').toLowerCase() !== 'withdraw') {
            return NextResponse.json({ success: false, message: '출금 거래만 연결할 수 있습니다.' }, { status: 400, headers })
          }
          const bankAmount = parseMoneyAmount(bankRow.amount)
          const bankDate = String(bankRow.trans_date || '').slice(0, 10)
          if (!moneyEqual(bankAmount, amount)) {
            return NextResponse.json(
              { success: false, message: `금액이 일치하지 않습니다. (통장: ${bankAmount.toLocaleString()}, 지급: ${amount.toLocaleString()})` },
              { status: 400, headers }
            )
          }
          if (bankDate !== transDate) {
            return NextResponse.json(
              { success: false, message: `날짜가 일치하지 않습니다. (통장: ${bankDate}, 지급: ${transDate})` },
              { status: 400, headers }
            )
          }
          const linkedIds = await collectLinkedBankTransactionIds()
          if (linkedIds.has(existingBankId)) {
            return NextResponse.json({ success: false, message: '이미 연결된 통장 출금입니다.' }, { status: 400, headers })
          }
          linkedBankMemo = String(bankRow.memo || '').trim()
          const reg = await registerPettyReplenishFromBankTransaction({
            bankTransactionId: existingBankId,
            store: pettyStore,
            memo: paymentMemo,
            postedBy: userName || undefined,
            userEmployeeId,
            userEmployeeCode,
            fromExpenseAccrualId: expenseAccrualId,
          })
          if (!reg.ok) {
            return NextResponse.json({ success: false, message: reg.message }, { status: reg.status || 400, headers })
          }
          pettyId = reg.id
          bankId = existingBankId
        } else {
          const accountId = Number(body.accountId || body.account_id || 0)
          if (!accountId) {
            return NextResponse.json({ success: false, message: '통장 지급은 계좌를 선택해 주세요.' }, { status: 400, headers })
          }
          const inserted = (await insertBankTransactionWithIdentityFallback({
            account_id: accountId,
            trans_date: transDate,
            trans_type: 'withdraw',
            amount: -Math.abs(amount),
            memo: paymentMemo,
            note: `${note};${INTERNAL_BANK_SOURCE_MARKER}`,
            store: pettyStore,
            user_name: userName || null,
            user_employee_id: userEmployeeId,
            user_employee_code: userEmployeeCode,
            category: bankCategory,
            expense_date: transDate,
            ...(documentNo ? { document_no: documentNo } : {}),
          })) as { id?: number }[]
          bankId = Number(inserted?.[0]?.id || 0) || null
          if (!bankId) {
            return NextResponse.json({ success: false, message: '통장 출금 등록에 실패했습니다.' }, { status: 500, headers })
          }
          const reg = await registerPettyReplenishFromBankTransaction({
            bankTransactionId: bankId,
            store: pettyStore,
            memo: paymentMemo,
            postedBy: userName || undefined,
            userEmployeeId,
            userEmployeeCode,
            fromExpenseAccrualId: expenseAccrualId,
          })
          if (!reg.ok) {
            return NextResponse.json({ success: false, message: reg.message }, { status: reg.status || 400, headers })
          }
          pettyId = reg.id
        }
      } else if (withdrawalCategory === 'bank_card_bill') {
        const cardAccountId = parseCardAccountIdFromPayeeCode(payeeCode)
        if (!cardAccountId) {
          return NextResponse.json({ success: false, message: '카드 정보가 없습니다. 지급예정을 다시 확인해 주세요.' }, { status: 400, headers })
        }
        if (existingBankId && !isNaN(existingBankId)) {
          const bankRows = (await supabaseSelectFilter('bank_transactions', `id=eq.${existingBankId}`, { limit: 1 })) as BankTxRow[] | null
          const bankRow = bankRows?.[0]
          if (!bankRow?.id) {
            return NextResponse.json({ success: false, message: '선택한 통장 거래를 찾을 수 없습니다.' }, { status: 404, headers })
          }
          if (String(bankRow.trans_type || '').toLowerCase() !== 'withdraw') {
            return NextResponse.json({ success: false, message: '출금 거래만 연결할 수 있습니다.' }, { status: 400, headers })
          }
          const bankAmount = parseMoneyAmount(bankRow.amount)
          const bankDate = String(bankRow.trans_date || '').slice(0, 10)
          if (!moneyEqual(bankAmount, amount)) {
            return NextResponse.json(
              { success: false, message: `금액이 일치하지 않습니다. (통장: ${bankAmount.toLocaleString()}, 지급: ${amount.toLocaleString()})` },
              { status: 400, headers }
            )
          }
          if (bankDate !== transDate) {
            return NextResponse.json(
              { success: false, message: `날짜가 일치하지 않습니다. (통장: ${bankDate}, 지급: ${transDate})` },
              { status: 400, headers }
            )
          }
          const linkedIds = await collectLinkedBankTransactionIds()
          if (linkedIds.has(existingBankId)) {
            return NextResponse.json({ success: false, message: '이미 연결된 통장 출금입니다.' }, { status: 400, headers })
          }
          linkedBankMemo = String(bankRow.memo || '').trim()
          const reg = await registerCardExpenseFromBankTransaction({
            bankTransactionId: existingBankId,
            cardAccountId,
            memo: paymentMemo,
            postedBy: userName || undefined,
          })
          if (!reg.ok) {
            return NextResponse.json({ success: false, message: reg.message }, { status: reg.status || 400, headers })
          }
          bankId = existingBankId
          await updateBankTransactionWithIdentityFallback(bankId, {
            note: composeBankNoteForExpenseAccrualLink(
              String(bankRow.note || ''),
              expenseAccrualId,
              withdrawalCategory
            ),
            category: bankCategory,
            store: store || source.store_name || null,
            expense_date: transDate,
            ...(documentNo ? { document_no: documentNo } : {}),
          })
        } else {
          const accountId = Number(body.accountId || body.account_id || 0)
          if (!accountId) {
            return NextResponse.json({ success: false, message: '통장 지급은 계좌를 선택해 주세요.' }, { status: 400, headers })
          }
          const inserted = (await insertBankTransactionWithIdentityFallback({
            account_id: accountId,
            trans_date: transDate,
            trans_type: 'withdraw',
            amount: -Math.abs(amount),
            memo: paymentMemo,
            note: `${note};${INTERNAL_BANK_SOURCE_MARKER}`,
            store: store || source.store_name || null,
            user_name: userName || null,
            user_employee_id: userEmployeeId,
            user_employee_code: userEmployeeCode,
            category: bankCategory,
            expense_date: transDate,
            ...(documentNo ? { document_no: documentNo } : {}),
          })) as { id?: number }[]
          bankId = Number(inserted?.[0]?.id || 0) || null
          if (!bankId) {
            return NextResponse.json({ success: false, message: '통장 출금 등록에 실패했습니다.' }, { status: 500, headers })
          }
          const reg = await registerCardExpenseFromBankTransaction({
            bankTransactionId: bankId,
            cardAccountId,
            memo: paymentMemo,
            postedBy: userName || undefined,
          })
          if (!reg.ok) {
            return NextResponse.json({ success: false, message: reg.message }, { status: reg.status || 400, headers })
          }
        }
      } else if (existingBankId && !isNaN(existingBankId)) {
        const bankRows = (await supabaseSelectFilter('bank_transactions', `id=eq.${existingBankId}`, { limit: 1 })) as BankTxRow[] | null
        const bankRow = bankRows?.[0]
        if (!bankRow?.id) {
          return NextResponse.json({ success: false, message: '선택한 통장 거래를 찾을 수 없습니다.' }, { status: 404, headers })
        }
        if (String(bankRow.trans_type || '').toLowerCase() !== 'withdraw') {
          return NextResponse.json({ success: false, message: '출금 거래만 연결할 수 있습니다.' }, { status: 400, headers })
        }
        const bankAmount = parseMoneyAmount(bankRow.amount)
        const bankDate = String(bankRow.trans_date || '').slice(0, 10)
        if (!moneyEqual(bankAmount, amount)) {
          return NextResponse.json({ success: false, message: `금액이 일치하지 않습니다. (통장: ${bankAmount.toLocaleString()}, 지급: ${amount.toLocaleString()})` }, { status: 400, headers })
        }
        if (bankDate !== transDate) {
          return NextResponse.json({ success: false, message: `날짜가 일치하지 않습니다. (통장: ${bankDate}, 지급: ${transDate})` }, { status: 400, headers })
        }
        const payeeNameForMatch = String(source.payee_name || source.payee_code || '').trim()
        let vName: string | undefined
        let vGps: string | undefined
        if (vendorCode) {
          const vrows = (await supabaseSelectFilter(
            'vendors',
            `code=eq.${encodeURIComponent(String(vendorCode))}`,
            { select: 'name,gps_name', limit: 1 }
          )) as { name?: string; gps_name?: string }[] | null
          const v = vrows?.[0]
          if (v) {
            vName = String(v.name || '').trim() || undefined
            vGps = String((v as { gps_name?: string }).gps_name || '').trim() || undefined
          }
        }
        void evaluatePayeeBankMemoMatch({
          bankMemo: String(bankRow.memo || ''),
          bankNote: String(bankRow.note || ''),
          payeeName: payeeNameForMatch,
          payeeCode: String(payeeCode || ''),
          vendorName: vName,
          vendorGpsName: vGps,
        })
        // 계좌명/적요 불일치여도 지급 예정-통장 매칭은 금액·일자 기준으로 허용한다.
        const linkedPayable = (await supabaseSelectFilter('payable_transactions', `bank_transaction_id=eq.${existingBankId}`, { limit: 1 })) as { id?: number }[] | null
        if (linkedPayable?.length) {
          return NextResponse.json({ success: false, message: '이미 다른 지출/매입과 연결된 통장 거래입니다.' }, { status: 400, headers })
        }
        linkedBankMemo = String(bankRow.memo || '').trim()
        bankId = existingBankId
        await updateBankTransactionWithIdentityFallback(bankId, {
          note: composeBankNoteForExpenseAccrualLink(
            String(bankRow.note || ''),
            expenseAccrualId,
            withdrawalCategory
          ),
          category: bankCategory,
          vendor_code: vendorCode,
          expense_date: transDate,
          store: store || source.store_name || null,
          account_subject_id: accrualAccountSubjectId,
          user_employee_id: userEmployeeId,
          user_employee_code: userEmployeeCode,
          ...invoiceFieldsFromAccrual(source),
          ...(documentNo ? { document_no: documentNo } : {}),
        })
        if (!isPrepay) {
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
        }
      } else {
        const accountId = Number(body.accountId || body.account_id || 0)
        if (!accountId) {
          return NextResponse.json({ success: false, message: '통장 지급은 계좌를 선택해 주세요.' }, { status: 400, headers })
        }
        const inserted = (await insertBankTransactionWithIdentityFallback({
          account_id: accountId,
          trans_date: transDate,
          trans_type: 'withdraw',
          amount: -Math.abs(amount),
          memo: paymentMemo,
          note: `${note};${INTERNAL_BANK_SOURCE_MARKER}`,
          store: store || source.store_name || null,
          user_name: userName || null,
          user_employee_id: userEmployeeId,
          user_employee_code: userEmployeeCode,
          category: bankCategory,
          vendor_code: vendorCode,
          expense_date: transDate,
          account_subject_id: accrualAccountSubjectId,
          ...invoiceFieldsFromAccrual(source),
          ...(documentNo ? { document_no: documentNo } : {}),
        })) as { id?: number }[]
        bankId = Number(inserted?.[0]?.id || 0) || null
        if (!isPrepay) {
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
      }
    } else {
      const pettyStore = store || String(source.store_name || '').trim()
      if (!pettyStore) {
        return NextResponse.json({ success: false, message: '패티 지급은 매장을 선택해 주세요.' }, { status: 400, headers })
      }
      const inserted = (await insertPettyTransactionWithIdentityFallback({
        store: pettyStore,
        trans_date: transDate,
        trans_type: 'expense',
        amount: -Math.abs(amount),
        memo: paymentMemo,
        user_name: userName || null,
        user_employee_id: userEmployeeId,
        user_employee_code: userEmployeeCode,
        account_subject_id: accrualAccountSubjectId,
        ...invoiceFieldsFromAccrual(source, { includeVatAmount: true }),
        ...(documentNo ? { document_no: documentNo } : {}),
      })) as { id?: number }[]
      pettyId = Number(inserted?.[0]?.id || 0) || null
      if (!isPrepay) {
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
    }

    const paymentMemoLine = bankId
      ? buildBankLinkedPayablePaymentMemo({
          bankMemo: linkedBankMemo,
          fallbackDetail: paymentMemo,
        })
      : buildPettyLinkedPayablePaymentMemo(paymentMemo)
    if (bankId) {
      const upserted = await upsertPayableFromBankPurchasePayment({
        bankTransactionId: bankId,
        vendorCode,
        amountAbs: amount,
        transDate,
        memo: paymentMemoLine,
        expenseAccrualId,
        expenseDate: source.expense_date || transDate,
        dueDate: source.due_date || null,
        accountSubjectId: accrualAccountSubjectId,
      })
      const linkedCheck = upserted
        ? ((await supabaseSelectFilter(
            'payable_transactions',
            `bank_transaction_id=eq.${bankId}&expense_accrual_id=eq.${expenseAccrualId}&ref_type=eq.Payment`,
            { select: 'id', limit: 1 }
          )) as { id?: number }[] | null)
        : null
      if (!linkedCheck?.length) {
        return NextResponse.json(
          {
            success: false,
            message:
              '통장 연결 Payment 생성에 실패했습니다. 지급예정 상태가 paid 로만 남지 않도록 중단했습니다. 거래처 코드·금액을 확인 후 다시 연결해 주세요.',
          },
          { status: 500, headers }
        )
      }
    } else {
      await supabaseInsert('payable_transactions', {
        vendor_code: vendorCode,
        amount: -Math.abs(amount),
        ref_type: 'Payment',
        ref_id: null,
        trans_date: transDate,
        memo: paymentMemoLine,
        expense_accrual_id: expenseAccrualId,
        bank_transaction_id: null,
        petty_cash_transaction_id: pettyId,
        expense_date: source.expense_date || transDate,
        due_date: source.due_date || null,
        account_subject_id: accrualAccountSubjectId,
      })
    }

    const nextRemaining = Math.max(0, remaining - amount)
    await supabaseUpdate('expense_accruals', expenseAccrualId, {
      status: nextRemaining <= 0 ? 'paid' : 'approved',
      updated_at: new Date().toISOString(),
    })

    try {
      await dedupePayablePaymentsForExpenseAccrual(expenseAccrualId)
    } catch (dedupeErr) {
      console.warn('executeExpensePayment accrual payable dedupe:', dedupeErr)
    }
    if (bankId) {
      try {
        await dedupePayablePaymentsForBankTransaction(bankId)
      } catch (dedupeErr) {
        console.warn('executeExpensePayment payable dedupe:', dedupeErr)
      }
      try {
        await propagateExpenseAccrualInvoiceToLinkedBank(expenseAccrualId)
      } catch (propErr) {
        console.error('executeExpensePayment invoice propagate bank:', propErr)
      }
    }
    if (pettyId) {
      try {
        await propagateExpenseAccrualInvoiceToLinkedPetty(expenseAccrualId)
      } catch (propErr) {
        console.error('executeExpensePayment invoice propagate petty:', propErr)
      }
    }

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
