import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter } from '@/lib/supabase-server'
import {
  assertInteriorProjectAccess,
  interiorForbiddenResponse,
  requireInteriorTenantContext,
} from '@/lib/interior-tenant-guard'

/** 인테리어 프로젝트 삭제 (CASCADE로 하위 테이블 함께 삭제) */
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
    const id = body?.id ?? body?.projectId
    if (!id) {
      return NextResponse.json({ success: false, message: 'id required' }, { status: 400, headers })
    }

    const access = await assertInteriorProjectAccess(id, guard.scope)
    if (access === 'not_found') {
      return NextResponse.json({ success: false, message: '프로젝트를 찾을 수 없습니다.' }, { status: 404, headers })
    }
    if (access === 'forbidden') return interiorForbiddenResponse(headers)

    await supabaseDeleteByFilter('interior_projects', `id=eq.${id}`)
    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deleteInteriorProject:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
