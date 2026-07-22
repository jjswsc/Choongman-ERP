import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { requireInteriorTenantRead } from '@/lib/interior-tenant-guard'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
} from '@/lib/saas-tenant-scope'

/** 인테리어 프로젝트 목록 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const guard = await requireInteriorTenantRead(request)
  if (!guard.ok) {
    guard.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return guard.errorResponse
  }

  if (isSaasTenantQueryBlocked(guard.scope, 'interior_projects')) {
    return NextResponse.json([], { headers })
  }

  try {
    const baseFilter = 'id=gte.0'
    const filter = appendSaasTenantFilter(baseFilter, guard.scope, 'interior_projects')
    let rows: {
      id?: number
      code?: string
      name?: string
      location?: string
      status?: string
      budget_total?: number
      start_date?: string
      end_date?: string
    }[] = []

    try {
      rows = (await supabaseSelectFilter('interior_projects', filter, {
        order: 'code.asc',
        limit: 200,
      })) as typeof rows
    } catch (e) {
      if (isMissingSaasTenantColumnError(e)) {
        markSaasTenantColumnMissing('interior_projects')
        rows = (await supabaseSelectFilter('interior_projects', baseFilter, {
          order: 'code.asc',
          limit: 200,
        })) as typeof rows
      } else {
        throw e
      }
    }

    const list = (rows || []).map((r) => ({
      id: r.id,
      code: String(r.code || '').trim(),
      name: String(r.name || '').trim(),
      location: String(r.location || '').trim(),
      status: String(r.status || 'active').trim(),
      budgetTotal: Number(r.budget_total) ?? 0,
      startDate: r.start_date ? String(r.start_date).slice(0, 10) : null,
      endDate: r.end_date ? String(r.end_date).slice(0, 10) : null,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getInteriorProjects:', e)
    return NextResponse.json([], { headers })
  }
}
