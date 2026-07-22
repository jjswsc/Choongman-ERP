import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter, supabaseSelectFilter } from '@/lib/supabase-server'
import {
  assertInteriorProjectAccess,
  interiorForbiddenResponse,
  requireInteriorTenantContext,
} from '@/lib/interior-tenant-guard'

/** 직매입 품목 삭제 */
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
    if (!id || isNaN(id)) {
      return NextResponse.json({ success: false, message: 'id가 필요합니다.' }, { status: 400, headers })
    }

    const rows = (await supabaseSelectFilter('interior_direct_purchases', `id=eq.${id}`, {
      limit: 1,
      select: 'id,project_id',
    })) as { id?: number; project_id?: number }[]
    const projectId = rows?.[0]?.project_id
    if (!projectId) {
      return NextResponse.json({ success: false, message: '항목을 찾을 수 없습니다.' }, { status: 404, headers })
    }

    const access = await assertInteriorProjectAccess(projectId, guard.scope)
    if (access !== 'ok') return interiorForbiddenResponse(headers)

    await supabaseDeleteByFilter('interior_direct_purchases', `id=eq.${id}`)
    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deleteInteriorDirectPurchase:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
