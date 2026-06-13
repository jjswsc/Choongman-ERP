import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpdate } from '@/lib/supabase-server'
import { tryVerifyBearerFromRequest } from '@/lib/verify-auth'
import {
  fetchWorkLogRowById,
  workLogActorFromAuth,
  writeWorkLogAudit,
} from '@/lib/work-log-audit'
import { notifyWorkLogReviewResult } from '@/lib/work-log-notifications'

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) || {}
    const id = String(body.id || '').trim()
    const status = String(body.status || '').trim()
    const comment =
      body.comment != null ? String(body.comment).trim() : undefined

    const before = await fetchWorkLogRowById(id)
    const patch: Record<string, string> = { manager_check: status }
    if (comment != null) patch.manager_comment = comment

    await supabaseUpdate('work_logs', id, patch)

    const after = await fetchWorkLogRowById(id)
    const auth = await tryVerifyBearerFromRequest(req)
    const actor = workLogActorFromAuth(auth, '관리자')

    await writeWorkLogAudit({
      actionType: 'review',
      workLogId: id,
      logDate: before?.log_date ? String(before.log_date).slice(0, 10) : null,
      employeeId: before?.employee_id != null ? Number(before.employee_id) : null,
      employeeName: before?.name || null,
      employeeStore: before?.store || null,
      beforeRow: before,
      afterRow: after,
      changeReason: status,
      actor,
    })

    if (before?.name) {
      void notifyWorkLogReviewResult({
        employeeId: before.employee_id != null ? Number(before.employee_id) : null,
        employeeName: String(before.name),
        managerCheck: status,
        managerComment: comment ?? after?.manager_comment,
        logDate: before.log_date ? String(before.log_date).slice(0, 10) : '',
        contentPreview: String(before.content || ''),
        sender: actor.name || '업무일지',
      })
    }

    return NextResponse.json(
      { success: true, messageKey: 'workLogApproveDone' },
      { headers }
    )
  } catch (e) {
    console.error('updateManagerCheck:', e)
    return NextResponse.json(
      { success: false, messageKey: 'workLogProcessError' },
      { headers }
    )
  }
}
