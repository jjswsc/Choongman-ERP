import { NextRequest, NextResponse } from 'next/server'
import { cancelMemberCouponIssue, cancelMemberCouponIssuesAdmin } from '@/lib/members-server'
import { requireAuth } from '@/lib/verify-auth'

export async function POST(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const body = (await req.json()) as {
      issueId?: number
      issueIds?: number[]
      memberId?: number
      couponCode?: string
      keepNewest?: boolean
    }

    const issueId = Number(body.issueId || 0)
    if (issueId > 0) {
      await cancelMemberCouponIssue(issueId)
      return NextResponse.json({ success: true, cancelledCount: 1 }, { headers })
    }

    const result = await cancelMemberCouponIssuesAdmin({
      issueIds: body.issueIds,
      memberId: Number(body.memberId || 0) || undefined,
      couponCode: String(body.couponCode || ''),
      keepNewest: body.keepNewest === true,
    })
    return NextResponse.json({ success: true, ...result }, { headers })
  } catch (e) {
    console.error('POST /api/member-coupons/cancel:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '쿠폰 발급 취소 실패' },
      { headers }
    )
  }
}
