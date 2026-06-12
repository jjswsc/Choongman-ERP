import { NextRequest, NextResponse } from 'next/server'
import { listMemberPortalOrders } from '@/lib/member-portal-orders-list-server'
import { createMemberPickupOrder, type MemberPickupOrderItem } from '@/lib/member-portal-order-server'
import { requireMemberSession } from '@/lib/member-portal-session'

export async function GET(req: NextRequest) {
  const { member, error } = await requireMemberSession(req)
  if (error) return error
  if (!member) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 })
  }

  try {
    const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get('limit') || 15)))
    const rows = await listMemberPortalOrders(member, limit)
    return NextResponse.json({ success: true, rows })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'list_failed' },
      { status: 500 }
    )
  }
}

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
      pointUsed?: number
      couponCode?: string
      coupon_code?: string
    }
    const result = await createMemberPickupOrder({
      member,
      storeCode: String(body.storeCode || '').trim(),
      pickupAt: String(body.pickupAt || '').trim(),
      items: Array.isArray(body.items) ? body.items : [],
      pointUsed: Math.max(0, Math.trunc(Number(body.pointUsed || 0))),
      couponCode: String(body.couponCode || body.coupon_code || '').trim(),
    })
    return NextResponse.json({
      success: true,
      orderId: result.orderId,
      orderNo: result.orderNo,
      paid: Boolean(result.paid),
      requiresQr: Boolean(result.requiresQr),
      qrAmount: result.qrAmount ?? 0,
      pointUsed: result.pointUsed ?? 0,
      total: result.total ?? 0,
      createdAt: result.createdAt,
      paymentExpiresAt: result.paymentExpiresAt,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'order_failed'
    const status =
      msg === 'pickup_too_soon' ||
      msg === 'invalid_pickup_time' ||
      msg === 'empty_cart' ||
      msg === 'store_required' ||
      msg === 'store_not_available' ||
      msg === 'coupon_invalid'
        ? 400
        : 500
    return NextResponse.json({ success: false, message: msg }, { status })
  }
}
