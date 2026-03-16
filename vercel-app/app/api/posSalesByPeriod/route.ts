/**
 * 기간별 매출 (월/주/일/요일별). pos_orders 기반. 결제 금액(total) 기준. pos 필터 지원.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { bangkokDateRangeToUtc, toDateStrBangkok, getDayOfWeekBangkok } from '@/lib/attendance-utils'

const COMPLETED_STATUSES = ['completed', 'paid', 'ready']

type Row = { created_at?: string; total?: number; store_code?: string; status?: string }

function getStartOfWeek(d: Date): Date {
  const x = new Date(d)
  const day = x.getUTCDay()
  x.setUTCDate(x.getUTCDate() - day)
  x.setUTCHours(0, 0, 0, 0)
  return x
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(request.url)
    const startStr = searchParams.get('startStr')?.trim()
    const endStr = searchParams.get('endStr')?.trim()
    const groupBy = searchParams.get('groupBy') || 'day'
    const pos = searchParams.get('pos')?.trim()

    if (!startStr || !endStr) {
      return NextResponse.json({ success: false, message: 'startStr, endStr 필요' }, { headers })
    }

    const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startStr, endStr)
    let filter = `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}`
    if (pos && pos !== 'All') filter += `&store_code=ilike.${encodeURIComponent(pos)}`

    const rows = (await supabaseSelectFilter('pos_orders', filter, {
      limit: 50000,
      select: 'created_at,total,store_code,status',
    })) as Row[]

    const salesByKey: Record<string, number> = {}

    for (const r of rows) {
      if (!COMPLETED_STATUSES.includes(String(r.status ?? ''))) continue
      const dt = r.created_at
      const amt = Number(r.total) || 0
      if (!dt) continue

      const d = new Date(dt)
      const bkkDate = toDateStrBangkok(dt)
      if (!bkkDate) continue

      if (groupBy === 'month') {
        const k = bkkDate.slice(0, 7)
        salesByKey[k] = (salesByKey[k] || 0) + amt
      } else if (groupBy === 'week') {
        const start = getStartOfWeek(d)
        const end = new Date(start)
        end.setUTCDate(end.getUTCDate() + 6)
        const k = `${start.toISOString().slice(0, 10)}~${end.toISOString().slice(0, 10)}`
        salesByKey[k] = (salesByKey[k] || 0) + amt
      } else if (groupBy === 'dow') {
        const dow = getDayOfWeekBangkok(bkkDate)
        salesByKey[String(dow)] = (salesByKey[String(dow)] || 0) + amt
      } else {
        salesByKey[bkkDate] = (salesByKey[bkkDate] || 0) + amt
      }
    }

    const dowLabels: Record<number, string> = {
      0: '일',
      1: '월',
      2: '화',
      3: '수',
      4: '목',
      5: '금',
      6: '토',
    }

    let result: { label: string; key: string; sales: number }[]
    if (groupBy === 'month') {
      result = Object.entries(salesByKey)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => ({ label: k, key: k, sales: v }))
    } else if (groupBy === 'week') {
      result = Object.entries(salesByKey)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => ({ label: k, key: k, sales: v }))
    } else if (groupBy === 'dow') {
      result = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
        label: dowLabels[dow],
        key: String(dow),
        sales: salesByKey[String(dow)] || 0,
      }))
    } else {
      result = Object.entries(salesByKey)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => ({ label: k, key: k, sales: v }))
    }

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('posSalesByPeriod:', e)
    return NextResponse.json([], { headers })
  }
}
