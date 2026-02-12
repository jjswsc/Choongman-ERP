import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/** yearMonth: yyyy-MM → 해당 월의 시작일, 다음달 1일(미포함용) */
function getMonthRange(yearMonth: string): { start: string; endExclusive: string } {
  const m = yearMonth.trim().match(/^(\d{4})-(\d{1,2})/)
  if (!m) return { start: '', endExclusive: '' }
  const y = parseInt(m[1], 10)
  const mo = parseInt(m[2], 10)
  const start = `${y}-${String(mo).padStart(2, '0')}-01`
  const nextMonthDate = new Date(y, mo, 1)
  const endExclusive = nextMonthDate.toISOString().slice(0, 10)
  return { start, endExclusive }
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeName = String(searchParams.get('store') || searchParams.get('storeName') || '').trim()
  const userName = String(searchParams.get('name') || searchParams.get('userName') || '').trim()
  const yearMonth = String(searchParams.get('yearMonth') || searchParams.get('month') || '').trim()

  if (!storeName || !userName || !yearMonth) {
    return NextResponse.json(
      { normalDays: 0, otHours: 0, otDays: 0, lateMinutes: 0, lateDays: 0 },
      { headers }
    )
  }

  const { start, endExclusive } = getMonthRange(yearMonth)
  if (!start || !endExclusive) {
    return NextResponse.json(
      { normalDays: 0, otHours: 0, otDays: 0, lateMinutes: 0, lateDays: 0 },
      { headers }
    )
  }

  try {
    type AttRow = {
      log_at?: string
      store_name?: string
      name?: string
      log_type?: string
      late_min?: number
      early_min?: number
      ot_min?: number
      break_min?: number
    }

    const filter = `store_name=ilike.${encodeURIComponent(storeName)}&name=ilike.${encodeURIComponent(userName)}&log_at=gte.${start}&log_at=lt.${endExclusive}`
    const rows = (await supabaseSelectFilter('attendance_logs', filter, {
      order: 'log_at.asc',
      limit: 500,
    })) as AttRow[]

    const byKey: Record<
      string,
      { lateMin: number; otMin: number; hasOut: boolean }
    > = {}

    for (const r of rows || []) {
      const rowDate = toDateStr(r.log_at)
      if (!rowDate || rowDate < start || rowDate >= endExclusive) continue

      const key = rowDate
      if (!byKey[key]) {
        byKey[key] = { lateMin: 0, otMin: 0, hasOut: false }
      }
      const rec = byKey[key]
      const type = String(r.log_type || '').trim()

      if (type === '출근') {
        rec.lateMin = Math.max(rec.lateMin, Number(r.late_min) || 0)
      } else if (type === '퇴근') {
        rec.hasOut = true
        rec.otMin = Math.max(rec.otMin, Number(r.ot_min) || 0)
      }
    }

    let normalDays = 0
    let otMinutes = 0
    let otDays = 0
    let lateMinutes = 0
    let lateDays = 0

    for (const rec of Object.values(byKey)) {
      if (rec.lateMin > 0) {
        lateMinutes += rec.lateMin
        lateDays += 1
      }
      if (rec.otMin > 0) {
        otMinutes += rec.otMin
        otDays += 1
      }
      if (rec.hasOut && rec.lateMin === 0) {
        normalDays += 1
      }
    }

    return NextResponse.json(
      {
        normalDays,
        otHours: Math.round((otMinutes / 60) * 10) / 10,
        otDays,
        lateMinutes,
        lateDays,
      },
      { headers }
    )
  } catch (e) {
    console.error('getMyAttendanceSummary:', e)
    return NextResponse.json(
      { normalDays: 0, otHours: 0, otDays: 0, lateMinutes: 0, lateDays: 0 },
      { headers }
    )
  }
}
