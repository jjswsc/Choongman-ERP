import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate, supabaseSelectFilter } from '@/lib/supabase-server'
import {
  assertInteriorProjectAccess,
  interiorForbiddenResponse,
  requireInteriorTenantContext,
  stampInteriorTenantRow,
} from '@/lib/interior-tenant-guard'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  markSaasTenantColumnMissing,
} from '@/lib/saas-tenant-scope'

/** 인테리어 프로젝트 추가/수정 */
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
    const code = String(body.code || '').trim()
    const name = String(body.name || '').trim()
    const location = String(body.location || '').trim()
    const status = String(body.status || 'active').trim()
    const budgetTotal = Number(body.budgetTotal ?? body.budget_total) || 0
    const startDate = body.startDate ?? body.start_date
    const endDate = body.endDate ?? body.end_date

    if (!code || !name) {
      return NextResponse.json({ success: false, message: '코드와 프로젝트명을 입력하세요.' }, { status: 400, headers })
    }

    const row = {
      code,
      name,
      location: location || null,
      status: status || 'active',
      budget_total: budgetTotal,
      start_date: startDate ? String(startDate).slice(0, 10) : null,
      end_date: endDate ? String(endDate).slice(0, 10) : null,
    }

    if (id && !isNaN(id)) {
      const access = await assertInteriorProjectAccess(id, guard.scope)
      if (access !== 'ok') return interiorForbiddenResponse(headers)
      await supabaseUpdate('interior_projects', id, row)
      return NextResponse.json({ success: true, id, message: '수정되었습니다.' }, { headers })
    }

    const codeBaseFilter = `code=eq.${encodeURIComponent(code)}`
    const codeFilter = appendSaasTenantFilter(codeBaseFilter, guard.scope, 'interior_projects')
    let existing: { id?: number }[] = []
    try {
      existing = (await supabaseSelectFilter('interior_projects', codeFilter, { limit: 1 })) as typeof existing
    } catch (e) {
      if (isMissingSaasTenantColumnError(e)) {
        markSaasTenantColumnMissing('interior_projects')
        existing = (await supabaseSelectFilter('interior_projects', codeBaseFilter, { limit: 1 })) as typeof existing
      } else {
        throw e
      }
    }
    if (existing?.length) {
      return NextResponse.json({ success: false, message: '이미 존재하는 프로젝트 코드입니다.' }, { status: 400, headers })
    }

    const inserted = await supabaseInsert(
      'interior_projects',
      stampInteriorTenantRow(row, guard.scope)
    )

    const insertedRow = Array.isArray(inserted) ? inserted[0] : inserted
    const newId = (insertedRow as { id?: number })?.id
    return NextResponse.json({ success: true, id: newId, message: '등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveInteriorProject:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
