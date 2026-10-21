import { NextRequest, NextResponse } from 'next/server'
import {
  attendancePendingBadgePostgrestFilter,
  leavePendingApprovalPostgrestFilter,
  ordersPendingApprovalPostgrestFilter,
} from '@/lib/admin-pending-badge-filters'
import { supabaseCountFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
  type SaasTenantScope,
} from '@/lib/saas-tenant-scope'

const EMPTY_STATS = {
  unapprovedOrders: 0,
  thisMonthInbound: 0,
  thisMonthOutbound: 0,
  leavePending: 0,
  attPending: 0,
}

async function countWithSaasTenant(
  table: string,
  baseFilter: string,
  scope: SaasTenantScope
): Promise<number> {
  if (isSaasTenantQueryBlocked(scope, table)) return 0
  const filter = appendSaasTenantFilter(baseFilter, scope, table)
  try {
    return await supabaseCountFilter(table, filter)
  } catch (e) {
    if (isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing(table)
      return 0
    }
    throw e
  }
}

/** 관리자 대시보드·사이드바 배지 — 승인·조치가 필요한 건만 COUNT (egress 최소화) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })

  try {
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const startStr = firstDay.toISOString().slice(0, 10)
    const endStr = lastDay.toISOString().slice(0, 10) + 'T23:59:59.999Z'

    const [
      unapprovedOrders,
      thisMonthInbound,
      outboundCount,
      forceOutboundCount,
      leavePending,
      attPending,
    ] = await Promise.all([
      // orders 테이블은 Omni에 tenant_id 가 없을 수 있어 기존처럼 전역 COUNT (발주 배지).
      supabaseCountFilter('orders', ordersPendingApprovalPostgrestFilter()).catch(() => 0),
      countWithSaasTenant(
        'stock_logs',
        `log_type=eq.Inbound&log_date=gte.${startStr}&log_date=lte.${endStr}`,
        tenantScope
      ),
      countWithSaasTenant(
        'stock_logs',
        `log_type=eq.Outbound&is_deleted=is.false&log_date=gte.${startStr}&log_date=lte.${endStr}`,
        tenantScope
      ),
      countWithSaasTenant(
        'stock_logs',
        `log_type=eq.ForceOutbound&is_deleted=is.false&log_date=gte.${startStr}&log_date=lte.${endStr}`,
        tenantScope
      ),
      countWithSaasTenant('leave_requests', leavePendingApprovalPostgrestFilter(), tenantScope),
      countWithSaasTenant('attendance_logs', attendancePendingBadgePostgrestFilter(), tenantScope),
    ])

    const thisMonthOutbound = outboundCount + forceOutboundCount

    headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=120')

    return NextResponse.json(
      {
        unapprovedOrders,
        thisMonthInbound,
        thisMonthOutbound,
        leavePending,
        attPending,
      },
      { headers }
    )
  } catch (e) {
    console.error('getAdminDashboardStats:', e)
    return NextResponse.json(EMPTY_STATS, { status: 500, headers })
  }
}
