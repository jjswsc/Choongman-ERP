import { NextRequest, NextResponse } from 'next/server'
import { loadMemberPortalPrepayStats } from '@/lib/member-portal-prepay-stats'
import { requireMemberPortalAdminAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const days = Math.min(30, Math.max(1, Number(req.nextUrl.searchParams.get('days') || 7)))
    const stats = await loadMemberPortalPrepayStats(days)
    return NextResponse.json({ success: true, stats })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'stats_failed' },
      { status: 500 }
    )
  }
}
