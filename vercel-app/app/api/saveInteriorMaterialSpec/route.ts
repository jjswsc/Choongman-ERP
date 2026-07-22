import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate } from '@/lib/supabase-server'
import {
  assertInteriorProjectAccess,
  interiorForbiddenResponse,
  requireInteriorTenantContext,
} from '@/lib/interior-tenant-guard'
import { stampSaasTenantId } from '@/lib/saas-tenant-scope'

/** 자재 스펙 추가/수정 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  const guard = await requireInteriorTenantContext(request)
  if (!guard.ok) {
    guard.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    guard.errorResponse.headers.set('Content-Type', 'application/json')
    return guard.errorResponse
  }

  try {
    const body = await request.json()
    const id = body.id != null ? Number(body.id) : null
    const projectId = Number(body.projectId ?? body.project_id)
    const materialCode = String(body.materialCode ?? body.material_code ?? '').trim()
    const materialName = String(body.materialName ?? body.material_name ?? '').trim()
    const spec = String(body.spec ?? '').trim()
    const supplier = String(body.supplier ?? '').trim()
    const unit = String(body.unit ?? '').trim()
    const unitCost = Number(body.unitCost ?? body.unit_cost ?? 0) || 0
    const imageUrl = String(body.imageUrl ?? body.image_url ?? '').trim()
    const location = String(body.location ?? '').trim()
    const note = String(body.note ?? '').trim()
    const sortOrder = Number(body.sortOrder ?? body.sort_order) || 0

    if (!projectId || Number.isNaN(projectId)) {
      return NextResponse.json({ success: false, message: 'projectId가 필요합니다.' }, { status: 400, headers })
    }
    if (!materialName) {
      return NextResponse.json({ success: false, message: '자재명을 입력하세요.' }, { status: 400, headers })
    }

    const access = await assertInteriorProjectAccess(projectId, guard.scope)
    if (access !== 'ok') return interiorForbiddenResponse(headers)

    const row = {
      project_id: projectId,
      material_code: materialCode || null,
      material_name: materialName,
      spec: spec || null,
      supplier: supplier || null,
      unit: unit || null,
      unit_cost: unitCost,
      image_url: imageUrl || null,
      location: location || null,
      note: note || null,
      sort_order: sortOrder,
    }

    if (id && !Number.isNaN(id)) {
      await supabaseUpdate('interior_material_specs', id, row)
      return NextResponse.json({ success: true, id, message: '수정되었습니다.' }, { headers })
    }

    const inserted = await supabaseInsert(
      'interior_material_specs',
      stampSaasTenantId(row, guard.scope, 'interior_material_specs')
    )
    const insertedRow = Array.isArray(inserted) ? inserted[0] : inserted
    const newId = (insertedRow as { id?: number })?.id
    return NextResponse.json({ success: true, id: newId, message: '등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveInteriorMaterialSpec:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
