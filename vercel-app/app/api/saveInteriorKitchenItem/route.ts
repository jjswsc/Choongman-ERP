import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate } from '@/lib/supabase-server'
import {
  assertInteriorProjectAccess,
  interiorForbiddenResponse,
  requireInteriorTenantContext,
} from '@/lib/interior-tenant-guard'
import { stampSaasTenantId } from '@/lib/saas-tenant-scope'

/** 주방 설비 추가/수정 */
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
    const itemNameKr = String((body.itemNameKr ?? body.item_name_kr) || '').trim()
    const itemNameEn = String((body.itemNameEn ?? body.item_name_en) || '').trim()
    const sizeMm = String((body.sizeMm ?? body.size_mm) || '').trim()
    const supplierCode = String((body.supplierCode ?? body.supplier_code) || '').trim()
    const zone = String(body.zone ?? '').trim()
    const price = Number(body.price ?? body.price) || 0
    const quantity = Number(body.quantity ?? body.quantity) || 1

    if (!projectId || isNaN(projectId)) {
      return NextResponse.json({ success: false, message: 'projectId가 필요합니다.' }, { status: 400, headers })
    }
    if (!itemNameKr && !itemNameEn) {
      return NextResponse.json({ success: false, message: '품목명(한글 또는 영문)을 입력하세요.' }, { status: 400, headers })
    }

    const access = await assertInteriorProjectAccess(projectId, guard.scope)
    if (access !== 'ok') return interiorForbiddenResponse(headers)

    const row = {
      project_id: projectId,
      item_name_kr: itemNameKr || null,
      item_name_en: itemNameEn || null,
      size_mm: sizeMm || null,
      supplier_code: supplierCode || null,
      zone: zone || null,
      price,
      quantity,
    }

    if (id && !isNaN(id)) {
      await supabaseUpdate('interior_kitchen_items', id, row)
      return NextResponse.json({ success: true, id, message: '수정되었습니다.' }, { headers })
    }

    const inserted = await supabaseInsert(
      'interior_kitchen_items',
      stampSaasTenantId(row, guard.scope, 'interior_kitchen_items')
    )
    const insertedRow = Array.isArray(inserted) ? inserted[0] : inserted
    const newId = (insertedRow as { id?: number })?.id
    return NextResponse.json({ success: true, id: newId, message: '등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveInteriorKitchenItem:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
