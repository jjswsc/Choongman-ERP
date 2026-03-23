import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { assertAccountSubjectNotHeader } from '@/lib/account-subject-header-guard'

type ExpenseAccrualRow = {
  id?: number
  status?: string
  payee_code?: string
  store_name?: string | null
}

type PayableRow = {
  id?: number
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
    const body = await request.json()
    const userRole = String(body.userRole || body.user_role || '').toLowerCase()
    const isOffice = ['director', 'officer', 'ceo', 'hr'].some((r) => userRole.includes(r))
    if (!isOffice) {
      return NextResponse.json({ success: false, message: '본사 권한만 수정/삭제할 수 있습니다.' }, { status: 403, headers })
    }

    const expenseAccrualId = Number(body.expenseAccrualId || body.expense_accrual_id || 0)
    const action = String(body.action || 'update').trim().toLowerCase() // update | delete
    if (!expenseAccrualId) {
      return NextResponse.json({ success: false, message: '지급 예정 ID가 필요합니다.' }, { status: 400, headers })
    }
    if (!['update', 'delete'].includes(action)) {
      return NextResponse.json({ success: false, message: 'action은 update 또는 delete 이어야 합니다.' }, { status: 400, headers })
    }

    const rows = (await supabaseSelectFilter('expense_accruals', `id=eq.${expenseAccrualId}`, {
      select: 'id,status,payee_code,store_name',
      limit: 1,
    })) as ExpenseAccrualRow[] | null
    const row = rows?.[0]
    if (!row?.id) {
      return NextResponse.json({ success: false, message: '지급 예정 데이터를 찾을 수 없습니다.' }, { status: 404, headers })
    }
    const status = String(row.status || '').toLowerCase()
    const rowStoreName = String(row.store_name ?? '').trim()
    const isNoStore = !rowStoreName
    if (action === 'delete') {
      if (!isNoStore && status !== 'planned' && status !== 'rejected') {
        return NextResponse.json({ success: false, message: '요청(미승인) 또는 반려 상태에서만 삭제할 수 있습니다. 승인된 건은 지출 검색에서 삭제해 주세요.' }, { status: 400, headers })
      }
    } else if (status !== 'planned') {
      return NextResponse.json({ success: false, message: '승인 전(요청) 상태에서만 수정할 수 있습니다.' }, { status: 400, headers })
    }

    if (action === 'delete') {
      await supabaseDeleteByFilter('payable_transactions', `expense_accrual_id=eq.${expenseAccrualId}`)
      await supabaseDeleteByFilter('expense_accruals', `id=eq.${expenseAccrualId}`)
      return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
    }

    const amount = Math.abs(Number(body.amount || 0))
    const expenseDate = String(body.expenseDate || body.expense_date || '').slice(0, 10)
    const dueDateRaw = String(body.dueDate || body.due_date || '').trim()
    const dueDate = dueDateRaw ? dueDateRaw.slice(0, 10) : null
    const memo = String(body.memo || '').trim()
    const payeeCodeInput = String(body.payeeCode || body.payee_code || '').trim()
    const payeeName = String(body.payeeName || body.payee_name || '').trim()
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
      return NextResponse.json({ success: false, message: '비용 발생일 형식이 올바르지 않습니다.' }, { status: 400, headers })
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
    const withdrawalCategory =
      withdrawalCategoryInput && ['expense', 'expense_advance', 'purchase_payment', 'purchase_advance', 'fixed_asset', 'transfer', 'loan_repayment', 'loan_given', 'tax_vat', 'tax_withholding', 'tax_corporate', 'correction', 'dividend'].includes(withdrawalCategoryInput)
        ? withdrawalCategoryInput
        : decoded.withdrawalCategory
    const encodedPayeeCode = encodePayeeCode(payeeCode, withdrawalCategory)

    await supabaseUpdate('expense_accruals', expenseAccrualId, {
      payee_code: encodedPayeeCode,
      payee_name: payeeName || payeeCode || null,
      amount,
      expense_date: expenseDate,
      due_date: dueDate,
      memo: memo || null,
      store_name: storeName || null,
      account_subject_id: accountSubjectId,
      updated_at: new Date().toISOString(),
    })

    const payableRows = (await supabaseSelectFilter('payable_transactions', `expense_accrual_id=eq.${expenseAccrualId}`, {
      select: 'id,amount',
      limit: 50,
    })) as PayableRow[] | null
    for (const p of payableRows || []) {
      if (!p.id) continue
      const a = Number(p.amount || 0)
      if (a <= 0) continue
      await supabaseUpdate('payable_transactions', p.id, {
        vendor_code: payeeCode || null,
        amount,
        trans_date: expenseDate,
        memo: memo ? `지출발생: ${memo.slice(0, 200)}` : '지출발생',
        account_subject_id: accountSubjectId,
        expense_date: expenseDate,
        due_date: dueDate,
      })
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

