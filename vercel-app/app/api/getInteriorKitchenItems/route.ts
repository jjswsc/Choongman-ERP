import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  assertInteriorProjectAccess,
  interiorForbiddenResponse,
  requireInteriorTenantRead,
} from '@/lib/interior-tenant-guard'
import { isSaasTenantQueryBlocked } from '@/lib/saas-tenant-scope'

/** 프로젝트 주방 설비 조회 */
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
      'interior_kitchen_items',
      `project_id=eq.${encodeURIComponent(projectId)}`,
      { order: 'zone.asc,id.asc', limit: 300 }
    )) as {
      id?: number
      project_id?: number
      item_name_kr?: string
      item_name_en?: string
      size_mm?: string
      supplier_code?: string
      zone?: string
      price?: number
      quantity?: number
    }[]

    const list = (rows || []).map((r) => ({
      id: r.id,
      projectId: r.project_id,
      itemNameKr: String(r.item_name_kr || '').trim(),
      itemNameEn: String(r.item_name_en || '').trim(),
      sizeMm: String(r.size_mm || '').trim(),
      supplierCode: String(r.supplier_code || '').trim(),
      zone: String(r.zone || '').trim(),
      price: Number(r.price) ?? 0,
      quantity: Number(r.quantity) ?? 1,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getInteriorKitchenItems:', e)
    return NextResponse.json([], { headers })
  }
}
