import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter } from '@/lib/supabase-server'
import { tryVerifyBearerFromRequest } from '@/lib/verify-auth'
import {
  fetchWorkLogRowById,
  workLogActorFromAuth,
  writeWorkLogAudit,
} from '@/lib/work-log-audit'

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) || {}
    const id = String(body.id || '').trim()
    if (!id) {
      return NextResponse.json(
        { success: false, messageKey: 'workLogDeleteFail' },
        { headers }
      )
    }

    const before = await fetchWorkLogRowById(id)
    await supabaseDeleteByFilter('work_logs', `id=eq.${encodeURIComponent(id)}`)

    const auth = await tryVerifyBearerFromRequest(req)
    await writeWorkLogAudit({
      actionType: 'delete',
      workLogId: id,
      logDate: before?.log_date ? String(before.log_date).slice(0, 10) : null,
      employeeId: before?.employee_id != null ? Number(before.employee_id) : null,
      employeeName: before?.name || null,
      employeeStore: before?.store || null,
      beforeRow: before,
      actor: workLogActorFromAuth(auth, before?.name),
    })

    return NextResponse.json(
      { success: true, messageKey: 'workLogDeleteDone' },
      { headers }
    )
  } catch (e) {
    console.error('deleteWorkLogItem:', e)
    return NextResponse.json(
      { success: false, messageKey: 'workLogDeleteFail' },
      { headers }
    )
  }
}
