/**
 * 매장 GPS 좌표 진단용 API (관리자 점검)
 * GET /api/getStoreGpsCheck?store=CM%20Asoke
 * - 해당 매장의 등록된 lat/lng와 Google Maps 링크 반환
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const store = String(request.nextUrl.searchParams.get('store') || '').trim()
    if (!store) {
      return NextResponse.json(
        { success: false, message: 'store 파라미터가 필요합니다. 예: ?store=CM%20Asoke' },
        { headers }
      )
    }

    const vendors = (await supabaseSelect('vendors', { limit: 2000, select: 'id,gps_name,name,type,lat,lng' })) as {
      id?: number
      gps_name?: string
      name?: string
      type?: string
      lat?: string | number
      lng?: string | number
    }[]

    const storeNorm = store.toLowerCase()
    const candidates = [storeNorm]
    if (storeNorm.startsWith('cm ')) {
      candidates.push(storeNorm.replace(/^cm\s+/, '').trim())
    } else if (storeNorm) {
      candidates.push('cm ' + storeNorm)
    }

    const OFFICE_STORES = ['본사', 'Office', '오피스', '본점']
    const isOffice = OFFICE_STORES.some((s) => s.toLowerCase() === storeNorm)

    let matched: { gps_name?: string; name?: string; lat: number; lng: number } | null = null

    for (const v of vendors || []) {
      const gpsName = String(v.gps_name || '').trim()
      const name = String(v.name || '').trim()
      const gpsLower = gpsName.toLowerCase()
      const nameLower = name.toLowerCase()
      const exactMatch =
        candidates.some((c) => gpsLower === c) || (gpsName === '' && candidates.some((c) => nameLower === c))

      if (exactMatch) {
        const lat = Number(v.lat) || 0
        const lng = Number(v.lng) || 0
        if (lat !== 0 || lng !== 0) {
          matched = { gps_name: gpsName || undefined, name: name || undefined, lat, lng }
          break
        }
      }
    }

    if (!matched && isOffice) {
      const officeNorm = OFFICE_STORES.map((s) => s.trim().toLowerCase())
      for (const v of vendors || []) {
        const gpsName = String(v.gps_name || '').trim().toLowerCase()
        const name = String(v.name || '').trim().toLowerCase()
        const vType = String(v.type || '').trim().toLowerCase()
        const vNameInOffice = officeNorm.includes(gpsName) || officeNorm.includes(name)
        const vType본사 = vType === '본사'
        if (vNameInOffice || vType본사) {
          const lat = Number(v.lat) || 0
          const lng = Number(v.lng) || 0
          if (lat !== 0 || lng !== 0) {
            matched = { gps_name: v.gps_name || undefined, name: v.name || undefined, lat, lng }
            break
          }
        }
      }
    }

    if (!matched) {
      return NextResponse.json(
        {
          success: false,
          store,
          message: '매칭되는 매장이 없거나 lat/lng가 등록되지 않았습니다. 관리자 → 거래처에서 gps_name 및 좌표를 확인하세요.',
        },
        { headers }
      )
    }

    const mapsUrl = `https://www.google.com/maps?q=${matched.lat},${matched.lng}`

    return NextResponse.json(
      {
        success: true,
        store,
        gps_name: matched.gps_name,
        name: matched.name,
        lat: matched.lat,
        lng: matched.lng,
        mapsUrl,
        hint: '위 Google Maps 링크에서 실제 매장 위치와 일치하는지 확인하세요.',
      },
      { headers }
    )
  } catch (e) {
    console.error('getStoreGpsCheck:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '오류' },
      { headers }
    )
  }
}
