import { NextResponse } from 'next/server'
import {
  attendancePendingBadgePostgrestFilter,
  leavePendingApprovalPostgrestFilter,
  ordersPendingApprovalPostgrestFilter,
} from '@/lib/admin-pending-badge-filters'
import { supabaseCountFilter } from '@/lib/supabase-server'

/** 관리자 대시보드·사이드바 배지 — 승인·조치가 필요한 건만 COUNT (egress 최소화) */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

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
      supabaseCountFilter('orders', ordersPendingApprovalPostgrestFilter()),
      supabaseCountFilter('stock_logs', `log_type=eq.Inbound&log_date=gte.${startStr}&log_date=lte.${endStr}`),
      supabaseCountFilter('stock_logs', `log_type=eq.Outbound&is_deleted=is.false&log_date=gte.${startStr}&log_date=lte.${endStr}`),
      supabaseCountFilter('stock_logs', `log_type=eq.ForceOutbound&is_deleted=is.false&log_date=gte.${startStr}&log_date=lte.${endStr}`),
      supabaseCountFilter('leave_requests', leavePendingApprovalPostgrestFilter()),
      supabaseCountFilter('attendance_logs', attendancePendingBadgePostgrestFilter()),
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
    return NextResponse.json(
      { unapprovedOrders: 0, thisMonthInbound: 0, thisMonthOutbound: 0, leavePending: 0, attPending: 0 },
      { status: 500, headers }
    )
  }
}
