import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { tryVerifyBearerFromRequest } from '@/lib/verify-auth'
import {
  appendSaasTenantFilter,
  assertSaasTenantWritable,
  isMissingSaasTenantColumnError,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
  stampSaasTenantId,
  type SaasTenantScope,
} from '@/lib/saas-tenant-scope'
import { workLogActorFromAuth, writeWorkLogAudit, type WorkLogAuditRow } from '@/lib/work-log-audit'

async function fetchWorkLogRowByIdScoped(
  id: string,
  tenantScope: SaasTenantScope
): Promise<WorkLogAuditRow | null> {
  const sid = String(id || '').trim()
  if (!sid) return null
  const baseFilter = `id=eq.${encodeURIComponent(sid)}`
  const filter = appendSaasTenantFilter(baseFilter, tenantScope, 'work_logs')
  try {
    const rows = (await supabaseSelectFilter('work_logs', filter, { limit: 1 })) as WorkLogAuditRow[]
    return rows?.[0] ?? null
  } catch (e) {
    if (isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing('work_logs')
      const rows = (await supabaseSelectFilter('work_logs', baseFilter, { limit: 1 })) as WorkLogAuditRow[]
      return rows?.[0] ?? null
    }
    throw e
  }
}

async function updateWorkLogScoped(
  id: string,
  patch: Record<string, string>,
  tenantScope: SaasTenantScope
): Promise<void> {
  const stampedPatch = stampSaasTenantId(patch, tenantScope, 'work_logs')
  try {
    await supabaseUpdate('work_logs', id, stampedPatch)
  } catch (e) {
    if (isMissingSaasTenantColumnError(e) && 'tenant_id' in stampedPatch) {
      markSaasTenantColumnMissing('work_logs')
      const { tenant_id: _t, ...withoutTenant } = stampedPatch
      await supabaseUpdate('work_logs', id, withoutTenant)
    } else {
      throw e
    }
  }
}

/** 업무일지 중요도 변경 (관리자 승인 탭) */
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
          { success: false, messageKey: 'workLogProcessError', message: '인증이 필요합니다.' },
          { status: 403, headers }
        )
      }
      const tenantWriteErr = assertSaasTenantWritable(tenantScope, {
        tableHint: 'work_logs',
        label: '업무일지',
      })
      if (tenantWriteErr) {
        return NextResponse.json(
          { success: false, messageKey: 'workLogProcessError', message: tenantWriteErr },
          { status: 403, headers }
        )
      }
    }

    const body = (await req.json()) || {}
    const id = String(body.id || '').trim()
    const priority = String(body.priority || '').trim()

    if (!id) {
      return NextResponse.json(
        { success: false, messageKey: 'workLogProcessError' },
        { status: 400, headers }
      )
    }

    const before = await fetchWorkLogRowByIdScoped(id, tenantScope)
    if (!before) {
      return NextResponse.json(
        { success: false, messageKey: 'workLogProcessError' },
        { headers }
      )
    }

    await updateWorkLogScoped(id, { priority }, tenantScope)
    const after = await fetchWorkLogRowByIdScoped(id, tenantScope)

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
