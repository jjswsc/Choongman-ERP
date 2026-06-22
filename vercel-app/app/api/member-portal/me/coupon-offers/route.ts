import { NextRequest, NextResponse } from 'next/server'
import { listMemberPortalCouponOffers } from '@/lib/member-portal-coupon-claim'
import { requireMemberSession } from '@/lib/member-portal-session'

export async function GET(req: NextRequest) {
  const { member, error } = await requireMemberSession(req)
  if (error) return error
  const rows = await listMemberPortalCouponOffers(member!.id)
  return NextResponse.json({ success: true, rows })
}
