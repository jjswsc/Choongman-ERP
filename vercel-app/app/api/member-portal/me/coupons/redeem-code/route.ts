import { NextRequest, NextResponse } from 'next/server'
import {
  portalPromoRedeemErrorMessage,
  redeemMemberPortalPromoCode,
} from '@/lib/member-portal-promo-code'
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
    const body = (await req.json()) as { code?: string }
    const code = String(body.code || '').trim()
    const result = await redeemMemberPortalPromoCode({ memberId: member!.id, code })
    const coupons = await listMemberCouponIssuesForPortalMember(member!.id, 100)
    return NextResponse.json({
      success: true,
      ...result,
      coupons,
    })
  } catch (e) {
    const code = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      {
        success: false,
        code,
        message: portalPromoRedeemErrorMessage(code, lang),
      },
      { status: 400 }
    )
  }
}
