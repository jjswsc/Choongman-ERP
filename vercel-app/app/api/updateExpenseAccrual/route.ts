import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { extractAnyMissingColumn } from '@/lib/supabase-pgrst204-retry'
import { assertAccountSubjectNotHeader } from '@/lib/account-subject-header-guard'
import {
  assertAccountingDateOpen,
  deleteJournalEntriesBySource,
  postExpenseAccrualJournal,
} from '@/lib/accounting-posting'
import { expenseAccrualNetPayable } from '@/lib/expense-accrual-net'
import { deleteExpenseAccrualInputVatLedger, syncExpenseAccrualInputVatLedger } from '@/lib/expense-input-vat-ledger'
import { normalizeExpenseAttachmentUrlsInput } from '@/lib/expense-attachment-urls'
import {
  canDeleteExpenseAccrual,
  canEditExpenseAccrualClassification,
  canEditExpenseAccrualPlan,
  canMutateExpenseAccrualRecord,
  shouldLockExpenseAccrualAmounts,
} from '@/lib/expense-accrual-approve-policy'
import { requireAuth } from '@/lib/verify-auth'
import {
  invoiceReceivedFromDocumentType,
  parseExpenseDocumentTypeInput,
} from '@/lib/expense-document-type'
import { syncVendorBankFromExpense } from '@/lib/expense-vendor-bank-sync'

type ExpenseAccrualRow = {
  id?: number
  status?: string
  payee_code?: string
  store_name?: string | null
  amount?: number
  vat_amount?: number | null
  withholding_tax_amount?: number | null
  expense_date?: string
  due_date?: string | null
  memo?: string | null
  account_subject_id?: number | null
  created_by?: string | null
  payee_name?: string | null
}

