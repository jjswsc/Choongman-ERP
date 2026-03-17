/**
 * 매장 미선택(store_name null/빈값) 지급예정 강제 삭제
 * 본사 권한만 호출 가능
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter, supabaseSelectFilter } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json().catch(() => ({}))
    const userRole = String(body.userRole || body.user_role || '').toLowerCase()
    const isOffice = ['director', 'officer', 'ceo', 'hr'].some((r) => userRole.includes(r))
    if (!isOffice) {
      return NextResponse.json({ success: false, message: '본사 권한만 실행할 수 있습니다.' }, { status: 403, headers })
    }

    const rows = (await supabaseSelectFilter('expense_accruals', 'id=gt.0', {
      select: 'id,store_name',
      limit: 5000,
    })) as { id?: number; store_name?: string | null }[] | null

    const toDelete: number[] = []
    for (const r of rows || []) {
      const store = String(r.store_name ?? '').trim()
      if (!store && r.id) toDelete.push(r.id)
    }

    for (const id of toDelete) {
      await supabaseDeleteByFilter('payable_transactions', `expense_accrual_id=eq.${id}`)
      await supabaseDeleteByFilter('expense_accruals', `id=eq.${id}`)
    }

    return NextResponse.json(
      { success: true, message: `${toDelete.length}건 삭제되었습니다.`, deletedCount: toDelete.length },
      { headers }
    )
  } catch (e) {
    console.error('deleteExpenseAccrualsWithoutStore:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
