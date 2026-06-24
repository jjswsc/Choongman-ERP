import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter } from '@/lib/supabase-server'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { postExpenseAccrualJournal } from '@/lib/accounting-posting'
import { assertAccountSubjectNotHeader } from '@/lib/account-subject-header-guard'
import { expenseAccrualNetPayable } from '@/lib/expense-accrual-net'
import { parseMoneyAmount } from '@/lib/money-amount'
import { syncExpenseAccrualInputVatLedger } from '@/lib/expense-input-vat-ledger'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { requireAuth } from '@/lib/verify-auth'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

function callerSeesAllAccrualStores(role: string): boolean {
  return isOfficeRole(role) || isAccountingRole(role)
}

type AccountSubjectRow = { id?: number; code?: string; name?: string; name_en?: string }

function normalizeWithdrawalCategory(mainRaw: string, subRaw: string, explicitRaw: string): string {
  const explicit = String(explicitRaw || '').trim().toLowerCase()
  if (explicit) return explicit
  const main = String(mainRaw || '').trim().toLowerCase()
  const sub = String(subRaw || '').trim().toLowerCase()
  if (main === 'purchase') return sub === 'advance' ? 'purchase_advance' : 'purchase_payment'
  if (main === 'expense') return sub === 'advance' ? 'expense_advance' : 'expense'
  if (main === 'fixed_asset') return 'fixed_asset'
  if (main === 'transfer') return 'transfer'
  if (main === 'loan') return sub === 'given' ? 'loan_given' : 'loan_repayment'
  if (main === 'tax') {
    if (sub === 'vat') return 'tax_vat'
    if (sub === 'corporate') return 'tax_corporate'
    return 'tax_withholding'
  }
  if (main === 'correction') return 'correction'
  if (main === 'dividend') return 'dividend'
  return 'expense'
}

function normalizeAttachmentUrlsJson(body: { attachmentUrls?: unknown; attachment_urls?: unknown }): string | null {
  const raw = body.attachmentUrls ?? body.attachment_urls
  if (raw == null) return null
  let urls: string[] = []
  if (Array.isArray(raw)) {
    urls = raw.map((x) => String(x ?? '').trim()).filter(Boolean)
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw) as unknown
      if (Array.isArray(p)) urls = p.map((x) => String(x ?? '').trim()).filter(Boolean)
    } catch {
      return null
    }
  }
  urls = urls.slice(0, 5).map((u) => (u.length > 400_000 ? u.slice(0, 400_000) : u))
  if (urls.length === 0) return null
  const json = JSON.stringify(urls)
  return json.length > 2_000_000 ? JSON.stringify([urls[0]!.slice(0, 1_500_000)]) : json
}

function encodePayeeCode(payeeCode: string, withdrawalCategory: string): string {
  const base = String(payeeCode || '').trim()
  const cat = String(withdrawalCategory || '').trim().toLowerCase() || 'expense'
  if (!base) return `auto_${cat}::wm::${cat}`
  if (base.includes('::wm::')) return base
  return `${base}::wm::${cat}`
}

