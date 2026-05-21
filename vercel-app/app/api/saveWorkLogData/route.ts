import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelect,
  supabaseSelectFilter,
  supabaseInsert,
  supabaseUpdate,
} from '@/lib/supabase-server'
import { workLogStoredNameFromEmployeeMaster } from '@/lib/work-log-name'
import { resolveWorkLogEmployeeById } from '@/lib/work-log-name-server'
import { isEphemeralWorkLogId, normalizeWorkLogContent } from '@/lib/work-log-dedupe'

async function findExistingWorkLogRowId(
  date: string,
  savedName: string,
  savedEmployeeId: number | null,
  content: string,
  explicitId?: string
): Promise<string | null> {
  const idStr = String(explicitId || '').trim()
  if (idStr && !isEphemeralWorkLogId(idStr)) {
    const ex = ((await supabaseSelectFilter(
      'work_logs',
      `id=eq.${encodeURIComponent(idStr)}`,
      { limit: 1 }
    )) || []) as { id?: string }[]
    if (ex.length > 0) return idStr
  }

  const nc = normalizeWorkLogContent(content)
  if (!nc) return null

  const parts = [
    `log_date=eq.${encodeURIComponent(date)}`,
    `content=eq.${encodeURIComponent(nc)}`,
  ]
  if (savedEmployeeId != null) {
    parts.push(`employee_id=eq.${savedEmployeeId}`)
  } else {
    parts.push(`name=eq.${encodeURIComponent(savedName)}`)
  }

  const rows = ((await supabaseSelectFilter('work_logs', parts.join('&'), {
    limit: 1,
    order: 'progress.desc',
  })) || []) as { id?: string }[]

  const found = rows[0]?.id
  return found != null ? String(found) : null
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) || {}
    const date = String(body.date || '').trim()
    const name = String(body.name || '').trim()
    const rawEmployeeId =
      (body as { employeeId?: unknown; employee_id?: unknown }).employeeId ??
      (body as { employee_id?: unknown }).employee_id
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
    let savedDept = '기타'
    let savedEmployeeId: number | null = null

    const byId = await resolveWorkLogEmployeeById(rawEmployeeId)
    if (byId) {
      savedName = byId.name
      savedDept = byId.job || 'Staff'
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

    const savedIds: { id: string; content: string }[] = []

    for (let idx = 0; idx < logs.length; idx++) {
      const item = logs[idx]
      const content = String(item.content || '')
      if (!normalizeWorkLogContent(content) && isEphemeralWorkLogId(item.id)) continue

      const pv = Number(item.progress)
      const status =
        pv >= 100 ? 'Finish' : item.type === 'continue' ? 'Continue' : 'Today'
      const patch = {
        dept: savedDept,
        name: savedName,
        content,
        progress: pv,
        status,
        priority: item.priority || '',
        log_date: date,
        ...(savedEmployeeId != null ? { employee_id: savedEmployeeId } : {}),
      }

      const existingId = await findExistingWorkLogRowId(
        date,
        savedName,
        savedEmployeeId,
        content,
        item.id
      )

      if (existingId) {
        await supabaseUpdate('work_logs', existingId, patch)
        savedIds.push({ id: existingId, content })
      } else {
        const newId =
          date +
          '_' +
          savedName +
          '_' +
          Date.now() +
          '_' +
          Math.floor(Math.random() * 100)
        await supabaseInsert('work_logs', {
          id: newId,
          log_date: date,
          dept: savedDept,
          name: savedName,
          content,
          progress: pv,
          status,
          priority: item.priority || '',
          manager_check: '대기',
          manager_comment: '',
          ...(savedEmployeeId != null ? { employee_id: savedEmployeeId } : {}),
        })
        savedIds.push({ id: newId, content })
      }
    }

    return NextResponse.json(
      { success: true, messageKey: 'workLogSaveDone', savedIds },
      { headers }
    )
  } catch (e) {
    console.error('saveWorkLogData:', e)
    return NextResponse.json(
      { success: false, messageKey: 'workLogSaveFail' },
      { headers }
    )
  }
}
