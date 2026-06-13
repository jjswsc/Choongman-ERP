import { NextRequest, NextResponse } from 'next/server'
import {
  getMemberStampAdminStats,
  listRecentStampIssueFailures,
  validateStampMilestoneCoupons,
  type MemberStampMilestoneInput,
} from '@/lib/member-stamp-card'
import { requireMemberPortalAdminAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const q = req.nextUrl.searchParams
    const daysRaw = q.get('days')
    const days = daysRaw ? Number(daysRaw) : 30
    const stats = await getMemberStampAdminStats({
      days: Number.isFinite(days) ? days : 30,
      startYmd: String(q.get('startYmd') || ''),
      endYmd: String(q.get('endYmd') || ''),
    })
    const failures = await listRecentStampIssueFailures(15)
    return NextResponse.json({ success: true, stats, failures })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '통계 조회 실패' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const body = (await req.json()) as { milestones?: MemberStampMilestoneInput[] }
    const validations = await validateStampMilestoneCoupons(Array.isArray(body.milestones) ? body.milestones : [])
    return NextResponse.json({ success: true, validations })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '쿠폰 검증 실패' },
      { status: 400 }
    )
  }
}
