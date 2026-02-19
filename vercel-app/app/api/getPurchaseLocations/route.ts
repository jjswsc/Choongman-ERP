import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** 본사 발주용 출고지 목록: warehouse_locations에서만 조회 (출고지 설정에서 관리) */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const locations: { name: string; address: string; location_code: string }[] = []

    // warehouse_locations (출고지 설정)
    try {
      const whRows = (await supabaseSelect('warehouse_locations', { order: 'sort_order.asc', limit: 50 })) as {
        name?: string
        address?: string
        location_code?: string
      }[] | null
      for (const row of whRows || []) {
        if (row?.name) {
          locations.push({
            name: String(row.name),
            address: String(row.address || ''),
            location_code: String(row.location_code || row.name),
          })
        }
      }
    } catch {
      // 테이블 없을 수 있음
    }

    // 출고지 설정에 데이터가 없으면 기본 시드
    if (locations.length === 0) {
      locations.push({
        name: '창고',
        address: 'JIDUBANG(ASIA) 262 3 Bangkok-Chon Buri New Line Rd, Prawet, Bangkok 10250',
        location_code: '창고',
      })
    }

    return NextResponse.json(locations, { headers })
  } catch (e) {
    console.error('getPurchaseLocations:', e)
    return NextResponse.json(
      [
        {
          name: '창고',
          address: 'JIDUBANG(ASIA) 262 3 Bangkok-Chon Buri New Line Rd, Prawet, Bangkok 10250',
          location_code: '창고',
        },
      ],
      { headers }
    )
  }
}
