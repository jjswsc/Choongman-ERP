import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpdate } from '@/lib/supabase-server'
import { tryVerifyBearerFromRequest } from '@/lib/verify-auth'
import {
  fetchWorkLogRowById,
  workLogActorFromAuth,
  writeWorkLogAudit,
} from '@/lib/work-log-audit'

/** 업무일지 중요도 변경 (관리자 승인 탭) */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) || {}
    const id = String(body.id || '').trim()
    const priority = String(body.priority || '').trim()

    if (!id) {
      return NextResponse.json(
        { success: false, messageKey: 'workLogProcessError' },
        { status: 400, headers }
      )
    }

    const before = await fetchWorkLogRowById(id)
    await supabaseUpdate('work_logs', id, { priority })
    const after = await fetchWorkLogRowById(id)

    const auth = await tryVerifyBearerFromRequest(req)
    await writeWorkLogAudit({
      actionType: 'update',
      workLogId: id,
      logDate: before?.log_date ? String(before.log_date).slice(0, 10) : null,
      employeeId: before?.employee_id != null ? Number(before.employee_id) : null,
      employeeName: before?.name || null,
      employeeStore: before?.store || null,
      beforeRow: before,
      afterRow: after,
      changeReason: 'priority',
      actor: workLogActorFromAuth(auth),
    })

    return NextResponse.json(
      { success: true, messageKey: 'workLogSaveDone' },
      { headers }
    )
  } catch (e) {
    console.error('updateWorkLogPriority:', e)
    return NextResponse.json(
      { success: false, messageKey: 'workLogSaveFail' },
      { headers }
    )
  }
}