type PayableRow = {
  id?: number
  amount?: number
  bank_transaction_id?: number | null
  petty_cash_transaction_id?: number | null
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

function encodePayeeCode(payeeCode: string, withdrawalCategory: string): string {
  let base = String(payeeCode || '').trim()
  if (base.includes('::wm::')) base = base.split('::wm::')[0].trim()
  const cat = String(withdrawalCategory || '').trim().toLowerCase() || 'expense'
  if (!base) return `auto_${cat}::wm::${cat}`
  return `${base}::wm::${cat}`
}

function mapMainSubToCategory(main: string, sub: string): string {
  const m = String(main || '').toLowerCase()
  const s = String(sub || '').toLowerCase()
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
  return ''
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const authResult = await requireAuth(request, 'any')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      authResult.errorResponse.headers.set('Content-Type', 'application/json')
      return authResult.errorResponse
    }
    const body = await request.json()
    // JWT role 우선 (본사·회계). body.userRole은 폴백만.
    const effectiveRole = String(authResult.auth.role || body.userRole || body.user_role || '').trim()

    const expenseAccrualId = Number(body.expenseAccrualId || body.expense_accrual_id || 0)
    const action = String(body.action || 'update').trim().toLowerCase() // update | delete
    if (!expenseAccrualId) {
      return NextResponse.json({ success: false, message: '지급 예정 ID가 필요합니다.' }, { status: 400, headers })
    }
    if (!['update', 'delete'].includes(action)) {
      return NextResponse.json({ success: false, message: 'action은 update 또는 delete 이어야 합니다.' }, { status: 400, headers })
    }
    if (!canMutateExpenseAccrualRecord(effectiveRole)) {
      return NextResponse.json(
        { success: false, message: '본사 또는 회계 권한이 필요합니다.' },
        { status: 403, headers }
      )
    }

    const rows = (await supabaseSelectFilter('expense_accruals', `id=eq.${expenseAccrualId}`, {
      select: 'id,status,payee_code,store_name,amount,expense_date,due_date,memo,account_subject_id,created_by,payee_name,vat_amount,withholding_tax_amount',
      limit: 1,
    })) as ExpenseAccrualRow[] | null
    const row = rows?.[0]
    if (!row?.id) {
      return NextResponse.json({ success: false, message: '지급 예정 데이터를 찾을 수 없습니다.' }, { status: 404, headers })
    }
    const status = String(row.status || '').toLowerCase()
    const rowStoreName = String(row.store_name ?? '').trim()

    const payableForEdit = (await supabaseSelectFilter('payable_transactions', `expense_accrual_id=eq.${expenseAccrualId}`, {
      select: 'id,amount,bank_transaction_id,petty_cash_transaction_id',
      limit: 50,
    })) as PayableRow[] | null
    let paidAmountForEdit = 0
    let hasPaymentLink = false
    for (const tx of payableForEdit || []) {
      const a = Number(tx.amount || 0)
      if (a < 0) paidAmountForEdit += Math.abs(a)
      if (Number(tx.bank_transaction_id || 0) > 0 || Number(tx.petty_cash_transaction_id || 0) > 0) {
        hasPaymentLink = true
      }
    }

    if (action === 'delete') {
      if (
        !canDeleteExpenseAccrual({
          userRole: effectiveRole,
          storeName: rowStoreName,
          status,
          paidAmount: paidAmountForEdit,
          hasPaymentLink,
        })
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              '삭제할 수 없습니다. 통장·패티 연결 또는 실지급이 있으면 삭제할 수 없습니다. 매장 건은 승인 권한(본사·회계)이 필요합니다. 본사 명의 건은 임원만 삭제할 수 있습니다.',
          },
          { status: 403, headers }
        )
      }
    } else if (!canEditExpenseAccrualPlan({ status, paidAmount: paidAmountForEdit })) {
      // 이미 지급·연결된 건: 금액·일자는 잠그고 계정과목·유형·지급처·메모만 허용
      if (!canEditExpenseAccrualClassification({ status })) {
        return NextResponse.json({ success: false, message: '승인 전(요청) 상태에서만 수정할 수 있습니다.' }, { status: 400, headers })
      }
    }

    const paidLocked =
      action !== 'delete' &&
      shouldLockExpenseAccrualAmounts({
        status,
        paidAmount: paidAmountForEdit,
        hasPaymentLink,
      })

    if (action === 'delete' || !paidLocked) {
      await assertAccountingDateOpen(String(row.expense_date || '').slice(0, 10))
    }

    if (action === 'delete') {
      await deleteExpenseAccrualInputVatLedger(expenseAccrualId)
      await deleteJournalEntriesBySource('expense_accrual', expenseAccrualId)
      await supabaseDeleteByFilter('payable_transactions', `expense_accrual_id=eq.${expenseAccrualId}`)
      await supabaseDeleteByFilter('expense_accruals', `id=eq.${expenseAccrualId}`)
      return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
    }

    const amountRaw = Math.abs(Number(body.amount || 0))
    const vatAmountRaw = Math.max(0, Math.abs(Number(body.vatAmount ?? body.vat_amount ?? 0) || 0))
    const withholdingTaxAmountRaw = Math.max(
      0,
      Math.abs(Number(body.withholdingTaxAmount ?? body.withholding_tax_amount ?? 0) || 0)
    )
    const expenseDateRaw = String(body.expenseDate || body.expense_date || '').slice(0, 10)
    const dueDateRawInput = String(body.dueDate || body.due_date || '').trim()
    const dueDateRaw = dueDateRawInput ? dueDateRawInput.slice(0, 10) : null

    // 지급 완료 건: 금액·발생일 변경은 차단(또는 무시)하고 분류 필드만 반영
    const amount = paidLocked ? Math.abs(Number(row.amount || 0)) : amountRaw
    const vatAmount = paidLocked
      ? Math.max(0, Math.abs(Number(row.vat_amount || 0) || 0))
      : vatAmountRaw
    const withholdingTaxAmount = paidLocked
      ? Math.max(0, Math.abs(Number(row.withholding_tax_amount || 0) || 0))
      : withholdingTaxAmountRaw
    const expenseDate = paidLocked
      ? String(row.expense_date || '').slice(0, 10)
      : expenseDateRaw
    const dueDate = paidLocked
      ? (String(row.due_date || '').slice(0, 10) || null)
      : dueDateRaw

    const netPayable = expenseAccrualNetPayable(amount, withholdingTaxAmount)
    const memo = String(body.memo || '').trim()
    const payeeCodeInput = String(body.payeeCode || body.payee_code || '').trim()
    let payeeName = String(body.payeeName || body.payee_name || '').trim()
    const storeName = String(body.storeName || body.store_name || '').trim()
    const accountSubjectIdRaw = body.accountSubjectId ?? body.account_subject_id
    const accountSubjectId = accountSubjectIdRaw != null && !isNaN(Number(accountSubjectIdRaw))
      ? Number(accountSubjectIdRaw)
      : null
    const withdrawalCategoryDirect = String(
      body.withdrawalCategory || body.withdrawal_category || ''
    ).trim().toLowerCase()
    const categoryMain = String(body.categoryMain || body.category_main || '').trim().toLowerCase()
    const categorySub = String(body.categorySub || body.category_sub || 'normal').trim().toLowerCase()
    const withdrawalCategoryInput = withdrawalCategoryDirect
      || (categoryMain ? mapMainSubToCategory(categoryMain, categorySub) : '')

    if (!amount || amount <= 0) {
      return NextResponse.json({ success: false, message: '금액을 입력해 주세요.' }, { status: 400, headers })
    }
    if (netPayable <= 0) {
      return NextResponse.json(
        {
          success: false,
          message: '실제 지급액이 0 이하입니다. 총액(세금포함)이 원천징수 이상인지 확인해 주세요.',
        },
        { status: 400, headers }
      )
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
      return NextResponse.json({ success: false, message: '비용 발생일 형식이 올바르지 않습니다.' }, { status: 400, headers })
    }
    if (!paidLocked) {
      await assertAccountingDateOpen(expenseDate)
    }
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return NextResponse.json({ success: false, message: '지급예정일 형식이 올바르지 않습니다.' }, { status: 400, headers })
    }

    if (accountSubjectId) {
      const hdr = await assertAccountSubjectNotHeader(accountSubjectId)
      if (!hdr.ok) {
        return NextResponse.json({ success: false, message: hdr.message }, { status: hdr.status, headers })
      }
    }

    const decoded = decodePayeeCode(row.payee_code)
    const payeeCode = payeeCodeInput || decoded.payeeCode
    if (payeeCode) {
      const vendorRows = (await supabaseSelectFilter('vendors', `code=eq.${payeeCode}`, {
        select: 'code,name',
        limit: 1,
      })) as { code?: string; name?: string }[] | null
      const vendorName = String(vendorRows?.[0]?.name || '').trim()
      if (vendorName) payeeName = vendorName
    }
    if (!payeeName) payeeName = payeeCode
    const withdrawalCategory =
      withdrawalCategoryInput && ['expense', 'expense_advance', 'purchase_payment', 'purchase_advance', 'fixed_asset', 'transfer', 'transfer_to_petty', 'bank_card_bill', 'loan_repayment', 'loan_given', 'tax_vat', 'tax_withholding', 'tax_corporate', 'correction', 'dividend'].includes(withdrawalCategoryInput)
        ? withdrawalCategoryInput
        : decoded.withdrawalCategory
    const encodedPayeeCode = encodePayeeCode(payeeCode, withdrawalCategory)

    const hasAttachmentField =
      Object.prototype.hasOwnProperty.call(body, 'attachmentUrls') ||
      Object.prototype.hasOwnProperty.call(body, 'attachment_urls')
    let attachmentUrlsSerialized: string | null | undefined = undefined
    if (hasAttachmentField) {
      const raw = (body as Record<string, unknown>).attachmentUrls ?? (body as Record<string, unknown>).attachment_urls
      const attachmentResult = normalizeExpenseAttachmentUrlsInput(raw)
      if (!attachmentResult.ok) {
        return NextResponse.json({ success: false, message: attachmentResult.message }, { status: 400, headers })
      }
      attachmentUrlsSerialized = attachmentResult.json
    }
    const invoiceReceived = body.invoiceReceived ?? body.invoice_received
    const documentTypeParsed = parseExpenseDocumentTypeInput(
      (body as { documentType?: unknown; document_type?: unknown }).documentType ??
        (body as { documentType?: unknown; document_type?: unknown }).document_type
    )
    const invoiceNoRaw = body.invoiceNo ?? body.invoice_no
    const invoicePhotoRaw = body.invoicePhotoUrl ?? body.invoice_photo_url ?? body.invoice_photo

    const accrualPatch: Record<string, unknown> = {
      payee_code: encodedPayeeCode,
      payee_name: payeeName || payeeCode || null,
      amount,
      vat_amount: vatAmount > 0 ? vatAmount : null,
      withholding_tax_amount: withholdingTaxAmount > 0 ? withholdingTaxAmount : null,
      expense_date: expenseDate,
      due_date: dueDate,
      memo: memo || null,
      store_name: storeName || null,
      account_subject_id: accountSubjectId,
      updated_at: new Date().toISOString(),
    }
    if (attachmentUrlsSerialized !== undefined) {
      accrualPatch.attachment_urls = attachmentUrlsSerialized
    }
    if (documentTypeParsed !== undefined) {
      accrualPatch.document_type = documentTypeParsed
      accrualPatch.invoice_received =
        typeof invoiceReceived === 'boolean'
          ? invoiceReceived
          : invoiceReceivedFromDocumentType(documentTypeParsed)
    } else if (typeof invoiceReceived === 'boolean') {
      accrualPatch.invoice_received = invoiceReceived
      if (invoiceReceived) accrualPatch.document_type = 'tax_invoice'
    }
    if (invoiceNoRaw !== undefined) accrualPatch.invoice_no = String(invoiceNoRaw || '').trim() || null
    if (invoicePhotoRaw !== undefined) {
      accrualPatch.invoice_photo_url = String(invoicePhotoRaw || '').trim() || null
    }

    const hasPayeeBankField =
      Object.prototype.hasOwnProperty.call(body, 'payeeAccountHolder') ||
      Object.prototype.hasOwnProperty.call(body, 'payee_account_holder') ||
      Object.prototype.hasOwnProperty.call(body, 'payeeBankName') ||
      Object.prototype.hasOwnProperty.call(body, 'payee_bank_name') ||
      Object.prototype.hasOwnProperty.call(body, 'payeeBankAccountNo') ||
      Object.prototype.hasOwnProperty.call(body, 'payee_bank_account_no')
    let syncedBankName = ''
    let syncedBankAcct = ''
    if (hasPayeeBankField) {
      const holder = String(
        (body as { payeeAccountHolder?: unknown; payee_account_holder?: unknown }).payeeAccountHolder ??
          (body as { payeeAccountHolder?: unknown; payee_account_holder?: unknown }).payee_account_holder ??
          ''
      ).trim()
      const bankName = String(
        (body as { payeeBankName?: unknown; payee_bank_name?: unknown }).payeeBankName ??
          (body as { payeeBankName?: unknown; payee_bank_name?: unknown }).payee_bank_name ??
          ''
      ).trim()
      const bankAcct = String(
        (body as { payeeBankAccountNo?: unknown; payee_bank_account_no?: unknown }).payeeBankAccountNo ??
          (body as { payeeBankAccountNo?: unknown; payee_bank_account_no?: unknown }).payee_bank_account_no ??
          ''
      ).trim()
      // 빈 값은 null 로 저장 → 조회 시 거래처 마스터 fallback 허용
      accrualPatch.payee_account_holder = holder || null
      accrualPatch.payee_bank_name = bankName || null
      accrualPatch.payee_bank_account_no = bankAcct || null
      syncedBankName = bankName
      syncedBankAcct = bankAcct
    }

    let bankFieldsSkipped = false
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        await supabaseUpdate('expense_accruals', expenseAccrualId, accrualPatch)
        break
      } catch (updErr) {
        const missing = extractAnyMissingColumn(updErr)
        if (!missing || !(missing in accrualPatch)) throw updErr
        delete accrualPatch[missing]
        if (missing.startsWith('payee_')) bankFieldsSkipped = true
        if (attempt === 7) throw updErr
      }
    }

    const bankIdsToSync = new Set<number>()
    for (const p of payableForEdit || []) {
      if (!p.id) continue
      const a = Number(p.amount || 0)
      const bankId = Number(p.bank_transaction_id || 0)
      if (bankId > 0) bankIdsToSync.add(bankId)
      if (a > 0) {
        if (!paidLocked) {
          await supabaseUpdate('payable_transactions', p.id, {
            vendor_code: payeeCode || null,
            amount: netPayable,
            trans_date: expenseDate,
            memo: memo ? `지출발생: ${memo.slice(0, 200)}` : '지출발생',
            account_subject_id: accountSubjectId,
            expense_date: expenseDate,
            due_date: dueDate,
          })
        } else {
          await supabaseUpdate('payable_transactions', p.id, {
            vendor_code: payeeCode || null,
            account_subject_id: accountSubjectId,
            memo: memo ? `지출발생: ${memo.slice(0, 200)}` : '지출발생',
          })
        }
      } else {
        await supabaseUpdate('payable_transactions', p.id, {
          vendor_code: payeeCode || null,
          account_subject_id: accountSubjectId,
        })
      }
    }

    const bankCategoryFromWithdrawal =
      withdrawalCategory === 'purchase_payment' || withdrawalCategory === 'purchase_advance'
        ? 'purchase_payment'
        : withdrawalCategory === 'expense' || withdrawalCategory === 'expense_advance' || withdrawalCategory === 'fixed_asset'
          ? 'expense'
          : null
    for (const bankId of bankIdsToSync) {
      const bankPatch: Record<string, unknown> = {
        vendor_code: payeeCode || null,
        account_subject_id: accountSubjectId,
        note: memo || null,
      }
      if (bankCategoryFromWithdrawal) bankPatch.category = bankCategoryFromWithdrawal
      await supabaseUpdate('bank_transactions', bankId, bankPatch)
    }

    let subjectCode = withdrawalCategory === 'fixed_asset' ? '1490' : '5520'
    let subjectName = withdrawalCategory === 'fixed_asset' ? '기타유형자산' : '기타경비'
    if (accountSubjectId && Number(accountSubjectId) > 0) {
      const subjectRows = (await supabaseSelectFilter(
        'account_subjects',
        `id=eq.${accountSubjectId}`,
        { select: 'id,code,name', limit: 1 }
      )) as { id?: number; code?: string; name?: string }[] | null
      if (subjectRows?.[0]?.code) subjectCode = String(subjectRows[0].code)
      if (subjectRows?.[0]?.name) subjectName = String(subjectRows[0].name)
    }
    // 지급 완료·연결 건은 발생 분개를 다시 지우지 않음(마감·정산 분개와 충돌 → 저장 실패)
    if (!paidLocked) {
      const finalAmount = Number(amount || row.amount || 0)
      try {
        await deleteJournalEntriesBySource('expense_accrual', expenseAccrualId)
        await postExpenseAccrualJournal({
          expenseAccrualId,
          accountingDate: expenseDate,
          amountAbs: Math.abs(finalAmount),
          expenseAccountCode: subjectCode,
          expenseAccountName: subjectName,
          expenseAccountSubjectId: accountSubjectId,
          memo: memo || String(row.memo || '') || `지출 발생 ${payeeName || row.payee_name || payeeCode}`,
          storeName: storeName || String(row.store_name || '') || undefined,
          postedBy: String(row.created_by || '').trim() || undefined,
        })
      } catch (postingErr) {
        console.error('updateExpenseAccrual reposting:', postingErr)
        const postingMsg = postingErr instanceof Error ? postingErr.message : '분개 재처리 실패'
        const closed = postingMsg === 'ACCOUNTING_PERIOD_CLOSED'
        return NextResponse.json(
          {
            success: false,
            message: closed ? '마감된 회계기간의 거래는 수정할 수 없습니다.' : postingMsg,
          },
          { status: closed ? 400 : 500, headers }
        )
      }
    }

    try {
      await syncExpenseAccrualInputVatLedger(expenseAccrualId)
    } catch (vatLedgerErr) {
      console.error('updateExpenseAccrual vat input ledger:', vatLedgerErr)
    }

    if (withholdingTaxAmount > 0) {
      try {
        const { syncTaxWithholdingLedgerForExpenseAccrual } = await import('@/lib/tax-ledger-auto-sync')
        await syncTaxWithholdingLedgerForExpenseAccrual(expenseAccrualId)
      } catch (whtErr) {
        console.error('updateExpenseAccrual wht ledger:', whtErr)
      }
    }

    let vendorSyncWarning: string | null = null
    if (!bankFieldsSkipped && hasPayeeBankField && (syncedBankName || syncedBankAcct)) {
      const sync = await syncVendorBankFromExpense({
        payeeCode,
        bankName: syncedBankName,
        bankAccountNo: syncedBankAcct,
      })
      vendorSyncWarning = sync.warning
    }

    const baseMessage = bankFieldsSkipped
      ? '수정되었습니다. 이체 계좌 컬럼이 없어 계좌는 저장되지 않았습니다. sql/expense_payee_bank_transfer_fields.sql 을 실행해 주세요.'
      : '수정되었습니다.'

    return NextResponse.json(
      {
        success: true,
        message: vendorSyncWarning ? `${baseMessage} ${vendorSyncWarning}` : baseMessage,
        ...(bankFieldsSkipped ? { bankFieldsSkipped: true } : {}),
        ...(vendorSyncWarning ? { vendorSyncWarning } : {}),
      },
      { headers }
    )
  } catch (e) {
    console.error('updateExpenseAccrual:', e)
    const raw = e instanceof Error ? e.message : '처리 실패'
    const closed = raw === 'ACCOUNTING_PERIOD_CLOSED'
    return NextResponse.json(
      {
        success: false,
        message: closed ? '마감된 회계기간의 거래는 수정할 수 없습니다.' : raw,
      },
      { status: closed ? 400 : 500, headers }
    )
  }
}

