import { NextRequest, NextResponse } from 'next/server'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { supabaseInsert, supabaseUpdate } from '@/lib/supabase-server'
import { assertWithdrawalManagementPurchaseBlocked } from '@/lib/bank-expense-via-expense-mgmt'
import {
  postWithdrawalJournal,
  type WithdrawalCategory,
} from '@/lib/accounting-posting'
import { assertAccountSubjectNotHeader } from '@/lib/account-subject-header-guard'
import { syncPettyCashInvoiceEvidence } from '@/lib/petty-cash-invoice-sync'
import { requireAuth } from '@/lib/verify-auth'

const INTERNAL_BANK_SOURCE_MARKER = 'source:expense_internal'

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

/** 출금 관리 5가지 유형 실행: 매입대금, 경비, 자산취득, 자금이동, 자본거래 */
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
    const _userStore = String(auth.store || '').trim()

    const paymentMethod = String(body.paymentMethod || body.payment_method || 'bank').toLowerCase()
    const amount = Math.abs(Number(body.amount || 0))
    const transDate = String(body.transDate || body.trans_date || getBangkokTodayDateString()).slice(0, 10)
    const memo = String(body.memo || '').trim()
    const storeName = String(body.storeName || body.store_name || '').trim()

    const categoryMain = String(body.categoryMain || body.category_main || '').toLowerCase()
    const categorySub = String(body.categorySub || body.category_sub || '').toLowerCase()

    if (amount <= 0) {
      return NextResponse.json({ success: false, message: '금액을 입력해 주세요.' }, { status: 400, headers })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transDate)) {
      return NextResponse.json({ success: false, message: '날짜 형식이 올바르지 않습니다.' }, { status: 400, headers })
    }
    if (!['bank', 'petty'].includes(paymentMethod)) {
      return NextResponse.json({ success: false, message: '지급 수단은 bank 또는 petty 입니다.' }, { status: 400, headers })
    }

    const vendorCode = String(body.vendorCode || body.vendor_code || '').trim()
    const accountSubjectId = body.accountSubjectId ?? body.account_subject_id
    const invoiceReceived = body.invoiceReceived ?? body.invoice_received
    const invoiceNo = String(body.invoiceNo || body.invoice_no || '').trim()
    const invoicePhotoUrl = String(body.invoicePhotoUrl || body.invoice_photo_url || '').trim()
    const vatAmount = Math.max(0, Math.abs(Number(body.vatAmount ?? body.vat_amount ?? 0) || 0))
    const accountSubjectCode = String(body.accountSubjectCode || '').trim()
    const accountSubjectName = String(body.accountSubjectName || '').trim()
    const transferToAccountId = body.transferToAccountId ?? body.transfer_to_account_id
    const transferToAccountNo = String(body.transferToAccountNo || body.transfer_to_account_no || '').trim()
    const transferBankAccountNo = String(body.transferBankAccountNo || body.transfer_bank_account_no || '').trim()
    const transferBankRecipientName = String(body.transferBankRecipientName || body.transfer_bank_recipient_name || '').trim()
    const _transferToType = String(body.transferToType || body.transfer_to_type || 'bank').toLowerCase()
    const transferToPettyStore = String(body.transferToPettyStore || body.transfer_to_petty_store || '').trim()
    const transferToCardAccountId = body.transferToCardAccountId ?? body.transfer_to_card_account_id
    const assetName = String(body.assetName || body.asset_name || '').trim()
    const assetCode = String(body.assetCode || body.asset_code || '').trim()
    const usefulLifeMonths = Math.max(1, Math.min(600, Number(body.usefulLifeMonths || body.useful_life_months) || 60))
    const residualRate = Math.min(100, Math.max(0, Number(body.residualRate || body.residual_rate) || 0))

    let category = mapToWithdrawalCategory(categoryMain, categorySub)
    const paymentIsBankOrCard = paymentMethod === 'bank' || paymentMethod === 'card'
    if (category === 'transfer' && paymentIsBankOrCard && transferToCardAccountId) {
      category = 'transfer_to_card'
    } else if (category === 'transfer' && paymentMethod === 'bank' && transferBankAccountNo && transferBankRecipientName) {
      category = 'transfer_external'
    } else if (category === 'transfer' && paymentMethod === 'petty') {
      category = 'transfer_from_petty'
    }
    if (!category) {
      return NextResponse.json({ success: false, message: '출금 유형을 선택해 주세요.' }, { status: 400, headers })
    }

    const purchaseGuard = assertWithdrawalManagementPurchaseBlocked(category)
    if (!purchaseGuard.ok) {
      return NextResponse.json({ success: false, message: purchaseGuard.message }, { status: 400, headers })
    }

    if (['purchase_payment', 'purchase_advance'].includes(category) && !vendorCode) {
      return NextResponse.json({ success: false, message: '거래처를 선택해 주세요.' }, { status: 400, headers })
    }
    if (['expense', 'expense_advance'].includes(category) && !accountSubjectId && !accountSubjectCode) {
      return NextResponse.json({ success: false, message: '계정과목을 선택해 주세요.' }, { status: 400, headers })
    }
    if (category === 'transfer_to_card' && !transferToCardAccountId) {
      return NextResponse.json({ success: false, message: '충전할 카드를 선택해 주세요.' }, { status: 400, headers })
    }
    if (category === 'transfer_external' && (!transferBankAccountNo || !transferBankRecipientName)) {
      return NextResponse.json({ success: false, message: '계좌번호와 받는 사람을 입력해 주세요.' }, { status: 400, headers })
    }
    if (category === 'transfer_from_petty' && !transferToAccountId && !transferToAccountNo) {
      return NextResponse.json({ success: false, message: '입금할 통장 계좌를 선택하거나 계좌번호를 입력해 주세요.' }, { status: 400, headers })
    }
    if (category === 'fixed_asset' && !assetName && !memo) {
      return NextResponse.json({ success: false, message: '자산명 또는 적요를 입력해 주세요.' }, { status: 400, headers })
    }

    if (accountSubjectId != null && !isNaN(Number(accountSubjectId))) {
      const hdr = await assertAccountSubjectNotHeader(Number(accountSubjectId))
      if (!hdr.ok) {
        return NextResponse.json({ success: false, message: hdr.message }, { status: hdr.status, headers })
      }
    }

    const store = storeName || '본사'
    let bankTransactionId: number | null = null
    let pettyCashTransactionId: number | null = null
    let fixedAssetId: number | null = null

    if (paymentMethod === 'bank') {
      const accountId = Number(body.accountId || body.account_id || 0)
      if (!accountId) {
        return NextResponse.json({ success: false, message: '통장 출금은 계좌를 선택하세요.' }, { status: 400, headers })
      }

      const bankCategory = mapToBankTransactionCategory(category)
      const row: Record<string, unknown> = {
        account_id: accountId,
        trans_date: transDate,
        trans_type: 'withdraw',
        amount: -amount,
        memo: memo || null,
        note: `withdrawal_category:${category};${INTERNAL_BANK_SOURCE_MARKER}`,
        store: store || null,
        user_name: userName || null,
        user_employee_id: userEmployeeId,
        user_employee_code: userEmployeeCode,
        category: bankCategory,
        expense_date: transDate,
      }
      if (vendorCode) row.vendor_code = vendorCode
      if (accountSubjectId != null) row.account_subject_id = Number(accountSubjectId)
      if (typeof invoiceReceived === 'boolean') row.invoice_received = invoiceReceived
      if (invoiceNo) row.invoice_no = invoiceNo
      if (invoicePhotoUrl) row.invoice_photo_url = invoicePhotoUrl
      if (category === 'transfer_external') {
        const extMemo = [memo, `받는사람: ${transferBankRecipientName}`, `계좌: ${transferBankAccountNo}`].filter(Boolean).join(' / ')
        row.memo = extMemo
      } else if (transferToAccountId != null && category === 'transfer') {
        row.transfer_to_account_id = Number(transferToAccountId)
      }

      const inserted = await insertBankTransactionWithIdentityFallback(row)
      bankTransactionId = Number(inserted?.[0]?.id || 0) || null

      if (category === 'transfer' && transferToAccountId) {
        await insertBankTransactionWithIdentityFallback({
          account_id: Number(transferToAccountId),
          trans_date: transDate,
          trans_type: 'deposit',
          amount: amount,
          memo: memo ? `이체입금: ${memo.slice(0, 200)}` : '이체입금',
          note: `withdrawal_transfer_from:${accountId};${INTERNAL_BANK_SOURCE_MARKER}`,
          store: store || null,
          user_name: userName || null,
          user_employee_id: userEmployeeId,
          user_employee_code: userEmployeeCode,
          category: 'correction',
        })
      }
      if (category === 'transfer_to_petty' && transferToPettyStore) {
        await insertPettyTransactionWithIdentityFallback({
          store: transferToPettyStore,
          trans_date: transDate,
          trans_type: 'replenish',
          amount: amount,
          memo: memo ? `통장이체: ${memo.slice(0, 200)}` : '통장이체',
          user_name: userName || null,
          user_employee_id: userEmployeeId,
          user_employee_code: userEmployeeCode,
        })
      }
      if (category === 'transfer_to_card' && transferToCardAccountId && bankTransactionId) {
        await supabaseInsert('card_transactions', {
          card_account_id: Number(transferToCardAccountId),
          trans_date: transDate,
          trans_type: 'charge',
          amount,
          memo: memo ? `통장이체: ${memo.slice(0, 200)}` : '통장이체',
          bank_transaction_id: bankTransactionId,
        })
      }
      // 매입 대금은 지출관리 → 지급예정 집행만 허용 (executeExpensePayment)
    } else {
      const pettyStore = store || '본사'
      const row: Record<string, unknown> = {
        store: pettyStore,
        trans_date: transDate,
        trans_type: 'expense',
        amount: -amount,
        memo: memo || null,
        user_name: userName || null,
        user_employee_id: userEmployeeId,
        user_employee_code: userEmployeeCode,
      }
      if (accountSubjectId != null) row.account_subject_id = Number(accountSubjectId)
      if (vendorCode) row.vendor_code = vendorCode
      if (typeof invoiceReceived === 'boolean') row.invoice_received = invoiceReceived
      if (invoiceNo) row.invoice_no = invoiceNo
      if (invoicePhotoUrl) row.invoice_photo_url = invoicePhotoUrl
      if (vatAmount > 0) row.vat_amount = vatAmount

      const inserted = await insertPettyTransactionWithIdentityFallback(row)
      pettyCashTransactionId = Number(inserted?.[0]?.id || 0) || null

      const skipPettyVat =
        category === 'purchase_payment' || category === 'purchase_advance'
      if (pettyCashTransactionId && !skipPettyVat) {
        try {
          await syncPettyCashInvoiceEvidence(pettyCashTransactionId, { skipPurchasePayment: skipPettyVat })
        } catch (vatErr) {
          console.error('executeWithdrawal petty vat ledger:', vatErr)
        }
      }

      if (category === 'transfer_from_petty' && transferToAccountId) {
        await insertBankTransactionWithIdentityFallback({
          account_id: Number(transferToAccountId),
          trans_date: transDate,
          trans_type: 'deposit',
          amount: amount,
          memo: memo ? `패티이체입금: ${memo.slice(0, 200)}` : '패티이체입금',
          note: `withdrawal_transfer_from_petty:${pettyStore};${INTERNAL_BANK_SOURCE_MARKER}`,
          store: store || null,
          user_name: userName || null,
          user_employee_id: userEmployeeId,
          user_employee_code: userEmployeeCode,
          category: 'correction',
        })
      }
      if (category === 'transfer_from_petty' && transferToAccountNo && !transferToAccountId) {
        const enhancedMemo = memo ? `${memo} [입금계좌: ${transferToAccountNo}]` : `입금계좌: ${transferToAccountNo}`
        await supabaseUpdate('petty_cash_transactions', Number(inserted?.[0]?.id), { memo: enhancedMemo })
      }

      if (category === 'purchase_payment' && vendorCode && pettyCashTransactionId) {
        await supabaseInsert('payable_transactions', {
          vendor_code: vendorCode,
          amount: -amount,
          ref_type: 'Payment',
          ref_id: null,
          trans_date: transDate,
          memo: memo ? `패티 지급: ${memo.slice(0, 200)}` : '패티 지급',
          petty_cash_transaction_id: pettyCashTransactionId,
        })
      }

      if (category === 'fixed_asset') {
        const faCode = assetCode || `FA-${Date.now()}`
        const faInserted = (await supabaseInsert('fixed_assets', {
          asset_code: faCode,
          name: assetName || memo || '고정자산',
          store_name: store,
          acquisition_date: transDate,
          acquisition_cost: amount,
          residual_rate: residualRate,
          useful_life_months: usefulLifeMonths,
          depreciation_method: 'straight_line',
          status: 'active',
          memo: memo || null,
        })) as { id?: number }[]
        fixedAssetId = Number(faInserted?.[0]?.id || 0) || null
      }
    }

    if (category === 'fixed_asset' && !fixedAssetId) {
      const faCode = assetCode || `FA-${Date.now()}`
      const faInserted = (await supabaseInsert('fixed_assets', {
        asset_code: faCode,
        name: assetName || memo || '고정자산',
        store_name: store,
        acquisition_date: transDate,
        acquisition_cost: amount,
        residual_rate: residualRate,
        useful_life_months: usefulLifeMonths,
        depreciation_method: 'straight_line',
        status: 'active',
        memo: memo || null,
      })) as { id?: number }[]
      fixedAssetId = Number(faInserted?.[0]?.id || 0) || null
      if (fixedAssetId && bankTransactionId) {
        await supabaseUpdate('bank_transactions', bankTransactionId, { fixed_asset_id: fixedAssetId })
      }
    }

    try {
      await postWithdrawalJournal({
        sourceType: paymentMethod === 'bank' ? 'bank_transaction' : 'petty_cash',
        sourceId: paymentMethod === 'bank' ? bankTransactionId : pettyCashTransactionId,
        category,
        accountingDate: transDate,
        amountAbs: amount,
        memo: memo || undefined,
        storeName: store || undefined,
        postedBy: userName || undefined,
        expenseAccountCode: accountSubjectCode || undefined,
        expenseAccountName: accountSubjectName || undefined,
        expenseAccountSubjectId:
          accountSubjectId != null && !isNaN(Number(accountSubjectId)) ? Number(accountSubjectId) : undefined,
        transferToAccountId: category === 'transfer' ? transferToAccountId : undefined,
        transferToPettyStore: category === 'transfer_to_petty' ? transferToPettyStore : undefined,
        transferToCardAccountId: category === 'transfer_to_card' ? transferToCardAccountId : undefined,
        transferFromPettyToAccountId: category === 'transfer_from_petty' ? transferToAccountId : undefined,
        transferExternalRecipientName: category === 'transfer_external' ? transferBankRecipientName : undefined,
      })
    } catch (postingErr) {
      console.error('executeWithdrawal posting:', postingErr)
    }

    return NextResponse.json({
      success: true,
      message: '등록되었습니다.',
      bankTransactionId: bankTransactionId ?? undefined,
      pettyCashTransactionId: pettyCashTransactionId ?? undefined,
      fixedAssetId: fixedAssetId ?? undefined,
    }, { headers })
  } catch (e) {
    console.error('executeWithdrawal:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}

function mapToWithdrawalCategory(main: string, sub: string): WithdrawalCategory | null {
  const m = main.toLowerCase()
  const s = sub.toLowerCase()
  if (m === 'purchase' || m === '매입') {
    return s === 'advance' || s === '선급' ? 'purchase_advance' : 'purchase_payment'
  }
  if (m === 'expense' || m === '경비') {
    return s === 'advance' || s === '선급' ? 'expense_advance' : 'expense'
  }
  if (m === 'fixed_asset' || m === '자산') return 'fixed_asset'
  if (m === 'transfer' || m === '이체') return 'transfer'
  if (m === 'loan' || m === '대출') {
    return s === 'given' || s === '대여' ? 'loan_given' : 'loan_repayment'
  }
  if (m === 'loan_repayment') return 'loan_repayment'
  if (m === 'loan_given') return 'loan_given'
  if (m === 'tax' || m === '세금') {
    if (s === 'vat' || s === '부가세') return 'tax_vat'
    if (s === 'corporate' || s === '법인세') return 'tax_corporate'
    return 'tax_withholding'
  }
  if (m === 'correction' || m === '정정') return 'correction'
  if (m === 'dividend' || m === '자본') return 'dividend'
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
