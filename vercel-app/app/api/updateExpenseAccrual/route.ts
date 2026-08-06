import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
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
  canEditExpenseAccrualPlan,
  canMutateExpenseAccrualRecord,
} from '@/lib/expense-accrual-approve-policy'
import { requireAuth } from '@/lib/verify-auth'
import {
  invoiceReceivedFromDocumentType,
  parseExpenseDocumentTypeInput,
} from '@/lib/expense-document-type'

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
    await assertAccountingDateOpen(String(row.expense_date || '').slice(0, 10))
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
              '삭제할 수 없습니다. 요청·반려·승인(미지급·미연결)만 가능하며, 매장 건은 승인 권한(본사·회계)이 필요합니다. 본사 명의 건은 임원만 삭제할 수 있습니다.',
          },
          { status: 403, headers }
        )
      }
    } else if (!canEditExpenseAccrualPlan({ status, paidAmount: paidAmountForEdit })) {
      if (!(status === 'paid' || status === 'done' || paidAmountForEdit > 0.005)) {
        return NextResponse.json({ success: false, message: '승인 전(요청) 상태에서만 수정할 수 있습니다.' }, { status: 400, headers })
      }
      // 이미 지급된 건: 금액·일자는 잠그고 계정과목·유형·지급처·메모만 허용 (지급예정↔지출검색 수정 루프 해소)
    }

    const paidLocked =
      status === 'paid' || status === 'done' || paidAmountForEdit > 0.005

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
    await assertAccountingDateOpen(expenseDate)
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
    await supabaseUpdate('expense_accruals', expenseAccrualId, accrualPatch)

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

    let subjectCode = '5520'
    let subjectName = '기타경비'
    if (accountSubjectId && Number(accountSubjectId) > 0) {
      const subjectRows = (await supabaseSelectFilter(
        'account_subjects',
        `id=eq.${accountSubjectId}`,
        { select: 'id,code,name', limit: 1 }
      )) as { id?: number; code?: string; name?: string }[] | null
      if (subjectRows?.[0]?.code) subjectCode = String(subjectRows[0].code)
      if (subjectRows?.[0]?.name) subjectName = String(subjectRows[0].name)
    }
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
      return NextResponse.json(
        { success: false, message: postingErr instanceof Error ? postingErr.message : '분개 재처리 실패' },
        { status: 500, headers }
      )
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

    return NextResponse.json({ success: true, message: '수정되었습니다.' }, { headers })
  } catch (e) {
    console.error('updateExpenseAccrual:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}

