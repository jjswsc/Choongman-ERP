import { NextRequest, NextResponse } from 'next/server'
import { loadMemberSignupStoreStats, resolveMemberSignupStoreScope } from '@/lib/member-signup-store'
import { requireMemberPortalAdminAuth } from '@/lib/verify-auth'

function parseStatsParams(req: NextRequest) {
  const daysRaw = req.nextUrl.searchParams.get('days')
  const startYmd = String(req.nextUrl.searchParams.get('startYmd') || '').trim()
  const endYmd = String(req.nextUrl.searchParams.get('endYmd') || '').trim()
  const lang = String(req.nextUrl.searchParams.get('lang') || 'ko').trim()
  return {
    days: daysRaw != null ? Math.min(365, Math.max(1, Number(daysRaw || 30))) : undefined,
    startYmd: startYmd || undefined,
    endYmd: endYmd || undefined,
    lang,
  }
}

export async function GET(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const params = parseStatsParams(req)
    const scope = resolveMemberSignupStoreScope(authResult.auth!.role || '', authResult.auth!.store)
    const stats = await loadMemberSignupStoreStats({ ...params, scope })
    return NextResponse.json({ success: true, stats, scope })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'stats_failed' },
      { status: 500 }
    )
  }
}
