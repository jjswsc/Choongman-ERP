import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  try {
    const body = await request.json()
    const id = body?.id != null ? Number(body.id) : NaN
    const decision = String(body?.decision || '').trim()
    const userStore = String(body?.userStore || '').trim()
    const userRole = String(body?.userRole || '').toLowerCase()

    if (!id || isNaN(id)) {
      return NextResponse.json(
        { success: false, message: '잘못된 요청입니다.' },
        { headers }
      )
    }

    if (decision !== '승인' && decision !== 'Approved' && decision !== '반려' && decision !== 'Rejected') {
      return NextResponse.json(
        { success: false, message: '승인 또는 반려를 선택해 주세요.' },
        { headers }
      )
    }

    const rows = (await supabaseSelectFilter('leave_requests', `id=eq.${id}`, { limit: 1 })) as { id: number; store?: string }[]
    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { success: false, message: '해당 휴가 신청을 찾을 수 없습니다.' },
        { headers }
      )
    }

    const isManager = userRole === 'manager'
    if (isManager && userStore && String(rows[0].store || '').trim() !== userStore) {
      return NextResponse.json(
        { success: false, message: '해당 매장의 휴가만 승인할 수 있습니다.' },
        { headers }
      )
    }

    const status = decision === '승인' || decision === 'Approved' ? '승인' : '반려'
    await supabaseUpdate('leave_requests', id, { status })

    return NextResponse.json(
      { success: true, message: '처리되었습니다.' },
      { headers }
    )
  } catch (e) {
    console.error('processLeaveApproval:', e)
    return NextResponse.json(
      { success: false, message: '처리 실패: ' + (e instanceof Error ? e.message : String(e)) },
      { headers }
    )
  }
}
