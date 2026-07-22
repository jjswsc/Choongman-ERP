import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter, supabaseSelectFilter } from '@/lib/supabase-server'
import {
  interiorForbiddenResponse,
  requireInteriorTenantContext,
} from '@/lib/interior-tenant-guard'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  markSaasTenantColumnMissing,
} from '@/lib/saas-tenant-scope'

/** 인테리어 업체 마스터 삭제 */
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
    const id = Number(body.id)
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ success: false, message: 'id가 필요합니다.' }, { status: 400, headers })
    }

    const idBaseFilter = `id=eq.${id}`
    const idFilter = appendSaasTenantFilter(idBaseFilter, guard.scope, 'interior_vendor_directory')
    let existing: { id?: number }[] = []
    try {
      existing = (await supabaseSelectFilter('interior_vendor_directory', idFilter, { limit: 1 })) as typeof existing
    } catch (e) {
      if (isMissingSaasTenantColumnError(e)) {
        markSaasTenantColumnMissing('interior_vendor_directory')
        existing = (await supabaseSelectFilter('interior_vendor_directory', idBaseFilter, { limit: 1 })) as typeof existing
      } else {
        throw e
      }
    }
    if (!existing?.length) return interiorForbiddenResponse(headers)

    await supabaseDeleteByFilter('interior_vendor_directory', idFilter)
    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deleteInteriorVendorDirectory:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
