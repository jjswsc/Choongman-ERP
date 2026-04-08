import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter, supabaseInsert } from '@/lib/supabase-server'
import { parseOr400, submitAttendanceSchema } from '@/lib/api-validate'
import { normalizeEmployeeCodeForMatch } from '@/lib/employee-display-name'
const TZ = 'Asia/Bangkok'

function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ })
}

/** 방콕 기준 현재 시(hour) 0~23. 자정 넘김 퇴근 판별용 */
function getBangkokHour(): number {
  const str = new Date().toLocaleTimeString('en-US', { timeZone: TZ, hour: '2-digit', hour12: false })
  return parseInt(str, 10) || 0
}

/** 날짜 YYYY-MM-DD에 delta일 더한 날짜 */
function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

/** getTodayAttendanceTypes와 동일: `store_name` ILIKE *fragment* (CM 접두·표기 차이 허용) */
function attendanceStoreIlikePattern(storeName: string): string {
  return '*' + String(storeName || '').replace(/\*/g, '') + '*'
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

/**
 * 계획 시각(planVal, 예: "18:00", "02:00")을 dateStr 날짜와 합쳐 방콕 기준 Date 생성.
 * 서버가 UTC라도 plan은 방콕 시각으로 해석해 비교 시 정확한 earlyMin/otMin 산출.
 */
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
  let h = parseInt(m[1], 10)
  const mn = parseInt(m[2], 10)
  const sec = m[3] ? parseInt(m[3], 10) : 0
  let useDateStr = dateStr.trim().slice(0, 10)
  if (h >= 24) {
    const d = new Date(useDateStr + 'T12:00:00Z')
    if (isNaN(d.getTime())) return null
    d.setUTCDate(d.getUTCDate() + 1)
    useDateStr = d.toISOString().slice(0, 10)
    h = h % 24
  }
  // 방콕(UTC+7) 시각으로 해석: "YYYY-MM-DDTHH:mm:ss+07:00"
  const iso = `${useDateStr}T${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}:${String(sec).padStart(2, '0')}+07:00`
  const d = new Date(iso)
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
    const { storeName, name: empNameRaw, type: logType, employeeId } = validated.parsed
    const dataLat = validated.parsed.lat ?? raw.lat
    const dataLng = validated.parsed.lng ?? raw.lng
    let empName = String(empNameRaw || '').trim()
    let empId = employeeId != null && Number.isFinite(Number(employeeId)) ? Math.floor(Number(employeeId)) : 0
    let empCodeNorm = ''
    if (empId > 0) {
      const empRows = (await supabaseSelectFilter(
        'employees',
        `id=eq.${empId}&store=ilike.${encodeURIComponent(storeName)}`,
        { limit: 1, select: 'id,name,employee_code' }
      )) as { id?: number; name?: string; employee_code?: string | null }[]
      const er = empRows?.[0]
      if (!er) {
        return NextResponse.json(
          { success: false, message: '직원 정보를 확인할 수 없습니다. 다시 로그인 후 시도해 주세요.' },
          { headers }
        )
      }
      if (String(er.name || '').trim()) empName = String(er.name || '').trim()
      empCodeNorm = normalizeEmployeeCodeForMatch(String(er.employee_code ?? ''))
    } else {
      // 하위호환: 구버전 세션에 employeeId가 없어도 저장 시점에는 id를 채워 일관성 확보
      const matched = (await supabaseSelectFilter(
        'employees',
        `store=ilike.${encodeURIComponent(storeName)}&name=ilike.${encodeURIComponent(empName)}`,
        { limit: 5, select: 'id,name,employee_code' }
      )) as { id?: number; name?: string; employee_code?: string | null }[]
      if ((matched || []).length === 1) {
        const m = matched[0]
        const inferredId = m.id != null && Number.isFinite(Number(m.id)) ? Math.floor(Number(m.id)) : 0
        if (inferredId > 0) {
          empId = inferredId
          if (String(m.name || '').trim()) empName = String(m.name || '').trim()
          empCodeNorm = normalizeEmployeeCodeForMatch(String(m.employee_code ?? ''))
        }
      }
    }

    const todayStrVal = todayStr()
    const nowTime = new Date()

    const oncePerDayTypes = ['출근', '퇴근', '휴식시작', '휴식종료']
    if (oncePerDayTypes.includes(logType)) {
      const storeIlike = encodeURIComponent(attendanceStoreIlikePattern(storeName))
      let logs: { log_at?: string; log_type?: string }[]
      if (empId > 0) {
        const byIdFilter = `store_name=ilike.${storeIlike}&employee_id=eq.${empId}`
        const byIdRows = (await supabaseSelectFilter('attendance_logs', byIdFilter, {
          order: 'log_at.desc',
          limit: 100,
          select: 'id,log_at,log_type',
        })) as { id?: number; log_at?: string; log_type?: string }[]
        if (empCodeNorm) {
          try {
            const codeLeg = `store_name=ilike.${storeIlike}&employee_code=eq.${encodeURIComponent(empCodeNorm)}&employee_id=is.null`
            const codeRows = (await supabaseSelectFilter('attendance_logs', codeLeg, {
              order: 'log_at.desc',
              limit: 100,
              select: 'id,log_at,log_type',
            })) as { id?: number; log_at?: string; log_type?: string }[]
            const seen = new Set<number>()
            const merged: { log_at?: string; log_type?: string }[] = []
            const push = (r: { id?: number; log_at?: string; log_type?: string }) => {
              const lid = r.id != null && Number.isFinite(Number(r.id)) ? Math.floor(Number(r.id)) : NaN
              if (!Number.isNaN(lid)) {
                if (seen.has(lid)) return
                seen.add(lid)
              }
              merged.push({ log_at: r.log_at, log_type: r.log_type })
            }
            for (const r of byIdRows || []) push(r)
            for (const r of codeRows || []) push(r)
            merged.sort((a, b) => String(b.log_at || '').localeCompare(String(a.log_at || '')))
            logs = merged.slice(0, 100)
          } catch (e) {
            const em = e instanceof Error ? e.message : String(e)
            if (!/employee_code|42703|column/i.test(em)) throw e
            logs = (byIdRows || []).map(({ log_at, log_type }) => ({ log_at, log_type }))
          }
        } else {
          logs = (byIdRows || []).map(({ log_at, log_type }) => ({ log_at, log_type }))
        }
      } else {
        logs = (await supabaseSelectFilter(
          'attendance_logs',
          `store_name=ilike.${storeIlike}&name=ilike.${encodeURIComponent(empName)}`,
          { order: 'log_at.desc', limit: 100, select: 'log_at,log_type' }
        )) as { log_at?: string; log_type?: string }[]
      }
      const todayLogs = (logs || []).filter((r) => {
        const rowDate = r.log_at ? new Date(r.log_at).toLocaleDateString('en-CA', { timeZone: TZ }) : ''
        return rowDate === todayStrVal
      })
      if (logType === '퇴근') {
        // [퇴근 특별 처리] 퇴근→출근 시나리오(실수로 퇴근 먼저 누른 경우): 새 근무 세션으로 간주하여 퇴근 재기록 허용
        const lastOut = todayLogs.find((r) => String(r.log_type || '').trim() === '퇴근')
        const lastIn = todayLogs.find((r) => String(r.log_type || '').trim() === '출근')
        if (lastOut && lastIn && new Date(lastIn.log_at!).getTime() > new Date(lastOut.log_at!).getTime()) {
          // 출근이 퇴근보다 더 최근 → 퇴근 후 재출근한 새 세션 → 퇴근 허용
        } else if (lastOut) {
          return NextResponse.json(
            { success: false, message: '오늘 이미 [퇴근] 기록이 있습니다. 하루에 한 번만 기록할 수 있습니다.' },
            { headers }
          )
        }
      } else {
        const hasDuplicate = todayLogs.some((r) => String(r.log_type || '').trim() === logType)
        if (hasDuplicate) {
          return NextResponse.json(
            { success: false, message: `오늘 이미 [${logType}] 기록이 있습니다. 하루에 한 번만 기록할 수 있습니다.` },
            { headers }
          )
        }
      }
      // 퇴근·휴식시작·휴식종료(재개)는 출근 기록이 있어야만 기록 가능
      // 1) 당일 출근, 2) 자정 넘김 00~07시: 전날 출근, 3) 미종료 세션: 전날 출근 후 퇴근 누락 → 익일 퇴근 허용
      if (logType === '퇴근' || logType === '휴식시작' || logType === '휴식종료') {
        const bangkokHour = getBangkokHour()
        const validDates = [todayStrVal]
        if (bangkokHour >= 0 && bangkokHour <= 7) {
          validDates.push(addDays(todayStrVal, -1))
        }
        const hasInValidDate = (logs || []).some(
          (r) => {
            const rowDate = r.log_at ? new Date(r.log_at).toLocaleDateString('en-CA', { timeZone: TZ }) : ''
            return validDates.includes(rowDate) && String(r.log_type || '').trim() === '출근'
          }
        )
        // 퇴근만: 미종료 세션(출근 후 퇴근 없음)이면 전날 출근도 인정 (getTodayAttendanceTypes와 동일한 오픈 세션 판단)
        let hasOpenSession = false
        if (logType === '퇴근' && !hasInValidDate) {
          const lastOut = (logs || []).find((r) => String(r.log_type || '').trim() === '퇴근')
          const lastIn = (logs || []).find((r) => String(r.log_type || '').trim() === '출근')
          hasOpenSession = !!lastIn && (!lastOut || new Date(lastIn.log_at!).getTime() > new Date(lastOut.log_at!).getTime())
        }
        if (!hasInValidDate && !hasOpenSession) {
          return NextResponse.json(
            {
              success: false,
              message: '출근을 먼저 기록해 주세요. 오늘 출근 기록이 없으면 휴식·재개·퇴근을 기록할 수 없습니다.',
            },
            { headers }
          )
        }
      }
    }

    let targetLat = 0,
      targetLng = 0
    const vendors = (await supabaseSelect('vendors', { limit: 2000 })) as {
      id?: number
      gps_name?: string
      name?: string
      type?: string
      lat?: string | number
      lng?: string | number
    }[]
    const storeNorm = String(storeName || '').trim().toLowerCase()
    // 매칭 후보: 직원 store + CM 접두사 변형 (CM Office ↔ Office 등)
    const storeCandidates = [storeNorm]
    if (storeNorm.startsWith('cm ')) {
      storeCandidates.push(storeNorm.replace(/^cm\s+/, '').trim())
    } else if (storeNorm) {
      storeCandidates.push('cm ' + storeNorm)
    }
    const isOfficeStore = storeNorm.includes('office') || storeNorm.includes('오피스') || storeNorm.includes('본사') || storeNorm.includes('본점')
    // gps_name/name이 후보 중 하나와 일치할 때 매칭
    for (const v of vendors || []) {
      const gpsName = String(v.gps_name || '').trim()
      const name = String(v.name || '').trim()
      const gpsLower = gpsName.toLowerCase()
      const nameLower = name.toLowerCase()
      const matched =
        storeCandidates.some((c) => gpsLower === c) ||
        (gpsName === '' && storeCandidates.some((c) => nameLower === c))
      if (matched) {
        const lat = Number(v.lat) || 0
        const lng = Number(v.lng) || 0
        if (lat !== 0 || lng !== 0) {
          targetLat = lat
          targetLng = lng
          break
        }
      }
    }
    // 오피스 매장인데 위에서 매칭 안 됐으면, 본사(type=본사/Head Office) 좌표 사용
    if (targetLat === 0 && targetLng === 0 && isOfficeStore) {
      const headOffice = (vendors || []).find(
        (v) => String(v.type || '').toLowerCase().includes('본사') || String(v.type || '').toLowerCase().includes('head office')
      )
      if (headOffice) {
        const lat = Number(headOffice.lat) || 0
        const lng = Number(headOffice.lng) || 0
        if (lat !== 0 || lng !== 0) {
          targetLat = lat
          targetLng = lng
        }
      }
    }
    const userGpsInvalid = dataLat === 'Unknown' || dataLat === '' || dataLng === '' || dataLng === 'Unknown'
    if (targetLat !== 0 || targetLng !== 0) {
      // 매장에 GPS 등록된 경우: 사용자 GPS 필수 (원격 출근/퇴근 방지)
      if (userGpsInvalid) {
        return NextResponse.json(
          {
            success: false,
            message: `❌ 위치 확인 실패! GPS를 켜고 매장 근처에서 다시 시도해 주세요. (현재 위치를 확인할 수 없습니다)`,
          },
          { headers }
        )
      }
      const dist = calcDistance(
        targetLat,
        targetLng,
        Number(dataLat),
        Number(dataLng)
      )
      // 매장 999m 밖이면 기록 거부 (출근/퇴근/휴식 공통)
      if (dist > 999) {
        return NextResponse.json(
          {
            success: false,
            message: `❌ 위치 부적합! 매장 근처(999m 이내)가 아닙니다. (현재 거리: ${Math.round(dist)}m)`,
          },
          { headers }
        )
      }
    } else if (targetLat === 0 && targetLng === 0) {
      // 본사·매장 공통: GPS 미등록 시 기록 거부
      return NextResponse.json(
        {
          success: false,
          message: `❌ ${storeName}의 위치(GPS)가 등록되지 않아 출퇴근 기록이 불가합니다. 관리자에게 문의해 주세요.`,
        },
        { headers }
      )
    }
    // GPS 미확인 시에도 승인 대기 없음 (매장 폰/태블릿 활용 정책)
    const needManagerApproval = false

    let planIn = '',
      planOut = '',
      planBS = '',
      planBE = ''
    const scheduleFilter =
      empId > 0
        ? `schedule_date=eq.${todayStrVal}&store_name=ilike.${encodeURIComponent(storeName)}&employee_id=eq.${empId}`
        : `schedule_date=eq.${todayStrVal}&store_name=ilike.${encodeURIComponent(storeName)}&name=ilike.${encodeURIComponent(empName)}`
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
      const prevDayFilter =
        empId > 0
          ? `schedule_date=eq.${tomorrow}&plan_in_prev_day=eq.true&store_name=ilike.${encodeURIComponent(storeName)}&employee_id=eq.${empId}`
          : `schedule_date=eq.${tomorrow}&plan_in_prev_day=eq.true&store_name=ilike.${encodeURIComponent(storeName)}&name=ilike.${encodeURIComponent(empName)}`
      schRows = (await supabaseSelectFilter('schedules', prevDayFilter, { limit: 5 })) as { plan_in?: string; plan_out?: string; break_start?: string; break_end?: string; plan_in_prev_day?: boolean }[]
    }
    let usedYesterdaySchedule = false
    // 퇴근: 당일 스케줄 없으면 전날(자정 넘는 근무) 스케줄 확인
    if ((!schRows || schRows.length === 0) && logType === '퇴근') {
      const yesterday = (() => {
        const d = new Date(todayStrVal + 'T12:00:00Z')
        d.setUTCDate(d.getUTCDate() - 1)
        return d.toISOString().slice(0, 10)
      })()
      const yesterdayFilter =
        empId > 0
          ? `schedule_date=eq.${yesterday}&store_name=ilike.${encodeURIComponent(storeName)}&employee_id=eq.${empId}`
          : `schedule_date=eq.${yesterday}&store_name=ilike.${encodeURIComponent(storeName)}&name=ilike.${encodeURIComponent(empName)}`
      schRows = (await supabaseSelectFilter('schedules', yesterdayFilter, { limit: 5 })) as { plan_in?: string; plan_out?: string; break_start?: string; break_end?: string; plan_in_prev_day?: boolean }[]
      usedYesterdaySchedule = !!(schRows && schRows.length > 0)
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
      // 전날 스케줄 사용 시: plan_in_prev_day면 익일 퇴근(오늘날짜), 아니면 당일 퇴근(전날날짜)
      const pOutDateStr =
        usedYesterdaySchedule && !schRows?.[0]?.plan_in_prev_day
          ? (() => {
              const d = new Date(todayStrVal + 'T12:00:00Z')
              d.setUTCDate(d.getUTCDate() - 1)
              return d.toISOString().slice(0, 10)
            })()
          : todayStrVal
      const pOutDate = parsePlanTimeToDate(pOutDateStr, planOut)
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
      const storeIlikeResume = encodeURIComponent(attendanceStoreIlikePattern(storeName))
      const allLogsFilter =
        empId > 0
          ? `store_name=ilike.${storeIlikeResume}&employee_id=eq.${empId}`
          : `name=ilike.${encodeURIComponent(empName)}`
      const allLogs = (await supabaseSelectFilter('attendance_logs', allLogsFilter, {
        order: 'log_at.desc',
        limit: 50,
        select: 'log_at,log_type',
      })) as { log_at?: string; log_type?: string }[]
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

    const payload: Record<string, unknown> = {
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
    }
    if (empId > 0) payload.employee_id = empId
    if (empCodeNorm) payload.employee_code = empCodeNorm
    let toInsert: Record<string, unknown> = { ...payload }
    for (;;) {
      try {
        await supabaseInsert('attendance_logs', toInsert)
        break
      } catch (e) {
        const em = e instanceof Error ? e.message : String(e)
        if (/employee_code|42703|column/i.test(em) && 'employee_code' in toInsert) {
          const next = { ...toInsert }
          delete next.employee_code
          toInsert = next
          continue
        }
        if (/employee_id|42703|column/i.test(em) && 'employee_id' in toInsert) {
          const next = { ...toInsert }
          delete next.employee_id
          toInsert = next
          continue
        }
        throw e
      }
    }

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
