import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate } from '@/lib/supabase-server'
import {
  assertInteriorProjectAccess,
  interiorForbiddenResponse,
  requireInteriorTenantContext,
} from '@/lib/interior-tenant-guard'
import { stampSaasTenantId } from '@/lib/saas-tenant-scope'

/** 일정 항목 추가/수정 */
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
    const itemNo = Number(body.itemNo ?? body.item_no) || 0
    const workDetail = String((body.workDetail ?? body.work_detail) || '').trim()
    const startDate = body.startDate ?? body.start_date
    const endDate = body.endDate ?? body.end_date
    const dayProgress = body.dayProgress ?? body.day_progress ?? {}
    const sortOrder = Number(body.sortOrder ?? body.sort_order) || 0

    if (!projectId || isNaN(projectId)) {
      return NextResponse.json({ success: false, message: 'projectId가 필요합니다.' }, { status: 400, headers })
    }
    if (!workDetail) {
      return NextResponse.json({ success: false, message: '작업 내용을 입력하세요.' }, { status: 400, headers })
    }

    const access = await assertInteriorProjectAccess(projectId, guard.scope)
    if (access !== 'ok') return interiorForbiddenResponse(headers)

    const row = {
      project_id: projectId,
      item_no: itemNo,
      work_detail: workDetail,
      start_date: startDate ? String(startDate).slice(0, 10) : null,
      end_date: endDate ? String(endDate).slice(0, 10) : null,
      day_progress: typeof dayProgress === 'object' ? dayProgress : {},
      sort_order: sortOrder,
    }

    if (id && !isNaN(id)) {
      await supabaseUpdate('interior_schedule_items', id, row)
      return NextResponse.json({ success: true, id, message: '수정되었습니다.' }, { headers })
    }

    const inserted = await supabaseInsert(
      'interior_schedule_items',
      stampSaasTenantId(row, guard.scope, 'interior_schedule_items')
    )
    const insertedRow = Array.isArray(inserted) ? inserted[0] : inserted
    const newId = (insertedRow as { id?: number })?.id
    return NextResponse.json({ success: true, id: newId, message: '등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveInteriorScheduleItem:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
