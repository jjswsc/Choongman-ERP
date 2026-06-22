import { NextRequest, NextResponse } from 'next/server'
import {
  claimMemberPortalCoupon,
  portalCouponClaimErrorMessage,
} from '@/lib/member-portal-coupon-claim'
import { listMemberCouponIssuesForPortalMember } from '@/lib/members-server'
import { requireMemberSession } from '@/lib/member-portal-session'

function resolveLang(req: NextRequest): 'ko' | 'en' | 'th' {
  const q = String(new URL(req.url).searchParams.get('lang') || '').trim().toLowerCase()
  if (q === 'en' || q === 'th') return q
  return 'ko'
}

export async function POST(req: NextRequest) {
  const { member, error } = await requireMemberSession(req)
  if (error) return error
  const lang = resolveLang(req)

  try {
    const body = (await req.json()) as { couponCode?: string }
    const couponCode = String(body.couponCode || '').trim()
    const result = await claimMemberPortalCoupon({ memberId: member!.id, couponCode })
    const coupons = await listMemberCouponIssuesForPortalMember(member!.id, 100)
    return NextResponse.json({
      success: true,
      ...result,
      coupons,
      pointBalance: result.pointBalance,
    })
  } catch (e) {
    const code = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      {
        success: false,
        code,
        message: portalCouponClaimErrorMessage(code, lang),
      },
      { status: 400 }
    )
  }
}
