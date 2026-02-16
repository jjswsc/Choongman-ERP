import { NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseSelect } from '@/lib/supabase-server'

/** 본사 발주용 배송지 목록: 본사(vendors type=본사) + 창고(warehouse_locations) */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const locations: { name: string; address: string; location_code: string }[] = []

    // 1. 본사 (vendors type=본사)
    const hqRows = (await supabaseSelectFilter('vendors', 'type=eq.본사', { limit: 1 })) as {
      name?: string
      addr?: string
    }[] | null
    const hq = (hqRows || [])[0]
    if (hq?.addr || hq?.name) {
      locations.push({
        name: String(hq.name || '본사').trim(),
        address: String(hq.addr || '').trim() || '-',
        location_code: '본사',
      })
    } else {
      // 본사 정보 없어도 기본값
      locations.push({
        name: '본사',
        address: '-',
        location_code: '본사',
      })
    }

    // 2. 창고 (warehouse_locations)
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

    // 기본 창고가 없으면 시드
    if (locations.length === 1) {
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
        { name: '본사', address: '-', location_code: '본사' },
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
