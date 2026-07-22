import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  assertInteriorProjectAccess,
  interiorForbiddenResponse,
  requireInteriorTenantRead,
} from '@/lib/interior-tenant-guard'
import { isSaasTenantQueryBlocked } from '@/lib/saas-tenant-scope'

/** 프로젝트 자재 스펙 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const guard = await requireInteriorTenantRead(request)
  if (!guard.ok) {
    guard.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return guard.errorResponse
  }

  const projectId = request.nextUrl.searchParams.get('projectId')
  if (!projectId) return NextResponse.json([], { headers })
  if (isSaasTenantQueryBlocked(guard.scope, 'interior_projects')) return NextResponse.json([], { headers })

  const access = await assertInteriorProjectAccess(projectId, guard.scope)
  if (access === 'forbidden') return interiorForbiddenResponse(headers)
  if (access === 'not_found') return NextResponse.json([], { headers })

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
