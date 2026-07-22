import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  assertInteriorProjectAccess,
  interiorForbiddenResponse,
  requireInteriorTenantRead,
} from '@/lib/interior-tenant-guard'
import { isSaasTenantQueryBlocked } from '@/lib/saas-tenant-scope'

/** 프로젝트 직매입 품목 조회 */
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
      'interior_direct_purchases',
      `project_id=eq.${encodeURIComponent(projectId)}`,
      { order: 'category.asc,item_no.asc,id.asc', limit: 300 }
    )) as {
      id?: number
      project_id?: number
      category?: string
      item_no?: number
      description?: string
      qty?: number
      unit?: string
      price?: number
      sum_amount?: number
      supplier_code?: string
      status?: string
      remark?: string
    }[]

    const list = (rows || []).map((r) => ({
      id: r.id,
      projectId: r.project_id,
      category: String(r.category || '').trim(),
      itemNo: r.item_no ?? 0,
      description: String(r.description || '').trim(),
      qty: Number(r.qty) ?? 1,
      unit: String(r.unit || 'set').trim(),
      price: Number(r.price) ?? 0,
      sumAmount: Number(r.sum_amount) ?? 0,
      supplierCode: String(r.supplier_code || '').trim(),
      status: String(r.status || 'pending').trim(),
      remark: String(r.remark || '').trim(),
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getInteriorDirectPurchases:', e)
    return NextResponse.json([], { headers })
  }
}
