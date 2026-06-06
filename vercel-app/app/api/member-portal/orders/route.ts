import { NextRequest, NextResponse } from 'next/server'
import { createMemberPickupOrder, type MemberPickupOrderItem } from '@/lib/member-portal-order-server'
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
      pickupAt?: string
      items?: MemberPickupOrderItem[]
    }
    const result = await createMemberPickupOrder({
      member,
      storeCode: String(body.storeCode || '').trim(),
      pickupAt: String(body.pickupAt || '').trim(),
      items: Array.isArray(body.items) ? body.items : [],
    })
    return NextResponse.json({
      success: true,
      orderId: result.orderId,
      orderNo: result.orderNo,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'order_failed'
    const status =
      msg === 'pickup_too_soon' ||
      msg === 'invalid_pickup_time' ||
      msg === 'empty_cart' ||
      msg === 'store_required' ||
      msg === 'store_not_available'
        ? 400
        : 500
    return NextResponse.json({ success: false, message: msg }, { status })
  }
}
