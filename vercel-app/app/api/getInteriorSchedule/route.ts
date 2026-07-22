import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  assertInteriorProjectAccess,
  interiorForbiddenResponse,
  requireInteriorTenantRead,
} from '@/lib/interior-tenant-guard'
import { isSaasTenantQueryBlocked } from '@/lib/saas-tenant-scope'

/** 프로젝트 일정 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const guard = await requireInteriorTenantRead(request)
  if (!guard.ok) {
    guard.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return guard.errorResponse
  }

  const projectId = request.nextUrl.searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json([], { headers })
  }
  if (isSaasTenantQueryBlocked(guard.scope, 'interior_projects')) return NextResponse.json([], { headers })

  const access = await assertInteriorProjectAccess(projectId, guard.scope)
  if (access === 'forbidden') return interiorForbiddenResponse(headers)
  if (access === 'not_found') return NextResponse.json([], { headers })

  try {
    const rows = (await supabaseSelectFilter(
      'interior_schedule_items',
      `project_id=eq.${encodeURIComponent(projectId)}`,
      { order: 'sort_order.asc,item_no.asc,id.asc', limit: 200 }
    )) as {
      id?: number
      project_id?: number
      item_no?: number
      work_detail?: string
      start_date?: string
      end_date?: string
      day_progress?: Record<string, unknown>
      sort_order?: number
    }[]

    const list = (rows || []).map((r) => ({
      id: r.id,
      projectId: r.project_id,
      itemNo: r.item_no ?? 0,
      workDetail: String(r.work_detail || '').trim(),
      startDate: r.start_date ? String(r.start_date).slice(0, 10) : null,
      endDate: r.end_date ? String(r.end_date).slice(0, 10) : null,
      dayProgress: r.day_progress ?? {},
      sortOrder: r.sort_order ?? 0,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getInteriorSchedule:', e)
    return NextResponse.json([], { headers })
  }
}
