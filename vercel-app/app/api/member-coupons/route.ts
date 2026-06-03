import { NextRequest, NextResponse } from 'next/server'
import { issueMemberCoupon, listMemberCouponIssues } from '@/lib/members-server'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const { searchParams } = new URL(req.url)
    const memberId = Number(searchParams.get('memberId') || 0)
    const limit = Number(searchParams.get('limit') || 200)
    const status = String(searchParams.get('status') || '').trim()
    const couponCode = String(searchParams.get('couponCode') || '').trim()
    const q = String(searchParams.get('q') || '').trim()
    const rows = await listMemberCouponIssues({
      memberId,
      limit,
      status: status || undefined,
      couponCode: couponCode || undefined,
      q: q || undefined,
    })
    return NextResponse.json(rows, { headers })
  } catch (e) {
    console.error('GET /api/member-coupons:', e)
    return NextResponse.json([], { headers })
  }
}

export async function POST(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const body = (await req.json()) as { memberId?: number; couponCode?: string }
    await issueMemberCoupon({
      memberId: Number(body.memberId || 0),
      couponCode: String(body.couponCode || ''),
    })
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('POST /api/member-coupons:', e)
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : '쿠폰 발급 실패' }, { headers })
  }
}
