import { NextRequest, NextResponse } from 'next/server'
import { buildMemberPortalCheckoutPreview } from '@/lib/member-portal-checkout-server'
import type { MemberPickupOrderItem } from '@/lib/member-portal-order-server'
import { requireMemberSession } from '@/lib/member-portal-session'

export async function POST(req: NextRequest) {
  const { member, error } = await requireMemberSession(req)
  if (error) return error
  if (!member) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as {
      storeCode?: string
      items?: MemberPickupOrderItem[]
      pointUsed?: number
      couponCode?: string
      coupon_code?: string
    }
    const preview = await buildMemberPortalCheckoutPreview({
      member,
      storeCode: String(body.storeCode || '').trim(),
      items: Array.isArray(body.items) ? body.items : [],
      requestedPointUsed: Number(body.pointUsed || 0),
      couponCode: String(body.couponCode || body.coupon_code || '').trim(),
    })
    return NextResponse.json({ success: true, preview })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'preview_failed'
    const status =
      msg === 'store_required' || msg === 'store_not_available' || msg === 'coupon_invalid' ? 400 : 500
    return NextResponse.json({ success: false, message: msg }, { status })
  }
}