function autoPayeeNameByCategory(withdrawalCategory: string): string {
  const cat = String(withdrawalCategory || '').toLowerCase()
  const map: Record<string, string> = {
    purchase_payment: '매입 대금',
    purchase_advance: '매입 선급',
    expense: '경비',
    expense_advance: '경비 선급',
    fixed_asset: '고정자산',
    transfer: '이체',
    loan_repayment: '대출 상환',
    loan_given: '대여',
    tax_vat: '부가세',
    tax_withholding: '원천세',
    tax_corporate: '법인세',
    correction: '정정',
    dividend: '배당/사유 인출',
  }
  return map[cat] || '지출'
}

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
    const userName = String(auth.name || body.userName || body.user_name || '').trim()

    const categoryMain = String(body.categoryMain || body.category_main || '').trim().toLowerCase()
    const categorySub = String(body.categorySub || body.category_sub || '').trim().toLowerCase()
    const withdrawalCategory = normalizeWithdrawalCategory(
      categoryMain,
      categorySub,
      String(body.withdrawalCategory || body.withdrawal_category || '')
    )
    const inputPayeeCode = String(body.payeeCode || body.payee_code || body.vendorCode || body.vendor_code || '').trim()
    const inputPayeeName = String(body.payeeName || body.payee_name || '').trim()
    const payeeName = inputPayeeName || inputPayeeCode || autoPayeeNameByCategory(withdrawalCategory)
    const payeeCode = inputPayeeCode || `auto_${withdrawalCategory}`
    const encodedPayeeCode = encodePayeeCode(payeeCode, withdrawalCategory)
    const amount = parseMoneyAmount(body.amount)
    const vatAmount = Math.max(0, parseMoneyAmount(body.vatAmount ?? body.vat_amount ?? 0))
    const withholdingTaxAmount = Math.max(0, parseMoneyAmount(body.withholdingTaxAmount ?? body.withholding_tax_amount ?? 0))
    const netPayable = expenseAccrualNetPayable(amount, withholdingTaxAmount)
    const expenseDate = String(body.expenseDate || body.expense_date || getBangkokTodayDateString()).slice(0, 10)
    const dueDateRaw = String(body.dueDate || body.due_date || '').trim()
    const dueDate = dueDateRaw ? dueDateRaw.slice(0, 10) : null
    const memo = String(body.memo || '').trim()
    const storeName = String(body.storeName || body.store_name || '').trim()
    const accountSubjectId = body.accountSubjectId ?? body.account_subject_id
    const userRole = String(auth.role || '').trim()
    const callerStore = String(auth.store || '').trim()
    const allowedStores = (
      Array.isArray(auth.allowedStores) ? auth.allowedStores : []
    )
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(callerStore)

    if (!callerSeesAllAccrualStores(userRole)) {
      if (!storeName) {
        return NextResponse.json({ success: false, message: '매장을 선택해 주세요.' }, { status: 400, headers })
      }
      const storeAllowed = allowedStores.some((s) => storesMatchForGradeLookup(s, storeName))
      if (!storeAllowed) {
        return NextResponse.json(
          { success: false, message: '선택한 매장에 대한 등록 권한이 없습니다.' },
          { status: 403, headers }
        )
      }
    }

    if ((withdrawalCategory === 'purchase_payment' || withdrawalCategory === 'purchase_advance') && !inputPayeeCode) {
      return NextResponse.json({ success: false, message: '매입처를 입력해 주세요.' }, { status: 400, headers })
    }
    if ((withdrawalCategory === 'expense' || withdrawalCategory === 'expense_advance') && !inputPayeeCode && !inputPayeeName) {
      return NextResponse.json({ success: false, message: '지급처 코드/식별값을 입력해 주세요.' }, { status: 400, headers })
    }
    if (amount <= 0) {
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
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return NextResponse.json({ success: false, message: '지급예정일 형식이 올바르지 않습니다.' }, { status: 400, headers })
    }

    if (accountSubjectId != null && !isNaN(Number(accountSubjectId))) {
      const hdr = await assertAccountSubjectNotHeader(Number(accountSubjectId))
      if (!hdr.ok) {
        return NextResponse.json({ success: false, message: hdr.message }, { status: hdr.status, headers })
      }
    }

    const attachmentUrlsJson = normalizeAttachmentUrlsJson(body as { attachmentUrls?: unknown; attachment_urls?: unknown })

    const invoiceReceived = body.invoiceReceived ?? body.invoice_received
    const invoiceNoRaw = body.invoiceNo ?? body.invoice_no
    const invoicePhotoRaw = body.invoicePhotoUrl ?? body.invoice_photo_url ?? body.invoice_photo

    const accrualRow: Record<string, unknown> = {
      payee_code: encodedPayeeCode,
      payee_name: payeeName || payeeCode,
      amount,
      vat_amount: vatAmount > 0 ? vatAmount : null,
      withholding_tax_amount: withholdingTaxAmount > 0 ? withholdingTaxAmount : null,
      expense_date: expenseDate,
      due_date: dueDate,
      memo: memo || null,
      store_name: storeName || null,
      created_by: userName || null,
      status: 'planned',
      ...(attachmentUrlsJson ? { attachment_urls: attachmentUrlsJson } : {}),
    }
    if (typeof invoiceReceived === 'boolean') accrualRow.invoice_received = invoiceReceived
    if (invoiceNoRaw !== undefined) accrualRow.invoice_no = String(invoiceNoRaw || '').trim() || null
    if (invoicePhotoRaw !== undefined) {
      const photo = String(invoicePhotoRaw || '').trim()
      accrualRow.invoice_photo_url = photo || null
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
      vendor_code: payeeCode.startsWith('auto_') ? null : payeeCode,
      amount: Math.abs(netPayable),
      ref_type: 'Expense',
      ref_id: null,
      trans_date: expenseDate,
      memo: memo ? `지출발생: ${memo.slice(0, 200)}` : '지출발생',
      expense_accrual_id: expenseAccrualId,
      account_subject_id: accountSubjectId != null && !isNaN(Number(accountSubjectId)) ? Number(accountSubjectId) : null,
      expense_date: expenseDate,
      due_date: dueDate,
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
        memo: memo || `지출 발생 ${payeeName || payeeCode}`,
        storeName: storeName || undefined,
        postedBy: userName || undefined,
      })
    } catch (postingErr) {
      console.error('addExpenseAccrual posting:', postingErr)
    }

    try {
      await syncExpenseAccrualInputVatLedger(expenseAccrualId)
    } catch (vatLedgerErr) {
      console.error('addExpenseAccrual vat input ledger:', vatLedgerErr)
    }

    return NextResponse.json(
      {
        success: true,
        message: '지출 발생이 등록되었습니다.',
        id: expenseAccrualId,
      },
      { headers }
    )
  } catch (e) {
    console.error('addExpenseAccrual:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
