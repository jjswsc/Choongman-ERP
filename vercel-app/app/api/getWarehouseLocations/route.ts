import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** 품목 관리·출고지 설정용 warehouse_locations 전체 조회 (본사 제외) */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const rows = (await supabaseSelect('warehouse_locations', {
      order: 'sort_order.asc',
      limit: 100,
      select: 'id,name,address,location_code,sort_order',
    })) as {
      id?: number
      name?: string
      address?: string
      location_code?: string
      sort_order?: number
    }[] | null

    const list = (rows || []).map((r) => ({
      id: r.id,
      name: String(r.name || '').trim(),
      address: String(r.address || '').trim(),
      location_code: String(r.location_code || r.name || '').trim(),
      sort_order: Number(r.sort_order) || 0,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getWarehouseLocations:', e)
    return NextResponse.json([], { headers })
  }
}
