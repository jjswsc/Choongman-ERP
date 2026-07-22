import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter, supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import {
  appendSaasTenantFilter,
  assertSaasTenantWritable,
  isMissingSaasTenantColumnError,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
} from '@/lib/saas-tenant-scope'

/** 고정비 삭제 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      authResult.errorResponse.headers.set('Content-Type', 'application/json')
      return authResult.errorResponse
    }
    const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })
    const tenantError = assertSaasTenantWritable(tenantScope, {
      tableHint: 'fixed_expenses',
      label: '고정비',
    })
    if (tenantError) {
      return NextResponse.json({ success: false, message: tenantError }, { status: 403, headers })
    }

    const body = await request.json()
    const id = Number(body.id)
    if (!id || isNaN(id)) {
      return NextResponse.json({ success: false, message: 'ID가 없습니다.' }, { status: 400, headers })
    }

    const baseFilter = `id=eq.${id}`
    const filter = appendSaasTenantFilter(baseFilter, tenantScope, 'fixed_expenses')
    try {
      const owned = (await supabaseSelectFilter('fixed_expenses', filter, {
        limit: 1,
        select: 'id',
      })) as { id?: number }[] | null
      if (!owned?.length) {
        return NextResponse.json(
          { success: false, message: '삭제할 고정비를 찾을 수 없습니다.' },
          { status: 404, headers }
        )
      }
      await supabaseDeleteByFilter('fixed_expenses', filter)
    } catch (e) {
      if (isMissingSaasTenantColumnError(e)) {
        markSaasTenantColumnMissing('fixed_expenses')
        await supabaseDeleteByFilter('fixed_expenses', baseFilter)
      } else {
        throw e
      }
    }
    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deleteFixedExpense:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
