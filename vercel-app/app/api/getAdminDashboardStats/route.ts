import { NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 관리자 대시보드용 집계 - 미승인 주문, 이달 입고/출고, 휴가 대기, 근태 대기 */
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
      pendingOrders,
      inboundRows,
      outboundLogs,
      forceOutboundLogs,
      leaveRows,
      attRows,
    ] = await Promise.all([
      supabaseSelectFilter('orders', 'status=eq.Pending', { limit: 1000 }) as Promise<unknown[]>,
      supabaseSelectFilter('stock_logs', `log_type=eq.Inbound&log_date=gte.${startStr}&log_date=lte.${endStr}`, { limit: 2000 }) as Promise<unknown[]>,
      supabaseSelectFilter('stock_logs', `log_type=eq.Outbound&log_date=gte.${startStr}&log_date=lte.${endStr}`, { limit: 2000 }) as Promise<unknown[]>,
      supabaseSelectFilter('stock_logs', `log_type=eq.ForceOutbound&log_date=gte.${startStr}&log_date=lte.${endStr}`, { limit: 2000 }) as Promise<unknown[]>,
      Promise.all([
        supabaseSelectFilter('leave_requests', 'status=eq.대기', { limit: 500 }) as Promise<unknown[]>,
        supabaseSelectFilter('leave_requests', 'status=eq.Pending', { limit: 500 }) as Promise<unknown[]>,
      ]).then(([a, b]) => [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]),
      supabaseSelectFilter('attendance_logs', 'approved=eq.대기', { limit: 500 }) as Promise<unknown[]>,
    ])

    const outboundRows = [...(Array.isArray(outboundLogs) ? outboundLogs : []), ...(Array.isArray(forceOutboundLogs) ? forceOutboundLogs : [])]

    const unapprovedOrders = Array.isArray(pendingOrders) ? pendingOrders.length : 0
    const thisMonthInbound = Array.isArray(inboundRows) ? inboundRows.length : 0
    const thisMonthOutbound = Array.isArray(outboundRows) ? outboundRows.length : 0
    const leavePending = Array.isArray(leaveRows) ? leaveRows.length : 0
    const attPending = Array.isArray(attRows) ? attRows.length : 0

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
