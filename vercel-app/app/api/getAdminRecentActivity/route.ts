import { NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

interface ActivityItem {
  id: string
  type: 'receiving' | 'shipping' | 'order' | 'leave' | 'employee'
  titleKey: string
  description: string
  descriptionKey?: string
  descriptionParams?: Record<string, string>
  time: string
  ts: number
  timeKey?: 'justNow' | 'minAgo' | 'hourAgo' | 'dayAgo' | 'date'
  timeParam?: number | string
}

function computeTimeAgo(ts: Date): { key: ActivityItem['timeKey']; param?: number | string } {
  const sec = Math.floor((Date.now() - ts.getTime()) / 1000)
  if (sec < 60) return { key: 'justNow' }
  if (sec < 3600) return { key: 'minAgo', param: Math.floor(sec / 60) }
  if (sec < 86400) return { key: 'hourAgo', param: Math.floor(sec / 3600) }
  if (sec < 604800) return { key: 'dayAgo', param: Math.floor(sec / 86400) }
  return { key: 'date', param: ts.toISOString().slice(0, 10) }
}

/** 관리자 대시보드 최근 활동 - 주문/입고/출고/휴가 등 실데이터 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const items: ActivityItem[] = []
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)

    const [orders, inboundLogs, outboundLogs, leaveRows] = await Promise.all([
      supabaseSelectFilter('orders', `order_date=gte.${monthStart}`, { order: 'order_date.desc', limit: 50 }) as Promise<{ id: number; order_date?: string; store_name?: string; status?: string; total?: number }[]>,
      supabaseSelectFilter('stock_logs', 'log_type=eq.Inbound', { order: 'log_date.desc', limit: 30 }) as Promise<{ log_date?: string; location?: string; vendor_target?: string; qty?: number }[]>,
      supabaseSelectFilter('stock_logs', 'log_type=eq.Outbound', { order: 'log_date.desc', limit: 30 }) as Promise<{ log_date?: string; vendor_target?: string; qty?: number }[]>,
      (async () => {
        const a = (await supabaseSelectFilter('leave_requests', 'status=eq.대기', { order: 'created_at.desc', limit: 20 })) as { id: number; store?: string; name?: string; type?: string; leave_date?: string; created_at?: string }[]
        const b = (await supabaseSelectFilter('leave_requests', 'status=eq.Pending', { order: 'created_at.desc', limit: 20 })) as typeof a
        return [...(a || []), ...(b || [])]
      })(),
    ])

    for (const o of orders || []) {
      if (o.status !== 'Approved') continue
      const d = o.order_date ? new Date(o.order_date) : new Date()
      const ta = computeTimeAgo(d)
      items.push({
        id: `order-${o.id}`,
        type: 'order',
        titleKey: 'adminActOrderApproved',
        description: `${o.store_name || ''} 주문 #${o.id} 승인됨`,
        descriptionKey: 'adminActOrderDesc',
        descriptionParams: { store: o.store_name || '', id: String(o.id) },
        time: ta.key === 'date' ? String(ta.param) : '',
        ts: d.getTime(),
        timeKey: ta.key,
        timeParam: ta.param,
      })
    }

    for (const row of inboundLogs || []) {
      const d = row.log_date ? new Date(row.log_date) : new Date()
      const loc = String(row.location || '').trim() || '본사 창고'
      const ta = computeTimeAgo(d)
      items.push({
        id: `in-${d.getTime()}-${row.vendor_target || ''}`,
        type: 'receiving',
        titleKey: 'adminActInboundReg',
        description: `${loc} - 신규 입고`,
        descriptionKey: 'adminActInboundDesc',
        descriptionParams: { location: loc },
        time: ta.key === 'date' ? String(ta.param) : '',
        ts: d.getTime(),
        timeKey: ta.key,
        timeParam: ta.param,
      })
    }

    for (const row of outboundLogs || []) {
      const d = row.log_date ? new Date(row.log_date) : new Date()
      const target = String(row.vendor_target || '').trim() || '매장'
      const ta = computeTimeAgo(d)
      items.push({
        id: `out-${d.getTime()}-${target}`,
        type: 'shipping',
        titleKey: 'adminActOutboundDone',
        description: `${target} - 출고 처리됨`,
        descriptionKey: 'adminActOutboundDesc',
        descriptionParams: { target },
        time: ta.key === 'date' ? String(ta.param) : '',
        ts: d.getTime(),
        timeKey: ta.key,
        timeParam: ta.param,
      })
    }

    for (const r of leaveRows || []) {
      const d = r.created_at ? new Date(r.created_at) : new Date()
      const dateStr = r.leave_date ? String(r.leave_date).slice(0, 10) : ''
      const ta = computeTimeAgo(d)
      items.push({
        id: `leave-${r.id}`,
        type: 'leave',
        titleKey: 'adminActLeaveReq',
        description: `${r.name || ''} - ${r.type || '연차'} (${dateStr})`,
        descriptionKey: 'adminActLeaveDesc',
        descriptionParams: { name: r.name || '', type: r.type || '연차', date: dateStr },
        time: ta.key === 'date' ? String(ta.param) : '',
        ts: d.getTime(),
        timeKey: ta.key,
        timeParam: ta.param,
      })
    }

    items.sort((a, b) => b.ts - a.ts)
    const unique = items.filter((it, i, arr) => arr.findIndex((x) => x.id === it.id) === i)
    const top = unique.slice(0, 8)

    return NextResponse.json(top, { headers })
  } catch (e) {
    console.error('getAdminRecentActivity:', e)
    return NextResponse.json([], { headers })
  }
}
