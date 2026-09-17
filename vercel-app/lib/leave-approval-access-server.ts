/**
 * 휴가 승인자 DB 로드 (서버 전용)
 */
import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  markSaasTenantColumnMissing,
  type SaasTenantScope,
} from '@/lib/saas-tenant-scope'
import {
  normalizeLeaveApproverScope,
  type LeaveApproverRow,
} from '@/lib/leave-approval-access'

type LeaveApproverDb = {
  id?: number
  employee_id?: number
  scope?: string
  store?: string | null
}

export async function loadLeaveApproverRows(
  tenantScope: SaasTenantScope
): Promise<LeaveApproverRow[]> {
  const select = 'id,employee_id,scope,store'
  let rows: LeaveApproverDb[] = []
  try {
    const filter = appendSaasTenantFilter('id=gt.0', tenantScope, 'leave_approvers')
    rows = (await supabaseSelectFilter('leave_approvers', filter, {
      limit: 5000,
      select,
    })) as LeaveApproverDb[]
  } catch (e) {
    if (isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing('leave_approvers')
      rows = (await supabaseSelectFilter('leave_approvers', 'id=gt.0', {
        limit: 5000,
        select,
      })) as LeaveApproverDb[]
    } else {
      const em = e instanceof Error ? e.message : String(e)
      // 테이블 미배포 시 빈 목록 → 전 매장 레거시 폴백
      if (/PGRST205|does not exist|42P01|leave_approvers/i.test(em)) {
        return []
      }
      throw e
    }
  }

  const out: LeaveApproverRow[] = []
  for (const r of rows || []) {
    const scope = normalizeLeaveApproverScope(r.scope)
    if (!scope) continue
    const eid =
      r.employee_id != null && Number.isFinite(Number(r.employee_id))
        ? Math.floor(Number(r.employee_id))
        : 0
    if (!(eid > 0)) continue
    if (scope === 'all') {
      out.push({ employeeId: eid, scope: 'all', store: null })
    } else {
      const store = String(r.store || '').trim()
      if (!store) continue
      out.push({ employeeId: eid, scope: 'store', store })
    }
  }
  return out
}
