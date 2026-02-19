import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseInsert, supabaseUpdate } from '@/lib/supabase-server'

/** 출고지(창고) 추가/수정 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await request.json()) as {
      id?: number
      name?: string
      address?: string
      location_code?: string
      sort_order?: number
    }

    const id = body.id ? Number(body.id) : 0
    const name = String(body.name || '').trim()
    const address = String(body.address || '').trim()
    const location_code = String(body.location_code || body.name || '').trim() || name
    const sort_order = Number(body.sort_order) || 0

    if (!name) {
      return NextResponse.json({ success: false, message: '출고지명이 필요합니다.' }, { headers })
    }

    const row = { name, address, location_code, sort_order }

    if (id > 0) {
      const existing = (await supabaseSelectFilter('warehouse_locations', `id=eq.${id}`, { limit: 1 })) as { id?: number }[] | null
      if (!existing || existing.length === 0) {
        return NextResponse.json({ success: false, message: '존재하지 않는 출고지입니다.' }, { headers })
      }
      await supabaseUpdate('warehouse_locations', id, row)
      return NextResponse.json({ success: true, message: '수정되었습니다.' }, { headers })
    }

    const dup = (await supabaseSelectFilter('warehouse_locations', `location_code=eq.${encodeURIComponent(location_code)}`, { limit: 1 })) as unknown[]
    if (dup && dup.length > 0) {
      return NextResponse.json({ success: false, message: '이미 같은 코드의 출고지가 있습니다.' }, { headers })
    }

    await supabaseInsert('warehouse_locations', row)
    return NextResponse.json({ success: true, message: '추가되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveWarehouseLocation:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '저장 실패' },
      { headers }
    )
  }
}
