import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseInsert } from '@/lib/supabase-server'

/** plan 문자열(예: "18:00")을 해당 날짜의 Date로 변환 */
function parsePlanToDate(dateStr: string, planVal: string): Date | null {
  if (!dateStr || !planVal || typeof planVal !== 'string') return null
  const s = planVal.trim()
  const m = s.match(/(\d{1,2})\s*[:\s]\s*(\d{1,2})/)
  if (!m) return null
  const h = parseInt(m[1], 10)
  const mn = parseInt(m[2], 10)
  const d = new Date(dateStr + 'T12:00:00')
  if (isNaN(d.getTime())) return null
  d.setHours(h, mn, 0, 0)
  return d
}

function calcBreakMin(breakStart: string, breakEnd: string): number {
  if (!breakStart || !breakEnd) return 0
  const m1 = breakStart.trim().match(/(\d{1,2})\s*[:\s]\s*(\d{1,2})/)
  const m2 = breakEnd.trim().match(/(\d{1,2})\s*[:\s]\s*(\d{1,2})/)
  if (!m1 || !m2) return 0
  const bs = parseInt(m1[1], 10) * 60 + parseInt(m1[2], 10)
  const be = parseInt(m2[1], 10) * 60 + parseInt(m2[2], 10)
  return Math.max(0, be - bs)
}

/**
 * 퇴근 미기록 건에 대해 강제퇴근 인정(퇴근 로그 1건 생성).
 * 해당 날짜에 출근은 있으나 퇴근이 없을 때만 호출.
 */
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
    const dateStr = String(body?.date || body?.dateStr || '').trim().slice(0, 10)
    const storeName = String(body?.store || body?.storeName || '').trim()
    const empName = String(body?.name || body?.empName || '').trim()
    const userStore = String(body?.userStore || '').trim()
    const userRole = String(body?.userRole || '').toLowerCase()

    if (!dateStr || dateStr.length < 10 || !storeName || !empName) {
      return NextResponse.json(
        { success: false, message: '날짜, 매장, 이름이 필요합니다.' },
        { headers }
      )
    }

    const isManager = userRole === 'manager'
    if (isManager && userStore && String(storeName).trim() !== userStore) {
      return NextResponse.json(
        { success: false, message: '해당 매장만 처리할 수 있습니다.' },
        { headers }
      )
    }

    const nextD = new Date(dateStr + 'T12:00:00')
    nextD.setDate(nextD.getDate() + 1)
    const nextDayStr = nextD.toISOString().slice(0, 10)
    const attFilter = `store_name=ilike.${encodeURIComponent(storeName)}&name=ilike.${encodeURIComponent(empName)}&log_at=gte.${dateStr}&log_at=lt.${nextDayStr}`
    const attRows = (await supabaseSelectFilter('attendance_logs', attFilter, { limit: 20 })) as { log_type?: string }[]
    const hasIn = (attRows || []).some((r) => String(r.log_type || '').trim() === '출근')
    const hasOut = (attRows || []).some((r) => String(r.log_type || '').trim() === '퇴근')

    if (!hasIn) {
      return NextResponse.json(
        { success: false, message: '해당 날짜에 출근 기록이 없습니다.' },
        { headers }
      )
    }
    if (hasOut) {
      return NextResponse.json(
        { success: false, message: '이미 퇴근 기록이 있습니다.' },
        { headers }
      )
    }

    const schFilter = `schedule_date=eq.${dateStr}&store_name=ilike.${encodeURIComponent(storeName)}&name=ilike.${encodeURIComponent(empName)}`
    const schRows = (await supabaseSelectFilter('schedules', schFilter, { limit: 1 })) as {
      plan_out?: string
      break_start?: string
      break_end?: string
      plan_in_prev_day?: boolean
    }[]

    const planOut = (schRows?.[0]?.plan_out || '18:00').trim()
    const planBS = String(schRows?.[0]?.break_start || '').trim()
    const planBE = String(schRows?.[0]?.break_end || '').trim()
    const planInPrevDay = !!schRows?.[0]?.plan_in_prev_day

    let outDateStr = dateStr
    if (planInPrevDay) {
      const d = new Date(dateStr + 'T12:00:00')
      d.setDate(d.getDate() + 1)
      outDateStr = d.toISOString().slice(0, 10)
    }
    const outDate = parsePlanToDate(outDateStr, planOut)
    if (!outDate || isNaN(outDate.getTime())) {
      return NextResponse.json(
        { success: false, message: '스케줄 퇴근 시간을 파싱할 수 없습니다.' },
        { headers }
      )
    }

    const breakMin = calcBreakMin(planBS, planBE)

    await supabaseInsert('attendance_logs', {
      log_at: outDate.toISOString(),
      store_name: storeName,
      name: empName,
      log_type: '퇴근',
      lat: '',
      lng: '',
      planned_time: planOut,
      late_min: 0,
      early_min: 0,
      ot_min: 0,
      break_min: breakMin,
      reason: '',
      status: '강제퇴근(승인)',
      approved: '승인완료',
    })

    return NextResponse.json(
      { success: true, message: '퇴근 미기록 인정이 완료되었습니다.' },
      { headers }
    )
  } catch (e) {
    console.error('approveNoClockOut:', e)
    return NextResponse.json(
      {
        success: false,
        message: '처리 실패: ' + (e instanceof Error ? e.message : String(e)),
      },
      { headers }
    )
  }
}
