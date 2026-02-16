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
    const decision = String(body?.decision || body?.status || '').trim()
    const userStore = String(body?.userStore || '').trim()
    const userRole = String(body?.userRole || '').toLowerCase()
    const optOtMinutes = body?.optOtMinutes != null ? Number(body.optOtMinutes) : null
    const waiveLate = body?.waiveLate === true

    if (!id || isNaN(id)) {
      return NextResponse.json(
        { success: false, message: '잘못된 요청입니다.' },
        { headers }
      )
    }

    const rows = (await supabaseSelectFilter('attendance_logs', `id=eq.${id}`, { limit: 1 })) as { id: number; store_name?: string; log_type?: string; late_min?: number }[]
    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { success: false, message: '해당 기록을 찾을 수 없습니다.' },
        { headers }
      )
    }

    const isManager = userRole === 'manager'
    if (isManager && userStore && String(rows[0].store_name || '').trim() !== userStore) {
      return NextResponse.json(
        { success: false, message: '해당 매장의 근태만 승인할 수 있습니다.' },
        { headers }
      )
    }

    const patch: Record<string, unknown> = { approved: decision }
    if (decision === '승인완료') {
      const isClockIn = String(rows[0]?.log_type || '').trim() === '출근'
      const hasLate = (Number(rows[0]?.late_min) || 0) > 0
      if (isClockIn && hasLate && !waiveLate) {
        patch.status = '지각(승인)'
      } else {
        patch.status = '정상(승인)'
      }
      if (optOtMinutes != null && !isNaN(optOtMinutes) && optOtMinutes >= 0) {
        patch.ot_min = Math.min(9999, Math.round(optOtMinutes))
      }
    } else if (decision === '반려') {
      patch.status = '반려'
    }

    await supabaseUpdate('attendance_logs', id, patch)

    return NextResponse.json(
      { success: true, message: '처리가 완료되었습니다.' },
      { headers }
    )
  } catch (e) {
    console.error('processAttendanceApproval:', e)
    return NextResponse.json(
      { success: false, message: '처리 실패: ' + (e instanceof Error ? e.message : String(e)) },
      { headers }
    )
  }
}
