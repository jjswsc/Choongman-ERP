import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter, supabaseInsert } from '@/lib/supabase-server'
import { parseOr400, submitAttendanceSchema } from '@/lib/api-validate'

const TZ = 'Asia/Bangkok'

function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ })
}

function calcDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3
  const radLat1 = (lat1 * Math.PI) / 180
  const radLat2 = (lat2 * Math.PI) / 180
  const diffLat = ((lat2 - lat1) * Math.PI) / 180
  const diffLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(diffLat / 2) ** 2 +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(diffLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function parsePlanTimeToDate(
  dateStr: string,
  planVal: string | unknown
): Date | null {
  if (!dateStr || planVal == null || (typeof planVal === 'string' && planVal.trim() === ''))
    return null
  const s = String(planVal).trim()
  if (!s) return null
  const m = s.match(/(\d{1,2})\s*:\s*(\d{1,2})(?:\s*:\s*(\d{1,2}))?/)
  if (!m) return null
  const h = parseInt(m[1], 10)
  const mn = parseInt(m[2], 10)
  const sec = m[3] ? parseInt(m[3], 10) : 0
  const d = new Date(dateStr + 'T12:00:00')
  if (isNaN(d.getTime())) return null
  d.setHours(h, mn, sec, 0)
  return isNaN(d.getTime()) ? null : d
}

function safeMinutes(val: number): number {
  const n = Number(val)
  if (typeof n !== 'number' || isNaN(n) || !isFinite(n)) return 0
  return Math.floor(n)
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers })

  try {
    const raw = await request.json()
    const bodyForValidation = { ...raw, storeName: raw.storeName || raw.store || '' }
    const validated = parseOr400(submitAttendanceSchema, bodyForValidation, headers)
    if (validated.errorResponse) return validated.errorResponse
    const { storeName, name: empName, type: logType } = validated.parsed
    const dataLat = validated.parsed.lat ?? raw.lat
    const dataLng = validated.parsed.lng ?? raw.lng

    const todayStrVal = todayStr()
    const nowTime = new Date()

    const oncePerDayTypes = ['출근', '퇴근', '휴식시작', '휴식종료']
    if (oncePerDayTypes.includes(logType)) {
      const logs = (await supabaseSelectFilter(
        'attendance_logs',
        `store_name=ilike.${encodeURIComponent(storeName)}&name=ilike.${encodeURIComponent(empName)}`,
        { order: 'log_at.desc', limit: 100 }
      )) as { log_at?: string; log_type?: string }[]
      for (const r of logs || []) {
        const rowDate = r.log_at
          ? new Date(r.log_at).toLocaleDateString('en-CA', { timeZone: TZ })
          : ''
        if (
          rowDate === todayStrVal &&
          String(r.log_type || '').trim() === logType
        ) {
          return NextResponse.json(
            {
              success: false,
              message: `오늘 이미 [${logType}] 기록이 있습니다. 하루에 한 번만 기록할 수 있습니다.`,
            },
            { headers }
          )
        }
      }
    }

    let targetLat = 0,
      targetLng = 0,
      locationOk = false
    const vendors = (await supabaseSelect('vendors', { limit: 2000 })) as {
      gps_name?: string
      name?: string
      lat?: string | number
      lng?: string | number
    }[]
    for (const v of vendors || []) {
      const gpsName = String(v.gps_name || '').trim()
      const name = String(v.name || '').trim()
      if (gpsName === storeName || (gpsName === '' && name === storeName)) {
        targetLat = Number(v.lat) || 0
        targetLng = Number(v.lng) || 0
        if (targetLat !== 0 || targetLng !== 0) break
      }
    }
    if (
      (targetLat !== 0 || targetLng !== 0) &&
      dataLat !== 'Unknown' &&
      dataLat !== '' &&
      dataLng !== '' &&
      dataLng !== 'Unknown'
    ) {
      const dist = calcDistance(
        targetLat,
        targetLng,
        Number(dataLat),
        Number(dataLng)
      )
      if (dist <= 100) locationOk = true
    }
    // GPS 미확인 시에도 승인 대기 없음 (매장 폰/태블릿 활용 정책)
    const needManagerApproval = false

    let planIn = '',
      planOut = '',
      planBS = '',
      planBE = ''
    const scheduleFilter = `schedule_date=eq.${todayStrVal}&store_name=ilike.${encodeURIComponent(storeName)}&name=ilike.${encodeURIComponent(empName)}`
    let schRows = (await supabaseSelectFilter(
      'schedules',
      scheduleFilter,
      { limit: 5 }
    )) as { plan_in?: string; plan_out?: string; break_start?: string; break_end?: string; plan_in_prev_day?: boolean }[]
    if ((!schRows || schRows.length === 0) && logType === '출근') {
      const tomorrow = (() => {
        const d = new Date(todayStrVal + 'T12:00:00')
        d.setDate(d.getDate() + 1)
        return d.toISOString().slice(0, 10)
      })()
      const prevDayFilter = `schedule_date=eq.${tomorrow}&plan_in_prev_day=eq.true&store_name=ilike.${encodeURIComponent(storeName)}&name=ilike.${encodeURIComponent(empName)}`
      schRows = (await supabaseSelectFilter('schedules', prevDayFilter, { limit: 5 })) as { plan_in?: string; plan_out?: string; break_start?: string; break_end?: string; plan_in_prev_day?: boolean }[]
    }
    if (schRows && schRows.length > 0) {
      planIn = String(schRows[0].plan_in || '').trim()
      planOut = String(schRows[0].plan_out || '').trim()
      planBS = String(schRows[0].break_start || '').trim()
      planBE = String(schRows[0].break_end || '').trim()
    }

    let lateMin = 0,
      earlyMin = 0,
      otMin = 0,
      breakMin = 0,
      status = '정상',
      planTime = ''
    if (logType === '출근' && planIn) {
      planTime = planIn
      const pInDate = parsePlanTimeToDate(todayStrVal, planIn)
      if (pInDate && nowTime > pInDate) {
        lateMin = safeMinutes((nowTime.getTime() - pInDate.getTime()) / (1000 * 60))
        if (lateMin > 1) status = '지각'
      }
    } else if (logType === '퇴근' && planOut) {
      planTime = planOut
      const pOutDate = parsePlanTimeToDate(todayStrVal, planOut)
      if (pOutDate) {
        if (nowTime < pOutDate) {
          earlyMin = safeMinutes(
            (pOutDate.getTime() - nowTime.getTime()) / (1000 * 60)
          )
          status = '조퇴'
        } else {
          otMin = safeMinutes(
            (nowTime.getTime() - pOutDate.getTime()) / (1000 * 60)
          )
          if (otMin >= 30) status = '연장'
        }
      }
    } else if (logType === '휴식종료') {
      const allLogs = (await supabaseSelectFilter(
        'attendance_logs',
        `name=ilike.${encodeURIComponent(empName)}`,
        { order: 'log_at.desc', limit: 50 }
      )) as { log_at?: string; log_type?: string }[]
      for (const r of allLogs || []) {
        const rowDate = r.log_at
          ? new Date(r.log_at).toLocaleDateString('en-CA', { timeZone: TZ })
          : ''
        if (
          rowDate === todayStrVal &&
          String(r.log_type || '').trim() === '휴식시작'
        ) {
          const actualStart = new Date(r.log_at || '')
          breakMin = isNaN(actualStart.getTime())
            ? 0
            : safeMinutes(
                (nowTime.getTime() - actualStart.getTime()) / (1000 * 60)
              )
          if (planBS && planBE) {
            const pBSDate = parsePlanTimeToDate(todayStrVal, planBS)
            const pBEDate = parsePlanTimeToDate(todayStrVal, planBE)
            if (pBSDate && pBEDate) {
              const planDur = safeMinutes(
                (pBEDate.getTime() - pBSDate.getTime()) / (1000 * 60)
              )
              status = breakMin > planDur ? '휴게초과' : '휴게정상'
            }
          }
          break
        }
      }
    }

    if (needManagerApproval) status = '위치미확인(승인대기)'

    await supabaseInsert('attendance_logs', {
      log_at: nowTime.toISOString(),
      store_name: storeName,
      name: empName,
      log_type: logType,
      lat: String(dataLat != null ? dataLat : '').trim(),
      lng: String(dataLng != null ? dataLng : '').trim(),
      planned_time: planTime.trim(),
      late_min: lateMin,
      early_min: earlyMin,
      ot_min: otMin,
      break_min: breakMin,
      reason: '',
      status,
      approved: '대기',
    })

    if (needManagerApproval) {
      return NextResponse.json(
        { success: true, code: 'ATT_GPS_PENDING', message: '위치 확인 대기 중입니다.' },
        { headers }
      )
    }
    return NextResponse.json(
      { success: true, message: `✅ ${logType} 완료! (${status})` },
      { headers }
    )
  } catch (e) {
    console.error('submitAttendance:', e)
    return NextResponse.json(
      {
        success: false,
        message:
          '❌ 오류: ' + (e instanceof Error ? e.message : String(e)),
      },
      { headers: new Headers({ 'Access-Control-Allow-Origin': '*' }) }
    )
  }
}
