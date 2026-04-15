import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 프로젝트 배치 품목 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const projectId = request.nextUrl.searchParams.get('projectId')
  const zone = String(request.nextUrl.searchParams.get('zone') || '').trim()
  if (!projectId) return NextResponse.json([], { headers })

  try {
    const filter = [
      `project_id=eq.${encodeURIComponent(projectId)}`,
      zone ? `zone=eq.${encodeURIComponent(zone)}` : '',
    ]
      .filter(Boolean)
      .join('&')

    const rows = (await supabaseSelectFilter(
      'interior_layout_items',
      filter,
      { order: 'sort_order.asc,id.asc', limit: 1000 }
    )) as {
      id?: number
      project_id?: number
      zone?: string
      floor?: string
      x?: number
      y?: number
      w?: number
      h?: number
      rotation?: number
      item_name?: string
      qty?: number
      status?: string
      material_spec_id?: number | null
      note?: string
      sort_order?: number
    }[]

    const list = (rows || []).map((r) => ({
      id: r.id,
      projectId: r.project_id,
      zone: String(r.zone || '').trim(),
      floor: String(r.floor || '').trim(),
      x: Number(r.x ?? 0),
      y: Number(r.y ?? 0),
      w: Number(r.w ?? 1),
      h: Number(r.h ?? 1),
      rotation: Number(r.rotation ?? 0),
      itemName: String(r.item_name || '').trim(),
      qty: Number(r.qty ?? 1),
      status: String(r.status || 'planned'),
      materialSpecId: r.material_spec_id ?? null,
      note: String(r.note || '').trim(),
      sortOrder: Number(r.sort_order ?? 0),
    }))
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getInteriorLayoutItems:', e)
    return NextResponse.json([], { headers })
  }
}
