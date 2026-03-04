import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

const TZ = 'Asia/Bangkok'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeName = String(searchParams.get('storeName') || searchParams.get('store') || '').trim()
  const name = String(searchParams.get('name') || '').trim()

  if (!storeName || !name) {
    return NextResponse.json([], { headers })
  }

  try {
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
    // store_name: contains 패턴 사용 (예: "Union Mall" → "CM Union Mall" 매칭)
    const storePattern = '*' + String(storeName).replace(/\*/g, '') + '*'
    const rows = (await supabaseSelectFilter(
      'attendance_logs',
      `store_name=ilike.${encodeURIComponent(storePattern)}&name=ilike.${encodeURIComponent(name)}`,
      { order: 'log_at.desc', limit: 50 }
    )) as { log_at?: string; log_type?: string }[]

    const arr = rows || []

    // 자정 넘어도 미종료 세션(출근 후 퇴근 없음)이 있으면 퇴근 버튼 활성화
    // 가장 최근 퇴근 위치를 찾고, 그 이후에 출근이 있으면 오픈 세션
    let idxOfLastClockOut = -1
    for (let i = 0; i < arr.length; i++) {
      if (String(arr[i].log_type || '').trim() === '퇴근') {
        idxOfLastClockOut = i
        break
      }
    }

    const types: string[] = []

    if (idxOfLastClockOut >= 0) {
      // 퇴근 있음: 퇴근 이후에 출근이 있으면 새 세션(오픈)
      let hasNewSessionAfterClockOut = false
      for (let i = 0; i < idxOfLastClockOut; i++) {
        if (String(arr[i].log_type || '').trim() === '출근') {
          hasNewSessionAfterClockOut = true
          break
        }
      }
      if (!hasNewSessionAfterClockOut) {
        // 마지막 퇴근이 최신 → 당일만 사용 (기존 로직)
        for (const r of arr) {
          const rowDate = r.log_at ? new Date(r.log_at).toLocaleDateString('en-CA', { timeZone: TZ }) : ''
          if (rowDate !== todayStr) continue
          const typ = String(r.log_type || '').trim()
          if (typ && !types.includes(typ)) types.push(typ)
        }
        return NextResponse.json(types, { headers })
      }
    }

    // 오픈 세션: 출근 후 퇴근이 없는 상태 (자정 넘어도 포함)
    // 전날 출근 후 퇴근 누락이면: 출근도 types에 넣어 퇴근 버튼 활성화 (hasClockIn=true)
    for (let i = 0; i < arr.length; i++) {
      const typ = String(arr[i].log_type || '').trim()
      const logAt = arr[i].log_at
      const rowDate = logAt ? new Date(logAt).toLocaleDateString('en-CA', { timeZone: TZ }) : ''
      if (typ === '출근') {
        // 오픈 세션이면 당일/전날 출근 모두 인정 → 퇴근 버튼 활성화
        if (!types.includes(typ)) types.push(typ)
        break
      }
      if (typ && !types.includes(typ)) types.push(typ)
    }

    return NextResponse.json(types, { headers })
  } catch (e) {
    console.error('getTodayAttendanceTypes:', e)
    return NextResponse.json([], { headers })
  }
}
