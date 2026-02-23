/**
 * 기간별 매출 (월/주/일/요일별). 결제 금액 기준. pos 필터 지원.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

type Row = { sales_datetime?: string; payment_amount?: number; pos?: string }

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
    const importId = searchParams.get('importId')?.trim()
    const groupBy = searchParams.get('groupBy') || 'day'
    const pos = searchParams.get('pos')?.trim()

    if (!importId) {
      return NextResponse.json({ success: false, message: 'importId 필요' }, { headers })
    }

    let filter = `import_id=eq.${encodeURIComponent(importId)}&payment_amount=gt.0`
    if (pos) filter += `&pos=eq.${encodeURIComponent(pos)}`

    const rows = (await supabaseSelectFilter('pos_sales_details', filter, {
      limit: 50000,
      select: 'sales_datetime,payment_amount',
    })) as Row[]

    const salesByKey: Record<string, number> = {}

    for (const r of rows) {
      const dt = r.sales_datetime
      const amt = Number(r.payment_amount) || 0
      if (!dt) continue

      const d = new Date(dt)

      if (groupBy === 'month') {
        const k = dt.slice(0, 7)
        salesByKey[k] = (salesByKey[k] || 0) + amt
      } else if (groupBy === 'week') {
        const start = getStartOfWeek(d)
        const end = new Date(start)
        end.setUTCDate(end.getUTCDate() + 6)
        const k = `${start.toISOString().slice(0, 10)}~${end.toISOString().slice(0, 10)}`
        salesByKey[k] = (salesByKey[k] || 0) + amt
      } else if (groupBy === 'dow') {
        const dow = d.getUTCDay()
        salesByKey[String(dow)] = (salesByKey[String(dow)] || 0) + amt
      } else {
        const k = dt.slice(0, 10)
        salesByKey[k] = (salesByKey[k] || 0) + amt
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
