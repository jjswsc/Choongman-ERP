import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseDeleteByFilter } from '@/lib/supabase-server'
import { assertAccountingDateOpen, deleteJournalEntriesBySource } from '@/lib/accounting-posting'

/** 패티캐시 거래 삭제 - 월별 현황 등 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const id = Number(body.id)
    const userStore = String(body.userStore || body.user_store || '').trim()
    const userRole = String(body.userRole || body.user_role || '').toLowerCase()

    if (!id || id <= 0) {
      return NextResponse.json({ success: false, message: '거래 ID가 필요합니다.' }, { status: 400, headers })
    }

    const rows = (await supabaseSelectFilter('petty_cash_transactions', `id=eq.${id}`, {
      limit: 1,
    })) as { id?: number; store?: string; trans_date?: string }[]

    const row = rows?.[0]
    if (!row?.id) {
      return NextResponse.json({ success: false, message: '해당 거래를 찾을 수 없습니다.' }, { status: 404, headers })
    }

    const transDate = String(row.trans_date || '').slice(0, 10)
    await assertAccountingDateOpen(transDate)

    const store = String(row.store || '').trim()
    const isOffice = ['director', 'officer', 'ceo', 'hr'].some((r) => userRole.includes(r))
    if (!isOffice && userStore && store !== userStore) {
      return NextResponse.json({ success: false, message: '해당 매장만 삭제할 수 있습니다.' }, { status: 403, headers })
    }

    const payables = (await supabaseSelectFilter(
      'payable_transactions',
      `petty_cash_transaction_id=eq.${id}`,
      { limit: 50, select: 'id,expense_accrual_id' }
    )) as { id?: number; expense_accrual_id?: number | null }[]

    for (const p of payables || []) {
      if (Number(p.expense_accrual_id || 0) > 0) {
        return NextResponse.json(
          { success: false, message: '지급예정과 연결된 패티캐시 건은 삭제할 수 없습니다.' },
          { status: 400, headers }
        )
      }
    }

    await deleteJournalEntriesBySource('petty_cash', id, {})

    if ((payables || []).length > 0) {
      await supabaseDeleteByFilter('payable_transactions', `petty_cash_transaction_id=eq.${id}`)
    }

    await supabaseDeleteByFilter('petty_cash_transactions', `id=eq.${id}`)

    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deletePettyCashTransaction:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
