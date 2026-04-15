import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate } from '@/lib/supabase-server'

const ALLOWED_ZONE = new Set(['kitchen', 'hall'])
const ALLOWED_STATUS = new Set(['planned', 'ordered', 'installed', 'done', 'blocked'])

/** 배치 품목 추가/수정 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const id = body.id != null ? Number(body.id) : null
    const projectId = Number(body.projectId ?? body.project_id)
    const zoneRaw = String(body.zone ?? 'hall').trim()
    const floor = String(body.floor ?? '').trim()
    const x = Number(body.x ?? 0) || 0
    const y = Number(body.y ?? 0) || 0
    const w = Math.max(0.5, Number(body.w ?? 1) || 1)
    const h = Math.max(0.5, Number(body.h ?? 1) || 1)
    const rotation = Number(body.rotation ?? 0) || 0
    const itemName = String(body.itemName ?? body.item_name ?? '').trim()
    const qty = Math.max(0, Number(body.qty ?? 1) || 1)
    const statusRaw = String(body.status ?? 'planned').trim()
    const materialSpecIdRaw = body.materialSpecId ?? body.material_spec_id
    const materialSpecId = materialSpecIdRaw != null && materialSpecIdRaw !== '' ? Number(materialSpecIdRaw) : null
    const note = String(body.note ?? '').trim()
    const sortOrder = Number(body.sortOrder ?? body.sort_order) || 0

    if (!projectId || Number.isNaN(projectId)) {
      return NextResponse.json({ success: false, message: 'projectId가 필요합니다.' }, { status: 400, headers })
    }
    if (!itemName) {
      return NextResponse.json({ success: false, message: '배치 품목명을 입력하세요.' }, { status: 400, headers })
    }

    const zone = ALLOWED_ZONE.has(zoneRaw) ? zoneRaw : 'hall'
    const status = ALLOWED_STATUS.has(statusRaw) ? statusRaw : 'planned'
    const row = {
      project_id: projectId,
      zone,
      floor: floor || null,
      x,
      y,
      w,
      h,
      rotation,
      item_name: itemName,
      qty,
      status,
      material_spec_id: materialSpecId && !Number.isNaN(materialSpecId) ? materialSpecId : null,
      note: note || null,
      sort_order: sortOrder,
    }

    if (id && !Number.isNaN(id)) {
      await supabaseUpdate('interior_layout_items', id, row)
      return NextResponse.json({ success: true, id, message: '수정되었습니다.' }, { headers })
    }

    const inserted = await supabaseInsert('interior_layout_items', row)
    const insertedRow = Array.isArray(inserted) ? inserted[0] : inserted
    const newId = (insertedRow as { id?: number })?.id
    return NextResponse.json({ success: true, id: newId, message: '등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveInteriorLayoutItem:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
