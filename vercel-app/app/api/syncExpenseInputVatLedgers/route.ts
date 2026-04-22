import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { syncExpenseAccrualInputVatLedger } from '@/lib/expense-input-vat-ledger'
import { requireAuth } from '@/lib/verify-auth'

/**
 * 기존 지출 발생(expense_accruals) 중 부가세가 있는 건을 매입 부가세 장부에 일괄 반영 (백필).
 * 신규 건은 등록/수정/승인 시 자동 동기화됨.
 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const authResult = await requireAuth(request, 'any')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const body = await request.json().catch(() => ({}))
    const userRole = String(auth.role || '').trim()
    assertCanManageAccountingCompliance(userRole)
    const yearMonth = String(body.yearMonth || '').trim().slice(0, 7)
    const ymOk = /^\d{4}-\d{2}$/.test(yearMonth)
    const rows = (await supabaseSelectFilter('expense_accruals', 'vat_amount=gt.0', {
      select: 'id,status,expense_date',
      limit: 2000,
      order: 'id.asc',
    })) as { id?: number; status?: string; expense_date?: string }[] | null
    let ok = 0
    let fail = 0
    for (const r of rows || []) {
      const id = Math.floor(Number(r?.id) || 0)
      if (id <= 0) continue
      if (ymOk) {
        const ed = String(r?.expense_date || '').slice(0, 7)
        if (ed !== yearMonth) continue
      }
      const st = String(r?.status || '').toLowerCase()
      if (st === 'rejected') continue
      try {
        await syncExpenseAccrualInputVatLedger(id)
        ok += 1
      } catch {
        fail += 1
      }
    }
    return NextResponse.json({ success: true, processed: ok, failed: fail, scanned: (rows || []).length }, { headers })
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403, headers })
    }
    console.error('syncExpenseInputVatLedgers:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
