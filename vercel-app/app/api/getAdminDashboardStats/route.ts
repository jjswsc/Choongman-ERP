import { NextResponse } from 'next/server'
import { supabaseCountFilter } from '@/lib/supabase-server'

/** 관리자 대시보드용 집계 - 미승인 주문, 이달 입고/출고, 휴가 대기, 근태 대기. COUNT만 사용해 egress 최소화 */
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
      leavePendingKo,
      leavePendingEn,
      attPending,
    ] = await Promise.all([
      supabaseCountFilter('orders', 'status=eq.Pending'),
      supabaseCountFilter('stock_logs', `log_type=eq.Inbound&log_date=gte.${startStr}&log_date=lte.${endStr}`),
      supabaseCountFilter('stock_logs', `log_type=eq.Outbound&log_date=gte.${startStr}&log_date=lte.${endStr}`),
      supabaseCountFilter('stock_logs', `log_type=eq.ForceOutbound&log_date=gte.${startStr}&log_date=lte.${endStr}`),
      supabaseCountFilter('leave_requests', 'status=eq.대기'),
      supabaseCountFilter('leave_requests', 'status=eq.Pending'),
      supabaseCountFilter('attendance_logs', 'approved=eq.대기'),
    ])

    const thisMonthOutbound = outboundCount + forceOutboundCount
    const leavePending = leavePendingKo + leavePendingEn

    return NextResponse.json({
      unapprovedOrders,
      thisMonthInbound,
      thisMonthOutbound,
      leavePending,
      attPending,
    }, { headers })
  } catch (e) {
    console.error('getAdminDashboardStats:', e)
    return NextResponse.json(
      { unapprovedOrders: 0, thisMonthInbound: 0, thisMonthOutbound: 0, leavePending: 0, attPending: 0 },
      { status: 500, headers }
    )
  }
}
