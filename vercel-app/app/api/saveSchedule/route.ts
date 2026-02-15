import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseDeleteByFilter, supabaseInsertMany } from '@/lib/supabase-server'

function addDays(dateStr: string, days: number): string {
  const m = dateStr.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return dateStr
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers })
  }

  try {
    const body = await request.json()
    const store = String(body?.store || body?.storeName || '').trim()
    const monday = String(body?.monday || body?.mondayStr || '').trim().slice(0, 10)
    const rows = Array.isArray(body?.rows || body?.scheduleArray) ? (body.rows || body.scheduleArray) : []

    if (!store || !monday) {
      return NextResponse.json(
        { success: false, message: '매장과 기준 월요일이 필요합니다.' },
        { headers }
      )
    }

    const startStr = monday
    const endStr = addDays(monday, 6)

    const existingFilter = `schedule_date=gte.${startStr}&schedule_date=lte.${endStr}&store_name=ilike.${encodeURIComponent(store)}`
    await supabaseDeleteByFilter('schedules', existingFilter)

    if (rows.length === 0) {
      return NextResponse.json(
        { success: true, message: `${store} 해당 주 시간표가 삭제되었습니다.` },
        { headers }
      )
    }

    const toInsert: Record<string, unknown>[] = []
    for (const s of rows) {
      const dateStr = String(s.date || '').trim().slice(0, 10)
      if (!dateStr) continue
      const name = String(s.name || '').trim()
      if (!name) continue
      toInsert.push({
        schedule_date: dateStr,
        store_name: store,
        name,
        plan_in: String(s.pIn || s.plan_in || '09:00').trim(),
        plan_out: String(s.pOut || s.plan_out || '18:00').trim(),
        break_start: String(s.pBS || s.break_start || '').trim(),
        break_end: String(s.pBE || s.break_end || '').trim(),
        plan_in_prev_day: !!s.plan_in_prev_day,
        memo: String(s.remark || s.memo || '').trim() || '스마트스케줄러',
      })
    }

    if (toInsert.length > 0) {
      const CHUNK = 50
      for (let k = 0; k < toInsert.length; k += CHUNK) {
        await supabaseInsertMany('schedules', toInsert.slice(k, k + CHUNK))
      }
    }

    return NextResponse.json(
      { success: true, message: `${store} 주간 시간표가 저장되었습니다!` },
      { headers }
    )
  } catch (e) {
    console.error('saveSchedule:', e)
    return NextResponse.json(
      {
        success: false,
        message: '저장 실패: ' + (e instanceof Error ? e.message : String(e)),
      },
      { headers }
    )
  }
}
