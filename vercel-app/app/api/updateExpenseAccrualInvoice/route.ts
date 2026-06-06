import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { syncExpenseAccrualInvoiceEvidence } from '@/lib/expense-accrual-invoice-sync'
import { requireAuth } from '@/lib/verify-auth'

/** 지출 발생(expense_accruals) 세금계산서 수령 여부 — 승인·지급 후에도 변경 가능 */
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

    const body = await request.json()
    const expenseAccrualId = Number(body.expenseAccrualId ?? body.expense_accrual_id ?? 0)
    const invoiceReceived = body.invoiceReceived ?? body.invoice_received
    const invoiceNo = body.invoiceNo ?? body.invoice_no
    const invoicePhotoUrl = body.invoicePhotoUrl ?? body.invoice_photo_url ?? body.invoice_photo

    if (!expenseAccrualId || isNaN(expenseAccrualId)) {
      return NextResponse.json({ success: false, message: '지출 발생 ID가 필요합니다.' }, { status: 400, headers })
    }

    const existing = (await supabaseSelectFilter('expense_accruals', `id=eq.${expenseAccrualId}`, {
      limit: 1,
      select: 'id,status',
    })) as { id?: number; status?: string | null }[] | null
    if (!existing?.length) {
      return NextResponse.json({ success: false, message: '지출 발생 데이터를 찾을 수 없습니다.' }, { status: 404, headers })
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof invoiceReceived === 'boolean') patch.invoice_received = invoiceReceived
    if (invoiceNo !== undefined) patch.invoice_no = String(invoiceNo || '').trim() || null
    if (invoicePhotoUrl !== undefined) patch.invoice_photo_url = String(invoicePhotoUrl || '').trim() || null

    if (Object.keys(patch).length <= 1) {
      return NextResponse.json({ success: true, message: '변경 사항 없음' }, { headers })
    }

    await supabaseUpdate('expense_accruals', expenseAccrualId, patch)

    try {
      await syncExpenseAccrualInvoiceEvidence(expenseAccrualId)
    } catch (syncErr) {
      console.error('updateExpenseAccrualInvoice sync:', syncErr)
    }

    return NextResponse.json({ success: true, message: '저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('updateExpenseAccrualInvoice:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
