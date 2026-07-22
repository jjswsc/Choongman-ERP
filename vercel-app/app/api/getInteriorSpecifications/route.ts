import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  assertInteriorProjectAccess,
  interiorForbiddenResponse,
  requireInteriorTenantRead,
} from '@/lib/interior-tenant-guard'
import { isSaasTenantQueryBlocked } from '@/lib/saas-tenant-scope'

/** 프로젝트 사양서 조회 */
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
      'interior_specifications',
      `project_id=eq.${encodeURIComponent(projectId)}`,
      { order: 'id.asc', limit: 200 }
    )) as {
      id?: number
      project_id?: number
      description?: string
      code?: string
      size?: string
      supplier_code?: string
      location?: string
    }[]

    const list = (rows || []).map((r) => ({
      id: r.id,
      projectId: r.project_id,
      description: String(r.description || '').trim(),
      code: String(r.code || '').trim(),
      size: String(r.size || '').trim(),
      supplierCode: String(r.supplier_code || '').trim(),
      location: String(r.location || '').trim(),
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getInteriorSpecifications:', e)
    return NextResponse.json([], { headers })
  }
}
