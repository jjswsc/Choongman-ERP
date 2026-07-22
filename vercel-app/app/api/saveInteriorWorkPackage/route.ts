import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate } from '@/lib/supabase-server'
import {
  assertInteriorProjectAccess,
  interiorForbiddenResponse,
  requireInteriorTenantContext,
} from '@/lib/interior-tenant-guard'
import { stampSaasTenantId } from '@/lib/saas-tenant-scope'

const ALLOWED_STATUS = new Set(['planned', 'in_progress', 'blocked', 'done', 'cancelled'])

/** 공정 패키지 추가/수정 */
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
    const partType = String(body.partType ?? body.part_type ?? '').trim()
    const title = String(body.title ?? '').trim()
    const description = String(body.description ?? '').trim()
    const startDate = body.startDate ?? body.start_date
    const endDate = body.endDate ?? body.end_date
    const rawStatus = String(body.status ?? 'planned').trim()
    const progressPct = Math.max(0, Math.min(100, Number(body.progressPct ?? body.progress_pct ?? 0) || 0))
    const color = String(body.color ?? '').trim()
    const sortOrder = Number(body.sortOrder ?? body.sort_order) || 0

    if (!projectId || Number.isNaN(projectId)) {
      return NextResponse.json({ success: false, message: 'projectId가 필요합니다.' }, { status: 400, headers })
    }
    if (!title) {
      return NextResponse.json({ success: false, message: '공정명을 입력하세요.' }, { status: 400, headers })
    }

    const access = await assertInteriorProjectAccess(projectId, guard.scope)
    if (access !== 'ok') return interiorForbiddenResponse(headers)

    const status = ALLOWED_STATUS.has(rawStatus) ? rawStatus : 'planned'
    const row = {
      project_id: projectId,
      part_type: partType || '기타',
      title,
      description: description || null,
      start_date: startDate ? String(startDate).slice(0, 10) : null,
      end_date: endDate ? String(endDate).slice(0, 10) : null,
      status,
      progress_pct: progressPct,
      color: color || null,
      sort_order: sortOrder,
    }

    if (id && !Number.isNaN(id)) {
      await supabaseUpdate('interior_work_packages', id, row)
      return NextResponse.json({ success: true, id, message: '수정되었습니다.' }, { headers })
    }

    const inserted = await supabaseInsert(
      'interior_work_packages',
      stampSaasTenantId(row, guard.scope, 'interior_work_packages')
    )
    const insertedRow = Array.isArray(inserted) ? inserted[0] : inserted
    const newId = (insertedRow as { id?: number })?.id
    return NextResponse.json({ success: true, id: newId, message: '등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveInteriorWorkPackage:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
