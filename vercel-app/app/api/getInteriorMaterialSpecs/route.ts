import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 프로젝트 자재 스펙 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const projectId = request.nextUrl.searchParams.get('projectId')
  if (!projectId) return NextResponse.json([], { headers })

  try {
    const rows = (await supabaseSelectFilter(
      'interior_material_specs',
      `project_id=eq.${encodeURIComponent(projectId)}`,
      { order: 'sort_order.asc,id.asc', limit: 1000 }
    )) as {
      id?: number
      project_id?: number
      material_code?: string
      material_name?: string
      spec?: string
      supplier?: string
      unit?: string
      unit_cost?: number
      image_url?: string
      location?: string
      note?: string
      sort_order?: number
    }[]

    const list = (rows || []).map((r) => ({
      id: r.id,
      projectId: r.project_id,
      materialCode: String(r.material_code || '').trim(),
      materialName: String(r.material_name || '').trim(),
      spec: String(r.spec || '').trim(),
      supplier: String(r.supplier || '').trim(),
      unit: String(r.unit || '').trim(),
      unitCost: Number(r.unit_cost ?? 0),
      imageUrl: String(r.image_url || '').trim(),
      location: String(r.location || '').trim(),
      note: String(r.note || '').trim(),
      sortOrder: Number(r.sort_order ?? 0),
    }))
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getInteriorMaterialSpecs:', e)
    return NextResponse.json([], { headers })
  }
}
