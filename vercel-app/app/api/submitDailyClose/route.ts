import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelect,
  supabaseSelectFilter,
  supabaseInsert,
  supabaseUpdate,
} from '@/lib/supabase-server'
import { addBangkokCalendarDays } from '@/lib/bangkok-time'
import { workLogStoredNameFromEmployeeMaster } from '@/lib/work-log-name'
import { resolveWorkLogEmployeeById } from '@/lib/work-log-name-server'
import { tryVerifyBearerFromRequest } from '@/lib/verify-auth'
import { workLogActorFromAuth, writeWorkLogAudit } from '@/lib/work-log-audit'

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) || {}
    const date = String(body.date || '').trim()
    const name = String(body.name || '').trim()
    const rawEmployeeId = (body as { employeeId?: unknown; employee_id?: unknown }).employeeId ?? (body as { employee_id?: unknown }).employee_id
    const logs = Array.isArray(body.logs)
      ? body.logs
      : body.jsonStr
        ? JSON.parse(body.jsonStr)
        : []

    const staffList =
      ((await supabaseSelect('employees', { order: 'id.asc', select: 'id,name,nick,job' })) || []) as {
        id?: number
        name?: string
        nick?: string
        job?: string
      }[]
    let savedName = name
    let savedDept = 'Staff'
    let savedStore = ''
    let savedEmployeeId: number | null = null

    const byId = await resolveWorkLogEmployeeById(rawEmployeeId)
    if (byId) {
      savedName = byId.name
      savedDept = byId.job || 'Staff'
      savedStore = byId.store || ''
      savedEmployeeId = byId.id
    } else {
      const sk = name.toLowerCase().replace(/\s+/g, '')
      for (let i = 0; i < staffList.length; i++) {
        const fn = String(staffList[i].name || '').toLowerCase().replace(/\s+/g, '')
        const nn = String(staffList[i].nick || '').toLowerCase().replace(/\s+/g, '')
        if (sk === fn || (nn && sk === nn)) {
          savedName = workLogStoredNameFromEmployeeMaster(staffList[i].name)
          savedDept = staffList[i].job || 'Staff'
          const eid = staffList[i].id != null ? Math.floor(Number(staffList[i].id)) : 0
          if (Number.isFinite(eid) && eid > 0) savedEmployeeId = eid
          break
        }
      }
    }

    const nextDateStr = addBangkokCalendarDays(date, 1)
    const employeePatch =
      savedEmployeeId != null ? { employee_id: savedEmployeeId } : {}
    const storePatch = savedStore ? { store: savedStore } : {}

    for (let idx = 0; idx < logs.length; idx++) {
      const item = logs[idx]
      const progress = Number(item.progress)
      const ex = item.id
        ? ((await supabaseSelectFilter(
            'work_logs',
            `id=eq.${encodeURIComponent(String(item.id))}`,
            { limit: 1 }
          )) || []) as unknown[]
        : []
      if (progress >= 100) {
        if (ex.length > 0) {
          await supabaseUpdate('work_logs', String(item.id), {
            progress: 100,
            status: 'Finish',
            ...employeePatch,
            ...storePatch,
          })
        } else {
          await supabaseInsert('work_logs', {
            id: date + '_' + savedName + '_' + Date.now(),
            log_date: date,
            dept: savedDept,
            name: savedName,
            content: item.content || '',
            progress: 100,
            status: 'Finish',
            priority: item.priority || '',
            manager_check: '대기',
            manager_comment: '',
            ...employeePatch,
            ...storePatch,
          })
        }
      } else {
        if (ex.length > 0) {
          await supabaseUpdate('work_logs', String(item.id), {
            progress,
            status: 'Carry Over',
            ...employeePatch,
            ...storePatch,
          })
        } else {
          await supabaseInsert('work_logs', {
            id: date + '_' + savedName + '_' + Date.now(),
            log_date: date,
            dept: savedDept,
            name: savedName,
            content: item.content || '',
            progress,
            status: 'Carry Over',
            priority: item.priority || '',
            manager_check: '대기',
            manager_comment: '',
            ...employeePatch,
            ...storePatch,
          })
        }
        await supabaseInsert('work_logs', {
          id:
            nextDateStr +
            '_CARRY_' +
            Date.now() +
            Math.floor(Math.random() * 100),
          log_date: nextDateStr,
          dept: savedDept,
          name: savedName,
          content: item.content || '',
          progress,
          status: 'Continue',
          priority: item.priority || '',
          manager_check: '대기',
          manager_comment: '⚡ 이월됨 (' + date + ' 부터)',
          ...employeePatch,
          ...storePatch,
        })
      }
    }

    const auth = await tryVerifyBearerFromRequest(req)
    await writeWorkLogAudit({
      actionType: 'close',
      logDate: date,
      employeeId: savedEmployeeId,
      employeeName: savedName,
      employeeStore: savedStore || null,
      changeReason: 'daily_close',
      afterRow: { itemCount: logs.length, nextDate: nextDateStr },
      actor: workLogActorFromAuth(auth, savedName),
    })

    return NextResponse.json(
      { success: true, messageKey: 'workLogCloseDone' },
      { headers }
    )
  } catch (e) {
    console.error('submitDailyClose:', e)
    return NextResponse.json(
      { success: false, messageKey: 'workLogCloseFail', message: (e as Error).message },
      { headers }
    )
  }
}
