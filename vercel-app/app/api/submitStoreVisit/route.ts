import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter, supabaseInsert } from '@/lib/supabase-server'
import { verifyAttendanceQrPayload } from '@/lib/attendance-qr-token'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { addDayBangkok } from '@/lib/attendance-utils'
import {
  STORE_VISIT_DUPLICATE_START_MS,
  latestOpenVisit,
  pairVisitEventsForPerson,
  type StoreVisitEventRow,
  type StoreVisitOpen,
} from '@/lib/store-visit-pairing'

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

function bangkokParts(ms: number): { dateStr: string; timeStr: string } {
  const d = new Date(ms)
  return {
    dateStr: d.toLocaleDateString('en-CA', { timeZone: TZ }),
    timeStr: d.toLocaleTimeString('en-GB', {
      timeZone: TZ,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  }
}

function getBangkokHour(ms = Date.now()): number {
  const str = new Date(ms).toLocaleTimeString('en-US', { timeZone: TZ, hour: '2-digit', hour12: false })
  return parseInt(str, 10) || 0
}

async function fetchRecentVisitsForUser(userName: string, nowMs: number): Promise<StoreVisitEventRow[]> {
  const today = new Date(nowMs).toLocaleDateString('en-CA', { timeZone: TZ })
  const dates = [today]
  const hour = getBangkokHour(nowMs)
  if (hour >= 0 && hour <= 7) {
    dates.unshift(addDayBangkok(today, -1))
  } else {
    // 낮에도 어제 미종료 방문이 남을 수 있어 어제까지 포함
    dates.unshift(addDayBangkok(today, -1))
  }
  const all: StoreVisitEventRow[] = []
  for (const dateStr of dates) {
    const rows = (await supabaseSelectFilter(
      'store_visits',
      `visit_date=eq.${dateStr}&name=eq.${encodeURIComponent(userName)}`,
      { order: 'visit_time.asc,created_at.asc', limit: 200 }
    )) as StoreVisitEventRow[]
    if (rows?.length) all.push(...rows)
  }
  return all
}

async function insertAutoCloseEnds(
  userName: string,
  opens: StoreVisitOpen[],
  closeAtMs: number
): Promise<void> {
  const { dateStr, timeStr } = bangkokParts(closeAtMs)
  for (let i = 0; i < opens.length; i++) {
    const open = opens[i]
    const durationMin = Math.max(0, Math.floor((closeAtMs - open.startMs) / (1000 * 60)))
    await supabaseInsert('store_visits', {
      id: `V${closeAtMs}c${i}`,
      visit_date: dateStr,
      name: userName,
      store_name: open.store,
      visit_type: '강제 방문종료',
      purpose: open.purpose,
      visit_time: timeStr,
      lat: '',
      lng: '',
      duration_min: durationMin,
      memo: 'auto-closed-on-new-start',
    })
  }
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
      clientTimestamp?: number
      attendanceQrToken?: string
    }
    const storeNameTrim = String(data.storeName || '').trim()
    const userName = String(data.userName || '').trim()
    const visitType = String(data.type || '').trim()
    const attendanceQrToken = String(data.attendanceQrToken ?? '').trim()
    let recordLat = String(data.lat ?? '')
    let recordLng = String(data.lng ?? '')
    const isForce = visitType.includes('강제')
    const isStart = visitType === '방문시작' || visitType === '강제 방문시작'
    const isEnd = visitType === '방문종료' || visitType === '강제 방문종료'

    if (!storeNameTrim || !userName) {
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

    if (attendanceQrToken) {
      const qrVerified = verifyAttendanceQrPayload(attendanceQrToken)
      if (!qrVerified.ok || !qrVerified.storeCode) {
        return NextResponse.json(
          {
            success: false,
            msg: '❌ QR 코드가 유효하지 않거나 만료되었습니다. 키오스크 QR을 다시 스캔해 주세요.',
          },
          { headers }
        )
      }
      if (!storesMatchForGradeLookup(qrVerified.storeCode, storeNameTrim)) {
        return NextResponse.json(
          {
            success: false,
            msg: '❌ QR 매장과 방문 매장이 일치하지 않습니다.',
          },
          { headers }
        )
      }
      recordLat = 'QR'
      recordLng = 'QR'
    } else if (isForce && isStart) {
      const vendors = (await supabaseSelect('vendors', { limit: 2000 })) as {
        id?: number
        code?: string
        gps_name?: string
        name?: string
        type?: string
        lat?: string | number
        lng?: string | number
      }[]
      let targetLat = 0,
        targetLng = 0
      const storeNorm = storeNameTrim.toLowerCase()
      for (const v of vendors || []) {
        const gpsName = String(v.gps_name || '').trim()
        const name = String(v.name || '').trim()
        const gpsLower = gpsName.toLowerCase()
        const nameLower = name.toLowerCase()
        const exactMatch = gpsLower === storeNorm ||
          (gpsName === '' && nameLower === storeNorm)
        if (exactMatch) {
          targetLat = Number(v.lat) || 0
          targetLng = Number(v.lng) || 0
          if (targetLat !== 0 || targetLng !== 0) break
        }
      }
      const OFFICE_STORES = ['본사', 'Office', '오피스', '본점']
      const storeNormOffice = storeNameTrim.toLowerCase()
      const isOffice =
        OFFICE_STORES.some((s) => s.toLowerCase() === storeNormOffice) ||
        storeNormOffice.includes('office') ||
        storeNormOffice.includes('오피스') ||
        storeNormOffice.includes('본사') ||
        storeNormOffice.includes('본점')
      if ((targetLat === 0 && targetLng === 0) && isOffice) {
        const vendorCoords = (v: { lat?: string | number; lng?: string | number }) => {
          const lat = Number(v.lat) || 0
          const lng = Number(v.lng) || 0
          return lat !== 0 || lng !== 0 ? { lat, lng } : null
        }
        const hqRow = (vendors || []).find((v) => String(v.code || '').trim().toUpperCase() === 'HQ')
        const hqCoords = hqRow ? vendorCoords(hqRow) : null
        if (hqCoords) {
          targetLat = hqCoords.lat
          targetLng = hqCoords.lng
        } else {
          const officeNorm = OFFICE_STORES.map((s) => s.trim().toLowerCase())
          for (const v of vendors || []) {
            const gpsName = String(v.gps_name || '').trim().toLowerCase()
            const name = String(v.name || '').trim().toLowerCase()
            const vType = String(v.type || '').trim().toLowerCase()
            const vNameInOffice = officeNorm.includes(gpsName) || officeNorm.includes(name)
            const vTypeHq = vType === '본사' || vType.includes('head office')
            if (vNameInOffice || vTypeHq) {
              const c = vendorCoords(v)
              if (c) {
                targetLat = c.lat
                targetLng = c.lng
                break
              }
            }
          }
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
          if (distance > 999) {
            return NextResponse.json(
              {
                success: false,
                msg: `❌ 위치 부적합! 매장 근처(999m 이내)가 아닙니다. (현재 거리: ${Math.round(distance)}m)`,
              },
              { headers }
            )
          }
        }
      }
    } else if (!isForce) {
      return NextResponse.json(
        { success: false, msg: '❌ 매장 출퇴근 QR을 스캔해 주세요.' },
        { headers }
      )
    }

    // 클라이언트가 보낸 시각 사용 (실제 방문 시점). ±10분 이내만 허용
    const serverNow = Date.now()
    const clientTs = typeof data.clientTimestamp === 'number' ? data.clientTimestamp : null
    const skewOk = clientTs != null && Math.abs(serverNow - clientTs) <= 10 * 60 * 1000
    const now = skewOk ? new Date(clientTs) : new Date()
    const nowMs = now.getTime()
    const { dateStr, timeStr } = bangkokParts(nowMs)
    let durationMin: number | null = null
    let autoClosedNote = ''

    const recent = await fetchRecentVisitsForUser(userName, nowMs)
    // 가드·종료 duration은 실제 DB 짝(암묵 종료 없이)으로 open 판정
    const { open: openVisits } = pairVisitEventsForPerson(recent, { personExclusive: false })

    if (isStart) {
      const sameStoreOpens = openVisits.filter((o) => o.store === storeNameTrim)
      const otherOpens = openVisits.filter((o) => o.store !== storeNameTrim)
      const latestSame = latestOpenVisit(sameStoreOpens)

      // 동일 매장·짧은 간격 재시작 → 멱등 성공 (더블탭/오프라인 재전송)
      if (
        latestSame &&
        nowMs - latestSame.startMs >= 0 &&
        nowMs - latestSame.startMs <= STORE_VISIT_DUPLICATE_START_MS
      ) {
        return NextResponse.json(
          {
            success: true,
            msg: '✅ 방문시작 완료! (이미 등록됨)',
            deduped: true,
          },
          { headers }
        )
      }

      // 동일 매장에 이미 진행 중이면 거절 (종료 후 다시 시작)
      if (latestSame) {
        return NextResponse.json(
          {
            success: false,
            msg: `❌ 이미 ${storeNameTrim} 방문 중입니다. 먼저 방문종료 해 주세요.`,
          },
          { headers }
        )
      }

      // 다른 매장 open → 자동 종료 후 새 시작 (한 사람 동시 1곳)
      if (otherOpens.length > 0) {
        await insertAutoCloseEnds(userName, otherOpens, nowMs)
        const names = [...new Set(otherOpens.map((o) => o.store))].join(', ')
        autoClosedNote = ` (이전 방문 ${names} 자동 종료)`
      }
    }

    if (isEnd) {
      const openAtStore = openVisits.filter((o) => o.store === storeNameTrim)
      const matched = latestOpenVisit(openAtStore)
      if (matched) {
        durationMin = Math.max(0, Math.floor((nowMs - matched.startMs) / (1000 * 60)))
      } else {
        durationMin = 0
      }
    }

    const row = {
      id: 'V' + nowMs,
      visit_date: dateStr,
      name: userName,
      store_name: storeNameTrim,
      visit_type: visitType,
      purpose: data.purpose || '',
      visit_time: timeStr,
      lat: recordLat,
      lng: recordLng,
      duration_min: durationMin !== null ? durationMin : 0,
      memo: '',
    }
    await supabaseInsert('store_visits', row)

    let msg = '✅ ' + visitType.replace('강제 ', '') + ' 완료!'
    if (durationMin !== null && durationMin > 0) msg += ` (${durationMin}분 체류)`
    if (autoClosedNote) msg += autoClosedNote
    return NextResponse.json({ success: true, msg }, { headers })
  } catch (e) {
    console.error('submitStoreVisit:', e)
    return NextResponse.json(
      { success: false, msg: '❌ 서버 저장 오류: ' + (e instanceof Error ? e.message : String(e)) },
      { headers }
    )
  }
}
