import { NextRequest, NextResponse } from 'next/server'
import {
  loadMemberSignupStoreStats,
  memberSignupStoreStatsToCsv,
  resolveMemberSignupStoreScope,
} from '@/lib/member-signup-store'
import { requireMemberPortalAdminAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const daysRaw = req.nextUrl.searchParams.get('days')
    const startYmd = String(req.nextUrl.searchParams.get('startYmd') || '').trim() || undefined
    const endYmd = String(req.nextUrl.searchParams.get('endYmd') || '').trim() || undefined
    const lang = String(req.nextUrl.searchParams.get('lang') || 'ko').trim()
    const scope = resolveMemberSignupStoreScope(authResult.auth!.role || '', authResult.auth!.store)
    const stats = await loadMemberSignupStoreStats({
      days: daysRaw != null ? Math.min(365, Math.max(1, Number(daysRaw || 30))) : undefined,
      startYmd,
      endYmd,
      lang,
      scope,
    })
    const csv = memberSignupStoreStatsToCsv(stats)
    const filename = `member-signup-stores_${stats.startYmd}_${stats.endYmd}.csv`
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'export_failed' },
      { status: 500 }
    )
  }
}
