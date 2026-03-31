import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { canApproveExpenseAccrual } from '@/lib/expense-accrual-approve-policy'

type ExpenseAccrualRow = {
  id?: number
  status?: string
  store_name?: string
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const expenseAccrualId = Number(body.expenseAccrualId || body.expense_accrual_id || 0)
    const action = String(body.action || '').trim().toLowerCase() // approve | reject
    const approvalNote = String(body.approvalNote || body.approval_note || '').trim()
    const userRole = String(body.userRole || body.user_role || '').trim()
    const userName = String(body.userName || body.user_name || '').trim()
    if (!expenseAccrualId) {
      return NextResponse.json({ success: false, message: '지급 예정 ID가 필요합니다.' }, { status: 400, headers })
    }
    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ success: false, message: 'action은 approve 또는 reject 이어야 합니다.' }, { status: 400, headers })
    }

    const rows = (await supabaseSelectFilter('expense_accruals', `id=eq.${expenseAccrualId}`, {
      select: 'id,status,store_name',
      limit: 1,
    })) as ExpenseAccrualRow[] | null
    const row = rows?.[0]
    if (!row?.id) {
      return NextResponse.json({ success: false, message: '지급 예정 데이터를 찾을 수 없습니다.' }, { status: 404, headers })
    }
    if (!canApproveExpenseAccrual(userRole, String(row.store_name || ''))) {
      return NextResponse.json(
        {
          success: false,
          message:
            '승인 권한이 없습니다. 본사(Office·본사 등) 명의 건은 임원(director·ceo·hr), 그 외 매장 건은 본사(임원·오피스) 또는 회계에서 승인할 수 있습니다.',
        },
        { status: 403, headers }
      )
    }

    const status = String(row.status || '').toLowerCase()
    if (action === 'approve') {
      if (status === 'paid') {
        return NextResponse.json({ success: false, message: '이미 지급 완료된 건입니다.' }, { status: 400, headers })
      }
      await supabaseUpdate('expense_accruals', expenseAccrualId, {
        status: 'approved',
        approved_by: userName || null,
        approved_role: userRole || null,
        approved_at: new Date().toISOString(),
        approval_note: approvalNote || null,
        rejected_by: null,
        rejected_role: null,
        rejected_at: null,
        rejection_note: null,
        updated_at: new Date().toISOString(),
      })
      return NextResponse.json({ success: true, message: '승인되었습니다.' }, { headers })
    }

    if (status === 'paid') {
      return NextResponse.json({ success: false, message: '이미 지급 완료된 건은 반려할 수 없습니다.' }, { status: 400, headers })
    }
    await supabaseUpdate('expense_accruals', expenseAccrualId, {
      status: 'rejected',
      rejected_by: userName || null,
      rejected_role: userRole || null,
      rejected_at: new Date().toISOString(),
      rejection_note: approvalNote || null,
      updated_at: new Date().toISOString(),
    })
    return NextResponse.json({ success: true, message: '반려되었습니다.' }, { headers })
  } catch (e) {
    console.error('approveExpenseAccrual:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}

