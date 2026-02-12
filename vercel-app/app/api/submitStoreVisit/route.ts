import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter, supabaseInsert } from '@/lib/supabase-server'

const TZ = 'Asia/Bangkok'

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

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const data = (await request.json()) as {
      userName?: string
      storeName?: string
      type?: string
      purpose?: string
      lat?: string | number
      lng?: string | number
    }
    const storeNameTrim = String(data.storeName || '').trim()
    const visitType = String(data.type || '').trim()

    if (!storeNameTrim || !data.userName) {
      return NextResponse.json(
        { success: false, msg: '매장과 사용자 정보가 필요합니다.' },
        { headers }
      )
    }

    if (
      visitType !== '방문시작' &&
      visitType !== '방문종료' &&
      visitType !== '강제 방문시작' &&
      visitType !== '강제 방문종료'
    ) {
      return NextResponse.json(
        { success: false, msg: '유효하지 않은 방문 유형입니다.' },
        { headers }
      )
    }

    if (
      visitType === '방문시작' ||
      visitType === '강제 방문시작'
    ) {
      const vendors = (await supabaseSelect('vendors', { limit: 2000 })) as {
        gps_name?: string
        name?: string
        lat?: string | number
        lng?: string | number
      }[]
      let targetLat = 0,
        targetLng = 0
      for (const v of vendors || []) {
        const gpsName = String(v.gps_name || '').trim()
        const name = String(v.name || '').trim()
        if (gpsName === storeNameTrim || (gpsName === '' && name === storeNameTrim)) {
          targetLat = Number(v.lat) || 0
          targetLng = Number(v.lng) || 0
          if (targetLat !== 0 || targetLng !== 0) break
        }
      }
      if (
        targetLat !== 0 ||
        targetLng !== 0
      ) {
        const lat = Number(data.lat)
        const lng = Number(data.lng)
        if (
          data.lat !== 'Unknown' &&
          data.lat !== '' &&
          data.lng !== '' &&
          data.lng !== 'Unknown' &&
          !isNaN(lat) &&
          !isNaN(lng)
        ) {
          const distance = calcDistance(targetLat, targetLng, lat, lng)
          if (distance > 100) {
            return NextResponse.json(
              {
                success: false,
                msg: `❌ 위치 부적합! 매장 근처(100m 이내)가 아닙니다. (현재 거리: ${Math.round(distance)}m)`,
              },
              { headers }
            )
          }
        }
      }
    }

    const now = new Date()
    const dateStr = now.toLocaleDateString('en-CA', { timeZone: TZ })
    const timeStr = now.toLocaleTimeString('en-GB', {
      timeZone: TZ,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    let durationMin: number | null = null

    if (visitType === '방문종료' || visitType === '강제 방문종료') {
      const searchName = String(data.userName || '').trim()
      const searchStore = String(data.storeName || '').trim()
      // 방문시작 또는 강제 방문시작 둘 다 검색 (최신 2건 가져와서 방문시작 유형만 사용)
      const rawRecent = (await supabaseSelectFilter('store_visits', `name=eq.${encodeURIComponent(searchName)}&store_name=eq.${encodeURIComponent(searchStore)}`, {
        order: 'visit_date.desc,visit_time.desc',
        limit: 10,
      })) as { visit_type?: string; visit_date?: string; visit_time?: string }[]
      const recent = (rawRecent || []).filter(
        (r) => r.visit_type === '방문시작' || r.visit_type === '강제 방문시작'
      ).slice(0, 1)
      if (recent && recent.length > 0) {
        const startRow = recent[0]
        const startDateStr = String(startRow.visit_date || '').substring(0, 10)
        const startTimeStr = String(startRow.visit_time || '').trim()
        const timePart = (startTimeStr.length >= 8 ? startTimeStr : startTimeStr + '00').substring(0, 8)
        // Asia/Bangkok (UTC+7) 로 저장된 시간을 올바르게 해석
        const startDateTime = new Date(startDateStr + 'T' + timePart + '+07:00')
        const diffMs = isNaN(startDateTime.getTime())
          ? 0
          : now.getTime() - startDateTime.getTime()
        durationMin = diffMs > 0 ? Math.floor(diffMs / (1000 * 60)) : 0
      } else {
        durationMin = 0
      }
    }

    const row = {
      id: 'V' + now.getTime(),
      visit_date: dateStr,
      name: data.userName,
      store_name: data.storeName,
      visit_type: visitType,
      purpose: data.purpose || '',
      visit_time: timeStr,
      lat: String(data.lat ?? ''),
      lng: String(data.lng ?? ''),
      duration_min: durationMin !== null ? durationMin : 0,
      memo: '',
    }
    await supabaseInsert('store_visits', row)

    let msg = '✅ ' + visitType.replace('강제 ', '') + ' 완료!'
    if (durationMin !== null && durationMin > 0) msg += ` (${durationMin}분 체류)`
    return NextResponse.json({ success: true, msg }, { headers })
  } catch (e) {
    console.error('submitStoreVisit:', e)
    return NextResponse.json(
      { success: false, msg: '❌ 서버 저장 오류: ' + (e instanceof Error ? e.message : String(e)) },
      { headers }
    )
  }
}
