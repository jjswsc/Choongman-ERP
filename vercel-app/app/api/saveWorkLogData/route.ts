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
import { tryVerifyBearerFromRequest } from '@/lib/verify-auth'
import { workLogActorFromAuth, writeWorkLogAudit } from '@/lib/work-log-audit'
import {
  appendSaasTenantFilter,
  assertSaasTenantWritable,
  isMissingSaasTenantColumnError,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
  stampSaasTenantId,
  type SaasTenantScope,
} from '@/lib/saas-tenant-scope'

async function findExistingWorkLogRowId(
  date: string,
  savedName: string,
  savedEmployeeId: number | null,
  content: string,
  explicitId: string | undefined,
  tenantScope: SaasTenantScope
): Promise<string | null> {
  const idStr = String(explicitId || '').trim()
  if (idStr && !isEphemeralWorkLogId(idStr)) {
    const idFilter = appendSaasTenantFilter(
      `id=eq.${encodeURIComponent(idStr)}`,
      tenantScope,
      'work_logs'
    )
    const ex = ((await supabaseSelectFilter('work_logs', idFilter, { limit: 1 })) || []) as {
      id?: string
    }[]
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

  const dedupeFilter = appendSaasTenantFilter(parts.join('&'), tenantScope, 'work_logs')
  const rows = ((await supabaseSelectFilter('work_logs', dedupeFilter, {
    limit: 1,
    order: 'progress.desc',
  })) || []) as { id?: string }[]

  const found = rows[0]?.id
  return found != null ? String(found) : null
}

async function upsertWorkLogRow(
  existingId: string | null,
  patch: Record<string, unknown>,
  insertRow: Record<string, unknown>,
  tenantScope: SaasTenantScope
): Promise<string> {
  if (existingId) {
    const stampedPatch = stampSaasTenantId(patch, tenantScope, 'work_logs')
    try {
      await supabaseUpdate('work_logs', existingId, stampedPatch)
    } catch (e) {
      if (isMissingSaasTenantColumnError(e) && 'tenant_id' in stampedPatch) {
        markSaasTenantColumnMissing('work_logs')
        const { tenant_id: _t, ...withoutTenant } = stampedPatch
        await supabaseUpdate('work_logs', existingId, withoutTenant)
      } else {
        throw e
      }
    }
    return existingId
  }

  const stampedInsert = stampSaasTenantId(insertRow, tenantScope, 'work_logs')
  try {
    await supabaseInsert('work_logs', stampedInsert)
  } catch (e) {
    if (isMissingSaasTenantColumnError(e) && 'tenant_id' in stampedInsert) {
      markSaasTenantColumnMissing('work_logs')
      const { tenant_id: _t, ...withoutTenant } = stampedInsert
      await supabaseInsert('work_logs', withoutTenant)
    } else {
      throw e
    }
  }
  return String(insertRow.id)
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const auth = await tryVerifyBearerFromRequest(req)
    const tenantScope = await resolveSaasTenantScope({
      auth: auth ? { tenantId: auth.tenantId, company: auth.company } : null,
      storeCode: auth?.store,
    })
    if (tenantScope.enforce) {
      if (!auth) {
        return NextResponse.json(
          { success: false, messageKey: 'workLogSaveFail', message: '인증이 필요합니다.' },
          { status: 403, headers }
        )
      }
      const tenantWriteErr = assertSaasTenantWritable(tenantScope, {
        tableHint: 'work_logs',
        label: '업무일지',
      })
      if (tenantWriteErr) {
        return NextResponse.json(
          { success: false, messageKey: 'workLogSaveFail', message: tenantWriteErr },
          { status: 403, headers }
        )
      }
    }

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

    let staffList: { id?: number; name?: string; nick?: string; job?: string; store?: string }[] = []
    if (tenantScope.enforce) {
      try {
        const empFilter = appendSaasTenantFilter('id=gt.0', tenantScope, 'employees')
        staffList = ((await supabaseSelectFilter('employees', empFilter, {
          order: 'id.asc',
          select: 'id,name,nick,job,store',
        })) || []) as typeof staffList
      } catch (e) {
        if (isMissingSaasTenantColumnError(e)) {
          markSaasTenantColumnMissing('employees')
          staffList = ((await supabaseSelect('employees', {
            order: 'id.asc',
            select: 'id,name,nick,job,store',
          })) || []) as typeof staffList
        } else {
          throw e
        }
      }
    } else {
      staffList =
        ((await supabaseSelect('employees', { order: 'id.asc', select: 'id,name,nick,job,store' })) ||
          []) as typeof staffList
    }
    let savedName = name
    let savedDept = '기타'
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
          savedStore = String(staffList[i].store || '').trim()
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
        ...(savedStore ? { store: savedStore } : {}),
        ...(savedEmployeeId != null ? { employee_id: savedEmployeeId } : {}),
      }

      const existingId = await findExistingWorkLogRowId(
        date,
        savedName,
        savedEmployeeId,
        content,
        item.id,
        tenantScope
      )

      const newId =
        date +
        '_' +
        savedName +
        '_' +
        Date.now() +
        '_' +
        Math.floor(Math.random() * 100)

      const rowId = await upsertWorkLogRow(
        existingId,
        patch,
        {
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
          ...(savedStore ? { store: savedStore } : {}),
          ...(savedEmployeeId != null ? { employee_id: savedEmployeeId } : {}),
        },
        tenantScope
      )
      savedIds.push({ id: rowId, content })
    }

    await writeWorkLogAudit({
      actionType: 'update',
      logDate: date,
      employeeId: savedEmployeeId,
      employeeName: savedName,
      employeeStore: savedStore || null,
      changeReason: 'save_progress',
      afterRow: { savedCount: savedIds.length, ids: savedIds.map((x) => x.id) },
      actor: workLogActorFromAuth(auth, savedName),
    })

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
