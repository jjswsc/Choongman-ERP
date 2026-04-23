import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { HR_POLICY_LIST_COLS } from '@/lib/postgrest-narrow-select'
import { requireAuth } from '@/lib/verify-auth'

export const dynamic = 'force-dynamic'

/**
 * 관리자: 인사 규정 목록
 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')

  const authRes = await requireAuth(request, 'manager')
  if (authRes.errorResponse) {
    const er = authRes.errorResponse
    er.headers.set('Access-Control-Allow-Origin', '*')
    return er
  }

  const { searchParams } = new URL(request.url)
  const activeOnly = (searchParams.get('activeOnly') || '0') === '1'

  try {
    const filter = activeOnly ? 'is_active=eq.true' : 'id=gte.0'
    const rows = (await supabaseSelectFilter('hr_policies', filter, {
      order: 'created_at.desc',
      limit: 500,
      select: HR_POLICY_LIST_COLS,
    })) as Record<string, unknown>[]

    return NextResponse.json(
      { success: true, items: rows || [] },
      { headers }
    )
  } catch (e) {
    console.error('getHrPolicies:', e)
    return NextResponse.json(
      { success: false, message: (e as Error).message, items: [] as never[] },
      { status: 500, headers }
    )
  }
}
