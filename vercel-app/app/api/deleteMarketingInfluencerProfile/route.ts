import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import {
  appendSaasTenantFilter,
  assertSaasTenantWritable,
  resolveSaasTenantScope,
} from '@/lib/saas-tenant-scope'

const TABLE = 'marketing_influencer_profiles'

/** 명부 삭제 — 연결된 업로드 기록은 남고 profile_id 만 NULL (FK ON DELETE SET NULL) */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(req, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })
  const tenantError = assertSaasTenantWritable(tenantScope, { tableHint: TABLE, label: '인플루언서 명부' })
  if (tenantError) return NextResponse.json({ success: false, message: tenantError }, { status: 403, headers })

  try {
    const body = (await req.json()) as { id?: string }
    const id = String(body?.id ?? '').trim()
    if (!id) return NextResponse.json({ success: false, message: 'id가 필요합니다.' }, { headers })
    await supabaseDeleteByFilter(TABLE, appendSaasTenantFilter(`id=eq.${encodeURIComponent(id)}`, tenantScope, TABLE))
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('deleteMarketingInfluencerProfile:', e)
    return NextResponse.json({ success: false, message: String(e) }, { headers })
  }
}
