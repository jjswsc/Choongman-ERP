import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 프로젝트 주방 설비 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const projectId = request.nextUrl.searchParams.get('projectId')
  if (!projectId) return NextResponse.json([], { headers })

  try {
    const rows = (await supabaseSelectFilter(
      'interior_kitchen_items',
      `project_id=eq.${encodeURIComponent(projectId)}`,
      { order: 'zone.asc,id.asc', limit: 300 }
    )) as {
      id?: number
      project_id?: number
      item_name_kr?: string
      item_name_en?: string
      size_mm?: string
      supplier_code?: string
      zone?: string
      price?: number
      quantity?: number
    }[]

    const list = (rows || []).map((r) => ({
      id: r.id,
      projectId: r.project_id,
      itemNameKr: String(r.item_name_kr || '').trim(),
      itemNameEn: String(r.item_name_en || '').trim(),
      sizeMm: String(r.size_mm || '').trim(),
      supplierCode: String(r.supplier_code || '').trim(),
      zone: String(r.zone || '').trim(),
      price: Number(r.price) ?? 0,
      quantity: Number(r.quantity) ?? 1,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getInteriorKitchenItems:', e)
    return NextResponse.json([], { headers })
  }
}
