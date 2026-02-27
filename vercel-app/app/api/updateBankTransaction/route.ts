import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpdate, supabaseSelectFilter } from '@/lib/supabase-server'

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

    if (!bankTxId || isNaN(bankTxId)) {
      return NextResponse.json({ success: false, message: '통장 거래 ID가 필요합니다.' }, { status: 400, headers })
    }

    const existing = (await supabaseSelectFilter('bank_transactions', `id=eq.${bankTxId}`, { limit: 1 })) as {
      id?: number
      trans_type?: string
      category?: string
    }[]
    if (!existing?.length) {
      return NextResponse.json({ success: false, message: '해당 통장 거래가 없습니다.' }, { status: 404, headers })
    }

    const transType = String(existing[0].trans_type || 'withdraw').toLowerCase()
    const depositCategories = ['revenue_delivery', 'revenue_card', 'revenue_qr', 'revenue_cash', 'receivable_receive', 'correction', 'loan', 'advance', 'unclassified']
    const withdrawCategories = ['transfer', 'expense', 'fixed', 'purchase_payment', 'correction', 'loan', 'advance', 'unclassified']

    const patch: Record<string, unknown> = {}

    if (category !== undefined) {
      const validCategory = transType === 'deposit'
        ? (depositCategories.includes(String(category).toLowerCase()) ? String(category).toLowerCase() : existing[0].category)
        : (withdrawCategories.includes(String(category).toLowerCase()) ? String(category).toLowerCase() : existing[0].category)
      patch.category = validCategory
    }
    if (accountSubjectId !== undefined) {
      const asid = accountSubjectId ? Number(accountSubjectId) : null
      patch.account_subject_id = asid && !isNaN(asid) ? asid : null
    }
    if (note !== undefined) patch.note = String(note || '').trim() || null
    if (transType === 'deposit' && salesDate !== undefined) {
      const sd = String(salesDate || '').slice(0, 10)
      patch.sales_date = /^\d{4}-\d{2}-\d{2}$/.test(sd) ? sd : null
    }
    if (transType === 'withdraw' && expenseDate !== undefined) {
      const ed = String(expenseDate || '').slice(0, 10)
      patch.expense_date = /^\d{4}-\d{2}-\d{2}$/.test(ed) ? ed : null
    }
    const finalCategory = (patch.category as string) ?? existing[0].category
    if (finalCategory === 'purchase_payment' && vendorCode !== undefined) {
      patch.vendor_code = String(vendorCode || '').trim() || null
    }
    if (finalCategory === 'receivable_receive' && storeName !== undefined) {
      patch.store_name = String(storeName || '').trim() || null
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: true, message: '변경 사항 없음' }, { headers })
    }

    await supabaseUpdate('bank_transactions', bankTxId, patch)

    return NextResponse.json({ success: true, message: '저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('updateBankTransaction:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
