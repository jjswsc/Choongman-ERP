import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpdate, supabaseSelectFilter } from '@/lib/supabase-server'
import {
  assertInteriorProjectAccess,
  interiorForbiddenResponse,
  requireInteriorTenantContext,
} from '@/lib/interior-tenant-guard'

/** 견적 파일 메타(금액·연결 비용) 수정 */
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
    const body = (await request.json()) as {
      id?: number
      quoteAmount?: number | null
      linkedExpenseId?: number | null
    }
    const id = Number(body.id)
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ success: false, message: 'id가 필요합니다.' }, { status: 400, headers })
    }

    const existing = (await supabaseSelectFilter('interior_project_files', `id=eq.${id}`, {
      limit: 1,
      select: 'id,project_id',
    })) as { id?: number; project_id?: number }[]
    const projectId = existing?.[0]?.project_id
    if (!projectId) {
      return NextResponse.json({ success: false, message: '파일을 찾을 수 없습니다.' }, { status: 404, headers })
    }

    const access = await assertInteriorProjectAccess(projectId, guard.scope)
    if (access !== 'ok') return interiorForbiddenResponse(headers)

    const row: Record<string, unknown> = {}
    if (body.quoteAmount != null) {
      row.quote_amount = Math.max(0, Number(body.quoteAmount) || 0)
    }
    if (body.linkedExpenseId !== undefined) {
      const linked = body.linkedExpenseId
      row.linked_expense_id =
        linked != null && Number.isFinite(Number(linked)) && Number(linked) > 0
          ? Math.floor(Number(linked))
          : null
    }

    if (!Object.keys(row).length) {
      return NextResponse.json({ success: false, message: '수정할 항목이 없습니다.' }, { status: 400, headers })
    }

    await supabaseUpdate('interior_project_files', id, row)
    return NextResponse.json({ success: true, message: '저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveInteriorProjectFile:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
